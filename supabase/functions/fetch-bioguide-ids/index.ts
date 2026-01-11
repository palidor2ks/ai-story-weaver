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

  try {
    const { batchSize = 50, congress } = await req.json().catch(() => ({}));
    
    if (!CONGRESS_API_KEY) {
      throw new Error('CONGRESS_GOV_API_KEY not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find bills that have sponsor_name (from Excel) but missing sponsor_bioguide_id
    let query = supabase
      .from('bills')
      .select('id, bill_type, bill_number, congress, sponsor_name, cosponsor_count')
      .is('sponsor_bioguide_id', null)
      .not('sponsor_name', 'is', null)  // Only bills with Excel-imported sponsor names
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
          // Update bill with ONLY the bioguide ID (keep existing sponsor_name, party, state from Excel)
          const { error: updateError } = await supabase
            .from('bills')
            .update({
              sponsor_bioguide_id: primarySponsor.bioguideId,
              updated_at: new Date().toISOString()
            })
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

        // Fetch cosponsors to populate bill_sponsors table
        const cosponsorCount = bill.cosponsor_count || billData.cosponsors?.count || 0;
        if (cosponsorCount > 0 && cosponsorCount <= 50) {
          try {
            const cosponsorsUrl = `https://api.congress.gov/v3/bill/${bill.congress}/${billType}/${bill.bill_number}/cosponsors?api_key=${CONGRESS_API_KEY}`;
            const cosponsorsResponse = await fetch(cosponsorsUrl);
            
            if (cosponsorsResponse.ok) {
              const cosponsorsData = await cosponsorsResponse.json();
              const cosponsors: Cosponsor[] = cosponsorsData.cosponsors || [];
              
              // Insert cosponsors in batch
              const cosponsorRecords = cosponsors.map(cs => ({
                bill_id: bill.id,
                bioguide_id: cs.bioguideId,
                name: cs.fullName,
                party: cs.party,
                state: cs.state,
                is_sponsor: false,
                sponsorship_date: cs.sponsorshipDate,
              }));

              if (cosponsorRecords.length > 0) {
                await supabase
                  .from('bill_sponsors')
                  .upsert(cosponsorRecords, { onConflict: 'bill_id,bioguide_id' });
                cosponsorsAdded += cosponsorRecords.length;
              }
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

    // Get count of remaining bills needing bioguide enrichment
    let remainingQuery = supabase
      .from('bills')
      .select('*', { count: 'exact', head: true })
      .is('sponsor_bioguide_id', null)
      .not('sponsor_name', 'is', null);
    
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
