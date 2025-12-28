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

    // Use /schedules/schedule_e/totals/ endpoint - this aggregates spending BY committee
    // This is the correct endpoint that returns committee-level totals for independent expenditures
    const committeeSpending: Map<string, number> = new Map();
    let page = 1;
    const maxPages = 20;

    while (page <= maxPages) {
      // Query by cycle and sort by total descending to get biggest spenders first
      const url = `https://api.open.fec.gov/v1/schedules/schedule_e/totals/?api_key=${fecApiKey}&cycle=${cycle}&per_page=100&page=${page}&sort=-total`;

      console.log('[DISCOVER-SUPER-PACS] Fetching schedule_e/totals page', page);
      const response = await fetchWithRetry(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[DISCOVER-SUPER-PACS] FEC API error:', response.status, errorText);
        break;
      }

      const data = await response.json();
      const results = data?.results || [];
      
      console.log('[DISCOVER-SUPER-PACS] Page', page, 'returned', results.length, 'results');
      
      if (results.length === 0) {
        console.log('[DISCOVER-SUPER-PACS] No more results');
        break;
      }

      // Each result has committee_id and total (already aggregated by committee)
      for (const result of results) {
        const committeeId = result.committee_id;
        const total = result.total || 0;
        
        if (committeeId && total > 0) {
          // The endpoint already aggregates, so we take the total directly
          // but keep max in case there are duplicates
          const current = committeeSpending.get(committeeId) || 0;
          if (total > current) {
            committeeSpending.set(committeeId, total);
          }
        }
      }

      // Check if there are more pages
      const pagination = data?.pagination;
      if (!pagination || page >= pagination.pages) {
        console.log('[DISCOVER-SUPER-PACS] Reached last page');
        break;
      }
      
      page++;
      
      // Rate limit between pages
      await delay(300);
    }

    console.log('[DISCOVER-SUPER-PACS] Found', committeeSpending.size, 'unique committees with expenditures');

    // Filter committees by minimum spend and exclude existing ones
    const qualifiedCommittees: Array<{ id: string; total: number }> = [];
    for (const [committeeId, total] of committeeSpending) {
      if (total >= minSpend && !existingIds.has(committeeId)) {
        qualifiedCommittees.push({ id: committeeId, total });
      }
    }

    // Sort by total spend descending
    qualifiedCommittees.sort((a, b) => b.total - a.total);

    console.log('[DISCOVER-SUPER-PACS] Found', qualifiedCommittees.length, 'new committees above threshold');

    // Import each qualified committee
    const results = {
      discovered: qualifiedCommittees.length,
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [] as string[],
      committees: [] as Array<{ id: string; name: string; total: number }>,
    };

    // Limit imports per run to avoid timeouts
    const maxImports = 50;
    const toImport = qualifiedCommittees.slice(0, maxImports);

    for (const { id: committeeId, total } of toImport) {
      try {
        console.log('[DISCOVER-SUPER-PACS] Importing committee:', committeeId, 'with spend:', total);
        
        // Fetch committee details to get name and verify it's a Super PAC
        const detailUrl = `https://api.open.fec.gov/v1/committee/${committeeId}/?api_key=${fecApiKey}`;
        const detailResponse = await fetchWithRetry(detailUrl);
        
        if (!detailResponse.ok) {
          console.error('[DISCOVER-SUPER-PACS] Failed to fetch committee details:', committeeId);
          results.failed++;
          results.errors.push(`${committeeId}: Failed to fetch details`);
          await delay(500);
          continue;
        }

        const detailData = await detailResponse.json();
        const committee = detailData?.results?.[0];
        
        if (!committee) {
          console.error('[DISCOVER-SUPER-PACS] Committee not found:', committeeId);
          results.failed++;
          results.errors.push(`${committeeId}: Not found`);
          await delay(500);
          continue;
        }

        // Verify it's a Super PAC type (O, W, V, U)
        const validTypes = ['O', 'W', 'V', 'U'];
        if (!validTypes.includes(committee.committee_type)) {
          console.log('[DISCOVER-SUPER-PACS] Skipping non-Super PAC:', committeeId, committee.committee_type);
          results.skipped++;
          await delay(300);
          continue;
        }

        // Insert committee
        const committeeRecord = {
          fec_committee_id: committee.committee_id,
          name: committee.name,
          designation: committee.designation || 'U',
          designation_full: committee.committee_type_full || 'Independent Expenditure-Only Committee',
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
          console.log('[DISCOVER-SUPER-PACS] Imported:', committee.name, 'with spend:', total);
          results.imported++;
          results.committees.push({ id: committee.committee_id, name: committee.name, total });
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
        failed: results.failed,
        errors: results.errors.slice(0, 10),
        committees: results.committees.slice(0, 20),
        message: `Found ${results.discovered} Super PACs with ≥$${Math.round(minSpend / 1000)}K spending. Imported ${results.imported}, skipped ${results.skipped}, failed ${results.failed}.`,
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
