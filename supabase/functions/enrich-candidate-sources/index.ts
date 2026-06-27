import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  callGeminiGrounded,
  resolveGroundedSources,
} from '../_shared/gemini-research.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface GroundingResult {
  sourceDescription: string;
  sourceUrls: string[];
  sourceTitles: string[];
  keyQuote: string;
  success: boolean;
}

/**
 * Research sources for an existing candidate answer using Gemini with Google Search grounding.
 */
async function researchSources(
  candidateName: string,
  questionText: string,
  answerValue: number,
  party: string,
  office: string,
  state: string,
  retryCount = 0
): Promise<GroundingResult> {
  const maxRetries = 2;

  const positionDesc = answerValue <= -7 ? 'strongly supports progressive/left-leaning position' :
                       answerValue <= -3 ? 'leans progressive/left' :
                       answerValue >= 7 ? 'strongly supports conservative/right-leaning position' :
                       answerValue >= 3 ? 'leans conservative/right' :
                       'holds a centrist/moderate position';

  const officeContext = office ? ` (${office}${state ? `, ${state}` : ''})` : '';
  const partyContext = party ? `, ${party} party` : '';

  const prompt = `Find official sources documenting ${candidateName}'s${officeContext}${partyContext} CURRENT position on this SPECIFIC question: "${questionText}"

The candidate ${positionDesc} on this issue (score: ${answerValue} on a -10 to +10 scale).

CRITICAL: Only cite sources that DIRECTLY address this specific question.
Do NOT include sources that are about the general topic but don't discuss the specific issue.

RECENCY REQUIREMENTS:
- Prioritize RECENT statements and actions (2023-2025) first
- Work backwards chronologically only if recent evidence is unavailable
- For party platform references, use ONLY the latest official platform (2024)

SOURCE RELEVANCE REQUIREMENTS:
- The source MUST explicitly discuss the specific issue in the question
- Biography pages or general profile pages are NOT valid unless they address this issue
- If no sources directly address this question, respond with "No documented position found"

PRIORITY SOURCES (use these first):
- Government sources with content about THIS specific policy
- Campaign website sections addressing THIS issue
- News articles covering the candidate's stance on THIS exact question

AVOID these unreliable sources:
- republicanviews.org, democraticviews.org (often broken/outdated)
- General "about the candidate" pages that don't address this issue

IMPORTANT: Format your response EXACTLY as follows:
DESCRIPTION: [1-2 sentence description citing specific evidence that addresses THIS question (bill numbers, dates, quotes)]
KEY_QUOTE: "[A SHORT verbatim quote (10-30 words) from the source that directly evidences the position on THIS issue.]"

If no sources directly address this specific question, respond with:
DESCRIPTION: No documented position found.
KEY_QUOTE: ""`;

  try {
    const { text: researchText, rawSources } = await callGeminiGrounded({ prompt });

    const descriptionMatch = researchText.match(/DESCRIPTION:\s*(.+?)(?=KEY_QUOTE:|$)/s);
    const keyQuoteMatch = researchText.match(/KEY_QUOTE:\s*"([^"]+)"/);

    const sourceDescription = descriptionMatch?.[1]?.trim() || researchText.slice(0, 500);
    const keyQuote = keyQuoteMatch?.[1]?.trim() || '';

    const resolvedSources = await resolveGroundedSources(rawSources, { keyQuote, limit: 5 });

    const sourceUrls = resolvedSources.map(s => s.url);
    const sourceTitles = resolvedSources.map(s => s.title);

    const hasRealEvidence = sourceDescription.length > 20 &&
      !sourceDescription.toLowerCase().includes('no documented position found') &&
      sourceUrls.length > 0;

    console.log(`Source research for "${questionText.slice(0, 40)}...": ${sourceDescription.length} chars, ${sourceUrls.length} sources, quote: "${keyQuote.slice(0, 30)}...", success: ${hasRealEvidence}`);

    return { sourceDescription, sourceUrls, sourceTitles, keyQuote, success: hasRealEvidence };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('Gemini grounding error:', err.message);

    if (retryCount < maxRetries) {
      const isRateLimitOrServer = err.message.includes('429') || err.message.match(/5\d\d/);
      const delay = Math.pow(2, retryCount + 1) * 1000;
      if (isRateLimitOrServer) {
        console.log(`Retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        return researchSources(candidateName, questionText, answerValue, party, office, state, retryCount + 1);
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
    const { candidateId, topicId, limit = 50 } = await req.json();

    if (!candidateId) {
      return new Response(
        JSON.stringify({ error: 'candidateId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[enrich-candidate-sources] Starting for candidate ${candidateId}${topicId ? ` (topic: ${topicId})` : ''}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: candidate, error: candidateError } = await supabase
      .from('candidates')
      .select('id, name, party, office, state')
      .eq('id', candidateId)
      .single();

    if (candidateError || !candidate) {
      console.error('Error fetching candidate:', candidateError);
      return new Response(
        JSON.stringify({ error: `Candidate not found: ${candidateId}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: allAnswers, error: fetchError } = await supabase
      .from('candidate_answers')
      .select(`
        id,
        candidate_id,
        question_id,
        answer_value,
        source_description,
        source_urls,
        questions!inner(id, text, topic_id, topics!inner(name))
      `)
      .eq('candidate_id', candidateId);

    if (fetchError) {
      console.error('Error fetching answers:', fetchError);
      throw fetchError;
    }

    const answersNeedingSources = (allAnswers || []).filter(a => {
      const hasNoUrls = !a.source_urls || a.source_urls.length === 0;
      const hasGenericDescription = a.source_description?.toLowerCase().includes('no documented position') ||
                                     a.source_description?.toLowerCase().includes('based on party platform') ||
                                     a.source_description?.toLowerCase().includes('inferred from');

      if (topicId && (a.questions as any)?.topic_id !== topicId) {
        return false;
      }

      return hasNoUrls || hasGenericDescription;
    }).slice(0, limit);

    console.log(`Found ${answersNeedingSources.length} answers needing source enrichment for ${candidate.name}`);

    if (answersNeedingSources.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          candidateId,
          candidateName: candidate.name,
          message: 'All answers already have sources'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let enriched = 0;
    let failed = 0;

    for (const answer of answersNeedingSources) {
      const question = answer.questions as any;
      const questionText = question?.text || '';

      const result = await researchSources(
        candidate.name,
        questionText,
        answer.answer_value,
        candidate.party,
        candidate.office,
        candidate.state
      );

      if (result.success) {
        const { error: updateError } = await supabase
          .from('candidate_answers')
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
          console.log(`Enriched answer for "${questionText.slice(0, 30)}..." with ${result.sourceUrls.length} sources`);
        }
      } else {
        failed++;
      }

      await new Promise(r => setTimeout(r, 1500));
    }

    console.log(`[enrich-candidate-sources] Complete: ${enriched} enriched, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        candidateId,
        candidateName: candidate.name,
        processed: answersNeedingSources.length,
        enriched,
        failed
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[enrich-candidate-sources] Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
