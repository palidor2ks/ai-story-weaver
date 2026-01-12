import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Canonical topics for normalization (same as fetch-all-bills)
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
  'Law': 'Judicial',
  'Native Americans': 'Civil Rights',
  'Education': 'Education',
  'Social Sciences and History': 'Education',
  'Social Welfare': 'Social Programs',
  'Housing and Community Development': 'Social Programs',
  'Congress': 'Government',
  'Government Operations and Politics': 'Government',
  'Science, Technology, Communications': 'Technology',
};

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
  'Judicial procedure and administration': 'Judicial',
  'Supreme Court': 'Judicial',
  'Federal courts and judges': 'Judicial',
  'Judges': 'Judicial',
  'Legal fees and court costs': 'Judicial',
  'Jurisdiction and venue': 'Judicial',
  'Courts': 'Judicial',
  'Judicial review and appeals': 'Judicial',
  
  // Native Americans
  'Indian lands and resources rights': 'Native Americans',
  'Indian social and development programs': 'Native Americans',
  'Federal-Indian relations': 'Native Americans',
  
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

function normalizeTopic(policyArea: string | null | undefined): string {
  if (!policyArea) return 'Government';
  return TOPIC_NORMALIZATION[policyArea] || 'Government';
}

// Parse "H.R. 6938" -> { type: "HR", number: 6938 }
// Parse "S. 1234" -> { type: "S", number: 1234 }
// Parse "H.Res. 123" -> { type: "HRES", number: 123 }
// Parse "S.Res. 456" -> { type: "SRES", number: 456 }
// Parse "H.Con.Res. 12" -> { type: "HCONRES", number: 12 }
// Parse "S.Con.Res. 34" -> { type: "SCONRES", number: 34 }
// Parse "H.J.Res. 56" -> { type: "HJRES", number: 56 }
// Parse "S.J.Res. 78" -> { type: "SJRES", number: 78 }
function parseLegislationNumber(legNumber: string): { type: string; number: number } | null {
  if (!legNumber) return null;
  
  // Normalize and clean up
  const cleaned = legNumber.trim();
  
  // Match patterns like "H.R. 6938", "S. 1234", "H.Res. 123", etc.
  const patterns = [
    { regex: /^H\.R\.\s*(\d+)$/i, type: 'HR' },
    { regex: /^S\.\s*(\d+)$/i, type: 'S' },
    { regex: /^H\.Res\.\s*(\d+)$/i, type: 'HRES' },
    { regex: /^S\.Res\.\s*(\d+)$/i, type: 'SRES' },
    { regex: /^H\.Con\.Res\.\s*(\d+)$/i, type: 'HCONRES' },
    { regex: /^S\.Con\.Res\.\s*(\d+)$/i, type: 'SCONRES' },
    { regex: /^H\.J\.Res\.\s*(\d+)$/i, type: 'HJRES' },
    { regex: /^S\.J\.Res\.\s*(\d+)$/i, type: 'SJRES' },
  ];
  
  for (const { regex, type } of patterns) {
    const match = cleaned.match(regex);
    if (match) {
      return { type, number: parseInt(match[1], 10) };
    }
  }
  
  console.warn(`[ImportBillsExcel] Could not parse legislation number: ${legNumber}`);
  return null;
}

// Parse "Cole, Tom [Rep.-R-OK-4]" -> { name: "Cole, Tom", party: "Republican", state: "OK" }
function parseSponsor(sponsorStr: string | null | undefined): { name: string; party: string | null; state: string | null } {
  if (!sponsorStr) return { name: '', party: null, state: null };
  
  // Remove any markdown-style formatting
  const cleaned = sponsorStr.replace(/\\/g, '');
  
  // Match pattern: "Name [Type-Party-State-District]" or just "Name"
  const bracketMatch = cleaned.match(/^(.+?)\s*\[(.+?)\]$/);
  
  if (bracketMatch) {
    const name = bracketMatch[1].trim();
    const details = bracketMatch[2];
    
    // Parse the bracket content: "Rep.-R-OK-4" or "Sen.-D-CA"
    const detailParts = details.split('-');
    const partyCode = detailParts[1];
    const state = detailParts[2];
    
    let party = null;
    if (partyCode === 'R') party = 'Republican';
    else if (partyCode === 'D') party = 'Democrat';
    else if (partyCode === 'I') party = 'Independent';
    
    return { name, party, state: state || null };
  }
  
  return { name: cleaned, party: null, state: null };
}

// Derive status from "Latest Tracker Stage" and optionally "Latest Action"
function deriveStatusFromTrackerStage(
  stage: string | null | undefined,
  latestAction: string | null | undefined = null
): { 
  status: string; 
  passed_house: boolean; 
  passed_senate: boolean 
} {
  const stageLower = (stage || '').toLowerCase().trim();
  const actionLower = (latestAction || '').toLowerCase().trim();
  
  // Check tracker stage first
  if (stageLower.includes('became law')) {
    return { status: 'became_law', passed_house: true, passed_senate: true };
  }
  if (stageLower.includes('to president')) {
    return { status: 'to_president', passed_house: true, passed_senate: true };
  }
  if (stageLower.includes('resolving differences')) {
    return { status: 'resolving_differences', passed_house: true, passed_senate: true };
  }
  if (stageLower.includes('failed to pass over veto') || stageLower.includes('veto')) {
    return { status: 'veto_actions', passed_house: true, passed_senate: true };
  }
  
  // Handle failed votes - bill progressed but didn't complete
  if (stageLower.includes('failed')) {
    if (stageLower.includes('senate')) {
      // Failed in Senate means it passed House first
      return { status: 'passed_one_chamber', passed_house: true, passed_senate: false };
    }
    if (stageLower.includes('house')) {
      // Failed in House after Senate passed it
      return { status: 'passed_one_chamber', passed_house: false, passed_senate: true };
    }
  }
  
  if (stageLower.includes('passed house') || stageLower.includes('agreed to in house')) {
    return { status: 'passed_one_chamber', passed_house: true, passed_senate: false };
  }
  if (stageLower.includes('passed senate') || stageLower.includes('agreed to in senate')) {
    return { status: 'passed_one_chamber', passed_house: false, passed_senate: true };
  }
  
  // Fallback: check latest action text for progression clues
  if (!stage && actionLower) {
    // Check for failed votes in action text
    if (actionLower.includes('failed of passage') || actionLower.includes('failed to pass')) {
      if (actionLower.includes('senate')) {
        return { status: 'passed_one_chamber', passed_house: true, passed_senate: false };
      }
      if (actionLower.includes('house')) {
        return { status: 'passed_one_chamber', passed_house: false, passed_senate: true };
      }
    }
    
    // Check for Senate actions indicating House passage
    if (actionLower.includes('message on senate action') || 
        actionLower.includes('received in the senate') ||
        actionLower.includes('passed senate')) {
      return { status: 'passed_one_chamber', passed_house: true, passed_senate: false };
    }
    
    // Check for House actions indicating Senate passage  
    if (actionLower.includes('message on house action') ||
        actionLower.includes('received in the house') ||
        actionLower.includes('passed house')) {
      return { status: 'passed_one_chamber', passed_house: false, passed_senate: true };
    }
  }
  
  return { status: 'introduced', passed_house: false, passed_senate: false };
}

// Parse Excel date (could be string "1/6/26" or Excel serial number)
function parseExcelDate(dateVal: string | number | null | undefined): string | null {
  if (!dateVal) return null;
  
  if (typeof dateVal === 'number') {
    // Excel serial date number
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + dateVal * 86400000);
    return date.toISOString().split('T')[0];
  }
  
  if (typeof dateVal === 'string') {
    // Try to parse "1/6/26" format (M/D/YY)
    const parts = dateVal.split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[0], 10);
      const day = parseInt(parts[1], 10);
      let year = parseInt(parts[2], 10);
      
      // Handle 2-digit years
      if (year < 100) {
        year = year >= 50 ? 1900 + year : 2000 + year;
      }
      
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }
    
    // Try ISO format
    const date = new Date(dateVal);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  
  return null;
}

// Strip HTML tags from summary
function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function getChamberFromBillType(billType: string): string {
  const type = billType.toLowerCase();
  if (type.startsWith('h')) return 'house';
  if (type.startsWith('s')) return 'senate';
  return 'house';
}

// Collect values from duplicate columns like "billSubjectTerm", "billSubjectTerm_1", etc.
// xlsx.utils.sheet_to_json auto-renames duplicate columns with _1, _2 suffixes
function collectArrayValues(row: ExcelRow, prefix: string): string[] {
  const values: string[] = [];
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedPrefix}(_\\d+)?$`);
  
  for (const key of Object.keys(row)) {
    if (pattern.test(key)) {
      const val = row[key];
      if (val && typeof val === 'string' && val.trim()) {
        values.push(val.trim());
      }
    }
  }
  return [...new Set(values)]; // Deduplicate
}

interface ExcelRow {
  'Legislation Number'?: string;
  'URL'?: string;
  'Congress'?: string;
  'Title'?: string;
  'Sponsor'?: string;
  'Party of Sponsor'?: string;
  'Date of Introduction'?: string | number;
  'Committees'?: string;
  'Latest Action'?: string;
  'Latest Action Date'?: string | number;
  'Latest Tracker Stage'?: string;
  'billPolicyArea'?: string;
  'Latest Summary'?: string;
  'latestSummary'?: string;  // Alternative column name
  'Number of Cosponsors'?: string | number;
  'Number of Related Bills'?: string | number;
  'Amends Bill'?: string;
  [key: string]: unknown;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { rows, congress = 119 } = await req.json() as { rows: ExcelRow[]; congress?: number };
    
    if (!rows || !Array.isArray(rows)) {
      throw new Error('Expected rows array in request body');
    }
    
    console.log(`[ImportBillsExcel] Received ${rows.length} rows for Congress ${congress}`);
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const billsToInsert: Array<{
      id: string;
      name: string;
      bill_type: string;
      bill_number: number;
      congress: number;
      topic: string;
      chamber: string;
      introduced_date: string | null;
      summary: string | null;
      summary_fetched_at: string | null;
      status: string;
      passed_house: boolean;
      passed_senate: boolean;
      latest_action_text: string | null;
      latest_action_date: string | null;
      sponsor_name: string | null;
      sponsor_party: string | null;
      sponsor_state: string | null;
      cosponsor_count: number | null;
      status_updated_at: string;
      url: string | null;
      committees: string | null;
      subject_terms: string[];
      related_bill_count: number;
      related_bills: string[];
      amends_bill: string | null;
      additional_topics: string[] | null;
      raw_cosponsors: string[] | null;
    }> = [];
    
    const now = new Date().toISOString();
    const errors: string[] = [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      // Skip empty rows
      const legNumber = row['Legislation Number'];
      if (!legNumber) continue;
      
      const parsed = parseLegislationNumber(legNumber);
      if (!parsed) {
        errors.push(`Row ${i + 1}: Could not parse "${legNumber}"`);
        continue;
      }
      
      const billId = `${congress}-${parsed.type}.${parsed.number}`;
      const sponsor = parseSponsor(row['Sponsor']);
      const statusInfo = deriveStatusFromTrackerStage(row['Latest Tracker Stage'], row['Latest Action']);
      const summary = stripHtml(row['Latest Summary'] || row['latestSummary']);
      
      // Collect subject terms from repeated columns (billSubjectTerm, billSubjectTerm_1, etc.)
      const subjectTerms = collectArrayValues(row, 'billSubjectTerm');
      
      // Collect cosponsor names from repeated columns (Cosponsor, Cosponsor_1, etc.)
      const rawCosponsors = collectArrayValues(row, 'Cosponsor');
      
      // Collect related bills from repeated columns (Related Bill, Related Bill_1, etc.)
      // Filter out URLs, keep only bill IDs like "S.2354", "H.R.4754"
      const relatedBills = collectArrayValues(row, 'Related Bill')
        .filter(v => !v.startsWith('http') && !v.includes('/'));
      
      // Derive primary topic and additional topics from subject terms
      const primaryTopic = normalizeTopic(row['billPolicyArea']);
      const additionalTopics = deriveAdditionalTopics(subjectTerms, primaryTopic);
      
      billsToInsert.push({
        id: billId,
        name: row['Title'] || `${parsed.type} ${parsed.number}`,
        bill_type: parsed.type,
        bill_number: parsed.number,
        congress,
        topic: primaryTopic,
        chamber: getChamberFromBillType(parsed.type),
        introduced_date: parseExcelDate(row['Date of Introduction']),
        summary,
        summary_fetched_at: summary ? now : null,
        status: statusInfo.status,
        passed_house: statusInfo.passed_house,
        passed_senate: statusInfo.passed_senate,
        latest_action_text: row['Latest Action'] || null,
        latest_action_date: parseExcelDate(row['Latest Action Date']),
        sponsor_name: sponsor.name || null,
        sponsor_party: row['Party of Sponsor'] || sponsor.party || null,
        sponsor_state: sponsor.state || null,
        cosponsor_count: row['Number of Cosponsors'] ? 
          parseInt(String(row['Number of Cosponsors']), 10) || null : null,
        status_updated_at: now,
        url: row['URL'] || null,
        committees: row['Committees'] || null,
        subject_terms: subjectTerms,
        related_bill_count: row['Number of Related Bills'] 
          ? parseInt(String(row['Number of Related Bills']), 10) || 0 
          : 0,
        related_bills: relatedBills,
        amends_bill: row['Amends Bill'] || null,
        additional_topics: additionalTopics.length > 0 ? additionalTopics : null,
        raw_cosponsors: rawCosponsors.length > 0 ? rawCosponsors : null,
      });
    }
    
    console.log(`[ImportBillsExcel] Prepared ${billsToInsert.length} bills for upsert`);
    
    // Upsert in batches of 100
    const BATCH_SIZE = 100;
    let insertedCount = 0;
    
    for (let i = 0; i < billsToInsert.length; i += BATCH_SIZE) {
      const batch = billsToInsert.slice(i, i + BATCH_SIZE);
      
      const { error: upsertError } = await supabase
        .from('bills')
        .upsert(batch, { 
          onConflict: 'id',
          ignoreDuplicates: false 
        });
      
      if (upsertError) {
        console.error(`[ImportBillsExcel] Batch ${Math.floor(i / BATCH_SIZE)} error:`, upsertError);
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE)}: ${upsertError.message}`);
      } else {
        insertedCount += batch.length;
      }
    }
    
    console.log(`[ImportBillsExcel] Inserted ${insertedCount} bills with ${errors.length} errors`);
    
    return new Response(JSON.stringify({
      success: true,
      congress,
      totalRows: rows.length,
      inserted: insertedCount,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined, // Only return first 10 errors
      errorCount: errors.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('[ImportBillsExcel] Error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
