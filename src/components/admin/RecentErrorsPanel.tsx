import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertTriangle, ChevronDown, ChevronUp, Copy, Download, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

export interface AdminError {
  id: string;
  type: 'fec_id' | 'donors' | 'committees' | 'reconciliation' | 'ai_answers';
  candidateName: string;
  candidateId: string;
  message: string;
  timestamp: Date;
}

interface RecentErrorsPanelProps {
  errors: AdminError[];
  onClearErrors: () => void;
  onDismissError: (errorId: string) => void;
}

export function RecentErrorsPanel({ errors, onClearErrors, onDismissError }: RecentErrorsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const getTypeLabel = (type: AdminError['type']) => {
    switch (type) {
      case 'fec_id': return 'FEC ID';
      case 'donors': return 'Donors';
      case 'committees': return 'Committees';
      case 'reconciliation': return 'Reconciliation';
      case 'ai_answers': return 'AI Answers';
      default: return type;
    }
  };

  const getTypeColor = (type: AdminError['type']) => {
    switch (type) {
      case 'fec_id': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'donors': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'committees': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'reconciliation': return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
      case 'ai_answers': return 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const handleCopyErrors = useCallback(() => {
    const errorText = errors.map(e => 
      `[${e.timestamp.toISOString()}] ${getTypeLabel(e.type)} - ${e.candidateName}: ${e.message}`
    ).join('\n');
    navigator.clipboard.writeText(errorText);
    toast.success('Errors copied to clipboard');
  }, [errors]);

  const handleDownloadErrors = useCallback(() => {
    const errorJson = JSON.stringify(errors.map(e => ({
      ...e,
      timestamp: e.timestamp.toISOString(),
      typeLabel: getTypeLabel(e.type)
    })), null, 2);
    const blob = new Blob([errorJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-errors-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Errors downloaded');
  }, [errors]);

  if (errors.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="bg-destructive/5 border border-destructive/20 rounded-lg">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-3 hover:bg-destructive/10 transition-colors rounded-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-medium text-destructive">
                Recent Errors
              </span>
              <Badge variant="destructive" className="text-xs">
                {errors.length}
              </Badge>
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-2">
            <div className="flex items-center justify-end gap-2 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyErrors}
                className="h-7 text-xs"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownloadErrors}
                className="h-7 text-xs"
              >
                <Download className="h-3 w-3 mr-1" />
                Download
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearErrors}
                className="h-7 text-xs text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1">
              {errors.slice(0, 20).map(error => (
                <div 
                  key={error.id}
                  className="flex items-start gap-2 p-2 bg-background rounded border text-sm group"
                >
                  <Badge className={`text-[10px] shrink-0 ${getTypeColor(error.type)}`}>
                    {getTypeLabel(error.type)}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{error.candidateName}: </span>
                    <span className="text-muted-foreground">{error.message}</span>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(error.timestamp, { addSuffix: true })}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => onDismissError(error.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>

            {errors.length > 20 && (
              <div className="text-xs text-muted-foreground text-center pt-1">
                And {errors.length - 20} more errors...
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
