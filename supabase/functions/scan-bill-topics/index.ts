import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALL_TOPICS = [
  'Economy', 'Healthcare', 'Immigration', 'Environment', 'Defense',
  'Education', 'Civil Rights', 'Government', 'Social Programs', 'Technology',
  'Agriculture and Food', 'Armed Forces and National Security', 'Commerce',
  'Crime and Law Enforcement', 'Energy', 'Finance and Financial Sector',
  'Foreign Trade and International Finance', 'Housing and Community Development',
  'International Affairs', 'Labor and Employment', 'Law', 'Native Americans',
  'Public Lands and Natural Resources', 'Science, Technology, Communications',
  'Taxation', 'Transportation and Public Works'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { batchSize = 50, topic = null, forceRescan = false } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    // Query bills that need scanning
    let query = supabase
      .from('votes')
      .select('id, bill_id, bill_name, topic, bill_summary, additional_topics, ai_detected_topics')
      .not('bill_summary', 'is', null)
      .neq('bill_summary', '')
      .neq('bill_summary', '[NO_SUMMARY]')
      .is('reviewed_at', null)
      .limit(batchSize);
    
    if (!forceRescan) {
      // Only scan bills without AI analysis
      query = query.or('ai_detected_topics.is.null,ai_detected_topics.eq.{}');
    }
    
    if (topic) {
      query = query.eq('topic', topic);
    }
    
    const { data: bills, error } = await query;
    if (error) throw error;
    
    if (!bills || bills.length === 0) {
      return new Response(JSON.stringify({ 
        status: 'complete', 
        message: 'No bills to scan',
        scanned: 0 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[ScanBillTopics] Found ${bills.length} bills to analyze`);

    // Batch bills for AI analysis (5 at a time to manage token limits)
    const results = { scanned: 0, flagged: 0, errors: 0 };
    const CHUNK_SIZE = 5;
    
    for (let i = 0; i < bills.length; i += CHUNK_SIZE) {
      const chunk = bills.slice(i, i + CHUNK_SIZE);
      
      const prompt = `Analyze these bills and identify their policy topics.

Available topics: ${ALL_TOPICS.join(', ')}

${chunk.map((b, idx) => `
Bill ${idx + 1}:
- ID: ${b.id}
- Bill Number: ${b.bill_id}
- Name: ${b.bill_name}
- Current Topic: ${b.topic}
- Summary: ${b.bill_summary?.substring(0, 600) || 'No summary'}
`).join('\n---\n')}

For each bill, determine:
1. The PRIMARY topic based on the summary content
2. ALL SECONDARY topics it addresses (can be 0, 1, 2, or many)
3. Whether the current assigned topic is incorrect (mismatch)
4. Whether this is an omnibus bill (appropriations, NDAA, infrastructure package, reconciliation, etc.)

Return a JSON array with one object per bill:
[
  {
    "bill_index": 1,
    "primary_topic": "...",
    "secondary_topics": ["...", "...", "..."],
    "topic_count": <total number of topics>,
    "is_mismatch": boolean,
    "is_omnibus": boolean,
    "omnibus_type": "appropriations" | "ndaa" | "infrastructure" | "reconciliation" | "other" | null,
    "confidence": "high" | "medium" | "low"
  }
]

Return ONLY valid JSON, no other text.`;

      try {
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: 'You are a legislative analyst. Analyze bills and categorize them by policy topic. Return valid JSON only.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 2000,
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            console.log('[ScanBillTopics] Rate limited, pausing...');
            await new Promise(r => setTimeout(r, 5000));
            i -= CHUNK_SIZE; // Retry this chunk
            continue;
          }
          if (response.status === 402) {
            console.error('[ScanBillTopics] Payment required - out of credits');
            return new Response(JSON.stringify({ 
              error: 'AI credits exhausted. Please add credits to continue.',
              ...results
            }), { 
              status: 402, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
          }
          throw new Error(`AI API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        
        // Parse JSON from response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          console.error('[ScanBillTopics] Could not parse AI response:', content.substring(0, 200));
          results.errors += chunk.length;
          continue;
        }
        
        const analysis = JSON.parse(jsonMatch[0]);
        
        // Update each bill
        for (const result of analysis) {
          const bill = chunk[result.bill_index - 1];
          if (!bill) continue;
          
          const topicCount = result.topic_count || (1 + (result.secondary_topics?.length || 0));
          
          // Determine flag based on conditions
          let flag: string | null = null;
          if (result.is_mismatch) {
            flag = 'possible_mismatch';
          } else if (topicCount >= 5 || result.is_omnibus) {
            flag = 'omnibus_major';
          } else if (topicCount >= 3) {
            flag = 'omnibus_detected';
          } else if (topicCount === 2) {
            flag = 'multi_topic_detected';
          }
          
          const updates: Record<string, unknown> = {
            ai_detected_topics: [result.primary_topic, ...(result.secondary_topics || [])],
          };
          
          if (flag) {
            updates.topic_flag = flag;
          }
          
          if (result.omnibus_type) {
            updates.omnibus_type = result.omnibus_type;
          }
          
          const { error: updateError } = await supabase.from('votes').update(updates).eq('id', bill.id);
          
          if (updateError) {
            console.error(`[ScanBillTopics] Update error for ${bill.id}:`, updateError);
            results.errors++;
          } else {
            results.scanned++;
            if (flag) results.flagged++;
          }
        }
        
        console.log(`[ScanBillTopics] Processed chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${results.scanned} scanned, ${results.flagged} flagged`);
        
        // Rate limit delay between chunks
        await new Promise(r => setTimeout(r, 500));
        
      } catch (chunkError) {
        console.error('[ScanBillTopics] Chunk processing error:', chunkError);
        results.errors += chunk.length;
      }
    }

    const status = results.scanned >= bills.length ? 'complete' : 'partial';
    console.log(`[ScanBillTopics] ${status}: scanned ${results.scanned}, flagged ${results.flagged}, errors ${results.errors}`);

    return new Response(JSON.stringify({
      status,
      ...results,
      total: bills.length,
      remaining: bills.length - results.scanned - results.errors
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[ScanBillTopics] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
