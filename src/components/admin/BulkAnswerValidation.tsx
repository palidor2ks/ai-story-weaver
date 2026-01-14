import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

// Patterns indicating no evidence was found
const NO_EVIDENCE_PATTERNS = [
  /no evidence found/i,
  /no concrete evidence/i,
  /no documented position/i,
  /no direct evidence/i,
  /no specific position/i,
  /no publicly stated position/i,
  /unable to find.*evidence/i,
];

interface InconsistentAnswer {
  id: string;
  candidate_id: string;
  candidate_name: string;
  question_id: string;
  question_text: string;
  answer_value: number;
  source_description: string | null;
  evidence_type: string | null;
  relevance_flag: string | null;
  issue_type: 'no_evidence_with_score' | 'evidence_type_mismatch' | 'flagged';
}

export function BulkAnswerValidation() {
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { data: issues, isLoading, refetch } = useQuery({
    queryKey: ['answer-validation-issues'],
    queryFn: async () => {
      // Fetch answers with potential issues
      const { data: answers, error } = await supabase
        .from('candidate_answers')
        .select(`
          id, candidate_id, question_id, answer_value, 
          source_description, evidence_type, relevance_flag,
          candidates!inner(name),
          questions!inner(text)
        `)
        .or('relevance_flag.neq.null,evidence_type.eq.voting_record,evidence_type.eq.public_statement')
        .limit(500);

      if (error) throw error;
      if (!answers) return [];

      return answers.filter(a => {
        const desc = a.source_description || '';
        const hasNoEvidenceWithScore = NO_EVIDENCE_PATTERNS.some(p => p.test(desc)) && a.answer_value !== 0;
        const hasFlaggedIssue = a.relevance_flag === 'mismatch' || a.relevance_flag === 'needs_review';
        const hasVotingRecordWithoutVote = a.evidence_type === 'voting_record' && 
          !/voted|sponsored|cosponsored/i.test(desc);
        const hasStatementWithoutSource = a.evidence_type === 'public_statement' && 
          !/stated|said|announced|declared|wrote|posted/i.test(desc);
        
        return hasNoEvidenceWithScore || hasFlaggedIssue || hasVotingRecordWithoutVote || hasStatementWithoutSource;
      }).map(a => {
        const desc = a.source_description || '';
        let issue_type: 'no_evidence_with_score' | 'evidence_type_mismatch' | 'flagged' = 'flagged';
        
        if (NO_EVIDENCE_PATTERNS.some(p => p.test(desc)) && a.answer_value !== 0) {
          issue_type = 'no_evidence_with_score';
        } else if (a.relevance_flag === 'mismatch' || a.relevance_flag === 'needs_review') {
          issue_type = 'flagged';
        } else {
          issue_type = 'evidence_type_mismatch';
        }

        return {
          id: a.id,
          candidate_id: a.candidate_id,
          candidate_name: (a.candidates as any)?.name || 'Unknown',
          question_id: a.question_id,
          question_text: (a.questions as any)?.text || 'Unknown',
          answer_value: a.answer_value,
          source_description: a.source_description,
          evidence_type: a.evidence_type,
          relevance_flag: a.relevance_flag,
          issue_type,
        } as InconsistentAnswer;
      });
    }
  });

  const regenerateMutation = useMutation({
    mutationFn: async (answer: InconsistentAnswer) => {
      setProcessingId(answer.id);
      
      // Delete the answer first
      await supabase.from('candidate_answers')
        .delete()
        .eq('id', answer.id);
      
      // Trigger regeneration
      const { error } = await supabase.functions.invoke('get-candidate-answers', {
        body: { candidateId: answer.candidate_id, questionIds: [answer.question_id] }
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Answer regenerated');
      queryClient.invalidateQueries({ queryKey: ['answer-validation-issues'] });
      setProcessingId(null);
    },
    onError: (error) => {
      toast.error('Failed to regenerate: ' + (error as Error).message);
      setProcessingId(null);
    }
  });

  const bulkFixNoEvidenceMutation = useMutation({
    mutationFn: async () => {
      const toFix = issues?.filter(i => i.issue_type === 'no_evidence_with_score') || [];
      
      for (const answer of toFix) {
        await supabase.from('candidate_answers')
          .update({ 
            answer_value: 0, 
            evidence_type: 'inferred',
            source_urls: [],
            source_titles: []
          })
          .eq('id', answer.id);
      }
      
      return toFix.length;
    },
    onSuccess: (count) => {
      toast.success(`Fixed ${count} "no evidence" answers`);
      queryClient.invalidateQueries({ queryKey: ['answer-validation-issues'] });
    },
    onError: (error) => {
      toast.error('Bulk fix failed: ' + (error as Error).message);
    }
  });

  const bulkFixEvidenceTypesMutation = useMutation({
    mutationFn: async () => {
      const toFix = issues?.filter(i => i.issue_type === 'evidence_type_mismatch') || [];
      
      for (const answer of toFix) {
        await supabase.from('candidate_answers')
          .update({ 
            evidence_type: 'inferred'
          })
          .eq('id', answer.id);
      }
      
      return toFix.length;
    },
    onSuccess: (count) => {
      toast.success(`Fixed ${count} evidence type mismatches`);
      queryClient.invalidateQueries({ queryKey: ['answer-validation-issues'] });
    },
    onError: (error) => {
      toast.error('Bulk fix failed: ' + (error as Error).message);
    }
  });

  const issuesByType = {
    no_evidence_with_score: issues?.filter(i => i.issue_type === 'no_evidence_with_score') || [],
    evidence_type_mismatch: issues?.filter(i => i.issue_type === 'evidence_type_mismatch') || [],
    flagged: issues?.filter(i => i.issue_type === 'flagged') || [],
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const totalIssues = issues?.length || 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Bulk Answer Validation
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Identify and fix inconsistent answers across all candidates
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalIssues === 0 ? (
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              All Clear
            </Badge>
          ) : (
            <Badge variant="destructive">{totalIssues} issues</Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-amber-800">
                No Evidence + Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-amber-700">
                  {issuesByType.no_evidence_with_score.length}
                </span>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => bulkFixNoEvidenceMutation.mutate()}
                  disabled={bulkFixNoEvidenceMutation.isPending || issuesByType.no_evidence_with_score.length === 0}
                  className="border-amber-300 hover:bg-amber-100"
                >
                  {bulkFixNoEvidenceMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Bulk Fix → 0'
                  )}
                </Button>
              </div>
              <p className="text-xs text-amber-600 mt-1">
                Sets score to 0 and type to inferred
              </p>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-800">
                Evidence Type Mismatch
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-blue-700">
                  {issuesByType.evidence_type_mismatch.length}
                </span>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => bulkFixEvidenceTypesMutation.mutate()}
                  disabled={bulkFixEvidenceTypesMutation.isPending || issuesByType.evidence_type_mismatch.length === 0}
                  className="border-blue-300 hover:bg-blue-100"
                >
                  {bulkFixEvidenceTypesMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Fix Types'
                  )}
                </Button>
              </div>
              <p className="text-xs text-blue-600 mt-1">
                Claims voting_record but no votes cited
              </p>
            </CardContent>
          </Card>

          <Card className="border-red-200 bg-red-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-800">
                Flagged for Review
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-red-700">
                {issuesByType.flagged.length}
              </span>
              <p className="text-xs text-red-600 mt-1">
                Relevance mismatch or needs manual review
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Issue List */}
        {totalIssues > 0 && (
          <div className="space-y-2 max-h-96 overflow-y-auto border rounded-md p-2">
            {issues?.slice(0, 100).map(issue => (
              <div 
                key={issue.id} 
                className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
              >
                <AlertTriangle className={`h-4 w-4 shrink-0 ${
                  issue.issue_type === 'no_evidence_with_score' ? 'text-amber-500' :
                  issue.issue_type === 'evidence_type_mismatch' ? 'text-blue-500' : 'text-red-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{issue.candidate_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{issue.question_text}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="outline" className="text-xs">
                      Score: {issue.answer_value}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {issue.evidence_type || 'none'}
                    </Badge>
                    <Badge 
                      variant={issue.issue_type === 'flagged' ? 'destructive' : 'secondary'}
                      className="text-xs"
                    >
                      {issue.issue_type.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => regenerateMutation.mutate(issue)}
                  disabled={processingId === issue.id}
                  className="shrink-0"
                >
                  {processingId === issue.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))}
            {(issues?.length || 0) > 100 && (
              <p className="text-center text-sm text-muted-foreground py-2">
                Showing first 100 of {issues?.length} issues
              </p>
            )}
          </div>
        )}

        {totalIssues === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
            <p>All answers pass validation checks</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
