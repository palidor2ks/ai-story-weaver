import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONGRESS_API_KEY = Deno.env.get('CONGRESS_GOV_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Status values from Congress.gov bill lifecycle - ordered by progression
const STATUS_ORDER = [
  'introduced',
  'passed_one_chamber', 
  'passed_both_chambers',
  'resolving_differences',
  'to_president',
  'veto_actions',
  'became_law'
] as const;

type BillStatus = typeof STATUS_ORDER[number];

// Derive bill status from latest action text (fallback when no action codes available)
function deriveStatus(latestActionText: string | null): BillStatus {
  if (!latestActionText) return 'introduced';
  const text = latestActionText.toLowerCase();
  
  if (text.includes('became public law') || text.includes('became law') || text.includes('signed by president')) {
    return 'became_law';
  }
  if (text.includes('vetoed') || text.includes('pocket veto') || text.includes('returned by the president without approval')) {
    return 'veto_actions';
  }
  if (text.includes('presented to president') || text.includes('presented to the president') || 
      text.includes('sent to president') || text.includes('cleared for white house')) {
    return 'to_president';
  }
  if (text.includes('conference') || text.includes('resolving differences')) {
    return 'resolving_differences';
  }
  if ((text.includes('passed house') && text.includes('passed senate')) || text.includes('passed both')) {
    return 'passed_both_chambers';
  }
  if (text.includes('passed house') || text.includes('passed senate') || 
      text.includes('agreed to in senate') || text.includes('agreed to in house') ||
      text.includes('motion to reconsider laid on the table') ||
      text.includes('received in the senate') || text.includes('received in the house') ||
      text.includes('placed on senate legislative calendar') ||
      text.includes('placed on the union calendar') ||
      text.includes('resolution agreed to') ||
      text.includes('on passage passed') ||
      text.includes('cloture invoked')) {
    return 'passed_one_chamber';
  }
  
  return 'introduced';
}

// Get status order index for comparison
function getStatusIndex(status: string | null): number {
  if (!status) return 0;
  const idx = STATUS_ORDER.indexOf(status as BillStatus);
  return idx >= 0 ? idx : 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { congress = 119, fromDateTime, limit = 250, skipIntroduced = true } = await req.json().catch(() => ({}));
    
    if (!CONGRESS_API_KEY) {
      throw new Error('CONGRESS_GOV_API_KEY not configured');
    }

    // Format date for Congress.gov API (requires format like 2025-01-01T00:00:00Z - no milliseconds)
    const formatDateForApi = (date: Date): string => {
      return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
    };

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Get or create sync status
    const { data: syncStatus } = await supabase
      .from('bill_sync_status')
      .select('*')
      .eq('sync_type', 'nightly')
      .single();
    
    // Update sync start time
    await supabase
      .from('bill_sync_status')
      .upsert({
        id: syncStatus?.id,
        sync_type: 'nightly',
        last_sync_started_at: new Date().toISOString(),
        bills_checked: 0,
        bills_updated: 0,
        new_bills_added: 0,
        error_message: null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    // Calculate fromDateTime if not provided (default: last 24 hours)
    // Format properly for Congress.gov API
    const defaultDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const syncFromDate = fromDateTime || formatDateForApi(defaultDate);
    
    console.log(`[NightlyBillSync] Syncing bills updated since ${syncFromDate}. skipIntroduced: ${skipIntroduced}`);

    let totalChecked = 0;
    let totalUpdated = 0;
    let totalNew = 0;
    let totalSkipped = 0;
    let totalMarkedForEnrich = 0;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      // Fetch bills updated since fromDateTime
      const url = `https://api.congress.gov/v3/bill/${congress}?api_key=${CONGRESS_API_KEY}&limit=${limit}&offset=${offset}&fromDateTime=${encodeURIComponent(syncFromDate)}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Congress.gov API error: ${response.status}`);
      }

      const data = await response.json();
      const bills = data.bills || [];
      const pagination = data.pagination || {};

      console.log(`[NightlyBillSync] Processing ${bills.length} bills (offset ${offset})`);
      totalChecked += bills.length;

      // Process each bill
      for (const bill of bills) {
        const type = (bill.type || 'HR').toUpperCase();
        const number = bill.number || 0;
        const id = `${type}.${number}`;
        const latestActionText = bill.latestAction?.text || null;
        const latestActionDate = bill.latestAction?.actionDate || null;
        const textDerivedStatus = deriveStatus(latestActionText);

        // Check if bill exists
        const { data: existingBill } = await supabase
          .from('bills')
          .select('id, status, latest_action_text, max_action_code, passed_house, passed_senate')
          .eq('id', id)
          .single();

        if (existingBill) {
          // CRITICAL FIX: Don't overwrite advanced status with text-only derived status
          // Only update status if it would ADVANCE, never regress
          const existingStatusIndex = getStatusIndex(existingBill.status);
          const newStatusIndex = getStatusIndex(textDerivedStatus);
          
          // Determine if we should update status
          let shouldUpdateStatus = false;
          let finalStatus = existingBill.status;
          
          // Only advance status, never regress
          if (newStatusIndex > existingStatusIndex) {
            shouldUpdateStatus = true;
            finalStatus = textDerivedStatus;
          }
          
          // Check if latest action changed (might indicate progression)
          const actionChanged = existingBill.latest_action_text !== latestActionText;
          
          // If action changed but we're not advancing status, mark for re-enrichment
          // This ensures the action history is re-fetched to get accurate status
          const needsReEnrich = actionChanged && !shouldUpdateStatus && existingBill.max_action_code !== null;
          
          if (actionChanged || shouldUpdateStatus) {
            const updateData: Record<string, unknown> = {
              latest_action_text: latestActionText,
              latest_action_date: latestActionDate,
              updated_at: new Date().toISOString()
            };
            
            if (shouldUpdateStatus) {
              updateData.status = finalStatus;
              updateData.status_updated_at = new Date().toISOString();
            }
            
            // Mark for re-enrichment if action changed significantly
            // Set max_action_code to null to trigger re-enrichment
            if (needsReEnrich) {
              updateData.max_action_code = null;
              totalMarkedForEnrich++;
            }
            
            const { error } = await supabase
              .from('bills')
              .update(updateData)
              .eq('id', id);
            
            if (!error) totalUpdated++;
          }
        } else {
          // NEW bills: Add all bills regardless of derived status
          // The text-based deriveStatus() can incorrectly return 'introduced' for bills
          // that have progressed (e.g., passed chamber but now in committee)
          // The fetch-bill-actions enrichment will determine accurate status

          // Insert new bill (it has progressed past introduction)
          const { error } = await supabase
            .from('bills')
            .insert({
              id,
              name: bill.title || `${type} ${number}`,
              bill_type: type,
              bill_number: number,
              congress: bill.congress || congress,
              topic: 'Government', // Will be enriched later
              chamber: type.startsWith('H') ? 'house' : 'senate',
              introduced_date: bill.introducedDate || null,
              status: textDerivedStatus,
              latest_action_text: latestActionText,
              latest_action_date: latestActionDate,
              status_updated_at: new Date().toISOString()
              // max_action_code is null - will be enriched by fetch-bill-actions
            });
          
          if (!error) totalNew++;
        }

        // Rate limiting
        await new Promise(r => setTimeout(r, 50));
      }

      hasMore = pagination.next !== null && pagination.next !== undefined;
      offset += bills.length;

      // Safety limit to prevent infinite loops
      if (offset > 10000) {
        console.warn('[NightlyBillSync] Safety limit reached, stopping');
        break;
      }
    }

    // Update sync completion status
    await supabase
      .from('bill_sync_status')
      .update({
        last_sync_completed_at: new Date().toISOString(),
        bills_checked: totalChecked,
        bills_updated: totalUpdated,
        new_bills_added: totalNew,
        updated_at: new Date().toISOString()
      })
      .eq('sync_type', 'nightly');

    console.log(`[NightlyBillSync] Complete. Checked: ${totalChecked}, Updated: ${totalUpdated}, New: ${totalNew}, Skipped: ${totalSkipped}, Marked for enrich: ${totalMarkedForEnrich}`);

    return new Response(JSON.stringify({
      success: true,
      congress,
      fromDateTime: syncFromDate,
      billsChecked: totalChecked,
      billsUpdated: totalUpdated,
      newBillsAdded: totalNew,
      skippedIntroduced: totalSkipped,
      markedForReEnrichment: totalMarkedForEnrich,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[NightlyBillSync] Error:', error);
    
    // Log error to sync status
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await supabase
      .from('bill_sync_status')
      .update({
        error_message: error instanceof Error ? error.message : 'Unknown error',
        updated_at: new Date().toISOString()
      })
      .eq('sync_type', 'nightly');

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
