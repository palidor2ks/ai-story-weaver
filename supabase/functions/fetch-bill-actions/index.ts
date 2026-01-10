import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONGRESS_API_KEY = Deno.env.get('CONGRESS_GOV_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Status values from Congress.gov bill lifecycle
const STATUS_VALUES = [
  'introduced',
  'passed_one_chamber', 
  'passed_both_chambers',
  'resolving_differences',
  'to_president',
  'veto_actions',
  'became_law'
] as const;

type BillStatus = typeof STATUS_VALUES[number];

// Action codes that indicate bill progress
// See: https://www.congress.gov/help/field-values/action-codes
function deriveStatusFromActions(actions: Array<{ actionCode?: string; text?: string }>): { 
  status: BillStatus; 
  passedHouse: boolean; 
  passedSenate: boolean;
  maxActionCode: number | null;
} {
  let passedHouse = false;
  let passedSenate = false;
  let maxActionCode = 0;
  
  // Track specific milestone flags for text-based detection
  let hasVetoText = false;
  let hasToPresidentText = false;
  let hasBecameLawText = false;
  let hasConferenceText = false;
  
  for (const action of actions) {
    const code = parseInt(action.actionCode || '0');
    if (!isNaN(code) && code > maxActionCode) {
      maxActionCode = code;
    }
    
    const text = (action.text || '').toLowerCase();
    
    // ===== BECAME LAW DETECTION =====
    if (text.includes('became public law') || 
        text.includes('became law') || 
        text.includes('signed by president') ||
        text.includes('signed by the president')) {
      hasBecameLawText = true;
    }
    
    // ===== VETO DETECTION =====
    if (text.includes('vetoed') || 
        text.includes('pocket veto') ||
        text.includes('returned by the president without approval') ||
        text.includes('returned to the house without approval') ||
        text.includes('returned to the senate without approval') ||
        (text.includes('veto') && (text.includes('message') || text.includes('return')))) {
      hasVetoText = true;
    }
    
    // ===== TO PRESIDENT DETECTION =====
    if (text.includes('presented to president') || 
        text.includes('presented to the president') ||
        text.includes('sent to the president') ||
        text.includes('sent to president') ||
        text.includes('cleared for white house') ||
        text.includes('received by the president') ||
        text.includes('enrolled bill signed')) {
      hasToPresidentText = true;
    }
    
    // ===== CONFERENCE DETECTION =====
    if (text.includes('conference report') || 
        text.includes('conferees appointed') ||
        text.includes('motion to go to conference')) {
      hasConferenceText = true;
    }
    
    // ===== HOUSE PASSAGE DETECTION =====
    // Check for House passage (action codes 8000-8999 or text patterns)
    if (code >= 8000 && code < 9000) {
      passedHouse = true;
    }
    if (text.includes('passed house') || 
        text.includes('on passage passed') && text.includes('house') ||
        text.includes('motion to reconsider laid on the table') ||
        text.includes('on agreeing to the resolution agreed') && text.includes('house')) {
      passedHouse = true;
    }
    
    // ===== SENATE PASSAGE DETECTION =====
    // Check for Senate passage (action codes 17000-17999 or text patterns)
    if (code >= 17000 && code < 18000) {
      passedSenate = true;
    }
    if (text.includes('passed senate') || 
        text.includes('on passage passed') && text.includes('senate') ||
        text.includes('resolution agreed to in senate')) {
      passedSenate = true;
    }
    
    // Also check for "received in" which implies passage from origin chamber
    if (text.includes('received in the senate') || text.includes('message on senate action')) {
      passedHouse = true;
    }
    if (text.includes('received in the house') || text.includes('message on house action')) {
      passedSenate = true;
    }
  }
  
  // ===== DETERMINE FINAL STATUS =====
  // Priority 1: Became law (codes 36000-45000 OR text)
  if (maxActionCode >= 36000 && maxActionCode <= 45000) {
    return { status: 'became_law', passedHouse: true, passedSenate: true, maxActionCode };
  }
  if (hasBecameLawText) {
    return { status: 'became_law', passedHouse: true, passedSenate: true, maxActionCode: maxActionCode || 36000 };
  }
  
  // Priority 2: Veto actions (codes 30000-35999 OR text)
  if (maxActionCode >= 30000 && maxActionCode < 36000) {
    return { status: 'veto_actions', passedHouse: true, passedSenate: true, maxActionCode };
  }
  if (hasVetoText) {
    return { status: 'veto_actions', passedHouse: true, passedSenate: true, maxActionCode: maxActionCode || 31000 };
  }
  
  // Priority 3: To president (codes 28000-29999 OR text)
  if (maxActionCode >= 28000 && maxActionCode < 30000) {
    return { status: 'to_president', passedHouse: true, passedSenate: true, maxActionCode };
  }
  if (hasToPresidentText) {
    return { status: 'to_president', passedHouse: true, passedSenate: true, maxActionCode: maxActionCode || 28000 };
  }
  
  // Priority 4: Resolving differences (codes 19000-24999 OR text)
  if (maxActionCode >= 19000 && maxActionCode < 25000) {
    return { status: 'resolving_differences', passedHouse, passedSenate, maxActionCode };
  }
  if (hasConferenceText && passedHouse && passedSenate) {
    return { status: 'resolving_differences', passedHouse, passedSenate, maxActionCode };
  }
  
  // Priority 5: Passed both chambers
  if (passedHouse && passedSenate) {
    return { status: 'passed_both_chambers', passedHouse, passedSenate, maxActionCode };
  }
  
  // Priority 6: Passed one chamber
  if (passedHouse || passedSenate) {
    return { status: 'passed_one_chamber', passedHouse, passedSenate, maxActionCode };
  }
  
  return { status: 'introduced', passedHouse, passedSenate, maxActionCode: maxActionCode || null };
}

// Fetch bill actions - now fetches LAST page to get recent milestone actions
async function fetchBillActions(congress: number, billType: string, billNumber: number): Promise<Array<{ actionCode?: string; text?: string }>> {
  if (!CONGRESS_API_KEY) return [];
  
  try {
    // Step 1: Get total count of actions with a minimal request
    const countUrl = `https://api.congress.gov/v3/bill/${congress}/${billType.toLowerCase()}/${billNumber}/actions?api_key=${CONGRESS_API_KEY}&limit=1`;
    const countResponse = await fetch(countUrl);
    
    if (!countResponse.ok) return [];
    
    const countData = await countResponse.json();
    const totalCount = countData.pagination?.count || 0;
    
    if (totalCount === 0) return [];
    
    // Step 2: If few actions, just fetch all
    if (totalCount <= 250) {
      const url = `https://api.congress.gov/v3/bill/${congress}/${billType.toLowerCase()}/${billNumber}/actions?api_key=${CONGRESS_API_KEY}&limit=250`;
      const response = await fetch(url);
      if (!response.ok) return [];
      const data = await response.json();
      return data.actions || [];
    }
    
    // Step 3: For bills with many actions, fetch the LAST page to get recent actions
    // Congress.gov API returns actions oldest-first, so we need the last page for newest
    const lastPageOffset = Math.max(0, totalCount - 250);
    const lastPageUrl = `https://api.congress.gov/v3/bill/${congress}/${billType.toLowerCase()}/${billNumber}/actions?api_key=${CONGRESS_API_KEY}&limit=250&offset=${lastPageOffset}`;
    
    // Also fetch first page to get early passage actions
    const firstPageUrl = `https://api.congress.gov/v3/bill/${congress}/${billType.toLowerCase()}/${billNumber}/actions?api_key=${CONGRESS_API_KEY}&limit=250&offset=0`;
    
    const [lastPageResponse, firstPageResponse] = await Promise.all([
      fetch(lastPageUrl),
      fetch(firstPageUrl)
    ]);
    
    const allActions: Array<{ actionCode?: string; text?: string }> = [];
    
    if (firstPageResponse.ok) {
      const firstData = await firstPageResponse.json();
      allActions.push(...(firstData.actions || []));
    }
    
    if (lastPageResponse.ok && lastPageOffset > 0) {
      const lastData = await lastPageResponse.json();
      allActions.push(...(lastData.actions || []));
    }
    
    return allActions;
  } catch (err) {
    console.error(`[FetchBillActions] Error fetching actions:`, err);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { congress, batchSize = 50, force = false } = await req.json();
    
    if (!CONGRESS_API_KEY) {
      throw new Error('CONGRESS_GOV_API_KEY not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find bills that need status enrichment
    // If force=true, re-enrich ALL bills (not just those missing max_action_code)
    let query = supabase
      .from('bills')
      .select('id, bill_type, bill_number, congress, status, max_action_code, passed_house, passed_senate')
      .limit(batchSize);
    
    if (!force) {
      // Only bills missing action code data
      query = query.is('max_action_code', null);
    }
    
    if (congress) {
      query = query.eq('congress', congress);
    }
    
    const { data: bills, error: fetchError } = await query;
    
    if (fetchError) throw fetchError;
    
    if (!bills || bills.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        processed: 0,
        remaining: 0,
        message: 'No bills need status enrichment'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[FetchBillActions] Processing ${bills.length} bills for status enrichment (force=${force})`);
    
    let processed = 0;
    let updated = 0;
    
    for (const bill of bills) {
      try {
        const actions = await fetchBillActions(
          bill.congress || 119, 
          bill.bill_type || 'HR', 
          bill.bill_number || 0
        );
        
        if (actions.length === 0) {
          console.log(`[FetchBillActions] No actions found for ${bill.id}`);
          processed++;
          continue;
        }
        
        const result = deriveStatusFromActions(actions);
        
        // Build update object
        const updateData: Record<string, unknown> = {
          max_action_code: result.maxActionCode,
          passed_house: result.passedHouse,
          passed_senate: result.passedSenate,
          status_updated_at: new Date().toISOString(),
        };
        
        // Always update status when force=true, or when status advances
        const statusOrder = ['introduced', 'passed_one_chamber', 'passed_both_chambers', 'resolving_differences', 'to_president', 'veto_actions', 'became_law'];
        const oldStatusIndex = statusOrder.indexOf(bill.status || 'introduced');
        const newStatusIndex = statusOrder.indexOf(result.status);
        
        if (force || newStatusIndex > oldStatusIndex) {
          updateData.status = result.status;
        }
        
        const { error: updateError } = await supabase
          .from('bills')
          .update(updateData)
          .eq('id', bill.id);
        
        if (updateError) {
          console.error(`[FetchBillActions] Error updating ${bill.id}:`, updateError);
        } else {
          if (result.status !== bill.status) {
            console.log(`[FetchBillActions] ${bill.id}: ${bill.status} -> ${result.status} (code: ${result.maxActionCode})`);
            updated++;
          }
          processed++;
        }
        
        // Rate limiting - 150ms between API calls (2 calls per bill now)
        await new Promise(r => setTimeout(r, 150));
        
      } catch (err) {
        console.error(`[FetchBillActions] Error processing ${bill.id}:`, err);
      }
    }
    
    // Get remaining count - for force mode, count bills not yet processed in this run
    // (since we're just doing batches, remaining = total - processed in this batch isn't quite right)
    // Instead, just report total bills for the congress if force=true
    let remainingCount = 0;
    
    if (force && congress) {
      const { count: totalForCongress } = await supabase
        .from('bills')
        .select('*', { count: 'exact', head: true })
        .eq('congress', congress);
      remainingCount = Math.max(0, (totalForCongress || 0) - processed);
    } else if (!force) {
      const { count: needingEnrich } = await supabase
        .from('bills')
        .select('*', { count: 'exact', head: true })
        .is('max_action_code', null)
        .eq('congress', congress || 119);
      remainingCount = needingEnrich || 0;
    }

    console.log(`[FetchBillActions] Processed ${processed}, updated ${updated}, remaining ~${remainingCount}`);

    return new Response(JSON.stringify({
      success: true,
      processed,
      updated,
      remaining: remainingCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[FetchBillActions] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
