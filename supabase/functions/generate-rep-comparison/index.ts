import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UserAnswer {
  question_id: string;
  value: number;
  question_text: string;
  topic_name: string;
}

interface RepAnswer {
  question_id: string;
  value: number;
  source_type: string | null;
  source_url: string | null;
  source_description: string | null;
  question_text: string;
  topic_name: string;
}

interface RequestBody {
  candidateId: string;
  candidateName: string;
  candidateParty: string;
  candidateOffice: string;
  userAnswers: UserAnswer[];
  repAnswers: RepAnswer[];
  deepAnalysis?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const body: RequestBody = await req.json();
    const { candidateId, candidateName, candidateParty, candidateOffice, userAnswers, repAnswers, deepAnalysis } = body;

    console.log(`[generate-rep-comparison] Generating ${deepAnalysis ? 'deep' : 'summary'} comparison for ${candidateName}`);
    console.log(`[generate-rep-comparison] User answers: ${userAnswers.length}, Rep answers: ${repAnswers.length}`);

    // Find overlapping questions
    const repAnswerMap = new Map(repAnswers.map(a => [a.question_id, a]));
    const sharedQuestions = userAnswers
      .filter(ua => repAnswerMap.has(ua.question_id))
      .map(ua => ({
        question_text: ua.question_text,
        topic: ua.topic_name,
        user_value: ua.value,
        rep_value: repAnswerMap.get(ua.question_id)!.value,
        rep_source_type: repAnswerMap.get(ua.question_id)!.source_type,
        rep_source_url: repAnswerMap.get(ua.question_id)!.source_url,
        rep_source_description: repAnswerMap.get(ua.question_id)!.source_description,
      }));

    console.log(`[generate-rep-comparison] Shared questions: ${sharedQuestions.length}`);

    if (sharedQuestions.length === 0) {
      return new Response(JSON.stringify({
        summary: `Not enough shared questions to compare your positions with ${candidateName}.`,
        keyAgreements: [],
        keyDisagreements: [],
        sources: [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Categorize agreements/disagreements
    const agreements: typeof sharedQuestions = [];
    const disagreements: typeof sharedQuestions = [];
    
    for (const q of sharedQuestions) {
      const userSign = Math.sign(q.user_value);
      const repSign = Math.sign(q.rep_value);
      
      // Agreement: same sign (both positive, both negative, or both neutral)
      if (userSign === repSign) {
        agreements.push(q);
      } else {
        disagreements.push(q);
      }
    }

    // Build the prompt
    const systemPrompt = `You are a nonpartisan political analyst helping voters understand how their positions compare to their elected representatives. Be concise, factual, and cite voting records or public statements when available.

When referencing a representative's position, prefer citing:
1. Specific bill votes (e.g., "H.R.1234 Climate Act")
2. Public statements or speeches
3. Policy platform positions

Always maintain a neutral, informative tone. Do not advocate for any position.`;

    const comparisonData = `
Representative: ${candidateName}
Party: ${candidateParty}
Office: ${candidateOffice}

AGREEMENTS (${agreements.length} topics where you and ${candidateName} align):
${agreements.map(a => `- Topic: ${a.topic}
  Question: "${a.question_text}"
  Both lean ${a.user_value > 0 ? 'supportive' : a.user_value < 0 ? 'opposed' : 'neutral'}
  ${a.rep_source_description ? `Source: ${a.rep_source_description}` : ''}
  ${a.rep_source_url ? `Link: ${a.rep_source_url}` : ''}`).join('\n\n')}

DISAGREEMENTS (${disagreements.length} topics where you differ):
${disagreements.map(d => `- Topic: ${d.topic}
  Question: "${d.question_text}"
  You: ${d.user_value > 0 ? 'Support' : d.user_value < 0 ? 'Oppose' : 'Neutral'}
  ${candidateName}: ${d.rep_value > 0 ? 'Support' : d.rep_value < 0 ? 'Oppose' : 'Neutral'}
  ${d.rep_source_description ? `Source: ${d.rep_source_description}` : ''}
  ${d.rep_source_url ? `Link: ${d.rep_source_url}` : ''}`).join('\n\n')}
`;

    let userPrompt: string;
    
    if (deepAnalysis) {
      userPrompt = `${comparisonData}

Based on the comparison data above, provide a detailed analysis in JSON format:

{
  "deepAnalysis": "A 2-3 paragraph detailed analysis explaining the key areas of agreement and disagreement between the user and ${candidateName}. Reference specific votes or statements where available. Explain what these differences mean for policies the user cares about.",
  "keyAgreements": ["List 2-4 specific policy areas where they agree, with brief context"],
  "keyDisagreements": ["List 2-4 specific policy areas where they disagree, with brief context"],
  "sources": [{"title": "Source title", "url": "source url if available", "type": "voting_record|statement|platform"}]
}

Only include sources that have actual URLs from the data provided. Be specific about which bills or statements support your analysis.`;
    } else {
      userPrompt = `${comparisonData}

Based on the comparison data above, provide a brief summary in JSON format:

{
  "summary": "A 1-2 sentence summary of how the user's positions compare to ${candidateName}. Highlight the most significant agreement or disagreement. Example: 'You and ${candidateName} align on healthcare and climate action, but differ on immigration policy.'",
  "keyAgreements": ["Brief 2-3 word description of each agreement area"],
  "keyDisagreements": ["Brief 2-3 word description of each disagreement area"],
  "sources": [{"title": "Source title", "url": "source url if available", "type": "voting_record|statement|platform"}]
}

Only include sources that have actual URLs from the data provided. Keep the summary conversational and accessible.`;
    }

    console.log(`[generate-rep-comparison] Calling Lovable AI Gateway...`);

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
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[generate-rep-comparison] AI Gateway error: ${response.status}`, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add funds.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;
    
    console.log(`[generate-rep-comparison] AI response received`);

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse JSON response
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error(`[generate-rep-comparison] Failed to parse AI response:`, content);
      throw new Error('Invalid AI response format');
    }

    // Filter sources to only those with valid URLs
    const validSources = (parsed.sources || []).filter((s: any) => s.url && s.url.startsWith('http'));

    const result = {
      summary: parsed.summary || `Comparison with ${candidateName} based on ${sharedQuestions.length} shared topics.`,
      deepAnalysis: parsed.deepAnalysis || null,
      keyAgreements: parsed.keyAgreements || [],
      keyDisagreements: parsed.keyDisagreements || [],
      sources: validSources,
      matchScore: Math.round((agreements.length / sharedQuestions.length) * 100),
    };

    console.log(`[generate-rep-comparison] Success - match score: ${result.matchScore}%`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[generate-rep-comparison] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
