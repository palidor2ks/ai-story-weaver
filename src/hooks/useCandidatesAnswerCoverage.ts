import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CoverageTier, ConfidenceLevel } from '@/lib/scoreFormat';

export type CandidateSource = 'federal' | 'civic';
export type GovernmentLevel = 'federal_executive' | 'federal_legislative' | 'state_executive' | 'state_legislative' | 'local' | 'unknown';

// District values are stored inconsistently across sources — some carry leading
// zeros ("03") and some don't ("3"). Collapse purely-numeric districts to their
// canonical zero-stripped form so "03" and "3" are treated as the same value in
// both the table and the filter. Non-numeric districts (e.g. "At-Large") are
// preserved as-is.
export function normalizeDistrict(district: string | null | undefined): string | null {
  if (district == null) return null;
  const trimmed = String(district).trim();
  if (trimmed === '') return null;
  if (/^\d+$/.test(trimmed)) return String(parseInt(trimmed, 10));
  return trimmed;
}

export interface CandidateAnswerCoverage {
  id: string;
  name: string;
  party: string;
  office: string;
  state: string;
  district: string | null;
  answerCount: number;
  totalQuestions: number;
  percentage: number;
  sourcedCount: number;           // Answers with valid (non-party-inferred) sources
  sourcePercentage: number;       // Percentage of answers with valid sources
  overallScore: number | null;    // Political score (-10 to +10)
  coverageTier: CoverageTier;
  confidence: ConfidenceLevel;
  voteCount: number;
  legislativeActionsCount: number;  // Sponsored/cosponsored bills
  floorVotesCount: number;          // Actual Yea/Nay roll-call votes
  expectedVoteCount: number | null;  // Expected from Congress.gov API
  expectedFloorVotes: number | null; // Expected floor votes
  voteSyncStatus: 'never' | 'partial' | 'complete' | 'error'; // Aggregated vote sync status
  floorVoteSyncStatus: 'never' | 'partial' | 'complete' | 'error'; // Floor vote sync status
  lastVoteSyncAt: string | null;  // When votes were last synced
  donorCount: number;
  fecCandidateId: string | null;
  fecCommitteeId: string | null;
  committeeCount: number;         // Number of linked committees
  // Finance breakdown - from finance_reconciliation (single source of truth)
  localItemized: number;         // Local itemized contributions (gross)
  localItemizedNet: number;      // Local itemized NET (excluding earmark pass-throughs) - comparable to FEC
  localTransfers: number;        // Committee transfers
  localEarmarked: number;        // Earmarked contributions
  localLoans: number;            // Candidate loans (Line 13A)
  localOtherReceipts: number;    // Local Line 14 + Line 15 (offsets + other)
  // Category-level local data
  localIndividualItemized: number; // Individuals NET (excludes memo_code='X')
  localGrossIndividual: number;    // Individuals GROSS (includes memo_code='X' for FEC comparison)
  memoXAmount: number;             // Amount in memo_code='X' entries (gross - net)
  localPacContributions: number;   // PACs (Line 11C)
  localPartyContributions: number; // Party (Line 11B)
  localOrganization: number;       // Organizations (11A non-individual)
  // FEC category data
  fecItemized: number | null;    // FEC itemized contributions (individuals)
  fecUnitemized: number | null;  // FEC unitemized contributions
  fecTotalReceipts: number | null; // FEC total receipts
  fecPacContributions: number;   // FEC PAC contributions (line 11C)
  fecPartyContributions: number; // FEC party contributions
  fecLoans: number;              // Candidate loans
  fecTransfers: number;          // Committee transfers (line 12)
  fecCandidateContribution: number; // Candidate self-contribution (non-loan)
  fecOtherReceipts: number;      // Other receipts (Line 15)
  fecOffsetsToOperatingExpenditures: number; // Line 14 offsets
  // Overall delta (itemized comparison for data integrity)
  deltaAmount: number | null;    // Difference between local NET and FEC
  deltaPct: number | null;       // Percentage difference
  reconciliationStatus: string | null; // ok, warning, error
  // Total receipts delta (for UI display - matches FEC/Local columns)
  totalReceiptsDeltaAmount: number | null;
  totalReceiptsDeltaPct: number | null;
  // Category-level deltas
  individualDeltaAmount: number | null;
  individualDeltaPct: number | null;
  pacDeltaAmount: number | null;
  pacDeltaPct: number | null;
  // Sync status
  hasPartialSync: boolean;       // True if any committee has has_more = true (incomplete sync)
  lastDonorSync: string | null;  // Last donor sync date from candidates table
  lastSyncDate: string | null;   // Last sync date from committees
  reconciliationCheckedAt: string | null; // When reconciliation was last checked
  syncStatus: 'never' | 'partial' | 'complete'; // Aggregated sync status
  // Validation flags
  fecIdMismatch: boolean;
  fecIdMismatchReason: string | null;
  // Cross-cycle finance availability
  hasReconciliation: boolean;     // True if a finance_reconciliation row exists for the SELECTED cycle
  otherCyclesWithData: string[];  // Other cycles (≠ selected) that have reconciliation data, newest first
  // Source tracking
  source: CandidateSource;
  level: GovernmentLevel;
}

interface Filters {
  party?: string;
  state?: string;
  coverageFilter?: 'all' | 'none' | 'low' | 'full';
  level?: 'all' | GovernmentLevel;
}

function inferLevel(office: string, source: CandidateSource): GovernmentLevel {
  const o = (office || '').toLowerCase();

  // One source-aware classifier shared by every candidate source: the
  // federal-sourced `candidates` table, civic `candidate_overrides`, and
  // `static_officials`. Order matters — state and local offices are detected
  // BEFORE the federal fallbacks. The candidates table is tagged source
  // 'federal' yet also holds municipal/county/state candidates, so a federal
  // short-circuit used to mislabel all of them as Congress. Statewide officers
  // ("Secretary of State", "State Treasurer") are matched before the municipal
  // clerk/treasurer keywords so they don't fall through to local.

  // State executive — governor + statewide constitutional/row officers.
  if (/\bgovernor\b|lieutenant governor|lt\.? governor|attorney general|secretary of state|state treasurer|state comptroller|state controller|state auditor|superintendent of public instruction/.test(o)) {
    return 'state_executive';
  }
  // State legislature (assembly / house of delegates / general assembly variants).
  if (/state senat|state represent|state legislat|state assembl|state house|state delegate|house of delegates|general assembly|assemblymember|assemblywoman|assemblyman|\bassembly\b/.test(o)) {
    return 'state_legislative';
  }
  // Local / municipal / county (also guards titles like "Council President").
  if (/mayor|council|alderman|selectman|sheriff|district attorney|school board|\bcounty\b|\bcity\b|town|\bborough\b|\bward\b|freeholder|surrogate|commissioner|register|coroner|municipal|\bclerk\b|\btreasurer\b/.test(o)) {
    return 'local';
  }
  // Federal executive.
  if (/\bvice president\b|\bpresident\b/.test(o)) return 'federal_executive';
  // Federal legislature: explicit U.S. House/Senate markers, then the federal
  // data source's default (Congress.gov members carry bare "Representative" /
  // "Senator" offices with no other qualifier).
  if (/united states|congress|representative|\bsenator\b|\bsenate\b|\bhouse\b/.test(o)) {
    return 'federal_legislative';
  }
  if (source === 'federal') return 'federal_legislative';
  if (o.includes('state')) return 'state_legislative';
  return 'unknown';
}

function makeCivicCoverage(
  c: { candidate_id: string; name: string | null; party: string | null; office: string | null; state: string | null; district?: string | null; overall_score: number | null; coverage_tier: string | null; confidence: string | null },
  answerCount: number,
  sourcedCount: number,
  totalQuestions: number,
): CandidateAnswerCoverage {
  const percentage = totalQuestions ? Math.round((answerCount / totalQuestions) * 100) : 0;
  const sourcePercentage = answerCount > 0 ? Math.round((sourcedCount / answerCount) * 100) : 0;
  return {
    id: c.candidate_id,
    name: c.name || c.candidate_id,
    party: c.party || 'Unknown',
    office: c.office || 'Unknown',
    state: c.state || '',
    district: normalizeDistrict(c.district),
    answerCount,
    totalQuestions,
    percentage,
    sourcedCount,
    sourcePercentage,
    overallScore: c.overall_score ?? null,
    coverageTier: (c.coverage_tier as CoverageTier) || 'tier_3',
    confidence: (c.confidence as ConfidenceLevel) || 'low',
    voteCount: 0, legislativeActionsCount: 0, floorVotesCount: 0,
    expectedVoteCount: null, expectedFloorVotes: null,
    voteSyncStatus: 'never', floorVoteSyncStatus: 'never', lastVoteSyncAt: null,
    donorCount: 0, fecCandidateId: null, fecCommitteeId: null, committeeCount: 0,
    localItemized: 0, localItemizedNet: 0, localTransfers: 0, localEarmarked: 0,
    localLoans: 0, localOtherReceipts: 0,
    localIndividualItemized: 0, localGrossIndividual: 0, memoXAmount: 0,
    localPacContributions: 0, localPartyContributions: 0, localOrganization: 0,
    fecItemized: null, fecUnitemized: null, fecTotalReceipts: null,
    fecPacContributions: 0, fecPartyContributions: 0, fecLoans: 0,
    fecTransfers: 0, fecCandidateContribution: 0, fecOtherReceipts: 0,
    fecOffsetsToOperatingExpenditures: 0,
    deltaAmount: null, deltaPct: null, reconciliationStatus: null,
    totalReceiptsDeltaAmount: null, totalReceiptsDeltaPct: null,
    individualDeltaAmount: null, individualDeltaPct: null,
    pacDeltaAmount: null, pacDeltaPct: null,
    hasPartialSync: false, lastDonorSync: null, lastSyncDate: null,
    reconciliationCheckedAt: null, syncStatus: 'never',
    fecIdMismatch: false, fecIdMismatchReason: null,
    hasReconciliation: false, otherCyclesWithData: [],
    source: 'civic',
    level: inferLevel(c.office || '', 'civic'),
  };
}

// Shared hook: caches federal topic IDs and question counts (rarely change)
function useQuestionCounts() {
  return useQuery({
    queryKey: ['question-counts'],
    staleTime: 5 * 60 * 1000, // 5 min — topics/questions rarely change
    queryFn: async () => {
      const { data: topicRows } = await supabase
        .from('topics')
        .select('id, scope');
      const federalTopicIds = (topicRows || []).filter(t => t.scope === 'all').map(t => t.id);
      const localTopicIds = (topicRows || []).filter(t => t.scope === 'local').map(t => t.id);
      const [allQ, fedQ, localQ] = await Promise.all([
        supabase.from('questions').select('*', { count: 'exact', head: true }),
        supabase.from('questions').select('*', { count: 'exact', head: true }).in('topic_id', federalTopicIds),
        supabase.from('questions').select('*', { count: 'exact', head: true }).in('topic_id', localTopicIds),
      ]);
      if (allQ.error) throw allQ.error;
      return {
        federalTopicIds,
        localTopicIds,
        allQuestions: allQ.count || 0,       // 340 (17 topics)
        federalQuestions: fedQ.count || 0,   // 240 (12 federal topics)
        localQuestions: localQ.count || 0,   // local-scope total (5 topics)
      };
    },
  });
}

// PostgREST `.in()` filters put every id into the query string; past a few
// hundred ids the URL blows the gateway limit and the request FAILS. These
// supporting queries are non-fatal by design, so when FEC discovery grew the
// directory from ~600 to ~2,400 candidates, every row silently rendered
// 0 answers / "No Data" / "—" while the data sat intact in the DB. Same root
// cause as the older `CHUNK = 100` fix further down — applied here to every
// id-filtered supporting query. Chunks run in parallel; chunk failures are
// logged loudly instead of swallowed.
const IN_CHUNK = 200;
async function chunkedIn<Row>(
  label: string,
  ids: string[],
  build: (chunk: string[]) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
): Promise<Row[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) chunks.push(ids.slice(i, i + IN_CHUNK));
  const settled = await Promise.all(chunks.map(c => build(c)));
  const rows: Row[] = [];
  settled.forEach((res, i) => {
    if (res.error) {
      console.error(`[coverage] ${label} chunk ${i + 1}/${chunks.length} failed: ${res.error.message}`);
    } else if (res.data) {
      rows.push(...res.data);
    }
  });
  return rows;
}

export function useCandidatesAnswerCoverage(filters: Filters = {}, options?: { enabled?: boolean; limit?: number; financeCycle?: string; refetchInterval?: number | false }) {
  const limit = options?.limit;
  const financeCycle = options?.financeCycle ?? '2026';
  const { data: questionCounts } = useQuestionCounts();
  
  return useQuery({
    queryKey: ['candidates-answer-coverage', filters, limit ?? 'all', financeCycle],
    enabled: options?.enabled !== false && !!questionCounts,
    placeholderData: (previousData) => previousData, // Keep previous data during filter transitions
    queryFn: async (): Promise<CandidateAnswerCoverage[]> => {
      const { federalQuestions, localQuestions } = questionCounts!;

      // Get candidates with coverage tier and confidence
      let candidatesQuery = supabase
        .from('candidates')
        .select('id, name, party, office, state, district, overall_score, coverage_tier, confidence, fec_candidate_id, fec_committee_id, last_donor_sync')
        .order('name', { ascending: true });

      if (filters.party && filters.party !== 'all') {
        candidatesQuery = candidatesQuery.eq('party', filters.party as 'Democrat' | 'Republican' | 'Independent' | 'Other');
      }

      if (filters.state && filters.state !== 'all') {
        candidatesQuery = candidatesQuery.eq('state', filters.state);
      }

      // Apply limit for progressive loading (first N candidates)
      if (limit) {
        candidatesQuery = candidatesQuery.range(0, limit - 1);
      }

      const { data: candidates, error: candidatesError } = await candidatesQuery;

      if (candidatesError) throw candidatesError;

      // Get candidate IDs for filtering supporting queries (for faster progressive loading)
      const candidateIds = (candidates || []).map(c => c.id);
      
      // If no candidates, return early
      if (candidateIds.length === 0) {
        return [];
      }

      const FINANCE_CYCLE = financeCycle;

      // Run ALL supporting queries in parallel for maximum performance.
      // Each one is id-chunked (see chunkedIn) — a single .in() with the full
      // candidate list exceeds URL limits and used to fail silently.
      const [
        answerCoverageData,
        votingCoverageData,
        donorCountsData,
        reconciliationData,
        partialSyncData,
        voteSyncData,
        allCyclesData,
      ] = await Promise.all([
        // Answer counts - filter by candidate IDs
        chunkedIn('candidate_answer_coverage_stats', candidateIds, chunk =>
          supabase
            .from('candidate_answer_coverage_stats')
            .select('candidate_id, answer_count, sourced_count')
            .in('candidate_id', chunk)),
        // Vote counts - filter by candidate IDs
        chunkedIn('candidate_voting_coverage', candidateIds, chunk =>
          supabase
            .from('candidate_voting_coverage')
            .select('candidate_id, total_votes_stored, legislative_actions_count, floor_votes_count')
            .in('candidate_id', chunk)),
        // Donor counts - filter by candidate IDs
        chunkedIn('candidate_donor_counts', candidateIds, chunk =>
          supabase
            .from('candidate_donor_counts')
            .select('candidate_id, donor_count')
            .in('candidate_id', chunk)),
        // Finance reconciliation - filter by candidate IDs
        chunkedIn('finance_reconciliation', candidateIds, chunk =>
          supabase
            .from('finance_reconciliation')
            .select('*')
            .eq('cycle', FINANCE_CYCLE)
            .in('candidate_id', chunk)),
        // Committee sync status - filter by candidate IDs
        chunkedIn('candidate_committees', candidateIds, chunk =>
          supabase
            .from('candidate_committees')
            .select('candidate_id, has_more, last_sync_date, last_sync_completed_at, last_cycle, designation')
            .in('candidate_id', chunk)),
        // Vote sync status - filter by candidate IDs
        chunkedIn('vote_sync_status', candidateIds, chunk =>
          supabase
            .from('vote_sync_status')
            .select('candidate_id, expected_total, persisted_count, expected_floor_votes, persisted_floor_votes, last_sync_completed_at, sync_error, floor_vote_sync_error')
            .in('candidate_id', chunk)),
        // All cycles that have reconciliation data (lightweight — drives the
        // cross-cycle hint so a candidate's data isn't "invisible" when the
        // selected cycle has no row but another cycle does).
        chunkedIn('finance_reconciliation (all cycles)', candidateIds, chunk =>
          supabase
            .from('finance_reconciliation')
            .select('candidate_id, cycle')
            .in('candidate_id', chunk)),
      ]);

      // Build lookup maps for answer counts
      const answerCountMap: Record<string, number> = {};
      const sourcedCountMap: Record<string, number> = {};
      (answerCoverageData || []).forEach(row => {
        if (row.candidate_id) {
          answerCountMap[row.candidate_id] = Number(row.answer_count) || 0;
          sourcedCountMap[row.candidate_id] = Number(row.sourced_count) || 0;
        }
      });

      // Build lookup map for vote counts
      const voteCountMap: Record<string, { total: number; legislative: number; floor: number }> = {};
      (votingCoverageData || []).forEach(row => {
        if (!row.candidate_id) return;
        voteCountMap[row.candidate_id] = {
          total: row.total_votes_stored || 0,
          legislative: row.legislative_actions_count || 0,
          floor: row.floor_votes_count || 0
        };
      });

      // Build lookup map for donor counts
      const donorCountMap: Record<string, number> = {};
      (donorCountsData || []).forEach(row => {
        if (row.candidate_id) {
          donorCountMap[row.candidate_id] = Number(row.donor_count) || 0;
        }
      });

      // Build lookup map for reconciliation data
      interface ReconciliationRecord {
        candidate_id: string;
        local_itemized: number | null;
        local_itemized_net: number | null;
        local_transfers: number | null;
        local_earmarked: number | null;
        local_loans: number | null;
        local_other_receipts: number | null;
        local_individual_itemized: number | null;
        local_gross_individual: number | null;
        memo_x_amount: number | null;
        local_pac_contributions: number | null;
        local_party_contributions: number | null;
        local_organization: number | null;
        fec_itemized: number | null;
        fec_unitemized: number | null;
        fec_total_receipts: number | null;
        fec_pac_contributions: number | null;
        fec_party_contributions: number | null;
        fec_loans: number | null;
        fec_transfers: number | null;
        fec_candidate_contribution: number | null;
        fec_other_receipts: number | null;
        fec_offsets_to_operating_expenditures: number | null;
        delta_amount: number | null;
        delta_pct: number | null;
        individual_delta_amount: number | null;
        individual_delta_pct: number | null;
        pac_delta_amount: number | null;
        pac_delta_pct: number | null;
        total_receipts_delta_amount: number | null;
        total_receipts_delta_pct: number | null;
        status: string | null;
        checked_at: string | null;
      }

      const reconciliationMap: Record<string, ReconciliationRecord> = {};
      (reconciliationData || []).forEach(row => {
        reconciliationMap[row.candidate_id] = row;
      });

      // Map candidate_id -> every cycle that has a reconciliation row (any cycle).
      // Used to surface a hint when the selected cycle has no data but another does.
      const cyclesByCandidate: Record<string, string[]> = {};
      (allCyclesData || []).forEach(row => {
        if (!row.candidate_id) return;
        const cy = String(row.cycle);
        if (!cyclesByCandidate[row.candidate_id]) cyclesByCandidate[row.candidate_id] = [];
        if (!cyclesByCandidate[row.candidate_id].includes(cy)) cyclesByCandidate[row.candidate_id].push(cy);
      });

      // Build lookup maps for sync status
      const partialSyncMap: Record<string, boolean> = {};
      const lastSyncMap: Record<string, string | null> = {};
      const completeSyncMap: Record<string, boolean> = {};
      const committeeCountMap: Record<string, number> = {};
      
      (partialSyncData || []).forEach(row => {
        // Count ALL committees per candidate (for display purposes)
        committeeCountMap[row.candidate_id] = (committeeCountMap[row.candidate_id] || 0) + 1;
        
        // Only consider P/A (campaign) committees for sync status, and only
        // when their cursor/completion belongs to the selected receipt cycle.
        // The UI cycle represents the FEC two-year transaction period for
        // receipts, not the candidate's election year.
        const isCampaignCommittee = ['P', 'A'].includes(row.designation || '');
        if (!isCampaignCommittee || row.last_cycle !== FINANCE_CYCLE) return;
        
        if (row.has_more === true) {
          partialSyncMap[row.candidate_id] = true;
        }
        if (row.last_sync_date) {
          lastSyncMap[row.candidate_id] = row.last_sync_date;
        }
        if (row.last_sync_completed_at && row.has_more !== true) {
          completeSyncMap[row.candidate_id] = true;
        }
      });

      // Build lookup map for vote sync status
      interface VoteSyncRecord {
        candidate_id: string;
        expected_total: number | null;
        persisted_count: number | null;
        expected_floor_votes: number | null;
        persisted_floor_votes: number | null;
        last_sync_completed_at: string | null;
        sync_error: string | null;
        floor_vote_sync_error: string | null;
      }

      const voteSyncMap: Record<string, VoteSyncRecord> = {};
      (voteSyncData || []).forEach(row => {
        voteSyncMap[row.candidate_id] = row;
      });

      // Helper to validate FEC ID prefix against office
      const validateFecIdPrefix = (fecId: string | null, office: string): { mismatch: boolean; reason: string | null } => {
        if (!fecId) return { mismatch: false, reason: null };
        
        const prefix = fecId.charAt(0).toUpperCase();
        const officeNormalized = office.toLowerCase();
        
        // Expected prefixes: H = House Representative, S = Senator, P = President
        const expectedPrefix = officeNormalized.includes('representative') || officeNormalized.includes('house') 
          ? 'H'
          : officeNormalized.includes('senator') || officeNormalized.includes('senate')
            ? 'S'
            : officeNormalized.includes('president')
              ? 'P'
              : null;
        
        if (!expectedPrefix) {
          // Unknown office type, can't validate
          return { mismatch: false, reason: null };
        }
        
        if (prefix !== expectedPrefix) {
          const prefixMeaning = prefix === 'H' ? 'House' : prefix === 'S' ? 'Senate' : prefix === 'P' ? 'President' : 'Unknown';
          return { 
            mismatch: true, 
            reason: `FEC ID starts with "${prefix}" (${prefixMeaning}) but office is "${office}"`
          };
        }
        
        return { mismatch: false, reason: null };
      };

      // Build result with coverage info
      let results: CandidateAnswerCoverage[] = (candidates || []).map(c => {
        const answerCount = answerCountMap[c.id] || 0;
        const sourcedCount = sourcedCountMap[c.id] || 0;
        const percentage = federalQuestions ? Math.round((answerCount / federalQuestions) * 100) : 0;
        const sourcePercentage = answerCount > 0 ? Math.round((sourcedCount / answerCount) * 100) : 0;
        const rec = reconciliationMap[c.id];
        
        // Determine sync status
        const hasPartialSync = partialSyncMap[c.id] || false;
        const hasCompletedAnySync = completeSyncMap[c.id] || false;
        const hasLastDonorSync = !!c.last_donor_sync;
        
        let syncStatus: 'never' | 'partial' | 'complete' = 'never';
        if (hasPartialSync) {
          syncStatus = 'partial';
        } else if (hasLastDonorSync || hasCompletedAnySync) {
          syncStatus = 'complete';
        }
        
        // Validate FEC ID prefix
        const fecIdValidation = validateFecIdPrefix(c.fec_candidate_id, c.office);
        
        // Vote sync status (legislative actions)
        const voteSyncRecord = voteSyncMap[c.id];
        const expectedVoteCount = voteSyncRecord?.expected_total ?? null;
        const persistedVoteCount = voteSyncRecord?.persisted_count ?? 0;
        let voteSyncStatus: 'never' | 'partial' | 'complete' | 'error' = 'never';
        if (voteSyncRecord?.sync_error) {
          voteSyncStatus = 'error';
        } else if (voteSyncRecord) {
          if (expectedVoteCount !== null && persistedVoteCount < expectedVoteCount) {
            voteSyncStatus = 'partial';
          } else if (voteSyncRecord.last_sync_completed_at) {
            voteSyncStatus = 'complete';
          }
        }
        
        // Floor vote sync status
        const expectedFloorVotes = voteSyncRecord?.expected_floor_votes ?? null;
        const persistedFloorVotes = voteSyncRecord?.persisted_floor_votes ?? 0;
        let floorVoteSyncStatus: 'never' | 'partial' | 'complete' | 'error' = 'never';
        if (voteSyncRecord?.floor_vote_sync_error) {
          floorVoteSyncStatus = 'error';
        } else if (expectedFloorVotes !== null) {
          if (persistedFloorVotes < expectedFloorVotes) {
            floorVoteSyncStatus = 'partial';
          } else {
            floorVoteSyncStatus = 'complete';
          }
        }
        
        // Get vote counts from the view
        const voteCounts = voteCountMap[c.id] || { total: 0, legislative: 0, floor: 0 };
        
        return {
          id: c.id,
          name: c.name,
          party: c.party,
          office: c.office,
          state: c.state,
          district: normalizeDistrict(c.district),
          answerCount,
          totalQuestions: federalQuestions,
          percentage,
          sourcedCount,
          sourcePercentage,
          overallScore: c.overall_score ?? null,
          coverageTier: (c.coverage_tier as CoverageTier) || 'tier_3',
          confidence: (c.confidence as ConfidenceLevel) || 'low',
          voteCount: voteCounts.total,
          legislativeActionsCount: voteCounts.legislative,
          floorVotesCount: voteCounts.floor,
          expectedVoteCount,
          expectedFloorVotes,
          voteSyncStatus,
          floorVoteSyncStatus,
          lastVoteSyncAt: voteSyncRecord?.last_sync_completed_at || null,
          donorCount: donorCountMap[c.id] || 0,
          fecCandidateId: c.fec_candidate_id || null,
          fecCommitteeId: c.fec_committee_id || null,
          committeeCount: committeeCountMap[c.id] || 0,
          // Finance data from reconciliation table (single source of truth)
          localItemized: rec?.local_itemized || 0,
          localItemizedNet: rec?.local_itemized_net || 0, // NET for proper comparison
          localTransfers: rec?.local_transfers || 0,
          localEarmarked: rec?.local_earmarked || 0,
          localLoans: rec?.local_loans || 0,
          localOtherReceipts: rec?.local_other_receipts || 0, // Line 14 + 15
          // Category-level local data
          localIndividualItemized: rec?.local_individual_itemized || 0,
        localGrossIndividual: rec?.local_gross_individual ?? rec?.local_individual_itemized ?? 0,
        memoXAmount: rec?.memo_x_amount ?? 0,
          localPacContributions: rec?.local_pac_contributions || 0,
          localPartyContributions: rec?.local_party_contributions || 0,
          localOrganization: rec?.local_organization || 0,
          // FEC data
          fecItemized: rec?.fec_itemized ?? null,
          fecUnitemized: rec?.fec_unitemized ?? null,
          fecTotalReceipts: rec?.fec_total_receipts ?? null,
          fecPacContributions: rec?.fec_pac_contributions || 0,
          fecPartyContributions: rec?.fec_party_contributions || 0,
          fecLoans: rec?.fec_loans || 0,
          fecTransfers: rec?.fec_transfers || 0,
          fecCandidateContribution: rec?.fec_candidate_contribution || 0,
          fecOtherReceipts: rec?.fec_other_receipts || 0,
          fecOffsetsToOperatingExpenditures: rec?.fec_offsets_to_operating_expenditures || 0,
          // Overall delta
          deltaAmount: rec?.delta_amount ?? null,
          deltaPct: rec?.delta_pct ?? null,
          reconciliationStatus: rec?.status || null,
          // Total receipts delta (for UI display - matches FEC/Local columns)
          totalReceiptsDeltaAmount: rec?.total_receipts_delta_amount ?? null,
          totalReceiptsDeltaPct: rec?.total_receipts_delta_pct ?? null,
          // Category-level deltas
          individualDeltaAmount: rec?.individual_delta_amount ?? null,
          individualDeltaPct: rec?.individual_delta_pct ?? null,
          pacDeltaAmount: rec?.pac_delta_amount ?? null,
          pacDeltaPct: rec?.pac_delta_pct ?? null,
          // Sync status
          hasPartialSync,
          lastDonorSync: c.last_donor_sync || null,
          lastSyncDate: lastSyncMap[c.id] || null,
          reconciliationCheckedAt: rec?.checked_at || null,
          syncStatus,
          // Validation flags
          fecIdMismatch: fecIdValidation.mismatch,
          fecIdMismatchReason: fecIdValidation.reason,
          // Cross-cycle finance availability
          hasReconciliation: !!rec,
          otherCyclesWithData: (cyclesByCandidate[c.id] || [])
            .filter(cy => cy !== FINANCE_CYCLE)
            .sort((a, b) => b.localeCompare(a)),
          // Source tracking
          source: 'federal' as CandidateSource,
          level: inferLevel(c.office, 'federal'),
        };
      });

      // === CIVIC OFFICIALS: Fetch from candidate_overrides ===
      // Federal LEGISLATORS come entirely from the `candidates` table, so the
      // override fetch is pure overhead for that level. Federal EXECUTIVE is the
      // exception: recent FORMER Presidents & VPs (Obama, Bush, Pence, Cheney, …)
      // live ONLY in candidate_overrides under `exec_`-prefixed ids — they have
      // no candidates row — so we must still fetch them here, or they vanish from
      // the directory. Current execs (Trump/Biden/etc.) keep coming from the
      // candidates table because their former entry is re-keyed to its P-FEC id.
      const skipCivic = filters.level === 'federal_legislative';
      const onlyFederalExec = filters.level === 'federal_executive';

      if (!skipCivic) {
        // `exec_` covers the former Presidents/VPs persisted by fetch-civic-officials.
        const overridePrefixes = onlyFederalExec
          ? ['exec_']
          : ['openstates_', 'nj_', 'ny_', 'ca_', 'tx_', 'fl_', 'pa_', 'exec_'];
        let civicQuery = supabase
          .from('candidate_overrides')
          .select('candidate_id, name, party, office, state, district, overall_score, coverage_tier, confidence')
          .not('name', 'is', null)
          .or(overridePrefixes.map(p => `candidate_id.like.${p}%`).join(','));

        if (filters.party && filters.party !== 'all') {
          civicQuery = civicQuery.eq('party', filters.party);
        }
        if (filters.state && filters.state !== 'all') {
          civicQuery = civicQuery.eq('state', filters.state);
        }

        const { data: civicOfficials } = await civicQuery;

        if (civicOfficials && civicOfficials.length > 0) {
          // Exclude any that already exist in the federal results (shouldn't happen, but safety)
          const federalIds = new Set(results.map(r => r.id));
          const newCivicIds = civicOfficials.filter(co => !federalIds.has(co.candidate_id)).map(co => co.candidate_id);

          // Fetch answer counts for civic officials (id-chunked — see chunkedIn)
          if (newCivicIds.length > 0) {
            const civicAnswerData = await chunkedIn('candidate_answer_coverage_stats (civic)', newCivicIds, chunk =>
              supabase
                .from('candidate_answer_coverage_stats')
                .select('candidate_id, answer_count, sourced_count')
                .in('candidate_id', chunk));

            const civicAnswerMap: Record<string, { count: number; sourced: number }> = {};
            (civicAnswerData || []).forEach(row => {
              civicAnswerMap[row.candidate_id] = {
                count: Number(row.answer_count) || 0,
                sourced: Number(row.sourced_count) || 0,
              };
            });

            // Build a set of civic official name+state keys for dedup against federal records
            const civicNameStateKeys = new Set<string>();
            for (const co of civicOfficials) {
              if (federalIds.has(co.candidate_id)) continue;
              const ac = civicAnswerMap[co.candidate_id] || { count: 0, sourced: 0 };
              results.push(makeCivicCoverage(co, ac.count, ac.sourced, localQuestions));
              if (co.name && co.state) {
                civicNameStateKeys.add(`${co.name.toLowerCase()}|${co.state.toLowerCase()}`);
              }
            }

            // Remove non-incumbent federal candidates that now have a civic override (e.g., transitioned to state office)
            results = results.filter(r => {
              if (r.source !== 'federal') return true;
              const key = `${r.name.toLowerCase()}|${r.state.toLowerCase()}`;
              return !civicNameStateKeys.has(key);
            });
          }
        }
      }

      // === STATIC OFFICIALS: federal_executive + local (Mayors, City Council, etc.) ===
      if (!skipCivic) {
        let staticQuery = supabase
          .from('static_officials')
          .select('id, name, party, office, state, district, level, coverage_tier, confidence')
          .eq('is_active', true);

        // When the directory is narrowed to Federal Executive, only that level's
        // static officials are relevant — don't pull every mayor just to drop
        // them at the level filter below.
        if (onlyFederalExec) {
          staticQuery = staticQuery.eq('level', 'federal_executive');
        }

        if (filters.party && filters.party !== 'all') {
          staticQuery = staticQuery.eq('party', filters.party);
        }
        if (filters.state && filters.state !== 'all') {
          staticQuery = staticQuery.eq('state', filters.state);
        }

        const { data: staticOfficials } = await staticQuery;

        if (staticOfficials && staticOfficials.length > 0) {
          const existingIds = new Set(results.map(r => r.id));
          const newStatic = staticOfficials.filter(s => !existingIds.has(s.id));
          const newIds = newStatic.map(s => s.id);

          const staticAnswerMap: Record<string, { count: number; sourced: number }> = {};
          const staticOverrideMap: Record<string, { overall_score: number | null; coverage_tier: string | null; confidence: string | null }> = {};
          if (newIds.length > 0) {
            const [staticAnswerData, staticOverrideData] = await Promise.all([
              chunkedIn('candidate_answer_coverage_stats (static)', newIds, chunk =>
                supabase
                  .from('candidate_answer_coverage_stats')
                  .select('candidate_id, answer_count, sourced_count')
                  .in('candidate_id', chunk)),
              chunkedIn('candidate_overrides (static)', newIds, chunk =>
                supabase
                  .from('candidate_overrides')
                  .select('candidate_id, overall_score, coverage_tier, confidence')
                  .in('candidate_id', chunk)),
            ]);
            (staticAnswerData || []).forEach(row => {
              staticAnswerMap[row.candidate_id] = {
                count: Number(row.answer_count) || 0,
                sourced: Number(row.sourced_count) || 0,
              };
            });
            (staticOverrideData || []).forEach(row => {
              staticOverrideMap[row.candidate_id] = {
                overall_score: row.overall_score,
                coverage_tier: row.coverage_tier,
                confidence: row.confidence,
              };
            });
          }

          for (const s of newStatic) {
            const ac = staticAnswerMap[s.id] || { count: 0, sourced: 0 };
            const ov = staticOverrideMap[s.id];
            // Federal executives (e.g., President) answer federal-scope questions;
            // governor-and-below static officials answer local-scope only.
            const isFederalExec = (s.level || '').toString() === 'federal_executive';
            const denom = isFederalExec ? federalQuestions : localQuestions;
            results.push(makeCivicCoverage(
              {
                candidate_id: s.id,
                name: s.name,
                party: s.party,
                office: s.office,
                state: s.state,
                district: s.district ?? null,
                overall_score: ov?.overall_score ?? null,
                coverage_tier: ov?.coverage_tier ?? s.coverage_tier,
                confidence: ov?.confidence ?? s.confidence,
              },
              ac.count,
              ac.sourced,
              denom,
            ));
          }
        }
      }

      // Fallback: compute overallScore from candidate_answers when stored score is null
      const idsNeedingScore = results.filter(r => r.overallScore === null && r.answerCount > 0).map(r => r.id);
      if (idsNeedingScore.length > 0) {
        const computedScoreMap: Record<string, number> = {};
        // Chunk to avoid URL length limits
        const CHUNK = 100;
        for (let i = 0; i < idsNeedingScore.length; i += CHUNK) {
          const chunk = idsNeedingScore.slice(i, i + CHUNK);
          const { data: answerRows } = await supabase
            .from('candidate_answers')
            .select('candidate_id, answer_value')
            .in('candidate_id', chunk);
          const sums: Record<string, { sum: number; count: number }> = {};
          (answerRows || []).forEach(r => {
            if (!sums[r.candidate_id]) sums[r.candidate_id] = { sum: 0, count: 0 };
            sums[r.candidate_id].sum += Number(r.answer_value) || 0;
            sums[r.candidate_id].count += 1;
          });
          for (const [cid, { sum, count }] of Object.entries(sums)) {
            if (count > 0) computedScoreMap[cid] = Math.round((sum / count) * 100) / 100;
          }
        }
        results = results.map(r =>
          r.overallScore === null && computedScoreMap[r.id] !== undefined
            ? { ...r, overallScore: computedScoreMap[r.id] }
            : r
        );
      }

      // Apply level filter
      if (filters.level && filters.level !== 'all') {
        results = results.filter(c => c.level === filters.level);
      }

      // Apply coverage filter
      let filtered = results;
      if (filters.coverageFilter === 'none') {
        filtered = results.filter(c => c.answerCount === 0);
      } else if (filters.coverageFilter === 'low') {
        filtered = results.filter(c => c.answerCount > 0 && c.percentage < 50);
      } else if (filters.coverageFilter === 'full') {
        filtered = results.filter(c => c.percentage >= 100);
      }

      // Sort by answer count ascending (least coverage first)
      return filtered.sort((a, b) => a.answerCount - b.answerCount);
    },
    staleTime: 30000,
    // Optional background polling so cron-written FEC/Local/Delta values surface
    // without a manual refresh. Off unless a caller opts in. react-query pauses
    // interval refetches while the tab is unfocused (refetchIntervalInBackground
    // defaults to false), so this won't poll in the background.
    refetchInterval: options?.refetchInterval ?? false,
  });
}

// Progressive loading wrapper: loads first 20 instantly, then all in background
export function useCandidatesAnswerCoverageProgressive(filters: Filters = {}, options?: { enabled?: boolean; financeCycle?: string; refetchInterval?: number | false }) {
  const INITIAL_LIMIT = 20;

  // Phase 1: Quick load first 20 candidates. Never poll this throwaway first-page
  // query — only the full query below carries the optional refetchInterval.
  const initialQuery = useCandidatesAnswerCoverage(filters, {
    ...options,
    limit: INITIAL_LIMIT,
    financeCycle: options?.financeCycle,
    refetchInterval: false,
  });

  // Phase 2: Load ALL after initial is done (different query key due to limit)
  const fullQuery = useCandidatesAnswerCoverage(filters, {
    enabled: options?.enabled !== false && initialQuery.isSuccess,
    financeCycle: options?.financeCycle,
    refetchInterval: options?.refetchInterval ?? false,
    // No limit = fetch all
  });

  // Merge: show initial data immediately, then swap to full data when ready
  const candidates = fullQuery.data ?? initialQuery.data;
  const isInitialLoading = initialQuery.isLoading;
  const isLoadingMore = initialQuery.isSuccess && fullQuery.isFetching;
  const totalLoaded = candidates?.length ?? 0;

  return {
    data: candidates,
    isLoading: isInitialLoading,
    isFetching: initialQuery.isFetching || fullQuery.isFetching,
    isLoadingMore,
    totalLoaded,
    refetch: fullQuery.refetch,
    dataUpdatedAt: fullQuery.dataUpdatedAt || initialQuery.dataUpdatedAt,
  };
}

export function useCandidateAnswerStats() {
  const { data: questionCounts } = useQuestionCounts();

  return useQuery({
    queryKey: ['candidate-answer-stats'],
    enabled: !!questionCounts,
    queryFn: async () => {
      const { federalQuestions } = questionCounts!;

      // Parallel fetch: candidates count and answer coverage stats
      const [candidatesResult, coverageResult] = await Promise.all([
        supabase.from('candidates').select('*', { count: 'exact', head: true }),
        supabase.from('candidate_answer_coverage_stats').select('candidate_id, answer_count'),
      ]);

      if (candidatesResult.error) throw candidatesResult.error;
      if (coverageResult.error) throw coverageResult.error;

      const totalQuestions = federalQuestions; // 240 (federal questions)
      const totalCandidates = candidatesResult.count || 0;
      const coverageData = coverageResult.data || [];

      // Calculate stats from aggregated view data
      const candidatesWithAnswers = coverageData.filter(r => (r.answer_count || 0) > 0);
      const noAnswers = totalCandidates - candidatesWithAnswers.length;
      
      const lowCoverage = candidatesWithAnswers.filter(r => {
        const count = r.answer_count || 0;
        const pct = totalQuestions ? (count / totalQuestions) * 100 : 0;
        return pct > 0 && pct < 50;
      }).length;
      
      const fullCoverage = candidatesWithAnswers.filter(r => {
        const count = r.answer_count || 0;
        return totalQuestions > 0 && count >= totalQuestions;
      }).length;

      return {
        totalCandidates,
        noAnswers,
        lowCoverage,
        fullCoverage,
        totalQuestions,
      };
    },
    staleTime: 30000,
  });
}

export function useUniqueStates() {
  return useQuery({
    queryKey: ['unique-states'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidates')
        .select('state')
        .order('state', { ascending: true });

      if (error) throw error;

      const states = [...new Set((data || []).map(c => c.state))].filter(Boolean);
      return states;
    },
    staleTime: 60000,
  });
}

// Sort districts so numeric districts order naturally (1, 2, 10) and named
// districts (e.g. "At-Large") fall to the end alphabetically.
function compareDistricts(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  const aNum = !Number.isNaN(na);
  const bNum = !Number.isNaN(nb);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return a.localeCompare(b);
}

// Distinct district values for the coverage filter. Optionally scoped to a
// single state so the dropdown only offers districts that exist there.
export function useUniqueDistricts(state?: string) {
  return useQuery({
    queryKey: ['unique-districts', state ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('candidates')
        .select('district')
        .not('district', 'is', null);

      if (state && state !== 'all') {
        query = query.eq('state', state);
      }

      const { data, error } = await query;
      if (error) throw error;

      const districts = [...new Set(
        (data || [])
          .map(c => normalizeDistrict(c.district))
          .filter((d): d is string => !!d)
      )].sort(compareDistricts);
      return districts;
    },
    staleTime: 60000,
  });
}

// Hook for recalculating coverage tiers
export function useRecalculateCoverageTiers() {
  const queryClient = useQueryClient();

  const recalculateAll = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('recalculate_all_coverage_tiers');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates-answer-coverage'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-answer-stats'] });
    },
  });

  const recalculateSingle = useMutation({
    mutationFn: async (candidateId: string) => {
      const { data, error } = await supabase.rpc('recalculate_candidate_coverage', {
        p_candidate_id: candidateId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates-answer-coverage'] });
    },
  });

  return {
    recalculateAll: recalculateAll.mutateAsync,
    recalculateSingle: recalculateSingle.mutateAsync,
    isRecalculatingAll: recalculateAll.isPending,
    isRecalculatingSingle: recalculateSingle.isPending,
  };
}
