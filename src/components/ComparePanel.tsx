import { useMemo } from 'react';
import { X, Users, ArrowRight, Landmark, HandCoins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScoreText } from './ScoreText';
import { OfficialAvatar } from './OfficialAvatar';
import { Candidate } from '@/types';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ComparePanelProps {
  candidates: Candidate[];
  userScore: number;
  onRemove: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}

interface FinanceSnapshot {
  candidateId: string;
  totalRaised: number;
  donorCount: number;
  topDonors: string[];
}

export const ComparePanel = ({
  candidates,
  userScore,
  onRemove,
  onClear,
  onClose
}: ComparePanelProps) => {
  const getPartyColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'bg-blue-500/10 text-blue-700 border-blue-500/30';
      case 'Republican': return 'bg-red-500/10 text-red-700 border-red-500/30';
      case 'Independent': return 'bg-purple-500/10 text-purple-700 border-purple-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const sortedCandidates = useMemo(() => {
    return [...candidates].sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));
  }, [candidates]);

  const visibleCandidates = sortedCandidates.slice(0, 4);

  const { data: financeByCandidate = {} } = useQuery({
    queryKey: ['compare-finance-snapshot', visibleCandidates.map(c => c.id).join(',')],
    queryFn: async () => {
      if (!visibleCandidates.length) return {} as Record<string, FinanceSnapshot>;

      const candidateIds = visibleCandidates.map((c) => c.id);
      const snapshots: Record<string, FinanceSnapshot> = Object.fromEntries(
        candidateIds.map((id) => [id, { candidateId: id, totalRaised: 0, donorCount: 0, topDonors: [] }]),
      );

      const { data: committees } = await supabase
        .from('candidate_committees')
        .select('candidate_id, fec_committee_id')
        .in('candidate_id', candidateIds);

      const committeeByCandidate = new Map<string, string[]>();
      (committees || []).forEach((row) => {
        if (!row.candidate_id || !row.fec_committee_id) return;
        const list = committeeByCandidate.get(row.candidate_id) || [];
        list.push(row.fec_committee_id);
        committeeByCandidate.set(row.candidate_id, list);
      });

      const allCommitteeIds = Array.from(new Set((committees || []).map((r) => r.fec_committee_id).filter(Boolean)));
      if (!allCommitteeIds.length) return snapshots;

      const [{ data: rollups }, { data: topContributions }] = await Promise.all([
        supabase
          .from('committee_finance_rollups')
          .select('committee_id, candidate_id, local_itemized, fec_total_receipts, donor_count')
          .in('committee_id', allCommitteeIds),
        supabase
          .from('contributions')
          .select('candidate_id, contributor_name, amount')
          .in('recipient_committee_id', allCommitteeIds)
          .order('amount', { ascending: false })
          .limit(1200),
      ]);

      (rollups || []).forEach((row) => {
        if (!row.candidate_id || !snapshots[row.candidate_id]) return;
        snapshots[row.candidate_id].totalRaised += Number(row.local_itemized ?? row.fec_total_receipts ?? 0);
        snapshots[row.candidate_id].donorCount += Number(row.donor_count ?? 0);
      });

      const topDonorMap = new Map<string, { name: string; amount: number }[]>();
      (topContributions || []).forEach((row) => {
        const candidateId = row.candidate_id;
        if (!candidateId || !snapshots[candidateId]) return;
        const list = topDonorMap.get(candidateId) || [];
        list.push({ name: row.contributor_name || 'Unknown', amount: Number(row.amount || 0) });
        topDonorMap.set(candidateId, list);
      });

      topDonorMap.forEach((donors, candidateId) => {
        const aggregate = donors.reduce((acc, donor) => {
          acc[donor.name] = (acc[donor.name] || 0) + donor.amount;
          return acc;
        }, {} as Record<string, number>);

        snapshots[candidateId].topDonors = Object.entries(aggregate)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name]) => name);
      });

      return snapshots;
    },
    enabled: visibleCandidates.length > 0,
    staleTime: 1000 * 60 * 10,
  });

  if (candidates.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
      <Card className="mx-4 mb-4 shadow-2xl border-2 border-primary/20 bg-card/95 backdrop-blur-md">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="font-display text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Compare Side-by-Side ({candidates.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onClear} className="text-xs">
                Clear All
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(candidates.length, 4)}, 1fr)` }}>
            {visibleCandidates.map((candidate) => {
              const finance = financeByCandidate[candidate.id];
              const diffFromUser = Math.abs((candidate.overallScore ?? 0) - userScore);

              return (
                <div
                  key={candidate.id}
                  className="relative p-3 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <button
                    onClick={() => onRemove(candidate.id)}
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs hover:bg-destructive/80 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>

                  <div className="flex items-center gap-2 mb-3">
                    <OfficialAvatar imageUrl={candidate.imageUrl} name={candidate.name} party={candidate.party} size="sm" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm text-foreground truncate">{candidate.name}</h4>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground truncate">{candidate.office}</span>
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
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-muted-foreground inline-flex items-center gap-1"><Landmark className="w-3 h-3" />Raised</span>
                      <span className="font-medium">${(finance?.totalRaised ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-muted-foreground inline-flex items-center gap-1"><HandCoins className="w-3 h-3" />Donors</span>
                      <span className="font-medium">{(finance?.donorCount ?? 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Major donors</p>
                      <p className="font-medium line-clamp-2">
                        {finance?.topDonors?.length ? finance.topDonors.join(', ') : 'No donor data yet'}
                      </p>
                    </div>
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
