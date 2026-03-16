import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BillToSummarize {
  id: string;
  name: string;
  congress: number | null;
}

// Configuration for parallel processing
const CONCURRENT_AI_CALLS = 3;
const DELAY_BETWEEN_CALLS = 100;

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
3. Briefly notes the political significance of this confirmation

Vote: ${billName}

Focus on factual information.`;
  }
  
  // Cloture votes
  if (nameLower.includes('cloture') || nameLower.includes('motion to invoke')) {
    return `This is a cloture vote in Congress. Generate a 2-3 sentence summary that:
1. Explains that cloture is a procedural vote to end debate
2. Identifies what legislation or nomination this relates to
3. Notes that cloture requires 60 votes to overcome a filibuster

Vote: ${billName}`;
  }
  
  // Motion to proceed
  if (nameLower.includes('motion to proceed') || nameLower.includes('motion to table')) {
    return `This is a procedural motion vote. Generate a 2-3 sentence summary that:
1. Explains what this procedural motion does
2. Identifies what legislation this motion relates to
3. Notes the procedural significance

Vote: ${billName}`;
  }
  
  // Passage/Amendment votes
  if (nameLower.includes('on passage') || nameLower.includes('on agreeing') || nameLower.includes('on the amendment')) {
    return `This is a floor vote on legislation or an amendment. Generate a 2-3 sentence summary that:
1. Identifies whether this is a passage vote or amendment vote
2. Describes what the legislation/amendment appears to address
3. Notes any relevant context

Vote: ${billName}`;
  }
  
  // Generic procedural vote
  return `This is a procedural floor vote in Congress. Generate a 2-3 sentence summary that:
1. Describes what type of procedural action this vote represents
2. Identifies the subject matter if apparent from the title
3. Explains the procedural significance

Vote: ${billName}`;
}

// Get prompt for regular bills (non-procedural)
function getBillPrompt(bill: BillToSummarize): string {
  return `Generate a 2-3 sentence summary of this bill:

Bill ID: ${bill.id}
Bill Title: ${bill.name}
Congress: ${bill.congress ? `${bill.congress}th` : 'Unknown'}

Focus on what the bill proposes to DO and identify the primary policy area.`;
}

// Chunk array into smaller arrays
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Process a single bill summary generation
async function generateSummary(
  bill: BillToSummarize, 
  lovableApiKey: string
): Promise<{ bill_id: string; success: boolean; summary?: string; error?: string }> {
  try {
    const floorVotePrompt = getFloorVotePrompt(bill.id, bill.name);
    const prompt = floorVotePrompt || getBillPrompt(bill);
    
    const systemPrompt = floorVotePrompt 
      ? 'You are a legislative research assistant explaining congressional procedures.'
      : 'You are a legislative research assistant. Generate brief, factual bill summaries.';

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
        return { bill_id: bill.id, success: false, error: 'Rate limit exceeded' };
      }
      if (aiResponse.status === 402) {
        return { bill_id: bill.id, success: false, error: 'Payment required' };
      }
      const errorText = await aiResponse.text();
      return { bill_id: bill.id, success: false, error: `AI Gateway error (${aiResponse.status}): ${errorText}` };
    }

    const aiData = await aiResponse.json();
    const generatedSummary = aiData.choices?.[0]?.message?.content?.trim();

    if (!generatedSummary) {
      return { bill_id: bill.id, success: false, error: 'No summary generated' };
    }

    const prefix = floorVotePrompt ? '[AI-PROC]' : '[AI]';
    return { 
      bill_id: bill.id, 
      success: true, 
      summary: `${prefix} ${generatedSummary}` 
    };
  } catch (error) {
    return { 
      bill_id: bill.id, 
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
    // Admin auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const adminCheckClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminCheckClient.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { batchSize = 25, dryRun = false } = await req.json().catch(() => ({}));

    // Query bills that need AI summaries (have [NO_SUMMARY] from CRS fetch)
    const { data: billsToProcess, error: fetchError } = await supabase
      .from('bills')
      .select('id, name, congress')
      .eq('summary', '[NO_SUMMARY]')
      .not('congress', 'is', null)
      .limit(batchSize);

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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `[DRY RUN] Would process ${billsToProcess.length} bills`,
          processed: billsToProcess.length,
          failed: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: Array<{ bill_id: string; success: boolean; summary?: string; error?: string; isProceduralVote?: boolean }> = [];
    
    // Process in parallel chunks
    const chunks = chunk(billsToProcess, CONCURRENT_AI_CALLS);
    
    for (const batch of chunks) {
      const batchResults = await Promise.all(
        batch.map(bill => generateSummary(bill, LOVABLE_API_KEY))
      );
      
      // Update database for successful results
      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        const bill = batch[i];
        
        if (result.success && result.summary) {
          const { error: updateError } = await supabase
            .from('bills')
            .update({ 
              summary: result.summary,
              summary_fetched_at: new Date().toISOString()
            })
            .eq('id', bill.id);

          if (updateError) {
            result.success = false;
            result.error = `Update failed: ${updateError.message}`;
          }
        }
        
        results.push({
          ...result,
          isProceduralVote: bill.id.startsWith('VOTE-'),
          summary: result.summary ? result.summary.substring(0, 100) + '...' : undefined
        });
      }

      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CALLS));
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const proceduralCount = results.filter(r => r.isProceduralVote && r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${billsToProcess.length} bills (${proceduralCount} procedural votes)`,
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
