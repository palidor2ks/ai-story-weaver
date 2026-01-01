import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_GEMINI_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Known unreliable/broken domains to filter out
const BLOCKED_DOMAINS = [
  'republicanviews.org',
  'democraticviews.org',
  'conservapedia.com',
  'rationalwiki.org',
  // Video platforms (block iframe embedding, hard to cite specific quotes)
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'dailymotion.com',
  'tiktok.com',
  // Social media platforms (often block embedding, ephemeral content)
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
];

interface GroundingResult {
  sourceDescription: string;
  sourceUrls: string[];
  sourceTitles: string[];
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
 * Extract a clean domain name for display
 */
function extractDomainName(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    // Capitalize first letter
    return hostname.charAt(0).toUpperCase() + hostname.slice(1);
  } catch {
    return 'Source';
  }
}

/**
 * Validate URL is accessible with HEAD request, fallback to GET
 */
async function validateUrl(url: string, timeout = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    // Try HEAD first
    const response = await fetch(url, { 
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow'
    });
    
    clearTimeout(timeoutId);
    if (response.ok) return true;
    
    // Fallback to GET for servers that reject HEAD
    const controller2 = new AbortController();
    const timeoutId2 = setTimeout(() => controller2.abort(), timeout);
    
    const getResponse = await fetch(url, { 
      method: 'GET',
      signal: controller2.signal,
      redirect: 'follow'
    });
    
    clearTimeout(timeoutId2);
    return getResponse.ok && (getResponse.headers.get('content-type')?.includes('text/html') ?? true);
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
    return { sourceDescription: '', sourceUrls: [], sourceTitles: [], keyQuote: '', success: false };
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
              text: `Find official sources documenting ${candidateName}'s${officeContext}${partyContext} CURRENT position on: "${questionText}"

The candidate ${positionDesc} on this issue (score: ${answerValue} on a -10 to +10 scale).

CRITICAL RECENCY REQUIREMENTS:
- Prioritize RECENT statements and actions (2023-2025) first
- Work backwards chronologically only if recent evidence is unavailable
- For party platform references, use ONLY the latest official platform (2024)
- Avoid outdated articles from previous election cycles (2020 or earlier)

PRIORITY SOURCES (use these first):
- Government sources: congress.gov, senate.gov, house.gov, .gov domains
- Official campaign websites (current/2024 campaign)
- Major news outlets: nytimes.com, washingtonpost.com, apnews.com, reuters.com, politico.com

AVOID these unreliable sources:
- republicanviews.org, democraticviews.org (often broken/outdated)
- Partisan opinion blogs or unofficial third-party sites
- Sites with unclear authorship or no verifiable sources

Search for (in order of priority):
1. Recent voting records and bill sponsorships (current Congress)
2. Recent public statements and speeches (2023-2025)
3. Current campaign website policy positions
4. Recent press releases or interviews (last 2 years)
5. Recent legislative actions

IMPORTANT: Format your response EXACTLY as follows:
DESCRIPTION: [1-2 sentence description citing specific evidence found (bill numbers, dates, quotes)]
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
        return researchSources(candidateName, questionText, answerValue, party, office, state, retryCount + 1);
      }
      
      return { sourceDescription: '', sourceUrls: [], sourceTitles: [], keyQuote: '', success: false };
    }

    const data = await response.json();
    
    const researchText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Parse the structured response
    const descriptionMatch = researchText.match(/DESCRIPTION:\s*(.+?)(?=KEY_QUOTE:|$)/s);
    const keyQuoteMatch = researchText.match(/KEY_QUOTE:\s*"([^"]+)"/);
    
    const sourceDescription = descriptionMatch?.[1]?.trim() || researchText.slice(0, 500);
    const keyQuote = keyQuoteMatch?.[1]?.trim() || '';
    
    // Extract source URLs and titles from grounding metadata
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    const rawSources: { uri: string; title?: string }[] = [];
    
    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web?.uri) {
          rawSources.push({ uri: chunk.web.uri, title: chunk.web.title });
        }
      }
    }
    
    if (groundingMetadata?.groundingSupports) {
      for (const support of groundingMetadata.groundingSupports) {
        if (support.web?.uri) {
          rawSources.push({ uri: support.web.uri, title: support.web.title });
        }
      }
    }

    // Deduplicate by URL, resolve redirects, and validate URLs
    const seenUrls = new Set<string>();
    const validatedSources: { url: string; title: string }[] = [];
    
    for (const source of rawSources.slice(0, 5)) {
      if (seenUrls.has(source.uri)) continue;
      seenUrls.add(source.uri);
      
      // Resolve Google redirect URLs
      const resolvedUrl = await resolveRedirectUrl(source.uri);
      
      // Skip blocked domains
      if (isBlockedDomain(resolvedUrl)) {
        console.log(`Blocked domain filtered: ${resolvedUrl}`);
        continue;
      }
      
      // Validate URL is accessible
      const isValid = await validateUrl(resolvedUrl);
      if (isValid) {
        // Extract domain for display name if no title
        const displayName = source.title || extractDomainName(resolvedUrl);
        validatedSources.push({ url: resolvedUrl, title: displayName });
      } else {
        console.log(`Inaccessible URL filtered: ${resolvedUrl}`);
      }
    }
    
    // Apply text fragment to the first URL if we have a key quote
    const enhancedUrls = validatedSources.map((source, index) => {
      if (index === 0 && keyQuote) {
        return createTextFragmentUrl(source.url, keyQuote);
      }
      return source.url;
    });
    
    const sourceTitles = validatedSources.map(s => s.title);
    
    // Check if we found real evidence (not just "no documented position")
    const hasRealEvidence = sourceDescription.length > 20 && 
      !sourceDescription.toLowerCase().includes('no documented position found') &&
      enhancedUrls.length > 0;

    console.log(`Source research for "${questionText.slice(0, 40)}...": ${sourceDescription.length} chars, ${enhancedUrls.length} sources, quote: "${keyQuote.slice(0, 30)}...", success: ${hasRealEvidence}`);
    
    return {
      sourceDescription,
      sourceUrls: enhancedUrls,
      sourceTitles,
      keyQuote,
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
    
    return { sourceDescription: '', sourceUrls: [], sourceTitles: [], keyQuote: '', success: false };
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
