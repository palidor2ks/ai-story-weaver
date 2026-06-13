// Evidence-index citation matcher: matches public_statement answers (no source_url) to
// real statements in member_statements via keyword topic tags, then calls a distiller
// to verify stance alignment (docs/answers-enrichment-part1b-plan.md §DECIDED).
//
// Safety property: the distiller may ONLY return an index into the statement list the
// function provides; it cannot mint URLs. The function resolves the URL from the DB row.
// This is "honest by construction" — every citation comes from a real newsroom release.
//
// Gate ritual (plan §Ritual): this function writes to _match_stmt_citations ONLY.
// It NEVER touches candidate_answers. After a 50-sample precision eyeball:
//   update candidate_answers ca
//   set source_url = mc.matched_url, evidence_type = 'sourced', updated_at = now()
//   from _match_stmt_citations mc
//   where mc.answer_id = ca.id and mc.verdict = 'cited' and ca.source_url is null;
//
// Invoke: POST with { limit: N } (default 10 for gate; scale up after gate clears).
// Requires cron-secret auth (same vault pattern as fetch-member-statements).

import { createClient } from 'npm:@supabase/supabase-js@2';

// Inlined from _shared/cron-auth.ts (avoids relative-import resolution during MCP deploy)
async function requireCronAuth(req: Request): Promise<Response | null> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const provided = req.headers.get('x-cron-secret');
  if (url && key && provided) {
    try {
      const { data } = await createClient(url, key).rpc('get_cron_secret');
      if (typeof data === 'string' && data.length === provided.length) {
        let diff = 0;
        for (let i = 0; i < data.length; i++) diff |= data.charCodeAt(i) ^ provided.charCodeAt(i);
        if (diff === 0) return null;
      }
    } catch { /* fall through */ }
  }
  const auth = req.headers.get('authorization') ?? '';
  if (key && auth === `Bearer ${key}`) return null;
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
  });
}

// Inlined from _shared/statement-citation-utils.ts
function stanceLine(questionText: string, answerValue: number): string {
  const side = answerValue < 0 ? 'progressive/left' : 'conservative/right';
  return `On the question "${questionText}" this answer records the ${side} position ` +
    `(value ${answerValue} on a -10..+10 scale where negative = left, positive = right).`;
}

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const BATCH_LIMIT    = 10;   // per invocation during gate phase; increase after gate clears
const STMT_LIMIT     = 5;    // topic-matched statements passed to distiller
const BODY_EXCERPT   = 600;  // chars of body text in distiller context
const DELAY_MS       = 500;  // courtesy gap between Lovable gateway calls

interface AnswerRow {
  id: string;
  candidate_id: string;
  question_id: string;
  answer_value: number;
  question_text: string;
  topic_id: string;
  candidate_name: string;
  state: string | null;
  office: string | null;
}

interface StatementRow {
  id: string;
  url: string;
  title: string | null;
  body_text: string | null;
  published_at: string | null;
}

interface PickResult {
  index: number;              // 0-based into statements list, or -1
  supporting_quote?: string;
  reason: string;
}

async function callDistiller(
  answer: AnswerRow,
  statements: StatementRow[],
): Promise<PickResult | null> {
  const stmtList = statements
    .map((s, i) => {
      const date = s.published_at?.slice(0, 10) ?? 'unknown date';
      const excerpt = (s.body_text ?? '').slice(0, BODY_EXCERPT);
      return `[${i}] "${s.title ?? '(no title)'}" (${date})\n${excerpt}`;
    })
    .join('\n---\n');

  const who = [answer.candidate_name, answer.office, answer.state ? `${answer.state}` : '']
    .map((p) => (p ?? '').trim()).filter(Boolean).join(', ');

  const systemPrompt = `You match a recorded political position to a U.S. politician's own official statements. Be strict — a wrong citation is worse than no citation.

Return index = the zero-based index of the statement that CLEARLY supports the recorded stance, or -1 if none qualifies. A statement qualifies ONLY when ALL three hold:
1. TOPIC — the statement actually discusses the specific policy the question asks about.
2. STANCE — the statement supports the recorded answer direction (not neutral, not the opposite, not ambiguous).
3. DIRECT — the statement expresses the politician's own position, not a procedural or administrative mention.

If index >= 0: supporting_quote = a short verbatim excerpt copied from the statement body above (never composed by you).
Keep reason to one sentence regardless of outcome. Never invent or alter quotes.`;

  const userPrompt = `POLITICIAN: ${who}
${stanceLine(answer.question_text, answer.answer_value)}

OFFICIAL STATEMENTS (${statements.length} from corpus — choose one or return -1):
${stmtList}`;

  try {
    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',  // proven for tool-calls in this repo
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'pick_statement',
            description: 'Pick the index of the qualifying statement, or -1 for none.',
            parameters: {
              type: 'object',
              properties: {
                index: {
                  type: 'number',
                  description: 'Zero-based index into the provided list (0 to N-1), or -1 for none',
                },
                supporting_quote: {
                  type: 'string',
                  description: 'Short verbatim excerpt from the chosen statement; omit when index = -1',
                },
                reason: {
                  type: 'string',
                  description: 'One sentence: why it qualifies, or which guard failed',
                },
              },
              required: ['index', 'reason'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'pick_statement' } },
      }),
    });

    if (!resp.ok) {
      console.warn('[distiller] gateway non-ok', resp.status, await resp.text().catch(() => ''));
      return null;
    }
    const data = await resp.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;

    const parsed = JSON.parse(args) as PickResult;
    // Clamp to valid range — model must not name an index outside the list
    const idx = Number(parsed.index);
    parsed.index = Number.isFinite(idx) && idx >= 0 && idx < statements.length ? Math.floor(idx) : -1;
    return parsed;
  } catch (err) {
    console.warn('[distiller] error', err);
    return null;
  }
}

async function processAnswers(limit: number): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: answers, error } = await supabase
    .rpc('claim_answers_for_citation', { p_limit: limit });
  if (error) {
    console.error('[match] claim failed', error);
    return;
  }
  const rows = (answers ?? []) as AnswerRow[];
  console.log(`[match] claimed ${rows.length} answers`);

  for (const answer of rows) {
    const patch: Record<string, unknown> = {
      answer_id:      answer.id,
      candidate_id:   answer.candidate_id,
      question_id:    answer.question_id,
      question_topic: answer.topic_id,
      question_text:  answer.question_text,
      answer_value:   answer.answer_value,
      candidate_name: answer.candidate_name,
      state:          answer.state,
      office:         answer.office,
      processed_at:   new Date().toISOString(),
    };

    try {
      // Pre-insert a 'pending' row so concurrent invocations see this answer as claimed.
      await supabase.from('_match_stmt_citations').upsert(
        { ...patch, verdict: 'pending', statements_considered: 0 },
        { onConflict: 'answer_id' },
      );

      // Retrieve topic-matched statements for this candidate.
      const { data: stmts } = await supabase
        .from('member_statements')
        .select('id, url, title, body_text, published_at')
        .eq('candidate_id', answer.candidate_id)
        .filter('topic_tags', 'cs', `{${answer.topic_id}}`)
        .gt('body_chars', 200)
        .order('published_at', { ascending: false })
        .limit(STMT_LIMIT);

      const statements = (stmts ?? []) as StatementRow[];
      patch.statements_considered = statements.length;

      if (statements.length === 0) {
        patch.verdict = 'none';
        patch.reason  = `no topic-matched statements with body for topic ${answer.topic_id}`;
      } else {
        const result = await callDistiller(answer, statements);
        if (!result) {
          patch.verdict = 'error';
          patch.reason  = 'distiller unavailable';
        } else if (result.index < 0) {
          patch.verdict = 'none';
          patch.reason  = (result.reason ?? 'no qualifying statement').slice(0, 500);
        } else {
          const stmt = statements[result.index];
          patch.verdict              = 'cited';
          patch.matched_statement_id = stmt.id;
          patch.matched_url          = stmt.url;
          patch.matched_title        = (stmt.title ?? '').slice(0, 300);
          patch.body_excerpt         = (stmt.body_text ?? '').slice(0, BODY_EXCERPT);
          patch.supporting_quote     = (result.supporting_quote ?? '').slice(0, 600);
          patch.reason               = (result.reason ?? '').slice(0, 500);
        }
      }
    } catch (e) {
      patch.verdict = 'error';
      patch.reason  = String(e).slice(0, 300);
    }

    const { error: upErr } = await supabase
      .from('_match_stmt_citations')
      .upsert(patch, { onConflict: 'answer_id' });
    if (upErr) console.error('[match] staging upsert failed', answer.id, upErr);

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log('[match] batch done');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const unauthorized = await requireCronAuth(req);
  if (unauthorized) return unauthorized;

  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body?.limit) || BATCH_LIMIT, 1), 100);

  EdgeRuntime.waitUntil(processAnswers(limit));
  return new Response(JSON.stringify({ accepted: true, limit }), {
    status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
