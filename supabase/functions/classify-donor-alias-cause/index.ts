// Classify a donor alias (PAC, organization, individual) by *cause* using Lovable AI.
// Writes primary_cause_id directly onto donor_aliases — works even when the alias has no committee ID.
// Body: { alias_id: string }
import { createClient } from 'npm:@supabase/supabase-js@2';
import { mintCandidateCause } from '../_shared/candidate-cause.ts';

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

    // Valid quiz topics — an AI-suggested new industry cause must map to one of these.
    const { data: validTopicsData } = await supabase.from('topics').select('id');
    const validTopicIds = new Set<string>((validTopicsData ?? []).map((t: any) => t.id));
    const topicIdList = Array.from(validTopicIds);

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

Candidate rule: if this entity exists primarily to support or oppose ONE specific political candidate — e.g. a single-candidate super PAC, a candidate's own leadership PAC, or when the top recipient committees and IE purposes concentrate on one named candidate — return candidate_cause with that candidate's full name and stance ("pro" if it works to elect/support them, "anti" if it works to defeat/oppose them). A misleading name (e.g. "Great Lakes Conservatives Fund" that in fact exists to elect one Senate candidate) does not change this — judge by where the money goes. When you set candidate_cause, still also pick the closest primary_cause_id as a fallback. Do NOT use candidate_cause for multi-candidate party/ideological committees that spread money across many races.

Industry rule: never assign the generic "pro-business" cause to a single-industry donor. If this is a company, trade association, or PAC tied to one industry (real estate, finance/banking, insurance, defense, agriculture, healthcare providers, telecom, manufacturing, gaming, etc.), pick that industry's specific cause. Reserve "pro-business" only for broad, cross-industry business coalitions (e.g. a Chamber of Commerce). If the donor is clearly tied to a specific industry that has NO matching cause below, propose one with suggested_new_cause (map it to one of these quiz topics: ${topicIdList.join(', ')}) instead of settling for a generic bucket — but only for a clear, specific industry not already represented.

Causes:
${causeMenu}`;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'You categorize US political donors (PACs, orgs, individuals, trade associations) by cause/stance (e.g. Pro-Israel, Pro-gun, Pro-Real Estate). When an entity exists primarily to support or oppose ONE specific candidate (a single-candidate super PAC or leadership PAC, or one whose spending concentrates on a single named candidate), return candidate_cause so it can be labeled "Pro <candidate>" / "Anti <candidate>" rather than forced into an issue bucket. When a donor is tied to one industry, pick that industry\'s specific cause rather than the generic "Pro-Business" bucket, which is reserved for broad cross-industry business coalitions. Otherwise prefer the generic "conservative" / "progressive" buckets over forcing a specific cause when no single issue or industry stands out.' },
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
                candidate_cause: {
                  type: 'object',
                  description: 'Set ONLY when this entity exists primarily to support or oppose one specific candidate. The entity will be labeled "Pro <candidate>" / "Anti <candidate>" instead of the generic primary_cause_id.',
                  properties: {
                    candidate_name: { type: 'string' },
                    stance: { type: 'string', enum: ['pro', 'anti'] },
                    reasoning: { type: 'string', maxLength: 240 },
                  },
                  required: ['candidate_name', 'stance'],
                  additionalProperties: false,
                },
                suggested_new_cause: {
                  type: 'object',
                  description: 'Propose a new industry-specific cause when this donor is tied to a specific industry not represented above, instead of using the generic pro-business bucket.',
                  properties: {
                    label: { type: 'string' },
                    stance: { type: 'string', enum: ['pro', 'anti', 'neutral'] },
                    issue: { type: 'string' },
                    quiz_topic_id: { type: 'string' },
                    reasoning: { type: 'string', maxLength: 240 },
                  },
                  required: ['label', 'stance', 'issue', 'quiz_topic_id'],
                  additionalProperties: false,
                },
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

    // Persist an AI-suggested industry-specific cause as `pending` for admin review,
    // so single-industry donors stop collapsing into the generic pro-business bucket.
    let suggestedCause: { id: string; label: string } | null = null;
    const sug = parsed.suggested_new_cause;
    if (sug?.label && sug?.quiz_topic_id && validTopicIds.has(sug.quiz_topic_id)) {
      const slug = String(sug.label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
      if (slug && !causes.some((c) => c.id === slug)) {
        const stance = ['pro', 'anti', 'neutral'].includes(sug.stance) ? sug.stance : 'pro';
        const { error: causeErr } = await supabase.from('committee_causes').upsert({
          id: slug,
          label: String(sug.label).slice(0, 80),
          stance,
          issue: String(sug.issue ?? '').slice(0, 80),
          quiz_topic_id: sug.quiz_topic_id,
          description: null,
          status: 'pending',
          created_by: 'ai',
          ai_reasoning: String(sug.reasoning ?? '').slice(0, 240),
        }, { onConflict: 'id', ignoreDuplicates: true });
        if (causeErr) console.error('Failed to persist suggested cause', causeErr);
        else suggestedCause = { id: slug, label: String(sug.label).slice(0, 80) };
      }
    }

    // Candidate-specific entity? Mint (or reuse) a "Pro/Anti <candidate>" cause and
    // assign THAT as primary instead of the generic fallback bucket.
    let finalCauseId: string = parsed.primary_cause_id;
    let finalLabel = causes.find((c) => c.id === parsed.primary_cause_id)?.label ?? parsed.primary_cause_id;
    let candidateCause: { id: string; label: string } | null = null;
    const minted = await mintCandidateCause(supabase, parsed.candidate_cause, validTopicIds);
    if (minted) {
      finalCauseId = minted.id;
      finalLabel = minted.label;
      candidateCause = { id: minted.id, label: minted.label };
    }

    const { error: updErr } = await supabase
      .from('donor_aliases')
      .update({
        primary_cause_id: finalCauseId,
        cause_assigned_by: 'ai',
        cause_ai_confidence: parsed.confidence,
        cause_ai_reasoning: ((candidateCause ? (parsed.candidate_cause?.reasoning ?? parsed.reasoning) : parsed.reasoning) ?? '').slice(0, 280),
        cause_assigned_at: new Date().toISOString(),
      })
      .eq('id', alias_id);
    if (updErr) throw updErr;

    return new Response(JSON.stringify({
      success: true,
      alias_id,
      primary_cause_id: finalCauseId,
      primary_cause_label: finalLabel,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      candidate_cause: candidateCause,
      suggested_new_cause: suggestedCause,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('classify-donor-alias-cause error', e);
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
