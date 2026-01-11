import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Map Congress.gov subject terms to canonical topics
const SUBJECT_TERM_MAPPING: Record<string, string> = {
  // Government
  'Congressional oversight': 'Government',
  'Congressional tributes': 'Government',
  'House of Representatives': 'Government',
  'Senate': 'Government',
  'Members of Congress': 'Government',
  'Government information and archives': 'Government',
  'Government buildings, facilities, and property': 'Government',
  'Government studies and investigations': 'Government',
  'Legislative rules and procedure': 'Government',
  'State and local government operations': 'Government',
  'Intergovernmental relations': 'Government',
  'Public contracts and procurement': 'Government',
  'Government employee pay, benefits, personnel management': 'Government',
  'Administrative law and regulatory procedures': 'Government',
  'Appropriations': 'Government',
  'Budget process': 'Government',
  'Budget deficits and national debt': 'Government',
  'Executive agency funding and structure': 'Government',
  'Federal officials': 'Government',
  'Presidents and presidential powers, Vice Presidents': 'Government',
  'Political parties and affiliation': 'Government',
  'Elections, voting, political campaign regulation': 'Government',
  'Commemorative events and holidays': 'Government',
  'U.S. territories and protectorates': 'Government',
  'District of Columbia': 'Government',
  'Congressional operations and organization': 'Government',
  'Congressional committees': 'Government',
  'U.S. history': 'Government',
  'Constitution and constitutional amendments': 'Government',
  'Government ethics and transparency, public corruption': 'Government',
  'Government liability': 'Government',
  'Government trust funds': 'Government',
  'Performance measurement': 'Government',
  'Census and government statistics': 'Government',
  
  // Education  
  'Higher education': 'Education',
  'Elementary and secondary education': 'Education',
  'Teaching, teachers, curricula': 'Education',
  'Education programs funding': 'Education',
  'Special education': 'Education',
  'Vocational and technical education': 'Education',
  'Adult education and literacy': 'Education',
  'Educational facilities and institutions': 'Education',
  'Student aid and college costs': 'Education',
  'Preschool education': 'Education',
  'Educational guidance': 'Education',
  'Academic performance and assessments': 'Education',
  'Educational technology and distance education': 'Education',
  
  // Healthcare
  'Health promotion and preventive care': 'Healthcare',
  'Drug, alcohol, tobacco use': 'Healthcare',
  'Mental health': 'Healthcare',
  'Medical research': 'Healthcare',
  'Health care coverage and access': 'Healthcare',
  'Health facilities and institutions': 'Healthcare',
  'Medicare': 'Healthcare',
  'Medicaid': 'Healthcare',
  'Health care costs and insurance': 'Healthcare',
  'Health personnel': 'Healthcare',
  'Health programs administration and funding': 'Healthcare',
  'Health technology, devices, supplies': 'Healthcare',
  'Medical tests and diagnostic methods': 'Healthcare',
  'Drug safety, medical device, and laboratory regulation': 'Healthcare',
  'Prescription drugs': 'Healthcare',
  'Cancer': 'Healthcare',
  'Cardiovascular and respiratory health': 'Healthcare',
  'Infectious and parasitic diseases': 'Healthcare',
  'Neurological disorders': 'Healthcare',
  'Digestive and metabolic diseases': 'Healthcare',
  'Women\'s health': 'Healthcare',
  'Child health': 'Healthcare',
  'Aging': 'Healthcare',
  
  // Foreign Affairs
  'China': 'Foreign Affairs',
  'Middle East': 'Foreign Affairs',
  'Asia': 'Foreign Affairs',
  'Diplomacy, foreign officials, Americans abroad': 'Foreign Affairs',
  'International organizations and cooperation': 'Foreign Affairs',
  'Sanctions': 'Foreign Affairs',
  'Foreign aid and international relief': 'Foreign Affairs',
  'Human rights': 'Foreign Affairs',
  'Africa': 'Foreign Affairs',
  'Europe': 'Foreign Affairs',
  'Latin America': 'Foreign Affairs',
  'Russia': 'Foreign Affairs',
  'International law and treaties': 'Foreign Affairs',
  'United Nations': 'Foreign Affairs',
  'Iran': 'Foreign Affairs',
  'Israel': 'Foreign Affairs',
  'North Korea': 'Foreign Affairs',
  'Taiwan': 'Foreign Affairs',
  'Ukraine': 'Foreign Affairs',
  'Caribbean area': 'Foreign Affairs',
  
  // Defense
  'Military personnel and dependents': 'Defense',
  'National Guard and Reserves': 'Defense',
  'Military operations and strategy': 'Defense',
  'Veterans\' organizations and recognition': 'Defense',
  'Veterans\' medical care': 'Defense',
  'Terrorism': 'Defense',
  'Homeland security': 'Defense',
  'Military facilities and property': 'Defense',
  'Military procurement, research, weapons development': 'Defense',
  'Military readiness': 'Defense',
  'Department of Defense': 'Defense',
  'Intelligence activities, surveillance, classified information': 'Defense',
  'Veterans\' pensions and compensation': 'Defense',
  'Veterans\' education, employment, rehabilitation': 'Defense',
  'Veterans\' loans, housing, homeless programs': 'Defense',
  'Nuclear weapons': 'Defense',
  'Military education and training': 'Defense',
  'Military medicine': 'Defense',
  'Coast guard': 'Defense',
  'Conflicts and wars': 'Defense',
  'Military history': 'Defense',
  'Military law': 'Defense',
  'Alliances': 'Defense',
  'Arms control and nonproliferation': 'Defense',
  
  // Civil Rights
  'Law enforcement officers': 'Civil Rights',
  'Criminal investigation, prosecution, interrogation': 'Civil Rights',
  'Crime victims': 'Civil Rights',
  'Juvenile crime and gang violence': 'Civil Rights',
  'Civil actions and liability': 'Civil Rights',
  'Due process and equal protection': 'Civil Rights',
  'Voting rights': 'Civil Rights',
  'Racial and ethnic relations': 'Civil Rights',
  'Sex, gender, sexual orientation discrimination': 'Civil Rights',
  'First Amendment rights': 'Civil Rights',
  'Right of privacy': 'Civil Rights',
  'Disability and paralysis': 'Civil Rights',
  'Criminal procedure and sentencing': 'Civil Rights',
  'Correctional facilities and imprisonment': 'Civil Rights',
  'Drug trafficking and controlled substances': 'Civil Rights',
  'Fraud offenses and financial crimes': 'Civil Rights',
  'Human trafficking': 'Civil Rights',
  'Crimes against children': 'Civil Rights',
  'Crimes against women': 'Civil Rights',
  'Domestic violence and child abuse': 'Civil Rights',
  'Firearms and explosives': 'Civil Rights',
  'Hate crimes': 'Civil Rights',
  'Judicial procedure and administration': 'Civil Rights',
  'Supreme Court': 'Civil Rights',
  'Federal appellate courts': 'Civil Rights',
  'Federal district courts': 'Civil Rights',
  'Judges': 'Civil Rights',
  'Evidence and witnesses': 'Civil Rights',
  'Legal fees and court costs': 'Civil Rights',
  
  // Native Americans
  'Indian lands and resources rights': 'Native Americans',
  'Indian social and development programs': 'Native Americans',
  'Federal-Indian relations': 'Native Americans',
  'Alaska Natives and Hawaiians': 'Native Americans',
  
  // Technology
  'Computers and information technology': 'Technology',
  'Internet, web applications, social media': 'Technology',
  'Advanced technology and technological innovations': 'Technology',
  'Science and engineering education': 'Technology',
  'Research and development': 'Technology',
  'Telephone and wireless communication': 'Technology',
  'Broadcasting, Coverage of Digital Content': 'Technology',
  'Space flight and exploration': 'Technology',
  'Spacecraft and satellites': 'Technology',
  'Research administration and funding': 'Technology',
  'Computer security and identity theft': 'Technology',
  'Artificial intelligence': 'Technology',
  'Genetics': 'Technology',
  'Biotechnology': 'Technology',
  'Digital media': 'Technology',
  
  // Environment
  'Climate change and greenhouse gases': 'Environment',
  'Air quality': 'Environment',
  'Water quality': 'Environment',
  'Wildlife conservation and habitat protection': 'Environment',
  'Alternative and renewable resources': 'Environment',
  'Parks, recreation areas, trails': 'Environment',
  'Forests, forestry, trees': 'Environment',
  'Endangered and threatened species': 'Environment',
  'Environmental assessment, monitoring, research': 'Environment',
  'Hazardous wastes and toxic substances': 'Environment',
  'Oil and gas': 'Environment',
  'Electric power generation and transmission': 'Environment',
  'Energy efficiency and conservation': 'Environment',
  'Marine and coastal resources, fisheries': 'Environment',
  'Wilderness and natural areas, senic, wild': 'Environment',
  'Floods and storm protection': 'Environment',
  'Solid waste and recycling': 'Environment',
  'Land use and conservation': 'Environment',
  
  // Immigration
  'Immigration status and procedures': 'Immigration',
  'Refugees, asylum, displaced persons': 'Immigration',
  'Border security and unlawful immigration': 'Immigration',
  'Citizenship and naturalization': 'Immigration',
  'Visas and passports': 'Immigration',
  'Foreign labor': 'Immigration',
  
  // Economy
  'Taxation': 'Economy',
  'Small business': 'Economy',
  'Employment and training programs': 'Economy',
  'Trade agreements and negotiations': 'Economy',
  'Financial services and investments': 'Economy',
  'Tariffs': 'Economy',
  'Tax administration and collection, taxpayers': 'Economy',
  'Income tax credits': 'Economy',
  'Income tax deductions': 'Economy',
  'Business expenses': 'Economy',
  'Corporate finance and management': 'Economy',
  'Consumer credit': 'Economy',
  'Banking and financial institutions regulation': 'Economy',
  'Securities': 'Economy',
  'Inflation and prices': 'Economy',
  'Wages and earnings': 'Economy',
  'Unemployment': 'Economy',
  'Agricultural prices, subsidies, credit': 'Economy',
  'Agricultural trade': 'Economy',
  'Worker safety and health': 'Economy',
  'Labor-management relations': 'Economy',
  'Employee benefits and pensions': 'Economy',
  'Roads and highways': 'Economy',
  'Railroads': 'Economy',
  'Aviation and airports': 'Economy',
  'Public transit': 'Economy',
  'Motor vehicles': 'Economy',
  'Marine and inland water transportation': 'Economy',
  
  // Social Programs
  'Social security and elderly assistance': 'Social Programs',
  'Poverty and welfare assistance': 'Social Programs',
  'Housing supply and affordability': 'Social Programs',
  'Food assistance and relief': 'Social Programs',
  'Housing and community development funding': 'Social Programs',
  'Low- and moderate-income housing': 'Social Programs',
  'Homelessness and emergency shelter': 'Social Programs',
  'Child care and development': 'Social Programs',
  'Disability assistance': 'Social Programs',
  'Family relationships': 'Social Programs',
  'Family services': 'Social Programs',
  'Marriage and family status': 'Social Programs',
  'Rural conditions and development': 'Social Programs',
  'Urban and suburban affairs and development': 'Social Programs',
  'Community life and organization': 'Social Programs',
  'Economic development': 'Social Programs',
};

// Derive additional topics from subject terms
function deriveAdditionalTopics(subjectTerms: string[], primaryTopic: string): string[] {
  const topics = new Set<string>();
  
  for (const term of subjectTerms) {
    const mappedTopic = SUBJECT_TERM_MAPPING[term];
    if (mappedTopic && mappedTopic !== primaryTopic) {
      topics.add(mappedTopic);
    }
  }
  
  return [...topics];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { congress, batchSize = 500 } = await req.json().catch(() => ({}));
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Build query for bills with subject_terms but missing additional_topics
    let query = supabase
      .from('bills')
      .select('id, topic, subject_terms')
      .not('subject_terms', 'is', null)
      .or('additional_topics.is.null,additional_topics.eq.{}')
      .limit(batchSize);
    
    if (congress) {
      query = query.eq('congress', congress);
    }
    
    const { data: bills, error: fetchError } = await query;
    
    if (fetchError) throw fetchError;
    
    if (!bills || bills.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        processed: 0,
        message: 'No bills to process'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`[BackfillBillTopics] Processing ${bills.length} bills`);
    
    let processed = 0;
    let enriched = 0;
    
    // Process in smaller batches for updates
    const UPDATE_BATCH_SIZE = 50;
    
    for (let i = 0; i < bills.length; i += UPDATE_BATCH_SIZE) {
      const batch = bills.slice(i, i + UPDATE_BATCH_SIZE);
      
      const updates = batch.map(bill => {
        const subjectTerms = bill.subject_terms || [];
        const additionalTopics = deriveAdditionalTopics(subjectTerms, bill.topic);
        
        return {
          id: bill.id,
          additional_topics: additionalTopics // Always set - empty array if no matches
        };
      });
      
      // Update ALL bills to prevent infinite loop (empty array marks as processed)
      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('bills')
          .update({ additional_topics: update.additional_topics })
          .eq('id', update.id);
        
        if (updateError) {
          console.error(`[BackfillBillTopics] Error updating ${update.id}:`, updateError);
        } else if (update.additional_topics.length > 0) {
          enriched++;
        }
      }
      
      processed += batch.length;
    }
    
    // Count remaining
    let remainingQuery = supabase
      .from('bills')
      .select('id', { count: 'exact', head: true })
      .not('subject_terms', 'is', null)
      .or('additional_topics.is.null,additional_topics.eq.{}');
    
    if (congress) {
      remainingQuery = remainingQuery.eq('congress', congress);
    }
    
    const { count: remaining } = await remainingQuery;
    
    console.log(`[BackfillBillTopics] Processed ${processed}, enriched ${enriched}, remaining ${remaining}`);
    
    return new Response(JSON.stringify({
      success: true,
      processed,
      enriched,
      remaining: remaining || 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('[BackfillBillTopics] Error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});