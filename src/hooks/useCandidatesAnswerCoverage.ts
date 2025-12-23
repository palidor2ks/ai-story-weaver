import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CandidateAnswerCoverage {
  id: string;
  name: string;
  party: string;
  office: string;
  state: string;
  answerCount: number;
  totalQuestions: number;
  percentage: number;
}

interface Filters {
  party?: string;
  state?: string;
  coverageFilter?: 'all' | 'none' | 'low' | 'full';
}

export function useCandidatesAnswerCoverage(filters: Filters = {}) {
  return useQuery({
    queryKey: ['candidates-answer-coverage', filters],
    queryFn: async (): Promise<CandidateAnswerCoverage[]> => {
      // Get total questions count
      const { count: totalQuestions, error: questionsError } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true });

      if (questionsError) throw questionsError;

      // Get all candidates
      let candidatesQuery = supabase
        .from('candidates')
        .select('id, name, party, office, state')
        .order('name', { ascending: true });

      if (filters.party && filters.party !== 'all') {
        candidatesQuery = candidatesQuery.eq('party', filters.party as 'Democrat' | 'Republican' | 'Independent' | 'Other');
      }

      if (filters.state && filters.state !== 'all') {
        candidatesQuery = candidatesQuery.eq('state', filters.state);
      }

      const { data: candidates, error: candidatesError } = await candidatesQuery;

      if (candidatesError) throw candidatesError;

      // Get answer counts per candidate (paginated to handle >1000 rows)
      const PAGE_SIZE = 1000;
      let from = 0;
      const allAnswers: Array<{ candidate_id: string }> = [];

      while (true) {
        const { data, error } = await supabase
          .from('candidate_answers')
          .select('id, candidate_id')
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;

        (data || []).forEach(row => allAnswers.push({ candidate_id: row.candidate_id }));

        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
        if (from > 500000) break;
      }

      // Count answers per candidate
      const answerCountMap: Record<string, number> = {};
      allAnswers.forEach(row => {
        answerCountMap[row.candidate_id] = (answerCountMap[row.candidate_id] || 0) + 1;
      });

      // Build result with coverage info
      const results: CandidateAnswerCoverage[] = (candidates || []).map(c => {
        const answerCount = answerCountMap[c.id] || 0;
        const percentage = totalQuestions ? Math.round((answerCount / totalQuestions) * 100) : 0;
        return {
          id: c.id,
          name: c.name,
          party: c.party,
          office: c.office,
          state: c.state,
          answerCount,
          totalQuestions: totalQuestions || 0,
          percentage,
        };
      });

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
  });
}

export function useCandidateAnswerStats() {
  return useQuery({
    queryKey: ['candidate-answer-stats'],
    queryFn: async () => {
      // Get total questions count
      const { count: totalQuestions, error: questionsError } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true });

      if (questionsError) throw questionsError;

      // Get all candidates count
      const { count: totalCandidates, error: candidatesError } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true });

      if (candidatesError) throw candidatesError;

      // Get all answers (paginated)
      const PAGE_SIZE = 1000;
      let from = 0;
      const allAnswers: Array<{ candidate_id: string }> = [];

      while (true) {
        const { data, error } = await supabase
          .from('candidate_answers')
          .select('id, candidate_id')
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;

        (data || []).forEach(row => allAnswers.push({ candidate_id: row.candidate_id }));

        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
        if (from > 500000) break;
      }

      // Count per candidate
      const answerCountMap: Record<string, number> = {};
      allAnswers.forEach(row => {
        answerCountMap[row.candidate_id] = (answerCountMap[row.candidate_id] || 0) + 1;
      });

      const candidatesWithAnswers = Object.keys(answerCountMap);
      const noAnswers = (totalCandidates || 0) - candidatesWithAnswers.length;
      const lowCoverage = candidatesWithAnswers.filter(id => {
        const count = answerCountMap[id];
        const pct = totalQuestions ? (count / totalQuestions) * 100 : 0;
        return pct > 0 && pct < 50;
      }).length;
      const fullCoverage = candidatesWithAnswers.filter(id => {
        const count = answerCountMap[id];
        return totalQuestions && count >= totalQuestions;
      }).length;

      return {
        totalCandidates: totalCandidates || 0,
        noAnswers,
        lowCoverage,
        fullCoverage,
        totalQuestions: totalQuestions || 0,
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
