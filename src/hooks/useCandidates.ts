import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CoverageTier, ConfidenceLevel } from '@/lib/scoreFormat';

interface CandidateTopicScore {
  topic_id: string;
  score: number;
  topics?: {
    name: string;
    icon: string;
  };
}

interface Candidate {
  id: string;
  name: string;
  party: 'Democrat' | 'Republican' | 'Independent' | 'Other';
  office: string;
  state: string;
  district: string | null;
  image_url: string | null;
  overall_score: number;
  last_updated: string;
  coverage_tier: CoverageTier;
  confidence: ConfidenceLevel;
  is_incumbent: boolean;
  score_version: string;
  claimed_by_user_id: string | null;
  claimed_at: string | null;
  fec_candidate_id: string | null;
  last_donor_sync: string | null;
  topicScores?: CandidateTopicScore[];
}

interface Donor {
  id: string;
  name: string;
  type: 'Individual' | 'PAC' | 'Organization' | 'Unknown';
  amount: number;
  cycle: string;
  recipient_committee_id: string | null;
  recipient_committee_name: string | null;
  first_receipt_date: string | null;
  last_receipt_date: string | null;
  transaction_count: number;
  contributor_city: string | null;
  contributor_state: string | null;
  contributor_zip: string | null;
  employer: string | null;
  occupation: string | null;
  is_contribution: boolean;
  is_transfer: boolean;
  is_conduit_org: boolean;
  line_number: string | null;
  conduit_name: string | null;
  conduit_committee_id: string | null;
}

export type { Donor };

interface Vote {
  id: string;
  bill_id: string;
  bill_name: string;
  date: string;
  position: 'Yea' | 'Nay' | 'Present' | 'Not Voting';
  topic: string;
  description: string | null;
}

interface QuestionOption {
  id: string;
  question_id: string;
  text: string;
  value: number;
  display_order: number;
  is_skip_option?: boolean;
}

interface Question {
  id: string;
  topic_id: string;
  text: string;
  is_onboarding_canonical: boolean;
  onboarding_slot: number | null;
  options?: QuestionOption[];
}

const CANDIDATE_LIST_COLUMNS =
  'id, name, party, office, state, district, image_url, overall_score, coverage_tier, confidence, is_incumbent, score_version, last_updated, claimed_by_user_id, claimed_at, fec_candidate_id, last_donor_sync, person_id';

export const useCandidates = () => {
  return useQuery({
    queryKey: ['candidates'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      // Fetch all data in parallel to reduce latency
      const [candidatesResult, topicScoresResult, overridesResult] = await Promise.all([
        supabase.from('candidates').select(CANDIDATE_LIST_COLUMNS).order('name'),
        supabase.from('calculated_candidate_topic_scores').select('candidate_id, topic_id, calculated_score'),
        supabase.from('candidate_overrides').select('candidate_id, overall_score, name, party, office, state, district, image_url, coverage_tier, confidence').eq('is_active', true),
      ]);

      if (candidatesResult.error) throw candidatesResult.error;

      const candidates = candidatesResult.data ?? [];
      const topicScores = topicScoresResult.data || [];
      const overrides = overridesResult.data || [];

      // Create maps for O(1) lookups
      const overrideMap = new Map(overrides.map(o => [o.candidate_id, o]));
      const topicScoresMap = new Map<string, typeof topicScores>();
      topicScores.forEach(ts => {
        if (!topicScoresMap.has(ts.candidate_id!)) {
          topicScoresMap.set(ts.candidate_id!, []);
        }
        topicScoresMap.get(ts.candidate_id!)!.push(ts);
      });

      // Map and merge data in single pass
      const candidatesWithScores = candidates.map((candidate) => {
        const override = overrideMap.get(candidate.id);
        const candidateTopicScores = topicScoresMap.get(candidate.id) || [];

        return {
          id: candidate.id,
          name: override?.name ?? candidate.name,
          party: (override?.party as Candidate['party']) ?? candidate.party,
          office: override?.office ?? candidate.office,
          state: override?.state ?? candidate.state,
          district: override?.district ?? candidate.district,
          image_url: override?.image_url ?? candidate.image_url,
          overall_score: override?.overall_score ?? candidate.overall_score,
          coverage_tier: (override?.coverage_tier as CoverageTier) ?? candidate.coverage_tier ?? 'tier_3',
          confidence: (override?.confidence as ConfidenceLevel) ?? candidate.confidence ?? 'medium',
          is_incumbent: candidate.is_incumbent ?? true,
          score_version: candidate.score_version || 'v1.0',
          last_updated: candidate.last_updated,
          claimed_by_user_id: candidate.claimed_by_user_id,
          claimed_at: candidate.claimed_at,
          fec_candidate_id: candidate.fec_candidate_id,
          last_donor_sync: candidate.last_donor_sync,
          topicScores: candidateTopicScores.map(ts => ({
            topic_id: ts.topic_id,
            score: ts.calculated_score ?? 0,
          })),
        };
      });

      return candidatesWithScores as Candidate[];
    },
  });
};


export interface PriorOffice {
  office: string;
  state: string;
  district?: string;
  start_year?: number;
  end_year?: number;
  candidate_id?: string;
}

export interface CandidateWithOverride extends Candidate {
  hasOverride?: boolean;
  priorOffices?: PriorOffice[];
}

export const useCandidate = (id: string | undefined) => {
  return useQuery({
    queryKey: ['candidate', id],
    queryFn: async () => {
      if (!id) return null;
      
      // Fetch override, candidate, and topic scores in parallel for reduced latency
      const [overrideResult, candidateResult, topicScoresResult] = await Promise.all([
        supabase.from('candidate_overrides').select('*').eq('candidate_id', id).eq('is_active', true).maybeSingle(),
        supabase.from('candidates').select('*').eq('id', id).maybeSingle(),
        supabase.from('candidate_topic_scores').select('topic_id, score, topics(name, icon)').eq('candidate_id', id),
      ]);

      const override = overrideResult.data;
      const candidate = candidateResult.data;
      const topicScores = topicScoresResult.data || [];

      if (candidateResult.error) throw candidateResult.error;
      if (topicScoresResult.error) throw topicScoresResult.error;
      
      // If found in database, return with topic scores and merged overrides
      if (candidate) {
        // Merge override fields with base candidate data
        const mergedCandidate: CandidateWithOverride = {
          ...candidate,
          name: override?.name ?? candidate.name,
          party: (override?.party as Candidate['party']) ?? candidate.party,
          office: override?.office ?? candidate.office,
          state: override?.state ?? candidate.state,
          district: override?.district ?? candidate.district,
          image_url: override?.image_url ?? candidate.image_url,
          overall_score: override?.overall_score ?? candidate.overall_score,
          coverage_tier: (override?.coverage_tier as CoverageTier) ?? candidate.coverage_tier ?? 'tier_3',
          confidence: (override?.confidence as ConfidenceLevel) ?? candidate.confidence ?? 'medium',
          is_incumbent: candidate.is_incumbent ?? true,
          score_version: candidate.score_version || 'v1.0',
          fec_candidate_id: candidate.fec_candidate_id,
          last_donor_sync: candidate.last_donor_sync,
          topicScores: topicScores.map(ts => ({
            topic_id: ts.topic_id,
            score: ts.score,
            topics: ts.topics,
          })),
          hasOverride: !!override,
          priorOffices: (override?.prior_offices as unknown as PriorOffice[]) || [],
        };

        return mergedCandidate;
      }

      // Not in candidates table - check static_officials (executive/state/local officials)
      const { data: staticOfficial } = await supabase
        .from('static_officials')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (staticOfficial) {
        const mergedOfficial: CandidateWithOverride = {
          id: staticOfficial.id,
          name: override?.name ?? staticOfficial.name,
          party: (override?.party as Candidate['party']) ?? staticOfficial.party as Candidate['party'],
          office: override?.office ?? staticOfficial.office,
          state: override?.state ?? staticOfficial.state,
          district: override?.district ?? staticOfficial.district ?? null,
          image_url: override?.image_url ?? staticOfficial.image_url,
          overall_score: override?.overall_score ?? 0,
          coverage_tier: (override?.coverage_tier as CoverageTier) ?? (staticOfficial.coverage_tier as CoverageTier) ?? 'tier_3',
          confidence: (override?.confidence as ConfidenceLevel) ?? (staticOfficial.confidence as ConfidenceLevel) ?? 'medium',
          is_incumbent: staticOfficial.is_active ?? true,
          score_version: 'v1.0',
          last_updated: staticOfficial.updated_at || new Date().toISOString(),
          claimed_by_user_id: null,
          claimed_at: null,
          fec_candidate_id: null,
          last_donor_sync: null,
          topicScores: [],
          hasOverride: !!override,
          priorOffices: (override?.prior_offices as unknown as PriorOffice[]) || [],
        };
        return mergedOfficial;
      }

      // Synthetic federal-executive IDs from civic-officials → resolve to real candidate row by office
      if (id === 'federal_president' || id === 'federal_vice_president') {
        const officeName = id === 'federal_president' ? 'President' : 'Vice President';
        const { data: execCandidate } = await supabase
          .from('candidates')
          .select('*')
          .eq('office', officeName)
          .eq('is_incumbent', true)
          .order('last_updated', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (execCandidate) {
          const [execOverrideRes, execTopicsRes] = await Promise.all([
            supabase.from('candidate_overrides').select('*').eq('candidate_id', execCandidate.id).eq('is_active', true).maybeSingle(),
            supabase.from('candidate_topic_scores').select('topic_id, score, topics(name, icon)').eq('candidate_id', execCandidate.id),
          ]);
          const execOverride = execOverrideRes.data;
          const execTopics = execTopicsRes.data || [];

          const merged: CandidateWithOverride = {
            ...execCandidate,
            name: execOverride?.name ?? execCandidate.name,
            party: (execOverride?.party as Candidate['party']) ?? execCandidate.party,
            office: execOverride?.office ?? execCandidate.office,
            state: execOverride?.state ?? execCandidate.state,
            district: execOverride?.district ?? execCandidate.district,
            image_url: execOverride?.image_url ?? execCandidate.image_url,
            overall_score: execOverride?.overall_score ?? execCandidate.overall_score,
            coverage_tier: (execOverride?.coverage_tier as CoverageTier) ?? execCandidate.coverage_tier ?? 'tier_3',
            confidence: (execOverride?.confidence as ConfidenceLevel) ?? execCandidate.confidence ?? 'medium',
            is_incumbent: execCandidate.is_incumbent ?? true,
            score_version: execCandidate.score_version || 'v1.0',
            fec_candidate_id: execCandidate.fec_candidate_id,
            last_donor_sync: execCandidate.last_donor_sync,
            topicScores: execTopics.map(ts => ({
              topic_id: ts.topic_id,
              score: ts.score,
              topics: ts.topics,
            })),
            hasOverride: !!execOverride,
            priorOffices: (execOverride?.prior_offices as unknown as PriorOffice[]) || [],
          };
          return merged;
        }
      }

      // Check if this is a non-Congress ID pattern - skip Congress API
      const isNonCongressId = id.startsWith('exec_') || 
                               id.startsWith('gov_') || 
                               id.startsWith('local_') || 
                               id.startsWith('state_') ||
                               id.startsWith('openstates') ||
                               id.startsWith('federal_') ||
                               id.startsWith('nj_') ||
                               id.startsWith('ny_') ||
                               id.startsWith('ca_') ||
                               id.startsWith('tx_') ||
                               id.startsWith('fl_') ||
                               id.startsWith('pa_');
      
      if (isNonCongressId) {
        // For executive IDs not in DB, return basic info from override if available.
        // Try to preserve finance continuity by linking to a prior federal candidate row
        // (same person) so donor/FEC data does not disappear after role transitions.
        if (override) {
          let priorFederalFecCandidateId: string | null = null;
          let priorFederalLastDonorSync: string | null = null;

          if (override.name) {
            const { data: matchedFederalCandidate } = await supabase
              .from('candidates')
              .select('fec_candidate_id, last_donor_sync, last_updated')
              .eq('name', override.name)
              .not('fec_candidate_id', 'is', null)
              .order('last_updated', { ascending: false })
              .limit(1)
              .maybeSingle();

            priorFederalFecCandidateId = matchedFederalCandidate?.fec_candidate_id ?? null;
            priorFederalLastDonorSync = matchedFederalCandidate?.last_donor_sync ?? null;
          }

          return {
            id,
            name: override.name ?? 'Unknown Official',
            party: (override.party as Candidate['party']) ?? 'Other',
            office: override.office ?? 'Official',
            state: override.state ?? 'US',
            district: override.district ?? null,
            image_url: override.image_url ?? null,
            overall_score: override.overall_score ?? 0,
            coverage_tier: (override.coverage_tier as CoverageTier) ?? 'tier_3',
            confidence: (override.confidence as ConfidenceLevel) ?? 'low',
            is_incumbent: true,
            score_version: 'v1.0',
            last_updated: new Date().toISOString(),
            claimed_by_user_id: null,
            claimed_at: null,
            fec_candidate_id: priorFederalFecCandidateId,
            last_donor_sync: priorFederalLastDonorSync,
            topicScores: [],
            hasOverride: true,
            priorOffices: (override.prior_offices as unknown as PriorOffice[]) || [],
          } as CandidateWithOverride;
        }
        // Executive not found anywhere
        console.log('Executive official not found in DB:', id);
        return null;
      }

      // Not in database - try Congress.gov API (id might be a bioguide ID)
      console.log('Candidate not in DB, trying Congress API for:', id);
      
      const { data: congressData, error: congressError } = await supabase.functions.invoke(
        'fetch-member',
        { body: { bioguideId: id } }
      );

      if (congressError) {
        console.error('Congress API error:', congressError);
        return null;
      }

      if (!congressData?.member) {
        return null;
      }

      const member = congressData.member;
      
      // Apply overrides to API data too
      const mergedMember: CandidateWithOverride = {
        id: member.id,
        name: override?.name ?? member.name,
        party: (override?.party as Candidate['party']) ?? member.party,
        office: override?.office ?? member.office,
        state: override?.state ?? member.state,
        district: override?.district ?? member.district,
        image_url: override?.image_url ?? member.image_url,
        overall_score: override?.overall_score ?? member.overall_score,
        coverage_tier: (override?.coverage_tier as CoverageTier) ?? member.coverage_tier ?? 'tier_3',
        confidence: (override?.confidence as ConfidenceLevel) ?? member.confidence ?? 'low',
        is_incumbent: member.is_incumbent ?? true,
        score_version: member.score_version || 'v1.0',
        last_updated: member.last_updated || new Date().toISOString(),
        claimed_by_user_id: null,
        claimed_at: null,
        fec_candidate_id: null,
        last_donor_sync: null,
        topicScores: [],
        hasOverride: !!override,
      };
      
      return mergedMember;
    },
    enabled: !!id,
  });
};

// Extended donor interface with canonical name support
export interface ViaCommittee {
  committee_id: string;
  committee_name: string;
  designation: string | null;
  amount: number;
}

export interface DonorCycleBreakdown {
  cycle: string;
  amount: number;
  transaction_count: number;
}

export interface DonorWithCanonical extends Donor {
  display_name: string;
  is_consolidated: boolean;
  name_variations?: string[];
  via_committees?: ViaCommittee[];
  is_external_only?: boolean;
  cycle_breakdown?: DonorCycleBreakdown[];
}

export const useCandidateDonors = (candidateId: string | undefined, cycle?: string) => {
  return useQuery({
    queryKey: ['donors', candidateId, cycle ?? 'all'],
    queryFn: async () => {
      if (!candidateId) return [];

      let resolvedCandidateId = candidateId;

      // Synthetic executive IDs (from civic officials/feed contexts) do not
      // match the canonical candidate_id used in donors. Resolve them to the
      // current incumbent candidate row before querying donors.
      if (candidateId === 'federal_president' || candidateId === 'federal_vice_president') {
        const officeName = candidateId === 'federal_president' ? 'President' : 'Vice President';
        const { data: execCandidate, error: execCandidateError } = await supabase
          .from('candidates')
          .select('id')
          .eq('office', officeName)
          .eq('is_incumbent', true)
          .order('last_updated', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (execCandidateError) throw execCandidateError;
        if (execCandidate?.id) {
          resolvedCandidateId = execCandidate.id;
        }
      }
      
      // First get raw donors — exclude FEC vendor refunds and non-contribution
      // receipt lines (Line 15/17 offsets, Line 18/20A/21 transfers/refunds out)
      // so vendors like AIR PARTNER LLC don't appear in the donor list.
      let donorsQuery = supabase
        .from('donors')
        .select('*')
        .eq('candidate_id', resolvedCandidateId)
        .eq('is_contribution', true)
        .eq('is_vendor_refund', false);
      if (cycle && cycle !== 'all') {
        donorsQuery = donorsQuery.eq('cycle', cycle);
      }
      const { data: rawDonors, error: donorError } = await donorsQuery
        .order('amount', { ascending: false })
        .limit(10000);
      
      if (donorError) throw donorError;
      if (!rawDonors || rawDonors.length === 0) return [];

      // Fetch the candidate's committee map so we can tag donors that gave through
      // outside committees (super PACs, JFCs, leadership PACs, etc.) instead of
      // the principal/authorized campaign.
      const { data: committeeRows } = await supabase
        .from('candidate_committees')
        .select('fec_committee_id, name, designation, active')
        .eq('candidate_id', resolvedCandidateId);
      const committeeMap = new Map<string, { name: string; designation: string | null; active: boolean }>();
      (committeeRows || []).forEach(c => {
        if (c.fec_committee_id) {
          committeeMap.set(c.fec_committee_id, {
            name: c.name ?? '',
            designation: c.designation ?? null,
            active: c.active !== false,
          });
        }
      });
      const isDirectDesignation = (d: string | null) => d === 'P' || d === 'A';
      // Authorized recipients for the candidate's main donor list:
      // Principal (P), Authorized (A), and Joint Fundraising (J) committees
      // that are still active. Leadership/Super PACs (U), delegate (D),
      // lobbyist (B) committees, or any inactive committee are excluded —
      // those donations are not contributions to the candidate's own campaign
      // (e.g. AMERICA PAC is a Super PAC making independent expenditures, not
      // an authorized Trump campaign committee).
      const isAuthorizedRecipient = (d: string | null) =>
        d === 'P' || d === 'A' || d === 'J';
      const conduitOrgNames = ['WINRED', 'ACTBLUE', 'DEMOCRACY ENGINE'];
      const isConduitDonor = (d: { display_name?: string | null; name: string; is_conduit_org?: boolean | null }) =>
        Boolean(d.is_conduit_org) ||
        conduitOrgNames.some(c => (d.display_name || d.name).toUpperCase().includes(c));

      // Fetch IE-excluded committees so we drop their donor rows too.
      const { data: ieExcludedRows } = await supabase
        .from('ie_excluded_committees_public')
        .select('fec_committee_id');
      const ieExcluded = new Set(((ieExcludedRows || []) as Array<{ fec_committee_id: string }>).map((r) => r.fec_committee_id));

      const allowedRawDonors = rawDonors.filter(d => {
        const rid = d.recipient_committee_id;
        if (!rid) return true; // legacy rows without recipient — keep
        if (ieExcluded.has(rid)) return false;
        const meta = committeeMap.get(rid);
        if (!meta) return true; // recipient not in this candidate's committee map — keep (unknown linkage)
        if (!meta.active) return false;
        return isAuthorizedRecipient(meta.designation);
      });

      if (allowedRawDonors.length === 0) return [];

      // Group donors by canonical name (display_name set by attach flow / DB trigger)
      const canonicalGroups = new Map<string, DonorWithCanonical>();

      allowedRawDonors.forEach(donor => {
        const canonicalName = donor.display_name || donor.name;
        const isConsolidated = !!donor.display_name && donor.display_name !== donor.name;
        const isConduit = isConduitDonor(donor);

        // Group by display_name and cycle for ordinary donors. Conduit processors
        // (ActBlue, WinRed, Democracy Engine) are pass-through processors, so merge
        // the same conduit name across cycles and keep a visible cycle breakdown.
        const groupKey = isConduit
          ? `conduit|${canonicalName}`
          : `${canonicalName}|${donor.cycle}`;

        const existing = canonicalGroups.get(groupKey);
        if (existing) {
          // Merge with existing donor
          existing.amount += donor.amount;
          existing.transaction_count += donor.transaction_count;
          if (isConduit) {
            const breakdown = existing.cycle_breakdown ?? [{
              cycle: existing.cycle,
              amount: existing.amount - donor.amount,
              transaction_count: existing.transaction_count - donor.transaction_count,
            }];
            const cycleEntry = breakdown.find(entry => entry.cycle === donor.cycle);
            if (cycleEntry) {
              cycleEntry.amount += donor.amount;
              cycleEntry.transaction_count += donor.transaction_count;
            } else {
              breakdown.push({
                cycle: donor.cycle,
                amount: donor.amount,
                transaction_count: donor.transaction_count,
              });
            }
            existing.cycle_breakdown = breakdown;
            existing.cycle = breakdown.length > 1
              ? 'Multiple cycles'
              : breakdown[0].cycle;
          }
          if (!existing.name_variations) existing.name_variations = [existing.name];
          if (!existing.name_variations.includes(donor.name)) {
            existing.name_variations.push(donor.name);
          }
          existing.is_consolidated = true;
          if (donor.first_receipt_date &&
            (!existing.first_receipt_date || donor.first_receipt_date < existing.first_receipt_date)
          ) {
            existing.first_receipt_date = donor.first_receipt_date;
          }
          if (donor.last_receipt_date &&
            (!existing.last_receipt_date || donor.last_receipt_date > existing.last_receipt_date)
          ) {
            existing.last_receipt_date = donor.last_receipt_date;
          }
          // Accumulate recipient committee tallies
          if (donor.recipient_committee_id) {
            const meta = committeeMap.get(donor.recipient_committee_id);
            const arr = existing.via_committees ?? [];
            const found = arr.find(v => v.committee_id === donor.recipient_committee_id);
            if (found) {
              found.amount += donor.amount;
            } else {
              arr.push({
                committee_id: donor.recipient_committee_id,
                committee_name: meta?.name || donor.recipient_committee_name || donor.recipient_committee_id,
                designation: meta?.designation ?? null,
                amount: donor.amount,
              });
            }
            existing.via_committees = arr;
          }
        } else {
          const via: ViaCommittee[] = [];
          if (donor.recipient_committee_id) {
            const meta = committeeMap.get(donor.recipient_committee_id);
            via.push({
              committee_id: donor.recipient_committee_id,
              committee_name: meta?.name || donor.recipient_committee_name || donor.recipient_committee_id,
              designation: meta?.designation ?? null,
              amount: donor.amount,
            });
          }
          canonicalGroups.set(groupKey, {
            ...donor,
            display_name: canonicalName,
            is_consolidated: isConsolidated,
            name_variations: isConsolidated ? [donor.name] : undefined,
            via_committees: via,
            cycle_breakdown: isConduit ? [{
              cycle: donor.cycle,
              amount: donor.amount,
              transaction_count: donor.transaction_count,
            }] : undefined,
          });
        }
      });

      // Compute is_external_only and normalize conduit cycle breakdown ordering.
      canonicalGroups.forEach(group => {
        if (group.cycle_breakdown) {
          group.cycle_breakdown = group.cycle_breakdown
            .filter(entry => entry.amount !== 0 || entry.transaction_count > 0)
            .sort((a, b) => Number(b.cycle) - Number(a.cycle));
          if (group.cycle_breakdown.length > 1) {
            group.cycle = 'Multiple cycles';
          } else if (group.cycle_breakdown.length === 1) {
            group.cycle = group.cycle_breakdown[0].cycle;
          }
        }
        const via = group.via_committees ?? [];
        if (via.length === 0) {
          group.is_external_only = false;
          return;
        }
        group.is_external_only = via.every(v => !isDirectDesignation(v.designation));
      });

      // Sort by amount descending
      return Array.from(canonicalGroups.values())
        .sort((a, b) => b.amount - a.amount);
    },
    enabled: !!candidateId,
  });
};

export const useCandidateVotes = (candidateId: string | undefined) => {
  return useQuery({
    queryKey: ['votes', candidateId],
    queryFn: async () => {
      if (!candidateId) return [];
      
      // Fetch from candidate_votes joined with bills
      const { data, error } = await supabase
        .from('candidate_votes')
        .select(`
          id,
          bill_id,
          action_date,
          position,
          action_type,
          bills!inner (
            name,
            topic,
            description
          )
        `)
        .eq('candidate_id', candidateId)
        .order('action_date', { ascending: false });
      
      if (error) throw error;
      
      // If we have votes in the DB, transform and return them
      if (data && data.length > 0) {
        return data.map(v => ({
          id: v.id,
          bill_id: v.bill_id,
          bill_name: (v.bills as { name?: string; topic?: string; description?: string } | null)?.name || v.bill_id,
          date: v.action_date,
          position: v.position as Vote['position'],
          topic: (v.bills as { name?: string; topic?: string; description?: string } | null)?.topic || 'Government',
          description: (v.bills as { name?: string; topic?: string; description?: string } | null)?.description || null,
        })) as Vote[];
      }

      // Not in database - try Congress.gov API (candidateId might be a bioguide ID)
      console.log('No votes in DB, trying Congress API for:', candidateId);
      
      const { data: congressData, error: congressError } = await supabase.functions.invoke(
        'fetch-member-votes',
        { body: { bioguideId: candidateId } }
      );

      if (congressError) {
        console.error('Congress API votes error:', congressError);
        return [];
      }

      if (!congressData?.votes) {
        return [];
      }

      // Transform Congress API votes to match our Vote interface
      return (congressData.votes as Array<{
        id: string;
        bill_id: string;
        bill_name: string;
        candidate_id: string;
        position: string;
        topic: string;
        description: string;
        date: string;
      }>).map((v) => ({
        id: v.id,
        bill_id: v.bill_id,
        bill_name: v.bill_name,
        candidate_id: v.candidate_id,
        position: v.position as 'Yea' | 'Nay' | 'Present' | 'Not Voting',
        topic: v.topic,
        description: v.description,
        date: v.date,
      })) as Vote[];
    },
    enabled: !!candidateId,
  });
};

export const useTopics = () => {
  return useQuery({
    queryKey: ['topics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('topics')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });
};

export const useQuestions = () => {
  return useQuery({
    queryKey: ['questions'],
    queryFn: async () => {
      // Single relational query instead of two separate queries
      const { data: questions, error } = await supabase
        .from('questions')
        .select('*, question_options(*)')
        .eq('include_in_quiz_library', true);
      
      
      if (error) throw error;

      // Rename question_options to options and sort them
      return questions.map(q => ({
        ...q,
        is_onboarding_canonical: q.is_onboarding_canonical ?? false,
        onboarding_slot: q.onboarding_slot ?? null,
        options: ((q.question_options || []) as Array<{ display_order: number | null }>).sort((a, b) =>
          (a.display_order || 0) - (b.display_order || 0)
        ),
        question_options: undefined,
      })) as Question[];
    },
  });
};

/**
 * Get canonical onboarding questions for selected topics
 * Returns 2 questions per topic (slot 1 and slot 2)
 */
export const useCanonicalQuestions = (selectedTopicIds: string[]) => {
  return useQuery({
    queryKey: ['canonical_questions', selectedTopicIds],
    queryFn: async () => {
      if (selectedTopicIds.length === 0) return [];
      
      const { data: questions, error } = await supabase
        .from('questions')
        .select('*, question_options(*)')
        .in('topic_id', selectedTopicIds)
        .eq('is_onboarding_canonical', true)
        .order('topic_id')
        .order('onboarding_slot');
      
      if (error) throw error;
      
      return (questions || []).map(q => ({
        ...q,
        options: ((q.question_options || []) as Array<{ display_order: number | null }>).sort((a, b) =>
          (a.display_order || 0) - (b.display_order || 0)
        ),
      }));
    },
    enabled: selectedTopicIds.length > 0,
  });
};

// Fetch ALL canonical onboarding questions (all 20, regardless of topic selection)
export const useAllCanonicalQuestions = () => {
  return useQuery({
    queryKey: ['all_canonical_questions'],
    queryFn: async () => {
      const { data: questions, error } = await supabase
        .from('questions')
        .select('*, question_options(*)')
        .eq('is_onboarding_canonical', true)
        .not('topic_id', 'like', 'local-%')
        .order('onboarding_slot');
      
      if (error) throw error;
      
      return (questions || []).map(q => ({
        ...q,
        options: ((q.question_options || []) as Array<{ display_order: number | null }>).sort((a, b) =>
          (a.display_order || 0) - (b.display_order || 0)
        ),
      }));
    },
  });
};

/**
 * Calculate match score between user and candidate
 * Uses the L/R spectrum (-10 to +10)
 */
export const calculateMatchScore = (userScore: number, candidateScore: number): number => {
  // Calculate absolute distance on -10 to +10 scale
  const distance = Math.abs(userScore - candidateScore);
  // Max distance is 20 (from -10 to +10)
  const matchPercentage = Math.round(100 - (distance / 20) * 100);
  return Math.max(0, Math.min(100, matchPercentage));
};
