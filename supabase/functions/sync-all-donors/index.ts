import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { cycle = '2024', limit = 50 } = await req.json().catch(() => ({}));
    
    console.log('[SYNC-ALL-DONORS] Starting batch donor sync for cycle:', cycle);

    // Get all candidates with FEC IDs
    const { data: candidates, error: fetchError } = await supabase
      .from('candidates')
      .select('id, name, fec_candidate_id, last_donor_sync')
      .not('fec_candidate_id', 'is', null)
      .order('last_donor_sync', { ascending: true, nullsFirst: true })
      .limit(limit);

    if (fetchError) {
      console.error('[SYNC-ALL-DONORS] Error fetching candidates:', fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[SYNC-ALL-DONORS] Found', candidates?.length || 0, 'candidates with FEC IDs');

    if (!candidates || candidates.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          processed: 0, 
          message: 'No candidates with FEC IDs found' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = {
      success: 0,
      failed: 0,
      totalDonorsImported: 0,
      totalRaised: 0,
      errors: [] as string[],
    };

    // Process each candidate
    for (const candidate of candidates) {
      try {
        console.log('[SYNC-ALL-DONORS] Processing:', candidate.name);

        // Call the fetch-fec-donors function
        const { data, error } = await supabase.functions.invoke('fetch-fec-donors', {
          body: {
            candidateId: candidate.id,
            fecCandidateId: candidate.fec_candidate_id,
            cycle,
          },
        });

        if (error) {
          console.error('[SYNC-ALL-DONORS] Error for', candidate.name, ':', error);
          results.failed++;
          results.errors.push(`${candidate.name}: ${error.message}`);
        } else if (data?.success) {
          results.success++;
          results.totalDonorsImported += data.imported || 0;
          results.totalRaised += data.totalRaised || 0;
          console.log('[SYNC-ALL-DONORS] Success for', candidate.name, ':', data.imported, 'donors');
        } else {
          results.failed++;
          results.errors.push(`${candidate.name}: ${data?.error || 'Unknown error'}`);
        }

        // Rate limit: wait 1 second between requests
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (err) {
        console.error('[SYNC-ALL-DONORS] Exception for', candidate.name, ':', err);
        results.failed++;
        results.errors.push(`${candidate.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    console.log('[SYNC-ALL-DONORS] Complete:', results);

    return new Response(
      JSON.stringify({
        processed: candidates.length,
        successCount: results.success,
        failedCount: results.failed,
        totalDonorsImported: results.totalDonorsImported,
        totalRaised: results.totalRaised,
        errors: results.errors,
        message: `Synced ${results.success}/${candidates.length} candidates. Imported ${results.totalDonorsImported} donors totaling $${results.totalRaised.toLocaleString()}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[SYNC-ALL-DONORS] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
