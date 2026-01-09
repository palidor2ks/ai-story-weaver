import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BillToSummarize {
  bill_id: string;
  bill_name: string;
  congress: number | null;
  action_type: string | null;
}

// Configuration for parallel processing
const CONCURRENT_AI_CALLS = 3;
const DELAY_BETWEEN_CALLS = 100; // 100ms between parallel batches

// Detect floor vote type and return specialized prompt
function getFloorVotePrompt(billId: string, billName: string): string | null {
  // Only handle procedural votes (VOTE-xxx format)
  if (!billId.startsWith('VOTE-') && !billId.startsWith('vote-')) {
    return null;
  }
  
  const nameLower = billName.toLowerCase();
  
  // Confirmation votes
  if (nameLower.includes('confirmation') || nameLower.includes('nomination')) {
    return `This is a Senate confirmation vote. Generate a 2-3 sentence summary that:
1. Identifies WHO is being confirmed (extract the nominee's name from the title)
2. Identifies WHAT position they are being confirmed to
3. Briefly notes the political significance of this confirmation (e.g., judicial ideology, cabinet role)

Vote: ${billName}

Focus on factual information. If the nominee or position is unclear from the title, describe what you can determine.`;
  }
  
  // Cloture votes
  if (nameLower.includes('cloture') || nameLower.includes('motion to invoke')) {
    return `This is a cloture vote in Congress. Generate a 2-3 sentence summary that:
1. Explains that cloture is a procedural vote to end debate and proceed to a final vote
2. Identifies what legislation or nomination this cloture vote relates to (if apparent from the title)
3. Notes why cloture votes matter (they require 60 votes in the Senate to overcome a filibuster)

Vote: ${billName}

Use neutral, educational language.`;
  }
  
  // Motion to proceed
  if (nameLower.includes('motion to proceed') || nameLower.includes('motion to table')) {
    return `This is a procedural motion vote. Generate a 2-3 sentence summary that:
1. Explains what this procedural motion does (e.g., motion to proceed brings a bill to the floor for debate)
2. Identifies what legislation this motion relates to (if apparent from the title)
3. Notes the procedural significance

Vote: ${billName}

Use neutral, educational language.`;
  }
  
  // Passage/Amendment votes on the floor
  if (nameLower.includes('on passage') || nameLower.includes('on agreeing') || nameLower.includes('on the amendment')) {
    return `This is a floor vote on legislation or an amendment. Generate a 2-3 sentence summary that:
1. Identifies whether this is a passage vote or amendment vote
2. Describes what the legislation/amendment appears to address based on the title
3. Notes any relevant context if apparent

Vote: ${billName}

Focus on what the vote is about, using neutral language.`;
  }
  
  // Generic procedural vote
  return `This is a procedural floor vote in Congress. Generate a 2-3 sentence summary that:
1. Describes what type of procedural action this vote represents
2. Identifies the subject matter if apparent from the title
3. Explains the procedural significance in plain language

Vote: ${billName}

Use neutral, educational language that helps citizens understand congressional procedure.`;
}

// Get prompt for regular bills (non-procedural)
function getBillPrompt(bill: BillToSummarize): string {
  return `Generate a 2-3 sentence summary of this bill:

Bill ID: ${bill.bill_id}
Bill Title: ${bill.bill_name}
Congress: ${bill.congress ? `${bill.congress}th` : 'Unknown'}

Focus on what the bill proposes to DO and identify the primary policy area. If you cannot determine what the bill does from the title alone, provide a general description based on the available information.`;
}

// Chunk array into smaller arrays for parallel processing
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Process a single bill/vote summary generation
async function generateSummary(
  bill: BillToSummarize, 
  lovableApiKey: string
): Promise<{ bill_id: string; success: boolean; summary?: string; error?: string }> {
  try {
    // Determine if this is a procedural vote and get appropriate prompt
    const floorVotePrompt = getFloorVotePrompt(bill.bill_id, bill.bill_name);
    const prompt = floorVotePrompt || getBillPrompt(bill);
    
    const systemPrompt = floorVotePrompt 
      ? 'You are a legislative research assistant explaining congressional procedures. Generate clear, factual summaries that help citizens understand how Congress works.'
      : 'You are a legislative research assistant. Generate brief, factual bill summaries. Use neutral language and focus on what bills propose to do.';

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        max_tokens: 300,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return { bill_id: bill.bill_id, success: false, error: 'Rate limit exceeded - try again later' };
      }
      if (aiResponse.status === 402) {
        return { bill_id: bill.bill_id, success: false, error: 'Payment required - add credits to Lovable AI' };
      }
      const errorText = await aiResponse.text();
      return { bill_id: bill.bill_id, success: false, error: `AI Gateway error (${aiResponse.status}): ${errorText}` };
    }

    const aiData = await aiResponse.json();
    const generatedSummary = aiData.choices?.[0]?.message?.content?.trim();

    if (!generatedSummary) {
      return { bill_id: bill.bill_id, success: false, error: 'No summary generated' };
    }

    // Prefix with [AI] marker for regular bills, [AI-PROC] for procedural votes
    const prefix = floorVotePrompt ? '[AI-PROC]' : '[AI]';
    return { 
      bill_id: bill.bill_id, 
      success: true, 
      summary: `${prefix} ${generatedSummary}` 
    };
  } catch (error) {
    return { 
      bill_id: bill.bill_id, 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // INCREASED default batch size from 10 to 25
    const { batchSize = 25, dryRun = false, includeProceduralVotes = true } = await req.json().catch(() => ({}));

    // Build query for bills needing AI summaries
    // [NO_SUMMARY] = CRS had no summary, needs AI
    // Also include procedural votes that need summaries
    let query = supabase
      .from('votes')
      .select('bill_id, bill_name, congress, action_type')
      .eq('bill_summary', '[NO_SUMMARY]')
      .not('congress', 'is', null)
      .limit(batchSize);
    
    // No longer exclude VOTE-% by default - we now generate AI summaries for procedural votes
    // The old filter was: .not('bill_id', 'ilike', 'VOTE-%')

    const { data: billsToProcess, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch bills: ${fetchError.message}`);
    }

    if (!billsToProcess || billsToProcess.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No bills need AI summaries',
          processed: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deduplicate by bill_id + congress
    const uniqueBills = new Map<string, BillToSummarize>();
    for (const bill of billsToProcess) {
      const key = `${bill.bill_id}-${bill.congress}`;
      if (!uniqueBills.has(key)) {
        uniqueBills.set(key, bill);
      }
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `[DRY RUN] Would process ${uniqueBills.size} unique bills`,
          processed: uniqueBills.size,
          failed: 0,
          results: Array.from(uniqueBills.values()).map(b => ({ 
            bill_id: b.bill_id, 
            success: true, 
            summary: '[DRY RUN]',
            isProceduralVote: b.bill_id.startsWith('VOTE-')
          }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: Array<{ bill_id: string; success: boolean; summary?: string; error?: string; isProceduralVote?: boolean }> = [];
    const billsArray = Array.from(uniqueBills.values());
    
    // Process in parallel chunks
    const chunks = chunk(billsArray, CONCURRENT_AI_CALLS);
    
    for (const batch of chunks) {
      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(bill => generateSummary(bill, LOVABLE_API_KEY))
      );
      
      // Update database for successful results
      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        const bill = batch[i];
        
        if (result.success && result.summary) {
          const { error: updateError } = await supabase
            .from('votes')
            .update({ 
              bill_summary: result.summary,
              summary_fetched_at: new Date().toISOString()
            })
            .eq('bill_id', bill.bill_id)
            .eq('congress', bill.congress)
            .eq('bill_summary', '[NO_SUMMARY]');

          if (updateError) {
            result.success = false;
            result.error = `Update failed: ${updateError.message}`;
          }
        }
        
        results.push({
          ...result,
          isProceduralVote: bill.bill_id.startsWith('VOTE-'),
          summary: result.summary ? result.summary.substring(0, 100) + '...' : undefined
        });
      }

      // Rate limiting - wait between parallel batches
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CALLS));
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const proceduralCount = results.filter(r => r.isProceduralVote && r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${uniqueBills.size} unique bills (${proceduralCount} procedural votes)`,
        processed: successCount,
        failed: failCount,
        proceduralVotesProcessed: proceduralCount,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-ai-bill-summaries:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
