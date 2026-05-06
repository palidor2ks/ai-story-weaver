import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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

interface NewsResearch {
  context: string;
  success: boolean;
}

const MAX_WORDS_PER_OPTION = 15;
const MAX_RETRIES = 2;
const GOOGLE_GEMINI_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function validateOptionLengths(options: GeneratedQuestion['options']): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const [key, text] of Object.entries(options)) {
    const wordCount = countWords(text);
    if (wordCount > MAX_WORDS_PER_OPTION) {
      violations.push(`${key}: ${wordCount} words ("${text.substring(0, 50)}...")`);
    }
  }
  return { valid: violations.length === 0, violations };
}

// Phase 1: Research recent news using HYBRID approach (Perplexity first, Gemini fallback)
async function researchTopicNews(topicName: string): Promise<NewsResearch> {
  // Try Perplexity first for deeper news research
  if (PERPLEXITY_API_KEY) {
    try {
      console.log(`[Perplexity] Researching news for topic: ${topicName}`);
      
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{
            role: 'user',
            content: `Find the latest U.S. political news and trending debates about "${topicName}" from the past 30 days. Include:
1. Recent headlines and controversies
2. Current legislative debates or bills
3. Recent policy announcements or court decisions
4. Trending political discussions

Provide 3-5 bullet points of factual, newsworthy angles that would make good quiz questions. Be politically neutral.`
          }],
          search_recency_filter: 'week'
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        
        if (content.length >= 50) {
          console.log(`[Perplexity] News research completed: ${content.length} chars`);
          return { context: content.slice(0, 2000), success: true };
        }
      }
    } catch (e) {
      console.error('[Perplexity] News research error:', e);
    }
  }

  // Fallback to Gemini with Google Search
  if (!GOOGLE_GEMINI_API_KEY) {
    console.log('No API keys configured for news research');
    return { context: '', success: false };
  }

  try {
    console.log(`[Gemini] Researching recent news for topic: ${topicName}`);
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Research RECENT news and trending discussions about "${topicName}" in U.S. politics from the past 30 days.

Find:
1. Recent headlines and news stories (past 30 days)
2. Current legislative debates, bills, or proposals
3. Trending social media discussions or viral political topics
4. Recent policy announcements, court decisions, or executive actions
5. Specific events, votes, or controversies

Provide a brief, factual summary (3-5 bullet points) of the most relevant and timely angles on this topic that would make good quiz questions. Focus on what's being actively debated RIGHT NOW.

Keep it politically neutral and factual.`
            }]
          }],
          tools: [{ googleSearch: {} }]
        })
      }
    );

    if (!response.ok) {
      console.error(`[Gemini] News research error: ${response.status}`);
      return { context: '', success: false };
    }

    const data = await response.json();
    const researchText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (researchText.length < 50) {
      console.log('[Gemini] Insufficient news research results');
      return { context: '', success: false };
    }
    
    console.log(`[Gemini] News research completed: ${researchText.length} chars`);
    return { context: researchText.slice(0, 2000), success: true };
    
  } catch (e) {
    console.error('[Gemini] News research error:', e);
    return { context: '', success: false };
  }
}

async function generateQuestion(
  topicId: string,
  topicName: string,
  apiKey: string,
  existingQuestions: string[] = [],
  questionType: 'generic' | 'current_events' = 'generic',
  retryCount: number = 0
): Promise<{ success: true; data: GeneratedQuestion } | { success: false; error: string; status: number }> {
  
  // Phase 1: Research recent news (only for current_events type and on first attempt)
  let newsContext = '';
  if (questionType === 'current_events' && retryCount === 0) {
    const research = await researchTopicNews(topicName);
    if (research.success) {
      newsContext = `

RECENT NEWS & TRENDING TOPICS (use these to make the question timely and relevant):
${research.context}

Generate a question that connects to these current events or debates.`;
    }
  }
  
  // Build existing questions context to prevent duplicates
  const existingQuestionsContext = existingQuestions.length > 0 
    ? `\n\nIMPORTANT - DO NOT generate questions similar to these existing ones:\n${existingQuestions.slice(0, 30).map((q, i) => `${i+1}. ${q}`).join('\n')}\n\nYour question must cover a DIFFERENT aspect of ${topicName} that is NOT already covered above.`
    : '';
  
  // Build type-specific instructions
  const typeInstruction = questionType === 'generic'
    ? `Create a TIMELESS, EVERGREEN policy question about ${topicName}.
- Focus on fundamental policy positions that don't change with news cycles
- Avoid references to specific bills, dates, current events, or recent controversies
- Examples: "Should the federal minimum wage be raised?", "Should marijuana be legalized nationwide?", "Should there be universal background checks for gun purchases?"`
    : `Create a TIMELY question tied to CURRENT political debates about ${topicName}.
- Reference specific recent legislation, proposals, or controversies when possible
- Make the question relevant to what's being actively debated RIGHT NOW
- Examples: "Should Congress pass the proposed infrastructure bill?", "Do you support the recently introduced border security measures?"
${newsContext}`;

  const systemPrompt = `You are an expert political scientist creating quiz questions for a voter information platform.

CRITICAL ANSWER FORMAT RULES:
1. Question: Clear, direct, avoid leading language
2. Answer options: 5-12 words maximum per option
3. Use concise stance phrases starting with: "Yes—", "Support", "Oppose", "Consider carefully;", etc.
4. May include ONE brief qualifier after a dash or semicolon
5. NO full policy explanations or multi-sentence responses

QUESTION TYPE INSTRUCTION:
${typeInstruction}

Respond with valid JSON only, no markdown.`;

  const retryNote = retryCount > 0 
    ? `\n\nIMPORTANT: Your previous response had answer options that were too long. Keep each answer to 5-12 words MAXIMUM.` 
    : '';

  const userPrompt = `Generate a quiz question about the topic "${topicName}" (ID: ${topicId}) for a political alignment quiz.
${existingQuestionsContext}
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
}${retryNote}`;

  console.log(`Generating question for topic: ${topicName} (${topicId})${retryCount > 0 ? ` [retry ${retryCount}]` : ''}`);

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
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
      return { success: false, error: 'Rate limit exceeded. Please try again later.', status: 429 };
    }
    if (status === 402) {
      return { success: false, error: 'AI credits exhausted. Please add funds to continue.', status: 402 };
    }
    return { success: false, error: 'AI service error', status: 500 };
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    console.error('No content in AI response:', data);
    return { success: false, error: 'Invalid AI response', status: 500 };
  }

  // Parse the JSON response - handle potential markdown code blocks or text before JSON
  let parsed: GeneratedQuestion;
  try {
    let jsonStr = content.trim();
    
    // Try to extract JSON from markdown code blocks first
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      // Try to find JSON object directly in the response (handles text before JSON)
      const jsonMatch = jsonStr.match(/\{[\s\S]*"questionText"[\s\S]*"options"[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      } else {
        // Fallback: strip markdown markers if present
        if (jsonStr.startsWith('```json')) {
          jsonStr = jsonStr.slice(7);
        } else if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.slice(3);
        }
        if (jsonStr.endsWith('```')) {
          jsonStr = jsonStr.slice(0, -3);
        }
        jsonStr = jsonStr.trim();
      }
    }
    
    parsed = JSON.parse(jsonStr);
  } catch (parseError) {
    console.error('Failed to parse AI response:', content.substring(0, 500), parseError);
    return { success: false, error: 'Failed to parse AI response', status: 500 };
  }

  // Validate the response structure
  if (!parsed.questionText || !parsed.options || 
      !parsed.options.L10 || !parsed.options.L5 || !parsed.options.C || 
      !parsed.options.R5 || !parsed.options.R10) {
    console.error('Invalid response structure:', parsed);
    return { success: false, error: 'AI returned incomplete response', status: 500 };
  }

  // Validate option lengths
  const validation = validateOptionLengths(parsed.options);
  if (!validation.valid) {
    console.warn(`Answer options too long: ${validation.violations.join('; ')}`);
    
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying generation (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
      return generateQuestion(topicId, topicName, apiKey, existingQuestions, questionType, retryCount + 1);
    } else {
      console.error(`Max retries exceeded. Using response despite length violations.`);
      // Still return the result, but log the warning
    }
  }

  console.log(`Successfully generated question for ${topicName}`);
  return { success: true, data: parsed };
}

serve(async (req) => {
  // Handle CORS preflight
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
    const { topicId, topicName, existingQuestions = [], questionType = 'generic' } = await req.json();

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

    console.log(`Generating ${questionType} question for ${topicName}, avoiding ${existingQuestions.length} existing questions`);
    const result = await generateQuestion(topicId, topicName, LOVABLE_API_KEY, existingQuestions, questionType);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: result.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(result.data),
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
