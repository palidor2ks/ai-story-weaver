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
}

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
                               id.startsWith('openstates');
      
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

export const useCandidateDonors = (candidateId: string | undefined) => {
  return useQuery({
    queryKey: ['donors', candidateId],
    queryFn: async () => {
      if (!candidateId) return [];
      
      const { data, error } = await supabase
        .from('donors')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('amount', { ascending: false });
      
      if (error) throw error;
      return data as Donor[];
    },
    enabled: !!candidateId,
  });
};

export const useCandidateVotes = (candidateId: string | undefined) => {
  return useQuery({
    queryKey: ['votes', candidateId],
    queryFn: async () => {
      if (!candidateId) return [];
      
      // First try to fetch from database
      const { data, error } = await supabase
        .from('votes')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('date', { ascending: false });
      
      if (error) throw error;
      
      // If we have votes in the DB, return them
      if (data && data.length > 0) {
        return data as Vote[];
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
      
      // Single relational query instead of two separate queries
      const { data: questions, error } = await supabase
        .from('questions')
        .select('*, question_options(*)')
        .eq('is_onboarding_canonical', true)
        .in('topic_id', selectedTopicIds)
        .order('onboarding_slot');
      
      if (error) throw error;

      // Sort by topic order (matching selectedTopicIds order) then by slot
      const topicOrderMap = new Map(selectedTopicIds.map((id, idx) => [id, idx]));
      questions.sort((a, b) => {
        const topicOrderA = topicOrderMap.get(a.topic_id) ?? 999;
        const topicOrderB = topicOrderMap.get(b.topic_id) ?? 999;
        if (topicOrderA !== topicOrderB) return topicOrderA - topicOrderB;
        return (a.onboarding_slot || 0) - (b.onboarding_slot || 0);
      });

      // Rename question_options to options and sort them
      return questions.map(q => ({
        ...q,
        options: (q.question_options || []).sort((a: any, b: any) => 
          (a.display_order || 0) - (b.display_order || 0)
        ),
        question_options: undefined,
      })) as Question[];
    },
    enabled: selectedTopicIds.length > 0,
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
