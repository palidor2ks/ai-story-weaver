import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { candidateId, candidateName, topicScores } = await req.json();

    if (!candidateName || !topicScores) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Format topic scores for the prompt
    const formattedScores = topicScores.map((ts: { topicName: string; score: number }) => {
      const direction = ts.score < 0 ? 'Left/Progressive' : ts.score > 0 ? 'Right/Conservative' : 'Centrist';
      const intensity = Math.abs(ts.score);
      return `- ${ts.topicName}: ${ts.score.toFixed(2)} (${direction}, intensity: ${intensity.toFixed(1)}/10)`;
    }).join('\n');

    const systemPrompt = `You are a non-partisan political analyst providing objective analysis of political candidates' positions. 
Your analysis should be:
- Factual and evidence-based
- Balanced and fair
- Clear and accessible to general audiences
- Include specific policy positions when known

You must respond in valid JSON format with the following structure:
{
  "summary": "2-3 sentence high-level summary of the candidate's political positioning",
  "deepAnalysis": "Detailed 3-4 paragraph analysis covering key policy positions, voting patterns, and notable stances",
  "sources": [{"title": "Source name", "url": "https://example.com"}]
}

For sources, include reputable news outlets, government records, or official statements. If you don't have specific sources, provide general reference types like "Congressional voting records" or "Campaign website".`;

    const userPrompt = `Analyze the political positions of ${candidateName} based on these topic scores (scale: -10 = Far Left to +10 = Far Right):

${formattedScores}

Provide:
1. A concise 2-3 sentence summary of their overall political positioning
2. A detailed analysis (3-4 paragraphs) covering their key stances
3. Relevant sources

Remember to be objective and non-partisan.`;

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
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse the JSON response
    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse AI response:', content);
      // Fallback if JSON parsing fails
      analysis = {
        summary: content.substring(0, 200),
        deepAnalysis: content,
        sources: [],
      };
    }

    return new Response(
      JSON.stringify(analysis),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error in ai-candidate-explanation function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
