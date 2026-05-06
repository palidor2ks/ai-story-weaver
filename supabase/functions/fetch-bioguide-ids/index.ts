import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONGRESS_API_KEY = Deno.env.get('CONGRESS_GOV_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface Cosponsor {
  bioguideId: string;
  fullName: string;
  party?: string;
  state?: string;
  sponsorshipDate?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

    // Admin auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const adminCheckClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: roleData } = await adminCheckClient.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }


  try {
    const { batchSize = 50, congress } = await req.json().catch(() => ({}));
    
    if (!CONGRESS_API_KEY) {
      throw new Error('CONGRESS_GOV_API_KEY not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find bills missing sponsor_bioguide_id that have valid bill_type/bill_number
    // Excludes VOTE- records (procedural votes) and badly-formatted bills
    let query = supabase
      .from('bills')
      .select('id, bill_type, bill_number, congress, sponsor_name, cosponsor_count')
      .is('sponsor_bioguide_id', null)
      .not('bill_type', 'is', null)      // Must have bill_type
      .not('bill_number', 'is', null)    // Must have bill_number
      .not('id', 'ilike', 'VOTE-%')      // Exclude procedural votes
      .limit(batchSize);
    
    if (congress) {
      query = query.eq('congress', congress);
    }

    const { data: billsToEnrich, error: fetchError } = await query;

    if (fetchError) throw fetchError;

    if (!billsToEnrich || billsToEnrich.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No bills need bioguide ID enrichment',
        processed: 0,
        failed: 0,
        remaining: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[FetchBioguideIds] Enriching ${billsToEnrich.length} bills with bioguide IDs`);

    let processed = 0;
    let failed = 0;
    let cosponsorsAdded = 0;

    for (const bill of billsToEnrich) {
      try {
        // Defensive null check (shouldn't happen with updated query filters)
        if (!bill.bill_type || !bill.bill_number) {
          console.warn(`[FetchBioguideIds] Skipping ${bill.id} - missing bill_type or bill_number`);
          failed++;
          continue;
        }

        // Fetch bill details from Congress.gov to get bioguide ID
        const billType = bill.bill_type.toLowerCase();
        const url = `https://api.congress.gov/v3/bill/${bill.congress}/${billType}/${bill.bill_number}?api_key=${CONGRESS_API_KEY}`;
        
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`[FetchBioguideIds] Failed to fetch ${bill.id}: ${response.status}`);
          failed++;
          continue;
        }

        const data = await response.json();
        const billData = data.bill;

        if (!billData) {
          failed++;
          continue;
        }

        // Extract sponsor bioguide ID
        const sponsors = billData.sponsors || [];
        const primarySponsor = sponsors[0];

        if (primarySponsor?.bioguideId) {
          // Build update object - include sponsor details if missing (API-ingested bills)
          const updateFields: Record<string, unknown> = {
            sponsor_bioguide_id: primarySponsor.bioguideId,
            updated_at: new Date().toISOString()
          };
          
          // If sponsor_name was missing (API-ingested bill), populate from Congress.gov
          if (!bill.sponsor_name && primarySponsor.fullName) {
            updateFields.sponsor_name = primarySponsor.fullName;
            updateFields.sponsor_party = primarySponsor.party || null;
            updateFields.sponsor_state = primarySponsor.state || null;
          }

          const { error: updateError } = await supabase
            .from('bills')
            .update(updateFields)
            .eq('id', bill.id);

          if (updateError) {
            console.error(`[FetchBioguideIds] Update error for ${bill.id}:`, updateError);
            failed++;
            continue;
          }

          // Insert sponsor into bill_sponsors table for linking
          await supabase
            .from('bill_sponsors')
            .upsert({
              bill_id: bill.id,
              bioguide_id: primarySponsor.bioguideId,
              name: bill.sponsor_name || primarySponsor.fullName,
              party: primarySponsor.party,
              state: primarySponsor.state,
              is_sponsor: true,
            }, { onConflict: 'bill_id,bioguide_id' });
        }

        // Fetch ALL cosponsors with pagination (Congress.gov max 250 per page)
        const cosponsorCount = bill.cosponsor_count || billData.cosponsors?.count || 0;
        if (cosponsorCount > 0) {
          try {
            let offset = 0;
            const pageSize = 250; // Congress.gov maximum
            let allCosponsors: Cosponsor[] = [];
            
            // Paginate through all cosponsors
            while (offset < cosponsorCount) {
              const cosponsorsUrl = `https://api.congress.gov/v3/bill/${bill.congress}/${billType}/${bill.bill_number}/cosponsors?limit=${pageSize}&offset=${offset}&api_key=${CONGRESS_API_KEY}`;
              const cosponsorsResponse = await fetch(cosponsorsUrl);
              
              if (!cosponsorsResponse.ok) {
                console.warn(`[FetchBioguideIds] Cosponsor page failed for ${bill.id} at offset ${offset}: ${cosponsorsResponse.status}`);
                break; // Stop pagination on error
              }
              
              const cosponsorsData = await cosponsorsResponse.json();
              const pageCosponsors: Cosponsor[] = cosponsorsData.cosponsors || [];
              allCosponsors.push(...pageCosponsors);
              
              console.log(`[FetchBioguideIds] Fetched ${pageCosponsors.length} cosponsors for ${bill.id} (offset ${offset}, total so far: ${allCosponsors.length}/${cosponsorCount})`);
              
              if (pageCosponsors.length < pageSize) break; // No more pages
              offset += pageSize;
              
              // Rate limiting between pages
              await new Promise(r => setTimeout(r, 100));
            }
            
            // Insert all cosponsors in batch
            if (allCosponsors.length > 0) {
              const cosponsorRecords = allCosponsors.map(cs => ({
                bill_id: bill.id,
                bioguide_id: cs.bioguideId,
                name: cs.fullName,
                party: cs.party,
                state: cs.state,
                is_sponsor: false,
                sponsorship_date: cs.sponsorshipDate,
              }));

              // Batch upsert in chunks of 500 to avoid payload limits
              const chunkSize = 500;
              for (let i = 0; i < cosponsorRecords.length; i += chunkSize) {
                const chunk = cosponsorRecords.slice(i, i + chunkSize);
                await supabase
                  .from('bill_sponsors')
                  .upsert(chunk, { onConflict: 'bill_id,bioguide_id' });
              }
              cosponsorsAdded += cosponsorRecords.length;
            }
          } catch (cosponsorError) {
            console.warn(`[FetchBioguideIds] Failed to fetch cosponsors for ${bill.id}:`, cosponsorError);
            // Don't fail the whole bill just because cosponsors failed
          }
        }

        processed++;

        // Rate limiting - Congress.gov has 1000 requests/hour limit
        await new Promise(r => setTimeout(r, 150));

      } catch (billError) {
        console.error(`[FetchBioguideIds] Error processing ${bill.id}:`, billError);
        failed++;
      }
    }

    console.log(`[FetchBioguideIds] Complete. Processed: ${processed}, Failed: ${failed}, Cosponsors: ${cosponsorsAdded}`);

    // Get count of remaining bills needing bioguide enrichment (matches new query logic)
    let remainingQuery = supabase
      .from('bills')
      .select('*', { count: 'exact', head: true })
      .is('sponsor_bioguide_id', null)
      .not('bill_type', 'is', null)
      .not('bill_number', 'is', null)
      .not('id', 'ilike', 'VOTE-%');
    
    if (congress) {
      remainingQuery = remainingQuery.eq('congress', congress);
    }
    
    const { count: remaining } = await remainingQuery;

    return new Response(JSON.stringify({
      success: true,
      processed,
      failed,
      cosponsorsAdded,
      remaining: remaining || 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[FetchBioguideIds] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
