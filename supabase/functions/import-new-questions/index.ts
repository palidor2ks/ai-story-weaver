import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// The 32 Congress.gov Policy Areas with icons
const TOPICS = [
  { id: 'agriculture-and-food', name: 'Agriculture and Food', icon: '🌾' },
  { id: 'animals', name: 'Animals', icon: '🐾' },
  { id: 'armed-forces-national-security', name: 'Armed Forces and National Security', icon: '🎖️' },
  { id: 'arts-culture-religion', name: 'Arts, Culture, Religion', icon: '🎭' },
  { id: 'civil-rights-liberties', name: 'Civil Rights and Liberties, Minority Issues', icon: '⚖️' },
  { id: 'commerce', name: 'Commerce', icon: '🏪' },
  { id: 'congress', name: 'Congress', icon: '🏛️' },
  { id: 'crime-law-enforcement', name: 'Crime and Law Enforcement', icon: '🚔' },
  { id: 'economics-public-finance', name: 'Economics and Public Finance', icon: '📊' },
  { id: 'education', name: 'Education', icon: '📚' },
  { id: 'emergency-management', name: 'Emergency Management', icon: '🚨' },
  { id: 'energy', name: 'Energy', icon: '⚡' },
  { id: 'environmental-protection', name: 'Environmental Protection', icon: '🌍' },
  { id: 'families', name: 'Families', icon: '👨‍👩‍👧' },
  { id: 'finance-financial-sector', name: 'Finance and Financial Sector', icon: '🏦' },
  { id: 'foreign-trade-international-finance', name: 'Foreign Trade and International Finance', icon: '🚢' },
  { id: 'government-operations-politics', name: 'Government Operations and Politics', icon: '🗳️' },
  { id: 'health', name: 'Health', icon: '🏥' },
  { id: 'housing-community-development', name: 'Housing and Community Development', icon: '🏘️' },
  { id: 'immigration', name: 'Immigration', icon: '🛂' },
  { id: 'international-affairs', name: 'International Affairs', icon: '🌐' },
  { id: 'labor-employment', name: 'Labor and Employment', icon: '👷' },
  { id: 'law', name: 'Law', icon: '📜' },
  { id: 'native-americans', name: 'Native Americans', icon: '🪶' },
  { id: 'public-lands-natural-resources', name: 'Public Lands and Natural Resources', icon: '🏞️' },
  { id: 'science-technology-communications', name: 'Science, Technology, Communications', icon: '🔬' },
  { id: 'social-sciences-history', name: 'Social Sciences and History', icon: '📖' },
  { id: 'social-welfare', name: 'Social Welfare', icon: '🤝' },
  { id: 'sports-recreation', name: 'Sports and Recreation', icon: '⚽' },
  { id: 'taxation', name: 'Taxation', icon: '💵' },
  { id: 'transportation-public-works', name: 'Transportation and Public Works', icon: '🚇' },
  { id: 'water-resources-development', name: 'Water Resources Development', icon: '💧' },
];

// Map topic names from document to topic IDs
const TOPIC_NAME_MAP: Record<string, string> = {};
TOPICS.forEach(t => {
  TOPIC_NAME_MAP[t.name.toLowerCase()] = t.id;
  // Add shorter versions
  TOPIC_NAME_MAP[t.name.toLowerCase().replace(', minority issues', '')] = t.id;
});

// Questions data - structured from the parsed documents
// This will be populated by the edge function request body
interface QuestionData {
  topicId: string;
  text: string;
  options: Array<{
    text: string;
    value: number;
  }>;
  isOnboarding?: boolean;
  onboardingSlot?: number;
}

// Parse score prefix from option text
function parseOptionValue(text: string, position: number): number {
  // Check for explicit L10/L5/C0/R5/R10 prefix
  const prefixMatch = text.match(/^(L10|L5|C0|R5|R10)[:\s]/i);
  if (prefixMatch) {
    const prefix = prefixMatch[1].toUpperCase();
    switch (prefix) {
      case 'L10': return -10;
      case 'L5': return -5;
      case 'C0': return 0;
      case 'R5': return 5;
      case 'R10': return 10;
    }
  }
  
  // Fall back to position-based (5 options: -10, -5, 0, 5, 10)
  const positionValues = [-10, -5, 0, 5, 10];
  return positionValues[position] ?? 0;
}

// Clean option text by removing score prefix
function cleanOptionText(text: string): string {
  return text
    .replace(/^(L10|L5|C0|R5|R10)[:\s]+/i, '')
    .replace(/^-\s*/, '')
    .replace(/^Yes—/i, 'Yes — ')
    .replace(/^No—/i, 'No — ')
    .trim();
}

// Generate unique question ID
function generateQuestionId(topicId: string, index: number): string {
  const abbrev = topicId.split('-').map(w => w[0]).join('');
  return `${abbrev}${String(index).padStart(2, '0')}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    const { action, questions } = body;

    if (action === 'cleanup') {
      console.log('Phase 1: Cleaning up existing data...');
      
      // Delete in correct order to respect foreign keys
      const cleanupQueries = [
        'DELETE FROM question_update_notifications',
        'DELETE FROM quiz_answers',
        'DELETE FROM candidate_answers',
        'DELETE FROM party_answers',
        'DELETE FROM user_topic_scores',
        'DELETE FROM user_topics',
        'UPDATE profiles SET overall_score = NULL',
        'DELETE FROM question_options',
        'DELETE FROM questions',
        'DELETE FROM topics',
      ];
      
      for (const query of cleanupQueries) {
        const { error } = await supabase.rpc('exec_sql', { sql: query }).maybeSingle();
        if (error) {
          // Try direct delete if rpc doesn't exist
          const table = query.match(/(?:DELETE FROM|UPDATE)\s+(\w+)/)?.[1];
          if (table && query.startsWith('DELETE')) {
            await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
          }
        }
      }
      
      // Delete directly from tables
      await supabase.from('question_update_notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('quiz_answers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('candidate_answers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('party_answers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('user_topic_scores').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('user_topics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('question_options').delete().neq('id', 'placeholder');
      await supabase.from('questions').delete().neq('id', 'placeholder');
      await supabase.from('topics').delete().neq('id', 'placeholder');
      
      console.log('Cleanup completed');
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Cleanup completed' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'insert-topics') {
      console.log('Phase 2: Inserting new topics...');
      
      // Delete old topics first
      await supabase.from('topics').delete().neq('id', 'placeholder');
      
      // Insert new topics
      const { error } = await supabase.from('topics').insert(
        TOPICS.map(t => ({
          id: t.id,
          name: t.name,
          icon: t.icon,
          weight: 1
        }))
      );
      
      if (error) {
        throw new Error(`Failed to insert topics: ${error.message}`);
      }
      
      console.log(`Inserted ${TOPICS.length} topics`);
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: `Inserted ${TOPICS.length} topics`,
        topics: TOPICS
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'insert-questions') {
      if (!questions || !Array.isArray(questions)) {
        throw new Error('questions array is required for insert-questions action');
      }

      console.log(`Phase 3: Inserting ${questions.length} questions...`);
      
      let insertedQuestions = 0;
      let insertedOptions = 0;
      
      // Get existing question counts per topic to avoid ID conflicts
      const { data: existingQuestions } = await supabase
        .from('questions')
        .select('id, topic_id');
      
      const topicCounts: Record<string, number> = {};
      if (existingQuestions) {
        for (const eq of existingQuestions) {
          if (!topicCounts[eq.topic_id]) topicCounts[eq.topic_id] = 0;
          topicCounts[eq.topic_id]++;
        }
      }
      
      for (const q of questions) {
        // Support both 'topic' (name) and 'topicId' (id) fields
        let topicId = q.topicId;
        if (!topicId && q.topic) {
          // Look up topic ID from name
          const topicName = q.topic.toLowerCase();
          topicId = TOPIC_NAME_MAP[topicName];
          if (!topicId) {
            // Try to find by partial match
            const matchedTopic = TOPICS.find(t => 
              t.name.toLowerCase() === topicName ||
              t.name.toLowerCase().startsWith(topicName) ||
              topicName.includes(t.name.toLowerCase().split(',')[0])
            );
            topicId = matchedTopic?.id;
          }
        }
        
        if (!topicId) {
          console.error(`Could not find topic ID for: ${q.topic || q.topicId}`);
          continue;
        }
        
        if (!topicCounts[topicId]) {
          topicCounts[topicId] = 0;
        }
        topicCounts[topicId]++;
        
        const questionId = generateQuestionId(topicId, topicCounts[topicId]);
        
        // Parse options - support both string array and object array
        const parsedOptions = (q.options || []).map((opt: string | { text: string; value?: number }, idx: number) => {
          const text = typeof opt === 'string' ? opt : opt.text;
          const value = typeof opt === 'object' && opt.value !== undefined 
            ? opt.value 
            : parseOptionValue(text, idx);
          return { text: cleanOptionText(text), value };
        });
        
        // Insert question
        const { error: qError } = await supabase.from('questions').insert({
          id: questionId,
          topic_id: topicId,
          text: q.text,
          is_onboarding_canonical: q.isOnboarding || false,
          onboarding_slot: q.onboardingSlot || null,
        });
        
        if (qError) {
          console.error(`Failed to insert question ${questionId}:`, qError);
          continue;
        }
        
        insertedQuestions++;
        
        // Insert options
        const options = parsedOptions.map((opt: { text: string; value: number }, idx: number) => ({
          id: `${questionId}-${String.fromCharCode(97 + idx)}`, // a, b, c, d, e
          question_id: questionId,
          text: opt.text,
          value: opt.value,
          display_order: idx,
          is_skip_option: false,
        }));
        
        // Add skip option
        options.push({
          id: `${questionId}-skip`,
          question_id: questionId,
          text: 'Not important to me',
          value: 0,
          display_order: 5,
          is_skip_option: true,
        });
        
        const { error: optError } = await supabase.from('question_options').insert(options);
        
        if (optError) {
          console.error(`Failed to insert options for ${questionId}:`, optError);
          continue;
        }
        
        insertedOptions += options.length;
      }
      
      console.log(`Inserted ${insertedQuestions} questions with ${insertedOptions} options`);
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: `Inserted ${insertedQuestions} questions with ${insertedOptions} options`,
        insertedQuestions,
        insertedOptions
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'set-onboarding') {
      console.log('Phase 4: Setting onboarding questions...');
      
      // The 10 onboarding questions with their expected topics
      const onboardingQuestions = [
        { slot: 1, pattern: '%expand access to public health insurance%', topic: 'health' },
        { slot: 2, pattern: '%federal minimum wage be increased%', topic: 'labor-employment' },
        { slot: 3, pattern: '%taxes on high%income individuals%', topic: 'taxation' },
        { slot: 4, pattern: '%increase border security funding%', topic: 'immigration' },
        { slot: 5, pattern: '%expand renewable energy subsidies%', topic: 'energy' },
        { slot: 6, pattern: '%reduce its overseas military footprint%', topic: 'armed-forces-national-security' },
        { slot: 7, pattern: '%strengthen protections against discrimination%', topic: 'civil-rights-liberties' },
        { slot: 8, pattern: '%limit the use of the filibuster%', topic: 'congress' },
        { slot: 9, pattern: '%expand gun regulations%', topic: 'crime-law-enforcement' },
        { slot: 10, pattern: '%federal welfare benefits be increased%', topic: 'social-welfare' },
      ];
      
      let updated = 0;
      
      for (const oq of onboardingQuestions) {
        // First reset any existing onboarding question for this slot
        await supabase
          .from('questions')
          .update({ is_onboarding_canonical: false, onboarding_slot: null })
          .eq('onboarding_slot', oq.slot);
        
        // Find and update the matching question
        const { data: matches } = await supabase
          .from('questions')
          .select('id, text')
          .ilike('text', oq.pattern)
          .limit(1);
        
        if (matches && matches.length > 0) {
          const { error } = await supabase
            .from('questions')
            .update({ 
              is_onboarding_canonical: true, 
              onboarding_slot: oq.slot 
            })
            .eq('id', matches[0].id);
          
          if (!error) {
            updated++;
            console.log(`Set onboarding slot ${oq.slot}: ${matches[0].text.slice(0, 50)}...`);
          }
        } else {
          console.warn(`No match found for onboarding slot ${oq.slot}: ${oq.pattern}`);
        }
      }
      
      console.log(`Set ${updated} onboarding questions`);
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: `Set ${updated} onboarding questions`,
        updated
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'status') {
      // Get current counts
      const { count: topicCount } = await supabase.from('topics').select('*', { count: 'exact', head: true });
      const { count: questionCount } = await supabase.from('questions').select('*', { count: 'exact', head: true });
      const { count: optionCount } = await supabase.from('question_options').select('*', { count: 'exact', head: true });
      const { data: onboardingQuestions } = await supabase
        .from('questions')
        .select('id, text, onboarding_slot')
        .eq('is_onboarding_canonical', true)
        .order('onboarding_slot');
      
      return new Response(JSON.stringify({ 
        success: true, 
        topics: topicCount,
        questions: questionCount,
        options: optionCount,
        onboardingQuestions: onboardingQuestions || []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
