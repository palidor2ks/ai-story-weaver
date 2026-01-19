import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { encode as hexEncode } from "https://deno.land/std@0.177.0/encoding/hex.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map FEC entity types to our donor types
function mapEntityType(entityType: string): 'Individual' | 'PAC' | 'Organization' | 'Unknown' {
  switch (entityType?.toUpperCase()) {
    case 'IND':
      return 'Individual';
    case 'COM':
    case 'PAC':
    case 'PTY':
      return 'PAC';
    case 'ORG':
    case 'CCM':
    case 'CAN':
      return 'Organization';
    default:
      return 'Unknown';
  }
}

interface LineClassification {
  isContribution: boolean;
  isTransfer: boolean;
  receiptType: 'contribution' | 'transfer' | 'other_receipt';
}

function classifyLineNumber(lineNumber: string | null): LineClassification {
  if (!lineNumber) return { isContribution: true, isTransfer: false, receiptType: 'contribution' };
  
  const line = lineNumber.toUpperCase();
  const isLine11 = line.startsWith('11');
  const isLine12 = line.startsWith('12');
  const isLine15 = line.startsWith('15');
  const isLine17 = line.startsWith('17');
  
  if (isLine11) {
    return { isContribution: true, isTransfer: false, receiptType: 'contribution' };
  } else if (isLine12) {
    return { isContribution: true, isTransfer: true, receiptType: 'transfer' };
  } else if (isLine15) {
    return { isContribution: true, isTransfer: false, receiptType: 'other_receipt' };
  } else if (isLine17) {
    return { isContribution: true, isTransfer: false, receiptType: 'contribution' };
  }
  
  return { isContribution: true, isTransfer: false, receiptType: 'other_receipt' };
}

// Parse earmark info from memo text
function parseEarmarkInfo(memoText: string | null): { isEarmarked: boolean; isEarmarkPassThrough: boolean } {
  if (!memoText) return { isEarmarked: false, isEarmarkPassThrough: false };
  
  const upperMemo = memoText.toUpperCase();
  
  if (upperMemo.includes('SEE BELOW') || upperMemo.includes('EARMARKED CONTRIBUTION:')) {
    return { isEarmarked: true, isEarmarkPassThrough: true };
  }
  
  const earmarkPatterns = [
    /EARMARKED\s+FOR/i,
    /EARMARKED\s+THROUGH/i,
    /DESIGNATED\s+FOR/i,
    /EAR\s*MARKED\s+FOR/i,
  ];
  
  for (const pattern of earmarkPatterns) {
    if (pattern.test(memoText)) {
      return { isEarmarked: true, isEarmarkPassThrough: false };
    }
  }
  
  if (upperMemo.includes('ACTBLUE') || upperMemo.includes('WINRED') || upperMemo.includes('CONDUIT')) {
    return { isEarmarked: true, isEarmarkPassThrough: false };
  }
  
  return { isEarmarked: false, isEarmarkPassThrough: false };
}

// Generate identity hash for deduplication
async function generateContributionHash(subId: string, cycle: string): Promise<string> {
  const identityKey = `${subId}|${cycle}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(identityKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const hashHex = new TextDecoder().decode(hexEncode(hashArray));
  return `contrib-${hashHex.slice(0, 32)}`;
}

// Generate donor identity hash for aggregation
async function generateDonorId(
  contributorName: string,
  entityType: string,
  city: string,
  state: string,
  zip: string,
  committeeId: string,
  cycle: string
): Promise<string> {
  let identityKey: string;
  
  if (entityType === 'IND') {
    identityKey = [
      contributorName.toLowerCase().trim(),
      city?.toLowerCase().trim() || '',
      state?.toUpperCase().trim() || '',
      (zip || '').slice(0, 5),
      committeeId,
      cycle
    ].join('|');
  } else {
    identityKey = [
      contributorName.toLowerCase().trim(),
      state?.toUpperCase().trim() || '',
      committeeId,
      cycle
    ].join('|');
  }
  
  const encoder = new TextEncoder();
  const data = encoder.encode(identityKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const hashHex = new TextDecoder().decode(hexEncode(hashArray));
  return `fec-${hashHex.slice(0, 32)}`;
}

// Parse date from FEC format (MM/DD/YYYY or YYYY-MM-DD)
function parseReceiptDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  
  // Try MM/DD/YYYY format
  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  return null;
}

// Retry helper with exponential backoff and jitter
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 500
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const isRetryable = 
        err.message?.includes('57014') ||
        err.message?.includes('statement timeout') ||
        err.message?.includes('upstream request timeout') ||
        err.message?.includes('connection closed') ||
        err.code === '57014';
      
      if (!isRetryable || attempt === maxRetries - 1) {
        throw err;
      }
      
      // Exponential backoff with jitter
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
      console.log(`[CSV-IMPORT] Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms: ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Use modern Deno.serve() API
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { rows, cycle, candidateId, committeeId } = body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'rows array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const startTime = Date.now();
    const batchTag = rows[0]?.sub_id || rows[0]?.SUB_ID || 'unknown';
    console.log(`[CSV-IMPORT] batch_tag=${batchTag} rows=${rows.length} cycle=${cycle}`);

    // Pre-generate all contribution hashes in parallel for speed
    const hashPromises: Promise<{ index: number; subId: string; hash: string } | null>[] = rows.map(async (row, index) => {
      const subId = row.sub_id || row.SUB_ID;
      if (!subId) return null;
      const rowCycle = row.two_year_transaction_period || row.TWO_YEAR_TRANSACTION_PERIOD || cycle || '2024';
      const hash = await generateContributionHash(subId, rowCycle);
      return { index, subId, hash };
    });
    
    const hashResults = await Promise.all(hashPromises);
    const hashMap = new Map<number, string>();
    for (const result of hashResults) {
      if (result) hashMap.set(result.index, result.hash);
    }
    
    const hashTime = Date.now() - startTime;

    // Build intermediate array for parallel donor ID generation
    interface RowData {
      index: number;
      contributorName: string;
      entityType: string;
      city: string;
      state: string;
      zip: string;
      recipientCommitteeId: string;
      rowCycle: string;
      amount: number;
      receiptDate: string | null;
      lineNumber: string;
      memoCode: string | null;
      memoText: string | null;
      recipientCommitteeName: string;
      employer: string;
      occupation: string;
      conduitCommitteeId: string | null;
      conduitCommitteeName: string | null;
      transactionId: string | null;
      subId: string;
    }

    const rowDataArray: RowData[] = [];
    let skippedRows = 0;
    const errors: string[] = [];

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      try {
        const subId = row.sub_id || row.SUB_ID;
        if (!subId) {
          skippedRows++;
          continue;
        }

        const rowCycle = row.two_year_transaction_period || row.TWO_YEAR_TRANSACTION_PERIOD || cycle || '2024';
        const contributorName = row.contributor_name || row.CONTRIBUTOR_NAME || '';
        const entityType = row.entity_type || row.ENTITY_TYPE || 'IND';
        const amount = parseFloat(row.contribution_receipt_amount || row.CONTRIBUTION_RECEIPT_AMOUNT || '0');

        if (!contributorName || isNaN(amount)) {
          skippedRows++;
          continue;
        }

        rowDataArray.push({
          index: rowIndex,
          contributorName,
          entityType,
          city: row.contributor_city || row.CONTRIBUTOR_CITY || '',
          state: row.contributor_state || row.CONTRIBUTOR_STATE || '',
          zip: row.contributor_zip || row.CONTRIBUTOR_ZIP || '',
          recipientCommitteeId: committeeId || row.committee_id || row.COMMITTEE_ID || '',
          rowCycle,
          amount,
          receiptDate: parseReceiptDate(row.contribution_receipt_date || row.CONTRIBUTION_RECEIPT_DATE),
          lineNumber: row.line_number || row.LINE_NUMBER || '',
          memoCode: row.memo_code || row.MEMO_CODE || null,
          memoText: row.memo_text || row.MEMO_TEXT || null,
          recipientCommitteeName: row.committee_name || row.COMMITTEE_NAME || '',
          employer: row.contributor_employer || row.CONTRIBUTOR_EMPLOYER || '',
          occupation: row.contributor_occupation || row.CONTRIBUTOR_OCCUPATION || '',
          conduitCommitteeId: row.conduit_committee_id || row.CONDUIT_COMMITTEE_ID || null,
          conduitCommitteeName: row.conduit_committee_name || row.CONDUIT_COMMITTEE_NAME || null,
          transactionId: row.transaction_id || row.TRANSACTION_ID || null,
          subId
        });
      } catch (err) {
        errors.push(`Row ${rowIndex} parse error: ${err}`);
        skippedRows++;
      }
    }

    // Generate all donor IDs in parallel
    const donorIdPromises = rowDataArray.map(async (rd) => {
      const donorId = await generateDonorId(
        rd.contributorName,
        rd.entityType,
        rd.city,
        rd.state,
        rd.zip,
        rd.recipientCommitteeId,
        rd.rowCycle
      );
      return { ...rd, donorId };
    });

    const rowsWithDonorIds = await Promise.all(donorIdPromises);
    const donorIdTime = Date.now() - startTime - hashTime;

    // Build contributions array and aggregate donors
    const contributions: any[] = [];
    const donorAggregates = new Map<string, any>();

    for (const rd of rowsWithDonorIds) {
      const identityHash = hashMap.get(rd.index)!;
      const lineClass = classifyLineNumber(rd.lineNumber);
      const earmarkInfo = parseEarmarkInfo(rd.memoText);

      contributions.push({
        identity_hash: identityHash,
        fec_transaction_id: rd.subId,
        fec_committee_transaction_id: rd.transactionId,
        contributor_name: rd.contributorName,
        contributor_type: mapEntityType(rd.entityType),
        amount: Math.round(rd.amount),
        cycle: rd.rowCycle,
        receipt_date: rd.receiptDate,
        line_number: rd.lineNumber,
        memo_code: rd.memoCode,
        memo_text: rd.memoText,
        recipient_committee_id: rd.recipientCommitteeId,
        recipient_committee_name: rd.recipientCommitteeName,
        contributor_city: rd.city,
        contributor_state: rd.state,
        contributor_zip: rd.zip,
        employer: rd.employer,
        occupation: rd.occupation,
        conduit_committee_id: rd.conduitCommitteeId,
        conduit_committee_name: rd.conduitCommitteeName,
        is_contribution: lineClass.isContribution,
        is_transfer: lineClass.isTransfer,
        is_earmarked: earmarkInfo.isEarmarked,
        candidate_id: candidateId || null
      });

      // Aggregate for donors table
      if (donorAggregates.has(rd.donorId)) {
        const existing = donorAggregates.get(rd.donorId);
        existing.amount += Math.round(rd.amount);
        existing.transactionCount++;
        if (rd.receiptDate) {
          if (!existing.firstReceiptDate || rd.receiptDate < existing.firstReceiptDate) {
            existing.firstReceiptDate = rd.receiptDate;
          }
          if (!existing.lastReceiptDate || rd.receiptDate > existing.lastReceiptDate) {
            existing.lastReceiptDate = rd.receiptDate;
          }
        }
      } else {
        donorAggregates.set(rd.donorId, {
          id: rd.donorId,
          name: rd.contributorName,
          type: mapEntityType(rd.entityType),
          amount: Math.round(rd.amount),
          cycle: rd.rowCycle,
          transactionCount: 1,
          firstReceiptDate: rd.receiptDate,
          lastReceiptDate: rd.receiptDate,
          city: rd.city,
          state: rd.state,
          zip: rd.zip,
          employer: rd.employer,
          occupation: rd.occupation,
          lineNumber: rd.lineNumber,
          isContribution: classifyLineNumber(rd.lineNumber).isContribution,
          isTransfer: classifyLineNumber(rd.lineNumber).isTransfer,
          recipientCommitteeId: rd.recipientCommitteeId,
          recipientCommitteeName: rd.recipientCommitteeName,
          candidateId: candidateId || null
        });
      }
    }

    const prepTime = Date.now() - startTime;

    // Upsert contributions in small chunks with retry - INSERT ONLY (skip existing)
    let insertedContributions = 0;
    const CONTRIBUTION_CHUNK_SIZE = 100;  // Larger chunks since we're skipping conflicts
    const DONOR_CHUNK_SIZE = 25;
    const totalContribChunks = Math.ceil(contributions.length / CONTRIBUTION_CHUNK_SIZE);
    
    const contribStartTime = Date.now();
    
    for (let i = 0; i < contributions.length; i += CONTRIBUTION_CHUNK_SIZE) {
      const chunkNum = Math.floor(i / CONTRIBUTION_CHUNK_SIZE) + 1;
      const chunk = contributions.slice(i, i + CONTRIBUTION_CHUNK_SIZE);
      
      try {
        await retryWithBackoff(async () => {
          const { error, count } = await supabase
            .from('contributions')
            .upsert(chunk, { 
              onConflict: 'identity_hash,cycle',
              ignoreDuplicates: true  // INSERT ONLY - skip existing rows, much faster
            });
          
          if (error) {
            throw error;
          }
          insertedContributions += chunk.length;
        }, 3, 500);
      } catch (err: any) {
        console.error(`[CSV-IMPORT] Contribution chunk ${chunkNum}/${totalContribChunks} FAILED:`, err.message);
        errors.push(`Contribution chunk ${chunkNum}: ${err.message}`);
      }
    }
    
    const contribTime = Date.now() - contribStartTime;

    // Upsert donors with retry
    let insertedDonors = 0;
    const donorRows = Array.from(donorAggregates.values()).map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      amount: d.amount,
      cycle: d.cycle,
      transaction_count: d.transactionCount,
      first_receipt_date: d.firstReceiptDate,
      last_receipt_date: d.lastReceiptDate,
      contributor_city: d.city,
      contributor_state: d.state,
      contributor_zip: d.zip,
      employer: d.employer,
      occupation: d.occupation,
      line_number: d.lineNumber,
      is_contribution: d.isContribution,
      is_transfer: d.isTransfer,
      recipient_committee_id: d.recipientCommitteeId,
      recipient_committee_name: d.recipientCommitteeName,
      candidate_id: d.candidateId
    }));

    const totalDonorChunks = Math.ceil(donorRows.length / DONOR_CHUNK_SIZE);
    const donorStartTime = Date.now();
    
    for (let i = 0; i < donorRows.length; i += DONOR_CHUNK_SIZE) {
      const chunkNum = Math.floor(i / DONOR_CHUNK_SIZE) + 1;
      const chunk = donorRows.slice(i, i + DONOR_CHUNK_SIZE);
      
      try {
        await retryWithBackoff(async () => {
          const { error } = await supabase
            .from('donors')
            .upsert(chunk, {
              onConflict: 'id',
              ignoreDuplicates: false // Donors need updates for aggregation
            });
          
          if (error) {
            throw error;
          }
          insertedDonors += chunk.length;
        }, 3, 500);
      } catch (err: any) {
        console.error(`[CSV-IMPORT] Donor chunk ${chunkNum}/${totalDonorChunks} FAILED:`, err.message);
        errors.push(`Donor chunk ${chunkNum}: ${err.message}`);
      }
    }
    
    const donorTime = Date.now() - donorStartTime;
    const totalTime = Date.now() - startTime;

    // Structured timing log for debugging
    console.log(`[CSV-IMPORT] batch_tag=${batchTag} timing={"prep_ms":${prepTime},"hash_ms":${hashTime},"donor_id_ms":${donorIdTime},"contrib_upsert_ms":${contribTime},"donor_upsert_ms":${donorTime},"total_ms":${totalTime}} counts={"contributions":${insertedContributions},"donors":${insertedDonors},"skipped":${skippedRows},"errors":${errors.length}}`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: rows.length,
        insertedContributions,
        insertedDonors,
        skippedRows,
        errors: errors.slice(0, 10),
        timing: {
          prep_ms: prepTime,
          contrib_upsert_ms: contribTime,
          donor_upsert_ms: donorTime,
          total_ms: totalTime
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CSV-IMPORT] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
