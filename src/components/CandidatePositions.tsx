import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CandidateAnswerCard } from './CandidateAnswerCard';
import { 
  useCandidateAnswers, 
  useGenerateCandidateAnswers,
  CandidateAnswer 
} from '@/hooks/useCandidateAnswers';
import { useUserTopicScores } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { FileText, ChevronDown, ChevronUp, Filter, Sparkles, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CandidatePositionsProps {
  candidateId: string;
  candidateName: string;
  isUserRep?: boolean; // Whether this candidate is one of the user's representatives
}

export const CandidatePositions = ({ candidateId, candidateName, isUserRep = false }: CandidatePositionsProps) => {
  const [showAll, setShowAll] = useState(false);
  const [topicFilter, setTopicFilter] = useState<string>('all');

  const { data: candidateAnswers = [], isLoading, refetch } = useCandidateAnswers(candidateId);
  const generateAnswers = useGenerateCandidateAnswers();
  
  // Get user's quiz answers to compare (with option text)
  const { data: userQuizAnswers = [] } = useQuery({
    queryKey: ['user-quiz-answers-for-comparison'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('quiz_answers')
        .select(`
          question_id, 
          value,
          selected_option:question_options (
            id,
            text,
            value
          )
        `)
        .eq('user_id', user.id);
      
      if (error) {
        console.error('Error fetching user answers:', error);
        return [];
      }
      return data as Array<{
        question_id: string;
        value: number;
        selected_option: { id: string; text: string; value: number } | null;
      }>;
    },
  });

  // Create a map of user answers for quick lookup
  const userAnswerMap = new Map(
    userQuizAnswers.map(a => [a.question_id, { value: a.value, text: a.selected_option?.text || null }])
  );

  // Get unique topics from answers
  const topics = [...new Set(
    candidateAnswers
      .filter(a => a.question?.topics?.name)
      .map(a => a.question!.topics!.name)
  )].sort();

  // Filter answers by topic
  const filteredAnswers = topicFilter === 'all' 
    ? candidateAnswers 
    : candidateAnswers.filter(a => a.question?.topics?.name === topicFilter);

  // Show limited or all
  const displayedAnswers = showAll ? filteredAnswers : filteredAnswers.slice(0, 6);

  // Calculate stats
  const totalAnswers = candidateAnswers.length;
  const sharedQuestions = candidateAnswers.filter(a => userAnswerMap.has(a.question_id)).length;
  const userQuestionIds = userQuizAnswers.map(a => a.question_id);
  const highConfidence = candidateAnswers.filter(a => a.confidence === 'high').length;
  const aiGenerated = candidateAnswers.filter(a => a.source_type === 'other').length;

  const handleGeneratePositions = async () => {
    await generateAnswers.mutateAsync({ 
      candidateId, 
      questionIds: userQuestionIds.length > 0 ? userQuestionIds : undefined 
    });
    refetch();
  };

  if (isLoading) {
    return (
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Positions & Sources
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (candidateAnswers.length === 0) {
    return (
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Positions & Sources
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">
              No documented positions available for {candidateName} yet.
            </p>
            {isUserRep && (
              <>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Since this is your representative, we can use AI to research their likely positions.
                </p>
                <Button
                  onClick={handleGeneratePositions}
                  disabled={generateAnswers.isPending}
                  className="gap-2"
                >
                  {generateAnswers.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Researching...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate Positions with AI
                    </>
                  )}
                </Button>
              </>
            )}
            {!isUserRep && (
              <p className="text-sm text-muted-foreground mt-1">
                Position data is being collected and will be added soon.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-elevated">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="font-display flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Positions & Sources
          </CardTitle>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <Badge variant="secondary">{totalAnswers} positions</Badge>
            {sharedQuestions > 0 && (
              <Badge variant="outline" className="text-primary">
                {sharedQuestions} in common with you
              </Badge>
            )}
            {aiGenerated > 0 && (
              <Badge variant="outline" className="text-purple-600 bg-purple-50">
                <Sparkles className="w-3 h-3 mr-1" />
                {aiGenerated} AI-researched
              </Badge>
            )}
            <Badge variant="outline" className={cn(
              highConfidence > totalAnswers / 2 ? 'text-green-600' : 'text-amber-600'
            )}>
              {Math.round((highConfidence / totalAnswers) * 100)}% verified
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Generate More Button for User's Reps */}
        {isUserRep && userQuizAnswers.length > sharedQuestions && (
          <div className="mb-4 p-3 rounded-lg bg-purple-50 border border-purple-200">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-purple-700">
                <Sparkles className="w-4 h-4 inline mr-1" />
                {userQuizAnswers.length - sharedQuestions} of your questions don&apos;t have answers for this rep yet.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGeneratePositions}
                disabled={generateAnswers.isPending}
                className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-100"
              >
                {generateAnswers.isPending ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Researching...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3" />
                    Generate Missing Positions
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Topic Filter */}
        {topics.length > 1 && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Button
              variant={topicFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTopicFilter('all')}
              className="text-xs"
            >
              All Topics
            </Button>
            {topics.map(topic => (
              <Button
                key={topic}
                variant={topicFilter === topic ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTopicFilter(topic)}
                className="text-xs"
              >
                {topic}
              </Button>
            ))}
          </div>
        )}

        {/* Answers Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {displayedAnswers.map(answer => {
            const userData = userAnswerMap.get(answer.question_id);
            return (
              <CandidateAnswerCard
                key={answer.id}
                answer={answer}
                userAnswer={userData?.value ?? null}
                userAnswerText={userData?.text ?? null}
              />
            );
          })}
        </div>

        {/* Show More/Less */}
        {filteredAnswers.length > 6 && (
          <Button
            variant="ghost"
            className="w-full mt-4 gap-2"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Show All {filteredAnswers.length} Positions
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
