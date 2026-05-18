import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

// Declare EdgeRuntime for background processing
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const GOOGLE_GEMINI_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
const YOU_API_KEY = Deno.env.get('YOU_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Rate limiting for Perplexity
let perplexityCallCount = 0;
const PERPLEXITY_BATCH_LIMIT = 30; // Max Perplexity calls per party request

// Party platform reference data - sources only, no assumed positions
const PARTY_CONTEXT = {
  democrat: {
    name: 'Democratic Party',
    officialPlatformUrl: 'https://democrats.org/where-we-stand/party-platform/',
    searchTerms: ['Democratic Party', 'DNC', 'Democrat platform'],
  },
  republican: {
    name: 'Republican Party',
    officialPlatformUrl: 'https://gop.com/platform/',
    searchTerms: ['Republican Party', 'RNC', 'GOP platform'],
  },
  green: {
    name: 'Green Party',
    officialPlatformUrl: 'https://gp.org/platform/',
    searchTerms: ['Green Party USA', 'Green Party platform'],
  },
  libertarian: {
    name: 'Libertarian Party',
    officialPlatformUrl: 'https://lp.org/platform/',
    searchTerms: ['Libertarian Party', 'LP platform'],
  },
};

interface Question {
  id: string;
  text: string;
  topic_id: string;
  topic_name: string;
}

interface PartyAnswer {
  party_id: string;
  question_id: string;
  answer_value: number;
  source_description: string;
  source_url: string | null;
  source_urls: string[];
  source_titles: string[];
  confidence: string;
  notes: string | null;
  evidence_type?: 'platform' | 'inferred_from_reps' | 'ai_inferred' | 'mixed';
  rep_voting_summary?: string;
  has_discrepancy?: boolean;
  discrepancy_note?: string;
}

interface RepConsensus {
  avgScore: number;
  count: number;
  confidence: string;
  highConfidenceCount: number;
}

interface GroundingResult {
  researchText: string;
  sourceUrls: string[];
  sourceTitles: string[];
  success: boolean;
}

// Blocked domains that should be filtered out
const BLOCKED_DOMAINS = [
  'republicanviews.org',
  'conservapedia.com',
  'thefederalistpapers.org',
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'dailymotion.com',
  'tiktok.com',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
];

function isBlockedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return BLOCKED_DOMAINS.some(d => hostname.includes(d));
  } catch {
    return false;
  }
}

function extractDomainName(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname.charAt(0).toUpperCase() + hostname.slice(1);
  } catch {
    return 'Source';
  }
}

async function resolveRedirectUrl(url: string): Promise<string> {
  if (!url.includes('vertexaisearch.cloud.google.com')) {
    return url;
  }
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return response.url || url;
  } catch {
    const match = url.match(/[?&]url=([^&]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
    return url;
  }
}

async function validateUrl(url: string, timeout = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    let response = await fetch(url, { 
      method: 'HEAD', 
      redirect: 'follow',
      signal: controller.signal 
    });
    clearTimeout(timeoutId);
    
    if (response.ok) return true;
    
    if (response.status === 405 || response.status === 403) {
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), timeout);
      response = await fetch(url, { 
        method: 'GET', 
        redirect: 'follow',
        signal: controller2.signal 
      });
      clearTimeout(timeoutId2);
      
      const contentType = response.headers.get('content-type') || '';
      return response.ok && contentType.includes('text/html');
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * PHASE 1: Query representative voting consensus for a given question and party
 * This is now the PRIMARY source - actions speak louder than words
 */
async function getRepresentativeConsensus(
  questionId: string,
  partyId: string,
  supabase: any
): Promise<RepConsensus | null> {
  const partyName = partyId === 'democrat' ? 'Democrat' 
                  : partyId === 'republican' ? 'Republican'
                  : null;
  
  if (!partyName) {
    console.log(`[RepConsensus] No rep aggregation for party: ${partyId}`);
    return null;
  }
  
  try {
    const { data, error } = await supabase
      .from('candidate_answers')
      .select(`
        answer_value,
        confidence,
        candidate_id,
        candidates!inner(party)
      `)
      .eq('question_id', questionId)
      .eq('candidates.party', partyName)
      .in('confidence', ['high', 'medium']);
    
    if (error) {
      console.error(`[RepConsensus] Query error for ${questionId}:`, error);
      return null;
    }
    
    if (!data || data.length < 10) {
      console.log(`[RepConsensus] Insufficient data for ${questionId}: ${data?.length || 0} reps (need 10+)`);
      return null;
    }
    
    const avgScore = data.reduce((sum: number, d: any) => sum + d.answer_value, 0) / data.length;
    const highConfidenceCount = data.filter((d: any) => d.confidence === 'high').length;
    
    const snappedScore = [-10, -5, 0, 5, 10].reduce((prev, curr) => 
      Math.abs(curr - avgScore) < Math.abs(prev - avgScore) ? curr : prev
    );
    
    // Strong consensus = HIGH confidence (>30% high confidence answers)
    // Weak consensus = MEDIUM confidence
    const confidence = highConfidenceCount > data.length * 0.3 ? 'high' : 'medium';
    
    console.log(`[RepConsensus] ${partyName} on ${questionId}: ${data.length} reps, avg=${avgScore.toFixed(2)}, snapped=${snappedScore}, confidence=${confidence}`);
    
    return {
      avgScore: snappedScore,
      count: data.length,
      confidence,
      highConfidenceCount
    };
  } catch (e) {
    console.error(`[RepConsensus] Error for ${questionId}:`, e);
    return null;
  }
}

function snapToValidValue(value: number): number {
  const validValues = [-10, -5, 0, 5, 10];
  return validValues.reduce((prev, curr) => 
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
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

// =============================================================================
// PERPLEXITY DEEP RESEARCH (NEW PRIMARY RESEARCH ENGINE FOR PARTIES)
// =============================================================================

interface PerplexityResult {
  found: boolean;
  researchText: string;
  citations: string[];
  citationTitles: string[];
}

interface YouResult {
  found: boolean;
  researchText: string;
  citations: string[];
  citationTitles: string[];
}

/**
 * Research party position using Perplexity's sonar-deep-research model
 * PRIMARY research engine for party platforms
 */
async function researchPartyWithPerplexity(
  partyName: string,
  questionText: string,
  topicName: string,
  partyId: string
): Promise<PerplexityResult> {
  if (!PERPLEXITY_API_KEY) {
    console.log('[Perplexity] API key not configured, skipping');
    return { found: false, researchText: '', citations: [], citationTitles: [] };
  }

  // Rate limit check
  if (perplexityCallCount >= PERPLEXITY_BATCH_LIMIT) {
    console.log('[Perplexity] Batch limit reached, falling back to Gemini');
    return { found: false, researchText: '', citations: [], citationTitles: [] };
  }

  perplexityCallCount++;

  // Get party-specific search domains
  const partyDomains: Record<string, string[]> = {
    democrat: ['democrats.org', 'dnc.org'],
    republican: ['gop.com', 'rnc.org'],
    green: ['gp.org', 'greenparty.org'],
    libertarian: ['lp.org'],
  };

  const searchDomains = [
    ...(partyDomains[partyId] || []),
    'congress.gov', 'c-span.org', 'votesmart.org'
  ];

  try {
    // 1-second delay between Perplexity calls for rate limiting
    await new Promise(r => setTimeout(r, 1000));

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-deep-research',
        messages: [
          {
            role: 'system',
            content: `You are a political research analyst finding the ${partyName}'s official position on policy questions.

PRIORITY SOURCES (in order):
1. Official 2024 party platform document sections
2. Recent policy statements from party leadership (2023-2025)
3. Party voting patterns in Congress
4. Official party website policy pages

LOOK FOR:
- Direct quotes from party platform documents
- Statements from party leadership
- Consistent voting patterns by party members
- Official position papers

OUTPUT: Provide factual evidence with specific citations. If no concrete evidence exists, clearly state "NO DOCUMENTED POSITION FOUND".`
          },
          {
            role: 'user',
            content: `Research the ${partyName}'s official position on: "${questionText}"

Topic area: ${topicName}`
          }
        ],
        search_domain_filter: searchDomains,
        search_recency_filter: 'year'
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('[Perplexity] Rate limited, falling back to Gemini');
        return { found: false, researchText: '', citations: [], citationTitles: [] };
      }
      console.error(`[Perplexity] API error: ${response.status}`);
      return { found: false, researchText: '', citations: [], citationTitles: [] };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];

    const hasEvidence = !content.toLowerCase().includes('no documented position') &&
                        !content.toLowerCase().includes('no evidence found') &&
                        content.length > 100;

    console.log(`[Perplexity] Party research for "${questionText.slice(0, 50)}...": ${hasEvidence ? 'FOUND' : 'NOT FOUND'}, ${citations.length} citations`);

    return {
      found: hasEvidence,
      researchText: hasEvidence ? smartTruncate(content, 2000) : '',
      citations: citations.slice(0, 5),
      citationTitles: citations.slice(0, 5).map((url: string) => extractDomainName(url)),
    };
  } catch (e) {
    console.error('[Perplexity] Research error:', e);
    return { found: false, researchText: '', citations: [], citationTitles: [] };
  }
}

/**
 * Research party position using You.com RAG search
 * SECONDARY research engine after Perplexity
 */
async function researchPartyWithYou(
  partyName: string,
  questionText: string,
  topicName: string,
  partyId: string
): Promise<YouResult> {
  if (!YOU_API_KEY) {
    console.log('[You.com] API key not configured, skipping');
    return { found: false, researchText: '', citations: [], citationTitles: [] };
  }

  const partyDomains: Record<string, string[]> = {
    democrat: ['democrats.org', 'dnc.org'],
    republican: ['gop.com', 'rnc.org'],
    green: ['gp.org', 'greenparty.org'],
    libertarian: ['lp.org'],
  };

  const query = `Research the ${partyName}'s current position on: "${questionText}". Topic: ${topicName}. Prioritize official party platform pages, leadership policy statements, and congressional voting evidence. Use domains when possible: ${(partyDomains[partyId] || []).join(', ') || 'official party domains'}. If no concrete evidence exists, state NO DOCUMENTED POSITION FOUND.`;

  try {
    const response = await fetch('https://api.ydc-index.io/rag', {
      method: 'POST',
      headers: {
        'X-API-Key': YOU_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, num_web_results: 8 }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('[You.com] Rate limited, falling back to Gemini');
      } else {
        console.error(`[You.com] API error: ${response.status}`);
      }
      return { found: false, researchText: '', citations: [], citationTitles: [] };
    }

    const data = await response.json();
    const answer = String(data?.answer || '').trim();
    const docs = Array.isArray(data?.search_results) ? data.search_results : [];

    const citations = docs
      .map((d: any) => String(d?.url || '').trim())
      .filter((u: string) => u.length > 0)
      .slice(0, 5);

    const citationTitles = docs
      .map((d: any) => String(d?.title || '').trim())
      .filter((t: string) => t.length > 0)
      .slice(0, 5);

    const hasEvidence = !answer.toLowerCase().includes('no documented position') &&
                        !answer.toLowerCase().includes('no evidence found') &&
                        answer.length > 100;

    console.log(`[You.com] Party research for "${questionText.slice(0, 50)}...": ${hasEvidence ? 'FOUND' : 'NOT FOUND'}, ${citations.length} citations`);

    return {
      found: hasEvidence,
      researchText: hasEvidence ? smartTruncate(answer, 2000) : '',
      citations,
      citationTitles: citationTitles.length === citations.length
        ? citationTitles
        : citations.map((url: string) => extractDomainName(url)),
    };
  } catch (e) {
    console.error('[You.com] Research error:', e);
    return { found: false, researchText: '', citations: [], citationTitles: [] };
  }
}

/**
 * Hybrid research: Try Perplexity first, then You.com, then Gemini fallback
 */
async function hybridPartyResearch(
  partyName: string,
  questionText: string,
  topicName: string,
  partyId: string
): Promise<GroundingResult> {
  // Step 1: Try Perplexity deep research first
  const perplexityResult = await researchPartyWithPerplexity(
    partyName, questionText, topicName, partyId
  );

  if (perplexityResult.found && perplexityResult.researchText.length > 100) {
    console.log(`[HybridResearch] Perplexity found party evidence for "${questionText.slice(0, 50)}..."`);
    return {
      researchText: perplexityResult.researchText,
      sourceUrls: perplexityResult.citations,
      sourceTitles: perplexityResult.citationTitles,
      success: true,
    };
  }

  // Step 2: Try You.com RAG search
  const youResult = await researchPartyWithYou(
    partyName, questionText, topicName, partyId
  );

  if (youResult.found && youResult.researchText.length > 100) {
    console.log(`[HybridResearch] You.com found party evidence for "${questionText.slice(0, 50)}..."`);
    return {
      researchText: youResult.researchText,
      sourceUrls: youResult.citations,
      sourceTitles: youResult.citationTitles,
      success: true,
    };
  }

  // Step 3: Fall back to Gemini grounded search
  console.log(`[HybridResearch] Perplexity/You.com found nothing, trying Gemini for party "${questionText.slice(0, 50)}..."`);
  return researchPartyPosition(partyName, questionText, topicName);
}

/**
 * PHASE 2: Research party position using Gemini with Google Search grounding
 * Only called for questions WITHOUT strong rep consensus
 */
async function researchPartyPosition(
  partyName: string,
  questionText: string,
  topicName: string,
  retryCount = 0
): Promise<GroundingResult> {
  const maxRetries = 2;
  
  if (!GOOGLE_GEMINI_API_KEY) {
    console.log('GOOGLE_GEMINI_API_KEY not configured, skipping web research');
    return { researchText: '', sourceUrls: [], sourceTitles: [], success: false };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ 
            parts: [{ 
              text: `Research the ${partyName}'s CURRENT position on this SPECIFIC question: "${questionText}"

CRITICAL: Only cite sources that DIRECTLY address this specific question.
Do NOT include sources that are about the general topic but don't discuss the specific issue.

RECENCY REQUIREMENTS:
- Use ONLY the LATEST official party platform (2024 or most recent available)
- Do NOT reference outdated platforms from previous election cycles (2020, 2016, etc.)
- Prioritize recent statements from party leadership (2023-2025 first)
- Work backwards chronologically only if recent evidence is unavailable

SOURCE RELEVANCE REQUIREMENTS:
- The source MUST explicitly discuss the specific issue in the question
- General topic pages that don't mention the specific issue are NOT valid sources
- If no sources directly address this question, say "No relevant sources found"

Look for (in order of priority):
1. Official 2024 party platform document sections addressing THIS question
2. Recent policy statements specifically about THIS issue (2023-2025)
3. Recent voting patterns on bills related to THIS specific issue
4. Current party positions in discourse about THIS specific question

Summarize the party's CURRENT position based on evidence that DIRECTLY addresses this question. If no sources discuss this specific issue, clearly state that.`
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
        return researchPartyPosition(partyName, questionText, topicName, retryCount + 1);
      }
      
      return { researchText: '', sourceUrls: [], sourceTitles: [], success: false };
    }

    const data = await response.json();
    const researchText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    const rawSources: { url: string; title: string }[] = [];
    
    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web?.uri) {
          rawSources.push({
            url: chunk.web.uri,
            title: chunk.web.title || ''
          });
        }
      }
    }
    
    if (groundingMetadata?.webSearchQueries) {
      console.log(`Web searches: ${groundingMetadata.webSearchQueries.join(', ')}`);
    }

    const resolvedSources: { url: string; title: string }[] = [];
    const seen = new Set<string>();
    
    for (const source of rawSources.slice(0, 8)) {
      try {
        const resolvedUrl = await resolveRedirectUrl(source.url);
        
        if (isBlockedDomain(resolvedUrl) || seen.has(resolvedUrl)) continue;
        seen.add(resolvedUrl);
        
        const isValid = await validateUrl(resolvedUrl);
        if (!isValid) {
          console.log(`Skipping invalid URL: ${resolvedUrl}`);
          continue;
        }
        
        resolvedSources.push({
          url: resolvedUrl,
          title: source.title || extractDomainName(resolvedUrl)
        });
        
        if (resolvedSources.length >= 5) break;
      } catch (e) {
        console.log(`Error processing URL ${source.url}:`, e);
      }
    }

    console.log(`Grounding research for "${questionText.slice(0, 40)}...": ${researchText.length} chars, ${resolvedSources.length} valid sources`);
    
    return {
      researchText: smartTruncate(researchText, 2000),
      sourceUrls: resolvedSources.map(s => s.url),
      sourceTitles: resolvedSources.map(s => s.title),
      success: researchText.length > 50
    };
  } catch (e) {
    console.error('Gemini grounding error:', e);
    
    if (retryCount < maxRetries) {
      const delay = Math.pow(2, retryCount + 1) * 1000;
      console.log(`Retrying after error in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, delay));
      return researchPartyPosition(partyName, questionText, topicName, retryCount + 1);
    }
    
    return { researchText: '', sourceUrls: [], sourceTitles: [], success: false };
  }
}

/**
 * PHASE 3: AI Inference as final fallback
 * Uses general party ideology when no rep data or platform exists
 */
async function inferPartyPosition(
  question: Question,
  partyId: string,
  partyContext: typeof PARTY_CONTEXT.democrat,
  relatedAnswers: PartyAnswer[]
): Promise<{ score: number; reasoning: string } | null> {
  if (!LOVABLE_API_KEY) return null;
  
  const systemPrompt = `You are a political analyst inferring a party's likely position on a topic where no explicit documentation exists.

IMPORTANT: This is an INFERENCE based on general party ideology and related positions, NOT a documented fact.

Party Context:
- Democrats typically favor: government programs, regulations, progressive social policies, environmental protection, worker protections
- Republicans typically favor: smaller government, deregulation, traditional values, free markets, states' rights
- Libertarians typically favor: minimal government, individual liberty, free markets, non-intervention
- Greens typically favor: environmental protection, social justice, grassroots democracy, peace

Scoring:
- -10 = Strong Progressive/Left (typical Democrat/Green position)
- -5 = Moderate Progressive/Left lean
- 0 = Cannot reasonably infer (truly novel or genuinely bipartisan topic)
- +5 = Moderate Conservative/Right lean
- +10 = Strong Conservative/Right (typical Republican position)

Only return 0 if you truly cannot make a reasonable inference based on general party ideology.`;

  const relatedContext = relatedAnswers.length > 0 
    ? `\nRelated positions from the same topic that were documented:\n${relatedAnswers.map(a => `- Score ${a.answer_value}: ${smartTruncate(a.source_description, 200)}`).join('\n')}`
    : '';

  const userPrompt = `Based on ${partyContext.name}'s general ideology, what would their likely position be on this question:

"${question.text}"
${relatedContext}

Return ONLY a JSON object: {"score": <-10|-5|0|5|10>, "reasoning": "<2-3 sentence explanation of WHY this party would likely hold this position, referencing their core values, guiding principles, or related policy positions they are known for>"}`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      console.error(`[AIInference] API error: ${response.status}`);
      return null;
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || '';
    
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const score = snapToValidValue(parsed.score || 0);
      const reasoning = parsed.reasoning || 'Inferred from general party ideology.';
      
      console.log(`[AIInference] ${partyId} on ${question.id}: score=${score}, reason=${reasoning}`);
      return { score, reasoning };
    }
  } catch (e) {
    console.error(`[AIInference] Error for ${question.id}:`, e);
  }
  
  return null;
}

/**
 * Score web research results for questions that need it
 */
async function scoreResearchResults(
  questions: Question[],
  partyId: string,
  partyContext: typeof PARTY_CONTEXT.democrat,
  researchResults: Map<string, GroundingResult>
): Promise<Map<string, { score: number; confidence: string; description: string }>> {
  const results = new Map<string, { score: number; confidence: string; description: string }>();
  
  if (questions.length === 0) return results;
  
  const questionsWithResearch = questions.map((q, i) => {
    const research = researchResults.get(q.id);
    let researchContext = '';
    if (research?.success && research.researchText) {
      researchContext = `\n  RESEARCH FINDINGS: ${smartTruncate(research.researchText, 800)}`;
      if (research.sourceUrls.length > 0) {
        researchContext += `\n  SOURCES: ${research.sourceUrls.join(', ')}`;
      }
    } else {
      researchContext = '\n  RESEARCH FINDINGS: No documented position found via web search.';
    }
    return `${i + 1}. [${q.id}] ${q.text}${researchContext}`;
  }).join('\n\n');

  const systemPrompt = `You are a non-partisan political analyst scoring party positions based on RESEARCH FINDINGS provided.

EVIDENCE-INFORMED SCORING APPROACH:
- Score based on ALL evidence in RESEARCH FINDINGS
- If research shows a clear directional lean, assign a score reflecting that lean
- Use 0 (neutral) ONLY when research shows genuine bipartisan agreement or truly novel topics

SCORING SCALE:
- -10 = Strong Progressive/Left position
- -5 = Moderate Progressive/Left lean
- 0 = Genuinely neutral, mixed, OR no documented position
- +5 = Moderate Conservative/Right lean
- +10 = Strong Conservative/Right position

You MUST use ONLY these exact values: -10, -5, 0, +5, or +10`;

  const userPrompt = `Score the ${partyContext.name}'s positions based on the RESEARCH FINDINGS provided.

Questions with Research:
${questionsWithResearch}

For each question, provide a JSON array with objects containing:
- question_id: EXACTLY as shown in brackets (do NOT include brackets)
- answer_value: MUST be exactly one of: -10, -5, 0, 5, or 10 (use 0 if no documented position)
- confidence: "high" (explicit statement), "medium" (inferred from evidence), "low" (no documented position)
- source_description: Affirmative position statement. Format: "[Party Name] [supports/opposes] [policy], per [source]." NO URLs. Use "No documented position found" when research shows no evidence.

Return ONLY a valid JSON array.`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      console.error(`AI Gateway error:`, response.status);
      return results;
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || '';

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const cleanedJson = jsonMatch[0]
        .replace(/:\s*\+(\d)/g, ': $1')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');
      
      const parsed = JSON.parse(cleanedJson);
      const validQuestionIds = new Set(questions.map(q => q.id));
      
      for (const item of parsed) {
        const questionId = String(item.question_id).replace(/[\[\]]/g, '');
        if (!validQuestionIds.has(questionId)) continue;
        
        const score = snapToValidValue(item.answer_value || 0);
        const confidence = item.confidence || 'medium';
        const description = item.source_description || 'No documented position';
        
        // If no valid source, force score to 0
        const hasValidSource = description && 
          !description.toLowerCase().includes('no documented') &&
          description.length > 10;
        
        results.set(questionId, {
          score: hasValidSource ? score : 0,
          confidence: hasValidSource ? confidence : 'low',
          description: hasValidSource ? description : 'No documented position found'
        });
      }
    }
  } catch (e) {
    console.error('Error scoring research results:', e);
  }
  
  return results;
}

/**
 * Main processing function with reordered evidence hierarchy:
 * 1. Rep Consensus (HIGH confidence) - actions speak louder than words
 * 2. Web Research/Platform (MEDIUM confidence) - official statements
 * 3. AI Inference (LOW confidence) - educated guess
 */
async function processQuestionsWithHierarchy(
  questions: Question[],
  partyId: string,
  partyContext: typeof PARTY_CONTEXT.democrat,
  supabase: any,
  hasGrounding: boolean
): Promise<{ answers: PartyAnswer[]; researched: number }> {
  const answers: PartyAnswer[] = [];
  const questionsNeedingResearch: Question[] = [];
  const repConsensusMap = new Map<string, RepConsensus>();
  let totalResearched = 0;

  // ============================================
  // PHASE 1: Check rep consensus for ALL questions FIRST
  // ============================================
  console.log(`[Phase1] Checking rep consensus for ${questions.length} questions...`);
  
  for (const q of questions) {
    const consensus = await getRepresentativeConsensus(q.id, partyId, supabase);
    
    if (consensus && Math.abs(consensus.avgScore) >= 3) {
      // Strong consensus found - use it as primary answer
      repConsensusMap.set(q.id, consensus);
      
      answers.push({
        party_id: partyId,
        question_id: q.id,
        answer_value: consensus.avgScore,
        source_description: `${partyContext.name} position based on voting patterns of ${consensus.count} party representatives.`,
        source_url: null,
        source_urls: [],
        source_titles: [],
        confidence: consensus.confidence, // 'high' if >30% high confidence reps, else 'medium'
        notes: `Position derived from how ${consensus.count} ${partyContext.name} representatives (${consensus.highConfidenceCount} with high confidence) voted on this issue. Actions speak louder than words.`,
        evidence_type: 'inferred_from_reps',
        rep_voting_summary: `${consensus.count} reps averaged ${consensus.avgScore > 0 ? 'Conservative' : 'Progressive'} position (${consensus.avgScore}/10).`,
        has_discrepancy: false,
        discrepancy_note: undefined,
      });
      
      console.log(`[Phase1] ${q.id}: Used rep consensus (${consensus.count} reps, score=${consensus.avgScore})`);
    } else {
      // No strong consensus - needs web research
      questionsNeedingResearch.push(q);
    }
  }

  console.log(`[Phase1] Complete: ${answers.length} from rep consensus, ${questionsNeedingResearch.length} need research`);

  // ============================================
  // PHASE 2: Hybrid Research for questions WITHOUT rep consensus
  // Perplexity first, then Gemini fallback
  // ============================================
  const hasAnyResearch = !!PERPLEXITY_API_KEY || !!GOOGLE_GEMINI_API_KEY;
  
  if (questionsNeedingResearch.length > 0 && hasAnyResearch) {
    console.log(`[Phase2] Hybrid research for ${questionsNeedingResearch.length} questions (Perplexity: ${!!PERPLEXITY_API_KEY}, Gemini: ${!!GOOGLE_GEMINI_API_KEY})`);
    
    const researchResults = new Map<string, GroundingResult>();
    
    for (const q of questionsNeedingResearch) {
      // Use hybrid research: Perplexity first, Gemini fallback
      const research = await hybridPartyResearch(partyContext.name, q.text, q.topic_name, partyId);
      researchResults.set(q.id, research);
      if (research.success) totalResearched++;
      
      // Rate limiting handled inside hybrid functions, small delay between questions
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Score the research results
    const scoredResults = await scoreResearchResults(
      questionsNeedingResearch, 
      partyId, 
      partyContext, 
      researchResults
    );
    
    const questionsNeedingInference: Question[] = [];
    
    for (const q of questionsNeedingResearch) {
      const research = researchResults.get(q.id);
      const scored = scoredResults.get(q.id);
      
      if (scored && scored.score !== 0 && scored.confidence !== 'low') {
        // Valid research result - check for discrepancy with weak rep data
        const weakConsensus = await getRepresentativeConsensus(q.id, partyId, supabase);
        
        let hasDiscrepancy = false;
        let discrepancyNote: string | undefined;
        let repVotingSummary: string | undefined;
        
        if (weakConsensus && weakConsensus.count >= 5) {
          const platformDirection = scored.score > 0 ? 1 : -1;
          const repDirection = weakConsensus.avgScore > 0 ? 1 : -1;
          
          if (platformDirection !== repDirection) {
            hasDiscrepancy = true;
            repVotingSummary = `${weakConsensus.count} reps averaged ${weakConsensus.avgScore > 0 ? 'Conservative' : 'Progressive'} (${weakConsensus.avgScore}/10).`;
            discrepancyNote = `Platform indicates ${scored.score > 0 ? 'conservative' : 'progressive'} stance, but ${weakConsensus.count} representatives vote ${weakConsensus.avgScore > 0 ? 'conservatively' : 'progressively'}.`;
            console.log(`[Phase2] Discrepancy detected for ${q.id}: platform=${scored.score}, reps=${weakConsensus.avgScore}`);
          }
        }
        
        answers.push({
          party_id: partyId,
          question_id: q.id,
          answer_value: scored.score,
          source_description: scored.description,
          source_url: research?.sourceUrls?.[0] || partyContext.officialPlatformUrl,
          source_urls: research?.sourceUrls || [],
          source_titles: research?.sourceTitles || [],
          confidence: 'medium', // Platform/research always medium
          notes: null,
          evidence_type: hasDiscrepancy ? 'mixed' : 'platform',
          rep_voting_summary: repVotingSummary,
          has_discrepancy: hasDiscrepancy,
          discrepancy_note: discrepancyNote,
        });
        
        console.log(`[Phase2] ${q.id}: Used web research (score=${scored.score})`);
      } else {
        // No valid research - needs AI inference
        questionsNeedingInference.push(q);
      }
    }

    // ============================================
    // PHASE 3: AI Inference for remaining questions
    // ============================================
    if (questionsNeedingInference.length > 0) {
      console.log(`[Phase3] AI inference for ${questionsNeedingInference.length} questions...`);
      
      // Get related answered questions for context
      const answeredByTopic = new Map<string, PartyAnswer[]>();
      for (const a of answers) {
        const q = questions.find(q => q.id === a.question_id);
        if (q && a.answer_value !== 0) {
          const existing = answeredByTopic.get(q.topic_id) || [];
          existing.push(a);
          answeredByTopic.set(q.topic_id, existing);
        }
      }
      
      for (const q of questionsNeedingInference) {
        const relatedAnswers = answeredByTopic.get(q.topic_id) || [];
        const inference = await inferPartyPosition(q, partyId, partyContext, relatedAnswers);
        
        if (inference && inference.score !== 0) {
          answers.push({
            party_id: partyId,
            question_id: q.id,
            answer_value: inference.score,
            source_description: `${partyContext.name} position inferred from general party ideology. ${inference.reasoning}`,
            source_url: null,
            source_urls: [],
            source_titles: [],
            confidence: 'low', // AI inference is always low confidence
            notes: 'No official documentation or voting record found. Position estimated from general party ideology and related stances.',
            evidence_type: 'ai_inferred',
            rep_voting_summary: undefined,
            has_discrepancy: false,
            discrepancy_note: undefined,
          });
          
          console.log(`[Phase3] ${q.id}: AI inferred (score=${inference.score})`);
        } else {
          // Truly no position can be determined
          answers.push({
            party_id: partyId,
            question_id: q.id,
            answer_value: 0,
            source_description: 'No documented position found',
            source_url: null,
            source_urls: [],
            source_titles: [],
            confidence: 'low',
            notes: 'No official documentation, voting record, or reasonable ideological inference available.',
            evidence_type: undefined,
            rep_voting_summary: undefined,
            has_discrepancy: false,
            discrepancy_note: undefined,
          });
          
          console.log(`[Phase3] ${q.id}: No position determinable`);
        }
        
        // Small delay between inference calls
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  } else if (questionsNeedingResearch.length > 0) {
    // No grounding available - go straight to AI inference
    console.log(`[Phase3] No grounding, AI inference for ${questionsNeedingResearch.length} questions...`);
    
    for (const q of questionsNeedingResearch) {
      const inference = await inferPartyPosition(q, partyId, partyContext, []);
      
      if (inference && inference.score !== 0) {
        answers.push({
          party_id: partyId,
          question_id: q.id,
          answer_value: inference.score,
          source_description: `${partyContext.name} position inferred from general party ideology. ${inference.reasoning}`,
          source_url: null,
          source_urls: [],
          source_titles: [],
          confidence: 'low',
          notes: 'No official documentation or voting record found. Position estimated from general party ideology.',
          evidence_type: 'ai_inferred',
          rep_voting_summary: undefined,
          has_discrepancy: false,
          discrepancy_note: undefined,
        });
      } else {
        answers.push({
          party_id: partyId,
          question_id: q.id,
          answer_value: 0,
          source_description: 'No documented position found',
          source_url: null,
          source_urls: [],
          source_titles: [],
          confidence: 'low',
          notes: null,
          evidence_type: undefined,
          rep_voting_summary: undefined,
          has_discrepancy: false,
          discrepancy_note: undefined,
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`Processing complete: ${answers.length} total answers, ${totalResearched} researched`);
  return { answers, researched: totalResearched };
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
    const { topicId, partyId, questionId, batchSize = 10, skipExisting = true } = await req.json();

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    if (!partyId) {
      return new Response(JSON.stringify({ 
        error: 'partyId is required. Process one party at a time to avoid timeouts.',
        validParties: ['democrat', 'republican', 'green', 'libertarian']
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const partyContext = PARTY_CONTEXT[partyId as keyof typeof PARTY_CONTEXT];
    if (!partyContext) {
      return new Response(JSON.stringify({ 
        error: `Invalid partyId: ${partyId}`,
        validParties: ['democrat', 'republican', 'green', 'libertarian']
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const hasGrounding = !!GOOGLE_GEMINI_API_KEY;
    console.log(`Starting party answers generation for ${partyContext.name}, skipExisting=${skipExisting}, grounding=${hasGrounding}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Build query for questions
    let query = supabase
      .from('questions')
      .select('id, text, topic_id, topics(name)')
      .order('topic_id')
      .order('id');

    if (questionId) {
      query = query.eq('id', questionId);
    } else if (topicId) {
      query = query.eq('topic_id', topicId);
    }

    const { data: questions, error: questionsError } = await query;
    if (questionsError) throw questionsError;

    if (!questions || questions.length === 0) {
      return new Response(JSON.stringify({ message: 'No questions found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let formattedQuestions: Question[] = questions.map(q => ({
      id: q.id,
      text: q.text,
      topic_id: q.topic_id,
      topic_name: (q.topics as any)?.name || q.topic_id,
    }));

    console.log(`Found ${formattedQuestions.length} total questions`);

    if (skipExisting) {
      const { data: existingAnswers, error: existingError } = await supabase
        .from('party_answers')
        .select('question_id')
        .eq('party_id', partyId);

      if (existingError) {
        console.error('Error fetching existing answers:', existingError);
      } else if (existingAnswers && existingAnswers.length > 0) {
        const existingQuestionIds = new Set(existingAnswers.map(a => a.question_id));
        const originalCount = formattedQuestions.length;
        formattedQuestions = formattedQuestions.filter(q => !existingQuestionIds.has(q.id));
        console.log(`Skipping ${originalCount - formattedQuestions.length} questions with existing answers`);
      }
    }

    if (formattedQuestions.length === 0) {
      console.log(`All questions already have answers for ${partyContext.name}`);
      return new Response(JSON.stringify({
        success: true,
        message: `All questions already have answers for ${partyContext.name}`,
        questionsProcessed: 0,
        party: partyContext.name,
        skipped: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing ${formattedQuestions.length} questions for ${partyContext.name}...`);

    // Run processing in background to avoid 150s idle timeout
    const backgroundWork = async () => {
      let totalInserted = 0;
      let totalErrors = 0;
      let totalResearched = 0;

      for (let i = 0; i < formattedQuestions.length; i += batchSize) {
        const batch = formattedQuestions.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(formattedQuestions.length / batchSize);
        console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} questions)`);

        try {
          const { answers, researched } = await processQuestionsWithHierarchy(
            batch,
            partyId,
            partyContext,
            supabase,
            hasGrounding
          );
          
          totalResearched += researched;

          if (answers.length > 0) {
            const { error: upsertError } = await supabase
              .from('party_answers')
              .upsert(answers, { 
                onConflict: 'party_id,question_id',
                ignoreDuplicates: false 
              });

            if (upsertError) {
              console.error(`Upsert error:`, upsertError);
              totalErrors += batch.length;
            } else {
              totalInserted += answers.length;
              console.log(`Inserted ${answers.length} answers (total: ${totalInserted})`);
            }
          }
        } catch (batchError) {
          console.error(`Batch error:`, batchError);
          totalErrors += batch.length;
        }

        if (i + batchSize < formattedQuestions.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`Population complete for ${partyContext.name}: ${totalInserted} inserted, ${totalErrors} errors, ${totalResearched} researched`);
    };

    // Use EdgeRuntime.waitUntil to process in background
    EdgeRuntime.waitUntil(backgroundWork());

    // Return immediately so the request doesn't hit the 150s idle timeout
    return new Response(JSON.stringify({
      success: true,
      party: partyContext.name,
      partyId,
      questionsToProcess: formattedQuestions.length,
      status: 'processing_in_background',
      message: `Started background processing of ${formattedQuestions.length} questions for ${partyContext.name}. Check logs for progress.`,
      hasGrounding,
      evidenceHierarchy: ['inferred_from_reps (HIGH)', 'platform (MEDIUM)', 'ai_inferred (LOW)'],
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      details: String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
