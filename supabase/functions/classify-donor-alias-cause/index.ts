// Classify a donor alias (PAC, organization, individual) by *cause* using Lovable AI.
// Writes primary_cause_id directly onto donor_aliases — works even when the alias has no committee ID.
// Body: { alias_id: string }
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false as const, res: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) };
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) {
    return { ok: false as const, res: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) };
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: role } = await admin.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
  if (!role) {
    return { ok: false as const, res: new Response(JSON.stringify({ error: 'Forbidden: admin required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) };
  }
  return { ok: true as const, admin };
}

interface Cause {
  id: string;
  label: string;
  stance: string;
  issue: string;
  description: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.res;
  const supabase = gate.admin;

  try {
    const body = await req.json().catch(() => ({}));
    const alias_id: string | undefined = body?.alias_id;
    if (!alias_id) {
      return new Response(JSON.stringify({ success: false, error: 'alias_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load alias
    const { data: alias, error: aliasErr } = await supabase
      .from('donor_aliases')
      .select('id, canonical_name, fec_committee_id, fec_committee_ids')
      .eq('id', alias_id)
      .maybeSingle();
    if (aliasErr) throw aliasErr;
    if (!alias) {
      return new Response(JSON.stringify({ success: false, error: 'Alias not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load attached member donors (names + types)
    const { data: members } = await supabase
      .from('donor_alias_members')
      .select('donor_name, donor_type')
      .eq('alias_id', alias_id)
      .limit(50);

    const memberNames = Array.from(new Set((members ?? []).map((m: any) => m.donor_name).filter(Boolean))).slice(0, 25);
    const donorTypes = Array.from(new Set((members ?? []).map((m: any) => m.donor_type).filter(Boolean)));

    // Top recipient committees those donors gave to (helps the AI infer cause)
    let topRecipients: string[] = [];
    if (memberNames.length > 0) {
      const { data: donorRows } = await supabase
        .from('donors')
        .select('recipient_committee_name, amount')
        .in('name', memberNames)
        .order('amount', { ascending: false })
        .limit(50);
      const recipientCounts = new Map<string, number>();
      for (const r of (donorRows ?? []) as any[]) {
        if (!r.recipient_committee_name) continue;
        recipientCounts.set(r.recipient_committee_name, (recipientCounts.get(r.recipient_committee_name) ?? 0) + (r.amount || 0));
      }
      topRecipients = Array.from(recipientCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([n]) => n);
    }

    // If alias has committee IDs, pull IE purposes for extra context
    const committeeIds: string[] = (alias.fec_committee_ids?.length ? alias.fec_committee_ids : (alias.fec_committee_id ? [alias.fec_committee_id] : []));
    let iePurposes: string[] = [];
    if (committeeIds.length > 0) {
      const { data: ie } = await supabase
        .from('independent_expenditures')
        .select('purpose, amount')
        .in('spending_committee_fec_id', committeeIds)
        .order('amount', { ascending: false })
        .limit(30);
      iePurposes = Array.from(new Set((ie ?? []).map((r: any) => (r.purpose ?? '').trim()).filter(Boolean))).slice(0, 15);
    }

    // Load active causes
    const { data: causesData } = await supabase
      .from('committee_causes')
      .select('id, label, stance, issue, description')
      .eq('status', 'active');
    const causes = (causesData ?? []) as Cause[];
    if (causes.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No active causes available' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const allowed = causes.map((c) => c.id);
    const causeMenu = causes
      .map((c) => `- ${c.id}: ${c.label} (${c.stance} ${c.issue})${c.description ? ' — ' + c.description : ''}`)
      .join('\n');

    const userMsg = `Donor alias: ${alias.canonical_name}
Donor types: ${donorTypes.join(', ') || 'unknown'}
Sample attached donor names: ${memberNames.slice(0, 10).join(' | ') || 'none'}
Top recipient committees: ${topRecipients.join(', ') || 'none'}
IE expenditure purposes: ${iePurposes.slice(0, 10).join(' | ') || 'none'}

Pick ONE primary cause id from the list below that best describes what this donor entity advocates for. Use "low" confidence for generic partisan donors with no clear single-issue focus.

Causes:
${causeMenu}`;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'You categorize US political donors (PACs, orgs, individuals) by cause/stance (e.g. Pro-Israel, Pro-gun). Be conservative; prefer generic "conservative" / "progressive" buckets over forcing a specific cause when unclear.' },
          { role: 'user', content: userMsg },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'classify_donor_alias',
            description: 'Pick the best primary cause for this donor alias.',
            parameters: {
              type: 'object',
              properties: {
                primary_cause_id: { type: 'string', enum: allowed },
                confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
                reasoning: { type: 'string', maxLength: 280 },
              },
              required: ['primary_cause_id', 'confidence', 'reasoning'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'classify_donor_alias' } },
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ success: false, error: 'Rate limited — try again shortly' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ success: false, error: 'AI credits exhausted' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error('AI gateway failed', aiRes.status, txt);
      return new Response(JSON.stringify({ success: false, error: `AI gateway ${aiRes.status}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiJson = await aiRes.json();
    const argsStr = aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) {
      return new Response(JSON.stringify({ success: false, error: 'AI returned no classification' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const parsed = JSON.parse(argsStr);
    if (!allowed.includes(parsed.primary_cause_id)) {
      return new Response(JSON.stringify({ success: false, error: 'AI returned invalid cause id' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: updErr } = await supabase
      .from('donor_aliases')
      .update({
        primary_cause_id: parsed.primary_cause_id,
        cause_assigned_by: 'ai',
        cause_ai_confidence: parsed.confidence,
        cause_ai_reasoning: (parsed.reasoning ?? '').slice(0, 280),
        cause_assigned_at: new Date().toISOString(),
      })
      .eq('id', alias_id);
    if (updErr) throw updErr;

    const label = causes.find((c) => c.id === parsed.primary_cause_id)?.label ?? parsed.primary_cause_id;

    return new Response(JSON.stringify({
      success: true,
      alias_id,
      primary_cause_id: parsed.primary_cause_id,
      primary_cause_label: label,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('classify-donor-alias-cause error', e);
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
