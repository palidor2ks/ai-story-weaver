import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fetch party scores from database instead of using hardcoded values
async function fetchPartyScores(supabase: any): Promise<Record<string, Record<string, number>>> {
  const partyScores: Record<string, Record<string, number>> = {
    Democrat: {},
    Republican: {},
    Green: {},
    Libertarian: {},
  };
  
  const partyIdMap: Record<string, string> = {
    democrat: 'Democrat',
    republican: 'Republican',
    green: 'Green',
    libertarian: 'Libertarian',
  };
  
  try {
    // Fetch party answers with question topic info
    const { data: partyAnswers, error } = await supabase
      .from('party_answers')
      .select(`
        party_id,
        answer_value,
        questions!inner(topic_id)
      `);
    
    if (error) {
      console.error('Error fetching party answers:', error);
      return partyScores;
    }
    
    if (!partyAnswers || partyAnswers.length === 0) {
      console.log('No party answers found in database');
      return partyScores;
    }
    
    // Group by party and topic, calculate average
    const partyTopicScores: Record<string, Record<string, { sum: number; count: number }>> = {};
    
    for (const answer of partyAnswers) {
      const partyName = partyIdMap[answer.party_id] || answer.party_id;
      const topicId = answer.questions?.topic_id;
      
      if (!topicId) continue;
      
      if (!partyTopicScores[partyName]) {
        partyTopicScores[partyName] = {};
      }
      if (!partyTopicScores[partyName][topicId]) {
        partyTopicScores[partyName][topicId] = { sum: 0, count: 0 };
      }
      
      partyTopicScores[partyName][topicId].sum += answer.answer_value;
      partyTopicScores[partyName][topicId].count += 1;
    }
    
    // Calculate averages
    for (const [party, topics] of Object.entries(partyTopicScores)) {
      partyScores[party] = {};
      for (const [topicId, data] of Object.entries(topics)) {
        partyScores[party][topicId] = data.count > 0 ? data.sum / data.count : 0;
      }
    }
    
    console.log('Fetched party scores from database');
  } catch (e) {
    console.error('Error in fetchPartyScores:', e);
  }
  
  return partyScores;
}

function calculatePartyAlignment(userScores: Record<string, number>, partyScores: Record<string, number>): number {
  const topics = Object.keys(userScores);
  if (topics.length === 0) return 50;
  
  let totalMatch = 0;
  let count = 0;
  
  for (const topic of topics) {
    if (partyScores[topic] !== undefined) {
      const userScore = userScores[topic];
      const partyScore = partyScores[topic];
      // Convert to 0-100 match percentage
      const diff = Math.abs(userScore - partyScore);
      const maxDiff = 20; // -10 to +10 range
      const match = Math.max(0, 100 - (diff / maxDiff) * 100);
      totalMatch += match;
      count++;
    }
  }
  
  return count > 0 ? Math.round(totalMatch / count) : 50;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Require authentication — this endpoint calls a paid AI gateway.
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    let { overallScore, topicScores, userName } = body ?? {};

    // Validate & clamp inputs to limit prompt-injection / abuse surface.
    if (typeof overallScore !== 'number' || !isFinite(overallScore)) overallScore = 0;
    overallScore = Math.max(-10, Math.min(10, overallScore));
    if (!Array.isArray(topicScores)) topicScores = [];
    topicScores = topicScores.slice(0, 50).map((ts: any) => ({
      topicId: String(ts?.topicId ?? '').slice(0, 100),
      topicName: String(ts?.topicName ?? '').slice(0, 100),
      score: Math.max(-10, Math.min(10, Number(ts?.score) || 0)),
    }));
    userName = typeof userName === 'string' ? userName.replace(/[\r\n]+/g, ' ').slice(0, 80) : '';
    
    console.log(`Generating comprehensive profile summary for user: ${userName || 'Anonymous'}`);

    const GOOGLE_GEMINI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GOOGLE_GEMINI_API_KEY');
    if (!GOOGLE_GEMINI_API_KEY) {
      throw new Error('No Google AI API key configured (tried GOOGLE_AI_API_KEY, GOOGLE_GEMINI_API_KEY)');
    }

    if (!topicScores || topicScores.length === 0) {
      return new Response(JSON.stringify({
        summary: 'Complete the onboarding quiz to see your political profile summary.',
        keyInsights: [],
        democratAlignment: 50,
        republicanAlignment: 50,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch party scores from database (evidence-based, not hardcoded)
    const PARTY_PLATFORMS = await fetchPartyScores(supabase);

    // Calculate party alignments
    const userScoresMap: Record<string, number> = {};
    topicScores.forEach((ts: { topicId: string; score: number }) => {
      userScoresMap[ts.topicId] = ts.score;
    });

    const democratAlignment = calculatePartyAlignment(userScoresMap, PARTY_PLATFORMS.Democrat);
    const republicanAlignment = calculatePartyAlignment(userScoresMap, PARTY_PLATFORMS.Republican);
    const greenAlignment = calculatePartyAlignment(userScoresMap, PARTY_PLATFORMS.Green);
    const libertarianAlignment = calculatePartyAlignment(userScoresMap, PARTY_PLATFORMS.Libertarian);

    // Format topic scores for the prompt with L/R format
    const formatScoreForPrompt = (score: number): string => {
      if (score === 0) return 'C (Center)';
      const absValue = Math.abs(score).toFixed(1);
      if (score >= -3 && score <= 3) {
        return score < 0 ? `CL${absValue} (Center-Left)` : `CR${absValue} (Center-Right)`;
      }
      return score < 0 ? `L${absValue} (Left)` : `R${absValue} (Right)`;
    };

    const topicScoresText = topicScores
      .map((ts: { topicName: string; score: number }) => 
        `${ts.topicName}: ${formatScoreForPrompt(ts.score)}`)
      .join('\n');

    const systemPrompt = `You are a non-partisan political analyst speaking DIRECTLY to the user about their own political profile.

VOICE RULES (CRITICAL):
- Always address the user in the SECOND PERSON ("you", "your", "you're").
- NEVER refer to the user in the third person. Do not use "this voter", "the voter", "they", "their", "this user", "the user", or the user's name as a third-person subject.
- Write like an analyst talking to the person whose profile this is, not a report about them.
- Stay balanced, factual, and non-partisan. Describe positions; do not advocate.

SCORE FORMAT (CRITICAL): When referencing scores, ALWAYS use L/R format:
- L = Left/Progressive (e.g., L5, L10)
- R = Right/Conservative (e.g., R5, R10)
- CL = Center-Left (e.g., CL2)
- CR = Center-Right (e.g., CR2)
- C = Center
NEVER use raw numbers like +5 or -5. Always use L5 or R5 format.

Base your analysis ONLY on the user's actual stated positions. Do not assume views from party alignment percentages — those are calculated comparisons, not identities.`;

    const userPrompt = `Analyze the user's political profile below and speak DIRECTLY to them about it in second person.

Overall Score: ${formatScoreForPrompt(overallScore)}
Democratic Party Alignment: ${democratAlignment}%
Republican Party Alignment: ${republicanAlignment}%
Green Party Alignment: ${greenAlignment}%
Libertarian Party Alignment: ${libertarianAlignment}%

Topic Scores:
${topicScoresText}

Provide a thorough, detailed analysis with these four sections:

1. SUMMARY (3-4 sentences): Describe their overall political philosophy based on their ACTUAL POSITIONS across all topics. Note any ideological tensions or surprising combinations. Address them as "you" ("You lean...", "Your profile shows...").

2. KEY INSIGHTS (4-5 items): Each insight should be a full sentence explaining something specific and meaningful about their positions — not just a label, but an explanation of what their score means politically. Reference specific topic scores using L/R notation. ("Your L8 score on healthcare suggests...", "You are notably more centrist on X than on Y...").

3. PARTY COMPARISON (3-4 sentences): Compare their overall profile AND specific topic areas to all four party platforms. Be precise — note where they align strongly, where they diverge, and which party is closest on each major issue area. Use percentages where helpful.

4. STRONGEST POSITIONS (3-4 items): Identify their most extreme or clearest positions (highest absolute score values). Each should be a full sentence explaining what that position means politically. ("Your strongest position is on [topic] where your [L/R score] indicates...").

VOICE: Every sentence must address the user directly ("you", "your"). NEVER write "this voter", "the voter", "they", or "their".
SCORES: Use L/R format only (e.g., "L5", "R3", "CL2"). Never raw numbers like +5 or -5.

Return ONLY a JSON object with this exact structure:
{
  "summary": "3-4 sentence overview of their political philosophy",
  "keyInsights": ["full sentence insight 1", "full sentence insight 2", "full sentence insight 3", "full sentence insight 4"],
  "partyComparison": "3-4 sentences comparing their views to all four party platforms with specific details",
  "strongestPositions": ["full sentence about strongest position 1", "full sentence about strongest position 2", "full sentence about strongest position 3"]
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048, responseMimeType: 'application/json' },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({
          error: 'Rate limited. Please try again later.',
          summary: 'AI analysis temporarily unavailable.',
          democratAlignment,
          republicanAlignment,
          greenAlignment,
          libertarianAlignment,
          fallback: true,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      throw new Error(`Gemini API error: ${response.status} — ${errorText.slice(0, 300)}`);
    }

    const aiResponse = await response.json();
    const parts: Array<{ thought?: boolean; text?: string }> =
      aiResponse?.candidates?.[0]?.content?.parts ?? [];
    const outputPart = parts.find(p => !p.thought && p.text) ?? parts[0];
    const content = outputPart?.text ?? '';
    
    console.log('AI response received, length:', content.length, 'first100:', content.slice(0, 100));

    // Parse JSON — responseMimeType:'application/json' gives clean JSON; strip fences as fallback
    let parsed;
    try {
      parsed = JSON.parse(content.trim());
    } catch (_e1) {
      try {
        const stripped = content.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
        const jsonMatch = stripped.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          console.error('No JSON object found in response:', content.slice(0, 200));
          parsed = { summary: 'Analysis temporarily unavailable. Please try again.', keyInsights: [], partyComparison: '', strongestPositions: [] };
        }
      } catch (e2) {
        console.error('Failed to parse AI response after both attempts:', e2, 'content:', content.slice(0, 200));
        parsed = { summary: 'Analysis temporarily unavailable. Please try again.', keyInsights: [], partyComparison: '', strongestPositions: [] };
      }
    }

    return new Response(JSON.stringify({
      ...parsed,
      democratAlignment,
      republicanAlignment,
      greenAlignment,
      libertarianAlignment,
      overallScore,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in user-profile-analysis function:', errorMessage);
    return new Response(JSON.stringify({
      error: errorMessage,
      summary: 'Unable to generate AI analysis at this time.',
      democratAlignment: 50,
      republicanAlignment: 50,
      greenAlignment: 50,
      libertarianAlignment: 50,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
