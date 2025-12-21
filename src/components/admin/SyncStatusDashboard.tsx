import { useSyncStats, TopicCoverage } from "@/hooks/useSyncStats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Database, Clock, FileText, Users, CheckCircle2, AlertCircle, BarChart3 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";

function TopicCoverageItem({ topic }: { topic: TopicCoverage }) {
  const getCoverageColor = (percent: number) => {
    if (percent >= 80) return "text-green-600";
    if (percent >= 50) return "text-amber-600";
    return "text-red-600";
  };

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-lg w-8">{topic.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium truncate">{topic.topicName}</span>
          <span className={`text-sm font-bold ${getCoverageColor(topic.coveragePercent)}`}>
            {topic.coveragePercent}%
          </span>
        </div>
        <Progress value={topic.coveragePercent} className="h-2" />
        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
          <span>{topic.answeredQuestions} / {topic.totalQuestions} questions</span>
          <span>{topic.candidatesWithAnswers} candidates</span>
        </div>
      </div>
    </div>
  );
}

export function SyncStatusDashboard() {
  const { data: stats, isLoading, refetch, isRefetching } = useSyncStats();
  const [isTriggeringSync, setIsTriggeringSync] = useState(false);

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

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  const syncProgress = stats.totalCandidates > 0 
    ? (stats.syncedCandidates / stats.totalCandidates) * 100 
    : 0;

  return (
    <div className="space-y-6 mb-8">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                Answer Sync Status
              </CardTitle>
              <CardDescription>
                Automated population of candidate answers from Congress.gov
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
                disabled={isTriggeringSync || stats.pendingCandidates === 0}
              >
                {isTriggeringSync ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Run Batch Now
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Sync Progress</span>
              <span className="font-medium">
                {stats.syncedCandidates} / {stats.totalCandidates} candidates
              </span>
            </div>
            <Progress value={syncProgress} className="h-3" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{syncProgress.toFixed(1)}% complete</span>
              {stats.pendingCandidates > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  {stats.pendingCandidates} pending
                </span>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Users className="h-4 w-4" />
                Total Candidates
              </div>
              <div className="text-2xl font-bold">{stats.totalCandidates}</div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                With Answers
              </div>
              <div className="text-2xl font-bold text-green-600">{stats.candidatesWithAnswers}</div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <FileText className="h-4 w-4" />
                Total Answers
              </div>
              <div className="text-2xl font-bold">{stats.totalAnswers.toLocaleString()}</div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <FileText className="h-4 w-4" />
                Avg per Candidate
              </div>
              <div className="text-2xl font-bold">{stats.avgAnswersPerCandidate}</div>
            </div>
          </div>

          {/* Timing Info */}
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Last sync:</span>
              {stats.lastSyncTime ? (
                <Badge variant="outline">
                  {formatDistanceToNow(new Date(stats.lastSyncTime), { addSuffix: true })}
                </Badge>
              ) : (
                <Badge variant="secondary">Never</Badge>
              )}
            </div>

            {stats.pendingCandidates > 0 && (
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <span className="text-muted-foreground">Next up:</span>
                <Badge variant="outline" className="text-amber-600 border-amber-600/30">
                  {stats.oldestPendingCandidate}
                </Badge>
              </div>
            )}

            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Schedule:</span>
              <Badge variant="secondary">Every 6 hours</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Topic Coverage Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Answer Coverage by Topic
          </CardTitle>
          <CardDescription>
            Question coverage across all policy topics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 divide-y md:divide-y-0">
            {stats.topicCoverage.map((topic, index) => (
              <div key={topic.topicId} className={index > 0 ? "md:border-t-0 border-t border-border pt-2 md:pt-0" : ""}>
                <TopicCoverageItem topic={topic} />
              </div>
            ))}
          </div>
          {stats.topicCoverage.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No topics found
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
