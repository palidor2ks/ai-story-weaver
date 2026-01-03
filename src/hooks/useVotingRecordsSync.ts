import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';

export interface VotingRecordStats {
  totalVotes: number;
  membersWithVotes: number;
  totalFederalLegislators: number;
  topicCounts: Record<string, number>;
  lastVoteDate: string | null;
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
      // Get total vote count using exact count (handles large tables)
      const { count: totalVotes, error: countError } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;

      // Get unique candidates with votes from candidate_voting_coverage view
      const { data: coverageData, error: coverageError } = await supabase
        .from('candidate_voting_coverage')
        .select('candidate_id, total_votes_stored, topics_covered, last_vote_date')
        .gt('total_votes_stored', 0);

      if (coverageError) throw coverageError;

      const membersWithVotes = coverageData?.length || 0;

      // Count by topic from coverage view
      const topicCounts: Record<string, number> = {};
      (coverageData || []).forEach(c => {
        // topics_covered is a count, not individual topics
        // We'll need to get actual topic breakdown separately if needed
      });

      // Get last vote date from coverage data
      const lastVoteDate = coverageData?.reduce((max, c) => {
        if (!max || (c.last_vote_date && c.last_vote_date > max)) return c.last_vote_date;
        return max;
      }, null as string | null) || null;

      // Count total federal legislators (bioguide pattern)
      const { count: totalFederalLegislators } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .filter('id', '~', '^[A-Z][0-9]{6}$');

      return {
        totalVotes: totalVotes || 0,
        membersWithVotes,
        totalFederalLegislators: totalFederalLegislators || 0,
        topicCounts,
        lastVoteDate,
      };
    },
    staleTime: 30000,
  });
}

export function useVotingRecordsSync() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  const syncAllVotes = useMutation({
    mutationFn: async () => {
      // Get all federal legislators (bioguide IDs)
      const { data: legislators, error: legError } = await supabase
        .from('candidates')
        .select('id, name')
        .filter('id', '~', '^[A-Z][0-9]{6}$')
        .order('name');

      if (legError) throw legError;

      const total = legislators?.length || 0;
      const errors: string[] = [];
      let completed = 0;

      setProgress({ total, completed: 0, current: null, errors: [] });

      // Process in batches of 5 to avoid rate limiting
      const BATCH_SIZE = 5;
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

        // Small delay between batches to avoid rate limiting
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
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

  return {
    syncAllVotes,
    syncSingleMember,
    progress,
    issyncing: syncAllVotes.isPending,
  };
}
