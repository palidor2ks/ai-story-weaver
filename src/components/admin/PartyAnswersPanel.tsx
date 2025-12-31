import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Loader2, Plus, RefreshCw, CheckCircle2, ChevronDown, ChevronRight, FileText, Search } from 'lucide-react';
import { usePopulatePartyAnswers } from '@/hooks/usePopulatePartyAnswers';
import { usePartyAnswerStatsByTopic } from '@/hooks/usePartyAnswerStatsByTopic';

export function PartyAnswersPanel() {
  const { populateParty, populatePartyTopic, enrichPartySources, isLoading, isEnriching, isAnyLoading } = usePopulatePartyAnswers();
  const { data: partyStats, isLoading: statsLoading } = usePartyAnswerStatsByTopic();
  const [expandedParties, setExpandedParties] = useState<Record<string, boolean>>({});

  const toggleExpanded = (partyId: string) => {
    setExpandedParties(prev => ({ ...prev, [partyId]: !prev[partyId] }));
  };

  const getSourceBadgeColor = (percentage: number) => {
    if (percentage >= 70) return 'bg-green-600 text-white';
    if (percentage >= 40) return 'bg-amber-500 text-white';
    return 'bg-red-500 text-white';
  };

  const getSourceDotColor = (percentage: number) => {
    if (percentage >= 70) return 'bg-green-500';
    if (percentage >= 40) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Party Position Answers</CardTitle>
        <CardDescription>
          Generate AI-powered party position answers by topic. Each topic is processed independently to avoid timeouts and API rate limits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-muted/50 rounded-lg p-4 text-sm">
          <p className="font-medium mb-2">Scoring Scale:</p>
          <ul className="space-y-1 text-muted-foreground">
            <li>• <strong>-10</strong>: Far LEFT / Very progressive (Democrats, Greens)</li>
            <li>• <strong>0</strong>: Neutral / Centrist</li>
            <li>• <strong>+10</strong>: Far RIGHT / Very conservative (Republicans)</li>
          </ul>
        </div>

        {statsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {partyStats?.map((party) => {
              const isComplete = party.overallPercentage === 100;
              const loading = isLoading(party.partyId);
              const enriching = isEnriching(party.partyId);
              const isExpanded = expandedParties[party.partyId];
              const needsSources = party.overallSourcePercentage < 100 && party.totalAnswers > 0;

              return (
                <Collapsible
                  key={party.partyId}
                  open={isExpanded}
                  onOpenChange={() => toggleExpanded(party.partyId)}
                >
                  <div className="border rounded-lg overflow-hidden">
                    {/* Party Header */}
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <CollapsibleTrigger asChild>
                          <button className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <Badge
                              variant={isComplete ? "default" : "secondary"}
                              className={isComplete ? "bg-green-600" : ""}
                            >
                              {isComplete && <CheckCircle2 className="h-3 w-3 mr-1" />}
                              {party.overallPercentage}%
                            </Badge>
                            <Badge
                              variant="secondary"
                              className={getSourceBadgeColor(party.overallSourcePercentage)}
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              {party.overallSourcePercentage}% sourced
                            </Badge>
                            <div className="text-left">
                              <p className="font-medium">{party.partyName}</p>
                              <p className="text-sm text-muted-foreground">
                                {party.totalAnswers} / {party.totalQuestions} questions • {party.totalSourced} with sources
                              </p>
                            </div>
                          </button>
                        </CollapsibleTrigger>

                        <div className="flex gap-2">
                          {!isComplete && (
                            <Button
                              variant="default"
                              size="sm"
                              disabled={loading || enriching || isAnyLoading}
                              onClick={() => populateParty(party.partyId, false)}
                            >
                              {loading ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <Plus className="h-4 w-4 mr-2" />
                                  Fill All Missing
                                </>
                              )}
                            </Button>
                          )}

                          {needsSources && (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={loading || enriching || isAnyLoading}
                              onClick={() => enrichPartySources(party.partyId)}
                            >
                              {enriching ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Finding Sources...
                                </>
                              ) : (
                                <>
                                  <Search className="h-4 w-4 mr-2" />
                                  Fill Sources
                                </>
                              )}
                            </Button>
                          )}

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={loading || enriching || isAnyLoading}
                              >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Regenerate All
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Regenerate {party.partyName} Answers?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will use AI to regenerate ALL position answers for {party.partyName},
                                  replacing any existing answers. This may take several minutes.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => populateParty(party.partyId, true)}>
                                  Regenerate
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>

                      <Progress value={party.overallPercentage} className="h-2" />
                    </div>

                    {/* Topic Breakdown */}
                    <CollapsibleContent>
                      <div className="border-t bg-muted/30">
                        <div className="p-4 space-y-2">
                          <p className="text-sm font-medium text-muted-foreground mb-3">
                            Topics ({party.topics.length})
                          </p>
                          <div className="grid gap-2">
                            {party.topics.map((topic) => {
                              const topicComplete = topic.percentage === 100;
                              const topicLoading = isLoading(party.partyId, topic.topicId);
                              const topicEnriching = isEnriching(party.partyId, topic.topicId);
                              const topicNeedsSources = topic.sourcePercentage < 100 && topic.answerCount > 0;

                              return (
                                <div
                                  key={topic.topicId}
                                  className="flex items-center justify-between p-3 bg-background rounded-md border"
                                >
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <Badge
                                      variant={topicComplete ? "default" : "outline"}
                                      className={`shrink-0 ${topicComplete ? "bg-green-600" : ""}`}
                                    >
                                      {topicComplete && <CheckCircle2 className="h-3 w-3 mr-1" />}
                                      {topic.percentage}%
                                    </Badge>
                                    <div className="min-w-0 flex-1">
                                      <p className="font-medium text-sm truncate">{topic.topicName}</p>
                                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <span>{topic.answerCount} / {topic.totalQuestions} questions</span>
                                        <span>•</span>
                                        <span className="flex items-center gap-1">
                                          <span className={`w-2 h-2 rounded-full ${getSourceDotColor(topic.sourcePercentage)}`} />
                                          {topic.sourcedCount}/{topic.answerCount} sourced ({topic.sourcePercentage}%)
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex gap-1 shrink-0 ml-2">
                                    {!topicComplete && (
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={topicLoading || topicEnriching || isAnyLoading}
                                        onClick={() => populatePartyTopic(party.partyId, topic.topicId, false)}
                                        title="Fill missing answers"
                                      >
                                        {topicLoading ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <Plus className="h-3 w-3" />
                                        )}
                                        <span className="ml-1 hidden sm:inline">Fill</span>
                                      </Button>
                                    )}
                                    {topicNeedsSources && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={topicLoading || topicEnriching || isAnyLoading}
                                        onClick={() => enrichPartySources(party.partyId, topic.topicId)}
                                        title="Find sources for existing answers"
                                      >
                                        {topicEnriching ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <Search className="h-3 w-3" />
                                        )}
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={topicLoading || topicEnriching || isAnyLoading}
                                      onClick={() => populatePartyTopic(party.partyId, topic.topicId, true)}
                                      title="Regenerate all answers for topic"
                                    >
                                      {topicLoading ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <RefreshCw className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
