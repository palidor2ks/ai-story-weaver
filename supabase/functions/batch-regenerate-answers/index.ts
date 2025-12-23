import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Declare EdgeRuntime for Supabase Edge Functions
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface ProcessResult {
  candidateId: string;
  candidateName: string;
  previousAnswers: number;
  newAnswers: number;
  totalAnswers: number;
  success: boolean;
  error?: string;
}

// Track progress globally for shutdown logging
let globalProgress = {
  processed: 0,
  successful: 0,
  failed: 0,
  total: 0,
  currentCandidate: '',
  startTime: 0,
};

// Log progress on shutdown
addEventListener('beforeunload', (ev: Event) => {
  const detail = (ev as CustomEvent).detail;
  const elapsed = Math.round((Date.now() - globalProgress.startTime) / 60000 * 10) / 10;
  console.log(`=== SHUTDOWN (${detail?.reason || 'unknown'}) ===`);
  console.log(`Progress: ${globalProgress.processed}/${globalProgress.total} candidates`);
  console.log(`Success: ${globalProgress.successful}, Failed: ${globalProgress.failed}`);
  console.log(`Last processing: ${globalProgress.currentCandidate}`);
  console.log(`Elapsed: ${elapsed} minutes`);
});

async function processBatchInBackground(params: {
  batchSize: number;
  delayBetweenCandidates: number;
  delayBetweenBatches: number;
  maxCandidates: number;
  startFromId: string | null;
}) {
  const { batchSize, delayBetweenCandidates, delayBetweenBatches, maxCandidates, startFromId } = params;
  
  globalProgress.startTime = Date.now();
  
  console.log(`=== BACKGROUND BATCH REGENERATION STARTED ===`);
  console.log(`Parameters: batchSize=${batchSize}, maxCandidates=${maxCandidates || 'unlimited'}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Get total question count
    const { count: totalQuestions } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true });

    console.log(`Total questions in system: ${totalQuestions}`);

    // Get all candidates
    let candidatesQuery = supabase
      .from('candidates')
      .select('id, name, office, party, state')
      .order('id');

    if (startFromId) {
      candidatesQuery = candidatesQuery.gte('id', startFromId);
    }

    const { data: candidates, error: candidatesError } = await candidatesQuery;

    if (candidatesError) {
      throw new Error(`Failed to fetch candidates: ${candidatesError.message}`);
    }

    console.log(`Found ${candidates?.length || 0} candidates`);

    // Get answer counts for all candidates
    const { data: answerCounts, error: countError } = await supabase
      .from('candidate_answers')
      .select('candidate_id')
      .then(result => {
        if (result.error) return { data: null, error: result.error };
        
        // Count answers per candidate
        const counts: Record<string, number> = {};
        for (const row of result.data || []) {
          counts[row.candidate_id] = (counts[row.candidate_id] || 0) + 1;
        }
        return { data: counts, error: null };
      });

    if (countError) {
      throw new Error(`Failed to fetch answer counts: ${countError.message}`);
    }

    // Filter to candidates with missing answers
    const candidatesWithMissing = candidates?.filter(c => {
      const count = answerCounts?.[c.id] || 0;
      return count < (totalQuestions || 206);
    }) || [];

    console.log(`Candidates with missing answers: ${candidatesWithMissing.length}`);

    // Apply max limit if specified
    const candidatesToProcess = maxCandidates > 0 
      ? candidatesWithMissing.slice(0, maxCandidates)
      : candidatesWithMissing;

    globalProgress.total = candidatesToProcess.length;
    console.log(`Will process: ${candidatesToProcess.length} candidates`);

    const results: ProcessResult[] = [];

    // Process in batches
    for (let i = 0; i < candidatesToProcess.length; i += batchSize) {
      const batch = candidatesToProcess.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(candidatesToProcess.length / batchSize);
      
      console.log(`\n=== BATCH ${batchNum}/${totalBatches} (${batch.length} candidates) ===`);

      for (const candidate of batch) {
        const previousCount = answerCounts?.[candidate.id] || 0;
        
        globalProgress.currentCandidate = `${candidate.name} (${candidate.id})`;
        console.log(`[${globalProgress.processed + 1}/${globalProgress.total}] Processing ${candidate.name} - currently has ${previousCount} answers`);

        try {
          // Call get-candidate-answers function
          const response = await fetch(`${SUPABASE_URL}/functions/v1/get-candidate-answers`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              candidateId: candidate.id,
              candidateName: candidate.name,
              candidateParty: candidate.party,
              candidateOffice: candidate.office,
              candidateState: candidate.state,
              forceRegenerate: false, // Only generate missing answers
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          const result = await response.json();
          
          const newCount = result.existingCount + (result.generated || 0);
          
          results.push({
            candidateId: candidate.id,
            candidateName: candidate.name,
            previousAnswers: previousCount,
            newAnswers: result.generated || 0,
            totalAnswers: newCount,
            success: true,
          });

          globalProgress.successful++;
          console.log(`✓ ${candidate.name}: ${previousCount} → ${newCount} answers (+${result.generated || 0})`);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`✗ ${candidate.name}: ${errorMessage}`);
          
          results.push({
            candidateId: candidate.id,
            candidateName: candidate.name,
            previousAnswers: previousCount,
            newAnswers: 0,
            totalAnswers: previousCount,
            success: false,
            error: errorMessage,
          });

          globalProgress.failed++;
        }

        globalProgress.processed++;

        // Log progress every 10 candidates
        if (globalProgress.processed % 10 === 0) {
          const elapsed = Math.round((Date.now() - globalProgress.startTime) / 60000 * 10) / 10;
          const rate = globalProgress.processed / elapsed;
          const remaining = (globalProgress.total - globalProgress.processed) / rate;
          console.log(`📊 Progress: ${globalProgress.processed}/${globalProgress.total} (${globalProgress.successful} ✓, ${globalProgress.failed} ✗) - ${elapsed}min elapsed, ~${Math.round(remaining)}min remaining`);
        }

        // Delay between candidates (except for last one in batch)
        if (batch.indexOf(candidate) < batch.length - 1) {
          await delay(delayBetweenCandidates);
        }
      }

      // Delay between batches (except for last batch)
      if (i + batchSize < candidatesToProcess.length) {
        console.log(`Batch ${batchNum} complete. Waiting ${delayBetweenBatches}ms before next batch...`);
        await delay(delayBetweenBatches);
      }
    }

    const elapsedTime = Date.now() - globalProgress.startTime;
    const elapsedMinutes = Math.round(elapsedTime / 60000 * 10) / 10;

    console.log(`\n=== BATCH REGENERATION COMPLETE ===`);
    console.log(`Total processed: ${globalProgress.processed}`);
    console.log(`Successful: ${globalProgress.successful}`);
    console.log(`Failed: ${globalProgress.failed}`);
    console.log(`Elapsed time: ${elapsedMinutes} minutes`);

  } catch (error) {
    console.error('=== BATCH REGENERATION ERROR ===');
    console.error(error instanceof Error ? error.message : 'Unknown error');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const params = await req.json().catch(() => ({}));
    
    const config = {
      batchSize: params.batchSize || 5,
      delayBetweenCandidates: params.delayBetweenCandidates || 3000,
      delayBetweenBatches: params.delayBetweenBatches || 5000,
      maxCandidates: params.maxCandidates || 0, // 0 = no limit
      startFromId: params.startFromId || null,
    };

    console.log('Received batch regeneration request with config:', config);

    // Start background processing - DO NOT await
    EdgeRuntime.waitUntil(processBatchInBackground(config));

    // Return immediately
    return new Response(JSON.stringify({
      success: true,
      message: 'Batch regeneration started in background. Check logs for progress.',
      config,
      logsUrl: 'https://supabase.com/dashboard/project/ornnzinjrcyigazecctf/functions/batch-regenerate-answers/logs',
      tips: [
        'Progress is logged every 10 candidates',
        'Use maxCandidates to limit processing for testing',
        'Use startFromId to resume from a specific candidate',
      ],
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Request error:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
