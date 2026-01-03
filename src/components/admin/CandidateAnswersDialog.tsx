import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePopulateCandidateAnswers } from '@/hooks/usePopulateCandidateAnswers';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, RefreshCw, CheckCircle2, XCircle, ChevronDown, ExternalLink, Sparkles, Vote, FileText, Globe, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getSourceInfo, getSourceBadgeClass } from '@/lib/sourceUtils';

interface CandidateAnswersDialogProps {
  candidateId: string;
  candidateName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TopicWithQuestions {
  topicId: string;
  topicName: string;
  icon: string;
  questions: QuestionAnswer[];
  answeredCount: number;
  sourcedCount: number;
}

interface QuestionAnswer {
  questionId: string;
  questionText: string;
  answerValue: number | null;
  confidence: string | null;
  sourceDescription: string | null;
  sourceUrls: string[] | null;
  sourceTitles: string[] | null;
  evidenceType: string | null;
  hasSource: boolean;
}

function getScoreLabel(value: number | null): string {
  if (value === null) return 'No answer';
  if (value <= -7) return 'Strong Progressive';
  if (value <= -4) return 'Progressive';
  if (value < 0) return 'Lean Progressive';
  if (value === 0) return 'Neutral/Center';
  if (value <= 3) return 'Lean Conservative';
  if (value <= 6) return 'Conservative';
  return 'Strong Conservative';
}

function getScoreBadge(value: number | null) {
  if (value === null) return { text: '—', className: 'bg-muted text-muted-foreground' };
  
  const absVal = Math.abs(value);
  const formatted = absVal % 1 === 0 ? absVal.toString() : absVal.toFixed(2);
  
  if (value < 0) return { text: `L${formatted}`, className: 'bg-flag-blue text-white' };
  if (value > 0) return { text: `R${formatted}`, className: 'bg-flag-red text-white' };
  return { text: 'C', className: 'bg-muted text-muted-foreground' };
}

function getConfidenceBadge(confidence: string | null) {
  if (!confidence) return { text: '—', className: 'text-muted-foreground' };
  switch (confidence.toLowerCase()) {
    case 'high': return { text: 'High', className: 'text-green-600 dark:text-green-400' };
    case 'medium': return { text: 'Medium', className: 'text-amber-600 dark:text-amber-400' };
    case 'low': return { text: 'Low', className: 'text-red-600 dark:text-red-400' };
    default: return { text: confidence, className: 'text-muted-foreground' };
  }
}

function getEvidenceBadge(evidenceType: string | null) {
  if (!evidenceType) return { text: 'Unknown', icon: Globe, className: 'bg-muted text-muted-foreground' };
  
  switch (evidenceType.toLowerCase()) {
    case 'voting_record':
      return { text: 'Floor Vote', icon: Vote, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' };
    case 'public_statement':
      return { text: 'Statement', icon: FileText, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' };
    case 'mixed':
      return { text: 'Mixed', icon: Globe, className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' };
    case 'inferred':
      return { text: 'Inferred', icon: Brain, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
    default:
      return { text: evidenceType, icon: Globe, className: 'bg-muted text-muted-foreground' };
  }
}

function useCandidateAnswersByTopic(candidateId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['candidate-answers-dialog', candidateId],
    queryFn: async (): Promise<TopicWithQuestions[]> => {
      const { data: topics, error: topicsError } = await supabase
        .from('topics')
        .select('id, name, icon')
        .order('name');
      if (topicsError) throw topicsError;

      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('id, text, topic_id');
      if (questionsError) throw questionsError;

      const { data: answers, error: answersError } = await supabase
        .from('candidate_answers')
        .select('question_id, answer_value, confidence, source_description, source_url, source_urls, source_titles, evidence_type')
        .eq('candidate_id', candidateId);
      if (answersError) throw answersError;

      const answerMap = new Map(
        (answers || []).map(a => [a.question_id, a])
      );

      return (topics || []).map(topic => {
        const topicQuestions = (questions || [])
          .filter(q => q.topic_id === topic.id)
          .map(q => {
            const answer = answerMap.get(q.id);
            const sourceUrls = answer?.source_urls || (answer?.source_url ? [answer.source_url] : null);
            const sourceTitles = (answer as any)?.source_titles || null;
            const evidenceType = (answer as any)?.evidence_type || null;
            
            // Fix hasSource to be truthful:
            // - Has source if we have actual source URLs
            // - OR if evidence_type is voting_record (floor votes or sponsored bills)
            // - NOT if it's just a long AI inference description
            const hasSource = (sourceUrls && sourceUrls.length > 0) || 
                              evidenceType === 'voting_record' ||
                              evidenceType === 'public_statement';
            
            return {
              questionId: q.id,
              questionText: q.text,
              answerValue: answer?.answer_value ?? null,
              confidence: answer?.confidence ?? null,
              sourceDescription: answer?.source_description ?? null,
              sourceUrls,
              sourceTitles,
              evidenceType,
              hasSource,
            };
          });

        const answeredCount = topicQuestions.filter(q => q.answerValue !== null).length;
        const sourcedCount = topicQuestions.filter(q => q.hasSource).length;

        return {
          topicId: topic.id,
          topicName: topic.name,
          icon: topic.icon,
          questions: topicQuestions,
          answeredCount,
          sourcedCount,
        };
      }).filter(t => t.questions.length > 0);
    },
    enabled,
    staleTime: 30000,
  });
}

function QuestionRow({ 
  question, 
  candidateId, 
  candidateName,
  isRegenerating,
  onRegenerate 
}: { 
  question: QuestionAnswer;
  candidateId: string;
  candidateName: string;
  isRegenerating: boolean;
  onRegenerate: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const scoreBadge = getScoreBadge(question.answerValue);
  const confidenceBadge = getConfidenceBadge(question.confidence);

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="border-b border-border/50 last:border-0">
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-3 py-3 px-4 hover:bg-muted/50 cursor-pointer transition-colors">
            <ChevronDown className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              isExpanded && "rotate-180"
            )} />
            
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-snug">{question.questionText}</p>
            </div>

            {(() => {
              const evidenceBadge = getEvidenceBadge(question.evidenceType);
              const EvidenceIcon = evidenceBadge.icon;
              return (
                <Badge variant="outline" className={cn('text-xs px-2 py-0.5 shrink-0 gap-1', evidenceBadge.className)}>
                  <EvidenceIcon className="h-3 w-3" />
                  {evidenceBadge.text.split(' ')[0]}
                </Badge>
              );
            })()}

            <Badge variant="outline" className={cn('text-xs px-2 py-0.5 shrink-0', scoreBadge.className)}>
              {scoreBadge.text}
            </Badge>

            {question.hasSource ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            ) : question.answerValue !== null ? (
              <XCircle className="h-4 w-4 text-red-500 shrink-0" />
            ) : (
              <div className="w-4 h-4 shrink-0" />
            )}

            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onRegenerate();
              }}
              disabled={isRegenerating}
            >
              {isRegenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 pt-1 ml-7 space-y-3 bg-muted/30 rounded-b-md">
            {/* Score and Confidence */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Score:</span>
                <Badge variant="outline" className={cn('text-xs', scoreBadge.className)}>
                  {scoreBadge.text}
                </Badge>
                <span className="text-muted-foreground">({getScoreLabel(question.answerValue)})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Confidence:</span>
                <span className={cn('font-medium', confidenceBadge.className)}>
                  {confidenceBadge.text}
                </span>
              </div>
            </div>

            {/* AI Explanation */}
            {question.sourceDescription && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  AI Explanation
                </p>
                <p className="text-sm text-foreground/90 leading-relaxed">
                  {question.sourceDescription}
                </p>
              </div>
            )}

            {/* Source URLs */}
            {question.sourceUrls && question.sourceUrls.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Sources</p>
                <div className="flex flex-wrap gap-2">
                  {question.sourceUrls.map((url, idx) => {
                    const title = question.sourceTitles?.[idx];
                    const sourceInfo = getSourceInfo(url, title);
                    return (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border transition-colors hover:opacity-80",
                          getSourceBadgeClass(sourceInfo.type)
                        )}
                      >
                        <ExternalLink className="h-3 w-3" />
                        {sourceInfo.displayName}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {!question.sourceDescription && !question.sourceUrls?.length && (
              <p className="text-sm text-muted-foreground italic">
                No AI explanation or sources available
              </p>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function CandidateAnswersDialog({ 
  candidateId, 
  candidateName, 
  open, 
  onOpenChange 
}: CandidateAnswersDialogProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [regeneratingTopicId, setRegeneratingTopicId] = useState<string | null>(null);
  const { data: topics, isLoading, refetch } = useCandidateAnswersByTopic(candidateId, open);
  const { populateCandidateQuestion, isQuestionLoading } = usePopulateCandidateAnswers();

  const handleRegenerateQuestion = async (questionId: string) => {
    await populateCandidateQuestion(candidateId, questionId, candidateName);
    refetch();
  };

  const handleRegenerateTopic = async (topicId: string, topicName: string, questions: QuestionAnswer[]) => {
    setRegeneratingTopicId(topicId);
    toast.info(`Regenerating all answers for ${topicName}...`);
    
    // Regenerate each question in the topic sequentially
    for (const question of questions) {
      await populateCandidateQuestion(candidateId, question.questionId, candidateName);
    }
    
    refetch();
    setRegeneratingTopicId(null);
    toast.success(`Finished regenerating ${topicName} answers`);
  };

  const selectedTopic = topics?.find(t => t.topicId === selectedTopicId) || topics?.[0];

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl h-[80vh]">
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span className="text-muted-foreground">Loading answers...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const totalAnswered = topics?.reduce((sum, t) => sum + t.answeredCount, 0) || 0;
  const totalQuestions = topics?.reduce((sum, t) => sum + t.questions.length, 0) || 0;
  const totalSourced = topics?.reduce((sum, t) => sum + t.sourcedCount, 0) || 0;
  const sourcePercentage = totalAnswered > 0 ? Math.round((totalSourced / totalAnswered) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <div>
              <span className="text-lg font-semibold">{candidateName}</span>
              <span className="text-sm font-normal text-muted-foreground ml-3">
                Answer Management
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm font-normal">
              <span className="text-muted-foreground">
                {totalAnswered}/{totalQuestions} answered
              </span>
              <Badge variant={sourcePercentage >= 70 ? 'default' : sourcePercentage >= 40 ? 'secondary' : 'destructive'}>
                {totalSourced} sourced ({sourcePercentage}%)
              </Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Topic Sidebar */}
          <div className="w-72 border-r shrink-0 flex flex-col">
            <div className="px-4 py-3 border-b bg-muted/30">
              <h3 className="text-sm font-medium">Topics</h3>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {topics?.map(topic => {
                  const isSelected = topic.topicId === (selectedTopic?.topicId);
                  const sourcePercent = topic.answeredCount > 0 
                    ? Math.round((topic.sourcedCount / topic.answeredCount) * 100) 
                    : 0;

                  return (
                    <button
                      key={topic.topicId}
                      onClick={() => setSelectedTopicId(topic.topicId)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors",
                        isSelected 
                          ? "bg-primary/10 text-primary border border-primary/20" 
                          : "hover:bg-muted/50"
                      )}
                    >
                      <span className="text-lg shrink-0">{topic.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{topic.topicName}</p>
                        <p className="text-xs text-muted-foreground">
                          {topic.answeredCount}/{topic.questions.length} answered
                          {topic.answeredCount > 0 && (
                            <span className={cn(
                              "ml-1",
                              sourcePercent >= 70 ? "text-green-600" : 
                              sourcePercent >= 40 ? "text-amber-600" : "text-red-600"
                            )}>
                              · {sourcePercent}% sourced
                            </span>
                          )}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Questions Panel */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedTopic && (
              <>
                <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{selectedTopic.icon}</span>
                    <h3 className="text-sm font-medium">{selectedTopic.topicName}</h3>
                    <span className="text-xs text-muted-foreground">
                      ({selectedTopic.answeredCount}/{selectedTopic.questions.length} answered)
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRegenerateTopic(selectedTopic.topicId, selectedTopic.topicName, selectedTopic.questions)}
                    disabled={regeneratingTopicId === selectedTopic.topicId}
                  >
                    {regeneratingTopicId === selectedTopic.topicId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Regenerate Topic
                  </Button>
                </div>
                <ScrollArea className="flex-1">
                  <div className="divide-y divide-border/50">
                    {selectedTopic.questions.map(question => (
                      <QuestionRow
                        key={question.questionId}
                        question={question}
                        candidateId={candidateId}
                        candidateName={candidateName}
                        isRegenerating={isQuestionLoading(candidateId, question.questionId)}
                        onRegenerate={() => handleRegenerateQuestion(question.questionId)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}