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
  
  for (const action of actions) {
    const code = parseInt(action.actionCode || '0');
    if (!isNaN(code) && code > maxActionCode) {
      maxActionCode = code;
    }
    
    const text = (action.text || '').toLowerCase();
    
    // Check for House passage (action codes 8000-8999 or text patterns)
    if (code >= 8000 && code < 9000) {
      passedHouse = true;
    }
    if (text.includes('passed house') || 
        text.includes('on passage passed') && text.includes('house') ||
        text.includes('motion to reconsider laid on the table')) {
      passedHouse = true;
    }
    
    // Check for Senate passage (action codes 17000-17999 or text patterns)
    if (code >= 17000 && code < 18000) {
      passedSenate = true;
    }
    if (text.includes('passed senate') || 
        text.includes('on passage passed') && text.includes('senate')) {
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
  
  // Determine final status based on action codes and passage flags
  // Became law: codes 36000-45000
  if (maxActionCode >= 36000 && maxActionCode <= 45000) {
    return { status: 'became_law', passedHouse, passedSenate, maxActionCode };
  }
  
  // Check for law by text patterns
  for (const action of actions) {
    const text = (action.text || '').toLowerCase();
    if (text.includes('became public law') || text.includes('became law') || text.includes('signed by president')) {
      return { status: 'became_law', passedHouse: true, passedSenate: true, maxActionCode };
    }
  }
  
  // Veto actions: codes 30000-35000
  if (maxActionCode >= 30000 && maxActionCode < 36000) {
    return { status: 'veto_actions', passedHouse, passedSenate, maxActionCode };
  }
  
  // To president: code 28000
  if (maxActionCode >= 28000 && maxActionCode < 30000) {
    return { status: 'to_president', passedHouse: true, passedSenate: true, maxActionCode };
  }
  
  // Check for to president by text
  for (const action of actions) {
    const text = (action.text || '').toLowerCase();
    if (text.includes('presented to president') || text.includes('sent to president') || text.includes('cleared for white house')) {
      return { status: 'to_president', passedHouse: true, passedSenate: true, maxActionCode };
    }
  }
  
  // Resolving differences: codes 19000-24000
  if (maxActionCode >= 19000 && maxActionCode < 25000) {
    return { status: 'resolving_differences', passedHouse, passedSenate, maxActionCode };
  }
  
  // Check for conference by text
  for (const action of actions) {
    const text = (action.text || '').toLowerCase();
    if (text.includes('conference') || text.includes('conferees')) {
      return { status: 'resolving_differences', passedHouse, passedSenate, maxActionCode };
    }
  }
  
  // Passed both chambers
  if (passedHouse && passedSenate) {
    return { status: 'passed_both_chambers', passedHouse, passedSenate, maxActionCode };
  }
  
  // Passed one chamber
  if (passedHouse || passedSenate) {
    return { status: 'passed_one_chamber', passedHouse, passedSenate, maxActionCode };
  }
  
  return { status: 'introduced', passedHouse, passedSenate, maxActionCode: maxActionCode || null };
}

async function fetchBillActions(congress: number, billType: string, billNumber: number): Promise<Array<{ actionCode?: string; text?: string }>> {
  if (!CONGRESS_API_KEY) return [];
  
  try {
    const url = `https://api.congress.gov/v3/bill/${congress}/${billType.toLowerCase()}/${billNumber}/actions?api_key=${CONGRESS_API_KEY}&limit=100`;
    const response = await fetch(url);
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.actions || [];
  } catch {
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

    console.log(`[FetchBillActions] Processing ${bills.length} bills for status enrichment`);
    
    let processed = 0;
    let updated = 0;
    
    for (const bill of bills) {
      try {
        const actions = await fetchBillActions(
          bill.congress || 119, 
          bill.bill_type || 'HR', 
          bill.bill_number || 0
        );
        
        const result = deriveStatusFromActions(actions);
        
        // Only update if status changed or we got new data
        const updateData: Record<string, unknown> = {
          max_action_code: result.maxActionCode,
          passed_house: result.passedHouse,
          passed_senate: result.passedSenate,
        };
        
        // Only update status if it changed to a more advanced status
        if (result.status !== bill.status && result.status !== 'introduced') {
          updateData.status = result.status;
          updateData.status_updated_at = new Date().toISOString();
        }
        
        const { error: updateError } = await supabase
          .from('bills')
          .update(updateData)
          .eq('id', bill.id);
        
        if (updateError) {
          console.error(`[FetchBillActions] Error updating ${bill.id}:`, updateError);
        } else {
          if (result.status !== bill.status) {
            console.log(`[FetchBillActions] ${bill.id}: ${bill.status} -> ${result.status}`);
            updated++;
          }
          processed++;
        }
        
        // Rate limiting - 100ms between API calls
        await new Promise(r => setTimeout(r, 100));
        
      } catch (err) {
        console.error(`[FetchBillActions] Error processing ${bill.id}:`, err);
      }
    }
    
    // Get remaining count based on force mode
    let remainingQuery = supabase
      .from('bills')
      .select('*', { count: 'exact', head: true });
    
    if (!force) {
      remainingQuery = remainingQuery.is('max_action_code', null);
    }
    
    if (congress) {
      remainingQuery = remainingQuery.eq('congress', congress);
    }
    
    const { count: remaining } = await remainingQuery;

    console.log(`[FetchBillActions] Processed ${processed}, updated ${updated}, remaining ${remaining}`);

    return new Response(JSON.stringify({
      success: true,
      processed,
      updated,
      remaining: remaining || 0,
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
