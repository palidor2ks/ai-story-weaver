import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';

export interface VotingRecordStats {
  totalVotes: number;
  totalLegislativeActions: number;
  totalFloorVotes: number;
  membersWithVotes: number;
  membersWithFloorVotes: number;
  totalFederalLegislators: number;
  topicCounts: Record<string, number>;
  lastVoteDate: string | null;
  lastFloorVoteDate: string | null;
}

export interface SyncProgress {
  total: number;
  completed: number;
  current: string | null;
  errors: string[];
}

export function useVotingRecordsStats() {
  return useQuery({
    queryKey: ['voting-records-stats'],
    queryFn: async (): Promise<VotingRecordStats> => {
      // Get counts from candidate_votes table by action_type
      const [legislativeResult, floorVoteResult, totalResult, billsResult] = await Promise.all([
        supabase
          .from('candidate_votes')
          .select('*', { count: 'exact', head: true })
          .in('action_type', ['sponsor', 'cosponsor']),
        supabase
          .from('candidate_votes')
          .select('*', { count: 'exact', head: true })
          .eq('action_type', 'floor_vote'),
        supabase
          .from('candidate_votes')
          .select('*', { count: 'exact', head: true }),
        supabase
          .from('bills')
          .select('*', { count: 'exact', head: true })
      ]);

      const totalLegislativeActions = legislativeResult.count || 0;
      const totalFloorVotes = floorVoteResult.count || 0;
      const totalVotes = totalResult.count || 0;

      // Get coverage data from view (now includes legislative_actions_count and floor_votes_count)
      const { data: coverageData, error: coverageError } = await supabase
        .from('candidate_voting_coverage')
        .select('candidate_id, total_votes_stored, topics_covered, last_vote_date, legislative_actions_count, floor_votes_count, last_floor_vote_date')
        .gt('total_votes_stored', 0);

      if (coverageError) throw coverageError;

      const membersWithVotes = coverageData?.length || 0;
      const membersWithFloorVotes = coverageData?.filter(c => (c.floor_votes_count ?? 0) > 0).length || 0;

      // Get last vote date from coverage data
      const lastVoteDate = coverageData?.reduce((max, c) => {
        if (!max || (c.last_vote_date && c.last_vote_date > max)) return c.last_vote_date;
        return max;
      }, null as string | null) || null;

      // Get last floor vote date
      const lastFloorVoteDate = coverageData?.reduce((max, c) => {
        if (!max || (c.last_floor_vote_date && c.last_floor_vote_date > max)) return c.last_floor_vote_date;
        return max;
      }, null as string | null) || null;

      // Count total federal legislators using PostgREST-compatible range filter
      // Bioguide IDs match pattern [A-Z][0-9]{6}, e.g., "A000001"
      const FEDERAL_LEGISLATOR_FALLBACK = 540;
      const { count: federalLegislatorsCount } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .gte('id', 'A000000')
        .lte('id', 'Z999999');

      return {
        totalVotes,
        totalLegislativeActions,
        totalFloorVotes,
        membersWithVotes,
        membersWithFloorVotes,
        totalFederalLegislators: federalLegislatorsCount ?? FEDERAL_LEGISLATOR_FALLBACK,
        topicCounts: {},
        lastVoteDate,
        lastFloorVoteDate,
      };
    },
    staleTime: 30000,
  });
}

export function useVotingRecordsSync() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [floorVoteProgress, setFloorVoteProgress] = useState<SyncProgress | null>(null);

  const syncAllVotes = useMutation({
    mutationFn: async () => {
      // Get all federal legislators (bioguide IDs) using PostgREST-compatible range filter
      const { data: legislators, error: legError } = await supabase
        .from('candidates')
        .select('id, name')
        .gte('id', 'A000000')
        .lte('id', 'Z999999')
        .order('name');

      if (legError) throw legError;

      const total = legislators?.length || 0;
      const errors: string[] = [];
      let completed = 0;

      setProgress({ total, completed: 0, current: null, errors: [] });

      // Process in batches of 2 to avoid rate limiting (reduced from 5)
      const BATCH_SIZE = 2;
      const batches = [];
      for (let i = 0; i < (legislators?.length || 0); i += BATCH_SIZE) {
        batches.push((legislators || []).slice(i, i + BATCH_SIZE));
      }

      for (const batch of batches) {
        const results = await Promise.allSettled(
          batch.map(async (member) => {
            setProgress(prev => prev ? { ...prev, current: member.name } : null);
            
            const { data, error } = await supabase.functions.invoke('fetch-member-votes', {
              body: { bioguideId: member.id, persistVotes: true },
            });

            if (error) {
              throw new Error(`${member.name}: ${error.message}`);
            }
            return { member, data };
          })
        );

        // Track results
        results.forEach((result) => {
          completed++;
          if (result.status === 'rejected') {
            errors.push(result.reason?.message || 'Unknown error');
          }
          setProgress({ total, completed, current: null, errors });
        });

        // Longer delay between batches to avoid rate limiting (increased from 500ms)
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      return { total, completed, errors };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voting-records-stats'] });
      queryClient.invalidateQueries({ queryKey: ['candidates-answer-coverage'] });
      setProgress(null);
    },
    onError: () => {
      setProgress(null);
    },
  });

  const syncAllFloorVotes = useMutation({
    mutationFn: async () => {
      // Get all federal legislators (bioguide IDs) using PostgREST-compatible range filter
      const { data: legislators, error: legError } = await supabase
        .from('candidates')
        .select('id, name, office')
        .gte('id', 'A000000')
        .lte('id', 'Z999999')
        .order('name');

      if (legError) throw legError;

      const total = legislators?.length || 0;
      const errors: string[] = [];
      let completed = 0;

      setFloorVoteProgress({ total, completed: 0, current: null, errors: [] });

      // Process in batches of 2 (reduced from 3 for reliability)
      const BATCH_SIZE = 2;
      const batches = [];
      for (let i = 0; i < (legislators?.length || 0); i += BATCH_SIZE) {
        batches.push((legislators || []).slice(i, i + BATCH_SIZE));
      }

      for (const batch of batches) {
        const results = await Promise.allSettled(
          batch.map(async (member) => {
            setFloorVoteProgress(prev => prev ? { ...prev, current: member.name } : null);
            
            // Determine chamber from office
            const chamber = member.office?.toLowerCase().includes('senator') ? 'senate' : 'house';
            
            // Edge function now uses clerk.house.gov and senate.gov XML sources
            const { data, error } = await supabase.functions.invoke('fetch-floor-votes', {
              body: { bioguideId: member.id, chamber },
            });

            if (error) {
              throw new Error(`${member.name}: ${error.message}`);
            }
            return { member, data };
          })
        );

        // Track results
        results.forEach((result) => {
          completed++;
          if (result.status === 'rejected') {
            errors.push(result.reason?.message || 'Unknown error');
          }
          setFloorVoteProgress({ total, completed, current: null, errors });
        });

        // Longer delay for floor votes (increased from 1000ms for reliability)
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2500));
        }
      }

      return { total, completed, errors };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voting-records-stats'] });
      queryClient.invalidateQueries({ queryKey: ['candidates-answer-coverage'] });
      setFloorVoteProgress(null);
    },
    onError: () => {
      setFloorVoteProgress(null);
    },
  });

  const syncSingleMember = useMutation({
    mutationFn: async (bioguideId: string) => {
      const { data, error } = await supabase.functions.invoke('fetch-member-votes', {
        body: { bioguideId, persistVotes: true },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voting-records-stats'] });
      queryClient.invalidateQueries({ queryKey: ['candidates-answer-coverage'] });
    },
  });

  const syncSingleMemberFloorVotes = useMutation({
    mutationFn: async ({ bioguideId, office }: { bioguideId: string; office: string }) => {
      const chamber = office?.toLowerCase().includes('senator') ? 'senate' : 'house';
      
      // Edge function now uses clerk.house.gov and senate.gov XML sources
      // and defaults to congresses [119, 118, 117, 116, 115, 114, 113]
      const { data, error } = await supabase.functions.invoke('fetch-floor-votes', {
        body: { bioguideId, chamber },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voting-records-stats'] });
      queryClient.invalidateQueries({ queryKey: ['candidates-answer-coverage'] });
    },
  });

  return {
    syncAllVotes,
    syncAllFloorVotes,
    syncSingleMember,
    syncSingleMemberFloorVotes,
    progress,
    floorVoteProgress,
    issyncing: syncAllVotes.isPending,
    isFloorVoteSyncing: syncAllFloorVotes.isPending,
  };
}
