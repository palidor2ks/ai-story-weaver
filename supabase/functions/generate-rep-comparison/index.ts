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

// Helper to detect if source contains actual legislation citations
function hasLegislationCitation(source: string | null): boolean {
  if (!source) return false;
  // Match H.R., S., sponsored, cosponsored, bill patterns
  return /\b(H\.?R\.?\s*\d+|S\.?\s*\d+|sponsored|cosponsored|voted\s+(for|against)|bill)/i.test(source);
}

// Extract bill references from source description
function extractBillReferences(source: string | null): string[] {
  if (!source) return [];
  const matches = source.match(/\b(H\.?R\.?\s*\d+|S\.?\s*\d+)/gi) || [];
  return matches.map(m => m.replace(/\s+/g, '')); // Normalize to "H.R.1234" format
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

    // Separate skipped (not important) answers from scored answers
    const skippedAnswers = userAnswers.filter(ua => ua.is_skipped === true);
    const scoredUserAnswers = userAnswers.filter(ua => !ua.is_skipped);
    
    console.log(`[generate-rep-comparison] Scored answers: ${scoredUserAnswers.length}, Skipped (not important): ${skippedAnswers.length}`);

    // Find overlapping questions (only from scored answers)
    const repAnswerMap = new Map(repAnswers.map(a => [a.question_id, a]));
    const sharedQuestions = scoredUserAnswers
      .filter(ua => repAnswerMap.has(ua.question_id))
      .map(ua => {
        const repAnswer = repAnswerMap.get(ua.question_id)!;
        return {
          question_text: ua.question_text,
          topic: ua.topic_name,
          user_value: ua.value,
          rep_value: repAnswer.value,
          rep_source_type: repAnswer.source_type,
          rep_source_url: repAnswer.source_url,
          rep_source_description: repAnswer.source_description,
          has_voting_record: hasLegislationCitation(repAnswer.source_description),
          bill_references: extractBillReferences(repAnswer.source_description),
        };
      });

    console.log(`[generate-rep-comparison] Shared questions: ${sharedQuestions.length}`);

    // Count questions with voting record evidence
    const questionsWithVotingRecords = sharedQuestions.filter(q => q.has_voting_record);
    console.log(`[generate-rep-comparison] Questions with voting record evidence: ${questionsWithVotingRecords.length}`);

    if (sharedQuestions.length === 0) {
      return new Response(JSON.stringify({
        summary: `Not enough shared questions to compare your positions with ${candidateName}.`,
        keyAgreements: [],
        keyDisagreements: [],
        sources: [],
        votingRecordCount: 0,
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

    // Separate into voting-record-backed vs party-platform-inferred
    const agreementsWithVotes = agreements.filter(a => a.has_voting_record);
    const agreementsInferred = agreements.filter(a => !a.has_voting_record);
    const disagreementsWithVotes = disagreements.filter(d => d.has_voting_record);
    const disagreementsInferred = disagreements.filter(d => !d.has_voting_record);

    // Helper to format score in L/R format
    const formatScoreLR = (score: number): string => {
      if (score === 0) return 'C';
      const absValue = Math.abs(score);
      if (score >= -3 && score <= 3) {
        return score < 0 ? `CL${absValue}` : `CR${absValue}`;
      }
      return score < 0 ? `L${absValue}` : `R${absValue}`;
    };

    // Build the prompt with clear prioritization of voting records
    const skippedTopics = skippedAnswers.length > 0 
      ? `\n\nNote: The user marked ${skippedAnswers.length} topic(s) as "not important to me" and these are excluded from this comparison: ${[...new Set(skippedAnswers.map(a => a.topic_name))].join(', ')}.`
      : '';

    const systemPrompt = `You are a seasoned political analyst speaking directly to a client about how their views compare to their elected representatives. 

Write in second person ("you", "your positions") - never say "the user" or reference "data provided."

CRITICAL: When referencing any political scores in your analysis, ALWAYS use L/R format:
- L = Left/Progressive (e.g., L5, L10)
- R = Right/Conservative (e.g., R5, R10)
- CL = Center-Left (e.g., CL2)
- CR = Center-Right (e.g., CR2)
- C = Center

NEVER use raw numbers like +5 or -5. Always format scores as L5 or R5.

CRITICAL INSTRUCTION FOR CITING SOURCES:
- When you see "VOTING RECORD EVIDENCE" sections, you MUST cite the specific bill numbers (H.R.1234, S.567) in your analysis.
- Weave legislation references naturally into sentences, e.g., "You both support healthcare access - ${candidateName} sponsored H.R.5430 to expand coverage."
- When no voting record exists, indicate this clearly (e.g., "On this topic, no specific voting record was found").
- Do NOT assume positions based on party affiliation - only cite documented evidence.
- If a position shows as neutral/unknown (score 0), acknowledge that no documented position was found.

Be conversational yet insightful, like explaining things over coffee. Maintain strict neutrality - explain differences without judgment and never assume positions based on party.${skippedTopics}`;

    // Build structured comparison data that clearly separates voting-record-backed from inferred
    const formatQuestion = (q: typeof sharedQuestions[0], isAgreement: boolean) => {
      const stance = isAgreement
        ? `Both lean ${q.user_value > 0 ? `right (${formatScoreLR(q.user_value)})` : q.user_value < 0 ? `left (${formatScoreLR(q.user_value)})` : 'neutral (C)'}`
        : `You: ${formatScoreLR(q.user_value)}, ${candidateName}: ${formatScoreLR(q.rep_value)}`;
      
      let sourceInfo = '';
      if (q.has_voting_record && q.rep_source_description) {
        sourceInfo = `\n  📋 LEGISLATION: ${q.rep_source_description}`;
        if (q.bill_references.length > 0) {
          sourceInfo += `\n  📌 BILL NUMBERS TO CITE: ${q.bill_references.join(', ')}`;
        }
        if (q.rep_source_url) {
          sourceInfo += `\n  🔗 Source: ${q.rep_source_url}`;
        }
      } else if (q.rep_source_description) {
        sourceInfo = `\n  ℹ️ Inferred: ${q.rep_source_description}`;
      }
      
      return `- Topic: ${q.topic}
  Question: "${q.question_text}"
  ${stance}${sourceInfo}`;
    };

    let comparisonData = `
Representative: ${candidateName}
Party: ${candidateParty}
Office: ${candidateOffice}

=== VOTING RECORD EVIDENCE (CITE THESE BILLS!) ===

`;

    if (agreementsWithVotes.length > 0) {
      comparisonData += `AGREEMENTS WITH VOTING RECORD EVIDENCE (${agreementsWithVotes.length}):
${agreementsWithVotes.map(a => formatQuestion(a, true)).join('\n\n')}

`;
    }

    if (disagreementsWithVotes.length > 0) {
      comparisonData += `DISAGREEMENTS WITH VOTING RECORD EVIDENCE (${disagreementsWithVotes.length}):
${disagreementsWithVotes.map(d => formatQuestion(d, false)).join('\n\n')}

`;
    }

    comparisonData += `
=== PARTY PLATFORM / INFERRED POSITIONS ===

`;

    if (agreementsInferred.length > 0) {
      comparisonData += `AGREEMENTS (inferred from party platform) (${agreementsInferred.length}):
${agreementsInferred.map(a => formatQuestion(a, true)).join('\n\n')}

`;
    }

    if (disagreementsInferred.length > 0) {
      comparisonData += `DISAGREEMENTS (inferred from party platform) (${disagreementsInferred.length}):
${disagreementsInferred.map(d => formatQuestion(d, false)).join('\n\n')}

`;
    }

    // Add summary stats
    comparisonData += `
=== SUMMARY STATS ===
Total shared questions: ${sharedQuestions.length}
Backed by voting records: ${questionsWithVotingRecords.length}
Inferred from party platform: ${sharedQuestions.length - questionsWithVotingRecords.length}
Agreement rate: ${Math.round((agreements.length / sharedQuestions.length) * 100)}%
`;

    let userPrompt: string;
    
    if (deepAnalysis) {
      userPrompt = `${comparisonData}

Provide a detailed analysis in JSON format:

{
  "deepAnalysis": "A 2-3 paragraph analysis written directly to the person using 'you' and 'your'. PRIORITIZE discussing topics with voting record evidence and cite specific bill numbers (H.R.1234, S.567). When mentioning scores, use L/R format (L5, R3, etc). For example: 'On healthcare, you and ${candidateName} are aligned - ${candidateName} sponsored H.R.5430 which expands coverage access.' Only mention party platform positions after covering voting-record-backed positions. Never say 'the user' or 'based on the data provided'.",
  "keyAgreements": ["List 2-4 specific policy areas - include bill numbers where available, e.g., 'Healthcare (H.R.5430)'"],
  "keyDisagreements": ["List 2-4 specific policy areas - include bill numbers where available"],
  "sources": [{"title": "Source title with bill number if applicable", "url": "Congress.gov or source URL", "type": "voting_record|statement|platform"}]
}

IMPORTANT: If voting record evidence exists, you MUST reference specific bill numbers in your analysis. Use L/R format for all scores. Speak directly and conversationally.`;
    } else {
      userPrompt = `${comparisonData}

Provide a brief comparison in JSON format:

{
  "summary": "A 1-2 sentence conversational summary speaking directly to the person. Use 'you' and 'your'. If there are voting records available, mention at least one specific bill number. Use L/R format for scores (L5, R3, etc). Example: 'You and ${candidateName} align on healthcare (${candidateName} sponsored H.R.5430) and immigration, though you differ on tax policy.'",
  "keyAgreements": ["Brief description - include bill number if available, e.g., 'Healthcare (H.R.5430)'"],
  "keyDisagreements": ["Brief description - include bill number if available"],
  "sources": [{"title": "Source title", "url": "source url if available", "type": "voting_record|statement|platform"}]
}

IMPORTANT: Prioritize mentioning topics backed by voting records. Use L/R format for all scores. Be direct and personable.`;
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
      summary: parsed.summary || `Looking at ${sharedQuestions.length} topics you both have positions on, here's how you compare with ${candidateName}.`,
      deepAnalysis: parsed.deepAnalysis || null,
      keyAgreements: parsed.keyAgreements || [],
      keyDisagreements: parsed.keyDisagreements || [],
      sources: validSources,
      matchScore: Math.round((agreements.length / sharedQuestions.length) * 100),
      votingRecordCount: questionsWithVotingRecords.length,
    };

    console.log(`[generate-rep-comparison] Success - match score: ${result.matchScore}%, voting records used: ${result.votingRecordCount}`);

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
