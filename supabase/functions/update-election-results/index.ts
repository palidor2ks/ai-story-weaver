import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ElectionResult {
  winner_name: string;
  party: string;
  office: string;
  state: string;
  district?: string;
  current_office?: string;
  election_date: string;
  inauguration_date: string;
  source_url?: string;
  confidence: 'high' | 'medium' | 'low';
}

interface TransitionRecord {
  official_name: string;
  current_office: string | null;
  new_office: string;
  state: string;
  district: string | null;
  party: string | null;
  election_date: string;
  inauguration_date: string;
  transition_type: string;
  source_url: string | null;
  ai_confidence: string;
  verified: boolean;
  is_active: boolean;
}

async function fetchElectionResults(states: string[]): Promise<ElectionResult[]> {
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY is not configured');
  }

  const currentYear = new Date().getFullYear();
  const prompt = `Find recent election results for the following states: ${states.join(', ')}.

Focus on:
1. Gubernatorial elections (Governor races)
2. U.S. Senate elections
3. U.S. House elections
4. Lieutenant Governor elections

For each election that occurred in ${currentYear} or ${currentYear - 1}, provide:
- Winner's full name
- Political party
- Office they were elected to
- State (2-letter code)
- District (if applicable, e.g., "11" for NJ-11)
- Their current office (if any - e.g., if a Representative won Governor race)
- Election date
- Inauguration date
- Source URL if available

Only include elections where the winner is DIFFERENT from the current incumbent OR where someone is transitioning from one office to another.`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: 'You are an expert on U.S. elections. Provide accurate, factual information about recent election results. Always include source citations when possible.'
        },
        { role: 'user', content: prompt }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'report_election_results',
            description: 'Report election results for officials who won elections',
            parameters: {
              type: 'object',
              properties: {
                results: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      winner_name: { type: 'string', description: 'Full name of the election winner' },
                      party: { type: 'string', enum: ['Democrat', 'Republican', 'Independent', 'Other'] },
                      office: { type: 'string', description: 'Office they were elected to (e.g., Governor, U.S. Senator, U.S. Representative)' },
                      state: { type: 'string', description: 'Two-letter state code' },
                      district: { type: 'string', description: 'District number if applicable' },
                      current_office: { type: 'string', description: 'Their current office before transition' },
                      election_date: { type: 'string', description: 'Election date in YYYY-MM-DD format' },
                      inauguration_date: { type: 'string', description: 'Inauguration/swearing-in date in YYYY-MM-DD format' },
                      source_url: { type: 'string', description: 'URL source for this information' },
                      confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Confidence level in this result' }
                    },
                    required: ['winner_name', 'party', 'office', 'state', 'election_date', 'inauguration_date', 'confidence']
                  }
                }
              },
              required: ['results']
            }
          }
        }
      ],
      tool_choice: { type: 'function', function: { name: 'report_election_results' } }
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    if (response.status === 402) {
      throw new Error('Payment required. Please add credits to your workspace.');
    }
    const errorText = await response.text();
    console.error('AI gateway error:', response.status, errorText);
    throw new Error('AI gateway error');
  }

  const data = await response.json();
  
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.function.name !== 'report_election_results') {
    console.error('Unexpected AI response:', data);
    return [];
  }

  try {
    const parsed = JSON.parse(toolCall.function.arguments);
    console.log(`[AI] Found ${parsed.results?.length || 0} election results`);
    return parsed.results || [];
  } catch (e) {
    console.error('Failed to parse AI response:', e);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { states } = await req.json();
    
    if (!states || !Array.isArray(states) || states.length === 0) {
      throw new Error('States array is required');
    }

    console.log(`[Update Election Results] Processing states: ${states.join(', ')}`);

    // Fetch election results from AI
    const results = await fetchElectionResults(states);
    console.log(`[AI] Received ${results.length} election results`);

    if (results.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No new election results found',
        updated: 0,
        results: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role to bypass RLS for inserting
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Convert to transition records and upsert
    const transitions: TransitionRecord[] = results.map(r => ({
      official_name: r.winner_name,
      current_office: r.current_office || null,
      new_office: r.office,
      state: r.state.toUpperCase(),
      district: r.district || null,
      party: r.party,
      election_date: r.election_date,
      inauguration_date: r.inauguration_date,
      transition_type: 'elected',
      source_url: r.source_url || null,
      ai_confidence: r.confidence,
      verified: false,
      is_active: true,
    }));

    // Check for existing records to avoid duplicates
    const existingCheck = await supabase
      .from('official_transitions')
      .select('official_name, new_office, state')
      .eq('is_active', true);

    const existing = new Set(
      (existingCheck.data || []).map(e => `${e.official_name}|${e.new_office}|${e.state}`)
    );

    const newTransitions = transitions.filter(t => 
      !existing.has(`${t.official_name}|${t.new_office}|${t.state}`)
    );

    console.log(`[DB] ${newTransitions.length} new transitions to insert (${transitions.length - newTransitions.length} duplicates skipped)`);

    let insertedCount = 0;
    if (newTransitions.length > 0) {
      const { data, error } = await supabase
        .from('official_transitions')
        .insert(newTransitions)
        .select();

      if (error) {
        console.error('[DB] Error inserting transitions:', error);
        throw error;
      }

      insertedCount = data?.length || 0;
      console.log(`[DB] Inserted ${insertedCount} transitions`);
    }

    return new Response(JSON.stringify({ 
      message: `Successfully processed ${results.length} election results`,
      updated: insertedCount,
      skipped: transitions.length - newTransitions.length,
      results: results.map(r => ({
        name: r.winner_name,
        office: r.office,
        state: r.state,
        confidence: r.confidence
      }))
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Update Election Results] Error:', errorMessage);
    
    return new Response(JSON.stringify({ 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
