import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { ScoreText } from '@/components/ScoreText';
import { RepComparisonSummary } from '@/components/RepComparisonSummary';
import { TransitionBadge } from '@/components/TransitionBadge';
import { useRepComparison, useGenerateRepComparison, isComparisonStale } from '@/hooks/useRepComparison';
import { useCandidateAnswers } from '@/hooks/useCandidateAnswers';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { CivicOfficial } from '@/hooks/useCivicOfficials';
import { normalizeOfficeName } from '@/lib/officeLabel';

interface RepresentativeComparisonCardProps {
  official: CivicOfficial;
  resolvedScore: number | null;
}

const getPartyColor = (party: string) => {
  switch (party) {
    case 'Democrat': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'Republican': return 'bg-red-500/10 text-red-600 border-red-500/20';
    case 'Independent': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
    default: return 'bg-muted text-muted-foreground';
  }
};

const getPartyBgColor = (party: string) => {
  if (party === 'Democrat') return 'bg-blue-600';
  if (party === 'Republican') return 'bg-red-600';
  return 'bg-purple-600';
};

const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

export function RepresentativeComparisonCard({ official, resolvedScore }: RepresentativeComparisonCardProps) {
  const { user } = useAuth();
  const hasImage = official.image_url && official.image_url.trim() !== '';
  const [isGeneratingDeep, setIsGeneratingDeep] = useState(false);

  // Fetch cached comparison
  const { data: comparison, isLoading: comparisonLoading } = useRepComparison(official.id);

  // Fetch rep's answers
  const { data: repAnswersRaw } = useCandidateAnswers(official.id);

  // Fetch user's quiz answers with question details
  const { data: userAnswersRaw } = useQuery({
    queryKey: ['user-quiz-answers-with-details', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('quiz_answers')
        .select(`
          question_id,
          value,
          questions:question_id (
            text,
            topics:topic_id (name)
          )
        `)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching user answers:', error);
        return [];
      }

      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  });

  // Transform answers to the format needed by the edge function
  const userAnswers = ((userAnswersRaw || []) as unknown as Array<{
    question_id: string;
    value: number;
    questions?: { text?: string; topics?: { name?: string } };
  }>).map((a) => ({
    question_id: a.question_id,
    value: a.value,
    question_text: a.questions?.text || '',
    topic_name: a.questions?.topics?.name || '',
  }));

  const repAnswers = (repAnswersRaw || []).map((a) => ({
    question_id: a.question_id,
    value: a.answer_value,
    source_type: a.source_type,
    source_url: a.source_url,
    source_description: a.source_description,
    question_text: a.question?.text || '',
    topic_name: a.question?.topics?.name || '',
  }));

  const generateMutation = useGenerateRepComparison();

  // Check if we have enough data to generate comparison
  const canGenerate = userAnswers.length > 0 && repAnswers.length > 0;

  // Check if comparison is stale
  const stale = comparison 
    ? isComparisonStale(comparison, userAnswers, repAnswers)
    : true;

  // Auto-generate comparison on mount if we don't have one and have the data
  useEffect(() => {
    if (user?.id && !comparison && canGenerate && !comparisonLoading && !generateMutation.isPending) {
      handleGenerateComparison(false);
    }
  }, [user?.id, comparison, canGenerate, comparisonLoading]);

  const handleGenerateComparison = useCallback(async (deep: boolean) => {
    if (!canGenerate) return;

    if (deep) setIsGeneratingDeep(true);

    try {
      await generateMutation.mutateAsync({
        candidateId: official.id,
        candidateName: official.name,
        candidateParty: official.party,
        candidateOffice: official.office,
        userAnswers,
        repAnswers,
        deepAnalysis: deep,
      });
    } catch (error) {
      // Swallow auth/session errors quietly so the page doesn't blank out
      console.error('Error generating comparison:', error);
    } finally {
      setIsGeneratingDeep(false);
    }
  }, [canGenerate, official, userAnswers, repAnswers, generateMutation]);

  const handleDigDeeper = () => {
    handleGenerateComparison(true);
  };

  const handleRefresh = () => {
    handleGenerateComparison(false);
  };

  return (
    <div className="rounded-lg border border-border hover:bg-secondary/30 transition-colors">
      <Link 
        to={`/candidate/${official.id}`}
        className="flex items-center gap-4 p-4"
      >
        <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
          {hasImage ? (
            <img 
              src={official.image_url} 
              alt={official.name} 
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = 'none';
                const fallback = target.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'flex';
              }}
            />
          ) : null}
          <div 
            className={cn("w-full h-full flex items-center justify-center", getPartyBgColor(official.party))}
            style={{ display: hasImage ? 'none' : 'flex' }}
          >
            <span className="text-white font-bold text-sm">{getInitials(official.name)}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-foreground line-clamp-2 break-words">{official.name}</h4>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">{normalizeOfficeName(official.office)}</span>
            <Badge variant="outline" className={cn("text-xs", getPartyColor(official.party))}>
              {official.party}
            </Badge>
            {official.transition_status && official.transition_status !== 'current' && (
              <TransitionBadge 
                status={official.transition_status as 'incoming' | 'outgoing' | 'current' | 'candidate'}
                newOffice={official.new_office}
              />
            )}
          </div>
        </div>
        {resolvedScore !== null ? (
          <ScoreText score={resolvedScore} size="md" />
        ) : (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            NA
          </Badge>
        )}
      </Link>

      {/* AI Comparison Summary */}
      {canGenerate ? (
        <div className="px-4 pb-4">
          <RepComparisonSummary
            summary={comparison?.summary || null}
            deepAnalysis={comparison?.deep_analysis || null}
            keyAgreements={comparison?.key_agreements || []}
            keyDisagreements={comparison?.key_disagreements || []}
            sources={comparison?.sources || []}
            isLoading={comparisonLoading}
            isGenerating={generateMutation.isPending || isGeneratingDeep}
            isStale={stale && !!comparison}
            onDigDeeper={handleDigDeeper}
            onRefresh={handleRefresh}
            hasDeepAnalysis={!!comparison?.deep_analysis}
          />
        </div>
      ) : userAnswers.length > 0 && repAnswers.length === 0 ? (
        <div className="px-4 pb-4">
          <p className="text-xs text-muted-foreground italic">
            AI analysis pending — position data is being researched for this official.
          </p>
        </div>
      ) : null}
    </div>
  );
}
