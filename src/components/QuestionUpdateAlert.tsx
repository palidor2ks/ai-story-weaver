import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  X, 
  ChevronDown, 
  ChevronUp,
  RefreshCw,
  ExternalLink 
} from 'lucide-react';
import { 
  QuestionUpdateNotification, 
  useQuestionUpdateNotifications, 
  useCandidateQuestionNotifications,
  useDismissNotification 
} from '@/hooks/useQuestionUpdateNotifications';
import { cn } from '@/lib/utils';

interface QuestionUpdateAlertProps {
  candidateId?: string;
  className?: string;
}

export function QuestionUpdateAlert({ candidateId, className }: QuestionUpdateAlertProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Use the appropriate hook based on whether this is for a user or candidate
  const { data: userNotifications = [] } = useQuestionUpdateNotifications();
  const { data: candidateNotifications = [] } = useCandidateQuestionNotifications(candidateId);
  
  const notifications = candidateId ? candidateNotifications : userNotifications;
  const dismissMutation = useDismissNotification();

  if (notifications.length === 0) {
    return null;
  }

  const handleDismiss = (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dismissMutation.mutate(notificationId);
  };

  const handleDismissAll = () => {
    notifications.forEach(n => dismissMutation.mutate(n.id));
  };

  const displayedNotifications = isExpanded ? notifications : notifications.slice(0, 2);

  return (
    <Alert 
      variant="default" 
      className={cn(
        "border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20",
        className
      )}
    >
      <AlertTriangle className="h-4 w-4 text-yellow-600" />
      <AlertTitle className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          Questions Updated
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
            {notifications.length}
          </Badge>
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismissAll}
            className="h-7 text-xs"
          >
            Dismiss All
          </Button>
        </div>
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-2">
        <p className="text-sm text-muted-foreground">
          {candidateId 
            ? "Some questions you've answered have been updated. Please review and update your responses."
            : "Some quiz questions you've answered have been updated. Consider retaking them for more accurate matching."
          }
        </p>
        
        <div className="space-y-2 mt-3">
          {displayedNotifications.map((notification) => (
            <div 
              key={notification.id}
              className="flex items-start gap-3 p-2 bg-background/80 rounded-lg border"
            >
              <RefreshCw className="h-4 w-4 mt-0.5 text-yellow-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium line-clamp-2">
                  {notification.new_question_text}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Changed from: "{notification.old_question_text.slice(0, 60)}..."
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                onClick={(e) => handleDismiss(notification.id, e)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>

        {notifications.length > 2 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full mt-2 h-7"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                Show {notifications.length - 2} More
              </>
            )}
          </Button>
        )}

        <div className="flex gap-2 mt-3">
          {candidateId ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/politician" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Update Answers
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link to="/quiz" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Retake Quiz
              </Link>
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
