import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { CandidateAnswerCard } from './CandidateAnswerCard';
import { useCandidateAnswers, CandidateAnswer } from '@/hooks/useCandidateAnswers';
import { useUserTopicScores } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { FileText, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CandidatePositionsProps {
  candidateId: string;
  candidateName: string;
}

export const CandidatePositions = ({ candidateId, candidateName }: CandidatePositionsProps) => {
  const [showAll, setShowAll] = useState(false);
  const [topicFilter, setTopicFilter] = useState<string>('all');

  const { data: candidateAnswers = [], isLoading } = useCandidateAnswers(candidateId);
  
  // Get user's quiz answers to compare
  const { data: userQuizAnswers = [] } = useQuery({
    queryKey: ['user-quiz-answers-for-comparison'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('quiz_answers')
        .select('question_id, value')
        .eq('user_id', user.id);
      
      if (error) {
        console.error('Error fetching user answers:', error);
        return [];
      }
      return data;
    },
  });

  // Create a map of user answers for quick lookup
  const userAnswerMap = new Map(
    userQuizAnswers.map(a => [a.question_id, a.value])
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
  const highConfidence = candidateAnswers.filter(a => a.confidence === 'high').length;

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
            <p className="text-sm text-muted-foreground mt-1">
              Position data is being collected and will be added soon.
            </p>
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
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="secondary">{totalAnswers} positions</Badge>
            {sharedQuestions > 0 && (
              <Badge variant="outline" className="text-primary">
                {sharedQuestions} in common with you
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
          {displayedAnswers.map(answer => (
            <CandidateAnswerCard
              key={answer.id}
              answer={answer}
              userAnswer={userAnswerMap.get(answer.question_id) ?? null}
            />
          ))}
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
