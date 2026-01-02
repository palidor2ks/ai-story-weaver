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
      // Get total votes and unique candidates with votes (resolve bioguide IDs to canonical candidate IDs)
      const { data: votesData, error: votesError } = await supabase
        .from('votes')
        .select('candidate_id, topic, date');

      if (votesError) throw votesError;

      // Build map of bioguide_id -> candidate.id so legacy vote rows still aggregate correctly
      const { data: candidateMapData, error: candidateMapError } = await supabase
        .from('candidates')
        .select('id, bioguide_id');

      if (candidateMapError) throw candidateMapError;

      const bioguideToCandidateId = new Map<string, string>();
      (candidateMapData || []).forEach(c => {
        if (c.bioguide_id) {
          bioguideToCandidateId.set(c.bioguide_id, c.id);
        }
      });

      const totalVotes = votesData?.length || 0;
      const uniqueCandidates = new Set(
        (votesData || []).map(v => bioguideToCandidateId.get(v.candidate_id) || v.candidate_id)
      );
      const membersWithVotes = uniqueCandidates.size;

      // Count by topic
      const topicCounts: Record<string, number> = {};
      (votesData || []).forEach(v => {
        topicCounts[v.topic] = (topicCounts[v.topic] || 0) + 1;
      });

      // Get last vote date
      const lastVoteDate = votesData?.reduce((max, v) => {
        if (!max || v.date > max) return v.date;
        return max;
      }, null as string | null) || null;

      // Count total federal legislators (bioguide pattern)
      const { count: totalFederalLegislators } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .filter('id', '~', '^[A-Z][0-9]{6}$');

      return {
        totalVotes,
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
