import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Congress number by start year (each congress lasts 2 years starting in odd years)
// 114th: Jan 2015 - Jan 2017
// 115th: Jan 2017 - Jan 2019
// ... etc.
function getCongressFromDate(dateStr: string): number | null {
  if (!dateStr) return null;
  
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  
  // Congress starts on Jan 3rd of odd years
  // Adjust for the January transition period
  let effectiveYear = year;
  if (month === 0 && date.getDate() < 3 && year % 2 === 1) {
    effectiveYear = year - 1; // Still in previous congress
  }
  
  // Formula: Congress number = ((year - 1789) / 2) + 1
  // Or simplified for recent congresses:
  // 114th Congress: 2015-2016
  // Base: 2015 -> 114
  const congressNumber = Math.floor((effectiveYear - 1789) / 2) + 1;
  
  // Sanity check for reasonable range (100th-130th)
  if (congressNumber < 100 || congressNumber > 130) return null;
  
  return congressNumber;
}

// Parse congress from bill_id if available (e.g., "HR.1234" doesn't have it, but we can try)
function parseCongressFromBillId(billId: string): number | null {
  // Some bill IDs might have congress prefix like "119-HR.1234"
  const match = billId.match(/^(\d{3})-/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

async function processBackfill(batchSize: number, offset: number) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  console.log(`[Backfill] Starting batch: offset=${offset}, batchSize=${batchSize}`);
  
  // Get votes with NULL congress
  const { data: votes, error: fetchError } = await supabase
    .from('votes')
    .select('id, bill_id, date, congress')
    .is('congress', null)
    .order('date', { ascending: false })
    .range(offset, offset + batchSize - 1);
  
  if (fetchError) {
    console.error('[Backfill] Error fetching votes:', fetchError);
    throw fetchError;
  }
  
  if (!votes || votes.length === 0) {
    console.log('[Backfill] No more votes to process');
    return { updated: 0, remaining: 0, status: 'complete' };
  }
  
  console.log(`[Backfill] Processing ${votes.length} votes`);
  
  let updated = 0;
  let failed = 0;
  
  // Process in chunks of 100 for updates
  const CHUNK_SIZE = 100;
  const updates: { id: string; congress: number }[] = [];
  
  for (const vote of votes) {
    // Try to derive congress from bill_id first
    let congress = parseCongressFromBillId(vote.bill_id);
    
    // Fall back to deriving from date
    if (!congress && vote.date) {
      congress = getCongressFromDate(vote.date);
    }
    
    if (congress) {
      updates.push({ id: vote.id, congress });
    } else {
      failed++;
      console.log(`[Backfill] Could not determine congress for vote ${vote.id} (bill: ${vote.bill_id}, date: ${vote.date})`);
    }
  }
  
  // Batch update
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    
    // Use individual updates since we need different congress values per row
    const updatePromises = chunk.map(({ id, congress }) =>
      supabase
        .from('votes')
        .update({ congress })
        .eq('id', id)
    );
    
    const results = await Promise.allSettled(updatePromises);
    
    const successes = results.filter(r => r.status === 'fulfilled' && !(r.value as { error?: unknown }).error).length;
    updated += successes;
    
    if (updated > 0 && updated % 500 === 0) {
      console.log(`[Backfill] Updated ${updated} votes so far`);
    }
  }
  
  // Count remaining with retry on null
  let remainingCount = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { count, error: countError } = await supabase
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .is('congress', null);
    
    if (!countError && count !== null) {
      remainingCount = count;
      break;
    }
    console.log(`[Backfill] Count query attempt ${attempt + 1} returned null, retrying...`);
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`[Backfill] Batch complete: updated=${updated}, failed=${failed}, remaining=${remainingCount}`);
  
  return {
    updated,
    failed,
    remaining: remainingCount,
    status: remainingCount > 0 ? 'in_progress' : 'complete',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 1000;
    const offset = body.offset || 0;
    
    console.log(`[Backfill] Request received: batchSize=${batchSize}, offset=${offset}`);
    
    // Get initial count
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { count: totalMissing } = await supabase
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .is('congress', null);
    
    console.log(`[Backfill] Total votes missing congress: ${totalMissing}`);
    
    if (!totalMissing || totalMissing === 0) {
      return new Response(JSON.stringify({
        status: 'complete',
        message: 'All votes already have congress numbers',
        updated: 0,
        remaining: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Process the batch
    const result = await processBackfill(batchSize, offset);
    
    return new Response(JSON.stringify({
      ...result,
      totalMissing,
      message: result.status === 'complete' 
        ? 'All votes now have congress numbers' 
        : `Updated ${result.updated} votes, ${result.remaining} remaining`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Backfill] Error:', errorMessage);
    
    return new Response(JSON.stringify({
      error: errorMessage,
      status: 'error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
