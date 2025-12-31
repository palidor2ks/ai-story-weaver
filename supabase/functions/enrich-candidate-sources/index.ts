import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_GEMINI_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface GroundingResult {
  sourceDescription: string;
  sourceUrls: string[];
  success: boolean;
}

/**
 * Research sources for an existing candidate answer using Gemini with Google Search grounding
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
  
  if (!GOOGLE_GEMINI_API_KEY) {
    console.log('GOOGLE_GEMINI_API_KEY not configured');
    return { sourceDescription: '', sourceUrls: [], success: false };
  }

  // Translate answer value to position description
  const positionDesc = answerValue <= -7 ? 'strongly supports progressive/left-leaning position' :
                       answerValue <= -3 ? 'leans progressive/left' :
                       answerValue >= 7 ? 'strongly supports conservative/right-leaning position' :
                       answerValue >= 3 ? 'leans conservative/right' :
                       'holds a centrist/moderate position';

  const officeContext = office ? ` (${office}${state ? `, ${state}` : ''})` : '';
  const partyContext = party ? `, ${party} party` : '';

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ 
            parts: [{ 
              text: `Find official sources documenting ${candidateName}'s${officeContext}${partyContext} position on: \"${questionText}\"

The candidate ${positionDesc} on this issue (score: ${answerValue} on a -10 to +10 scale).

Search for:
- Official voting records and bill sponsorships
- Public statements and speeches
- Campaign website policy positions
- Press releases or interviews
- Legislative actions

Provide a brief 1-2 sentence description citing specific evidence found (bill numbers, dates, quotes). If no specific evidence is found, respond with "No documented position found."`
            }] 
          }],
          tools: [{ googleSearch: {} }]
        })
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Gemini grounding error: ${response.status} - ${errorBody}`);
      
      if (retryCount < maxRetries && (response.status === 429 || response.status >= 500)) {
        const delay = Math.pow(2, retryCount + 1) * 1000;
        console.log(`Retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        return researchSources(candidateName, questionText, answerValue, party, office, state, retryCount + 1);
      }
      
      return { sourceDescription: '', sourceUrls: [], success: false };
    }

    const data = await response.json();
    
    const researchText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Extract source URLs from grounding metadata
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    const sourceUrls: string[] = [];
    
    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web?.uri) {
          sourceUrls.push(chunk.web.uri);
        }
      }
    }
    
    if (groundingMetadata?.groundingSupports) {
      for (const support of groundingMetadata.groundingSupports) {
        if (support.web?.uri) {
          sourceUrls.push(support.web.uri);
        }
      }
    }

    const uniqueUrls = [...new Set(sourceUrls)].slice(0, 5);
    
    // Check if we found real evidence (not just "no documented position")
    const hasRealEvidence = researchText.length > 50 && 
      !researchText.toLowerCase().includes('no documented position found') &&
      uniqueUrls.length > 0;

    console.log(`Source research for \"${questionText.slice(0, 40)}...\": ${researchText.length} chars, ${uniqueUrls.length} sources, success: ${hasRealEvidence}`);
    
    return {
      sourceDescription: researchText.slice(0, 500),
      sourceUrls: uniqueUrls,
      success: hasRealEvidence
    };
  } catch (e) {
    console.error('Gemini grounding error:', e);
    
    if (retryCount < maxRetries) {
      const delay = Math.pow(2, retryCount + 1) * 1000;
      console.log(`Retrying after error in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, delay));
      return researchSources(candidateName, questionText, answerValue, party, office, state, retryCount + 1);
    }
    
    return { sourceDescription: '', sourceUrls: [], success: false };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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

    // Get candidate info
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

    // Get answers that need sources
    let query = supabase
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

    const { data: allAnswers, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching answers:', fetchError);
      throw fetchError;
    }

    // Filter to answers that need source enrichment
    const answersNeedingSources = (allAnswers || []).filter(a => {
      const hasNoUrls = !a.source_urls || a.source_urls.length === 0;
      const hasGenericDescription = a.source_description?.toLowerCase().includes('no documented position') ||
                                     a.source_description?.toLowerCase().includes('based on party platform') ||
                                     a.source_description?.toLowerCase().includes('inferred from');
      
      // If topicId is specified, filter by topic
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

    // Process answers one at a time with delay to avoid rate limits
    for (const answer of answersNeedingSources) {
      const question = answer.questions as any;
      const questionText = question?.text || '';

      // Research sources
      const result = await researchSources(
        candidate.name,
        questionText,
        answer.answer_value,
        candidate.party,
        candidate.office,
        candidate.state
      );

      if (result.success) {
        // Update the answer with new sources (keep existing answer_value)
        const { error: updateError } = await supabase
          .from('candidate_answers')
          .update({
            source_description: result.sourceDescription,
            source_urls: result.sourceUrls,
            source_url: result.sourceUrls[0] || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', answer.id);

        if (updateError) {
          console.error(`Error updating answer ${answer.id}:`, updateError);
          failed++;
        } else {
          enriched++;
          console.log(`Enriched answer for \"${questionText.slice(0, 30)}...\" with ${result.sourceUrls.length} sources`);
        }
      } else {
        failed++;
      }

      // Delay between calls to avoid rate limiting
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
