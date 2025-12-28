import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScheduleEByCandidate {
  candidate_id: string;
  candidate_name: string;
  total: number;
  support_oppose_indicator: 'S' | 'O';
  count: number;
}

interface FECResponse {
  results: ScheduleEByCandidate[];
  pagination: {
    count: number;
    pages: number;
    per_page: number;
    page: number;
  };
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

    // Fetch Schedule E data from FEC API - aggregated by candidate
    const fecUrl = `https://api.open.fec.gov/v1/schedules/schedule_e/by_candidate/?api_key=${FEC_API_KEY}&committee_id=${committeeId}&cycle=${cycle}&per_page=100`;
    
    console.log('Fetching from FEC:', fecUrl.replace(FEC_API_KEY, 'REDACTED'));
    
    const fecResponse = await fetch(fecUrl);
    if (!fecResponse.ok) {
      throw new Error(`FEC API error: ${fecResponse.status} ${fecResponse.statusText}`);
    }

    const fecData: FECResponse = await fecResponse.json();
    console.log(`Found ${fecData.results.length} candidate expenditure records`);

    // Map FEC candidate IDs to our internal candidate IDs
    const fecCandidateIds = [...new Set(fecData.results.map(r => r.candidate_id))];
    
    const { data: candidateMappings } = await supabase
      .from('candidate_fec_ids')
      .select('candidate_id, fec_candidate_id')
      .in('fec_candidate_id', fecCandidateIds);

    const fecToInternalMap = new Map(
      (candidateMappings || []).map(m => [m.fec_candidate_id, m.candidate_id])
    );

    console.log(`Mapped ${fecToInternalMap.size} of ${fecCandidateIds.length} FEC candidate IDs to internal IDs`);

    // Prepare expenditure records
    const expenditures = fecData.results.map(record => ({
      committee_id: committeeId,
      committee_name: committeeName,
      candidate_id: fecToInternalMap.get(record.candidate_id) || null,
      candidate_name: record.candidate_name,
      fec_candidate_id: record.candidate_id,
      support_oppose: record.support_oppose_indicator === 'S' ? 'support' : 'oppose',
      total_amount: Math.round(record.total || 0),
      expenditure_count: record.count || 0,
      cycle: cycle,
      updated_at: new Date().toISOString(),
    }));

    // Upsert expenditure records
    if (expenditures.length > 0) {
      const { error: upsertError } = await supabase
        .from('pac_expenditures')
        .upsert(expenditures, {
          onConflict: 'committee_id,candidate_id,support_oppose,cycle',
          ignoreDuplicates: false
        });

      if (upsertError) {
        console.error('Error upserting expenditures:', upsertError);
        throw upsertError;
      }
    }

    // Calculate and store pac_candidate_totals
    // Group by candidate to calculate support/oppose ratios
    const candidateTotals = new Map<string, {
      candidate_id: string | null;
      candidate_name: string;
      fec_candidate_id: string;
      support_total: number;
      oppose_total: number;
    }>();

    for (const exp of expenditures) {
      const key = exp.fec_candidate_id;
      const existing = candidateTotals.get(key) || {
        candidate_id: exp.candidate_id,
        candidate_name: exp.candidate_name,
        fec_candidate_id: exp.fec_candidate_id,
        support_total: 0,
        oppose_total: 0,
      };

      if (exp.support_oppose === 'support') {
        existing.support_total += exp.total_amount;
      } else {
        existing.oppose_total += exp.total_amount;
      }

      candidateTotals.set(key, existing);
    }

    // Calculate total spent across all candidates for ratio calculation
    let grandTotal = 0;
    for (const ct of candidateTotals.values()) {
      grandTotal += ct.support_total + ct.oppose_total;
    }

    // Prepare candidate total records with ratios
    const candidateTotalRecords = Array.from(candidateTotals.values())
      .filter(ct => ct.candidate_id) // Only include candidates we can map
      .map(ct => {
        const total_spent = ct.support_total + ct.oppose_total;
        return {
          committee_id: committeeId,
          committee_name: committeeName,
          candidate_id: ct.candidate_id!,
          candidate_name: ct.candidate_name,
          support_total: ct.support_total,
          oppose_total: ct.oppose_total,
          total_spent: total_spent,
          support_ratio: grandTotal > 0 ? parseFloat((ct.support_total / grandTotal).toFixed(4)) : 0,
          oppose_ratio: grandTotal > 0 ? parseFloat((ct.oppose_total / grandTotal).toFixed(4)) : 0,
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
    }

    const response = {
      success: true,
      message: `Fetched ${expenditures.length} expenditure records for ${candidateTotals.size} candidates`,
      stats: {
        committee_id: committeeId,
        committee_name: committeeName,
        cycle: cycle,
        expenditure_records: expenditures.length,
        candidates_with_expenditures: candidateTotals.size,
        candidates_mapped: candidateTotalRecords.length,
        total_spent: grandTotal,
        breakdown: Array.from(candidateTotals.values()).map(ct => ({
          candidate_name: ct.candidate_name,
          fec_candidate_id: ct.fec_candidate_id,
          mapped: !!ct.candidate_id,
          support: ct.support_total,
          oppose: ct.oppose_total,
          support_ratio: grandTotal > 0 ? (ct.support_total / grandTotal * 100).toFixed(1) + '%' : '0%',
          oppose_ratio: grandTotal > 0 ? (ct.oppose_total / grandTotal * 100).toFixed(1) + '%' : '0%',
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
