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

export const useCandidates = () => {
  return useQuery({
    queryKey: ['candidates'],
    queryFn: async () => {
      // Fetch all data in parallel to reduce latency
      const [candidatesResult, topicScoresResult, overridesResult] = await Promise.all([
        supabase.from('candidates').select('*').order('name'),
        supabase.from('calculated_candidate_topic_scores').select('candidate_id, topic_id, calculated_score'),
        supabase.from('candidate_overrides').select('candidate_id, overall_score, name, party, office, state, district, image_url, coverage_tier, confidence'),
      ]);

      if (candidatesResult.error) throw candidatesResult.error;

      const candidates = candidatesResult.data;
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
      const candidatesWithScores = candidates.map(candidate => {
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

export interface CandidateWithOverride extends Candidate {
  hasOverride?: boolean;
}

export const useCandidate = (id: string | undefined) => {
  return useQuery({
    queryKey: ['candidate', id],
    queryFn: async () => {
      if (!id) return null;
      
      // Fetch override, candidate, and topic scores in parallel for reduced latency
      const [overrideResult, candidateResult, topicScoresResult] = await Promise.all([
        supabase.from('candidate_overrides').select('*').eq('candidate_id', id).maybeSingle(),
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
        };
        return mergedOfficial;
      }

      // Check if this is a non-Congress ID pattern - skip Congress API
      const isNonCongressId = id.startsWith('exec_') || 
                               id.startsWith('gov_') || 
                               id.startsWith('local_') || 
                               id.startsWith('state_') ||
                               id.startsWith('openstates') ||
                               id.startsWith('federal_');
      
      if (isNonCongressId) {
        // For executive IDs not in DB, return basic info from override if available
        if (override) {
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
            topicScores: [],
            hasOverride: true,
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
export interface DonorWithCanonical extends Donor {
  display_name: string;
  is_consolidated: boolean;
  name_variations?: string[];
}

export const useCandidateDonors = (candidateId: string | undefined) => {
  return useQuery({
    queryKey: ['donors', candidateId],
    queryFn: async () => {
      if (!candidateId) return [];
      
      // First get raw donors
      const { data: rawDonors, error: donorError } = await supabase
        .from('donors')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('amount', { ascending: false })
        .limit(10000);
      
      if (donorError) throw donorError;
      if (!rawDonors || rawDonors.length === 0) return [];
      
      // Get all active aliases
      const { data: aliases, error: aliasError } = await supabase
        .from('donor_aliases')
        .select('*')
        .eq('is_active', true);
      
      if (aliasError) {
        console.warn('Failed to fetch donor aliases:', aliasError);
        // Return donors without alias resolution
        return rawDonors.map(d => ({
          ...d,
          display_name: d.name,
          is_consolidated: false,
        })) as DonorWithCanonical[];
      }
      
      // Group donors by canonical name
      const canonicalGroups = new Map<string, DonorWithCanonical>();
      
      rawDonors.forEach(donor => {
        // Use display_name from database if it exists (already resolved by backfill)
        let canonicalName = donor.display_name;
        let isConsolidated = donor.display_name !== null && donor.display_name !== donor.name;
        
        // Fallback: Find matching alias if display_name not set or same as name
        if (!canonicalName || canonicalName === donor.name) {
          const matchingAlias = (aliases || []).find(alias => {
            if (!alias.donor_types?.includes(donor.type)) return false;
            
            // Check all patterns in alias_patterns array
            const patterns = alias.alias_patterns || (alias.alias_pattern ? [alias.alias_pattern] : []);
            return patterns.some(pattern => {
              if (!pattern) return false;
              const regexPattern = pattern.replace(/%/g, '.*').replace(/_/g, '.');
              const regex = new RegExp(`^${regexPattern}$`, 'i');
              return regex.test(donor.name);
            });
          });
          
          if (matchingAlias) {
            canonicalName = matchingAlias.canonical_name;
            isConsolidated = true;
          } else {
            canonicalName = donor.name;
          }
        }
        
        // Group by display_name and cycle (removes type to consolidate same entity across types)
        const groupKey = `${canonicalName}|${donor.cycle}`;
        
        const existing = canonicalGroups.get(groupKey);
        if (existing) {
          // Merge with existing donor
          existing.amount += donor.amount;
          existing.transaction_count += donor.transaction_count;
          if (!existing.name_variations) existing.name_variations = [existing.name];
          if (!existing.name_variations.includes(donor.name)) {
            existing.name_variations.push(donor.name);
          }
          existing.is_consolidated = true;
        } else {
          canonicalGroups.set(groupKey, {
            ...donor,
            display_name: canonicalName,
            is_consolidated: isConsolidated,
            name_variations: isConsolidated ? [donor.name] : undefined,
          });
        }
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
          bill_name: (v.bills as any)?.name || v.bill_id,
          date: v.action_date,
          position: v.position as Vote['position'],
          topic: (v.bills as any)?.topic || 'Government',
          description: (v.bills as any)?.description || null,
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
      return congressData.votes.map((v: any) => ({
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
        .select('*, question_options(*)');
      
      if (error) throw error;

      // Rename question_options to options and sort them
      return questions.map(q => ({
        ...q,
        is_onboarding_canonical: q.is_onboarding_canonical ?? false,
        onboarding_slot: q.onboarding_slot ?? null,
        options: (q.question_options || []).sort((a: any, b: any) => 
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
        options: (q.question_options || []).sort((a: any, b: any) => 
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
        .order('onboarding_slot');
      
      if (error) throw error;
      
      return (questions || []).map(q => ({
        ...q,
        options: (q.question_options || []).sort((a: any, b: any) => 
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
