import { useState } from 'react';
import { useFlaggedAnswers, useUpdateRelevanceFlag, useScanEvidenceRelevance, validateEvidenceRelevance } from '@/hooks/useEvidenceReview';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, RefreshCw, Search, AlertTriangle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EvidenceReviewPanel() {
  const { data: flaggedAnswers, isLoading, refetch } = useFlaggedAnswers();
  const updateFlag = useUpdateRelevanceFlag();
  const scanMutation = useScanEvidenceRelevance();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleMarkVerified = (answerId: string) => {
    updateFlag.mutate({ answerId, flag: 'verified' });
  };

  const handleMarkInvalid = (answerId: string) => {
    updateFlag.mutate({ answerId, flag: 'invalid' });
  };

  const handleScan = () => {
    scanMutation.mutate({ limit: 500 });
  };

  const getScoreColor = (value: number) => {
    if (value <= -5) return 'text-rose-600';
    if (value >= 5) return 'text-sky-600';
    return 'text-muted-foreground';
  };

  const getScoreLabel = (value: number) => {
    switch (value) {
      case -10: return 'Strong Con';
      case -5: return 'Lean Con';
      case 0: return 'Neutral';
      case 5: return 'Lean Pro';
      case 10: return 'Strong Pro';
      default: return String(value);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const answers = flaggedAnswers || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Evidence Review
              {answers.length > 0 && (
                <Badge variant="secondary">{answers.length} flagged</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Review answers where evidence may not match the question topic
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            <Button 
              size="sm" 
              onClick={handleScan}
              disabled={scanMutation.isPending}
            >
              {scanMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-1" />
              )}
              Scan All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {answers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <p className="text-lg font-medium">No flagged answers</p>
            <p className="text-sm">All evidence appears to match question topics</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={handleScan}
              disabled={scanMutation.isPending}
            >
              Run Full Scan
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {answers.map((answer) => {
              const validation = validateEvidenceRelevance(
                answer.question_id,
                answer.question_text || '',
                answer.source_description
              );
              const isExpanded = expandedId === answer.id;

              return (
                <div 
                  key={answer.id} 
                  className="border rounded-lg p-4 space-y-3 hover:bg-muted/30 transition-colors"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{answer.candidate_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {answer.candidate_party}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {answer.topic_name}
                        </Badge>
                        <Badge 
                          variant={answer.relevance_flag === 'mismatch' ? 'destructive' : 'outline'}
                          className="text-xs"
                        >
                          {answer.relevance_flag}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMarkVerified(answer.id)}
                        disabled={updateFlag.isPending}
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Verified
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMarkInvalid(answer.id)}
                        disabled={updateFlag.isPending}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Invalid
                      </Button>
                    </div>
                  </div>

                  {/* Question */}
                  <div className="bg-muted/50 rounded-md p-3">
                    <div className="text-xs text-muted-foreground mb-1">QUESTION</div>
                    <div className="text-sm">{answer.question_text}</div>
                    {validation.missingKeywords.length > 0 && (
                      <div className="mt-2">
                        <span className="text-xs text-muted-foreground">Expected keywords: </span>
                        {validation.missingKeywords.slice(0, 5).map((kw, i) => (
                          <Badge key={i} variant="outline" className="text-xs mr-1 text-amber-600 border-amber-300">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Evidence */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-muted-foreground">EVIDENCE</div>
                      <Badge variant="outline" className="text-xs">
                        {answer.source_type || 'unknown'}
                      </Badge>
                      <div className={cn('text-sm font-medium', getScoreColor(answer.answer_value))}>
                        {getScoreLabel(answer.answer_value)} ({answer.answer_value})
                      </div>
                    </div>
                    <div 
                      className={cn(
                        'text-sm bg-card border rounded-md p-3',
                        !validation.isRelevant && 'border-amber-300 bg-amber-50/50'
                      )}
                    >
                      {answer.source_description || 'No description'}
                      
                      {validation.foundKeywords.length > 0 && (
                        <div className="mt-2">
                          <span className="text-xs text-muted-foreground">Found: </span>
                          {validation.foundKeywords.map((kw, i) => (
                            <Badge key={i} variant="outline" className="text-xs mr-1 text-green-600 border-green-300">
                              {kw}
                            </Badge>
                          ))}
                        </div>
                      )}
                      
                      {!validation.isRelevant && (
                        <div className="mt-2 flex items-center gap-1 text-amber-600 text-xs">
                          <AlertTriangle className="h-3 w-3" />
                          No topic keywords found in evidence
                        </div>
                      )}
                    </div>
                    
                    {answer.source_url && (
                      <a 
                        href={answer.source_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View Source
                      </a>
                    )}
                  </div>

                  {/* Expand/collapse for more details */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => setExpandedId(isExpanded ? null : answer.id)}
                  >
                    {isExpanded ? 'Show less' : 'Show more details'}
                  </Button>
                  
                  {isExpanded && (
                    <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                      <div>Answer ID: {answer.id}</div>
                      <div>Question ID: {answer.question_id}</div>
                      <div>Confidence: {answer.confidence}</div>
                      <div>Updated: {new Date(answer.updated_at).toLocaleString()}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
