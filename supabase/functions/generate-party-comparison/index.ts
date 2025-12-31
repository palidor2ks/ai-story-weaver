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
  is_skipped?: boolean; // User marked this as "not important to me"
}

interface PartyAnswer {
  question_id: string;
  value: number;
  source_url: string | null;
  source_description: string | null;
  question_text: string;
  topic_name: string;
}

interface RequestBody {
  partyId: string;
  partyName: string;
  userAnswers: UserAnswer[];
  partyAnswers: PartyAnswer[];
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
    const { partyId, partyName, userAnswers, partyAnswers, deepAnalysis } = body;

    console.log(`[generate-party-comparison] Generating ${deepAnalysis ? 'deep' : 'summary'} comparison for ${partyName}`);
    console.log(`[generate-party-comparison] User answers: ${userAnswers.length}, Party answers: ${partyAnswers.length}`);

    // Separate skipped (not important) answers from scored answers
    const skippedAnswers = userAnswers.filter(ua => ua.is_skipped === true);
    const scoredUserAnswers = userAnswers.filter(ua => !ua.is_skipped);
    
    console.log(`[generate-party-comparison] Scored answers: ${scoredUserAnswers.length}, Skipped (not important): ${skippedAnswers.length}`);

    // Find overlapping questions (only from scored answers)
    const partyAnswerMap = new Map(partyAnswers.map(a => [a.question_id, a]));
    const sharedQuestions = scoredUserAnswers
      .filter(ua => partyAnswerMap.has(ua.question_id))
      .map(ua => ({
        question_text: ua.question_text,
        topic: ua.topic_name,
        user_value: ua.value,
        party_value: partyAnswerMap.get(ua.question_id)!.value,
        party_source_url: partyAnswerMap.get(ua.question_id)!.source_url,
        party_source_description: partyAnswerMap.get(ua.question_id)!.source_description,
      }));

    console.log(`[generate-party-comparison] Shared questions: ${sharedQuestions.length}`);

    if (sharedQuestions.length === 0) {
      return new Response(JSON.stringify({
        summary: `Not enough shared questions to compare your positions with the ${partyName}.`,
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
      const partySign = Math.sign(q.party_value);
      
      // Agreement: same sign (both positive, both negative, or both neutral)
      if (userSign === partySign) {
        agreements.push(q);
      } else {
        disagreements.push(q);
      }
    }

    // Build the prompt
    const skippedTopics = skippedAnswers.length > 0 
      ? `\n\nNote: The user marked ${skippedAnswers.length} topic(s) as "not important to me" and these are excluded from this comparison: ${[...new Set(skippedAnswers.map(a => a.topic_name))].join(', ')}.`
      : '';

    const systemPrompt = `You are a seasoned political analyst speaking directly to a client about how their views compare to political party platforms. 

Write in second person ("you", "your positions") - never say "the user" or reference "data provided."

Be conversational yet insightful, like explaining things over coffee. Reference official party platform positions naturally, e.g., "When it comes to healthcare, you and the Democrats are on the same page - their platform calls for expanding Medicare access."

Maintain neutrality - explain differences without judgment. Your goal is to help people understand where they align and where they diverge from each party's official stance.${skippedTopics}`;

    const comparisonData = `
Party: ${partyName}

AGREEMENTS (${agreements.length} topics where you and the ${partyName} align):
${agreements.map(a => `- Topic: ${a.topic}
  Question: "${a.question_text}"
  Both lean ${a.user_value > 0 ? 'supportive' : a.user_value < 0 ? 'opposed' : 'neutral'}
  ${a.party_source_description ? `Platform source: ${a.party_source_description}` : ''}
  ${a.party_source_url ? `Link: ${a.party_source_url}` : ''}`).join('\n\n')}

DISAGREEMENTS (${disagreements.length} topics where you differ):
${disagreements.map(d => `- Topic: ${d.topic}
  Question: "${d.question_text}"
  You: ${d.user_value > 0 ? 'Support' : d.user_value < 0 ? 'Oppose' : 'Neutral'}
  ${partyName}: ${d.party_value > 0 ? 'Support' : d.party_value < 0 ? 'Oppose' : 'Neutral'}
  ${d.party_source_description ? `Platform source: ${d.party_source_description}` : ''}
  ${d.party_source_url ? `Link: ${d.party_source_url}` : ''}`).join('\n\n')}
`;

    let userPrompt: string;
    
    if (deepAnalysis) {
      userPrompt = `${comparisonData}

Provide a detailed analysis in JSON format:

{
  "deepAnalysis": "A 2-3 paragraph analysis written directly to the person using 'you' and 'your'. Explain where they align with the ${partyName} platform and where they part ways. Reference official party platform positions naturally. Never say 'the user' or 'based on the data provided'. Write like a political consultant briefing a client: 'On economic issues, you and the ${partyName} are largely in sync...'",
  "keyAgreements": ["List 2-4 specific policy areas with brief context"],
  "keyDisagreements": ["List 2-4 specific policy areas with brief context"],
  "sources": [{"title": "Source title", "url": "source url if available", "type": "platform|policy_paper|official_statement"}]
}

Speak directly and conversationally. Avoid clinical language.`;
    } else {
      userPrompt = `${comparisonData}

Provide a brief comparison in JSON format:

{
  "summary": "A 1-2 sentence conversational summary speaking directly to the person. Use 'you' and 'your' - never say 'the user' or 'based on data'. Example: 'You and the ${partyName} see eye-to-eye on climate policy and healthcare access, though you're on opposite sides when it comes to gun rights.'",
  "keyAgreements": ["Brief 2-3 word description of each agreement area"],
  "keyDisagreements": ["Brief 2-3 word description of each disagreement area"],
  "sources": [{"title": "Source title", "url": "source url if available", "type": "platform|policy_paper|official_statement"}]
}

Write like you're explaining to a friend where they stand politically. Be direct and personable.`;
    }

    console.log(`[generate-party-comparison] Calling Lovable AI Gateway...`);

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
      console.error(`[generate-party-comparison] AI Gateway error: ${response.status}`, errorText);
      
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
    
    console.log(`[generate-party-comparison] AI response received`);

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse JSON response
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error(`[generate-party-comparison] Failed to parse AI response:`, content);
      throw new Error('Invalid AI response format');
    }

    // Filter sources to only those with valid URLs
    const validSources = (parsed.sources || []).filter((s: any) => s.url && s.url.startsWith('http'));

    const result = {
      summary: parsed.summary || `Looking at ${sharedQuestions.length} topics you both have positions on, here's how you compare with the ${partyName}.`,
      deepAnalysis: parsed.deepAnalysis || null,
      keyAgreements: parsed.keyAgreements || [],
      keyDisagreements: parsed.keyDisagreements || [],
      sources: validSources,
      matchScore: Math.round((agreements.length / sharedQuestions.length) * 100),
    };

    console.log(`[generate-party-comparison] Success - match score: ${result.matchScore}%`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[generate-party-comparison] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
