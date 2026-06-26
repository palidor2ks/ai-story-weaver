import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Megaphone, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { useCommitteeIE, useCandidateIE } from '@/hooks/useIndependentExpenditures';
import { useCommitteeTopicsMap } from '@/hooks/useCommitteeTopics';
import { useCommitteePrimaryCandidatesMap } from '@/hooks/useCommitteeCandidates';
import { CommitteeTopicBadge } from '@/components/CommitteeTopicBadge';
import { formatCompactCurrency } from '@/lib/utils';

const fmt = (n: number) => formatCompactCurrency(n);

export const CommitteeIESection = ({
  committeeFecId,
  cycle: cycleProp,
}: {
  committeeFecId: string | null | undefined;
  /** When provided, the section is locked to this cycle and the internal dropdown is hidden. */
  cycle?: string | null;
}) => {
  const [internalCycle, setInternalCycle] = useState<string>('all');
  const cycle = cycleProp ?? internalCycle;
  const { data, isLoading } = useCommitteeIE(committeeFecId, cycle);
  if (!committeeFecId) return null;
  if (isLoading && !data) {
    return (
      <Card><CardContent className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></CardContent></Card>
    );
  }
  if (!data) return null;
  const { totals, targets, availableCycles } = data;
  const hasAny = totals.expenditure_count > 0 || availableCycles.length > 0;
  if (!hasAny) return null;

  return (
    <Card className="shadow-elevated">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2 font-display">
            <Megaphone className="w-5 h-5 text-primary" />
            Independent Expenditures
          </CardTitle>
          {cycleProp == null && availableCycles.length > 0 && (
            <Select value={cycle} onValueChange={setInternalCycle}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="All cycles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cycles</SelectItem>
                {availableCycles.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Total spent" value={fmt(totals.total_amount)} />
          <Stat label="Supporting" value={fmt(totals.support_amount)} tone="agree" />
          <Stat label="Opposing" value={fmt(totals.oppose_amount)} tone="disagree" />
          <Stat label="Filings" value={totals.expenditure_count.toLocaleString()} />
        </div>
        {targets.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">No expenditures for this cycle.</div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Target</th>
                  <th className="text-right p-2">Supporting</th>
                  <th className="text-right p-2">Opposing</th>
                  <th className="text-right p-2">Total</th>
                  <th className="text-right p-2 hidden sm:table-cell">Filings</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((t) => (
                  <tr key={t.key} className="border-t">
                    <td className="p-2 align-top">
                      <div className="flex items-center gap-2 flex-wrap">
                        {t.candidateId ? (
                          <Link to={`/candidate/${t.candidateId}`} className="font-medium hover:text-primary hover:underline break-words">
                            {t.name}
                          </Link>
                        ) : (
                          <span className="font-medium break-words">{t.name}</span>
                        )}
                        {t.party && <PartyBadge party={t.party} />}
                      </div>
                      {t.fecId && <div className="text-xs text-muted-foreground">{t.fecId}</div>}
                    </td>
                    <td className="p-2 text-right text-agree whitespace-nowrap">{t.support > 0 ? fmt(t.support) : '—'}</td>
                    <td className="p-2 text-right text-disagree whitespace-nowrap">{t.oppose > 0 ? fmt(t.oppose) : '—'}</td>
                    <td className="p-2 text-right font-semibold whitespace-nowrap">{fmt(t.total)}</td>
                    <td className="p-2 text-right text-muted-foreground whitespace-nowrap hidden sm:table-cell">{t.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const CandidateIESection = ({ candidateId }: { candidateId: string | null | undefined }) => {
  const [cycle, setCycle] = useState<string>('all');
  const { data, isLoading } = useCandidateIE(candidateId, cycle);
  const spenderIds = (data?.topSpenders ?? []).map((s) => s.fecId).filter(Boolean) as string[];
  const { data: topicsMap } = useCommitteeTopicsMap(spenderIds);
  const { data: candidateMap } = useCommitteePrimaryCandidatesMap(spenderIds);
  if (!candidateId) return null;
  if (isLoading && !data) {
    return (
      <Card><CardContent className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></CardContent></Card>
    );
  }
  if (!data) return null;
  const { totals, topSpenders, availableCycles } = data;
  const hasAny = totals.expenditure_count > 0 || availableCycles.length > 0;
  if (!hasAny) return null;
  return (
    <Card className="shadow-elevated">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2 font-display">
            <Megaphone className="w-5 h-5 text-primary" />
            Outside Spending
          </CardTitle>
          {availableCycles.length > 0 && (
            <Select value={cycle} onValueChange={setCycle}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="All cycles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cycles</SelectItem>
                {availableCycles.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {totals.expenditure_count === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">No expenditures for this cycle.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Total outside" value={fmt(totals.total_amount)} />
              <Stat label="In support" value={fmt(totals.support_amount)} tone="agree" icon={<TrendingUp className="w-3 h-3" />} />
              <Stat label="Against" value={fmt(totals.oppose_amount)} tone="disagree" icon={<TrendingDown className="w-3 h-3" />} />
              <Stat label="Filings" value={totals.expenditure_count.toLocaleString()} />
            </div>
            {topSpenders.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Top spending committees</h4>
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr><th className="text-left p-2">Committee</th><th className="text-right p-2">For</th><th className="text-right p-2">Against</th><th className="text-right p-2">Total</th></tr>
                    </thead>
                    <tbody>
                      {topSpenders.map((s) => (
                        <tr key={s.fecId} className="border-t">
                          <td className="p-2 align-top">
                            <div className="font-medium flex items-center gap-2 flex-wrap">
                              {s.fecId ? (
                                <Link to={`/committee/${s.fecId}`} className="hover:text-primary hover:underline break-words">
                                  {s.name}
                                </Link>
                              ) : (
                                <span className="break-words">{s.name}</span>
                              )}
                              <CommitteeTopicBadge
                                fecCommitteeId={s.fecId}
                                row={topicsMap?.get(s.fecId) ?? null}
                                candidate={candidateMap?.get(s.fecId) ?? null}
                              />
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {s.fecId ? (
                                <Link to={`/committee/${s.fecId}`} className="hover:text-primary hover:underline">
                                  {s.fecId}
                                </Link>
                              ) : null}
                              {s.fecId ? ' · ' : ''}{s.count} filing{s.count !== 1 ? 's' : ''}
                            </div>
                          </td>
                          <td className="p-2 text-right text-agree whitespace-nowrap">{fmt(s.support)}</td>
                          <td className="p-2 text-right text-disagree whitespace-nowrap">{fmt(s.oppose)}</td>
                          <td className="p-2 text-right font-semibold whitespace-nowrap">{fmt(s.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};


const Stat = ({ label, value, tone, icon }: { label: string; value: string; tone?: 'agree' | 'disagree'; icon?: React.ReactNode }) => (
  <div className="rounded-lg border bg-secondary/30 p-3">
    <div className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</div>
    <div className={`text-lg font-bold mt-1 ${tone === 'agree' ? 'text-agree' : tone === 'disagree' ? 'text-disagree' : 'text-foreground'}`}>{value}</div>
  </div>
);

const PartyBadge = ({ party }: { party: string }) => {
  const p = party.toLowerCase();
  const letter = party.charAt(0).toUpperCase();
  const cls =
    p.startsWith('dem')
      ? 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-300'
      : p.startsWith('rep')
        ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300'
        : p.startsWith('ind')
          ? 'border-purple-500/40 bg-purple-500/10 text-purple-600 dark:text-purple-300'
          : 'border-border bg-muted text-muted-foreground';
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-semibold ${cls}`} title={party}>
      {letter}
    </Badge>
  );
};
