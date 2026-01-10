import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONGRESS_API_KEY = Deno.env.get('CONGRESS_GOV_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Configuration for parallel processing
const CONCURRENT_LIMIT = 8;
const DELAY_BETWEEN_BATCHES = 150;
const MAX_RETRIES = 3;
const RATE_LIMIT_DELAY = 5000;

interface BillRecord {
  id: string;
  bill_type: string | null;
  bill_number: number | null;
  congress: number | null;
}

interface SummaryResult {
  billId: string;
  summary: string | null;
  success: boolean;
}

// Fetch CRS bill summary from Congress.gov API
async function fetchBillSummary(
  congress: number,
  billType: string,
  billNumber: number,
  retries = 0
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
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    // Handle rate limiting with exponential backoff
    if (response.status === 429) {
      if (retries < MAX_RETRIES) {
        const delay = RATE_LIMIT_DELAY * Math.pow(2, retries);
        console.log(`[BillSummary] Rate limited, waiting ${delay}ms before retry ${retries + 1}`);
        await new Promise(r => setTimeout(r, delay));
        return fetchBillSummary(congress, billType, billNumber, retries + 1);
      }
      console.log(`[BillSummary] Rate limit exceeded after ${MAX_RETRIES} retries`);
      return null;
    }

    if (!response.ok) return null;

    const data = await response.json();
    const summaries = data.summaries || [];

    if (summaries.length === 0) return '[NO_SUMMARY]';

    // Get the most recent/detailed summary
    const latestSummary = summaries[summaries.length - 1];
    return latestSummary.text || '[NO_SUMMARY]';
  } catch (e) {
    if (retries < MAX_RETRIES && e instanceof Error && e.name !== 'AbortError') {
      await new Promise(r => setTimeout(r, 1000 * (retries + 1)));
      return fetchBillSummary(congress, billType, billNumber, retries + 1);
    }
    console.log(`[BillSummary] Error fetching summary for ${billType}${billNumber}:`, e);
    return null;
  }
}

// Process a single bill and return result
async function processBill(bill: BillRecord): Promise<SummaryResult> {
  if (!bill.bill_type || !bill.bill_number || !bill.congress) {
    console.log(`[BillSummary] Missing required fields for bill ${bill.id}`);
    return { billId: bill.id, summary: null, success: false };
  }

  console.log(`[BillSummary] Fetching summary for ${bill.bill_type}${bill.bill_number} (Congress ${bill.congress})`);
  const summary = await fetchBillSummary(bill.congress, bill.bill_type, bill.bill_number);
  return { 
    billId: bill.id, 
    summary: summary || '[NO_SUMMARY]', 
    success: true 
  };
}

// Chunk array into smaller arrays
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { batchSize = 100, speed = 'normal' } = body;

    const concurrentLimit = speed === 'fast' ? 10 : speed === 'conservative' ? 4 : CONCURRENT_LIMIT;

    if (!CONGRESS_API_KEY) {
      throw new Error('Congress.gov API key not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Query bills that need summaries (have bill_type/number/congress but no summary)
    const effectiveBatchSize = Math.min(batchSize, 100);
    
    const { data: bills, error } = await supabase
      .from('bills')
      .select('id, bill_type, bill_number, congress')
      .is('summary', null)
      .not('bill_type', 'is', null)
      .not('bill_number', 'is', null)
      .not('congress', 'is', null)
      .order('id', { ascending: true })
      .limit(effectiveBatchSize);

    if (error) {
      throw new Error(`Failed to fetch bills: ${error.message}`);
    }

    if (!bills || bills.length === 0) {
      return new Response(JSON.stringify({
        status: 'complete',
        message: 'No bills remaining without summaries',
        updated: 0,
        remaining: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[Backfill] Processing ${bills.length} bills with ${concurrentLimit} concurrent calls...`);

    const startTime = Date.now();
    let updated = 0;
    let failed = 0;

    // Process in parallel chunks
    const chunks = chunk(bills as BillRecord[], concurrentLimit);
    
    for (const batch of chunks) {
      // Process batch in parallel
      const results = await Promise.allSettled(
        batch.map(bill => processBill(bill))
      );

      // Collect successful updates
      const updates: { id: string; summary: string; summary_fetched_at: string }[] = [];
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success && result.value.summary) {
          updates.push({
            id: result.value.billId,
            summary: result.value.summary,
            summary_fetched_at: new Date().toISOString()
          });
          updated++;
        } else {
          failed++;
        }
      }

      // Batch update database
      if (updates.length > 0) {
        for (const update of updates) {
          await supabase
            .from('bills')
            .update({ 
              summary: update.summary,
              summary_fetched_at: update.summary_fetched_at
            })
            .eq('id', update.id);
        }
      }

      // Delay between batches to respect rate limits
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = updated / elapsed;

    console.log(`[Backfill] Completed: ${updated} updated, ${failed} failed (${rate.toFixed(1)}/sec)`);

    return new Response(JSON.stringify({
      status: updated > 0 ? 'in_progress' : 'complete',
      message: `Processed ${bills.length} bills at ${rate.toFixed(1)}/sec`,
      updated,
      failed,
      remaining: null,
      processingRate: rate,
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
