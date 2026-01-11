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
  'Law': 'Civil Rights',
  'Native Americans': 'Civil Rights',
  'Education': 'Education',
  'Social Sciences and History': 'Education',
  'Social Welfare': 'Social Programs',
  'Housing and Community Development': 'Social Programs',
  'Congress': 'Government',
  'Government Operations and Politics': 'Government',
  'Science, Technology, Communications': 'Technology',
};

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
      const summary = stripHtml(row['Latest Summary']);
      
      // Collect subject terms from repeated columns (billSubjectTerm, billSubjectTerm_1, etc.)
      const subjectTerms = collectArrayValues(row, 'billSubjectTerm');
      
      // Collect related bills from repeated columns (Related Bill, Related Bill_1, etc.)
      // Filter out URLs, keep only bill IDs like "S.2354", "H.R.4754"
      const relatedBills = collectArrayValues(row, 'Related Bill')
        .filter(v => !v.startsWith('http') && !v.includes('/'));
      
      billsToInsert.push({
        id: billId,
        name: row['Title'] || `${parsed.type} ${parsed.number}`,
        bill_type: parsed.type,
        bill_number: parsed.number,
        congress,
        topic: normalizeTopic(row['billPolicyArea']),
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
