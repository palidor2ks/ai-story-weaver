import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { readCache, writeCache, fingerprint } from "../_shared/ai-cache.ts";

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

    const { candidateId, candidateName, topicScores, userTopicScores, matchScore, force_refresh } = await req.json();

    // Cache lookup: candidate analyses are per-user when a user score profile is provided,
    // otherwise a single shared row.
    const hasUserScores = Array.isArray(userTopicScores) && userTopicScores.length > 0;
    const fp = hasUserScores
      ? await fingerprint(
          (userTopicScores as Array<{ topicId: string; score: number }>)
            .map((t) => ({ t: t.topicId, s: Number(t.score) }))
            .sort((a, b) => a.t.localeCompare(b.t)),
        )
      : null;
    const cacheKey = {
      kind: "candidate" as const,
      subject_id: String(candidateId ?? ""),
      cycle: null,
      user_id: hasUserScores ? user.id : null,
      input_fingerprint: fp,
    };

    if (!force_refresh && cacheKey.subject_id) {
      const cached = await readCache<Record<string, unknown>>(cacheKey);
      if (cached) {
        return new Response(
          JSON.stringify({ ...cached.payload, cached: true, updated_at: cached.updated_at }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Look up authoritative candidate context (office/state/district/party) so the AI
    // does not hallucinate a different person who shares the same name.
    let candidateContext = {
      name: candidateName as string,
      office: '' as string,
      state: '' as string,
      district: '' as string,
      party: '' as string,
    };
    if (candidateId) {
      const { data: cRow } = await supabase
        .from('candidates')
        .select('name, office, state, district, party')
        .eq('id', candidateId)
        .maybeSingle();
      const { data: oRow } = await supabase
        .from('candidate_overrides')
        .select('name, office, state, district, party')
        .eq('candidate_id', candidateId)
        .eq('is_active', true)
        .maybeSingle();
      candidateContext = {
        name: oRow?.name || cRow?.name || candidateName,
        office: oRow?.office || cRow?.office || '',
        state: oRow?.state || cRow?.state || '',
        district: oRow?.district || cRow?.district || '',
        party: oRow?.party || cRow?.party || '',
      };
    }

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
- Factual and evidence-based ONLY - do not assume positions based on party affiliation
- Balanced and fair to all candidates regardless of party
- Clear and accessible to general audiences
- Based on documented positions (voting records, official statements) when available
- Honest about uncertainty - if no documented position exists, say so
${userTopicScores ? '- Personalized to show how the user\'s positions compare' : ''}

CRITICAL: Do NOT infer positions from party affiliation. Only cite what is documented.
If a candidate has a score of 0 or low confidence, acknowledge that their position is not documented.

You must respond in valid JSON format with the following structure:
{
  "summary": "2-3 sentence high-level summary of the candidate's DOCUMENTED political positions${userTopicScores ? ', mentioning alignment with the user where evidence exists' : ''}",
  "deepAnalysis": "Detailed 3-4 paragraph analysis covering documented policy positions, voting patterns, and notable stances. Be clear about what is documented vs unknown.",
  ${userTopicScores ? '"personalizedComparison": { "agreements": ["string - only where evidence exists"], "disagreements": ["string - only where evidence exists"], "overallAssessment": "string - acknowledge areas with insufficient data" },' : ''}
  "sources": [{"title": "Source name", "url": "https://example.com"}]
}

For sources, include reputable news outlets, government records, or official statements. Only cite sources you have evidence for.`;

    const todayStr = new Date().toISOString().slice(0, 10);
    const identityBlock = `
VERIFIED CANDIDATE IDENTITY (authoritative — sourced from the application's live database as of ${todayStr}):
- Name: ${candidateContext.name}
- Current Office: ${candidateContext.office || 'unknown'}
- State: ${candidateContext.state || 'unknown'}
- District: ${candidateContext.district || '(none)'}
- Party: ${candidateContext.party || 'unknown'}

GROUND TRUTH RULES:
- This identity block is verified by our database and OVERRIDES any prior knowledge you have. If your training data shows this person in a different office, defer to the office above — they have since been elected, appointed, or sworn into the Current Office listed.
- Treat the Current Office as a present-day fact. Do not deny it, hedge about it, or claim the person holds a different office.
- Only analyze THIS specific person. Do NOT write about any other public figure who happens to share this name.
- Do NOT mention a different city, state, district, or office than the ones listed above.
- For specific policy positions or votes: if you don't have documented evidence for THIS person, say "position is undocumented" — but never use that phrase to deny their Current Office, party, or state.
`;

    const userPrompt = `${identityBlock}
Analyze the political positions of ${candidateContext.name} (${candidateContext.office}${candidateContext.state ? ', ' + candidateContext.state : ''}) based on these topic scores (scale: -10 = Far Left to +10 = Far Right):

${formattedCandidateScores}
${userComparisonSection}
Provide:
1. A concise 2-3 sentence summary of their overall political positioning${userTopicScores ? ' and how they compare to the user' : ''}
2. A detailed analysis (3-4 paragraphs) covering their key stances
${userTopicScores ? '3. A personalized comparison showing specific agreements and disagreements with the user' : ''}
4. Relevant sources

Remember: be objective, non-partisan, and analyze ONLY the person identified in the EXACT CANDIDATE IDENTITY block above.${personalizedInstructions}`;

    console.log('Calling AI with personalized comparison:', !!userTopicScores);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
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

    // Parse the JSON response (robust against code fences / leading prose)
    const extractJson = (raw: string): any | null => {
      if (!raw) return null;
      let s = raw.trim();
      // Strip ```json ... ``` or ``` ... ``` fences
      const fenceMatch = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
      if (fenceMatch) s = fenceMatch[1].trim();
      try { return JSON.parse(s); } catch { /* fall through */ }
      // Slice from first { to last }
      const first = s.indexOf('{');
      const last = s.lastIndexOf('}');
      if (first !== -1 && last > first) {
        try { return JSON.parse(s.slice(first, last + 1)); } catch { /* ignore */ }
      }
      return null;
    };

    const parsed = extractJson(content);
    if (!parsed) {
      console.error('Failed to parse AI response:', content);
      return new Response(
        JSON.stringify({ error: 'AI returned an unparseable response. Please try again.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const analysis = {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      deepAnalysis: typeof parsed.deepAnalysis === 'string' ? parsed.deepAnalysis : '',
      personalizedComparison: parsed.personalizedComparison ?? undefined,
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    };

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
