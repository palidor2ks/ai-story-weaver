import { useMemo } from 'react';
import { X, Users, ArrowRight, Landmark, HandCoins, Loader2, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScoreText } from './ScoreText';
import { OfficialAvatar } from './OfficialAvatar';
import { Candidate } from '@/types';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useFinanceCycles } from '@/hooks/useFinanceCycles';
import { useCandidatesIE } from '@/hooks/useIndependentExpenditures';
import { useCompareFinanceSnapshots } from '@/hooks/useCompareFinance';
import { normalizeOfficeName } from '@/lib/officeLabel';
import { IESummaryInline } from './IESummaryInline';

interface ComparePanelProps {
  candidates: Candidate[];
  userScore: number;
  onRemove: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export const ComparePanel = ({
  candidates,
  userScore,
  onRemove,
  onClear,
  onClose,
}: ComparePanelProps) => {
  const { user } = useAuth();
  const { data: cycles } = useFinanceCycles();
  const cycle = cycles?.[0];

  const getPartyColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'bg-blue-500/10 text-blue-700 border-blue-500/30';
      case 'Republican': return 'bg-red-500/10 text-red-700 border-red-500/30';
      case 'Independent': return 'bg-purple-500/10 text-purple-700 border-purple-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const sortedCandidates = useMemo(
    () => [...candidates].sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0)),
    [candidates],
  );
  const visibleCandidates = sortedCandidates.slice(0, 4);
  const candidateIds = visibleCandidates.map((c) => c.id);
  const { data: ieMap } = useCandidatesIE(candidateIds);


  const { data: financeByCandidate = {}, isLoading: financeLoading } =
    useCompareFinanceSnapshots(candidateIds, cycle, !!user);

  if (candidates.length === 0) return null;

  const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
      <Card className="mx-2 sm:mx-4 mb-2 sm:mb-4 shadow-2xl border-2 border-primary/20 bg-card/95 backdrop-blur-md max-h-[78vh] flex flex-col">
        <CardHeader className="pb-2 pt-3 px-3 sm:px-4 shrink-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="font-display text-base sm:text-lg flex items-center gap-2 min-w-0 flex-1">
              <Users className="w-5 h-5 text-primary shrink-0" />
              <span className="truncate">Compare ({candidates.length})</span>
              {cycle && <span className="text-xs text-muted-foreground font-normal shrink-0">· {cycle}</span>}
            </CardTitle>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={onClear} className="text-xs h-8 px-2">
                Clear All
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close compare panel">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-4 pb-3 sm:pb-4 overflow-y-auto">
          <div
            className={cn(
              "grid gap-3 sm:gap-4 grid-flow-col auto-cols-[82%] overflow-x-auto snap-x snap-mandatory -mx-1 px-1",
              "sm:grid-flow-row sm:auto-cols-auto sm:overflow-visible sm:snap-none sm:mx-0 sm:px-0",
              {
                'sm:grid-cols-1': visibleCandidates.length === 1,
                'sm:grid-cols-2': visibleCandidates.length === 2,
                'sm:grid-cols-3': visibleCandidates.length === 3,
                'sm:grid-cols-4': visibleCandidates.length >= 4,
              },
            )}
          >

            {visibleCandidates.map((candidate) => {
              const finance = financeByCandidate[candidate.id];
              const diffFromUser = Math.abs((candidate.overallScore ?? 0) - userScore);

              return (
                <div
                  key={candidate.id}
                  className="relative p-3 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 transition-colors snap-start min-w-0"
                >
                  <button
                    onClick={() => onRemove(candidate.id)}
                    aria-label={`Remove ${candidate.name} from compare`}
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs hover:bg-destructive/80 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>

                  <div className="flex items-center gap-2 mb-3">
                    <OfficialAvatar imageUrl={candidate.imageUrl} name={candidate.name} party={candidate.party} size="sm" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm text-foreground truncate">{candidate.name}</h4>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground truncate">{normalizeOfficeName(candidate.office)}</span>
                        <Badge variant="outline" className={cn('text-[10px] px-1 py-0', getPartyColor(candidate.party))}>
                          {candidate.party.charAt(0)}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="mb-3 flex justify-center">
                    <ScoreText score={candidate.overallScore} size="lg" showLabel />
                  </div>

                  <div className="space-y-2 text-xs border rounded-md p-2 bg-background/60">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-muted-foreground">Score gap vs you</span>
                      <span className="font-medium">{diffFromUser.toFixed(1)} pts</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground inline-flex items-center gap-1 shrink-0">
                        <Landmark className="w-3 h-3" />Raised
                      </span>
                      <span className="font-medium truncate text-right">
                        {financeLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : fmtMoney(finance?.totalRaised ?? 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground inline-flex items-center gap-1 shrink-0">
                        <HandCoins className="w-3 h-3" />Donors
                      </span>
                      <span className="font-medium truncate text-right">
                        {financeLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : (finance?.donorCount ?? 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground inline-flex items-center gap-1 shrink-0">
                        <Megaphone className="w-3 h-3" />Outside
                      </span>
                      <IESummaryInline totals={ieMap?.get(candidate.id)} hideIfEmpty={false} className="text-right" />
                    </div>

                    {user && (finance?.smallDonationCount ?? 0) > 0 && (
                      <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-1.5">
                        <p className="text-emerald-700 dark:text-emerald-300 text-[11px] mb-0.5">Small-dollar support</p>
                        <p className="font-medium text-[11px]">
                          {fmtMoney(finance!.smallDonationAmount)} from {finance!.smallDonationCount.toLocaleString()} small donations
                        </p>
                      </div>
                    )}
                    {user && (
                      <div>
                        <p className="text-muted-foreground mb-1">Major donors</p>
                        <ul className="font-medium space-y-0.5">
                          {finance?.topDonors?.length ? (
                            finance.topDonors.map((donor) => (
                              <li key={`${candidate.id}-${donor.name}`} className="truncate">
                                {donor.name} — {fmtMoney(donor.amount)}
                              </li>
                            ))
                          ) : (
                            <li className="text-muted-foreground font-normal">No donor data yet</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>

                  <Link to={`/candidate/${candidate.id}`}>
                    <Button variant="ghost" size="sm" className="w-full mt-2 text-xs gap-1">
                      View Profile
                      <ArrowRight className="w-3 h-3" />
                    </Button>
                  </Link>
                </div>
              );
            })}
          </div>

          {candidates.length > 4 && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              +{candidates.length - 4} more selected (showing first 4)
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
