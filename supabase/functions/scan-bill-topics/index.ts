import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Use the 6 canonical federal topics (display labels) for consistency with the quiz system
const CANONICAL_TOPICS = [
  'Economy & Work',
  'Health, Education & Social Safety Net',
  'Environment & Energy',
  'National Security & Borders',
  'Rights & Justice',
  'Government & Democracy',
];

// Validate and normalize AI-detected topics to canonical topics
const TOPIC_NORMALIZATION: Record<string, string> = {
  // Economy & Work (includes Technology & Science)
  'Economy': 'Economy & Work',
  'Agriculture and Food': 'Economy & Work',
  'Commerce': 'Economy & Work',
  'Economics and Public Finance': 'Economy & Work',
  'Finance and Financial Sector': 'Economy & Work',
  'Labor and Employment': 'Economy & Work',
  'Taxation': 'Economy & Work',
  'Transportation and Public Works': 'Economy & Work',
  'Technology': 'Economy & Work',
  'Science, Technology, Communications': 'Economy & Work',

  // Health, Education & Social Safety Net
  'Healthcare': 'Health, Education & Social Safety Net',
  'Health': 'Health, Education & Social Safety Net',
  'Families': 'Health, Education & Social Safety Net',
  'Education': 'Health, Education & Social Safety Net',
  'Social Sciences and History': 'Health, Education & Social Safety Net',
  'Social Programs': 'Health, Education & Social Safety Net',
  'Social Welfare': 'Health, Education & Social Safety Net',
  'Housing and Community Development': 'Health, Education & Social Safety Net',
  'Social Issues': 'Health, Education & Social Safety Net',

  // Environment & Energy
  'Environment': 'Environment & Energy',
  'Energy': 'Environment & Energy',
  'Environmental Protection': 'Environment & Energy',
  'Public Lands and Natural Resources': 'Environment & Energy',
  'Water Resources Development': 'Environment & Energy',
  'Animals': 'Environment & Energy',

  // National Security & Borders (Defense + Immigration + Foreign Affairs)
  'Defense': 'National Security & Borders',
  'Armed Forces and National Security': 'National Security & Borders',
  'Emergency Management': 'National Security & Borders',
  'Immigration': 'National Security & Borders',
  'Foreign Affairs': 'National Security & Borders',
  'International Affairs': 'National Security & Borders',
  'Foreign Trade and International Finance': 'National Security & Borders',
  'Foreign Policy': 'National Security & Borders',

  // Rights & Justice (Civil Rights + Judicial)
  'Civil Rights': 'Rights & Justice',
  'Civil Rights and Liberties, Minority Issues': 'Rights & Justice',
  'Crime and Law Enforcement': 'Rights & Justice',
  'Native Americans': 'Rights & Justice',
  'Arts, Culture, Religion': 'Rights & Justice',
  'Sports and Recreation': 'Rights & Justice',
  'Criminal Justice': 'Rights & Justice',
  'Gun Policy': 'Rights & Justice',
  'Judicial': 'Rights & Justice',
  'Law': 'Rights & Justice',
  'Courts': 'Rights & Justice',
  'Judicial Reform': 'Rights & Justice',
  'Supreme Court': 'Rights & Justice',
  'Federal Courts': 'Rights & Justice',
  'Judges': 'Rights & Justice',
  'Legal System': 'Rights & Justice',
  'Judicial procedure and administration': 'Rights & Justice',

  // Government & Democracy
  'Government': 'Government & Democracy',
  'Congress': 'Government & Democracy',
  'Government Operations and Politics': 'Government & Democracy',
  'Domestic Policy': 'Government & Democracy',
  'Government Reform': 'Government & Democracy',
  'General': 'Government & Democracy',
};

// Detailed topic definitions to guide AI analysis - GOVERNMENT definition is NARROW to prevent over-classification
const TOPIC_DEFINITIONS = `
ECONOMY & WORK: Jobs, wages, taxation, banking, finance, business regulation, labor laws, commerce, agriculture, transportation infrastructure, manufacturing, small business, trade, AND technology/science policy (cybersecurity, AI, internet regulation, telecom, data privacy, scientific research, broadband, patents).
HEALTH, EDUCATION & SOCIAL SAFETY NET: Medical care, health insurance, public health, Medicare/Medicaid, pharmaceuticals, family services; K-12 and higher education, student loans, teacher policy, school funding; welfare, food assistance (SNAP), housing assistance, unemployment, disability benefits, child welfare, homelessness.
ENVIRONMENT & ENERGY: Climate change, pollution, conservation, energy policy (oil, gas, renewables), public lands, water resources, wildlife protection, EPA regulations, clean air/water, national parks.
NATIONAL SECURITY & BORDERS: Military operations, veterans affairs, defense spending, weapons, homeland security, emergency management; AND immigration, border policy, visas, asylum, deportation, refugees; AND foreign affairs, diplomacy, treaties, NATO/UN, foreign aid, trade agreements, tariffs, sanctions.
RIGHTS & JUSTICE: Voting rights, discrimination (race, gender, disability), criminal justice reform, gun policy, privacy rights, free speech, LGBTQ+ rights, religious freedom, tribal affairs, policing; AND federal courts, Supreme Court, judicial appointments, court procedures, sentencing guidelines, constitutional interpretation, judicial ethics.
GOVERNMENT & DEMOCRACY: ONLY for bills about the INTERNAL operations of government itself - congressional procedures, federal employee pay, ethics/transparency, postal service, census, federal building management, election administration, campaign finance, lobbying regulations, procurement. Do NOT use for bills that mention federal agencies - use the POLICY AREA being regulated instead.
`;

function validateTopic(topic: string): string | null {
  // Case-insensitive match against canonical topics
  const canonicalMatch = CANONICAL_TOPICS.find(t => t.toLowerCase() === topic.toLowerCase());
  if (canonicalMatch) return canonicalMatch;
  
  // Try normalization map (case-insensitive key lookup)
  const normalizedKey = Object.keys(TOPIC_NORMALIZATION).find(k => k.toLowerCase() === topic.toLowerCase());
  if (normalizedKey) return TOPIC_NORMALIZATION[normalizedKey];
  
  console.warn(`[ScanBillTopics] Unknown topic from AI: ${topic} - skipping (not defaulting to Government)`);
  return null;  // Don't default to Government - return null to indicate unknown
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

=== CRITICAL: AVOID GOVERNMENT OVER-CLASSIFICATION ===
"Government" should ONLY be the primary topic when the bill is ABOUT the internal operations of government itself (Congress rules, federal employee policies, ethics, elections, postal service, census).

DO NOT classify as Government just because:
- A bill mentions federal agencies (use the POLICY AREA being regulated)
- A bill involves regulatory changes (use what's being regulated)
- A bill requires agency reports (use the topic of the report)
- A bill affects government programs (use the program's policy area)

INCORRECT Government classifications (use the actual policy area instead):
- Bills about EPA regulations → Environment (NOT Government)
- Bills about VA healthcare → Defense or Healthcare (NOT Government)
- Bills about FDA drug approvals → Healthcare (NOT Government)
- Bills about DOJ crime enforcement → Civil Rights (NOT Government)
- Bills about DOD military operations → Defense (NOT Government)
- Bills about State Department diplomacy → Foreign Affairs (NOT Government)
- Bills about HHS welfare programs → Social Programs (NOT Government)

CORRECT Government classifications:
- Congressional term limits → Government ✓
- Federal employee pay raise → Government ✓
- Election security procedures → Government ✓
- Postal service reform → Government ✓
- Government ethics rules → Government ✓

=== TOPIC PRIORITY HIERARCHY ===
When multiple topics apply, use this priority:
1. What is being REGULATED takes priority over WHO regulates it
2. The affected population takes priority over the implementing agency
3. Specific policy areas take priority over general "government" classification

=== BILL TO ANALYZE ===
Bill ID: ${bill.id}
Title: ${bill.name}
Currently Assigned Topic: ${bill.topic}
Full Summary: ${bill.summary?.substring(0, 2000) || 'No summary available'}

=== DEEP ANALYSIS INSTRUCTIONS ===
1. READ THE ENTIRE SUMMARY CAREFULLY - do not skim or make assumptions
2. Identify EVERY policy area mentioned, even briefly
3. For each policy mention, map it to one of the 12 topic categories above
4. Determine which topic is the PRIMARY focus (main purpose of the bill)
5. List ALL other topics as SECONDARY (even if minor mentions)
6. Consider: Who is affected? Which agencies? What is regulated or funded?

=== CLASSIFICATION EXAMPLES ===
- Military healthcare bill → Primary: Defense, Secondary: Healthcare
- Environmental job training → Primary: Environment, Secondary: Economy, Education
- Tech privacy rights → Primary: Technology, Secondary: Civil Rights
- Border security funding → Primary: Immigration, Secondary: Defense
- Student loan reform → Primary: Education, Secondary: Economy
- EPA emissions standards → Primary: Environment (NOT Government)
- VA benefits expansion → Primary: Defense (NOT Government)

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
  "primary_topic": "Economy & Work" | "Health, Education & Social Safety Net" | "Environment & Energy" | "National Security & Borders" | "Rights & Justice" | "Government & Democracy",
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
  
  // If primary topic couldn't be validated, skip this bill update
  if (!normalizedPrimary) {
    console.warn(`[ScanBillTopics] Skipping bill ${bill.id} - could not validate primary topic: ${result.primary_topic}`);
    return new Response(JSON.stringify({ 
      error: `Could not validate primary topic: ${result.primary_topic}`,
      bill_id: bill.id
    }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
  
  const normalizedSecondary = (result.secondary_topics || [])
    .map((t: string) => validateTopicFn(t))
    .filter((t: string | null): t is string => t !== null && t !== normalizedPrimary);
  const uniqueSecondary = [...new Set(normalizedSecondary)];

  const updates: Record<string, unknown> = {
    ai_detected_topics: [normalizedPrimary, ...uniqueSecondary],
    topic_flag: flag,
    omnibus_type: result.omnibus_type || null,
    last_ai_scan_at: new Date().toISOString(),
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
    // Admin auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const adminCheckClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: roleData } = await adminCheckClient.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

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
      // Exclude bills already rescanned in the last 24 hours to prevent infinite loops
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query
        .not('topic_flag', 'is', null)
        .or(`last_ai_scan_at.is.null,last_ai_scan_at.lt.${twentyFourHoursAgo}`);
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

=== CRITICAL: AVOID GOVERNMENT OVER-CLASSIFICATION ===
"Government" should ONLY be the primary topic when the bill is ABOUT the internal operations of government itself (Congress rules, federal employee policies, ethics, elections, postal service, census).

DO NOT classify as Government just because:
- A bill mentions federal agencies (use the POLICY AREA being regulated)
- A bill involves regulatory changes (use what's being regulated)
- A bill requires agency reports (use the topic of the report)
- A bill affects government programs (use the program's policy area)

INCORRECT Government classifications (use the actual policy area instead):
- EPA regulations → Environment
- VA healthcare/benefits → Defense
- FDA drug approvals → Healthcare
- DOJ crime enforcement → Civil Rights
- DOD military operations → Defense
- State Department diplomacy → Foreign Affairs
- HHS welfare programs → Social Programs
- DHS immigration enforcement → Immigration

CORRECT Government classifications:
- Congressional term limits → Government ✓
- Federal employee pay → Government ✓
- Postal service reform → Government ✓

=== TOPIC PRIORITY HIERARCHY ===
1. What is being REGULATED takes priority over WHO regulates it
2. The affected population takes priority over the implementing agency
3. Specific policy areas take priority over general "government" classification

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
3. Map each policy mention to one of the 12 topic categories
4. Determine which topic is the PRIMARY focus (main purpose)
5. List ALL other topics as SECONDARY (even minor mentions)
6. Consider: Who is affected? Which agencies? What is regulated/funded?

=== CLASSIFICATION EXAMPLES ===
- Military healthcare → Primary: Defense, Secondary: Healthcare
- Environmental job training → Primary: Environment, Secondary: Economy, Education
- Tech privacy rights → Primary: Technology, Secondary: Civil Rights
- Border security funding → Primary: Immigration, Secondary: Defense
- EPA emissions rule → Primary: Environment (NOT Government)
- VA benefits bill → Primary: Defense (NOT Government)

=== MISMATCH & OMNIBUS DETECTION ===
- is_mismatch=true if the "Current Topic" is wrong or a better primary exists
- is_omnibus=true if 5+ major topics, or appropriations/NDAA/infrastructure/reconciliation bill

=== CONFIDENCE: high (clear), medium (some ambiguity), low (vague/equal primaries) ===

Return a JSON array with one object per bill:
[
  {
    "bill_index": 1,
    "primary_topic": "Economy & Work" | "Health, Education & Social Safety Net" | "Environment & Energy" | "National Security & Borders" | "Rights & Justice" | "Government & Democracy",
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
          
          // Skip this bill if primary topic couldn't be validated (don't default to Government)
          if (!normalizedPrimary) {
            console.warn(`[ScanBillTopics] Skipping bill ${bill.id} - unknown primary topic: ${result.primary_topic}`);
            results.errors++;
            continue;
          }
          
          const normalizedSecondary = (result.secondary_topics || [])
            .map((t: string) => validateTopic(t))
            .filter((t: string | null): t is string => t !== null && t !== normalizedPrimary);
          const uniqueSecondary = [...new Set(normalizedSecondary)];
          
          const updates: Record<string, unknown> = {
            ai_detected_topics: [normalizedPrimary, ...uniqueSecondary],
            topic_flag: flag,  // Always set - clears flag when no issues detected
            omnibus_type: result.omnibus_type || null,  // Always set - clears when not omnibus
            last_ai_scan_at: new Date().toISOString(),  // Track when this bill was scanned
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
