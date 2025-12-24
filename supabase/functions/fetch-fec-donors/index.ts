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
}

// Classify a line_number to determine if it's a contribution and/or transfer
function classifyLineNumber(lineNumber: string | null): LineClassification {
  if (!lineNumber) return { isContribution: true, isTransfer: false };
  
  const line = lineNumber.toUpperCase();
  const isLine11 = line.startsWith('11');
  const isLine12 = line.startsWith('12');
  const isLine17 = line.startsWith('17');
  
  const isContribution = isLine11 || isLine12 || isLine17;
  const isTransfer = isLine12;
  
  return { isContribution, isTransfer };
}

// Generate a stable SHA-256 based ID for donor identity (aggregated)
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
      city.toLowerCase().trim(),
      state.toUpperCase().trim(),
      zip.slice(0, 5),
      committeeId,
      cycle
    ].join('|');
  } else {
    identityKey = [
      contributorName.toLowerCase().trim(),
      state.toUpperCase().trim(),
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

// Generate a unique identity hash for a single contribution transaction
async function generateContributionHash(
  contributorName: string,
  amount: number,
  receiptDate: string | null,
  committeeId: string,
  cycle: string,
  fecSubId: string | null
): Promise<string> {
  const identityKey = fecSubId 
    ? `${fecSubId}|${cycle}`
    : [
        contributorName.toLowerCase().trim(),
        amount.toString(),
        receiptDate || '',
        committeeId,
        cycle
      ].join('|');
  
  const encoder = new TextEncoder();
  const data = encoder.encode(identityKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const hashHex = new TextDecoder().decode(hexEncode(hashArray));
  
  return `contrib-${hashHex.slice(0, 32)}`;
}

// Parse earmark info from memo text
interface EarmarkInfo {
  isEarmarked: boolean;
  earmarkedForName: string | null;
  conduitCommitteeId: string | null;
}

function parseEarmarkInfo(memoText: string | null, _memoCode: string | null): EarmarkInfo {
  if (!memoText) {
    return { isEarmarked: false, earmarkedForName: null, conduitCommitteeId: null };
  }
  
  const upperMemo = memoText.toUpperCase();
  
  const earmarkPatterns = [
    /EARMARKED\s+FOR\s+(.+?)(?:\s*\(|$|\.|,)/i,
    /DESIGNATED\s+FOR\s+(.+?)(?:\s*\(|$|\.|,)/i,
    /EAR\s*MARKED\s+FOR\s+(.+?)(?:\s*\(|$|\.|,)/i,
  ];
  
  for (const pattern of earmarkPatterns) {
    const match = memoText.match(pattern);
    if (match) {
      return {
        isEarmarked: true,
        earmarkedForName: match[1].trim(),
        conduitCommitteeId: null
      };
    }
  }
  
  if (upperMemo.includes('ACTBLUE') || upperMemo.includes('WINRED') || upperMemo.includes('CONDUIT')) {
    return {
      isEarmarked: true,
      earmarkedForName: null,
      conduitCommitteeId: null
    };
  }
  
  return { isEarmarked: false, earmarkedForName: null, conduitCommitteeId: null };
}

interface AggregatedDonor {
  name: string;
  type: 'Individual' | 'PAC' | 'Organization' | 'Unknown';
  amount: number;
  transactionCount: number;
  firstReceiptDate: string | null;
  lastReceiptDate: string | null;
  city: string;
  state: string;
  zip: string;
  employer: string;
  occupation: string;
  lineNumber: string;
  isContribution: boolean;
  isTransfer: boolean;
}

interface CommitteeRollup {
  localItemized: number;
  localTransfers: number;
  localEarmarked: number;
  contributionCount: number;
  donorCount: number;
}

// Fetch FEC totals for a committee to compare with local data
async function fetchFECTotals(fecApiKey: string, committeeId: string, cycle: string): Promise<{
  fecItemized: number | null;
  fecUnitemized: number | null;
  fecTotalReceipts: number | null;
}> {
  try {
    const url = `https://api.open.fec.gov/v1/committee/${committeeId}/totals/?api_key=${fecApiKey}&cycle=${cycle}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn('[FEC-DONORS] Could not fetch FEC totals:', response.status);
      return { fecItemized: null, fecUnitemized: null, fecTotalReceipts: null };
    }
    
    const data = await response.json();
    const totals = data.results?.[0];
    
    if (!totals) {
      return { fecItemized: null, fecUnitemized: null, fecTotalReceipts: null };
    }
    
    return {
      fecItemized: Math.round(totals.individual_itemized_contributions || 0),
      fecUnitemized: Math.round(totals.individual_unitemized_contributions || 0),
      fecTotalReceipts: Math.round(totals.receipts || 0)
    };
  } catch (err) {
    console.warn('[FEC-DONORS] Error fetching FEC totals:', err);
    return { fecItemized: null, fecUnitemized: null, fecTotalReceipts: null };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const fecApiKey = Deno.env.get('FEC_API_KEY');
    if (!fecApiKey) {
      console.error('[FEC-DONORS] FEC_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'FEC API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      candidateId, 
      fecCandidateId, 
      fecCommitteeId, 
      cycle = '2024', 
      maxPages = 150,
      includeOtherReceipts = false,
      incrementalSync = true, // Phase B: Enable incremental by default
      forceFullSync = false   // Override to force full resync
    } = await req.json();
    
    console.log('[FEC-DONORS] Fetching donors for:', { candidateId, fecCandidateId, fecCommitteeId, cycle, incrementalSync, forceFullSync });

    if (!candidateId) {
      return new Response(
        JSON.stringify({ error: 'candidateId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build committee list
    const committees: Array<{ id: string; name: string; role: string; lastSyncDate?: string; lastContributionDate?: string; lastIndex?: string }> = [];
    const committeeSet = new Set<string>();

    const pushCommittee = (id: string, name = '', role = 'authorized', syncInfo?: { lastSyncDate?: string; lastContributionDate?: string; lastIndex?: string }) => {
      if (!id || committeeSet.has(id)) return;
      committeeSet.add(id);
      committees.push({ id, name, role, ...syncInfo });
    };

    // Fetch existing committee sync info from database
    const { data: existingCommittees } = await supabase
      .from('candidate_committees')
      .select('fec_committee_id, last_sync_date, last_contribution_date, last_index')
      .eq('candidate_id', candidateId);

    const committeeSyncInfo = new Map(
      (existingCommittees || []).map(c => [c.fec_committee_id, {
        lastSyncDate: c.last_sync_date,
        lastContributionDate: c.last_contribution_date,
        lastIndex: c.last_index
      }])
    );

    const { data: candidateData } = await supabase
      .from('candidates')
      .select('fec_committee_id, fec_candidate_id')
      .eq('id', candidateId)
      .single();

    const fecId = fecCandidateId || candidateData?.fec_candidate_id || null;

    if (fecCommitteeId) {
      const syncInfo = committeeSyncInfo.get(fecCommitteeId);
      pushCommittee(fecCommitteeId, '', 'manual', syncInfo);
    }
    if (candidateData?.fec_committee_id) {
      const syncInfo = committeeSyncInfo.get(candidateData.fec_committee_id);
      pushCommittee(candidateData.fec_committee_id, '', 'stored', syncInfo);
    }

    if (!fecCommitteeId && fecId) {
      try {
        const committeeUrl = `https://api.open.fec.gov/v1/candidate/${fecId}/committees/?api_key=${fecApiKey}&designation=P,A&per_page=50`;
        const committeeResponse = await fetch(committeeUrl);

        if (committeeResponse.ok) {
          const committeeData = await committeeResponse.json();
          const results = committeeData.results || [];
          results.forEach((cmte: { committee_id: string; name?: string; designation?: string }) => {
            const role = cmte.designation === 'P' ? 'principal' : 'authorized';
            const syncInfo = committeeSyncInfo.get(cmte.committee_id);
            pushCommittee(cmte.committee_id, cmte.name || '', role, syncInfo);
          });

          const primary = results.find((cmte: { designation?: string }) => cmte.designation === 'P');
          if (primary?.committee_id && !candidateData?.fec_committee_id) {
            await supabase
              .from('candidates')
              .update({ fec_committee_id: primary.committee_id })
              .eq('id', candidateId);
          }
        }
      } catch (err) {
        console.error('[FEC-DONORS] Committee lookup failed:', err);
      }
    }

    if (committees.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No FEC committee ID available. Please link FEC ID first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Enrich committee names
    for (const cmte of committees) {
      if (!cmte.name) {
        try {
          const cmteUrl = `https://api.open.fec.gov/v1/committee/${cmte.id}/?api_key=${fecApiKey}`;
          const cmteResp = await fetch(cmteUrl);
          if (cmteResp.ok) {
            const cmteData = await cmteResp.json();
            cmte.name = cmteData.results?.[0]?.name || cmte.id;
          } else {
            cmte.name = cmte.id;
          }
        } catch {
          cmte.name = cmte.id;
        }
      }
    }

    // Upsert committee mappings
    await supabase
      .from('candidate_committees')
      .upsert(
        committees.map(cmte => ({
          candidate_id: candidateId,
          fec_committee_id: cmte.id,
          role: cmte.role,
          active: true,
        })),
        { onConflict: 'candidate_id,fec_committee_id' }
      );

    const allDonors = new Map<string, {
      id: string;
      candidate_id: string;
      name: string;
      type: 'Individual' | 'PAC' | 'Organization' | 'Unknown';
      amount: number;
      cycle: string;
      recipient_committee_id: string;
      recipient_committee_name: string;
      first_receipt_date: string | null;
      last_receipt_date: string | null;
      transaction_count: number;
      contributor_city: string;
      contributor_state: string;
      contributor_zip: string;
      employer: string;
      occupation: string;
      line_number: string;
      is_contribution: boolean;
      is_transfer: boolean;
    }>();

    const contributions: Array<{
      identity_hash: string;
      fec_transaction_id: string | null;
      candidate_id: string;
      recipient_committee_id: string;
      recipient_committee_name: string;
      contributor_name: string;
      contributor_type: string;
      amount: number;
      receipt_date: string | null;
      cycle: string;
      line_number: string;
      is_contribution: boolean;
      is_transfer: boolean;
      is_earmarked: boolean;
      earmarked_for_candidate_id: string | null;
      conduit_committee_id: string | null;
      memo_text: string | null;
      contributor_city: string;
      contributor_state: string;
      contributor_zip: string;
      employer: string;
      occupation: string;
    }> = [];

    let totalRaised = 0;
    let skippedNonContributions = 0;
    let committeesProcessed = 0;
    let earmarkedCount = 0;
    let transferCount = 0;
    let skippedCommittees = 0;
    
    const committeeRollups = new Map<string, CommitteeRollup>();

    // Process each committee
    for (const committee of committees) {
      const committeeId = committee.id;
      const committeeName = committee.name || committee.id;
      
      // Phase B: Check if we can skip this committee (incremental sync)
      const useIncremental = incrementalSync && !forceFullSync && committee.lastSyncDate;
      const syncCutoffDate = useIncremental && committee.lastContributionDate 
        ? committee.lastContributionDate 
        : null;
      
      if (useIncremental) {
        console.log(`[FEC-DONORS] Incremental sync for ${committeeId} from ${syncCutoffDate}`);
      }

      const aggregatedDonors = new Map<string, AggregatedDonor>();
      let lastIndex: string | null = null;
      let lastContributionDate: string | null = null;
      let pageCount = 0;
      let totalContributions = 0;
      let newestContributionDate: string | null = null;
      let newestIndex: string | null = null;
      let reachedCutoff = false;
      
      let committeeItemized = 0;
      let committeeTransfers = 0;
      let committeeEarmarked = 0;

      console.log('[FEC-DONORS] Starting fetch for committee:', committeeId);

      while (pageCount < maxPages && !reachedCutoff) {
        const params = new URLSearchParams({
          api_key: fecApiKey,
          committee_id: committeeId,
          two_year_transaction_period: cycle,
          per_page: '100',
          sort: '-contribution_receipt_date',
          sort_null_only: 'false',
        });

        if (lastIndex && lastContributionDate) {
          params.set('last_index', lastIndex);
          params.set('last_contribution_receipt_date', lastContributionDate);
        }

        const contributionsUrl = `https://api.open.fec.gov/v1/schedules/schedule_a/?${params.toString()}`;
        const response = await fetch(contributionsUrl);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[FEC-DONORS] API error on page', pageCount + 1, ':', response.status, errorText);
          
          if (response.status === 429) {
            console.log('[FEC-DONORS] Rate limited, waiting 60s...');
            await new Promise(resolve => setTimeout(resolve, 60000));
            continue;
          }
          break;
        }

        const data = await response.json();
        const results = data.results || [];
        
        if (results.length === 0) {
          break;
        }

        pageCount++;
        
        // Store newest cursor for incremental sync
        if (pageCount === 1 && results.length > 0) {
          newestContributionDate = results[0].contribution_receipt_date;
          newestIndex = data.pagination?.last_indexes?.last_index;
        }

        for (const contribution of results) {
          const receiptDate = contribution.contribution_receipt_date || null;
          
          // Phase B: Stop if we've reached data we already have (with 3-page overlap buffer)
          if (syncCutoffDate && receiptDate && receiptDate < syncCutoffDate && pageCount > 3) {
            console.log(`[FEC-DONORS] Reached cutoff date ${syncCutoffDate} at ${receiptDate}`);
            reachedCutoff = true;
            break;
          }
          
          const lineNumber = contribution.line_number || '';
          const classification = classifyLineNumber(lineNumber);
          
          if (!classification.isContribution && !includeOtherReceipts) {
            skippedNonContributions++;
            continue;
          }

          totalContributions++;
          
          const name = contribution.contributor_name || 'Unknown Contributor';
          const type = mapEntityType(contribution.entity_type);
          const amount = Math.round(contribution.contribution_receipt_amount || 0);
          const city = contribution.contributor_city || '';
          const state = contribution.contributor_state || '';
          const zip = contribution.contributor_zip || '';
          const employer = contribution.contributor_employer || '';
          const occupation = contribution.contributor_occupation || '';
          const memoText = contribution.memo_text || null;
          const memoCode = contribution.memo_code || null;
          const fecSubId = contribution.sub_id || null;
          
          const earmarkInfo = parseEarmarkInfo(memoText, memoCode);
          if (earmarkInfo.isEarmarked) {
            earmarkedCount++;
            committeeEarmarked += amount;
          }
          if (classification.isTransfer) {
            transferCount++;
            committeeTransfers += amount;
          }
          if (classification.isContribution && !classification.isTransfer) {
            committeeItemized += amount;
          }
          
          const contributionHash = await generateContributionHash(
            name, amount, receiptDate, committeeId, cycle, fecSubId
          );
          
          contributions.push({
            identity_hash: contributionHash,
            fec_transaction_id: fecSubId,
            candidate_id: candidateId,
            recipient_committee_id: committeeId,
            recipient_committee_name: committeeName,
            contributor_name: name,
            contributor_type: type,
            amount,
            receipt_date: receiptDate,
            cycle,
            line_number: lineNumber,
            is_contribution: classification.isContribution,
            is_transfer: classification.isTransfer,
            is_earmarked: earmarkInfo.isEarmarked,
            earmarked_for_candidate_id: null,
            conduit_committee_id: earmarkInfo.conduitCommitteeId,
            memo_text: memoText,
            contributor_city: city,
            contributor_state: state,
            contributor_zip: zip,
            employer,
            occupation
          });
          
          const donorId = await generateDonorId(
            name, contribution.entity_type || '', city, state, zip, committeeId, cycle
          );
          
          const existing = aggregatedDonors.get(donorId);
          
          if (existing) {
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
            aggregatedDonors.set(donorId, { 
              name, type, amount,
              transactionCount: 1,
              firstReceiptDate: receiptDate,
              lastReceiptDate: receiptDate,
              city, state, zip, employer, occupation,
              lineNumber,
              isContribution: classification.isContribution,
              isTransfer: classification.isTransfer
            });
          }
        }

        const pagination = data.pagination;
        if (!pagination?.last_indexes || results.length < 100) {
          break;
        }

        lastIndex = pagination.last_indexes.last_index;
        lastContributionDate = pagination.last_indexes.last_contribution_receipt_date;

        if (pageCount % 10 === 0) {
          console.log(`[FEC-DONORS] Progress: page ${pageCount}, ${totalContributions} contributions (${committeeId})`);
        }

        await new Promise(resolve => setTimeout(resolve, 250));
      }

      // Add donors to global map
      for (const [donorId, donor] of aggregatedDonors.entries()) {
        const existingDonor = allDonors.get(donorId);
        if (existingDonor) {
          existingDonor.amount += donor.amount;
          existingDonor.transaction_count += donor.transactionCount;
          if (donor.firstReceiptDate && (!existingDonor.first_receipt_date || donor.firstReceiptDate < existingDonor.first_receipt_date)) {
            existingDonor.first_receipt_date = donor.firstReceiptDate;
          }
          if (donor.lastReceiptDate && (!existingDonor.last_receipt_date || donor.lastReceiptDate > existingDonor.last_receipt_date)) {
            existingDonor.last_receipt_date = donor.lastReceiptDate;
          }
        } else {
          allDonors.set(donorId, {
            id: donorId,
            candidate_id: candidateId,
            name: donor.name,
            type: donor.type,
            amount: donor.amount,
            cycle,
            recipient_committee_id: committeeId,
            recipient_committee_name: committeeName,
            first_receipt_date: donor.firstReceiptDate,
            last_receipt_date: donor.lastReceiptDate,
            transaction_count: donor.transactionCount,
            contributor_city: donor.city,
            contributor_state: donor.state,
            contributor_zip: donor.zip,
            employer: donor.employer,
            occupation: donor.occupation,
            line_number: donor.lineNumber,
            is_contribution: donor.isContribution,
            is_transfer: donor.isTransfer
          });
        }
        totalRaised += donor.amount;
      }

      // Phase B: Update committee sync cursors
      if (newestContributionDate || newestIndex) {
        await supabase
          .from('candidate_committees')
          .update({
            last_sync_date: new Date().toISOString(),
            last_contribution_date: newestContributionDate,
            last_index: newestIndex,
            local_itemized_total: committeeItemized
          })
          .eq('candidate_id', candidateId)
          .eq('fec_committee_id', committeeId);
      }

      // Phase C: Fetch FEC totals and store rollup
      const fecTotals = await fetchFECTotals(fecApiKey, committeeId, cycle);
      
      await supabase
        .from('committee_finance_rollups')
        .upsert({
          committee_id: committeeId,
          candidate_id: candidateId,
          cycle,
          local_itemized: committeeItemized,
          local_transfers: committeeTransfers,
          local_earmarked: committeeEarmarked,
          fec_itemized: fecTotals.fecItemized,
          fec_unitemized: fecTotals.fecUnitemized,
          fec_total_receipts: fecTotals.fecTotalReceipts,
          contribution_count: totalContributions,
          donor_count: aggregatedDonors.size,
          last_sync: new Date().toISOString(),
          last_fec_check: new Date().toISOString()
        }, { onConflict: 'committee_id,cycle' });

      committeeRollups.set(committeeId, {
        localItemized: committeeItemized,
        localTransfers: committeeTransfers,
        localEarmarked: committeeEarmarked,
        contributionCount: totalContributions,
        donorCount: aggregatedDonors.size
      });

      committeesProcessed++;
      console.log(`[FEC-DONORS] Completed ${committeeId}: ${aggregatedDonors.size} donors, $${committeeItemized} itemized`);
    }

    const donors = Array.from(allDonors.values());

    if (donors.length === 0) {
      await supabase
        .from('candidates')
        .update({ last_donor_sync: new Date().toISOString() })
        .eq('id', candidateId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          imported: 0, 
          message: 'No contributions found for this candidate/cycle',
          skippedNonContributions,
          skippedCommittees,
          committees: committees.map(c => ({ id: c.id, name: c.name }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[FEC-DONORS] Total:', donors.length, 'donors,', contributions.length, 'transactions');

    // Phase A: UPSERT donors instead of delete+insert
    const batchSize = 500;
    let totalUpserted = 0;

    for (let i = 0; i < donors.length; i += batchSize) {
      const batch = donors.slice(i, i + batchSize);

      const { data: upsertedData, error: upsertError } = await supabase
        .from('donors')
        .upsert(batch, { onConflict: 'id' })
        .select();

      if (upsertError) {
        console.error('[FEC-DONORS] Upsert error on batch', Math.floor(i / batchSize) + 1, ':', upsertError);
        return new Response(
          JSON.stringify({ error: `Database error: ${upsertError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      totalUpserted += upsertedData?.length || 0;
    }

    console.log('[FEC-DONORS] Successfully upserted', totalUpserted, 'donors');

    // Upsert contributions
    let contributionsUpserted = 0;
    for (let i = 0; i < contributions.length; i += batchSize) {
      const batch = contributions.slice(i, i + batchSize);

      const { data: upsertedData, error: upsertError } = await supabase
        .from('contributions')
        .upsert(batch, { onConflict: 'identity_hash,cycle', ignoreDuplicates: false })
        .select();

      if (upsertError) {
        console.error('[FEC-DONORS] Contribution upsert error:', upsertError);
      } else {
        contributionsUpserted += upsertedData?.length || 0;
      }
    }

    console.log('[FEC-DONORS] Successfully upserted', contributionsUpserted, 'contributions');

    // Phase E: Update reconciliation record
    const totalLocalItemized = Array.from(committeeRollups.values()).reduce((sum, r) => sum + r.localItemized, 0);
    const totalLocalTransfers = Array.from(committeeRollups.values()).reduce((sum, r) => sum + r.localTransfers, 0);
    const totalLocalEarmarked = Array.from(committeeRollups.values()).reduce((sum, r) => sum + r.localEarmarked, 0);
    
    // Get FEC totals for reconciliation
    let totalFecItemized = 0;
    let totalFecUnitemized = 0;
    let totalFecReceipts = 0;
    
    const { data: rollups } = await supabase
      .from('committee_finance_rollups')
      .select('fec_itemized, fec_unitemized, fec_total_receipts')
      .eq('candidate_id', candidateId)
      .eq('cycle', cycle);
    
    for (const r of rollups || []) {
      totalFecItemized += r.fec_itemized || 0;
      totalFecUnitemized += r.fec_unitemized || 0;
      totalFecReceipts += r.fec_total_receipts || 0;
    }
    
    const deltaAmount = totalLocalItemized - totalFecItemized;
    const deltaPct = totalFecItemized > 0 ? Math.round((deltaAmount / totalFecItemized) * 10000) / 100 : 0;
    let status = 'ok';
    if (Math.abs(deltaPct) > 10) status = 'error';
    else if (Math.abs(deltaPct) > 5) status = 'warning';
    
    await supabase
      .from('finance_reconciliation')
      .upsert({
        candidate_id: candidateId,
        cycle,
        local_itemized: totalLocalItemized,
        local_transfers: totalLocalTransfers,
        local_earmarked: totalLocalEarmarked,
        fec_itemized: totalFecItemized,
        fec_unitemized: totalFecUnitemized,
        fec_total_receipts: totalFecReceipts,
        delta_amount: deltaAmount,
        delta_pct: deltaPct,
        status,
        checked_at: new Date().toISOString()
      }, { onConflict: 'candidate_id,cycle' });

    await supabase
      .from('candidates')
      .update({ last_donor_sync: new Date().toISOString() })
      .eq('id', candidateId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        imported: donors.length,
        contributionsImported: contributionsUpserted,
        totalRaised,
        earmarkedCount,
        transferCount,
        cycle,
        incrementalSync: incrementalSync && !forceFullSync,
        committees: committees.map(c => ({ id: c.id, name: c.name })),
        skippedNonContributions,
        reconciliation: { localItemized: totalLocalItemized, fecItemized: totalFecItemized, deltaPct, status },
        message: `Imported ${donors.length} contributors (${contributionsUpserted} transactions) totaling $${totalRaised.toLocaleString()}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[FEC-DONORS] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
