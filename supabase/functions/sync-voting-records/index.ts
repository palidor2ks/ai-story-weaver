import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { mode = 'all', candidateId } = await req.json().catch(() => ({}));

    console.log(`[sync-voting-records] Starting sync with mode: ${mode}`);

    // If syncing a single candidate
    if (mode === 'single' && candidateId) {
      console.log(`[sync-voting-records] Syncing single member: ${candidateId}`);
      
      const response = await fetch(`${supabaseUrl}/functions/v1/fetch-member-votes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ bioguideId: candidateId, persistVotes: true }),
      });

      const result = await response.json();
      
      return new Response(JSON.stringify({
        success: true,
        mode: 'single',
        candidateId,
        votesCount: result.votesCount || 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all federal legislators (bioguide IDs match pattern ^[A-Z][0-9]{6}$)
    // PostgREST doesn't support regex, so we fetch and filter in JS
    const { data: allCandidates, error: legError } = await supabase
      .from('candidates')
      .select('id, name')
      .order('name');

    // Filter to bioguide IDs (one uppercase letter + 6 digits)
    const bioguidePattern = /^[A-Z][0-9]{6}$/;
    const legislators = (allCandidates || []).filter(c => bioguidePattern.test(c.id));

    if (legError) {
      console.error('[sync-voting-records] Error fetching legislators:', legError);
      throw legError;
    }

    console.log(`[sync-voting-records] Found ${legislators?.length || 0} federal legislators to sync`);

    // For incremental mode, check which already have votes
    let membersToSync = legislators || [];
    if (mode === 'incremental') {
      const { data: existingVotes } = await supabase
        .from('votes')
        .select('candidate_id');

      const candidatesWithVotes = new Set(existingVotes?.map(v => v.candidate_id) || []);
      membersToSync = membersToSync.filter(m => !candidatesWithVotes.has(m.id));
      console.log(`[sync-voting-records] Incremental mode: ${membersToSync.length} members without votes`);
    }

    // Return immediately and process in background
    const totalMembers = membersToSync.length;
    
    // Use EdgeRuntime.waitUntil for background processing
    const backgroundProcess = async () => {
      let synced = 0;
      let errors = 0;
      const BATCH_SIZE = 5;
      const DELAY_MS = 1000;

      for (let i = 0; i < membersToSync.length; i += BATCH_SIZE) {
        const batch = membersToSync.slice(i, i + BATCH_SIZE);
        
        const results = await Promise.allSettled(
          batch.map(async (member) => {
            try {
              const response = await fetch(`${supabaseUrl}/functions/v1/fetch-member-votes`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({ bioguideId: member.id, persistVotes: true }),
              });

              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }

              const data = await response.json();
              console.log(`[sync-voting-records] Synced ${member.name}: ${data.votesCount || 0} votes`);
              return data;
            } catch (err) {
              console.error(`[sync-voting-records] Error syncing ${member.name}:`, err);
              throw err;
            }
          })
        );

        results.forEach(r => {
          if (r.status === 'fulfilled') {
            synced++;
          } else {
            errors++;
          }
        });

        console.log(`[sync-voting-records] Progress: ${synced + errors}/${totalMembers} (${errors} errors)`);

        // Delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < membersToSync.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
      }

      console.log(`[sync-voting-records] Complete! Synced: ${synced}, Errors: ${errors}`);
    };

    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(backgroundProcess());
    } else {
      // Fallback for non-Edge environments (shouldn't happen in production)
      backgroundProcess();
    }

    return new Response(JSON.stringify({
      success: true,
      mode,
      totalMembers,
      message: `Started background sync for ${totalMembers} federal legislators. Check edge function logs for progress.`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[sync-voting-records] Error:', error);
    return new Response(JSON.stringify({
      error: errorMessage,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
