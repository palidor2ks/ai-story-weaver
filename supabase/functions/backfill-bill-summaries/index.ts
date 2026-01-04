import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONGRESS_API_KEY = Deno.env.get('CONGRESS_GOV_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Fetch CRS bill summary from Congress.gov API - NO character limit
async function fetchBillSummary(
  congress: number,
  billType: string,
  billNumber: number
): Promise<string | null> {
  if (!CONGRESS_API_KEY) return null;

  try {
    const typeMap: Record<string, string> = {
      'HR': 'hr', 'S': 's', 'HRES': 'hres', 'SRES': 'sres',
      'HJRES': 'hjres', 'SJRES': 'sjres', 'HCONRES': 'hconres', 'SCONRES': 'sconres'
    };
    const apiType = typeMap[billType.toUpperCase()] || 'hr';

    const url = `https://api.congress.gov/v3/bill/${congress}/${apiType}/${billNumber}/summaries?api_key=${CONGRESS_API_KEY}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();
    const summaries = data.summaries || [];

    if (summaries.length === 0) return '[NO_SUMMARY]';

    // Get the most recent/detailed summary - FULL text, no character limit
    const latestSummary = summaries[summaries.length - 1];
    return latestSummary.text || '[NO_SUMMARY]';
  } catch (e) {
    console.log(`[BillSummary] Error fetching summary for ${billType}${billNumber}:`, e);
    return null;
  }
}

// Parse bill_id to extract type and number
function parseBillId(billId: string): { type: string; number: number } | null {
  // Handle formats: "HR.1234", "HR1234", "H.R. 1234", "S.1234", etc.
  const cleaned = billId.replace(/\s+/g, '').replace(/\./g, '');
  const match = cleaned.match(/^([A-Z]+)(\d+)$/i);
  if (match) {
    return { type: match[1].toUpperCase(), number: parseInt(match[2], 10) };
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { batchSize = 50, candidateId, offset = 0 } = body;

    if (!CONGRESS_API_KEY) {
      throw new Error('Congress.gov API key not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Build query for votes missing summaries
    let query = supabase
      .from('votes')
      .select('id, bill_id, congress, action_type')
      .is('bill_summary', null)
      .not('congress', 'is', null)
      .order('date', { ascending: false })
      .range(offset, offset + batchSize - 1);

    // Optionally filter by candidate
    if (candidateId) {
      query = query.eq('candidate_id', candidateId);
    }

    const { data: votes, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch votes: ${error.message}`);
    }

    if (!votes || votes.length === 0) {
      return new Response(JSON.stringify({
        status: 'complete',
        message: 'No votes remaining without summaries',
        updated: 0,
        remaining: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[Backfill] Processing ${votes.length} votes starting at offset ${offset}...`);

    let updated = 0;
    let failed = 0;
    const DELAY_BETWEEN_FETCHES = 100; // 100ms to respect rate limits

    for (const vote of votes) {
      const parsed = parseBillId(vote.bill_id);
      if (!parsed || !vote.congress) {
        console.log(`[Backfill] Skipping vote ${vote.id}: invalid bill_id format`);
        failed++;
        continue;
      }

      const summary = await fetchBillSummary(vote.congress, parsed.type, parsed.number);
      
      if (summary) {
        const { error: updateError } = await supabase
          .from('votes')
          .update({ 
            bill_summary: summary,
            summary_fetched_at: new Date().toISOString()
          })
          .eq('id', vote.id);

        if (updateError) {
          console.error(`[Backfill] Failed to update vote ${vote.id}:`, updateError);
          failed++;
        } else {
          updated++;
        }
      } else {
        // Mark as checked with [NO_SUMMARY] to avoid re-fetching
        const { error: updateError } = await supabase
          .from('votes')
          .update({ 
            bill_summary: '[NO_SUMMARY]',
            summary_fetched_at: new Date().toISOString()
          })
          .eq('id', vote.id);

        if (!updateError) {
          updated++;
        } else {
          failed++;
        }
      }

      await new Promise(r => setTimeout(r, DELAY_BETWEEN_FETCHES));
    }

    // Count remaining votes without summaries
    const { count: remaining } = await supabase
      .from('votes')
      .select('id', { count: 'exact', head: true })
      .is('bill_summary', null)
      .not('congress', 'is', null);

    console.log(`[Backfill] Completed: ${updated} updated, ${failed} failed, ${remaining || 0} remaining`);

    return new Response(JSON.stringify({
      status: remaining && remaining > 0 ? 'in_progress' : 'complete',
      message: `Processed ${votes.length} votes`,
      updated,
      failed,
      remaining: remaining || 0,
      nextOffset: offset + batchSize,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Backfill] Error:', errorMessage);

    return new Response(JSON.stringify({
      status: 'error',
      error: errorMessage,
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
