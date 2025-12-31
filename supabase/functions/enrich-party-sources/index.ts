import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_GEMINI_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PARTY_NAMES: Record<string, string> = {
  democrat: 'Democratic Party',
  republican: 'Republican Party',
  green: 'Green Party',
  libertarian: 'Libertarian Party',
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
  keyQuote: string;
  success: boolean;
}

/**
 * Create a text fragment URL for deep linking to specific text on a page
 * Uses the Text Fragments API: https://web.dev/text-fragments/
 */
function createTextFragmentUrl(baseUrl: string, quote: string): string {
  if (!quote || quote.length < 10) return baseUrl;
  
  // Remove any existing fragment
  const urlWithoutFragment = baseUrl.split('#')[0];
  
  // Clean the quote: remove special chars that break URL fragments, keep essential punctuation
  const cleanQuote = quote
    .replace(/[\n\r\t]/g, ' ')  // Replace newlines/tabs with spaces
    .replace(/\s+/g, ' ')       // Collapse multiple spaces
    .trim()
    .slice(0, 80);              // Limit length for URL compatibility
  
  // Encode for URL
  const encoded = encodeURIComponent(cleanQuote);
  
  return `${urlWithoutFragment}#:~:text=${encoded}`;
}

/**
 * Research sources for an existing answer using Gemini with Google Search grounding
 */
async function researchSources(
  partyName: string,
  questionText: string,
  answerValue: number,
  retryCount = 0
): Promise<GroundingResult> {
  const maxRetries = 2;
  
  if (!GOOGLE_GEMINI_API_KEY) {
    console.log('GOOGLE_GEMINI_API_KEY not configured');
    return { sourceDescription: '', sourceUrls: [], keyQuote: '', success: false };
  }

  // Translate answer value to position description
  const positionDesc = answerValue <= -7 ? 'strongly supports progressive/left-leaning position' :
                       answerValue <= -3 ? 'leans progressive/left' :
                       answerValue >= 7 ? 'strongly supports conservative/right-leaning position' :
                       answerValue >= 3 ? 'leans conservative/right' :
                       'holds a centrist/moderate position';

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ 
            parts: [{ 
              text: `Find official sources documenting the ${partyName}'s position on: "${questionText}"

The party ${positionDesc} on this issue (score: ${answerValue} on a -10 to +10 scale).

Search for:
- Official party platform documents
- Policy statements from party leadership
- Legislative voting patterns
- Press releases or official statements

IMPORTANT: Format your response EXACTLY as follows:
DESCRIPTION: [1-2 sentence description citing specific evidence found]
KEY_QUOTE: "[A SHORT verbatim quote (10-30 words) from the most relevant source that directly evidences the position. Must be exact text that appears on the source page.]"

If no specific evidence is found, respond with:
DESCRIPTION: No documented position found.
KEY_QUOTE: ""`
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
        return researchSources(partyName, questionText, answerValue, retryCount + 1);
      }
      
      return { sourceDescription: '', sourceUrls: [], keyQuote: '', success: false };
    }

    const data = await response.json();
    
    const researchText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Parse the structured response
    const descriptionMatch = researchText.match(/DESCRIPTION:\s*(.+?)(?=KEY_QUOTE:|$)/s);
    const keyQuoteMatch = researchText.match(/KEY_QUOTE:\s*"([^"]+)"/);
    
    const sourceDescription = descriptionMatch?.[1]?.trim() || researchText.slice(0, 500);
    const keyQuote = keyQuoteMatch?.[1]?.trim() || '';
    
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
    
    // Apply text fragment to the first URL if we have a key quote
    const enhancedUrls = uniqueUrls.map((url, index) => {
      if (index === 0 && keyQuote) {
        return createTextFragmentUrl(url, keyQuote);
      }
      return url;
    });
    
    // Check if we found real evidence (not just "no documented position")
    const hasRealEvidence = sourceDescription.length > 20 && 
      !sourceDescription.toLowerCase().includes('no documented position found') &&
      enhancedUrls.length > 0;

    console.log(`Source research for "${questionText.slice(0, 40)}...": ${sourceDescription.length} chars, ${enhancedUrls.length} sources, quote: "${keyQuote.slice(0, 30)}...", success: ${hasRealEvidence}`);
    
    return {
      sourceDescription,
      sourceUrls: enhancedUrls,
      keyQuote,
      success: hasRealEvidence
    };
  } catch (e) {
    console.error('Gemini grounding error:', e);
    
    if (retryCount < maxRetries) {
      const delay = Math.pow(2, retryCount + 1) * 1000;
      console.log(`Retrying after error in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, delay));
      return researchSources(partyName, questionText, answerValue, retryCount + 1);
    }
    
    return { sourceDescription: '', sourceUrls: [], keyQuote: '', success: false };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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

    // Get answers that need sources (have answer but no valid source_urls)
    let query = supabase
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

    const { data: allAnswers, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching answers:', fetchError);
      throw fetchError;
    }

    // Filter to answers that need source enrichment
    // (no source_urls array OR empty array OR source_description contains "No documented position")
    const answersNeedingSources = (allAnswers || []).filter(a => {
      const hasNoUrls = !a.source_urls || a.source_urls.length === 0;
      const hasGenericDescription = a.source_description?.toLowerCase().includes('no documented position') ||
                                     a.source_description?.toLowerCase().includes('platform');
      
      // If topicId is specified, filter by topic
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

    let enriched = 0;
    let failed = 0;

    // Process answers one at a time with delay to avoid rate limits
    for (const answer of answersNeedingSources) {
      const question = answer.questions as any;
      const questionText = question?.text || '';
      const topicName = question?.topics?.name || '';

      // Research sources
      const result = await researchSources(partyName, questionText, answer.answer_value);

      if (result.success) {
        // Update the answer with new sources (keep existing answer_value)
        const { error: updateError } = await supabase
          .from('party_answers')
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
          console.log(`Enriched answer for "${questionText.slice(0, 30)}..." with ${result.sourceUrls.length} sources`);
        }
      } else {
        failed++;
      }

      // Delay between calls to avoid rate limiting
      await new Promise(r => setTimeout(r, 1500));
    }

    console.log(`[enrich-party-sources] Complete: ${enriched} enriched, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        party: partyName,
        partyId,
        processed: answersNeedingSources.length,
        enriched,
        failed
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[enrich-party-sources] Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
