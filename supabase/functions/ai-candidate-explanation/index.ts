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
    const { candidateId, candidateName, topicScores, userTopicScores, matchScore } = await req.json();

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

    // Format candidate topic scores for the prompt
    const formattedCandidateScores = topicScores.map((ts: { topicName: string; score: number }) => {
      const direction = ts.score < 0 ? 'Left/Progressive' : ts.score > 0 ? 'Right/Conservative' : 'Centrist';
      const intensity = Math.abs(ts.score);
      return `- ${ts.topicName}: ${ts.score.toFixed(2)} (${direction}, intensity: ${intensity.toFixed(1)}/10)`;
    }).join('\n');

    // Format user comparison if available
    let userComparisonSection = '';
    let personalizedInstructions = '';
    
    if (userTopicScores && userTopicScores.length > 0) {
      const comparisons = topicScores.map((cs: { topicId: string; topicName: string; score: number }) => {
        const userTopic = userTopicScores.find((ut: { topicId: string }) => ut.topicId === cs.topicId);
        const userScore = userTopic?.score ?? 0;
        const diff = Math.abs(userScore - cs.score);
        const sameSign = Math.sign(userScore) === Math.sign(cs.score);
        const alignment = sameSign ? 'ALIGNED' : 'OPPOSING';
        
        return `- ${cs.topicName}: User: ${userScore.toFixed(1)}, ${candidateName}: ${cs.score.toFixed(1)} (${alignment}, diff: ${diff.toFixed(1)})`;
      }).join('\n');

      userComparisonSection = `
USER'S POSITIONS vs ${candidateName.toUpperCase()}'S POSITIONS:
Overall Match Score: ${matchScore !== undefined ? matchScore + '%' : 'Unknown'}

${comparisons}
`;

      personalizedInstructions = `

PERSONALIZED COMPARISON INSTRUCTIONS:
The user has taken a political quiz. Based on the comparison above:
1. Identify 2-3 specific topics where the user ALIGNS with ${candidateName} (same political direction)
2. Identify 2-3 specific topics where the user DIFFERS from ${candidateName} (opposing directions)
3. Provide an overall assessment of how well aligned they are

Include a "personalizedComparison" object in your JSON response with:
- "agreements": array of 2-3 strings explaining specific topic alignments (e.g., "You both support progressive environmental policies")
- "disagreements": array of 2-3 strings explaining specific topic differences (e.g., "You favor stricter gun control while they oppose restrictions")  
- "overallAssessment": one sentence summarizing how well aligned the user is with this candidate based on the ${matchScore !== undefined ? matchScore + '% match score' : 'topic comparison'}`;
    }

    const systemPrompt = `You are a non-partisan political analyst providing objective analysis of political candidates' positions. 
Your analysis should be:
- Factual and evidence-based
- Balanced and fair
- Clear and accessible to general audiences
- Include specific policy positions when known
${userTopicScores ? '- Personalized to show how the user\'s positions compare' : ''}

You must respond in valid JSON format with the following structure:
{
  "summary": "2-3 sentence high-level summary of the candidate's political positioning${userTopicScores ? ', mentioning their alignment with the user' : ''}",
  "deepAnalysis": "Detailed 3-4 paragraph analysis covering key policy positions, voting patterns, and notable stances",
  ${userTopicScores ? '"personalizedComparison": { "agreements": ["string"], "disagreements": ["string"], "overallAssessment": "string" },' : ''}
  "sources": [{"title": "Source name", "url": "https://example.com"}]
}

For sources, include reputable news outlets, government records, or official statements. If you don't have specific sources, provide general reference types like "Congressional voting records" or "Campaign website".`;

    const userPrompt = `Analyze the political positions of ${candidateName} based on these topic scores (scale: -10 = Far Left to +10 = Far Right):

${formattedCandidateScores}
${userComparisonSection}
Provide:
1. A concise 2-3 sentence summary of their overall political positioning${userTopicScores ? ' and how they compare to the user' : ''}
2. A detailed analysis (3-4 paragraphs) covering their key stances
${userTopicScores ? '3. A personalized comparison showing specific agreements and disagreements with the user' : ''}
4. Relevant sources

Remember to be objective and non-partisan.${personalizedInstructions}`;

    console.log('Calling AI with personalized comparison:', !!userTopicScores);

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

    console.log('AI analysis generated successfully, personalized:', !!analysis.personalizedComparison);

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
