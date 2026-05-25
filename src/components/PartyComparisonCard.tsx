import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreText } from '@/components/ScoreText';
import { RepComparisonSummary } from '@/components/RepComparisonSummary';
import { usePartyComparison, useGeneratePartyComparison, isPartyComparisonStale } from '@/hooks/usePartyComparison';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

interface PartyComparisonCardProps {
  partyId: string;
  partyName: string;
  score: number | null | undefined;
  overallScore?: number | null | undefined;
  isLoading?: boolean;
}

const partyStyles: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  democrat: {
    bg: 'bg-blue-500/5',
    border: 'border-blue-500/20 hover:border-blue-500/40',
    text: 'text-blue-600',
    icon: 'text-blue-600',
  },
  republican: {
    bg: 'bg-red-500/5',
    border: 'border-red-500/20 hover:border-red-500/40',
    text: 'text-red-600',
    icon: 'text-red-600',
  },
  green: {
    bg: 'bg-green-500/5',
    border: 'border-green-500/20 hover:border-green-500/40',
    text: 'text-green-600',
    icon: 'text-green-600',
  },
  libertarian: {
    bg: 'bg-yellow-500/5',
    border: 'border-yellow-500/20 hover:border-yellow-500/40',
    text: 'text-yellow-600',
    icon: 'text-yellow-600',
  },
};

export function PartyComparisonCard({ partyId, partyName, score, isLoading = false }: PartyComparisonCardProps) {
  const { user } = useAuth();
  const styles = partyStyles[partyId] || partyStyles.democrat;

  // Fetch cached comparison
  const { data: comparison, isLoading: comparisonLoading } = usePartyComparison(partyId);

  // Fetch user's quiz answers
  const { data: userAnswers = [] } = useQuery({
    queryKey: ['quiz-answers-with-questions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('quiz_answers')
        .select(`
          question_id,
          value,
          selected_option_id,
          questions!inner (
            text,
            topics!inner (name)
          ),
          question_options!quiz_answers_selected_option_id_fkey (
            is_skip_option
          )
        `)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching user answers:', error);
        return [];
      }

      return data.map((a: any) => ({
        question_id: a.question_id,
        value: a.value,
        question_text: a.questions.text,
        topic_name: a.questions.topics.name,
        is_skipped: a.question_options?.is_skip_option ?? false,
      }));
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  });

  // Fetch party's answers
  const { data: partyAnswers = [] } = useQuery({
    queryKey: ['party-answers-with-questions', partyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('party_answers')
        .select(`
          question_id,
          answer_value,
          source_url,
          source_description,
          questions!inner (
            text,
            topics!inner (name)
          )
        `)
        .eq('party_id', partyId);

      if (error) {
        console.error('Error fetching party answers:', error);
        return [];
      }

      return data.map((a: any) => ({
        question_id: a.question_id,
        value: a.answer_value,
        source_url: a.source_url,
        source_description: a.source_description,
        question_text: a.questions.text,
        topic_name: a.questions.topics.name,
      }));
    },
    enabled: !!partyId,
    staleTime: 1000 * 60 * 10,
  });

  // Generate comparison mutation
  const generateComparison = useGeneratePartyComparison();

  // Check if stale
  const isStale = useMemo(() => {
    return isPartyComparisonStale(comparison ?? null, userAnswers, partyAnswers);
  }, [comparison, userAnswers, partyAnswers]);

  // Auto-generate on mount if no comparison exists and we have answers
  useEffect(() => {
    if (
      user?.id &&
      !comparisonLoading &&
      !comparison &&
      !generateComparison.isPending &&
      userAnswers.length > 0 &&
      partyAnswers.length > 0
    ) {
      generateComparison.mutate({
        partyId,
        partyName,
        userAnswers,
        partyAnswers,
        deepAnalysis: false,
      });
    }
  }, [user?.id, comparisonLoading, comparison, userAnswers.length, partyAnswers.length]);

  const handleRefresh = () => {
    if (userAnswers.length > 0 && partyAnswers.length > 0) {
      generateComparison.mutate({
        partyId,
        partyName,
        userAnswers,
        partyAnswers,
        deepAnalysis: false,
      });
    }
  };

  const handleDigDeeper = () => {
    if (userAnswers.length > 0 && partyAnswers.length > 0) {
      generateComparison.mutate({
        partyId,
        partyName,
        userAnswers,
        partyAnswers,
        deepAnalysis: true,
      });
    }
  };

  return (
    <div className={cn('p-4 rounded-xl border transition-colors', styles.bg, styles.border)}>
      {/* Header with party name and score */}
      <Link to={`/party/${partyId}`} className="block">
        <div className="flex items-center gap-2 mb-2">
          <Building2 className={cn('w-4 h-4', styles.icon)} />
          <span className={cn('font-semibold text-sm', styles.text)}>{partyName}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="w-3 h-3 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="font-medium mb-1">L = Left, R = Right</p>
              <p className="text-sm">
                This score shows the {partyName} Party's average position{' '}
                <strong>only on the questions you've answered</strong>. Answer more quiz questions to refine this comparison.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className={cn('text-2xl font-bold', styles.text)}>
          {isLoading ? <Skeleton className="h-8 w-12" /> : <ScoreText score={score} size="md" />}
        </div>
      </Link>

      {/* AI Comparison Summary */}
          <RepComparisonSummary
            summary={comparison?.summary ?? null}
            deepAnalysis={comparison?.deep_analysis ?? null}
            keyAgreements={[]}
            keyDisagreements={[]}
        sources={comparison?.sources ?? []}
        isLoading={comparisonLoading}
        isGenerating={generateComparison.isPending}
        isStale={isStale && !!comparison}
        onDigDeeper={handleDigDeeper}
        onRefresh={handleRefresh}
        hasDeepAnalysis={!!comparison?.deep_analysis}
      />
    </div>
  );
}
