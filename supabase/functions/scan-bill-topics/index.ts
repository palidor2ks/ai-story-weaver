import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Use the 11 canonical topics for consistency with the quiz system
const CANONICAL_TOPICS = [
  'Economy', 'Healthcare', 'Immigration', 'Environment', 'Defense',
  'Education', 'Civil Rights', 'Government', 'Social Programs', 'Technology', 'Judicial'
];

// Validate and normalize AI-detected topics to canonical topics
const TOPIC_NORMALIZATION: Record<string, string> = {
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
  'Native Americans': 'Civil Rights',
  'Arts, Culture, Religion': 'Civil Rights',
  'Sports and Recreation': 'Civil Rights',
  // Judicial
  'Law': 'Judicial',
  'Courts': 'Judicial',
  'Judicial Reform': 'Judicial',
  'Supreme Court': 'Judicial',
  'Federal Courts': 'Judicial',
  'Judges': 'Judicial',
  'Legal System': 'Judicial',
  'Judicial procedure and administration': 'Judicial',
  'Social Sciences and History': 'Education',
  'Social Welfare': 'Social Programs',
  'Housing and Community Development': 'Social Programs',
  'Congress': 'Government',
  'Government Operations and Politics': 'Government',
  'Science, Technology, Communications': 'Technology',
  'Criminal Justice': 'Civil Rights',
  'Foreign Policy': 'Defense',
  'Domestic Policy': 'Government',
  'Government Reform': 'Government',
  'Gun Policy': 'Civil Rights',
  'Social Issues': 'Social Programs',
  'General': 'Government',
};

// Detailed topic definitions to guide AI analysis
const TOPIC_DEFINITIONS = `
ECONOMY: Jobs, wages, trade, taxation, banking, finance, business regulation, labor laws, commerce, agriculture, transportation infrastructure, supply chains, manufacturing, small business, tariffs, economic development
HEALTHCARE: Medical care, health insurance, public health, mental health, drug policy, Medicare, Medicaid, family health services, hospitals, pharmaceuticals, disease prevention, biomedical research, healthcare workforce
IMMIGRATION: Border policy, visas, citizenship, refugee policy, asylum, deportation, DACA, immigration enforcement, guest workers, naturalization, border security, immigration courts
ENVIRONMENT: Climate change, pollution, conservation, energy policy (oil, gas, renewables), public lands, water resources, wildlife protection, EPA regulations, clean air/water, national parks, forestry
DEFENSE: Military operations, veterans affairs, national security, foreign policy, international relations, NATO, defense spending, intelligence agencies, military personnel, weapons systems, cybersecurity threats
EDUCATION: K-12 schools, higher education, student loans, vocational training, early childhood education, teacher policy, school funding, special education, STEM programs, charter schools
CIVIL RIGHTS: Voting rights, discrimination (race, gender, disability), criminal justice reform, gun policy, privacy rights, free speech, LGBTQ+ rights, religious freedom, Native American/tribal affairs, policing reform
GOVERNMENT: Federal agencies, elections, government reform, congressional operations, federal workforce, transparency, ethics, postal service, census, federal buildings, regulatory reform
SOCIAL PROGRAMS: Welfare, food assistance (SNAP), housing assistance, unemployment benefits, poverty programs, disability benefits (SSDI/SSI), child welfare, homelessness, community development
TECHNOLOGY: Cybersecurity, internet regulation, AI policy, telecommunications, data privacy, scientific research, space exploration (NASA), patents, broadband access, digital infrastructure
JUDICIAL: Federal courts, Supreme Court, judicial appointments, judicial reform, court procedures, sentencing guidelines, legal precedent, federal judges, court administration, case law, constitutional interpretation, judicial ethics, court jurisdiction, appellate process
`;

function validateTopic(topic: string): string {
  if (CANONICAL_TOPICS.includes(topic)) return topic;
  return TOPIC_NORMALIZATION[topic] || 'Government';
}

// deno-lint-ignore no-explicit-any
async function processSingleBill(
  supabase: any,
  bill: { id: string; name: string; topic: string; summary: string | null },
  apiKey: string,
  corsHeaders: Record<string, string>,
  validateTopicFn: typeof validateTopic,
  canonicalTopics: string[]
): Promise<Response> {
  const prompt = `You are a senior legislative analyst. Perform a THOROUGH, DEEP analysis of this bill to identify ALL policy topics it addresses.

=== TOPIC CATEGORIES (use ONLY these exact names) ===
${TOPIC_DEFINITIONS}

=== BILL TO ANALYZE ===
Bill ID: ${bill.id}
Title: ${bill.name}
Currently Assigned Topic: ${bill.topic}
Full Summary: ${bill.summary?.substring(0, 2000) || 'No summary available'}

=== DEEP ANALYSIS INSTRUCTIONS ===
1. READ THE ENTIRE SUMMARY CAREFULLY - do not skim or make assumptions
2. Identify EVERY policy area mentioned, even briefly
3. For each policy mention, map it to one of the 10 topic categories above
4. Determine which topic is the PRIMARY focus (main purpose of the bill)
5. List ALL other topics as SECONDARY (even if minor mentions)
6. Consider: Who is affected? Which agencies? What is regulated or funded?

=== CLASSIFICATION EXAMPLES ===
- Military healthcare bill → Primary: Defense, Secondary: Healthcare
- Environmental job training → Primary: Environment, Secondary: Economy, Education
- Tech privacy rights → Primary: Technology, Secondary: Civil Rights
- Border security funding → Primary: Immigration, Secondary: Defense, Government
- Student loan reform → Primary: Education, Secondary: Economy

=== MISMATCH DETECTION ===
Compare your PRIMARY topic to the "Currently Assigned Topic". Mark is_mismatch=true if:
- The assigned topic is completely wrong
- A more accurate primary topic exists
- The bill was miscategorized

=== OMNIBUS DETECTION ===
Mark is_omnibus=true if the bill:
- Covers 5+ major distinct policy areas
- Is an appropriations/spending bill
- Is NDAA (National Defense Authorization Act)
- Is infrastructure package or reconciliation bill

=== CONFIDENCE LEVELS ===
- "high": Summary clearly describes policy area(s), classification is unambiguous
- "medium": Some ambiguity but classification is reasonable
- "low": Summary is vague or bill genuinely spans multiple primaries equally

Return ONLY this JSON structure:
{
  "primary_topic": "Economy" | "Healthcare" | "Immigration" | "Environment" | "Defense" | "Education" | "Civil Rights" | "Government" | "Social Programs" | "Technology",
  "secondary_topics": ["...", "..."],
  "topic_count": <total unique topics>,
  "is_mismatch": boolean,
  "is_omnibus": boolean,
  "omnibus_type": "appropriations" | "ndaa" | "infrastructure" | "reconciliation" | "other" | null,
  "confidence": "high" | "medium" | "low",
  "reasoning": "<1-2 sentences explaining your primary topic choice>"
}`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'You are an expert legislative analyst with deep knowledge of US federal policy areas. Analyze bills thoroughly, considering all stakeholders and policy implications. Return valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1500,
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

  let result;
  try {
    result = JSON.parse(jsonMatch[0]);
  } catch (parseError) {
    console.error('[ScanBillTopics] JSON parse error for single bill:', parseError);
    console.error('[ScanBillTopics] Raw AI response:', content.substring(0, 500));
    return new Response(JSON.stringify({ 
      error: 'AI returned invalid JSON',
      raw_response: content.substring(0, 200)
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
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
  const normalizedPrimary = validateTopicFn(result.primary_topic);
  const normalizedSecondary = (result.secondary_topics || []).map(validateTopicFn);
  const uniqueSecondary = [...new Set(normalizedSecondary as string[])].filter((t) => t !== normalizedPrimary);

  const updates: Record<string, unknown> = {
    ai_detected_topics: [normalizedPrimary, ...uniqueSecondary],
    topic_flag: flag,
    omnibus_type: result.omnibus_type || null,
  };

  // Update the bill record
  const { error: updateError } = await supabase
    .from('bills')
    .update(updates)
    .eq('id', bill.id)
    .is('reviewed_at', null);
    
  if (updateError) throw updateError;

  return new Response(JSON.stringify({ 
    status: 'complete',
    updated_count: 1,
    bill: { 
      id: bill.id,
      ...updates,
      primary_topic: result.primary_topic,
      secondary_topics: result.secondary_topics || [],
      confidence: result.confidence 
    }
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { batchSize = 50, topic = null, forceRescan = false, flaggedOnly = false, bill_id = null, billId = null } = await req.json();
    const targetBillId = bill_id || billId;
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    // Single bill scan mode
    if (targetBillId) {
      const { data: bill, error } = await supabase
        .from('bills')
        .select('id, name, topic, summary')
        .eq('id', targetBillId)
        .single();
      
      if (error || !bill) {
        return new Response(JSON.stringify({ error: 'Bill not found' }), { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
      
      if (!bill.summary || bill.summary === '[NO_SUMMARY]') {
        return new Response(JSON.stringify({ error: 'Bill has no summary to analyze' }), { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
      
      return await processSingleBill(supabase, bill, LOVABLE_API_KEY, corsHeaders, validateTopic, CANONICAL_TOPICS);
    }

    // Batch scan mode - query bills that need scanning
    let query = supabase
      .from('bills')
      .select('id, name, topic, summary, additional_topics, ai_detected_topics')
      .not('summary', 'is', null)
      .neq('summary', '')
      .neq('summary', '[NO_SUMMARY]')
      .is('reviewed_at', null)
      .limit(batchSize);
    
    // Apply filtering based on scan mode
    if (flaggedOnly) {
      // Flagged-only mode: rescan only bills with topic_flag set
      query = query.not('topic_flag', 'is', null);
    } else if (!forceRescan) {
      // New scan mode: only get bills without AI topics
      query = query.or('ai_detected_topics.is.null,ai_detected_topics.eq.{}');
    }
    // forceRescan without flaggedOnly: rescan all unreviewed bills
    
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

    const results = { scanned: 0, flagged: 0, errors: 0 };
    const CHUNK_SIZE = 5;
    
    for (let i = 0; i < bills.length; i += CHUNK_SIZE) {
      const chunk = bills.slice(i, i + CHUNK_SIZE);
      
      const prompt = `You are a senior legislative analyst. Perform a THOROUGH, DEEP analysis of each bill to identify ALL policy topics.

=== TOPIC CATEGORIES (use ONLY these exact names) ===
${TOPIC_DEFINITIONS}

=== BILLS TO ANALYZE ===
${chunk.map((b, idx) => `
=== BILL ${idx + 1} ===
ID: ${b.id}
Title: ${b.name}
Current Topic: ${b.topic}
Summary: ${b.summary?.substring(0, 1500) || 'No summary'}
`).join('\n')}

=== DEEP ANALYSIS INSTRUCTIONS (apply to EACH bill) ===
1. READ EACH SUMMARY CAREFULLY - do not skim or make assumptions
2. Identify EVERY policy area mentioned in each bill
3. Map each policy mention to one of the 10 topic categories
4. Determine which topic is the PRIMARY focus (main purpose)
5. List ALL other topics as SECONDARY (even minor mentions)
6. Consider: Who is affected? Which agencies? What is regulated/funded?

=== CLASSIFICATION EXAMPLES ===
- Military healthcare → Primary: Defense, Secondary: Healthcare
- Environmental job training → Primary: Environment, Secondary: Economy, Education
- Tech privacy rights → Primary: Technology, Secondary: Civil Rights
- Border security funding → Primary: Immigration, Secondary: Defense, Government

=== MISMATCH & OMNIBUS DETECTION ===
- is_mismatch=true if the "Current Topic" is wrong or a better primary exists
- is_omnibus=true if 5+ major topics, or appropriations/NDAA/infrastructure/reconciliation bill

=== CONFIDENCE: high (clear), medium (some ambiguity), low (vague/equal primaries) ===

Return a JSON array with one object per bill:
[
  {
    "bill_index": 1,
    "primary_topic": "Economy" | "Healthcare" | "Immigration" | "Environment" | "Defense" | "Education" | "Civil Rights" | "Government" | "Social Programs" | "Technology",
    "secondary_topics": ["...", "..."],
    "topic_count": <total unique topics>,
    "is_mismatch": boolean,
    "is_omnibus": boolean,
    "omnibus_type": "appropriations" | "ndaa" | "infrastructure" | "reconciliation" | "other" | null,
    "confidence": "high" | "medium" | "low"
  }
]

Return ONLY valid JSON.`;

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
              { role: 'system', content: 'You are an expert legislative analyst with deep knowledge of US federal policy areas. Analyze bills thoroughly, considering all stakeholders and policy implications. Return valid JSON only.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 3000,
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            console.log('[ScanBillTopics] Rate limited, pausing...');
            await new Promise(r => setTimeout(r, 5000));
            i -= CHUNK_SIZE;
            continue;
          }
          if (response.status === 402) {
            return new Response(JSON.stringify({ 
              error: 'AI credits exhausted',
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
        
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          console.error('[ScanBillTopics] Could not parse AI response');
          results.errors += chunk.length;
          continue;
        }
        
        let analysis;
        try {
          analysis = JSON.parse(jsonMatch[0]);
        } catch (parseError) {
          console.error('[ScanBillTopics] JSON parse error in chunk:', parseError);
          console.error('[ScanBillTopics] Raw AI response:', content.substring(0, 500));
          results.errors += chunk.length;
          continue;
        }
        
        for (const result of analysis) {
          const bill = chunk[result.bill_index - 1];
          if (!bill) continue;
          
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
          
          const normalizedPrimary = validateTopic(result.primary_topic);
          const normalizedSecondary: string[] = (result.secondary_topics || []).map((t: string) => validateTopic(t));
          const uniqueSecondary = [...new Set(normalizedSecondary)].filter(t => t !== normalizedPrimary);
          
          const updates: Record<string, unknown> = {
            ai_detected_topics: [normalizedPrimary, ...uniqueSecondary],
            topic_flag: flag,  // Always set - clears flag when no issues detected
            omnibus_type: result.omnibus_type || null,  // Always set - clears when not omnibus
          };
          
          const { error: updateError } = await supabase.from('bills').update(updates).eq('id', bill.id);
          
          if (updateError) {
            console.error(`[ScanBillTopics] Update error for ${bill.id}:`, updateError);
            results.errors++;
          } else {
            results.scanned++;
            if (flag) results.flagged++;
          }
        }
        
        console.log(`[ScanBillTopics] Processed chunk ${Math.floor(i / CHUNK_SIZE) + 1}`);
        
        await new Promise(r => setTimeout(r, 500));
        
      } catch (chunkError) {
        console.error('[ScanBillTopics] Chunk processing error:', chunkError);
        results.errors += chunk.length;
      }
    }

    const status = results.scanned >= bills.length ? 'complete' : 'partial';
    console.log(`[ScanBillTopics] ${status}: scanned ${results.scanned}, flagged ${results.flagged}`);

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
