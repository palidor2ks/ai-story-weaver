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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { batchSize = 10, dryRun = false } = await req.json().catch(() => ({}));

    // Find votes where bill has no CRS summary (marked as [NO_SUMMARY])
    // Get distinct bill_id + congress combinations to avoid duplicate AI calls
    const { data: billsToProcess, error: fetchError } = await supabase
      .from('votes')
      .select('bill_id, bill_name, congress, action_type')
      .eq('bill_summary', '[NO_SUMMARY]')
      .not('bill_id', 'ilike', 'VOTE-%')
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

    // Deduplicate by bill_id + congress
    const uniqueBills = new Map<string, BillToSummarize>();
    for (const bill of billsToProcess) {
      const key = `${bill.bill_id}-${bill.congress}`;
      if (!uniqueBills.has(key)) {
        uniqueBills.set(key, bill);
      }
    }

    const results: Array<{ bill_id: string; success: boolean; summary?: string; error?: string }> = [];
    
    for (const [_, bill] of uniqueBills) {
      try {
        if (dryRun) {
          results.push({ bill_id: bill.bill_id, success: true, summary: '[DRY RUN]' });
          continue;
        }

        // Generate AI summary using Lovable AI
        const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') || '',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 300,
            messages: [{
              role: 'user',
              content: `You are a legislative research assistant. Generate a brief, factual summary of this bill.

Bill ID: ${bill.bill_id}
Bill Title: ${bill.bill_name}
Congress: ${bill.congress ? `${bill.congress}th` : 'Unknown'}

Requirements:
- 2-3 sentences maximum
- Focus on what the bill proposes to DO
- Identify the primary policy area
- Use neutral, factual language
- Do not speculate on outcomes or opinions

If you cannot determine what the bill does from the title alone, respond with a general description based on the available information.`
            }]
          })
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          throw new Error(`AI API error: ${errorText}`);
        }

        const aiData = await aiResponse.json();
        const generatedSummary = aiData.content?.[0]?.text?.trim();

        if (!generatedSummary) {
          throw new Error('No summary generated');
        }

        // Prefix with [AI] marker and update all votes with this bill_id + congress
        const aiMarkedSummary = `[AI] ${generatedSummary}`;
        
        const { error: updateError } = await supabase
          .from('votes')
          .update({ 
            bill_summary: aiMarkedSummary,
            summary_fetched_at: new Date().toISOString()
          })
          .eq('bill_id', bill.bill_id)
          .eq('congress', bill.congress)
          .eq('bill_summary', '[NO_SUMMARY]');

        if (updateError) {
          throw new Error(`Update failed: ${updateError.message}`);
        }

        results.push({ bill_id: bill.bill_id, success: true, summary: aiMarkedSummary.substring(0, 100) + '...' });

      } catch (error) {
        results.push({ 
          bill_id: bill.bill_id, 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }

      // Rate limiting - wait between API calls
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${uniqueBills.size} unique bills`,
        processed: successCount,
        failed: failCount,
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
