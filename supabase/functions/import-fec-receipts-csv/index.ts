import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

serve(async (req) => {
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

    console.log(`[CSV-IMPORT] Processing batch of ${rows.length} rows for cycle ${cycle}`);

    // Process rows into contributions
    const contributions: any[] = [];
    const donorAggregates = new Map<string, any>();
    let skippedRows = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        // Get sub_id - required for deduplication
        const subId = row.sub_id || row.SUB_ID;
        if (!subId) {
          skippedRows++;
          continue;
        }

        // Extract cycle from row or use provided
        const rowCycle = row.two_year_transaction_period || row.TWO_YEAR_TRANSACTION_PERIOD || cycle || '2024';
        
        // Map CSV columns to DB fields (handle both cases)
        const contributorName = row.contributor_name || row.CONTRIBUTOR_NAME || '';
        const entityType = row.entity_type || row.ENTITY_TYPE || 'IND';
        const amount = parseFloat(row.contribution_receipt_amount || row.CONTRIBUTION_RECEIPT_AMOUNT || '0');
        const receiptDate = parseReceiptDate(row.contribution_receipt_date || row.CONTRIBUTION_RECEIPT_DATE);
        const lineNumber = row.line_number || row.LINE_NUMBER || '';
        const memoCode = row.memo_code || row.MEMO_CODE || null;
        const memoText = row.memo_text || row.MEMO_TEXT || null;
        const recipientCommitteeId = committeeId || row.committee_id || row.COMMITTEE_ID || '';
        const recipientCommitteeName = row.committee_name || row.COMMITTEE_NAME || '';
        const city = row.contributor_city || row.CONTRIBUTOR_CITY || '';
        const state = row.contributor_state || row.CONTRIBUTOR_STATE || '';
        const zip = row.contributor_zip || row.CONTRIBUTOR_ZIP || '';
        const employer = row.contributor_employer || row.CONTRIBUTOR_EMPLOYER || '';
        const occupation = row.contributor_occupation || row.CONTRIBUTOR_OCCUPATION || '';
        const conduitCommitteeId = row.conduit_committee_id || row.CONDUIT_COMMITTEE_ID || null;
        const conduitCommitteeName = row.conduit_committee_name || row.CONDUIT_COMMITTEE_NAME || null;

        if (!contributorName || isNaN(amount)) {
          skippedRows++;
          continue;
        }

        const identityHash = await generateContributionHash(subId, rowCycle);
        const lineClass = classifyLineNumber(lineNumber);
        const earmarkInfo = parseEarmarkInfo(memoText);

        contributions.push({
          identity_hash: identityHash,
          fec_transaction_id: subId,
          contributor_name: contributorName,
          contributor_type: mapEntityType(entityType),
          amount: amount,
          cycle: rowCycle,
          receipt_date: receiptDate,
          line_number: lineNumber,
          memo_code: memoCode,
          memo_text: memoText,
          recipient_committee_id: recipientCommitteeId,
          recipient_committee_name: recipientCommitteeName,
          contributor_city: city,
          contributor_state: state,
          contributor_zip: zip,
          employer: employer,
          occupation: occupation,
          conduit_committee_id: conduitCommitteeId,
          conduit_committee_name: conduitCommitteeName,
          is_contribution: lineClass.isContribution,
          is_transfer: lineClass.isTransfer,
          is_earmarked: earmarkInfo.isEarmarked,
          candidate_id: candidateId || null
        });

        // Aggregate for donors table
        const donorId = await generateDonorId(
          contributorName,
          entityType,
          city,
          state,
          zip,
          recipientCommitteeId,
          rowCycle
        );

        if (donorAggregates.has(donorId)) {
          const existing = donorAggregates.get(donorId);
          existing.amount += amount;
          existing.transactionCount++;
          if (receiptDate) {
            if (!existing.firstReceiptDate || receiptDate < existing.firstReceiptDate) {
              existing.firstReceiptDate = receiptDate;
            }
            if (!existing.lastReceiptDate || receiptDate > existing.lastReceiptDate) {
              existing.lastReceiptDate = receiptDate;
            }
          }
        } else {
          donorAggregates.set(donorId, {
            id: donorId,
            name: contributorName,
            type: mapEntityType(entityType),
            amount: amount,
            cycle: rowCycle,
            transactionCount: 1,
            firstReceiptDate: receiptDate,
            lastReceiptDate: receiptDate,
            city: city,
            state: state,
            zip: zip,
            employer: employer,
            occupation: occupation,
            lineNumber: lineNumber,
            isContribution: lineClass.isContribution,
            isTransfer: lineClass.isTransfer,
            recipientCommitteeId: recipientCommitteeId,
            recipientCommitteeName: recipientCommitteeName,
            candidateId: candidateId || null
          });
        }
      } catch (err) {
        errors.push(`Row error: ${err}`);
        skippedRows++;
      }
    }

    console.log(`[CSV-IMPORT] Prepared ${contributions.length} contributions, ${donorAggregates.size} unique donors, ${skippedRows} skipped`);

    // Upsert contributions in chunks
    let insertedContributions = 0;
    const CHUNK_SIZE = 50;
    
    for (let i = 0; i < contributions.length; i += CHUNK_SIZE) {
      const chunk = contributions.slice(i, i + CHUNK_SIZE);
      const { error, count } = await supabase
        .from('contributions')
        .upsert(chunk, { 
          onConflict: 'identity_hash,cycle',
          ignoreDuplicates: true 
        });
      
      if (error) {
        console.error(`[CSV-IMPORT] Contribution upsert error:`, error);
        errors.push(`Contribution upsert: ${error.message}`);
      } else {
        insertedContributions += chunk.length;
      }
    }

    // Upsert donors
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

    for (let i = 0; i < donorRows.length; i += CHUNK_SIZE) {
      const chunk = donorRows.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase
        .from('donors')
        .upsert(chunk, {
          onConflict: 'id',
          ignoreDuplicates: false // Update existing with new totals
        });
      
      if (error) {
        console.error(`[CSV-IMPORT] Donor upsert error:`, error);
        errors.push(`Donor upsert: ${error.message}`);
      } else {
        insertedDonors += chunk.length;
      }
    }

    console.log(`[CSV-IMPORT] Completed: ${insertedContributions} contributions, ${insertedDonors} donors`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: rows.length,
        insertedContributions,
        insertedDonors,
        skippedRows,
        errors: errors.slice(0, 10) // Limit error messages
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
