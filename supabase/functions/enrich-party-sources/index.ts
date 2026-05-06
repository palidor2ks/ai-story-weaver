import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

// Declare EdgeRuntime for background tasks
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_GEMINI_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Rate limiting for Perplexity
let perplexityCallCount = 0;
const PERPLEXITY_BATCH_LIMIT = 25;

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
    return hostname.charAt(0).toUpperCase() + hostname.slice(1);
  } catch {
    return 'Source';
  }
}

/**
 * Smart truncation that preserves sentence/word boundaries
 */
function smartTruncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text || '';
  
  // Try to end at a sentence boundary first
  const sentenceEnd = text.slice(0, maxLength).lastIndexOf('. ');
  if (sentenceEnd > maxLength * 0.6) {
    return text.slice(0, sentenceEnd + 1);
  }
  
  // Fall back to word boundary
  const lastSpace = text.slice(0, maxLength).lastIndexOf(' ');
  if (lastSpace > maxLength * 0.7) {
    return text.slice(0, lastSpace) + '...';
  }
  
  // Last resort: hard cut with ellipsis
  return text.slice(0, maxLength - 3) + '...';
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

// =============================================================================
// PERPLEXITY RESEARCH FOR PARTY SOURCE ENRICHMENT
// =============================================================================

/**
 * Research party sources using Perplexity for faster discovery
 */
async function researchPartySourcesWithPerplexity(
  partyId: string,
  partyName: string,
  questionText: string,
  answerValue: number
): Promise<GroundingResult> {
  if (!PERPLEXITY_API_KEY) {
    return { sourceDescription: '', sourceUrls: [], sourceTitles: [], keyQuote: '', success: false };
  }

  if (perplexityCallCount >= PERPLEXITY_BATCH_LIMIT) {
    return { sourceDescription: '', sourceUrls: [], sourceTitles: [], keyQuote: '', success: false };
  }

  perplexityCallCount++;

  const partyDomains: Record<string, string[]> = {
    democrat: ['democrats.org', 'dnc.org'],
    republican: ['gop.com', 'rnc.org'],
    green: ['gp.org'],
    libertarian: ['lp.org'],
  };

  try {
    await new Promise(r => setTimeout(r, 1000));

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: `Find official ${partyName} sources documenting their position on policy questions.`
          },
          {
            role: 'user',
            content: `Find ${partyName} official sources on: "${questionText}"`
          }
        ],
        search_domain_filter: [...(partyDomains[partyId] || []), 'congress.gov', 'c-span.org'],
        search_recency_filter: 'year'
      }),
    });

    if (!response.ok) {
      return { sourceDescription: '', sourceUrls: [], sourceTitles: [], keyQuote: '', success: false };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];

    if (content.length > 50 && citations.length > 0) {
      return {
        sourceDescription: smartTruncate(content, 500),
        sourceUrls: citations.slice(0, 5),
        sourceTitles: citations.slice(0, 5).map((url: string) => extractDomainName(url)),
        keyQuote: '',
        success: true
      };
    }

    return { sourceDescription: '', sourceUrls: [], sourceTitles: [], keyQuote: '', success: false };
  } catch (e) {
    console.error('[Perplexity] Party source error:', e);
    return { sourceDescription: '', sourceUrls: [], sourceTitles: [], keyQuote: '', success: false };
  }
}

/**
 * Hybrid party source research
 */
async function hybridPartySourceResearch(
  partyId: string,
  partyName: string,
  questionText: string,
  answerValue: number
): Promise<GroundingResult> {
  const perplexityResult = await researchPartySourcesWithPerplexity(
    partyId, partyName, questionText, answerValue
  );

  if (perplexityResult.success) {
    return perplexityResult;
  }

  return researchSources(partyId, partyName, questionText, answerValue);
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
    return { sourceDescription: '', sourceUrls: [], sourceTitles: [], keyQuote: '', success: false };
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
              text: `Find official sources documenting the ${partyName}'s CURRENT position on this SPECIFIC question: "${questionText}"

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
      
      return { sourceDescription: '', sourceUrls: [], sourceTitles: [], keyQuote: '', success: false };
    }

    const data = await response.json();
    
    const researchText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Parse the structured response
    const descriptionMatch = researchText.match(/DESCRIPTION:\s*(.+?)(?=KEY_QUOTE:|$)/s);
    const keyQuoteMatch = researchText.match(/KEY_QUOTE:\s*"([^"]+)"/);
    
    const sourceDescription = descriptionMatch?.[1]?.trim() || smartTruncate(researchText, 1000);
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
        const displayName = source.title || extractDomainName(resolvedUrl);
        validatedSources.push({ url: resolvedUrl, title: displayName });
      } else {
        console.log(`Inaccessible URL filtered: ${resolvedUrl}`);
      }
    }
    
    // Fallback to official platform if no valid sources found
    let finalSources = validatedSources;
    let finalDescription = sourceDescription;
    
    if (validatedSources.length === 0) {
      const fallbackUrl = OFFICIAL_PLATFORM_URLS[partyId];
      if (fallbackUrl) {
        finalSources = [{ url: fallbackUrl, title: `${partyName} Platform` }];
        finalDescription = `Based on official ${partyName} platform. ${sourceDescription}`.trim();
        console.log(`Using fallback URL for ${partyId}: ${fallbackUrl}`);
      }
    }
    
    // Apply text fragment to the first URL if we have a key quote
    const enhancedUrls = finalSources.map((source, index) => {
      if (index === 0 && keyQuote) {
        return createTextFragmentUrl(source.url, keyQuote);
      }
      return source.url;
    });
    
    const sourceTitles = finalSources.map(s => s.title);
    
    // Check if we found real evidence (not just "no documented position")
    const hasRealEvidence = finalDescription.length > 20 && 
      !finalDescription.toLowerCase().includes('no documented position found') &&
      enhancedUrls.length > 0;

    console.log(`Source research for "${questionText.slice(0, 40)}...": ${finalDescription.length} chars, ${enhancedUrls.length} sources, quote: "${keyQuote.slice(0, 30)}...", success: ${hasRealEvidence}`);
    
    return {
      sourceDescription: finalDescription,
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
      return researchSources(partyId, partyName, questionText, answerValue, retryCount + 1);
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

        // Hybrid source research: Perplexity first, Gemini fallback
        const result = await hybridPartySourceResearch(partyId, partyName, questionText, answer.answer_value);

        if (result.success) {
          // Update the answer with new sources (keep existing answer_value)
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
