import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeneratedQuestion {
  questionText: string;
  options: {
    L10: string;
    L5: string;
    C: string;
    R5: string;
    R10: string;
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topicId, topicName } = await req.json();

    if (!topicId || !topicName) {
      return new Response(
        JSON.stringify({ error: 'topicId and topicName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are an expert political scientist creating quiz questions for a voter information platform.

CRITICAL ANSWER FORMAT RULES:
1. Question: Clear, direct, avoid leading language
2. Answer options: 5-12 words maximum per option
3. Use concise stance phrases starting with: "Yes—", "Support", "Oppose", "Consider carefully;", etc.
4. May include ONE brief qualifier after a dash or semicolon
5. NO full policy explanations or multi-sentence responses

Respond with valid JSON only, no markdown.`;

    const userPrompt = `Generate a quiz question about the topic "${topicName}" (ID: ${topicId}) for a political alignment quiz.

Create 5 answer options (5-12 words each):
- L10: Far-left position
- L5: Center-left position  
- C: Centrist/moderate position
- R5: Center-right position
- R10: Far-right position

EXAMPLES OF CORRECT FORMAT:
- "Yes—national database with public access and independent oversight."
- "Yes—federal database with appropriate privacy protections."
- "Consider carefully; protect officers' due process rights."
- "Oppose federal mandate; leave to states."
- "Strongly support universal coverage."
- "Support state-level programs with federal funding."

EXAMPLES OF WRONG FORMAT (too long):
- "The government should implement comprehensive regulations to ensure public safety while balancing individual rights and economic considerations."

Return JSON:
{
  "questionText": "Your question?",
  "options": {
    "L10": "5-12 word left position",
    "L5": "5-12 word center-left position",
    "C": "5-12 word centrist position",
    "R5": "5-12 word center-right position",
    "R10": "5-12 word right position"
  }
}`;

    console.log(`Generating question for topic: ${topicName} (${topicId})`);

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
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const errorText = await response.text();
      console.error(`AI gateway error: ${status}`, errorText);

      if (status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add funds to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'AI service error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('No content in AI response:', data);
      return new Response(
        JSON.stringify({ error: 'Invalid AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse the JSON response - handle potential markdown code blocks
    let parsed: GeneratedQuestion;
    try {
      // Remove markdown code blocks if present
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();

      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content, parseError);
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate the response structure
    if (!parsed.questionText || !parsed.options || 
        !parsed.options.L10 || !parsed.options.L5 || !parsed.options.C || 
        !parsed.options.R5 || !parsed.options.R10) {
      console.error('Invalid response structure:', parsed);
      return new Response(
        JSON.stringify({ error: 'AI returned incomplete response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully generated question for ${topicName}`);

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating question:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
