import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCommittees } from '@/hooks/useCommittees';
import { Loader2, Landmark, Users, DollarSign, ArrowRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const formatNumber = (value: number) =>
  value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1_000
      ? `${(value / 1_000).toFixed(0)}K`
      : value.toLocaleString();

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? '—'
    : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const Committees = () => {
  const { data: committees = [], isLoading, error } = useCommittees();
  const [search, setSearch] = useState('');

  const filteredCommittees = useMemo(() => {
    if (!search) return committees;
    return committees.filter((committee) => {
      const haystack = `${committee.name || ''} ${committee.fecCommitteeId} ${committee.candidate?.name || ''}`.toLowerCase();
      return haystack.includes(search.toLowerCase());
    });
  }, [committees, search]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-8 px-4">
        <div className="flex flex-col gap-4 mb-8">
          <div>
            <p className="text-sm text-muted-foreground mb-1 font-medium">Committees</p>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">Committee Directory</h1>
            <p className="text-muted-foreground mt-2">
              Explore fundraising committees with donor counts and contribution totals. Click a committee to dive into donor details.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative w-full sm:max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by committee name, FEC ID, or candidate"
                className="pl-9"
              />
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="text-center py-16 text-destructive">
            Unable to load committees: {error.message}
          </div>
        )}

        {!isLoading && !error && filteredCommittees.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            No committees found matching your search.
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredCommittees.map((committee) => (
            <Card
              key={committee.id}
              className="hover:border-primary/50 transition-colors group"
            >
              <CardContent className="p-5 h-full">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <Landmark className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-lg leading-tight">{committee.name || 'Unknown Committee'}</h3>
                        {committee.designation && (
                          <Badge variant="secondary" className="text-xs">
                            {committee.designation}
                          </Badge>
                        )}
                        {committee.role && (
                          <Badge variant="outline" className="text-xs">
                            {committee.role}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">FEC ID: {committee.fecCommitteeId}</p>
                      {committee.candidate && (
                        <p className="text-sm text-muted-foreground">
                          Linked to {committee.candidate.name} ({committee.candidate.party})
                        </p>
                      )}
                    </div>
                  </div>
                  <Link to={`/committee/${committee.fecCommitteeId}`}>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-6">
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <DollarSign className="w-4 h-4" />
                      Total Raised
                    </div>
                    <p className="text-xl font-semibold text-foreground mt-1">
                      {formatCurrency(committee.totalRaised)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="w-4 h-4" />
                      Donors
                    </div>
                    <p className={cn(
                      "text-xl font-semibold mt-1",
                      committee.donorCount > 0 ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {formatNumber(committee.donorCount)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground mt-4">
                  <span>Contributions: {formatNumber(committee.contributionCount)}</span>
                  <span>Last sync: {formatDate(committee.lastSyncDate)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
};
