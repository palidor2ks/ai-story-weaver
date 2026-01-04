import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// congress-legislators repo has bioguide to LIS mappings
const LEGISLATORS_CURRENT_URL = 'https://theunitedstates.io/congress-legislators/legislators-current.json';
const LEGISLATORS_HISTORICAL_URL = 'https://theunitedstates.io/congress-legislators/legislators-historical.json';

interface LegislatorId {
  bioguide: string;
  lis?: string;
  govtrack?: number;
  thomas?: string;
}

interface Legislator {
  id: LegislatorId;
  name: {
    first: string;
    last: string;
    official_full?: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('[sync-lis-member-ids] Fetching legislators data from congress-legislators repo...');
    
    // Fetch both current and historical legislators
    const [currentRes, historicalRes] = await Promise.all([
      fetch(LEGISLATORS_CURRENT_URL),
      fetch(LEGISLATORS_HISTORICAL_URL),
    ]);
    
    if (!currentRes.ok) {
      throw new Error(`Failed to fetch current legislators: ${currentRes.status}`);
    }
    
    const currentLegislators: Legislator[] = await currentRes.json();
    console.log(`[sync-lis-member-ids] Fetched ${currentLegislators.length} current legislators`);
    
    // Historical is optional (large file)
    let historicalLegislators: Legislator[] = [];
    if (historicalRes.ok) {
      historicalLegislators = await historicalRes.json();
      console.log(`[sync-lis-member-ids] Fetched ${historicalLegislators.length} historical legislators`);
    }
    
    // Combine and create bioguide -> lis mapping
    const allLegislators = [...currentLegislators, ...historicalLegislators];
    const lisMapping = new Map<string, string>();
    
    for (const leg of allLegislators) {
      if (leg.id.bioguide && leg.id.lis) {
        lisMapping.set(leg.id.bioguide, leg.id.lis);
      }
    }
    
    console.log(`[sync-lis-member-ids] Found ${lisMapping.size} bioguide -> LIS mappings`);
    
    // Get all senators in our candidates table
    const { data: senators, error: fetchError } = await supabase
      .from('candidates')
      .select('id, name, office, lis_member_id')
      .ilike('office', '%senator%');
    
    if (fetchError) {
      throw new Error(`Failed to fetch senators: ${fetchError.message}`);
    }
    
    console.log(`[sync-lis-member-ids] Found ${senators?.length || 0} senators in candidates table`);
    
    let updated = 0;
    let alreadySet = 0;
    let notFound = 0;
    
    for (const senator of senators || []) {
      const lisId = lisMapping.get(senator.id);
      
      if (!lisId) {
        console.log(`[sync-lis-member-ids] No LIS ID found for ${senator.name} (${senator.id})`);
        notFound++;
        continue;
      }
      
      if (senator.lis_member_id === lisId) {
        alreadySet++;
        continue;
      }
      
      const { error: updateError } = await supabase
        .from('candidates')
        .update({ lis_member_id: lisId })
        .eq('id', senator.id);
      
      if (updateError) {
        console.error(`[sync-lis-member-ids] Failed to update ${senator.name}: ${updateError.message}`);
      } else {
        console.log(`[sync-lis-member-ids] Updated ${senator.name} with LIS ID: ${lisId}`);
        updated++;
      }
    }
    
    const result = {
      success: true,
      totalSenators: senators?.length || 0,
      updated,
      alreadySet,
      notFound,
      totalMappingsAvailable: lisMapping.size,
    };
    
    console.log('[sync-lis-member-ids] Completed:', result);
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[sync-lis-member-ids] Error:', message);
    
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
