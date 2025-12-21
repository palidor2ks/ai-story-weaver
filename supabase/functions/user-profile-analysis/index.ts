import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

// Party platform positions (simplified scores on -10 to +10 scale)
const PARTY_PLATFORMS = {
  Democrat: {
    healthcare: 8,
    economy: 6,
    immigration: 7,
    environment: 9,
    education: 7,
    'criminal-justice': 6,
    'civil-rights': 9,
    'gun-policy': 8,
    'social-issues': 8,
    'foreign-policy': 4,
    'government-reform': 5,
    'domestic-policy': 6,
    technology: 5,
    'electoral-reform': 7,
    'china-taiwan': 3,
    'israel-palestine': 4,
  },
  Republican: {
    healthcare: -6,
    economy: -7,
    immigration: -8,
    environment: -5,
    education: -4,
    'criminal-justice': -6,
    'civil-rights': -3,
    'gun-policy': -9,
    'social-issues': -7,
    'foreign-policy': -5,
    'government-reform': -6,
    'domestic-policy': -5,
    technology: -3,
    'electoral-reform': -4,
    'china-taiwan': -6,
    'israel-palestine': -3,
  },
  Green: {
    healthcare: 10,
    economy: 8,
    immigration: 9,
    environment: 10,
    education: 9,
    'criminal-justice': 8,
    'civil-rights': 10,
    'gun-policy': 7,
    'social-issues': 10,
    'foreign-policy': 8,
    'government-reform': 7,
    'domestic-policy': 8,
    technology: 6,
    'electoral-reform': 9,
    'china-taiwan': 5,
    'israel-palestine': 7,
  },
  Libertarian: {
    healthcare: -4,
    economy: -8,
    immigration: 5,
    environment: -2,
    education: -6,
    'criminal-justice': 4,
    'civil-rights': 7,
    'gun-policy': -10,
    'social-issues': 6,
    'foreign-policy': 6,
    'government-reform': -8,
    'domestic-policy': -7,
    technology: -5,
    'electoral-reform': 3,
    'china-taiwan': 4,
    'israel-palestine': 5,
  },
};

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
    const { overallScore, topicScores, userName } = await req.json();
    
    console.log(`Generating comprehensive profile summary for user: ${userName || 'Anonymous'}`);

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
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

    // Calculate party alignments
    const userScoresMap: Record<string, number> = {};
    topicScores.forEach((ts: { topicId: string; score: number }) => {
      userScoresMap[ts.topicId] = ts.score;
    });

    const democratAlignment = calculatePartyAlignment(userScoresMap, PARTY_PLATFORMS.Democrat);
    const republicanAlignment = calculatePartyAlignment(userScoresMap, PARTY_PLATFORMS.Republican);
    const greenAlignment = calculatePartyAlignment(userScoresMap, PARTY_PLATFORMS.Green);
    const libertarianAlignment = calculatePartyAlignment(userScoresMap, PARTY_PLATFORMS.Libertarian);

    // Format topic scores for the prompt
    const topicScoresText = topicScores
      .map((ts: { topicName: string; score: number }) => 
        `${ts.topicName}: ${ts.score > 0 ? '+' : ''}${ts.score} (${ts.score >= 5 ? 'Progressive' : ts.score <= -5 ? 'Conservative' : 'Moderate'})`)
      .join('\n');

    const systemPrompt = `You are a non-partisan political analyst providing objective summaries of political positions. 
Be balanced, factual, and avoid any partisan advocacy. Focus on explaining positions clearly without judgment.
The scoring system: -10 is most conservative, +10 is most progressive, 0 is centrist/moderate.`;

    const userPrompt = `Analyze this voter's political profile and provide a comprehensive summary.

User: ${userName || 'Voter'}
Overall Score: ${overallScore} (on a scale from -10 conservative to +10 progressive)
Democratic Party Alignment: ${democratAlignment}%
Republican Party Alignment: ${republicanAlignment}%
Green Party Alignment: ${greenAlignment}%
Libertarian Party Alignment: ${libertarianAlignment}%

Topic Scores:
${topicScoresText}

Please provide:
1. A 2-3 sentence summary of their overall political philosophy
2. 3-4 key insights about their positions (what makes them unique, any interesting patterns)
3. A brief comparison to the four major party platforms

Return your response as JSON with this exact structure:
{
  "summary": "2-3 sentence summary of political philosophy",
  "keyInsights": ["insight 1", "insight 2", "insight 3"],
  "partyComparison": "2-3 sentences comparing to all four party platforms",
  "strongestPositions": ["topic where they have strongest views", "another strong position"]
}`;

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
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limited. Please try again later.',
          summary: 'AI analysis temporarily unavailable.',
          democratAlignment,
          republicanAlignment,
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'AI credits exhausted.',
          summary: 'AI analysis unavailable.',
          democratAlignment,
          republicanAlignment,
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || '';
    
    console.log('AI response received, parsing...');

    // Try to parse JSON from response
    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = {
          summary: content.slice(0, 500),
          keyInsights: [],
          partyComparison: '',
          strongestPositions: [],
        };
      }
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      parsed = {
        summary: content.slice(0, 500),
        keyInsights: [],
        partyComparison: '',
        strongestPositions: [],
      };
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
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
