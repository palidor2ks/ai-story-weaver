import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Declare EdgeRuntime for background tasks
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

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

// Official party platform URLs as fallbacks
const OFFICIAL_PLATFORM_URLS: Record<string, string> = {
  democrat: 'https://democrats.org/where-we-stand/party-platform/',
  republican: 'https://gop.com/platform/',
  green: 'https://gp.org/platform/',
  libertarian: 'https://lp.org/platform/',
};

// Known unreliable/broken domains to filter out
const BLOCKED_DOMAINS = [
  'republicanviews.org',
  'democraticviews.org',
  'conservapedia.com',
  'rationalwiki.org',
];

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
 * Check if a domain is in the blocked list
 */
function isBlockedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return BLOCKED_DOMAINS.some(d => hostname.includes(d));
  } catch {
    return true; // Invalid URLs are blocked
  }
}

/**
 * Validate URL is accessible with HEAD request
 */
async function validateUrl(url: string, timeout = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, { 
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow'
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Resolve Google redirect URLs to final destination
 */
async function resolveRedirectUrl(url: string): Promise<string> {
  if (!url.includes('vertexaisearch.cloud.google.com/grounding-api-redirect')) {
    return url;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, { 
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.url; // Final URL after redirects
  } catch {
    return url; // Return original if resolution fails
  }
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
  partyId: string,
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

PRIORITY SOURCES (use these first):
- Official party websites: democrats.org, gop.com, gp.org, lp.org
- Government sources: congress.gov, whitehouse.gov, .gov domains
- Major news outlets: nytimes.com, washingtonpost.com, apnews.com, reuters.com, politico.com

AVOID these unreliable sources:
- republicanviews.org, democraticviews.org (often broken/outdated)
- Partisan opinion blogs or unofficial third-party sites
- Sites with unclear authorship or no verifiable sources

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
        return researchSources(partyId, partyName, questionText, answerValue, retryCount + 1);
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
    const rawUrls: string[] = [];
    
    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web?.uri) {
          rawUrls.push(chunk.web.uri);
        }
      }
    }
    
    if (groundingMetadata?.groundingSupports) {
      for (const support of groundingMetadata.groundingSupports) {
        if (support.web?.uri) {
          rawUrls.push(support.web.uri);
        }
      }
    }

    // Deduplicate, resolve redirects, and validate URLs
    const uniqueRawUrls = [...new Set(rawUrls)].slice(0, 5);
    const validatedUrls: string[] = [];
    
    for (const rawUrl of uniqueRawUrls) {
      // Resolve Google redirect URLs
      const resolvedUrl = await resolveRedirectUrl(rawUrl);
      
      // Skip blocked domains
      if (isBlockedDomain(resolvedUrl)) {
        console.log(`Blocked domain filtered: ${resolvedUrl}`);
        continue;
      }
      
      // Validate URL is accessible
      const isValid = await validateUrl(resolvedUrl);
      if (isValid) {
        validatedUrls.push(resolvedUrl);
      } else {
        console.log(`Inaccessible URL filtered: ${resolvedUrl}`);
      }
    }
    
    // Fallback to official platform if no valid URLs found
    let finalUrls = validatedUrls;
    let finalDescription = sourceDescription;
    
    if (validatedUrls.length === 0) {
      const fallbackUrl = OFFICIAL_PLATFORM_URLS[partyId];
      if (fallbackUrl) {
        finalUrls = [fallbackUrl];
        finalDescription = `Based on official ${partyName} platform. ${sourceDescription}`.trim();
        console.log(`Using fallback URL for ${partyId}: ${fallbackUrl}`);
      }
    }
    
    // Apply text fragment to the first URL if we have a key quote
    const enhancedUrls = finalUrls.map((url, index) => {
      if (index === 0 && keyQuote) {
        return createTextFragmentUrl(url, keyQuote);
      }
      return url;
    });
    
    // Check if we found real evidence (not just "no documented position")
    const hasRealEvidence = finalDescription.length > 20 && 
      !finalDescription.toLowerCase().includes('no documented position found') &&
      enhancedUrls.length > 0;

    console.log(`Source research for "${questionText.slice(0, 40)}...": ${finalDescription.length} chars, ${enhancedUrls.length} sources, quote: "${keyQuote.slice(0, 30)}...", success: ${hasRealEvidence}`);
    
    return {
      sourceDescription: finalDescription,
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
      return researchSources(partyId, partyName, questionText, answerValue, retryCount + 1);
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

    // Process enrichment in background
    EdgeRuntime.waitUntil((async () => {
      let enriched = 0;
      let failed = 0;

      // Process answers one at a time with delay to avoid rate limits
      for (const answer of answersNeedingSources) {
        const question = answer.questions as any;
        const questionText = question?.text || '';

        // Research sources
        const result = await researchSources(partyId, partyName, questionText, answer.answer_value);

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
            console.log(`[${enriched}/${answersNeedingSources.length}] Enriched: "${questionText.slice(0, 30)}..." with ${result.sourceUrls.length} sources`);
          }
        } else {
          failed++;
          console.log(`[${enriched + failed}/${answersNeedingSources.length}] Failed to enrich: "${questionText.slice(0, 30)}..."`);
        }

        // Delay between calls to avoid rate limiting
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
