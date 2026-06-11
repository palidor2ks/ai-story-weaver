// Answers enrichment part 1b, phase 1 — STAGING ONLY (docs/answers-enrichment-part1b-plan.md).
//
// Processes rows pre-enqueued (verdict='pending') in _enrich_stmt_staging by the operator:
// for each public_statement answer whose description names a concrete artifact, run grounded
// web research (You.com, real citations), then a tool-call distiller that may only pick a
// source_index from the returned citation list — it can never mint a URL. Three hard guards
// from the plan: IDENTITY (right person, not a same-name politician), CLAIM (the named
// artifact/statement, not topical adjacency), STANCE (must support the recorded answer
// direction). NONE is a valid outcome and is recorded as such.
//
// This function NEVER writes candidate_answers — applying staged citations is a deliberate
// SQL step that happens only after the 50-sample precision gate passes (plan §Ritual).
// Invoked via pg_net with the vault cron secret (same pattern as the other drains).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireCronAuth } from '../_shared/cron-auth.ts';
import { callYouSmart, YouError, type YouCitation } from '../_shared/you-search.ts';
import { hostLabel, pickCitation } from '../_shared/news-research-utils.ts';
import { buildFindSourceQuery, detectArtifactHint, stanceLine } from '../_shared/statement-citation-utils.ts';

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const YOU_API_KEY = Deno.env.get('YOU_API_KEY');
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const BATCH_CAP = 25;          // one invocation processes one pre-assigned batch_id
const DELAY_MS = 700;          // courtesy gap between You.com calls

interface StagingRow {
  answer_id: string;
  candidate_id: string;
  question_id: string;
  batch_id: string;
  candidate_name: string;
  state: string | null;
  office: string | null;
  question_text: string;
  answer_value: number;
  description: string;
}

interface Verdict {
  found: boolean;
  source_index?: number;
  supporting_quote?: string;
  reason?: string;
}

// Distill: may ONLY choose an index into the citations the research returned.
async function verifyCitation(
  row: StagingRow,
  notes: string,
  citations: YouCitation[],
): Promise<Verdict | null> {
  const sourceList = citations.slice(0, 10).map((c, i) => `[${i}] ${c.title} — ${c.url}`).join('\n');
  const systemPrompt = `You verify whether web research found the ORIGINAL source for a recorded claim about a U.S. politician's position. Be strict — a wrong citation on a real politician's profile is worse than no citation.

Return found=true ONLY if ALL THREE hold, judged solely from the research notes/sources below:
1. IDENTITY — the source is clearly about THIS person (name AND state/office context match). found=false if it could be a different politician with a similar name.
2. CLAIM — the source is (or directly reports) the specific artifact/statement the description references, not merely the same topic.
3. STANCE — the source supports the recorded position direction stated below. found=false if the source shows the opposite stance or is ambiguous.

If found=true: source_index = the index of the single best source from the list (prefer the original artifact: campaign site / .gov newsroom / the named outlet); supporting_quote = a short verbatim quote COPIED from the research notes that evidences the claim (never composed by you); reason = one line on why it passes all three guards.
If found=false: reason = which guard failed. Never invent details not present in the notes.`;
  const userPrompt = `POLITICIAN: ${row.candidate_name} (${row.office ?? 'unknown office'}, ${row.state ?? '?'})
RECORDED STANCE: ${stanceLine(row.question_text, row.answer_value)}
ANSWER'S SOURCE DESCRIPTION (the claim to source): ${row.description.slice(0, 700)}

SOURCES:
${sourceList}

RESEARCH NOTES:
${notes.slice(0, 8000)}`;

  try {
    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // same gateway + model proven for tool-calls elsewhere in the repo (news-research.ts)
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'verify_citation',
            description: 'Strict verdict on whether the research found the original source.',
            parameters: {
              type: 'object',
              properties: {
                found: { type: 'boolean' },
                source_index: { type: 'number' },
                supporting_quote: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['found', 'reason'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'verify_citation' } },
      }),
    });
    if (!resp.ok) {
      console.warn('[verify] gateway non-ok', resp.status, await resp.text().catch(() => ''));
      return null;
    }
    const data = await resp.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    return args ? JSON.parse(args) as Verdict : null;
  } catch (err) {
    console.warn('[verify] gateway error', err);
    return null;
  }
}

// Liveness probe — recorded, not gating (bot-walls 403 legitimate pages; the gate eyeball judges).
async function probeUrl(url: string): Promise<number | null> {
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const resp = await fetch(url, { method, redirect: 'follow', signal: ctl.signal });
      clearTimeout(t);
      if (method === 'GET') await resp.body?.cancel();
      if (resp.status !== 405) return resp.status;
    } catch {
      // try GET after HEAD failure; fall through to null after GET
    }
  }
  return null;
}

async function processBatch(batchId: string): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: rows, error } = await supabase
    .from('_enrich_stmt_staging')
    .select('answer_id, candidate_id, question_id, batch_id, candidate_name, state, office, question_text, answer_value, description')
    .eq('batch_id', batchId)
    .eq('verdict', 'pending')
    .limit(BATCH_CAP);
  if (error) {
    console.error('[batch] select failed', error);
    return;
  }
  console.log(`[batch ${batchId}] processing ${rows?.length ?? 0} rows`);

  for (const row of (rows ?? []) as StagingRow[]) {
    const patch: Record<string, unknown> = { researched_at: new Date().toISOString() };
    try {
      const query = buildFindSourceQuery({
        name: row.candidate_name,
        office: row.office,
        state: row.state,
        description: row.description,
        artifactHint: detectArtifactHint(row.description),
      });
      // 'standard' (not 'lite'): finding one SPECIFIC artifact is a needle query — the
      // 50/50-NONE first gate run showed lite's single pass just takes the NONE escape.
      const research = await callYouSmart({ query, apiKey: YOU_API_KEY!, researchEffort: 'standard' });
      const notes = (research.content ?? '').trim();

      if (!notes || /^none\b/i.test(notes) || research.citations.length === 0) {
        patch.verdict = 'none';
        // record WHICH branch + a notes excerpt — the gate needs to distinguish "the
        // artifact genuinely isn't findable" from a systematic research/query problem
        patch.reason = !notes
          ? 'research: empty content'
          : /^none\b/i.test(notes)
            ? `research said NONE: ${notes.slice(0, 200)}`
            : `research had 0 citations; notes: ${notes.slice(0, 200)}`;
      } else {
        const verdict = await verifyCitation(row, notes, research.citations);
        if (!verdict) {
          patch.verdict = 'error';
          patch.reason = 'distiller unavailable';
        } else if (!verdict.found) {
          patch.verdict = 'none';
          patch.reason = (verdict.reason ?? 'guards not met').slice(0, 500);
        } else {
          const citation = pickCitation(research.citations, verdict.source_index);
          if (!citation) {
            patch.verdict = 'none';
            patch.reason = 'no usable citation index';
          } else {
            patch.verdict = 'cited';
            patch.url = citation.url;
            patch.title = (citation.title ?? '').slice(0, 300);
            patch.source_host = hostLabel(citation.url);
            patch.supporting_quote = (verdict.supporting_quote ?? '').slice(0, 600);
            patch.reason = (verdict.reason ?? '').slice(0, 500);
            patch.http_status = await probeUrl(citation.url);
          }
        }
      }
    } catch (e) {
      patch.verdict = 'error';
      patch.reason = e instanceof YouError ? `${e.code}: ${e.message}` : String(e).slice(0, 300);
      if (e instanceof YouError && e.code !== 'YOU_RATE_LIMIT') {
        // auth/quota failure will fail every row — record this one and stop the batch
        await supabase.from('_enrich_stmt_staging').update(patch).eq('answer_id', row.answer_id);
        console.error(`[batch ${batchId}] aborting: ${patch.reason}`);
        return;
      }
    }
    const { error: upErr } = await supabase.from('_enrich_stmt_staging').update(patch).eq('answer_id', row.answer_id);
    if (upErr) console.error('[batch] row update failed', row.answer_id, upErr);
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  console.log(`[batch ${batchId}] done`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const unauthorized = await requireCronAuth(req);
  if (unauthorized) return unauthorized;
  if (!YOU_API_KEY || !LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: 'YOU_API_KEY / LOVABLE_API_KEY not configured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => ({}));
  const batchId = typeof body?.batch_id === 'string' && body.batch_id ? body.batch_id : null;
  if (!batchId) {
    return new Response(JSON.stringify({ error: 'batch_id required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  EdgeRuntime.waitUntil(processBatch(batchId));
  return new Response(JSON.stringify({ accepted: true, batch_id: batchId }), {
    status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
