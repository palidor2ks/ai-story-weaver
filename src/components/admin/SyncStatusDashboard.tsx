import { useSyncStats, TopicCoverage, CandidateCoverage } from "@/hooks/useSyncStats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw, BarChart3, Users, FileText, HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";

function getPartyColor(party: string) {
  switch (party) {
    case "Democrat": return "text-blue-600 dark:text-blue-400";
    case "Republican": return "text-red-600 dark:text-red-400";
    case "Independent": return "text-purple-600 dark:text-purple-400";
    default: return "text-muted-foreground";
  }
}

function getPartyBadge(party: string) {
  switch (party) {
    case "Democrat": return "D";
    case "Republican": return "R";
    case "Independent": return "I";
    default: return "O";
  }
}

function getCoverageColor(percent: number) {
  if (percent >= 50) return "text-green-600 dark:text-green-400";
  if (percent >= 20) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function RepCoverageItem({ rep }: { rep: CandidateCoverage }) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 hover:bg-muted/50 rounded-md transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{rep.name}</span>
          <Badge variant="outline" className={`text-xs px-1.5 ${getPartyColor(rep.party)}`}>
            {getPartyBadge(rep.party)}
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground whitespace-nowrap">
          {rep.answerCount} / {rep.totalQuestions}
        </span>
        <div className="w-16">
          <Progress value={rep.coveragePercent} className="h-2" />
        </div>
        <span className={`font-medium w-14 text-right ${getCoverageColor(rep.coveragePercent)}`}>
          {rep.coveragePercent}%
        </span>
      </div>
    </div>
  );
}

function TopicCoverageItem({ topic }: { topic: TopicCoverage }) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 hover:bg-muted/50 rounded-md transition-colors">
      <span className="text-lg w-8">{topic.icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate">{topic.topicName}</span>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground whitespace-nowrap">
          {topic.totalActualAnswers.toLocaleString()} / {topic.totalPotentialAnswers.toLocaleString()}
        </span>
        <div className="w-16">
          <Progress value={topic.coveragePercent} className="h-2" />
        </div>
        <span className={`font-medium w-14 text-right ${getCoverageColor(topic.coveragePercent)}`}>
          {topic.coveragePercent}%
        </span>
      </div>
    </div>
  );
}

export function SyncStatusDashboard() {
  const { data: stats, isLoading, refetch, isRefetching } = useSyncStats();
  const [isTriggeringSync, setIsTriggeringSync] = useState(false);
  const [showAllReps, setShowAllReps] = useState(false);
  const [showAllTopics, setShowAllTopics] = useState(false);

  const handleManualSync = async () => {
    setIsTriggeringSync(true);
    try {
      const response = await fetch(
        'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/batch-populate-answers',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ybm56aW5qcmN5aWdhemVjY3RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyOTAwMjgsImV4cCI6MjA4MTg2NjAyOH0.hijd7BMAA5g-C4vH5OHkPbpsIu657ySbv84EWWdiaSI`,
          },
          body: JSON.stringify({ batchSize: 10 }),
        }
      );

      const result = await response.json();
      
      if (response.ok) {
        toast.success(`Synced ${result.processed || 0} candidates`, {
          description: `${result.remaining || 0} candidates remaining`,
        });
        refetch();
      } else {
        throw new Error(result.error || 'Sync failed');
      }
    } catch (error) {
      toast.error('Failed to trigger sync', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsTriggeringSync(false);
    }
  };

  if (isLoading || !stats) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const displayedReps = showAllReps ? stats.candidateCoverage : stats.candidateCoverage.slice(0, 15);
  const displayedTopics = showAllTopics ? stats.topicCoverage : stats.topicCoverage.slice(0, 10);
  const hasMoreReps = stats.candidateCoverage.length > 15;
  const hasMoreTopics = stats.topicCoverage.length > 10;

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Answer Coverage Dashboard
            </CardTitle>
            <CardDescription>
              Comprehensive view of representative answer data
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              {isRefetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button 
              size="sm"
              onClick={handleManualSync}
              disabled={isTriggeringSync}
            >
              {isTriggeringSync ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Run Batch
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="h-4 w-4" />
              Total Reps
            </div>
            <div className="text-2xl font-bold">{stats.totalCandidates.toLocaleString()}</div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <HelpCircle className="h-4 w-4" />
              Total Questions
            </div>
            <div className="text-2xl font-bold">{stats.totalQuestions.toLocaleString()}</div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <FileText className="h-4 w-4" />
              Potential Answers
            </div>
            <div className="text-2xl font-bold">{stats.totalPotentialAnswers.toLocaleString()}</div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <FileText className="h-4 w-4 text-green-600" />
              Actual Answers
            </div>
            <div className="text-2xl font-bold text-green-600">{stats.totalActualAnswers.toLocaleString()}</div>
          </div>
        </div>

        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Overall Coverage</span>
            <span className="font-medium">
              {stats.totalActualAnswers.toLocaleString()} / {stats.totalPotentialAnswers.toLocaleString()} answers
            </span>
          </div>
          <Progress value={stats.overallCoveragePercent} className="h-3" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className={getCoverageColor(stats.overallCoveragePercent)}>
              {stats.overallCoveragePercent}% complete
            </span>
            {stats.lastSyncTime && (
              <span>
                Last sync: {formatDistanceToNow(new Date(stats.lastSyncTime), { addSuffix: true })}
              </span>
            )}
          </div>
        </div>

        {/* Tabs for Rep vs Topic view */}
        <Tabs defaultValue="representatives" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="representatives">By Representative</TabsTrigger>
            <TabsTrigger value="topics">By Topic</TabsTrigger>
          </TabsList>

          <TabsContent value="representatives" className="mt-4">
            <div className="space-y-1">
              {displayedReps.map(rep => (
                <RepCoverageItem key={rep.candidateId} rep={rep} />
              ))}
            </div>
            {hasMoreReps && (
              <Button 
                variant="ghost" 
                className="w-full mt-2" 
                onClick={() => setShowAllReps(!showAllReps)}
              >
                {showAllReps ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-2" />
                    Show Less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-2" />
                    Show All ({stats.candidateCoverage.length} representatives)
                  </>
                )}
              </Button>
            )}
            {stats.candidateCoverage.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No representatives found
              </p>
            )}
          </TabsContent>

          <TabsContent value="topics" className="mt-4">
            <div className="space-y-1">
              {displayedTopics.map(topic => (
                <TopicCoverageItem key={topic.topicId} topic={topic} />
              ))}
            </div>
            {hasMoreTopics && (
              <Button 
                variant="ghost" 
                className="w-full mt-2" 
                onClick={() => setShowAllTopics(!showAllTopics)}
              >
                {showAllTopics ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-2" />
                    Show Less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-2" />
                    Show All ({stats.topicCoverage.length} topics)
                  </>
                )}
              </Button>
            )}
            {stats.topicCoverage.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No topics found
              </p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
