import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Building2,
  User as UserIcon,
  Users,
  TrendingUp,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DonorAIAnalysisDialog } from '@/components/DonorAIAnalysisDialog';

interface DonorCardProps {
  id: string;
  name: string;
  type: 'Individual' | 'PAC' | 'Organization' | 'Unknown';
  types?: string[];
  amount: number;
  transactionCount: number;
  isConsolidated?: boolean;
  nameVariations?: string[];
  recipientCount?: number;
  cycle?: string;
}


const formatAmount = (amount: number) => {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount}`;
};

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'Individual': return <UserIcon className="w-5 h-5" />;
    case 'PAC': return <Users className="w-5 h-5" />;
    case 'Organization': return <Building2 className="w-5 h-5" />;
    default: return <TrendingUp className="w-5 h-5" />;
  }
};

const getTypeBadgeStyle = (type: string) => {
  switch (type) {
    case 'Individual':
      return 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400';
    case 'PAC':
      return 'bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-400';
    case 'Organization':
      return 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

const partyColor = (party: string) => {
  const p = party.toLowerCase();
  if (p.startsWith('dem')) return 'bg-blue-500';
  if (p.startsWith('rep')) return 'bg-red-500';
  if (p.startsWith('ind')) return 'bg-purple-500';
  return 'bg-muted-foreground';
};

export const DonorCard = ({
  id,
  name,
  type,
  types,
  amount,
  transactionCount,
  nameVariations,
  recipientCount,
  cycle,
}: DonorCardProps) => {
  const hasMultipleVariations = nameVariations && nameVariations.length > 1;
  const hasMultipleTypes = types && types.length > 1;

  return (
    <Card className="h-full transition-all duration-200 hover:shadow-lg hover:border-primary/30 group hover:scale-[1.01]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-2.5 rounded-lg ${getTypeBadgeStyle(type)}`}>
            {getTypeIcon(type)}
          </div>
          <div className="flex items-center gap-2">
            {hasMultipleVariations && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Layers className="h-3 w-3" />
                      {nameVariations!.length} merged
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="font-medium mb-1">Merged donor names:</p>
                    <ul className="text-xs space-y-0.5">
                      {nameVariations!.slice(0, 5).map((v, i) => (
                        <li key={i} className="text-muted-foreground">• {v}</li>
                      ))}
                      {nameVariations!.length > 5 && (
                        <li className="text-muted-foreground">... and {nameVariations!.length - 5} more</li>
                      )}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {hasMultipleTypes ? (
              <div className="flex gap-1">
                {types!.map(t => (
                  <Badge key={t} variant="outline" className={`shrink-0 text-xs ${getTypeBadgeStyle(t)}`}>
                    {t === 'Organization' ? 'Org' : t}
                  </Badge>
                ))}
              </div>
            ) : (
              <Badge variant="outline" className={`shrink-0 ${getTypeBadgeStyle(type)}`}>
                {type}
              </Badge>
            )}
          </div>
        </div>

        <Link to={`/donor/${id}`} className="block">
          <h3 className="font-semibold text-foreground mb-4 line-clamp-2 group-hover:text-primary transition-colors">
            {name}
          </h3>
        </Link>

        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
              {recipientCount ? 'Recipients' : 'Donations'}
            </p>
            <p className="text-xl font-bold text-foreground">
              {recipientCount
                ? recipientCount.toLocaleString()
                : transactionCount.toLocaleString()}
            </p>
          </div>
          <div className="text-right space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Total</p>
            <p className="text-2xl font-bold text-agree">{formatAmount(amount)}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Link to={`/donor/${id}`}>
            <Button variant="ghost" size="sm" className="px-2">View details</Button>
          </Link>

          <Dialog onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                AI Analysis
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {name}
                </DialogTitle>
                <DialogDescription>
                  AI-generated donor analysis grounded in campaign-finance data and broader public context.
                </DialogDescription>
              </DialogHeader>

              {isLoading && (
                <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Generating analysis…</span>
                </div>
              )}

              {error && !isLoading && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={fetchAnalysis}>
                    Retry
                  </Button>
                </div>
              )}

              {analysis && !isLoading && (
                <div className="space-y-5 text-sm">
                  {analysis.insufficient_information && (
                    <div className="flex items-start gap-2 p-3 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>Insufficient public information available for a confident profile of this donor. Treat the analysis below as tentative.</span>
                    </div>
                  )}

                  <p className="text-foreground leading-relaxed">{analysis.summary}</p>

                  {analysis.party_support?.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-foreground">Party support</h4>
                      <div className="space-y-1.5">
                        {analysis.party_support.map((p) => (
                          <div key={p.party} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium">{p.party}</span>
                              <span className="text-muted-foreground">
                                {formatAmount(p.amount)} · {(p.share * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full ${partyColor(p.party)}`}
                                style={{ width: `${Math.min(100, p.share * 100)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.causes?.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-foreground">Likely causes</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.causes.map((c, i) => (
                          <Badge key={i} variant="secondary">{c}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.motivation_hypotheses?.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-foreground">Possible motivations</h4>
                      <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                        {analysis.motivation_hypotheses.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {analysis.analysis && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-foreground">Deeper analysis</h4>
                      <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {analysis.analysis}
                      </p>
                    </div>
                  )}

                  {analysis.sources?.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-border">
                      <h4 className="font-semibold text-foreground">Sources</h4>
                      <ul className="space-y-1">
                        {analysis.sources.map((s, i) => (
                          <li key={i}>
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {s.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="pt-2">
                    <Link to={`/donor/${id}`}>
                      <Button size="sm">Open full donor profile</Button>
                    </Link>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    AI-generated. May be incomplete or include errors. Verify with linked sources.
                  </p>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
};
