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

// Check if sub_id looks corrupted (scientific notation from Excel)
function isCorruptedSubId(subId: string): boolean {
  if (!subId) return true;
  // Scientific notation patterns: 4.02272E+18, 4.02E18, etc.
  if (/[eE][+-]?\d+/.test(subId)) return true;
  // Should be a long integer, not contain dots unless scientific
  if (subId.includes('.') && !subId.includes('E') && !subId.includes('e')) return true;
  return false;
}

// Generate identity hash for deduplication
// Uses sub_id if valid, otherwise falls back to a composite key
async function generateContributionHash(
  subId: string, 
  cycle: string,
  fallbackKey?: { committeeId: string; transactionId: string; fileNumber?: string; amount?: number; date?: string }
): Promise<string> {
  let identityKey: string;
  
  if (!isCorruptedSubId(subId)) {
    // Clean sub_id - use it directly
    identityKey = `${subId}|${cycle}`;
  } else if (fallbackKey?.transactionId) {
    // Corrupted sub_id but we have transaction_id - use composite fallback
    identityKey = `${fallbackKey.committeeId}|${cycle}|${fallbackKey.transactionId}|${fallbackKey.amount || 0}|${fallbackKey.date || ''}`;
    console.log(`[CSV-IMPORT] Using fallback identity for corrupted sub_id: ${subId}`);
  } else {
    // Last resort - use the corrupted sub_id (will cause collisions but better than nothing)
    identityKey = `${subId}|${cycle}`;
  }
  
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

// Parse date from FEC format (MM/DD/YYYY, MM/DD/YYYY H:MM, or YYYY-MM-DD)
function parseReceiptDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  
  // Strip any time component first (e.g., "1/11/2024 0:00" -> "1/11/2024")
  const dateOnly = dateStr.split(' ')[0].trim();
  
  // Try MM/DD/YYYY format
  const slashMatch = dateOnly.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return dateOnly;
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


  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { rows, cycle, candidateId, committeeId, multiCommittee } = body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'rows array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const startTime = Date.now();
    const batchTag = rows[0]?.sub_id || rows[0]?.SUB_ID || 'unknown';
    console.log(`[CSV-IMPORT] batch_tag=${batchTag} rows=${rows.length} cycle=${cycle}`);

    // Check for corrupted sub_ids and warn
    let corruptedSubIdCount = 0;
    for (const row of rows) {
      const subId = row.sub_id || row.SUB_ID || '';
      if (isCorruptedSubId(subId)) corruptedSubIdCount++;
    }
    if (corruptedSubIdCount > rows.length * 0.1) {
      console.warn(`[CSV-IMPORT] WARNING: ${corruptedSubIdCount}/${rows.length} (${Math.round(corruptedSubIdCount/rows.length*100)}%) rows have corrupted sub_id values (scientific notation). Using fallback identity.`);
    }

    // Pre-generate all contribution hashes in parallel for speed
    const hashPromises: Promise<{ index: number; subId: string; hash: string } | null>[] = rows.map(async (row, index) => {
      const subId = row.sub_id || row.SUB_ID;
      if (!subId) return null;
      const rowCycle = row.two_year_transaction_period || row.TWO_YEAR_TRANSACTION_PERIOD || cycle || '2024';
      const transactionId = row.transaction_id || row.TRANSACTION_ID || '';
      const amount = parseFloat(row.contribution_receipt_amount || row.CONTRIBUTION_RECEIPT_AMOUNT || '0');
      const date = row.contribution_receipt_date || row.CONTRIBUTION_RECEIPT_DATE || '';
      const rowCommitteeId = committeeId || row.committee_id || row.COMMITTEE_ID || '';
      
      const hash = await generateContributionHash(subId, rowCycle, {
        committeeId: rowCommitteeId,
        transactionId,
        amount,
        date
      });
      return { index, subId, hash };
    });
    
    const hashResults = await Promise.all(hashPromises);
    const hashMap = new Map<number, string>();
    const uniqueHashes = new Set<string>();
    for (const result of hashResults) {
      if (result) {
        hashMap.set(result.index, result.hash);
        uniqueHashes.add(result.hash);
      }
    }
    
    // Log collision rate for debugging
    const collisionRate = 1 - (uniqueHashes.size / hashMap.size);
    if (collisionRate > 0.1) {
      console.warn(`[CSV-IMPORT] High hash collision rate: ${Math.round(collisionRate*100)}% (${uniqueHashes.size} unique from ${hashMap.size} rows)`);
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

    // Multi-committee mode: build committee_id -> candidate_id map from candidate_committees
    const committeeToCandidate = new Map<string, string | null>();
    const unmappedCommittees = new Set<string>();
    if (multiCommittee) {
      const distinctCommittees = Array.from(
        new Set(rowsWithDonorIds.map(rd => rd.recipientCommitteeId).filter(Boolean))
      );
      if (distinctCommittees.length > 0) {
        const { data: mappings, error: mapErr } = await supabase
          .from('candidate_committees')
          .select('fec_committee_id, candidate_id')
          .in('fec_committee_id', distinctCommittees);
        if (mapErr) {
          console.error('[CSV-IMPORT] candidate_committees lookup failed:', mapErr.message);
        } else if (mappings) {
          for (const m of mappings) {
            if (m.candidate_id) committeeToCandidate.set(m.fec_committee_id, m.candidate_id);
          }
        }
        for (const cid of distinctCommittees) {
          if (!committeeToCandidate.has(cid)) unmappedCommittees.add(cid);
        }
      }
      console.log(`[CSV-IMPORT] multi-committee: ${distinctCommittees.length} committees, ${committeeToCandidate.size} mapped, ${unmappedCommittees.size} unmapped`);
    }

    const resolveCandidateId = (rowCommitteeId: string): string | null => {
      if (multiCommittee) return committeeToCandidate.get(rowCommitteeId) || null;
      return candidateId || null;
    };

    // Build contributions array and aggregate donors
    const contributions: any[] = [];
    const donorAggregates = new Map<string, any>();
    const committeeBreakdown = new Map<string, { rows: number; candidate_id: string | null }>();

    for (const rd of rowsWithDonorIds) {
      const identityHash = hashMap.get(rd.index)!;
      const lineClass = classifyLineNumber(rd.lineNumber);
      const earmarkInfo = parseEarmarkInfo(rd.memoText);
      const rowCandidateId = resolveCandidateId(rd.recipientCommitteeId);

      // Track per-committee row counts for the response
      if (rd.recipientCommitteeId) {
        const existing = committeeBreakdown.get(rd.recipientCommitteeId);
        if (existing) existing.rows++;
        else committeeBreakdown.set(rd.recipientCommitteeId, { rows: 1, candidate_id: rowCandidateId });
      }

      // CRITICAL: Line 12 Individual records are attribution records showing WHO contributed through a JFC
      // They should have memo_code='X' to be excluded from reconciliation totals (FEC excludes them)
      const contributorType = mapEntityType(rd.entityType);
      const isLine12Attribution = rd.lineNumber?.toUpperCase()?.startsWith('12') && contributorType === 'Individual';
      
      // CRITICAL: Conduit aggregate records (WINRED/ActBlue pass-through totals on Line 11AI)
      // These are Organization records with memo_text like "TOTAL EARMARKED THROUGH CONDUIT..."
      // FEC excludes them from individual_itemized_contributions - we should too
      const isConduitAggregate = 
        rd.lineNumber?.toUpperCase() === '11AI' && 
        contributorType !== 'Individual' &&
        rd.memoText?.toUpperCase()?.includes('EARMARKED THROUGH CONDUIT');
      
      const effectiveMemoCode = (isLine12Attribution || isConduitAggregate) ? 'X' : (rd.memoCode || null);

      contributions.push({
        identity_hash: identityHash,
        fec_transaction_id: rd.subId,
        fec_committee_transaction_id: rd.transactionId,
        contributor_name: rd.contributorName,
        contributor_type: contributorType,
        amount: Math.round(rd.amount),
        cycle: rd.rowCycle,
        receipt_date: rd.receiptDate,
        line_number: rd.lineNumber,
        memo_code: effectiveMemoCode,
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
        candidate_id: rowCandidateId
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
          candidateId: rowCandidateId
        });
      }
    }

    const prepTime = Date.now() - startTime;

    // First, check which identity_hashes already exist to get accurate insert counts
    const allHashes = contributions.map(c => c.identity_hash);
    let existingHashSet = new Set<string>();
    
    // Query existing hashes in chunks to avoid query size limits
    const HASH_CHECK_CHUNK = 500;
    for (let i = 0; i < allHashes.length; i += HASH_CHECK_CHUNK) {
      const hashChunk = allHashes.slice(i, i + HASH_CHECK_CHUNK);
      const { data: existingRows } = await supabase
        .from('contributions')
        .select('identity_hash')
        .eq('cycle', cycle)
        .in('identity_hash', hashChunk);
      
      if (existingRows) {
        for (const row of existingRows) {
          existingHashSet.add(row.identity_hash);
        }
      }
    }
    
    const newContributions = contributions.filter(c => !existingHashSet.has(c.identity_hash));
    const skippedDuplicates = contributions.length - newContributions.length;
    
    console.log(`[CSV-IMPORT] Pre-check: ${newContributions.length} new, ${skippedDuplicates} existing (will skip)`);

    // Upsert contributions in small chunks with retry - INSERT ONLY (skip existing)
    let insertedContributions = 0;
    let actualInserts = 0;
    const CONTRIBUTION_CHUNK_SIZE = 100;  // Larger chunks since we're skipping conflicts
    const DONOR_CHUNK_SIZE = 25;
    const totalContribChunks = Math.ceil(contributions.length / CONTRIBUTION_CHUNK_SIZE);
    
    const contribStartTime = Date.now();
    
    for (let i = 0; i < contributions.length; i += CONTRIBUTION_CHUNK_SIZE) {
      const chunkNum = Math.floor(i / CONTRIBUTION_CHUNK_SIZE) + 1;
      const chunk = contributions.slice(i, i + CONTRIBUTION_CHUNK_SIZE);
      const newInChunk = chunk.filter(c => !existingHashSet.has(c.identity_hash)).length;
      
      try {
        await retryWithBackoff(async () => {
          const { error } = await supabase
            .from('contributions')
            .upsert(chunk, { 
              onConflict: 'identity_hash,cycle',
              ignoreDuplicates: true  // INSERT ONLY - skip existing rows, much faster
            });
          
          if (error) {
            throw error;
          }
          insertedContributions += chunk.length;
          actualInserts += newInChunk;
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
    console.log(`[CSV-IMPORT] batch_tag=${batchTag} timing={"prep_ms":${prepTime},"hash_ms":${hashTime},"donor_id_ms":${donorIdTime},"contrib_upsert_ms":${contribTime},"donor_upsert_ms":${donorTime},"total_ms":${totalTime}} counts={"processed":${insertedContributions},"inserted":${actualInserts},"skipped_dupes":${skippedDuplicates},"skipped_invalid":${skippedRows},"donors":${insertedDonors},"errors":${errors.length}}`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: rows.length,
        insertedContributions: actualInserts,  // Now reflects ACTUAL new inserts
        skippedDuplicates,                      // Rows that already existed
        insertedDonors,
        skippedRows,                            // Rows with missing/invalid data
        uniqueHashes: uniqueHashes.size,        // For debugging collision issues
        corruptedSubIds: corruptedSubIdCount,   // For file health warning
        errors: errors.slice(0, 10),
        committeeBreakdown: Object.fromEntries(committeeBreakdown),
        unmappedCommittees: Array.from(unmappedCommittees),
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
