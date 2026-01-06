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
const CONCURRENT_LIMIT = 5; // 5 parallel API calls
const DELAY_BETWEEN_BATCHES = 200; // 200ms between parallel batches
const MAX_RETRIES = 3;
const RATE_LIMIT_DELAY = 5000; // 5s on rate limit

interface VoteRecord {
  id: string;
  bill_id: string;
  congress: number;
  action_type: string | null;
}

interface SummaryResult {
  voteId: string;
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

    // Get the most recent/detailed summary - FULL text
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

// Check if bill_id is a floor vote ID (not a real bill)
function isFloorVoteId(billId: string): boolean {
  return billId.startsWith('VOTE-') || billId.startsWith('vote-');
}

// Parse bill_id to extract type and number
function parseBillId(billId: string): { type: string; number: number } | null {
  // Skip floor vote IDs
  if (isFloorVoteId(billId)) {
    return null;
  }
  
  // Remove all spaces, periods, and normalize
  const cleaned = billId.replace(/\s+/g, '').replace(/\./g, '').toUpperCase();
  
  // Match patterns like HR4535, HJRES105, SCONRES50
  const match = cleaned.match(/^(HR|S|HRES|SRES|HJRES|SJRES|HCONRES|SCONRES)(\d+)$/);
  if (match) {
    return { type: match[1], number: parseInt(match[2], 10) };
  }
  
  // Try looser match for edge cases
  const looseMatch = cleaned.match(/^([A-Z]+)(\d+)$/);
  if (looseMatch) {
    console.log(`[BillSummary] Using loose match for bill_id: ${billId} -> ${looseMatch[1]}${looseMatch[2]}`);
    return { type: looseMatch[1], number: parseInt(looseMatch[2], 10) };
  }
  
  return null;
}

// Process a single vote and return result
async function processVote(vote: VoteRecord): Promise<SummaryResult> {
  // Skip floor vote IDs - mark them so we don't process again
  if (isFloorVoteId(vote.bill_id)) {
    return { 
      voteId: vote.id, 
      summary: '[FLOOR_VOTE]', 
      success: true 
    };
  }

  // Skip full-text bill titles (not parseable IDs) - typically > 50 chars
  if (vote.bill_id.length > 50) {
    console.log(`[BillSummary] Skipping full-text title: ${vote.bill_id.substring(0, 40)}...`);
    return { 
      voteId: vote.id, 
      summary: '[TITLE_NOT_ID]', 
      success: true 
    };
  }

  const parsed = parseBillId(vote.bill_id);
  if (!parsed) {
    console.log(`[BillSummary] Could not parse bill_id: ${vote.bill_id}`);
    return { 
      voteId: vote.id, 
      summary: '[UNPARSEABLE]', 
      success: true 
    };
  }
  
  if (!vote.congress) {
    console.log(`[BillSummary] Missing congress for vote ${vote.id}`);
    return { voteId: vote.id, summary: null, success: false };
  }

  console.log(`[BillSummary] Fetching summary for ${parsed.type}${parsed.number} (Congress ${vote.congress})`);
  const summary = await fetchBillSummary(vote.congress, parsed.type, parsed.number);
  return { 
    voteId: vote.id, 
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
    const { batchSize = 50, candidateId, speed = 'normal' } = body;

    // Adjust concurrency based on speed setting
    const concurrentLimit = speed === 'fast' ? 8 : speed === 'conservative' ? 3 : CONCURRENT_LIMIT;

    if (!CONGRESS_API_KEY) {
      throw new Error('Congress.gov API key not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Query uses partial index: votes_pending_summaries_idx
    // WHERE bill_summary IS NULL AND congress IS NOT NULL
    // This should be fast now with the index
    const effectiveBatchSize = Math.min(batchSize, 50);
    
    let query = supabase
      .from('votes')
      .select('id, bill_id, congress, action_type')
      .is('bill_summary', null)
      .not('congress', 'is', null)
      .order('id', { ascending: true })
      .limit(effectiveBatchSize);
    
    if (candidateId) {
      query = query.eq('candidate_id', candidateId);
    }

    const startTime = Date.now();
    const { data: rawVotes, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch votes: ${error.message}`);
    }

    // Filter out VOTE- IDs in JS (mark them instead of skipping entirely)
    const votes = rawVotes || [];
    const processableVotes = votes.filter(v => !v.bill_id.toUpperCase().startsWith('VOTE-'));

    // If all fetched votes are VOTE- prefixed, mark them and continue
    if (votes.length > 0 && processableVotes.length === 0) {
      console.log(`[Backfill] All ${votes.length} votes are floor votes, marking them...`);
      
      for (const vote of votes) {
        await supabase
          .from('votes')
          .update({ 
            bill_summary: '[FLOOR_VOTE]',
            summary_fetched_at: new Date().toISOString()
          })
          .eq('id', vote.id);
      }
      
      return new Response(JSON.stringify({
        status: 'in_progress',
        message: `Marked ${votes.length} floor votes`,
        updated: votes.length,
        failed: 0,
        remaining: null, // Unknown - keep looping
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    console.log(`[Backfill] Processing ${processableVotes.length} votes (${votes.length - processableVotes.length} floor votes) with ${concurrentLimit} concurrent calls...`);

    let updated = 0;
    let failed = 0;

    // Process in parallel chunks
    const chunks = chunk(processableVotes as VoteRecord[], concurrentLimit);
    
    for (const batch of chunks) {
      // Process batch in parallel
      const results = await Promise.allSettled(
        batch.map(vote => processVote(vote))
      );

      // Collect successful updates
      const updates: { id: string; bill_summary: string; summary_fetched_at: string }[] = [];
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success && result.value.summary) {
          updates.push({
            id: result.value.voteId,
            bill_summary: result.value.summary,
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
            .from('votes')
            .update({ 
              bill_summary: update.bill_summary,
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

    // Return in_progress if we processed anything - let UI decide when to stop
    return new Response(JSON.stringify({
      status: updated > 0 ? 'in_progress' : 'complete',
      message: `Processed ${processableVotes.length} votes at ${rate.toFixed(1)}/sec`,
      updated,
      failed,
      remaining: null, // Don't run expensive count - UI tracks progress
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
