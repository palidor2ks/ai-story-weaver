import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, Sparkles, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AIExplanationProps {
  candidateId: string;
  candidateName: string;
  topicScores: Array<{ topicId: string; topicName: string; score: number }>;
}

interface AIAnalysis {
  summary: string;
  deepAnalysis: string;
  sources: Array<{ title: string; url: string }>;
}

export const AIExplanation = ({ candidateId, candidateName, topicScores }: AIExplanationProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fetchAnalysis = async () => {
    if (analysis) return; // Already loaded
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-candidate-explanation', {
        body: {
          candidateId,
          candidateName,
          topicScores,
        },
      });

      if (error) throw error;

      setAnalysis(data);
    } catch (error) {
      console.error('Failed to fetch AI analysis:', error);
      toast({
        title: 'Error',
        description: 'Failed to load AI analysis. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = () => {
    if (!isOpen && !analysis) {
      fetchAnalysis();
    }
    setIsOpen(!isOpen);
  };

  return (
    <Card className="shadow-elevated border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="font-display flex items-center gap-2 text-lg">
          <Sparkles className="w-5 h-5 text-primary" />
          AI Stance Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Summary - Always visible */}
        <div className="mb-4">
          {isLoading && !analysis ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Generating analysis...</span>
            </div>
          ) : analysis ? (
            <p className="text-foreground leading-relaxed">{analysis.summary}</p>
          ) : (
            <p className="text-muted-foreground italic">
              Click below to generate an AI-powered analysis of {candidateName}&apos;s political positions.
            </p>
          )}
        </div>

        {/* Expandable Deep Analysis */}
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between"
              onClick={handleToggle}
            >
              <span>{isOpen ? 'Hide Deep Analysis' : 'Show Deep Analysis'}</span>
              {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </CollapsibleTrigger>
          
          <CollapsibleContent className="mt-4 space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : analysis ? (
              <>
                <div className="prose prose-sm max-w-none text-foreground">
                  <div className="whitespace-pre-wrap">{analysis.deepAnalysis}</div>
                </div>
                
                {analysis.sources && analysis.sources.length > 0 && (
                  <div className="pt-4 border-t border-border">
                    <h5 className="text-sm font-semibold text-foreground mb-2">Sources</h5>
                    <ul className="space-y-1">
                      {analysis.sources.map((source, index) => (
                        <li key={index}>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {source.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : null}
          </CollapsibleContent>
        </Collapsible>

        {/* Disclaimer */}
        <p className="mt-4 text-xs text-muted-foreground">
          AI-generated analysis based on public records and statements. May not reflect all nuances of the candidate&apos;s positions.
        </p>
      </CardContent>
    </Card>
  );
};
