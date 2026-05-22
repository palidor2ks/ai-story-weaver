// Classify external committees (PACs, SuperPACs, party committees) to one primary topic + optional secondaries.
// Body: { fec_committee_ids?: string[], limit?: number, force?: boolean }
// If no ids supplied, processes up to `limit` (default 20) unclassified external committees in background.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

interface CommitteeInfo {
  fec_committee_id: string;
  name: string;
  designation: string | null;
  ie_purposes: string[];
  top_targets: string[];
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

  if (!name) return null;

  const { data: ieRows } = await supabase
    .from('independent_expenditures')
    .select('purpose, target_candidate_name, support_oppose_indicator, amount')
    .eq('spending_committee_fec_id', fecId)
    .order('amount', { ascending: false })
    .limit(50);

  const purposes = Array.from(
    new Set((ieRows ?? []).map((r: any) => (r.purpose ?? '').trim()).filter(Boolean)),
  ).slice(0, 15);
  const targets = Array.from(
    new Set((ieRows ?? []).map((r: any) => r.target_candidate_name).filter(Boolean)),
  ).slice(0, 10);

  return {
    fec_committee_id: fecId,
    name,
    designation,
    ie_purposes: purposes as string[],
    top_targets: targets as string[],
  };
}

async function classifyOne(info: CommitteeInfo, topics: any[]): Promise<{
  primary_topic_id: string;
  secondary_topic_ids: string[];
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
} | null> {
  const topicMenu = topics
    .map((t) => `- ${t.id}: ${t.displayName || t.name}`)
    .join('\n');

  const userMsg = `Committee: ${info.name}
Designation: ${info.designation ?? 'unknown'}
Top IE targets: ${info.top_targets.join(', ') || 'none'}
IE expenditure purposes: ${info.ie_purposes.slice(0, 10).join(' | ') || 'none'}

Pick ONE primary federal topic id that best captures this committee's focus, plus 0-2 optional secondary topic ids if clearly relevant. Only use ids from the list.

Topics:
${topicMenu}`;

  const allowed = topics.map((t) => t.id);

  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        {
          role: 'system',
          content:
            'You categorize US political committees (PACs, SuperPACs, party committees) into a single primary policy topic. Be conservative — pick "low" confidence for generic partisan committees with no clear single issue focus.',
        },
        { role: 'user', content: userMsg },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'classify_committee',
            description: 'Return primary and optional secondary topic ids.',
            parameters: {
              type: 'object',
              properties: {
                primary_topic_id: { type: 'string', enum: allowed },
                secondary_topic_ids: {
                  type: 'array',
                  items: { type: 'string', enum: allowed },
                  maxItems: 2,
                },
                confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
                reasoning: { type: 'string', maxLength: 240 },
              },
              required: ['primary_topic_id', 'confidence', 'reasoning'],
              additionalProperties: false,
            },
          },
        },
      ],
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
    if (!allowed.includes(parsed.primary_topic_id)) return null;
    return {
      primary_topic_id: parsed.primary_topic_id,
      secondary_topic_ids: (parsed.secondary_topic_ids ?? []).filter((id: string) => allowed.includes(id)),
      confidence: parsed.confidence ?? 'low',
      reasoning: (parsed.reasoning ?? '').slice(0, 240),
    };
  } catch (e) {
    console.error('Failed to parse AI args', e);
    return null;
  }
}

async function processIds(supabase: any, ids: string[], force: boolean) {
  const { data: topics } = await supabase
    .from('topics')
    .select('id, name, displayName:display_name, icon, scope')
    .in('scope', ['all', 'federal']);
  const topicList = topics ?? [];
  if (topicList.length === 0) {
    console.error('No federal topics available');
    return { processed: 0 };
  }

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
      if (!info) {
        console.log(`No info for ${id}`);
        continue;
      }
      const result = await classifyOne(info, topicList);
      if (!result) continue;

      const { error } = await supabase.from('committee_topics').upsert({
        fec_committee_id: id,
        primary_topic_id: result.primary_topic_id,
        secondary_topic_ids: result.secondary_topic_ids,
        assigned_by: 'ai',
        ai_confidence: result.confidence,
        ai_reasoning: result.reasoning,
        admin_overridden: false,
      });
      if (error) {
        console.error(`Upsert failed for ${id}`, error);
        continue;
      }
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
      // Find external committees that lack a topic (exclude principal/authorized candidate committees).
      const { data: cmtes } = await supabase
        .from('candidate_committees')
        .select('fec_committee_id, designation')
        .not('designation', 'in', '(P,A)')
        .limit(500);
      const candidateIds = (cmtes ?? []).map((c: any) => c.fec_committee_id);

      const { data: ieCmtes } = await supabase
        .from('independent_expenditures')
        .select('spending_committee_fec_id')
        .limit(500);
      const ieIds = Array.from(new Set((ieCmtes ?? []).map((r: any) => r.spending_committee_fec_id).filter(Boolean)));

      const pool = Array.from(new Set([...candidateIds, ...ieIds]));
      const { data: existing } = await supabase
        .from('committee_topics')
        .select('fec_committee_id')
        .in('fec_committee_id', pool);
      const have = new Set((existing ?? []).map((r: any) => r.fec_committee_id));
      ids = pool.filter((id) => !have.has(id)).slice(0, limit);
    }

    if (ids.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, message: 'Nothing to classify' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Small batches inline, large batches in background.
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
