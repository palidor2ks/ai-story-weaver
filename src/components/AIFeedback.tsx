import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ThumbsUp, ThumbsDown, Flag, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface AIFeedbackProps {
  candidateId: string;
  candidateName: string;
  contentType: 'ai_explanation' | 'stance';
  contentId?: string;
}

export const AIFeedback = ({ candidateId, candidateName, contentType, contentId }: AIFeedbackProps) => {
  const { toast } = useToast();
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFeedback = async (type: 'positive' | 'negative') => {
    if (feedback) return; // Already submitted
    
    setFeedback(type);
    // In a real app, you'd save this to the database
    toast({
      title: 'Thank you!',
      description: 'Your feedback helps improve our AI analysis.',
    });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Was this helpful?</span>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 w-7 p-0",
          feedback === 'positive' && "bg-green-100 text-green-700"
        )}
        onClick={() => handleFeedback('positive')}
        disabled={!!feedback}
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 w-7 p-0",
          feedback === 'negative' && "bg-red-100 text-red-700"
        )}
        onClick={() => handleFeedback('negative')}
        disabled={!!feedback}
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
};

interface ReportIssueButtonProps {
  candidateId: string;
  candidateName: string;
  issueContext?: string;
}

export const ReportIssueButton = ({ candidateId, candidateName, issueContext }: ReportIssueButtonProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [issueType, setIssueType] = useState<string>('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!issueType) {
      toast({
        title: 'Please select an issue type',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // In a real app, you'd save this to the database
      // For now, just simulate success
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast({
        title: 'Report submitted',
        description: 'Thank you for helping us improve. We\'ll review your report.',
      });
      
      setOpen(false);
      setIssueType('');
      setDescription('');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to submit report. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
          <Flag className="w-4 h-4" />
          Report an issue
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report an Issue</DialogTitle>
          <DialogDescription>
            Help us improve data accuracy for {candidateName}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Issue Type</Label>
            <Select value={issueType} onValueChange={setIssueType}>
              <SelectTrigger>
                <SelectValue placeholder="Select issue type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="incorrect_stance">Incorrect stance information</SelectItem>
                <SelectItem value="outdated_info">Outdated information</SelectItem>
                <SelectItem value="missing_candidate">Candidate missing</SelectItem>
                <SelectItem value="broken_link">Broken source link</SelectItem>
                <SelectItem value="wrong_office">Wrong office/district</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea
              placeholder="Provide additional details about the issue..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          {issueContext && (
            <div className="p-3 rounded-lg bg-secondary text-sm text-muted-foreground">
              <strong>Context:</strong> {issueContext}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Report'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
