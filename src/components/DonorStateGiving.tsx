import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Landmark } from 'lucide-react';
import { formatCompactCurrency } from '@/lib/utils';
import type { NjDonorGiving } from '@/hooks/useNjDonorGiving';

const fmt = (n: number) => formatCompactCurrency(n);

const fmtDate = (d: string | null) => {
  if (!d) return '—';
  // ELEC cont_date is a date-only string (YYYY-MM-DD). Parse the parts as a *local*
  // date so it doesn't shift a day earlier in US time zones, where new Date('YYYY-MM-DD')
  // is interpreted as UTC midnight.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// New Jersey state (ELEC) giving for a donor: recipients + a recent-contributions table.
export const DonorStateGiving = ({ giving }: { giving: NjDonorGiving | undefined }) => {
  const [showAllRecipients, setShowAllRecipients] = useState(false);

  if (!giving || giving.transactionCount === 0) return null;

  const recipients = showAllRecipients ? giving.recipients : giving.recipients.slice(0, 6);
  const recentContributions = giving.contributions.slice(0, 50);

  return (
    <section>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4 min-w-0">
        <Landmark className="w-5 h-5 text-violet-600 shrink-0" />
        <h2 className="font-display text-xl font-bold">New Jersey State Giving</h2>
        <Badge
          variant="outline"
          className="bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-400"
        >
          {fmt(giving.total)} · {giving.transactionCount.toLocaleString()} contribution
          {giving.transactionCount === 1 ? '' : 's'}
        </Badge>
      </div>

      {/* Top NJ recipients */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {recipients.map((r, i) => (
          <Card key={`${r.name}-${i}`} className="h-full min-w-0">
            <CardContent className="p-4">
              <p className="font-semibold text-foreground truncate mb-1">{r.name}</p>
              {(r.office || r.district || r.party) && (
                <p className="text-xs text-muted-foreground truncate mb-2">
                  {[r.office, r.district, r.party].filter(Boolean).join(' • ')}
                </p>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-sm text-muted-foreground">
                  {r.count.toLocaleString()} contribution{r.count === 1 ? '' : 's'}
                </span>
                <span className="font-bold text-agree">{fmt(r.amount)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {giving.recipients.length > 6 && (
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={() => setShowAllRecipients(!showAllRecipients)}>
            {showAllRecipients ? 'Show Top 6' : `View All NJ Recipients (${giving.recipients.length})`}
          </Button>
        </div>
      )}

      {/* Recent NJ contributions */}
      <div className="mt-6 border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Recipient
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3 hidden sm:table-cell">
                  Date
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Year
                </th>
                <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentContributions.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{c.recipient}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                    {fmtDate(c.date)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="text-xs">{c.year ?? '—'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">{fmt(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
