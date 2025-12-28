import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScheduleERecord {
  candidate_id: string;
  candidate_name: string;
  expenditure_amount: number;
  support_oppose_indicator: 'S' | 'O';
  expenditure_date: string;
  payee_name: string;
}

interface FECResponse {
  results: ScheduleERecord[];
  pagination: {
    count: number;
    pages: number;
    per_page: number;
    page: number;
    last_indexes?: {
      last_index: string;
      last_expenditure_date: string;
    };
  };
}

interface CandidateAggregate {
  candidate_id: string;
  candidate_name: string;
  support_total: number;
  oppose_total: number;
  expenditure_count: number;
  last_expenditure_date: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { committeeId, cycle = '2024' } = await req.json();

    if (!committeeId) {
      return new Response(
        JSON.stringify({ error: 'committeeId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching Schedule E expenditures for committee ${committeeId}, cycle ${cycle}`);

    const FEC_API_KEY = Deno.env.get('FEC_API_KEY');
    if (!FEC_API_KEY) {
      throw new Error('FEC_API_KEY not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // First get committee name from candidate_committees
    const { data: committee } = await supabase
      .from('candidate_committees')
      .select('name, fec_committee_id')
      .eq('fec_committee_id', committeeId)
      .single();

    const committeeName = committee?.name || committeeId;

    // Fetch Schedule E data from FEC API - paginated
    // Use the regular schedule_e endpoint and aggregate locally
    const allRecords: ScheduleERecord[] = [];
    let lastIndex: string | null = null;
    let lastDate: string | null = null;
    let page = 0;
    const maxPages = 20; // Safety limit

    while (page < maxPages) {
      let fecUrl = `https://api.open.fec.gov/v1/schedules/schedule_e/?api_key=${FEC_API_KEY}&committee_id=${committeeId}&cycle=${cycle}&per_page=100&sort=-expenditure_date`;
      
      if (lastIndex && lastDate) {
        fecUrl += `&last_index=${lastIndex}&last_expenditure_date=${lastDate}`;
      }
      
      console.log(`Fetching page ${page + 1} from FEC...`);
      
      const fecResponse = await fetch(fecUrl);
      if (!fecResponse.ok) {
        const errorText = await fecResponse.text();
        console.error(`FEC API error: ${fecResponse.status}`, errorText);
        throw new Error(`FEC API error: ${fecResponse.status} ${fecResponse.statusText}`);
      }

      const fecData: FECResponse = await fecResponse.json();
      allRecords.push(...fecData.results);
      
      console.log(`Page ${page + 1}: Got ${fecData.results.length} records (total: ${allRecords.length})`);

      // Check if there are more pages
      if (!fecData.pagination.last_indexes || fecData.results.length < 100) {
        break;
      }

      lastIndex = fecData.pagination.last_indexes.last_index;
      lastDate = fecData.pagination.last_indexes.last_expenditure_date;
      page++;
    }

    console.log(`Total Schedule E records fetched: ${allRecords.length}`);

    // Aggregate by candidate and support/oppose
    const candidateMap = new Map<string, CandidateAggregate>();

    for (const record of allRecords) {
      const key = record.candidate_id;
      if (!key) continue;

      const existing = candidateMap.get(key) || {
        candidate_id: record.candidate_id,
        candidate_name: record.candidate_name,
        support_total: 0,
        oppose_total: 0,
        expenditure_count: 0,
        last_expenditure_date: null,
      };

      const amount = Math.round(record.expenditure_amount || 0);
      if (record.support_oppose_indicator === 'S') {
        existing.support_total += amount;
      } else {
        existing.oppose_total += amount;
      }
      existing.expenditure_count++;

      if (record.expenditure_date && (!existing.last_expenditure_date || record.expenditure_date > existing.last_expenditure_date)) {
        existing.last_expenditure_date = record.expenditure_date;
      }

      candidateMap.set(key, existing);
    }

    console.log(`Aggregated to ${candidateMap.size} candidates`);

    // Map FEC candidate IDs to our internal candidate IDs
    const fecCandidateIds = [...candidateMap.keys()];
    
    const { data: candidateMappings } = await supabase
      .from('candidate_fec_ids')
      .select('candidate_id, fec_candidate_id')
      .in('fec_candidate_id', fecCandidateIds);

    const fecToInternalMap = new Map(
      (candidateMappings || []).map(m => [m.fec_candidate_id, m.candidate_id])
    );

    console.log(`Mapped ${fecToInternalMap.size} of ${fecCandidateIds.length} FEC candidate IDs to internal IDs`);

    // Prepare expenditure records (separate support/oppose rows)
    const expenditures: Array<{
      committee_id: string;
      committee_name: string;
      candidate_id: string | null;
      candidate_name: string;
      fec_candidate_id: string;
      support_oppose: string;
      total_amount: number;
      expenditure_count: number;
      last_expenditure_date: string | null;
      cycle: string;
      updated_at: string;
    }> = [];

    for (const [fecId, agg] of candidateMap) {
      const internalId = fecToInternalMap.get(fecId) || null;
      
      if (agg.support_total > 0) {
        expenditures.push({
          committee_id: committeeId,
          committee_name: committeeName,
          candidate_id: internalId,
          candidate_name: agg.candidate_name,
          fec_candidate_id: fecId,
          support_oppose: 'support',
          total_amount: agg.support_total,
          expenditure_count: agg.expenditure_count,
          last_expenditure_date: agg.last_expenditure_date,
          cycle: cycle,
          updated_at: new Date().toISOString(),
        });
      }
      
      if (agg.oppose_total > 0) {
        expenditures.push({
          committee_id: committeeId,
          committee_name: committeeName,
          candidate_id: internalId,
          candidate_name: agg.candidate_name,
          fec_candidate_id: fecId,
          support_oppose: 'oppose',
          total_amount: agg.oppose_total,
          expenditure_count: agg.expenditure_count,
          last_expenditure_date: agg.last_expenditure_date,
          cycle: cycle,
          updated_at: new Date().toISOString(),
        });
      }
    }

    // Upsert expenditure records
    if (expenditures.length > 0) {
      const { error: upsertError } = await supabase
        .from('pac_expenditures')
        .upsert(expenditures, {
          onConflict: 'committee_id,fec_candidate_id,support_oppose,cycle',
          ignoreDuplicates: false
        });

      if (upsertError) {
        console.error('Error upserting expenditures:', upsertError);
        throw upsertError;
      }
      console.log(`Upserted ${expenditures.length} expenditure records`);
    }

    // Calculate grand total for ratio calculation
    let grandTotal = 0;
    for (const agg of candidateMap.values()) {
      grandTotal += agg.support_total + agg.oppose_total;
    }

    // Prepare candidate total records with ratios (only for mapped candidates)
    const candidateTotalRecords = Array.from(candidateMap.entries())
      .filter(([fecId]) => fecToInternalMap.has(fecId))
      .map(([fecId, agg]) => {
        const total_spent = agg.support_total + agg.oppose_total;
        return {
          committee_id: committeeId,
          committee_name: committeeName,
          candidate_id: fecToInternalMap.get(fecId)!,
          candidate_name: agg.candidate_name,
          support_total: agg.support_total,
          oppose_total: agg.oppose_total,
          total_spent: total_spent,
          support_ratio: grandTotal > 0 ? parseFloat((agg.support_total / grandTotal).toFixed(4)) : 0,
          oppose_ratio: grandTotal > 0 ? parseFloat((agg.oppose_total / grandTotal).toFixed(4)) : 0,
          cycle: cycle,
          updated_at: new Date().toISOString(),
        };
      });

    // Upsert candidate totals
    if (candidateTotalRecords.length > 0) {
      const { error: totalsError } = await supabase
        .from('pac_candidate_totals')
        .upsert(candidateTotalRecords, {
          onConflict: 'committee_id,candidate_id,cycle',
          ignoreDuplicates: false
        });

      if (totalsError) {
        console.error('Error upserting candidate totals:', totalsError);
        throw totalsError;
      }
      console.log(`Upserted ${candidateTotalRecords.length} candidate total records`);
    }

    const response = {
      success: true,
      message: `Fetched ${allRecords.length} expenditure records for ${candidateMap.size} candidates`,
      stats: {
        committee_id: committeeId,
        committee_name: committeeName,
        cycle: cycle,
        raw_records: allRecords.length,
        candidates_with_expenditures: candidateMap.size,
        candidates_mapped: candidateTotalRecords.length,
        total_spent: grandTotal,
        breakdown: Array.from(candidateMap.entries()).map(([fecId, agg]) => ({
          candidate_name: agg.candidate_name,
          fec_candidate_id: fecId,
          mapped: fecToInternalMap.has(fecId),
          support: agg.support_total,
          oppose: agg.oppose_total,
          support_ratio: grandTotal > 0 ? (agg.support_total / grandTotal * 100).toFixed(1) + '%' : '0%',
          oppose_ratio: grandTotal > 0 ? (agg.oppose_total / grandTotal * 100).toFixed(1) + '%' : '0%',
        })),
      },
    };

    console.log('Response:', JSON.stringify(response, null, 2));

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error fetching PAC expenditures:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false,
        error: message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});