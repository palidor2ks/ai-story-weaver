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

        // Generate AI summary using Lovable AI Gateway
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        if (!LOVABLE_API_KEY) {
          throw new Error('LOVABLE_API_KEY is not configured');
        }

        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-3-flash-preview',
            max_tokens: 300,
            messages: [
              {
                role: 'system',
                content: 'You are a legislative research assistant. Generate brief, factual bill summaries. Use neutral language and focus on what bills propose to do.'
              },
              {
                role: 'user',
                content: `Generate a 2-3 sentence summary of this bill:

Bill ID: ${bill.bill_id}
Bill Title: ${bill.bill_name}
Congress: ${bill.congress ? `${bill.congress}th` : 'Unknown'}

Focus on what the bill proposes to DO and identify the primary policy area. If you cannot determine what the bill does from the title alone, provide a general description.`
              }
            ]
          })
        });

        if (!aiResponse.ok) {
          if (aiResponse.status === 429) {
            throw new Error('Rate limit exceeded - try again later');
          }
          if (aiResponse.status === 402) {
            throw new Error('Payment required - add credits to Lovable AI');
          }
          const errorText = await aiResponse.text();
          throw new Error(`AI Gateway error (${aiResponse.status}): ${errorText}`);
        }

        const aiData = await aiResponse.json();
        const generatedSummary = aiData.choices?.[0]?.message?.content?.trim();

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
