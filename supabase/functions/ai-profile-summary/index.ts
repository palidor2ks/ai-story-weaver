import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    // Validate authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    const { overallScore, topicScores } = await req.json();

    if (topicScores === undefined || topicScores.length === 0) {
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

    const overallDirection = overallScore < 0 ? 'Left/Progressive' : overallScore > 0 ? 'Right/Conservative' : 'Centrist';

    const systemPrompt = `You are a non-partisan political analyst providing objective summaries of voter political profiles. 
Your analysis should be:
- Factual and descriptive (not judgmental)
- Balanced and respectful of all political viewpoints
- Clear and accessible to general audiences
- Focused on describing positions, not advocating for them

You must respond in valid JSON format with the following structure:
{
  "summary": "2-3 sentence summary of the voter's overall political positioning and what it means",
  "keyInsights": ["insight 1", "insight 2", "insight 3"]
}

Key insights should be 3-4 bullet points highlighting notable patterns or positions.`;

    const userPrompt = `Summarize this voter's political profile based on their quiz responses.

Overall Score: ${overallScore?.toFixed(2) || '0.00'} (${overallDirection})

Topic Scores (scale: -10 = Far Left to +10 = Far Right):
${formattedScores}

Provide:
1. A concise 2-3 sentence summary of their political positioning
2. 3-4 key insights about their positions

Be objective and non-partisan. Describe, don't judge.`;

    console.log('Calling Lovable AI for profile summary...');

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
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log('AI response received:', content.substring(0, 200));

    // Parse the JSON response
    let summary;
    try {
      summary = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse AI response:', content);
      // Fallback if JSON parsing fails
      summary = {
        summary: content.substring(0, 300),
        keyInsights: [],
      };
    }

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error in ai-profile-summary function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
