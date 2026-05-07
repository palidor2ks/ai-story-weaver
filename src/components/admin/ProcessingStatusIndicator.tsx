import { Loader2, X, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import type { ProcessingJob } from '@/context/BackgroundProcessingContext';

interface ProcessingStatusIndicatorProps {
  jobs: ProcessingJob[];
  onClearJob: (candidateId: string) => void;
  onClearAll: () => void;
  onRetryJob?: (candidateId: string) => void;
  compact?: boolean;
}

export function ProcessingStatusIndicator({ 
  jobs, 
  onClearJob, 
  onClearAll,
  onRetryJob,
  compact = false
}: ProcessingStatusIndicatorProps) {
  if (jobs.length === 0) return null;

  const hasStalled = jobs.some(j => j.isStalled);

  return (
    <Card className={`border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20 ${hasStalled ? 'border-amber-300 dark:border-amber-700' : ''}`}>
      <CardContent className={compact ? "py-2 px-3" : "py-3 px-4"}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {hasStalled ? (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            )}
            <span className={`font-medium ${hasStalled ? 'text-amber-700 dark:text-amber-300' : 'text-blue-700 dark:text-blue-300'} ${compact ? 'text-xs' : 'text-sm'}`}>
              {hasStalled ? 'Research Stalled' : 'Background Research in Progress'}
            </span>
            <Badge variant="secondary" className="text-xs">
              {jobs.length} job{jobs.length > 1 ? 's' : ''}
            </Badge>
          </div>
          {jobs.length > 1 && (
            <Button variant="ghost" size="sm" onClick={onClearAll} className="h-6 text-xs">
              Clear All
            </Button>
          )}
        </div>
        
        <div className="space-y-2">
          {jobs.map((job) => {
            const elapsed = (Date.now() - job.startTime) / 60000;
            const hasRealProgress = job.completedCount > 0 || job.questionsQueued > 0;
            const realProgressPct = hasRealProgress 
              ? (job.completedCount / job.questionsQueued) * 100
              : 0;
            const timeProgressPct = Math.min(100, (elapsed / job.estimatedMinutes) * 100);
            const progressPct = Math.max(realProgressPct, timeProgressPct * 0.8);
            const remainingMinutes = Math.max(1, Math.ceil(job.estimatedMinutes - elapsed));
            
            return (
              <div key={job.candidateId} className="flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium truncate ${compact ? 'text-xs' : ''}`}>
                      {job.candidateName}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {job.completedCount}/{job.questionsQueued} question{job.questionsQueued !== 1 ? 's' : ''}
                    </span>
                    {job.isStalled ? (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                        Stalled
                      </Badge>
                    ) : job.completedCount > 0 && job.completedCount < job.questionsQueued ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    ) : null}
                  </div>
                  <Progress value={progressPct} className={`h-1.5 mt-1 ${job.isStalled ? '[&>div]:bg-amber-500' : ''}`} />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                  {job.isStalled ? (
                    onRetryJob && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-5 text-xs px-2 text-amber-600 border-amber-300"
                        onClick={() => onRetryJob(job.candidateId)}
                      >
                        Dismiss
                      </Button>
                    )
                  ) : (
                    <>
                      <Clock className="h-3 w-3" />
                      <span>~{remainingMinutes}m left</span>
                    </>
                  )}
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-5 w-5 p-0"
                  onClick={() => onClearJob(job.candidateId)}
                  title="Dismiss (job continues in background)"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
        
        <p className="text-xs text-muted-foreground mt-2">
          {hasStalled 
            ? 'Some jobs appear stalled. Dismiss and click "Regenerate Topics" to resume remaining questions.'
            : 'Using Perplexity sonar-deep-research. Processing in chunks of 5 questions. Auto-refresh every 15 seconds.'
          }
        </p>
      </CardContent>
    </Card>
  );
}
