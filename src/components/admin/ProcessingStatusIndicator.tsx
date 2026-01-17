import { Loader2, X, Clock, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import type { ProcessingJob } from '@/context/BackgroundProcessingContext';

interface ProcessingStatusIndicatorProps {
  jobs: ProcessingJob[];
  onClearJob: (candidateId: string) => void;
  onClearAll: () => void;
  compact?: boolean;
}

export function ProcessingStatusIndicator({ 
  jobs, 
  onClearJob, 
  onClearAll,
  compact = false
}: ProcessingStatusIndicatorProps) {
  if (jobs.length === 0) return null;

  return (
    <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
      <CardContent className={compact ? "py-2 px-3" : "py-3 px-4"}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            <span className={`font-medium text-blue-700 dark:text-blue-300 ${compact ? 'text-xs' : 'text-sm'}`}>
              Background Research in Progress
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
            // Use real progress if available, otherwise fall back to time-based estimate
            const hasRealProgress = job.completedCount > 0 || job.questionsQueued > 0;
            const realProgressPct = hasRealProgress 
              ? (job.completedCount / job.questionsQueued) * 100
              : 0;
            const timeProgressPct = Math.min(100, (elapsed / job.estimatedMinutes) * 100);
            // Show whichever is higher (so progress never goes backwards)
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
                    {job.completedCount > 0 && job.completedCount < job.questionsQueued && (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    )}
                  </div>
                  <Progress value={progressPct} className="h-1.5 mt-1" />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                  <Clock className="h-3 w-3" />
                  <span>~{remainingMinutes}m left</span>
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
          Using Perplexity sonar-deep-research. Auto-refresh every 15 seconds.
        </p>
      </CardContent>
    </Card>
  );
}
