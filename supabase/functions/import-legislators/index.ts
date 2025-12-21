import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LEGISLATORS_URL = 'https://unitedstates.github.io/congress-legislators/legislators-current.json';

interface LegislatorTerm {
  type: 'sen' | 'rep';
  start: string;
  end: string;
  state: string;
  district?: number;
  party: string;
}

interface LegislatorId {
  bioguide: string;
  govtrack?: number;
  opensecrets?: string;
  fec?: string[];
}

interface LegislatorName {
  first: string;
  last: string;
  official_full?: string;
}

interface Legislator {
  id: LegislatorId;
  name: LegislatorName;
  terms: LegislatorTerm[];
}

function mapParty(party: string): 'Democrat' | 'Republican' | 'Independent' | 'Other' {
  const partyLower = party.toLowerCase();
  if (partyLower === 'democrat' || partyLower === 'd') return 'Democrat';
  if (partyLower === 'republican' || partyLower === 'r') return 'Republican';
  if (partyLower === 'independent' || partyLower === 'i') return 'Independent';
  return 'Other';
}

function getLatestTerm(terms: LegislatorTerm[]): LegislatorTerm | null {
  if (!terms || terms.length === 0) return null;
  return terms.reduce((latest, term) => 
    new Date(term.start) > new Date(latest.start) ? term : latest
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Fetching legislators from GitHub...');
    const response = await fetch(LEGISLATORS_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch legislators: ${response.status}`);
    }

    const legislators: Legislator[] = await response.json();
    console.log(`Fetched ${legislators.length} legislators`);

    // Transform legislators to candidates format
    const candidates = legislators.map((leg) => {
      const latestTerm = getLatestTerm(leg.terms);
      if (!latestTerm) return null;

      const name = leg.name.official_full || `${leg.name.first} ${leg.name.last}`;
      const office = latestTerm.type === 'sen' ? 'Senator' : 'Representative';
      const district = latestTerm.type === 'rep' && latestTerm.district !== undefined 
        ? String(latestTerm.district) 
        : null;

      return {
        id: leg.id.bioguide,
        name,
        office,
        state: latestTerm.state,
        party: mapParty(latestTerm.party),
        district,
        is_incumbent: true,
        coverage_tier: 'tier_2' as const,
        confidence: 'medium' as const,
        answers_source: 'api',
      };
    }).filter(Boolean);

    console.log(`Prepared ${candidates.length} candidates for upsert`);

    // Upsert in batches of 50
    const batchSize = 50;
    let inserted = 0;
    let updated = 0;
    let errors: string[] = [];

    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      
      const { data, error } = await supabase
        .from('candidates')
        .upsert(batch, { 
          onConflict: 'id',
          ignoreDuplicates: false 
        })
        .select('id');

      if (error) {
        console.error(`Batch ${i / batchSize + 1} error:`, error);
        errors.push(`Batch ${i / batchSize + 1}: ${error.message}`);
      } else {
        const count = data?.length || 0;
        inserted += count;
        console.log(`Batch ${i / batchSize + 1}: Upserted ${count} candidates`);
      }
    }

    // Get final count
    const { count: totalCount } = await supabase
      .from('candidates')
      .select('*', { count: 'exact', head: true });

    // Get breakdown by office
    const { data: senatorCount } = await supabase
      .from('candidates')
      .select('id', { count: 'exact', head: true })
      .eq('office', 'Senator');

    const { data: repCount } = await supabase
      .from('candidates')
      .select('id', { count: 'exact', head: true })
      .eq('office', 'Representative');

    const result = {
      success: errors.length === 0,
      message: `Imported ${candidates.length} legislators from GitHub`,
      stats: {
        fetched: legislators.length,
        processed: candidates.length,
        totalInDatabase: totalCount,
        errors: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log('Import complete:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
