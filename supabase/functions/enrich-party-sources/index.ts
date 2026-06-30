import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  callGeminiGrounded,
  GeminiQuotaError,
  resolveGroundedSources,
} from '../_shared/gemini-research.ts';

// Declare EdgeRuntime for background tasks
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PARTY_NAMES: Record<string, string> = {
  democrat: 'Democratic Party',
  republican: 'Republican Party',
  green: 'Green Party',
  libertarian: 'Libertarian Party',
};

// Official party platform URLs as fallbacks when grounding yields no valid sources.
const OFFICIAL_PLATFORM_URLS: Record<string, string> = {
  democrat: 'https://democrats.org/where-we-stand/party-platform/',
  republican: 'https://gop.com/platform/',
  green: 'https://gp.org/platform/',
  libertarian: 'https://lp.org/platform/',
};

interface AnswerToEnrich {
  id: string;
  party_id: string;
  question_id: string;
  answer_value: number;
  question_text: string;
  topic_name: string;
}

interface GroundingResult {
  sourceDescription: string;
  sourceUrls: string[];
  sourceTitles: string[];
  keyQuote: string;
  success: boolean;
}

/**
 * Smart truncation that preserves sentence/word boundaries.
 */
function smartTruncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text || '';

  const sentenceEnd = text.slice(0, maxLength).lastIndexOf('. ');
  if (sentenceEnd > maxLength * 0.6) {
    return text.slice(0, sentenceEnd + 1);
  }

  const lastSpace = text.slice(0, maxLength).lastIndexOf(' ');
  if (lastSpace > maxLength * 0.7) {
    return text.slice(0, lastSpace) + '...';
  }

  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Research sources for an existing party answer using Gemini with Google Search grounding.
 */
async function researchSources(
  partyId: string,
  partyName: string,
  questionText: string,
  answerValue: number,
  retryCount = 0
): Promise<GroundingResult> {
  const maxRetries = 2;

  const positionDesc = answerValue <= -7 ? 'strongly supports progressive/left-leaning position' :
                       answerValue <= -3 ? 'leans progressive/left' :
                       answerValue >= 7 ? 'strongly supports conservative/right-leaning position' :
                       answerValue >= 3 ? 'leans conservative/right' :
                       'holds a centrist/moderate position';

  const prompt = `Find official sources documenting the ${partyName}'s CURRENT position on this SPECIFIC question: "${questionText}"

The party ${positionDesc} on this issue (score: ${answerValue} on a -10 to +10 scale).

CRITICAL: Only cite sources that DIRECTLY address this specific question.
Do NOT include sources that are about the general topic but don't discuss the specific issue.

RECENCY REQUIREMENTS:
- Use ONLY the LATEST official party platform (2024 or most recent)
- Prioritize recent statements from party leadership (2023-2025)

SOURCE RELEVANCE REQUIREMENTS:
- The source MUST explicitly discuss the specific issue in the question
- General party pages that don't mention this issue are NOT valid sources
- If no sources directly address this question, respond with "No documented position found"

PRIORITY SOURCES (use these first):
- Official party websites with content about THIS specific issue
- Government sources discussing THIS policy
- Major news outlets covering the party's stance on THIS exact issue

AVOID these unreliable sources:
- republicanviews.org, democraticviews.org (often broken/outdated)
- Partisan opinion blogs or unofficial third-party sites
- General "what does X party believe" articles that don't cite this issue

IMPORTANT: Format your response EXACTLY as follows:
DESCRIPTION: [1-2 sentence description citing specific evidence that addresses THIS question]
KEY_QUOTE: "[A SHORT verbatim quote (10-30 words) from the source that directly evidences the position on THIS issue.]"

If no sources directly address this specific question, respond with:
DESCRIPTION: No documented position found.
KEY_QUOTE: ""`;

  try {
    const { text: researchText, rawSources } = await callGeminiGrounded({ prompt });

    const descriptionMatch = researchText.match(/DESCRIPTION:\s*(.+?)(?=KEY_QUOTE:|$)/s);
    const keyQuoteMatch = researchText.match(/KEY_QUOTE:\s*"([^"]+)"/);

    const sourceDescription = descriptionMatch?.[1]?.trim() || smartTruncate(researchText, 1000);
    const keyQuote = keyQuoteMatch?.[1]?.trim() || '';

    const resolvedSources = await resolveGroundedSources(rawSources, { keyQuote, limit: 5 });

    // Fallback to official platform if grounding yielded no valid sources.
    let finalSources = resolvedSources;
    let finalDescription = sourceDescription;

    if (resolvedSources.length === 0) {
      const fallbackUrl = OFFICIAL_PLATFORM_URLS[partyId];
      if (fallbackUrl) {
        finalSources = [{ url: fallbackUrl, title: `${partyName} Platform` }];
        finalDescription = `Based on official ${partyName} platform. ${sourceDescription}`.trim();
        console.log(`Using fallback URL for ${partyId}: ${fallbackUrl}`);
      }
    }

    const sourceUrls = finalSources.map(s => s.url);
    const sourceTitles = finalSources.map(s => s.title);

    const hasRealEvidence = finalDescription.length > 20 &&
      !finalDescription.toLowerCase().includes('no documented position found') &&
      sourceUrls.length > 0;

    console.log(`Source research for "${questionText.slice(0, 40)}...": ${finalDescription.length} chars, ${sourceUrls.length} sources, quote: "${keyQuote.slice(0, 30)}...", success: ${hasRealEvidence}`);

    return { sourceDescription: finalDescription, sourceUrls, sourceTitles, keyQuote, success: hasRealEvidence };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('Gemini grounding error:', err.message);

    if (e instanceof GeminiQuotaError) {
      console.warn('Google AI quota exceeded — skipping source enrichment.');
      return { sourceDescription: '', sourceUrls: [], sourceTitles: [], keyQuote: '', success: false };
    }

    if (retryCount < maxRetries) {
      const isServerError = err.message.match(/5\d\d/);
      const delay = Math.pow(2, retryCount + 1) * 1000;
      if (isServerError) {
        console.log(`Retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        return researchSources(partyId, partyName, questionText, answerValue, retryCount + 1);
      }
    }

    return { sourceDescription: '', sourceUrls: [], sourceTitles: [], keyQuote: '', success: false };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Admin auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const adminCheckClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: roleData } = await adminCheckClient.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
  if (!roleData) {
    return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const { partyId, topicId } = await req.json();

    if (!partyId) {
      return new Response(
        JSON.stringify({ error: 'partyId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const partyName = PARTY_NAMES[partyId];
    if (!partyName) {
      return new Response(
        JSON.stringify({ error: `Invalid party: ${partyId}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[enrich-party-sources] Starting for ${partyName}${topicId ? ` (topic: ${topicId})` : ''}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: allAnswers, error: fetchError } = await supabase
      .from('party_answers')
      .select(`
        id,
        party_id,
        question_id,
        answer_value,
        source_description,
        source_urls,
        questions!inner(id, text, topic_id, topics!inner(name))
      `)
      .eq('party_id', partyId);

    if (fetchError) {
      console.error('Error fetching answers:', fetchError);
      throw fetchError;
    }

    const answersNeedingSources = (allAnswers || []).filter(a => {
      const hasNoUrls = !a.source_urls || a.source_urls.length === 0;
      const hasGenericDescription = a.source_description?.toLowerCase().includes('no documented position') ||
                                     a.source_description?.toLowerCase().includes('platform');

      if (topicId && (a.questions as any)?.topic_id !== topicId) {
        return false;
      }

      return hasNoUrls || hasGenericDescription;
    });

    console.log(`Found ${answersNeedingSources.length} answers needing source enrichment`);

    if (answersNeedingSources.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          party: partyName,
          message: 'All answers already have sources'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Return immediate response and process in background
    const response = new Response(
      JSON.stringify({
        success: true,
        status: 'processing',
        party: partyName,
        partyId,
        totalToEnrich: answersNeedingSources.length,
        message: `Started enrichment for ${answersNeedingSources.length} answers`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    EdgeRuntime.waitUntil((async () => {
      let enriched = 0;
      let failed = 0;

      for (const answer of answersNeedingSources) {
        const question = answer.questions as any;
        const questionText = question?.text || '';

        const result = await researchSources(partyId, partyName, questionText, answer.answer_value);

        if (result.success) {
          const { error: updateError } = await supabase
            .from('party_answers')
            .update({
              source_description: result.sourceDescription,
              source_urls: result.sourceUrls,
              source_titles: result.sourceTitles,
              source_url: result.sourceUrls[0] || null,
              updated_at: new Date().toISOString()
            })
            .eq('id', answer.id);

          if (updateError) {
            console.error(`Error updating answer ${answer.id}:`, updateError);
            failed++;
          } else {
            enriched++;
            console.log(`[${enriched}/${answersNeedingSources.length}] Enriched: "${questionText.slice(0, 30)}..." with ${result.sourceUrls.length} sources`);
          }
        } else {
          failed++;
          console.log(`[${enriched + failed}/${answersNeedingSources.length}] Failed to enrich: "${questionText.slice(0, 30)}..."`);
        }

        await new Promise(r => setTimeout(r, 1500));
      }

      console.log(`[enrich-party-sources] Complete: ${enriched} enriched, ${failed} failed out of ${answersNeedingSources.length}`);
    })());

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[enrich-party-sources] Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
