import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { 
      batchSize = 5, 
      delayBetweenCandidates = 3000,
      delayBetweenBatches = 5000,
      maxCandidates = 0, // 0 = no limit
      startFromId = null // optional: resume from specific candidate ID
    } = await req.json().catch(() => ({}));

    console.log(`Starting batch regeneration: batchSize=${batchSize}, maxCandidates=${maxCandidates}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    console.log(`Will process: ${candidatesToProcess.length} candidates`);

    const results: ProcessResult[] = [];
    let processed = 0;
    let successful = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < candidatesToProcess.length; i += batchSize) {
      const batch = candidatesToProcess.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(candidatesToProcess.length / batchSize);
      
      console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} candidates)`);

      for (const candidate of batch) {
        const previousCount = answerCounts?.[candidate.id] || 0;
        
        console.log(`Processing ${candidate.name} (${candidate.id}) - currently has ${previousCount} answers`);

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

          successful++;
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

          failed++;
        }

        processed++;

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

    const elapsedTime = Date.now() - startTime;
    const elapsedMinutes = Math.round(elapsedTime / 60000 * 10) / 10;

    const summary = {
      success: true,
      totalCandidates: candidates?.length || 0,
      candidatesWithMissingAnswers: candidatesWithMissing.length,
      processed,
      successful,
      failed,
      totalQuestionsPerCandidate: totalQuestions,
      elapsedTimeMs: elapsedTime,
      elapsedMinutes,
      results: results.slice(0, 50), // Only include first 50 results in response
      hasMoreResults: results.length > 50,
    };

    console.log(`Batch regeneration complete: ${successful} successful, ${failed} failed, ${elapsedMinutes} minutes`);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Batch regeneration error:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      elapsedTimeMs: Date.now() - startTime,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
