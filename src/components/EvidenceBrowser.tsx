import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, ExternalLink, AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react';
import { formatScore } from '@/lib/scoreFormat';
import { cn } from '@/lib/utils';

interface StanceEvidence {
  questionId: string;
  questionText: string;
  topicName: string;
  stance: 'known' | 'unknown';
  score: number | null;
  sources?: Array<{ title: string; url: string }>;
  reason?: string;
}

interface EvidenceBrowserProps {
  candidateName: string;
  stances: StanceEvidence[];
}

export const EvidenceBrowser = ({ candidateName, stances }: EvidenceBrowserProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const knownStances = stances.filter(s => s.stance === 'known');
  const unknownStances = stances.filter(s => s.stance === 'unknown');
  
  const coveragePercent = stances.length > 0 
    ? Math.round((knownStances.length / stances.length) * 100) 
    : 0;

  return (
    <Card className="shadow-elevated">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display flex items-center gap-2 text-lg">
            <CheckCircle className="w-5 h-5 text-primary" />
            Stance Evidence
          </CardTitle>
          <Badge 
            variant="outline" 
            className={cn(
              coveragePercent >= 85 ? "bg-green-100 text-green-800" :
              coveragePercent >= 60 ? "bg-yellow-100 text-yellow-800" :
              "bg-red-100 text-red-800"
            )}
          >
            {coveragePercent}% covered
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          {knownStances.length} of {stances.length} stance{stances.length !== 1 ? 's' : ''} verified with sources
        </p>

        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between">
              <span>{isOpen ? 'Hide Details' : 'View All Stances'}</span>
              {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </CollapsibleTrigger>
          
          <CollapsibleContent className="mt-4 space-y-4">
            {/* Known Stances */}
            {knownStances.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  Verified Stances ({knownStances.length})
                </h4>
                {knownStances.map((stance, index) => (
                  <div key={stance.questionId} className="p-3 rounded-lg bg-green-50 border border-green-200">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Badge variant="secondary" className="text-xs">{stance.topicName}</Badge>
                      {stance.score !== null && (
                        <span className={cn(
                          "text-sm font-mono font-semibold",
                          stance.score < 0 ? "text-blue-600" : stance.score > 0 ? "text-red-600" : "text-purple-600"
                        )}>
                          {formatScore(stance.score)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground mb-2">{stance.questionText}</p>
                    {stance.sources && stance.sources.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {stance.sources.map((source, idx) => (
                          <a
                            key={idx}
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {source.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Unknown Stances */}
            {unknownStances.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                  Unknown Stances ({unknownStances.length})
                </h4>
                {unknownStances.map((stance, index) => (
                  <div key={stance.questionId} className="p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Badge variant="secondary" className="text-xs">{stance.topicName}</Badge>
                      <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-700">
                        <HelpCircle className="w-3 h-3 mr-1" />
                        Unknown
                      </Badge>
                    </div>
                    <p className="text-sm text-foreground mb-2">{stance.questionText}</p>
                    {stance.reason && (
                      <p className="text-xs text-yellow-700 italic">{stance.reason}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        <p className="mt-4 text-xs text-muted-foreground">
          Unknown stances are scored as Center (0.00) and reduce the confidence level.
        </p>
      </CardContent>
    </Card>
  );
};
