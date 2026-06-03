import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign,
  Hash,
  Landmark,
  Loader2,
  MapPin,
  TrendingUp,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { useNjDonorProfile, type NjDonorContribution, type NjDonorRecipient } from '@/hooks/useNjDonorProfile';
import { normalizeDonorEntityType } from '@/lib/donorType';
import { formatCompactCurrency, formatFullCurrency } from '@/lib/utils';

const getTypeIcon = (type: string) => {
  const t = normalizeDonorEntityType(type);
  if (t === 'Individual') return <UserIcon className="w-6 h-6" />;
  if (t === 'Org/PAC') return <Building2 className="w-6 h-6" />;
  return <TrendingUp className="w-6 h-6" />;
};

const getPartyColor = (party?: string | null) => {
  const p = (party || '').toLowerCase();
  if (p.includes('democrat')) return 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-400';
  if (p.includes('republican')) return 'bg-red-500/10 text-red-700 border-red-500/30 dark:bg-red-500/20 dark:text-red-400';
  return 'bg-muted text-muted-foreground';
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

interface NjDonorProfileProps {
  id: string;
}

export const NjDonorProfile = ({ id }: NjDonorProfileProps) => {
  const { data, isLoading, error } = useNjDonorProfile(id);
  const [cycleFilter, setCycleFilter] = useState<string>('all');

  const contributions = useMemo<NjDonorContribution[]>(() => data?.contributions ?? [], [data]);
  const cycles = useMemo(() => (data?.cycles ?? []).map(String), [data]);

  const filteredContributions = useMemo(() => {
    if (cycleFilter === 'all') return contributions;
    return contributions.filter((c) => String(c.election_year) === cycleFilter);
  }, [contributions, cycleFilter]);

  // For "all cycles" use the server's full aggregate; for a specific cycle derive
  // recipients from that cycle's contributions so the two views stay consistent.
  const recipients = useMemo<NjDonorRecipient[]>(() => {
    if (cycleFilter === 'all') return data?.recipients ?? [];
    const grouped = new Map<string, NjDonorRecipient>();
    for (const c of filteredContributions) {
      const key = c.entity_s || c.recipient_name;
      const existing = grouped.get(key);
      if (existing) {
        existing.amount += c.amount;
        existing.contribution_count += 1;
      } else {
        grouped.set(key, {
          entity_s: c.entity_s,
          recipient_name: c.recipient_name,
          office: c.office,
          party: c.party,
          location: null,
          amount: c.amount,
          contribution_count: 1,
          last_year: c.election_year,
        });
      }
    }
    return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount);
  }, [data, filteredContributions, cycleFilter]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error || !data || !data.found) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8 px-4 text-center">
          <p className="text-muted-foreground mb-4">Donor not found.</p>
          <Link to="/donors" className="text-primary hover:underline">
            Back to Donors
          </Link>
        </main>
      </div>
    );
  }

  const displayName = data.name || data.raw_name || 'Unknown donor';
  const entityType = normalizeDonorEntityType(data.type || 'Unknown');
  const totalAmount = data.total_amount ?? 0;
  const txns = data.transaction_count ?? 0;
  const recipientCount = data.recipient_count ?? 0;
  const cycleCount = cycles.length;
  const location = [data.city, data.state].filter(Boolean).join(', ');

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title={`${displayName} — Donor Profile — Pulse`}
        description={`New Jersey state campaign contributions and recipients for ${displayName}.`}
        path={`/donor/${id}`}
        type="profile"
      />
      <Header />

      <main className="container py-8 px-4 space-y-8">
        <Link
          to="/donors"
          className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Donors
        </Link>

        {/* Header card */}
        <div className="bg-card rounded-2xl border border-border p-6 md:p-8 shadow-elevated">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">{getTypeIcon(data.type || 'Unknown')}</div>
            <div className="min-w-0">
              <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-2">{displayName}</h1>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge variant="outline">{entityType}</Badge>
                <Badge variant="secondary" className="gap-1">
                  <Landmark className="h-3 w-3" />
                  NJ State (ELEC)
                </Badge>
                {location && (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5" />
                    {location}
                  </span>
                )}
              </div>
              {(data.employer || data.occupation) && (
                <p className="text-sm text-muted-foreground">
                  {data.occupation}
                  {data.occupation && data.employer && ' at '}
                  {data.employer}
                </p>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-6">
            <Card className="border-border min-w-0">
              <CardContent className="p-3 text-center">
                <DollarSign className="w-4 h-4 mx-auto mb-1 text-agree" />
                <p className="text-base lg:text-lg font-bold text-foreground truncate" title={formatFullCurrency(totalAmount)}>
                  {formatCompactCurrency(totalAmount)}
                </p>
                <p className="text-xs text-muted-foreground">Total Given</p>
              </CardContent>
            </Card>
            <Card className="border-border min-w-0">
              <CardContent className="p-3 text-center">
                <Hash className="w-4 h-4 mx-auto mb-1 text-primary" />
                <p className="text-base lg:text-lg font-bold text-foreground truncate">{txns.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Donations</p>
              </CardContent>
            </Card>
            <Card className="border-border min-w-0">
              <CardContent className="p-3 text-center">
                <Users className="w-4 h-4 mx-auto mb-1 text-primary" />
                <p className="text-base lg:text-lg font-bold text-foreground truncate">{recipientCount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Recipients</p>
              </CardContent>
            </Card>
            <Card className="border-border min-w-0">
              <CardContent className="p-3 text-center">
                <Calendar className="w-4 h-4 mx-auto mb-1 text-primary" />
                <p className="text-base lg:text-lg font-bold text-foreground truncate">{cycleCount}</p>
                <p className="text-xs text-muted-foreground">Cycles</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Cycle filter */}
        {cycles.length > 1 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-muted-foreground">Filter by cycle</p>
            <Select value={cycleFilter} onValueChange={setCycleFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cycles</SelectItem>
                {cycles.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Top Recipients */}
        <section>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4 min-w-0">
            <TrendingUp className="w-5 h-5 text-primary shrink-0" />
            <h2 className="font-display text-xl font-bold">Top Recipients</h2>
            <span className="text-sm text-muted-foreground">
              ({recipients.length}
              {cycleFilter !== 'all' ? ` in ${cycleFilter}` : ''})
            </span>
          </div>
          {recipients.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No recipients found for this donor.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recipients.map((r, i) => (
                <Card key={`${r.entity_s || r.recipient_name}-${i}`} className="h-full min-w-0">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground truncate">{r.recipient_name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {[r.office, r.location].filter(Boolean).join(' • ') || '—'}
                        </p>
                      </div>
                      {r.party && (
                        <Badge variant="outline" className={getPartyColor(r.party)}>
                          {r.party.slice(0, 1)}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <span className="text-xs text-muted-foreground">
                        {r.contribution_count.toLocaleString()} contribution{r.contribution_count === 1 ? '' : 's'}
                      </span>
                      <span className="font-bold text-agree">{formatCompactCurrency(r.amount)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Contribution History */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <DollarSign className="w-5 h-5 text-primary" />
            <h2 className="font-display text-xl font-bold">Contribution History</h2>
            <span className="text-sm text-muted-foreground">
              ({filteredContributions.length}
              {contributions.length >= 1000 ? '+' : ''} record{filteredContributions.length === 1 ? '' : 's'})
            </span>
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
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
                      Cycle
                    </th>
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredContributions.map((c) => (
                    <tr key={c.contrib_s} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{c.recipient_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{c.office || '—'}</p>
                          </div>
                          {c.party && (
                            <Badge variant="outline" className={`shrink-0 text-xs ${getPartyColor(c.party)}`}>
                              {c.party.slice(0, 1)}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                        {formatDate(c.cont_date)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="text-xs">
                          {c.election_year ?? '—'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-foreground">{formatCompactCurrency(c.amount)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredContributions.length === 0 && (
              <div className="py-10 text-center text-muted-foreground">No contribution records found.</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};
