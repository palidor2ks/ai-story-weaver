// Grounded "what is this candidate in the news for" lookup. Gives a social caption a
// real, attention-grabbing, ATTRIBUTED hook instead of a dry finance line.
//
// Hard rule (mirrors the app's #1 data-accuracy guardrail): the hook is distilled
// ONLY from live web research that carries real source citations (You.com Research
// API). The model may never add an allegation that isn't in the fetched material,
// and the cited URL is always one the research actually returned — never invented.
// When there is no genuinely newsworthy item (or no API key configured), this
// returns null and the caller falls back to the verified finance/record caption.
import { callYouSmart, YouError, type YouCitation } from './you-search.ts';
import { readCache, writeCache } from './ai-cache.ts';
import { cleanHook, hostLabel, pickCitation } from './news-research-utils.ts';

export { cleanHook, hostLabel, pickCitation };

export interface NewsHook {
  hook: string;   // one factual clause completing "<name> ___", e.g. "is facing a House ethics probe over undisclosed stock trades"
  source: string; // publisher label for attribution, e.g. "Politico"
  url: string;    // the cited article URL — always picked from the research citations
}

// News doesn't turn over hourly; cache the verdict (hook OR "no news") for a day so a
// regenerate or a second platform on the same candidate doesn't re-hit the API.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Distill the research notes into ONE factual, attributed hook via the Lovable gateway.
// Returns null when the model judges there's nothing genuinely newsworthy, or on any
// error (the caller then falls back to the verified-finance caption).
async function distill(aiKey: string, content: string, citations: YouCitation[], name: string): Promise<NewsHook | null> {
  const sourceList = citations.slice(0, 10).map((c, i) => `[${i}] ${c.title} — ${c.url}`).join('\n');
  const systemPrompt = `You distill web-research notes into ONE short, factual, attributed news hook about a U.S. politician for a social-media caption — the TOP recent news about them.

RULES:
- Use ONLY claims explicitly supported by the research notes below. NEVER add an allegation, detail, number, or characterization that isn't stated. No speculation, no guesses.
- Pick the SINGLE most significant recent news item — whatever they are most in the news for lately. This is "top news of the day", NOT only scandals: a bill they introduced or voted on, an election/primary result, a notable public statement or interview, an endorsement, a town hall, a legal/ethics matter, a high-profile fight — any of these count. Prefer the most recent + highest-profile.
- Do NOT pick a campaign-finance/fundraising-totals item if any other real news exists — money is covered by a separate caption style.
- The hook is a short clause that completes the sentence "<NAME> ___" (e.g. "introduced a bill to expand rural broadband" or "won the Republican primary for Ohio's 9th district"). 10–22 words. Neutral, factual wording — report it, do NOT editorialize, sharpen it into an accusation, or imply guilt beyond what's reported.
- source_index: the index of the citation that best supports the hook (must be one of the listed indices).
- Set newsworthy=false ONLY if the notes contain no real recent news about this person at all.

Return strict JSON via the distill_hook tool.`;
  const userPrompt = `POLITICIAN: ${name}\n\nSOURCES:\n${sourceList}\n\nRESEARCH NOTES:\n${content.slice(0, 8000)}`;

  try {
    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${aiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // gemini-3-flash-preview is the model proven to do tool/function calling on the
        // Lovable gateway elsewhere in this repo (fetch-relevant-news classifyArticles).
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'distill_hook',
            description: 'Return the single most newsworthy, source-attributed hook (or newsworthy=false).',
            parameters: {
              type: 'object',
              properties: {
                newsworthy: { type: 'boolean' },
                hook: { type: 'string' },
                source: { type: 'string', description: 'Short publisher name for attribution, e.g. "Politico".' },
                source_index: { type: 'number' },
              },
              required: ['newsworthy', 'hook', 'source', 'source_index'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'distill_hook' } },
      }),
    });
    if (!resp.ok) {
      console.warn('controversy distill non-ok', resp.status, await resp.text().catch(() => ''));
      return null;
    }
    const data = await resp.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    const parsed = JSON.parse(args);
    if (!parsed?.newsworthy) return null;
    const hook = cleanHook(parsed.hook);
    if (!hook) return null;
    const citation = pickCitation(citations, parsed.source_index);
    if (!citation) return null;
    const source = cleanHook(parsed.source) || citation.title || hostLabel(citation.url);
    if (!source) return null;
    return { hook, source, url: citation.url };
  } catch (err) {
    console.warn('controversy distill error', err);
    return null;
  }
}

// Look up the candidate's TOP recent news item (broad — not only controversy), grounded
// in live web research with real citations. Cached per-candidate for a day (hook OR a
// "no news" verdict). Returns null when there's no recent coverage, no key, or on error.
export async function researchTopNews(opts: {
  candidateId: string;
  name: string;
  office?: string | null;
  state?: string | null;
  todayIso?: string | null;
  youKey?: string | undefined;
  aiKey?: string | undefined;
}): Promise<NewsHook | null> {
  const { candidateId, name } = opts;
  if (!opts.youKey || !opts.aiKey || !candidateId) return null;
  const cleanName = (name ?? '').trim();
  if (!cleanName || cleanName === 'This candidate') return null;

  const cacheKey = { kind: 'candidate' as const, subject_id: `caption-news:v1:${candidateId}` };
  const cached = await readCache<{ hook: NewsHook | null }>(cacheKey);
  if (cached && Date.now() - new Date(cached.updated_at).getTime() < CACHE_TTL_MS) {
    return cached.payload?.hook ?? null;
  }

  let result: NewsHook | null = null;
  try {
    const who = [cleanName, opts.office, opts.state ? `of ${opts.state}` : '']
      .map((p) => (p ?? '').trim()).filter(Boolean).join(', ');
    const query = `What is the TOP recent news about ${who}? In other words, what are they most in the news for lately (roughly the last 1–2 months, as of ${opts.todayIso ?? 'today'})? Include any significant coverage — a bill or vote, a primary/election result, a notable public statement or interview, an endorsement, a town hall, a dispute, or a legal/ethics matter. Give the single biggest recent development as a specific factual claim and name the news outlet that reported it. If there is genuinely no recent news coverage about this person at all, answer exactly: NONE.`;
    const research = await callYouSmart({ query, apiKey: opts.youKey, researchEffort: 'lite' });
    const trimmed = (research.content ?? '').trim();
    if (trimmed && !/^none\b/i.test(trimmed) && research.citations.length > 0) {
      result = await distill(opts.aiKey, trimmed, research.citations, cleanName);
    }
  } catch (e) {
    if (e instanceof YouError) console.warn('controversy research you.com', e.code, e.message);
    else console.warn('controversy research failed', e);
    // Transient failure — do NOT cache it, so the next caption retries.
    return null;
  }

  // Cache the verdict (a hook OR an explicit null = "checked, nothing notable").
  await writeCache(cacheKey, { hook: result }, 'caption-news');
  return result;
}
