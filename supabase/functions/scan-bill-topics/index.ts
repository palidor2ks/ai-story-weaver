import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Only use the 10 canonical topics for consistency with the quiz system
const CANONICAL_TOPICS = [
  'Economy', 'Healthcare', 'Immigration', 'Environment', 'Defense',
  'Education', 'Civil Rights', 'Government', 'Social Programs', 'Technology'
];

// Validate and normalize AI-detected topics to canonical topics
const TOPIC_NORMALIZATION: Record<string, string> = {
  // Map any legacy Congress.gov policy areas AI might return
  'Agriculture and Food': 'Economy',
  'Commerce': 'Economy',
  'Economics and Public Finance': 'Economy',
  'Finance and Financial Sector': 'Economy',
  'Foreign Trade and International Finance': 'Economy',
  'Labor and Employment': 'Economy',
  'Taxation': 'Economy',
  'Transportation and Public Works': 'Economy',
  'Health': 'Healthcare',
  'Families': 'Healthcare',
  'Energy': 'Environment',
  'Environmental Protection': 'Environment',
  'Public Lands and Natural Resources': 'Environment',
  'Water Resources Development': 'Environment',
  'Animals': 'Environment',
  'Armed Forces and National Security': 'Defense',
  'International Affairs': 'Defense',
  'Emergency Management': 'Defense',
  'Civil Rights and Liberties, Minority Issues': 'Civil Rights',
  'Crime and Law Enforcement': 'Civil Rights',
  'Law': 'Civil Rights',
  'Native Americans': 'Civil Rights',
  'Arts, Culture, Religion': 'Civil Rights',
  'Sports and Recreation': 'Civil Rights',
  'Social Sciences and History': 'Education',
  'Social Welfare': 'Social Programs',
  'Housing and Community Development': 'Social Programs',
  'Congress': 'Government',
  'Government Operations and Politics': 'Government',
  'Science, Technology, Communications': 'Technology',
  // Legacy names
  'Criminal Justice': 'Civil Rights',
  'Foreign Policy': 'Defense',
  'Domestic Policy': 'Government',
  'Government Reform': 'Government',
  'Gun Policy': 'Civil Rights',
  'Social Issues': 'Social Programs',
  'General': 'Government',
};

function validateTopic(topic: string): string {
  if (CANONICAL_TOPICS.includes(topic)) return topic;
  return TOPIC_NORMALIZATION[topic] || 'Government';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { batchSize = 50, topic = null, forceRescan = false, billId = null } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    // Single bill scan mode
    if (billId) {
      const { data: bill, error } = await supabase
        .from('votes')
        .select('id, bill_id, bill_name, topic, bill_summary')
        .eq('id', billId)
        .single();
      
      if (error || !bill) {
        return new Response(JSON.stringify({ error: 'Bill not found' }), { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      if (!bill.bill_summary || bill.bill_summary === '[NO_SUMMARY]') {
        return new Response(JSON.stringify({ error: 'Bill has no summary to analyze' }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // Analyze single bill
      const prompt = `Analyze this bill and identify its policy topics.

Available topics (ONLY use these): ${CANONICAL_TOPICS.join(', ')}

Bill:
- Bill Number: ${bill.bill_id}
- Name: ${bill.bill_name}
- Current Topic: ${bill.topic}
- Summary: ${bill.bill_summary?.substring(0, 800) || 'No summary'}

Determine:
1. The PRIMARY topic based on the summary content (MUST be from the available topics list)
2. ALL SECONDARY topics it addresses (MUST be from the available topics list, can be 0, 1, 2, or more)
3. Whether the current assigned topic is incorrect (mismatch)
4. Whether this is an omnibus bill (appropriations, NDAA, infrastructure, reconciliation)

Return JSON:
{
  "primary_topic": "...",
  "secondary_topics": ["...", "...", "..."],
  "topic_count": <total number>,
  "is_mismatch": boolean,
  "is_omnibus": boolean,
  "omnibus_type": "appropriations" | "ndaa" | "infrastructure" | "reconciliation" | "other" | null,
  "confidence": "high" | "medium" | "low"
}

Return ONLY valid JSON.`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'You are a legislative analyst. Return valid JSON only.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limited, try again shortly' }), { 
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: 'AI credits exhausted' }), { 
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          });
        }
        throw new Error(`AI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        return new Response(JSON.stringify({ error: 'Could not parse AI response' }), { 
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const result = JSON.parse(jsonMatch[0]);
      const topicCount = result.topic_count || (1 + (result.secondary_topics?.length || 0));
      
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

      // Validate and normalize AI-detected topics
      const normalizedPrimary = validateTopic(result.primary_topic);
      const normalizedSecondary = (result.secondary_topics || []).map(validateTopic);
      // Remove duplicates and filter out primary from secondary
      const uniqueSecondary = [...new Set(normalizedSecondary)].filter(t => t !== normalizedPrimary);

      const updates: Record<string, unknown> = {
        ai_detected_topics: [normalizedPrimary, ...uniqueSecondary],
        topic_flag: flag,
        omnibus_type: result.omnibus_type || null,
      };

      const { error: updateError } = await supabase.from('votes').update(updates).eq('id', billId);
      if (updateError) throw updateError;

      return new Response(JSON.stringify({ 
        status: 'complete',
        bill: { 
          id: bill.id,
          ...updates,
          primary_topic: result.primary_topic,
          secondary_topics: result.secondary_topics || [],
          confidence: result.confidence 
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Batch scan mode - query bills that need scanning
    let query = supabase
      .from('votes')
      .select('id, bill_id, bill_name, topic, bill_summary, additional_topics, ai_detected_topics')
      .not('bill_summary', 'is', null)
      .neq('bill_summary', '')
      .neq('bill_summary', '[NO_SUMMARY]')
      .is('reviewed_at', null)
      .limit(batchSize);
    
    if (!forceRescan) {
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

Available topics (ONLY use these): ${CANONICAL_TOPICS.join(', ')}

${chunk.map((b, idx) => `
Bill ${idx + 1}:
- ID: ${b.id}
- Bill Number: ${b.bill_id}
- Name: ${b.bill_name}
- Current Topic: ${b.topic}
- Summary: ${b.bill_summary?.substring(0, 600) || 'No summary'}
`).join('\n---\n')}

For each bill, determine:
1. The PRIMARY topic based on the summary content (MUST be from the available topics list)
2. ALL SECONDARY topics it addresses (MUST be from the available topics list, can be 0, 1, 2, or more)
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
          
          // Validate and normalize AI-detected topics
          const normalizedPrimary = validateTopic(result.primary_topic);
          const normalizedSecondary: string[] = (result.secondary_topics || []).map((t: string) => validateTopic(t));
          const uniqueSecondary = [...new Set(normalizedSecondary)].filter(t => t !== normalizedPrimary);
          
          const updates: Record<string, unknown> = {
            ai_detected_topics: [normalizedPrimary, ...uniqueSecondary],
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
