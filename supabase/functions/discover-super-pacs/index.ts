import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate-limited fetch with retries (matches import-external-committee pattern)
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

// Delay between API calls to avoid rate limiting (matches sync-all-donors)
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
    const minSpend = body.minSpend || 100000; // Default $100k minimum to filter small PACs

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

    // Fetch Schedule E totals BY COMMITTEE (not by_candidate)
    // This gives us committees that have made independent expenditures in this cycle
    const discoveredCommittees: Array<{ id: string; total: number }> = [];
    let lastIndex: string | null = null;
    let pageCount = 0;
    const maxPages = 50; // Increase page limit for thorough discovery

    while (pageCount < maxPages) {
      // Use /totals/by_committee/ endpoint - returns committee_id and total for each PAC
      let url = `https://api.open.fec.gov/v1/schedules/schedule_e/totals/by_committee/?api_key=${fecApiKey}&cycle=${cycle}&per_page=100&sort=-total&min_total=${minSpend}`;
      if (lastIndex) {
        url += `&last_index=${lastIndex}`;
      }

      console.log('[DISCOVER-SUPER-PACS] Fetching page', pageCount + 1);
      const response = await fetchWithRetry(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[DISCOVER-SUPER-PACS] FEC API error:', response.status, errorText);
        break;
      }

      const data = await response.json();
      const results = data?.results || [];
      
      console.log('[DISCOVER-SUPER-PACS] Page', pageCount + 1, 'returned', results.length, 'results');
      
      if (results.length === 0) {
        console.log('[DISCOVER-SUPER-PACS] No more results');
        break;
      }

      // Extract unique committee IDs - the endpoint returns committee_id directly
      for (const result of results) {
        const committeeId = result.committee_id;
        const total = result.total || 0;
        
        if (committeeId && !existingIds.has(committeeId) && !discoveredCommittees.find(c => c.id === committeeId)) {
          discoveredCommittees.push({ id: committeeId, total });
          console.log('[DISCOVER-SUPER-PACS] Found new committee:', committeeId, 'with total:', total);
        }
      }

      // Check pagination
      const pagination = data?.pagination;
      if (!pagination?.last_indexes?.last_index) {
        console.log('[DISCOVER-SUPER-PACS] No more pages');
        break;
      }
      
      lastIndex = pagination.last_indexes.last_index;
      pageCount++;
      
      // Rate limit between pages
      await delay(500);
    }

    console.log('[DISCOVER-SUPER-PACS] Discovered', discoveredCommittees.length, 'new committees');

    // Import each discovered committee
    const results = {
      discovered: discoveredCommittees.length,
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [] as string[],
      committees: [] as Array<{ id: string; name: string; total: number }>,
    };

    for (const { id: committeeId, total } of discoveredCommittees) {
      try {
        console.log('[DISCOVER-SUPER-PACS] Importing committee:', committeeId);
        
        // Fetch committee details
        const detailUrl = `https://api.open.fec.gov/v1/committee/${committeeId}/?api_key=${fecApiKey}`;
        const detailResponse = await fetchWithRetry(detailUrl);
        
        if (!detailResponse.ok) {
          console.error('[DISCOVER-SUPER-PACS] Failed to fetch committee details:', committeeId);
          results.failed++;
          results.errors.push(`${committeeId}: Failed to fetch details`);
          await delay(1000);
          continue;
        }

        const detailData = await detailResponse.json();
        const committee = detailData?.results?.[0];
        
        if (!committee) {
          console.error('[DISCOVER-SUPER-PACS] Committee not found:', committeeId);
          results.failed++;
          results.errors.push(`${committeeId}: Not found in FEC database`);
          await delay(1000);
          continue;
        }

        // Only import Super PACs (committee_type O = Independent Expenditure-Only Committee)
        // Also include Hybrid PACs (committee_type W or V)
        const validTypes = ['O', 'W', 'V', 'U'];
        if (!validTypes.includes(committee.committee_type)) {
          console.log('[DISCOVER-SUPER-PACS] Skipping non-Super PAC:', committeeId, committee.committee_type);
          results.skipped++;
          await delay(500);
          continue;
        }

        // Insert committee
        const committeeRecord = {
          fec_committee_id: committee.committee_id,
          name: committee.name,
          designation: committee.designation || 'U',
          designation_full: committee.designation_full || committee.committee_type_full,
          candidate_id: null,
          role: 'external',
          active: true, // Active by default since we discovered them with meaningful spend
          source_fec_candidate_id: null,
        };

        const { data: inserted, error: insertError } = await supabase
          .from('candidate_committees')
          .insert(committeeRecord)
          .select()
          .single();

        if (insertError) {
          // Check if it's a duplicate error (unique constraint)
          if (insertError.code === '23505') {
            console.log('[DISCOVER-SUPER-PACS] Committee already exists:', committeeId);
            results.skipped++;
          } else {
            console.error('[DISCOVER-SUPER-PACS] Insert error:', committeeId, insertError);
            results.failed++;
            results.errors.push(`${committeeId}: ${insertError.message}`);
          }
        } else {
          console.log('[DISCOVER-SUPER-PACS] Imported:', committee.name, 'with spend:', total);
          results.imported++;
          results.committees.push({ id: committee.committee_id, name: committee.name, total });
        }

        // Rate limit between imports
        await delay(1000);

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
        failed: results.failed,
        errors: results.errors.slice(0, 10), // Limit errors in response
        committees: results.committees.slice(0, 20), // Limit list in response
        message: `Discovered ${results.discovered} Super PACs. Imported ${results.imported}, skipped ${results.skipped}, failed ${results.failed}.`,
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
