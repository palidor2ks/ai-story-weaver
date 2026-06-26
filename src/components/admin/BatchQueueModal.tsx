import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Info } from 'lucide-react';

interface BatchCandidate {
  id: string;
  name: string;
  state: string;
  party?: string;
}

interface BatchQueueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  candidates: BatchCandidate[];
  totalAvailable: number;
  batchSize: number;
  orderingRule: string;
  onConfirm: () => void;
  onProcessNext?: () => void;
  isProcessing?: boolean;
}

export function BatchQueueModal({
  open,
  onOpenChange,
  title,
  description,
  candidates,
  totalAvailable,
  batchSize,
  orderingRule,
  onConfirm,
  onProcessNext,
  isProcessing = false
}: BatchQueueModalProps) {
  const hasMore = totalAvailable > batchSize;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded text-sm">
            <Info className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <span className="font-medium">Order: </span>
              <span className="text-muted-foreground">{orderingRule}</span>
            </div>
          </div>

          <div className="text-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">
                Processing {Math.min(batchSize, candidates.length)} of {totalAvailable} candidates
              </span>
              {hasMore && (
                <Badge variant="secondary" className="text-xs">
                  {totalAvailable - batchSize} remaining
                </Badge>
              )}
            </div>
          </div>

          <ScrollArea className="h-48 rounded border">
            <div className="p-2 space-y-1">
              {candidates.slice(0, batchSize).map((candidate, idx) => (
                <div 
                  key={candidate.id}
                  className="flex items-center gap-2 p-1.5 hover:bg-muted/50 rounded text-sm"
                >
                  <span className="text-muted-foreground w-6 text-right text-xs">
                    {idx + 1}.
                  </span>
                  <span className="flex-1 truncate">{candidate.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {candidate.state}
                  </Badge>
                </div>
              ))}
            </div>
          </ScrollArea>

          {hasMore && (
            <p className="text-xs text-muted-foreground">
              After this batch completes, you can process the next {Math.min(batchSize, totalAvailable - batchSize)} candidates.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {hasMore && onProcessNext && (
            <Button 
              variant="secondary" 
              onClick={onProcessNext}
              disabled={isProcessing}
            >
              Skip to Next {batchSize}
            </Button>
          )}
          <Button onClick={onConfirm} disabled={isProcessing}>
            {isProcessing ? 'Processing...' : `Process ${Math.min(batchSize, candidates.length)} Candidates`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
