import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate-limited fetch with retries
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      
      if (response.status === 429) {
        const backoffMs = 2000 * Math.pow(2, attempt);
        console.log(`[DISCOVER-SUPER-PACS] Rate limited (429), backing off ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      
      return response;
    } catch (error) {
      if (attempt < maxRetries - 1) {
        const backoffMs = 2000 * Math.pow(2, attempt);
        console.log(`[DISCOVER-SUPER-PACS] Fetch error, retrying in ${backoffMs}ms:`, error);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      throw error;
    }
  }
  
  throw new Error('Max retries exceeded');
}

// Delay between API calls to avoid rate limiting
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const fecApiKey = Deno.env.get('FEC_API_KEY');
    if (!fecApiKey) {
      console.error('[DISCOVER-SUPER-PACS] FEC_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'FEC API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: { cycle?: string; minSpend?: number } = {};
    try {
      body = await req.json();
    } catch {
      // Use defaults
    }

    const cycle = body.cycle || '2024';
    const minSpend = body.minSpend || 100000; // Default $100k minimum

    console.log('[DISCOVER-SUPER-PACS] Starting discovery for cycle:', cycle, 'minSpend:', minSpend);

    // Get existing external committees to avoid duplicates
    const { data: existingCommittees, error: existingError } = await supabase
      .from('candidate_committees')
      .select('fec_committee_id')
      .eq('role', 'external');

    if (existingError) {
      console.error('[DISCOVER-SUPER-PACS] Error fetching existing committees:', existingError);
    }

    const existingIds = new Set((existingCommittees || []).map(c => c.fec_committee_id));
    console.log('[DISCOVER-SUPER-PACS] Found', existingIds.size, 'existing external committees');

    // Use /committees/ endpoint with committee_type filter for Super PACs
    // O = Independent Expenditure-Only Committee (Super PAC)
    // W = Independent Expenditure-Only PAC with Non-Contribution Account (Hybrid Super PAC)
    const discoveredCommittees: Array<{ id: string; name: string; type: string }> = [];
    let page = 1;
    const maxPages = 50;

    while (page <= maxPages) {
      // Query /committees/ endpoint with Super PAC type filters
      const url = `https://api.open.fec.gov/v1/committees/?api_key=${fecApiKey}&cycle=${cycle}&committee_type=O&committee_type=W&per_page=100&page=${page}`;

      console.log('[DISCOVER-SUPER-PACS] Fetching page', page);
      const response = await fetchWithRetry(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[DISCOVER-SUPER-PACS] FEC API error:', response.status, errorText);
        break;
      }

      const data = await response.json();
      const results = data?.results || [];
      
      console.log('[DISCOVER-SUPER-PACS] Page', page, 'returned', results.length, 'committees');
      
      if (results.length === 0) {
        console.log('[DISCOVER-SUPER-PACS] No more results');
        break;
      }

      // Process each committee
      for (const committee of results) {
        const committeeId = committee.committee_id;
        
        // Skip if already exists
        if (existingIds.has(committeeId)) {
          continue;
        }
        
        // Skip if already discovered in this run
        if (discoveredCommittees.find(c => c.id === committeeId)) {
          continue;
        }

        discoveredCommittees.push({
          id: committeeId,
          name: committee.name,
          type: committee.committee_type,
        });
        
        console.log('[DISCOVER-SUPER-PACS] Found new Super PAC:', committeeId, committee.name);
      }

      // Check if there are more pages
      const pagination = data?.pagination;
      if (!pagination || page >= pagination.pages) {
        console.log('[DISCOVER-SUPER-PACS] Reached last page');
        break;
      }
      
      page++;
      
      // Rate limit between pages
      await delay(500);
    }

    console.log('[DISCOVER-SUPER-PACS] Discovered', discoveredCommittees.length, 'new Super PACs');

    // Now check Schedule E totals for each discovered committee to filter by minimum spend
    const results = {
      discovered: discoveredCommittees.length,
      imported: 0,
      skipped: 0,
      failed: 0,
      belowThreshold: 0,
      errors: [] as string[],
      committees: [] as Array<{ id: string; name: string; total: number }>,
    };

    for (const { id: committeeId, name, type } of discoveredCommittees) {
      try {
        // Fetch Schedule E eby_candidate totals - this endpoint aggregates spending by committee
        const scheduleEUrl = `https://api.open.fec.gov/v1/schedules/schedule_e/eby_candidate/totals/?api_key=${fecApiKey}&committee_id=${committeeId}&cycle=${cycle}&per_page=100`;
        const scheduleEResponse = await fetchWithRetry(scheduleEUrl);
        
        let totalSpend = 0;
        
        if (scheduleEResponse.ok) {
          const scheduleEData = await scheduleEResponse.json();
          const totals = scheduleEData?.results || [];
          
          // Sum up all expenditures for this committee across all candidates
          for (const total of totals) {
            totalSpend += (total.total || 0);
          }
        }

        console.log('[DISCOVER-SUPER-PACS] Committee', committeeId, 'total spend:', totalSpend);

        // Check minimum spend threshold
        if (totalSpend < minSpend) {
          console.log('[DISCOVER-SUPER-PACS] Skipping', committeeId, '- below threshold:', totalSpend, '<', minSpend);
          results.belowThreshold++;
          await delay(300);
          continue;
        }

        // Insert committee
        const committeeRecord = {
          fec_committee_id: committeeId,
          name: name,
          designation: type === 'O' ? 'U' : type === 'W' ? 'U' : 'U',
          designation_full: type === 'O' ? 'Independent Expenditure-Only Committee' : 'Hybrid Super PAC',
          candidate_id: null,
          role: 'external',
          active: true,
          source_fec_candidate_id: null,
        };

        const { error: insertError } = await supabase
          .from('candidate_committees')
          .insert(committeeRecord);

        if (insertError) {
          if (insertError.code === '23505') {
            console.log('[DISCOVER-SUPER-PACS] Committee already exists:', committeeId);
            results.skipped++;
          } else {
            console.error('[DISCOVER-SUPER-PACS] Insert error:', committeeId, insertError);
            results.failed++;
            results.errors.push(`${committeeId}: ${insertError.message}`);
          }
        } else {
          console.log('[DISCOVER-SUPER-PACS] Imported:', name, 'with spend:', totalSpend);
          results.imported++;
          results.committees.push({ id: committeeId, name, total: totalSpend });
        }

        // Rate limit between imports
        await delay(500);

      } catch (err) {
        console.error('[DISCOVER-SUPER-PACS] Error importing:', committeeId, err);
        results.failed++;
        results.errors.push(`${committeeId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    console.log('[DISCOVER-SUPER-PACS] Complete:', results);

    return new Response(
      JSON.stringify({
        success: true,
        cycle,
        minSpend,
        discovered: results.discovered,
        imported: results.imported,
        skipped: results.skipped,
        belowThreshold: results.belowThreshold,
        failed: results.failed,
        errors: results.errors.slice(0, 10),
        committees: results.committees.slice(0, 20),
        message: `Discovered ${results.discovered} Super PACs. Imported ${results.imported}, skipped ${results.skipped} (${results.belowThreshold} below $${minSpend / 1000}K threshold), failed ${results.failed}.`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[DISCOVER-SUPER-PACS] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: `Unexpected error: ${errorMessage}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
