import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 10;
    
    console.log(`Starting batch-populate-answers with batch size: ${batchSize}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get stats before processing
    const { count: totalCandidates } = await supabase
      .from('candidates')
      .select('id', { count: 'exact', head: true });

    const { count: pendingCandidates } = await supabase
      .from('candidates')
      .select('id', { count: 'exact', head: true })
      .is('last_answers_sync', null);

    const { count: syncedCandidates } = await supabase
      .from('candidates')
      .select('id', { count: 'exact', head: true })
      .not('last_answers_sync', 'is', null);

    console.log(`Stats: ${totalCandidates} total, ${pendingCandidates} pending, ${syncedCandidates} synced`);

    // Call the populate-candidate-answers function
    const populateResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/populate-candidate-answers`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          processAll: true,
          batchSize: batchSize,
        }),
      }
    );

    if (!populateResponse.ok) {
      const errorText = await populateResponse.text();
      console.error('Failed to call populate-candidate-answers:', errorText);
      throw new Error(`populate-candidate-answers failed: ${populateResponse.status}`);
    }

    const populateResult = await populateResponse.json();
    
    const processingTime = Date.now() - startTime;
    
    // Get updated stats
    const { count: newPendingCount } = await supabase
      .from('candidates')
      .select('id', { count: 'exact', head: true })
      .is('last_answers_sync', null);

    const { count: totalAnswers } = await supabase
      .from('candidate_answers')
      .select('id', { count: 'exact', head: true });

    const result = {
      success: true,
      batch: {
        size: batchSize,
        processed: populateResult.summary?.candidatesProcessed || 0,
        answersCreated: populateResult.summary?.totalAnswersCreated || 0,
        errors: populateResult.summary?.totalErrors || 0,
      },
      progress: {
        totalCandidates: totalCandidates || 0,
        pendingBefore: pendingCandidates || 0,
        pendingAfter: newPendingCount || 0,
        syncedTotal: (totalCandidates || 0) - (newPendingCount || 0),
        percentComplete: totalCandidates 
          ? Math.round((((totalCandidates || 0) - (newPendingCount || 0)) / totalCandidates) * 100)
          : 0,
      },
      totalAnswersInDb: totalAnswers || 0,
      processingTimeMs: processingTime,
      nextRunEstimate: newPendingCount && newPendingCount > 0 
        ? `${Math.ceil((newPendingCount || 0) / batchSize)} more batches needed`
        : 'All candidates synced!',
    };

    console.log(`Batch complete:`, JSON.stringify(result, null, 2));

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in batch-populate-answers:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        processingTimeMs: Date.now() - startTime,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
