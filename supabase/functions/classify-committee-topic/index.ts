// Classify external committees (PACs, SuperPACs, party committees) by *cause*
// (Pro-Israel, Pro-gun, etc.) — picked from the active `committee_causes` taxonomy.
// Body: { fec_committee_ids?: string[], limit?: number, force?: boolean }
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

async function requireAdmin(req: Request): Promise<{ ok: true } | { ok: false; res: Response }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, res: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) };
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const token = authHeader.replace('Bearer ', '');
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return { ok: false, res: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) };
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', claims.claims.sub).eq('role', 'admin').maybeSingle();
  if (!roleRow) {
    return { ok: false, res: new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) };
  }
  return { ok: true };
}

interface CommitteeInfo {
  fec_committee_id: string;
  name: string;
  designation: string | null;
  ie_purposes: string[];
  top_targets: string[];
}

interface Cause {
  id: string;
  label: string;
  stance: string;
  issue: string;
  description: string | null;
  quiz_topic_id: string;
}

async function gatherInfo(supabase: any, fecId: string): Promise<CommitteeInfo | null> {
  const { data: cmte } = await supabase
    .from('candidate_committees')
    .select('fec_committee_id, name, designation')
    .eq('fec_committee_id', fecId)
    .maybeSingle();

  let name: string | null = cmte?.name ?? null;
  let designation: string | null = cmte?.designation ?? null;

  if (!name) {
    const { data: ie } = await supabase
      .from('independent_expenditures')
      .select('spending_committee_name')
      .eq('spending_committee_fec_id', fecId)
      .limit(1)
      .maybeSingle();
    name = ie?.spending_committee_name ?? null;
  }

  if (!name) {
    const { data: ext } = await supabase
      .from('external_pacs')
      .select('name, designation')
      .eq('fec_committee_id', fecId)
      .maybeSingle();
    name = ext?.name ?? null;
    designation = designation ?? ext?.designation ?? null;
  }

  if (!name) return null;

  const { data: ieRows } = await supabase
    .from('independent_expenditures')
    .select('purpose, target_candidate_name, amount')
    .eq('spending_committee_fec_id', fecId)
    .order('amount', { ascending: false })
    .limit(50);

  const purposes = Array.from(new Set((ieRows ?? []).map((r: any) => (r.purpose ?? '').trim()).filter(Boolean))).slice(0, 15);
  const targets = Array.from(new Set((ieRows ?? []).map((r: any) => r.target_candidate_name).filter(Boolean))).slice(0, 10);

  return { fec_committee_id: fecId, name, designation, ie_purposes: purposes as string[], top_targets: targets as string[] };
}

async function classifyOne(info: CommitteeInfo, causes: Cause[]): Promise<{
  primary_cause_id: string;
  secondary_cause_ids: string[];
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  suggested_new_cause?: { label: string; stance: string; issue: string; quiz_topic_id: string; reasoning: string };
} | null> {
  const causeMenu = causes
    .map((c) => `- ${c.id}: ${c.label} (${c.stance} ${c.issue})${c.description ? ' — ' + c.description : ''}`)
    .join('\n');
  const allowed = causes.map((c) => c.id);

  const userMsg = `Committee: ${info.name}
Designation: ${info.designation ?? 'unknown'}
Top IE targets: ${info.top_targets.join(', ') || 'none'}
IE expenditure purposes: ${info.ie_purposes.slice(0, 10).join(' | ') || 'none'}

Pick ONE primary cause id from the list below that best describes this committee's focus, plus 0-2 optional secondary cause ids if clearly relevant. Use "low" confidence for generic partisan committees with no clear single-issue focus.

If NO cause fits well, you may also propose a single new cause (suggested_new_cause) — but ONLY if there's a clear, specific issue not represented (e.g. "Pro-cannabis"). Do not propose duplicates.

Causes:
${causeMenu}`;

  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        { role: 'system', content: 'You categorize US political committees (PACs, SuperPACs, party committees) by cause/stance (e.g. Pro-Israel, Pro-gun). Be conservative; prefer "conservative" or "progressive" generic buckets over forcing a specific cause when unclear.' },
        { role: 'user', content: userMsg },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'classify_committee',
          description: 'Return primary and optional secondary cause ids.',
          parameters: {
            type: 'object',
            properties: {
              primary_cause_id: { type: 'string', enum: allowed },
              secondary_cause_ids: { type: 'array', items: { type: 'string', enum: allowed }, maxItems: 2 },
              confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
              reasoning: { type: 'string', maxLength: 240 },
              suggested_new_cause: {
                type: 'object',
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
      tool_choice: { type: 'function', function: { name: 'classify_committee' } },
    }),
  });

  if (!res.ok) {
    console.error('AI gateway failed', res.status, await res.text());
    return null;
  }
  const json = await res.json();
  const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  try {
    const parsed = JSON.parse(args);
    if (!allowed.includes(parsed.primary_cause_id)) return null;
    return {
      primary_cause_id: parsed.primary_cause_id,
      secondary_cause_ids: (parsed.secondary_cause_ids ?? []).filter((id: string) => allowed.includes(id)),
      confidence: parsed.confidence ?? 'low',
      reasoning: (parsed.reasoning ?? '').slice(0, 240),
      suggested_new_cause: parsed.suggested_new_cause,
    };
  } catch (e) {
    console.error('Failed to parse AI args', e);
    return null;
  }
}

async function processIds(supabase: any, ids: string[], force: boolean) {
  const { data: causesData } = await supabase
    .from('committee_causes')
    .select('id, label, stance, issue, description, quiz_topic_id')
    .eq('status', 'active');
  const causes = (causesData ?? []) as Cause[];
  if (causes.length === 0) {
    console.error('No active causes available');
    return { processed: 0 };
  }

  const { data: validTopicsData } = await supabase.from('topics').select('id');
  const validTopicIds = new Set((validTopicsData ?? []).map((t: any) => t.id));

  let processed = 0;
  for (const id of ids) {
    try {
      if (!force) {
        const { data: existing } = await supabase
          .from('committee_topics')
          .select('admin_overridden')
          .eq('fec_committee_id', id)
          .maybeSingle();
        if (existing?.admin_overridden) {
          console.log(`Skip ${id} (admin overridden)`);
          continue;
        }
      }

      const info = await gatherInfo(supabase, id);
      if (!info) { console.log(`No info for ${id}`); continue; }
      const result = await classifyOne(info, causes);
      if (!result) continue;

      // Persist AI-suggested new cause as `pending` for admin review (if it doesn't conflict).
      if (result.suggested_new_cause) {
        const s = result.suggested_new_cause;
        const slug = s.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
        if (slug && validTopicIds.has(s.quiz_topic_id) && !causes.some((c) => c.id === slug)) {
          await supabase.from('committee_causes').upsert({
            id: slug,
            label: s.label.slice(0, 80),
            stance: s.stance,
            issue: s.issue.slice(0, 80),
            quiz_topic_id: s.quiz_topic_id,
            description: null,
            status: 'pending',
            created_by: 'ai',
            ai_reasoning: (s.reasoning ?? '').slice(0, 240),
          }, { onConflict: 'id', ignoreDuplicates: true });
          console.log(`Suggested new cause: ${slug}`);
        }
      }

      const { error } = await supabase.from('committee_topics').upsert({
        fec_committee_id: id,
        primary_cause_id: result.primary_cause_id,
        secondary_cause_ids: result.secondary_cause_ids,
        assigned_by: 'ai',
        ai_confidence: result.confidence,
        ai_reasoning: result.reasoning,
        admin_overridden: false,
      });
      if (error) { console.error(`Upsert failed for ${id}`, error); continue; }
      processed++;
    } catch (e) {
      console.error(`Error processing ${id}`, e);
    }
  }
  return { processed };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const force = !!body.force;
    let ids: string[] = Array.isArray(body.fec_committee_ids) ? body.fec_committee_ids : [];

    if (ids.length === 0) {
      const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 100);
      // Use server-side paginated MV to get unassigned committees in one query.
      const { data: poolRows, error: poolErr } = await supabase.rpc('list_committee_pool', {
        p_search: null,
        p_source: null,
        p_assigned: 'unassigned',
        p_limit: limit,
        p_offset: 0,
      });
      if (poolErr) {
        console.error('list_committee_pool failed', poolErr);
      }
      ids = ((poolRows ?? []) as any[]).map((r) => r.fec_committee_id).filter(Boolean);
    }

    if (ids.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, message: 'Nothing to classify' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (ids.length <= 5) {
      const result = await processIds(supabase, ids, force);
      return new Response(JSON.stringify({ ok: true, ...result, ids }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // @ts-ignore EdgeRuntime is provided by Supabase runtime
    EdgeRuntime.waitUntil(processIds(supabase, ids, force));
    return new Response(JSON.stringify({ ok: true, queued: ids.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('classify-committee-topic error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
