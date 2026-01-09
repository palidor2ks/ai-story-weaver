import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Derive chamber from bill_id prefix
function getChamberFromBillId(billId: string): 'house' | 'senate' | null {
  if (!billId) return null;
  const upper = billId.toUpperCase();
  // House bills: HR, HRES, HJRES, HCONRES
  if (/^(HR|HRES|HJRES|HCONRES)/.test(upper)) return 'house';
  // Senate bills: S, SRES, SJRES, SCONRES
  if (/^(S|SRES|SJRES|SCONRES)/.test(upper)) return 'senate';
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse request body for optional batch size
    // Use smaller default to avoid query timeouts on large table scans
    let batchSize = 5000;
    try {
      const body = await req.json();
      if (body.batchSize && typeof body.batchSize === 'number') {
        batchSize = Math.min(body.batchSize, 10000); // Cap at 10k to prevent timeouts
      }
    } catch {
      // Use default batch size if no body
    }

    console.log(`Starting chamber backfill with batch size: ${batchSize}`);

    // Skip COUNT query to avoid timeout - just fetch the batch directly
    const { data: votes, error: fetchError } = await supabase
      .from('votes')
      .select('id, bill_id')
      .is('chamber', null)
      .in('action_type', ['sponsored', 'cosponsored'])
      .limit(batchSize);

    if (fetchError) {
      throw new Error(`Failed to fetch votes: ${fetchError.message}`);
    }

    if (!votes || votes.length === 0) {
      return new Response(JSON.stringify({
        status: 'complete',
        message: 'All sponsored/cosponsored votes now have chamber values',
        updated: 0,
        remaining: 0,
        hasMore: false,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Fetched ${votes.length} votes for processing`);

    // Group by derived chamber
    const houseIds: string[] = [];
    const senateIds: string[] = [];
    let unknownCount = 0;

    for (const vote of votes) {
      const chamber = getChamberFromBillId(vote.bill_id);
      if (chamber === 'house') {
        houseIds.push(vote.id);
      } else if (chamber === 'senate') {
        senateIds.push(vote.id);
      } else {
        unknownCount++;
      }
    }

    console.log(`Grouped: ${houseIds.length} house, ${senateIds.length} senate, ${unknownCount} unknown`);

    // Bulk update in chunks of 500 to avoid URL length limits (vote IDs are long)
    const chunkSize = 500;
    let houseUpdated = 0;
    let senateUpdated = 0;

    // Update house records
    for (let i = 0; i < houseIds.length; i += chunkSize) {
      const chunk = houseIds.slice(i, i + chunkSize);
      const { error: updateError } = await supabase
        .from('votes')
        .update({ chamber: 'house' })
        .in('id', chunk);

      if (updateError) {
        console.error(`Error updating house chunk ${i}: ${updateError.message}`);
      } else {
        houseUpdated += chunk.length;
      }
    }

    // Update senate records
    for (let i = 0; i < senateIds.length; i += chunkSize) {
      const chunk = senateIds.slice(i, i + chunkSize);
      const { error: updateError } = await supabase
        .from('votes')
        .update({ chamber: 'senate' })
        .in('id', chunk);

      if (updateError) {
        console.error(`Error updating senate chunk ${i}: ${updateError.message}`);
      } else {
        senateUpdated += chunk.length;
      }
    }

    const totalUpdated = houseUpdated + senateUpdated;
    // Determine if more records exist based on whether we got a full batch
    const hasMore = votes.length === batchSize;

    console.log(`Updated ${totalUpdated} records. Has more: ${hasMore}`);

    return new Response(JSON.stringify({
      status: hasMore ? 'in_progress' : 'complete',
      message: `Updated ${totalUpdated} votes`,
      updated: totalUpdated,
      house: houseUpdated,
      senate: senateUpdated,
      unknown: unknownCount,
      remaining: hasMore ? -1 : 0, // -1 indicates unknown but more exist
      hasMore,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in backfill-vote-chambers:', errorMessage);
    return new Response(JSON.stringify({
      error: errorMessage,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
