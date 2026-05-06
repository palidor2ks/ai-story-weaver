import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONGRESS_API_KEY = Deno.env.get('CONGRESS_GOV_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Canonical topics for normalization
const TOPIC_NORMALIZATION: Record<string, string> = {
  'Agriculture and Food': 'Economy',
  'Commerce': 'Economy',
  'Economics and Public Finance': 'Economy',
  'Finance and Financial Sector': 'Economy',
  'Foreign Trade and International Finance': 'Economy',
  'Labor and Employment': 'Economy',
  'Taxation': 'Economy',
  'Transportation and Public Works': 'Economy',
  'Health': 'Healthcare',
  'Families': 'Healthcare',
  'Energy': 'Environment',
  'Environmental Protection': 'Environment',
  'Public Lands and Natural Resources': 'Environment',
  'Water Resources Development': 'Environment',
  'Animals': 'Environment',
  'Armed Forces and National Security': 'Defense',
  'International Affairs': 'Defense',
  'Emergency Management': 'Defense',
  'Civil Rights and Liberties, Minority Issues': 'Civil Rights',
  'Crime and Law Enforcement': 'Civil Rights',
  'Law': 'Civil Rights',
  'Native Americans': 'Civil Rights',
  'Education': 'Education',
  'Social Sciences and History': 'Education',
  'Social Welfare': 'Social Programs',
  'Housing and Community Development': 'Social Programs',
  'Congress': 'Government',
  'Government Operations and Politics': 'Government',
  'Science, Technology, Communications': 'Technology',
};

function normalizeTopic(policyArea: string | null): string {
  if (!policyArea) return 'Government';
  return TOPIC_NORMALIZATION[policyArea] || 'Government';
}

function getChamberFromBillType(billType: string): string {
  const type = billType.toLowerCase();
  if (type.startsWith('h')) return 'house';
  if (type.startsWith('s')) return 'senate';
  return 'house';
}

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

// Derive bill status from latest action text
function deriveStatus(latestActionText: string | null): BillStatus {
  if (!latestActionText) return 'introduced';
  const text = latestActionText.toLowerCase();
  
  // Check for law status first (most definitive)
  if (text.includes('became public law') || 
      text.includes('became law') || 
      text.includes('signed by president') ||
      text.includes('public law no.')) {
    return 'became_law';
  }
  
  // Check for veto actions
  if (text.includes('vetoed') || text.includes('pocket veto') || text.includes('veto message')) {
    return 'veto_actions';
  }
  
  // Check if presented to president
  if (text.includes('presented to president') || 
      text.includes('sent to president') ||
      text.includes('to the president') ||
      text.includes('cleared for white house')) {
    return 'to_president';
  }
  
  // Check for conference/resolving differences
  if (text.includes('conference') || 
      text.includes('resolving differences') ||
      text.includes('conferees') ||
      text.includes('house amendment to senate amendment') ||
      text.includes('senate amendment to house amendment')) {
    return 'resolving_differences';
  }
  
  // Check for passed both chambers - look for specific phrases
  const passedHouse = text.includes('passed house') || 
                      text.includes('agreed to in house') ||
                      text.includes('house agreed to');
  const passedSenate = text.includes('passed senate') || 
                       text.includes('agreed to in senate') ||
                       text.includes('senate agreed to');
  
  if (passedHouse && passedSenate) {
    return 'passed_both_chambers';
  }
  
  // Check for passed one chamber - multiple indicators
  if (passedHouse || passedSenate || 
      text.includes('motion to reconsider laid on the table') ||
      text.includes('received in the senate') ||
      text.includes('received in the house') ||
      text.includes('message on senate action') ||
      text.includes('message on house action') ||
      text.includes('placed on senate legislative calendar') ||
      text.includes('placed on the union calendar') ||
      text.includes('placed on the calendar') ||
      text.includes('held at the desk') ||
      text.includes('resolution agreed to') ||
      text.includes('agreed to without objection') ||
      text.includes('passed without objection') ||
      text.includes('on agreeing to the resolution agreed to') ||
      text.includes('on passage passed') ||
      text.includes('cloture on the motion to proceed') ||
      text.includes('cloture invoked') ||
      text.includes('read the second time')) {
    return 'passed_one_chamber';
  }
  
  return 'introduced';
}

interface BillData {
  id: string;
  name: string;
  bill_type: string;
  bill_number: number;
  congress: number;
  topic: string;
  chamber: string;
  introduced_date: string | null;
  summary: string | null;
  status: BillStatus;
  latest_action_text: string | null;
  latest_action_date: string | null;
  status_updated_at: string;
}

async function fetchBillSummary(congress: number, billType: string, billNumber: number): Promise<string | null> {
  if (!CONGRESS_API_KEY) return null;
  
  try {
    const url = `https://api.congress.gov/v3/bill/${congress}/${billType.toLowerCase()}/${billNumber}/summaries?api_key=${CONGRESS_API_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const summaries = data.summaries || [];
    
    if (summaries.length === 0) return '[NO_SUMMARY]';
    
    const latestSummary = summaries[summaries.length - 1];
    return latestSummary.text || '[NO_SUMMARY]';
  } catch {
    return null;
  }
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
    const { congress, billType, offset = 0, limit = 250, fetchSummaries = false, excludeIntroduced = false } = await req.json();
    
    if (!congress || congress < 111 || congress > 119) {
      throw new Error('Congress must be between 111 and 119');
    }
    
    if (!CONGRESS_API_KEY) {
      throw new Error('CONGRESS_GOV_API_KEY not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get or create ingestion status for tracking resumable progress
    const { data: existingStatus } = await supabase
      .from('bill_ingestion_status')
      .select('*')
      .eq('congress', congress)
      .single();

    // Initialize or update ingestion status at start
    if (offset === 0) {
      await supabase
        .from('bill_ingestion_status')
        .upsert({
          congress,
          last_offset: 0,
          total_fetched: 0,
          total_inserted: 0,
          total_filtered: 0,
          total_available: null,
          status: 'in_progress',
          started_at: new Date().toISOString(),
          completed_at: null,
          error_message: null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'congress' });
    }

    // Build API URL
    let url = `https://api.congress.gov/v3/bill/${congress}?api_key=${CONGRESS_API_KEY}&limit=${limit}&offset=${offset}`;
    if (billType) {
      url = `https://api.congress.gov/v3/bill/${congress}/${billType.toLowerCase()}?api_key=${CONGRESS_API_KEY}&limit=${limit}&offset=${offset}`;
    }

    console.log(`[FetchAllBills] Fetching from Congress ${congress}, offset ${offset}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Congress.gov API error: ${response.status}`);
    }

    const data = await response.json();
    const bills = data.bills || [];
    const pagination = data.pagination || {};

    console.log(`[FetchAllBills] Received ${bills.length} bills`);

    // Transform bills to our schema
    const billsToInsert: BillData[] = [];
    const now = new Date().toISOString();
    let skippedCount = 0;
    
    for (const bill of bills) {
      const type = (bill.type || 'HR').toUpperCase();
      const number = bill.number || 0;
      const id = `${congress}-${type}.${number}`;
      const latestActionText = bill.latestAction?.text || null;
      const latestActionDate = bill.latestAction?.actionDate || null;
      const derivedStatus = deriveStatus(latestActionText);
      
      // Filter out bills that haven't passed at least one chamber
      if (excludeIntroduced && derivedStatus === 'introduced') {
        skippedCount++;
        continue;
      }
      
      billsToInsert.push({
        id,
        name: bill.title || `${type} ${number}`,
        bill_type: type,
        bill_number: number,
        congress: bill.congress || congress,
        topic: normalizeTopic(bill.policyArea?.name),
        chamber: getChamberFromBillType(type),
        introduced_date: bill.introducedDate || null,
        summary: null, // Summaries fetched separately if requested
        status: derivedStatus,
        latest_action_text: latestActionText,
        latest_action_date: latestActionDate,
        status_updated_at: now,
      });
    }
    
    console.log(`[FetchAllBills] Filtered: ${billsToInsert.length} bills to insert, ${skippedCount} skipped (introduced only)`);

    // Optionally fetch summaries (slower but complete)
    if (fetchSummaries && billsToInsert.length > 0) {
      console.log(`[FetchAllBills] Fetching summaries for ${billsToInsert.length} bills...`);
      
      for (let i = 0; i < billsToInsert.length; i++) {
        const bill = billsToInsert[i];
        bill.summary = await fetchBillSummary(bill.congress, bill.bill_type, bill.bill_number);
        
        // Rate limiting
        if (i < billsToInsert.length - 1) {
          await new Promise(r => setTimeout(r, 100));
        }
      }
    }

    // Upsert bills
    if (billsToInsert.length > 0) {
      const { error: upsertError } = await supabase
        .from('bills')
        .upsert(billsToInsert, { 
          onConflict: 'id',
          ignoreDuplicates: false 
        });

      if (upsertError) {
        console.error('[FetchAllBills] Upsert error:', upsertError);
        throw upsertError;
      }
    }

    const hasMore = pagination.next !== null && pagination.next !== undefined;
    const nextOffset = offset + bills.length;
    const totalAvailable = pagination.count || null;

    // Calculate running totals from existing status
    const runningFetched = (existingStatus?.total_fetched || 0) + bills.length;
    const runningInserted = (existingStatus?.total_inserted || 0) + billsToInsert.length;
    const runningFiltered = (existingStatus?.total_filtered || 0) + skippedCount;

    // Update ingestion status with progress
    await supabase
      .from('bill_ingestion_status')
      .upsert({
        congress,
        last_offset: nextOffset,
        total_fetched: runningFetched,
        total_inserted: runningInserted,
        total_filtered: runningFiltered,
        total_available: totalAvailable,
        status: hasMore ? 'in_progress' : 'complete',
        completed_at: hasMore ? null : new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'congress' });

    console.log(`[FetchAllBills] Inserted ${billsToInsert.length} bills. Has more: ${hasMore}. Running total: ${runningInserted}`);

    return new Response(JSON.stringify({
      success: true,
      congress,
      inserted: billsToInsert.length,
      filtered: skippedCount,
      offset,
      nextOffset: hasMore ? nextOffset : null,
      hasMore,
      totalCount: totalAvailable,
      // Resumable info
      runningTotals: {
        fetched: runningFetched,
        inserted: runningInserted,
        filtered: runningFiltered,
      },
      isResumable: true,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[FetchAllBills] Error:', error);
    
    // Try to update ingestion status with error
    try {
      const { congress } = await req.clone().json().catch(() => ({}));
      if (congress) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await supabase
          .from('bill_ingestion_status')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            updated_at: new Date().toISOString()
          })
          .eq('congress', congress);
      }
    } catch {
      // Ignore errors during error handling
    }

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
