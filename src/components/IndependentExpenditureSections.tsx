import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Megaphone, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { useCommitteeIE, useCandidateIE } from '@/hooks/useIndependentExpenditures';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export const CommitteeIESection = ({ committeeFecId }: { committeeFecId: string | null | undefined }) => {
  const { data, isLoading } = useCommitteeIE(committeeFecId);
  if (!committeeFecId) return null;
  if (isLoading) {
    return (
      <Card><CardContent className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></CardContent></Card>
    );
  }
  if (!data || data.totals.expenditure_count === 0) return null;
  const { totals, rows } = data;
  return (
    <Card className="shadow-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display">
          <Megaphone className="w-5 h-5 text-primary" />
          Independent Expenditures
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Total spent" value={fmt(totals.total_amount)} />
          <Stat label="Supporting" value={fmt(totals.support_amount)} tone="agree" />
          <Stat label="Opposing" value={fmt(totals.oppose_amount)} tone="disagree" />
          <Stat label="Filings" value={totals.expenditure_count.toLocaleString()} />
        </div>
        {rows.length > 0 && (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr><th className="text-left p-2">Date</th><th className="text-left p-2">Target</th><th className="text-left p-2">S/O</th><th className="text-right p-2">Amount</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 text-muted-foreground">{fmtDate(r.expenditure_date)}</td>
                    <td className="p-2 truncate max-w-[260px]">{r.target_candidate_name ?? '—'}</td>
                    <td className="p-2"><Badge variant="outline" className={r.support_oppose_indicator === 'S' ? 'border-agree/40 text-agree' : 'border-disagree/40 text-disagree'}>{r.support_oppose_indicator === 'S' ? 'Support' : 'Oppose'}</Badge></td>
                    <td className="p-2 text-right font-medium">{fmt(Number(r.amount))}</td>
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
  const { data, isLoading } = useCandidateIE(candidateId);
  if (!candidateId) return null;
  if (isLoading) {
    return (
      <Card><CardContent className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></CardContent></Card>
    );
  }
  if (!data || data.totals.expenditure_count === 0) return null;
  const { totals, topSpenders } = data;
  return (
    <Card className="shadow-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display">
          <Megaphone className="w-5 h-5 text-primary" />
          Outside Spending
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Total outside" value={fmt(totals.total_amount)} />
          <Stat label="In support" value={fmt(totals.support_amount)} tone="agree" icon={<TrendingUp className="w-3 h-3" />} />
          <Stat label="Against" value={fmt(totals.oppose_amount)} tone="disagree" icon={<TrendingDown className="w-3 h-3" />} />
          <Stat label="Filings" value={totals.expenditure_count.toLocaleString()} />
        </div>
        {topSpenders.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Top spending committees</h4>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr><th className="text-left p-2">Committee</th><th className="text-right p-2">For</th><th className="text-right p-2">Against</th><th className="text-right p-2">Total</th></tr>
                </thead>
                <tbody>
                  {topSpenders.map((s) => (
                    <tr key={s.fecId} className="border-t">
                      <td className="p-2 truncate max-w-[260px]"><div className="font-medium">{s.name}</div><div className="text-xs text-muted-foreground">{s.fecId} · {s.count} filing{s.count !== 1 ? 's' : ''}</div></td>
                      <td className="p-2 text-right text-agree">{fmt(s.support)}</td>
                      <td className="p-2 text-right text-disagree">{fmt(s.oppose)}</td>
                      <td className="p-2 text-right font-semibold">{fmt(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
