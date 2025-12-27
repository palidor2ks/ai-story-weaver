import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { 
  ArrowLeft, 
  Building2, 
  Calendar, 
  DollarSign, 
  Hash, 
  Loader2, 
  MapPin, 
  TrendingUp, 
  User as UserIcon, 
  Users 
} from 'lucide-react';

interface DonorRecord {
  id: string;
  name: string;
  type: 'Individual' | 'PAC' | 'Organization' | 'Unknown';
  amount: number;
  cycle: string;
  candidate_id: string;
  employer?: string | null;
  occupation?: string | null;
  contributor_city?: string | null;
  contributor_state?: string | null;
  transaction_count?: number | null;
  candidates?: {
    id: string;
    name: string;
    party: string;
    office: string;
    state: string;
    district?: string;
    image_url?: string;
  };
}

interface ContributionRecord {
  id: string;
  contributor_name: string;
  amount: number;
  cycle: string;
  receipt_date: string | null;
  candidate_id: string | null;
  recipient_committee_name: string | null;
  candidates?: {
    id: string;
    name: string;
    party: string;
    office: string;
    state: string;
  } | null;
}

const getPartyColor = (party: string) => {
  switch (party) {
    case 'Democrat':
      return 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-400';
    case 'Republican':
      return 'bg-red-500/10 text-red-700 border-red-500/30 dark:bg-red-500/20 dark:text-red-400';
    case 'Independent':
      return 'bg-purple-500/10 text-purple-700 border-purple-500/30 dark:bg-purple-500/20 dark:text-purple-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'Individual':
      return <UserIcon className="w-6 h-6" />;
    case 'PAC':
      return <Users className="w-6 h-6" />;
    case 'Organization':
      return <Building2 className="w-6 h-6" />;
    default:
      return <TrendingUp className="w-6 h-6" />;
  }
};

const formatAmount = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
};

const DonorProfile = () => {
  const { id } = useParams<{ id: string }>();
  const [cycleFilter, setCycleFilter] = useState<string>('all');

  // Fetch the specific donor record
  const { data: donor, isLoading: donorLoading } = useQuery({
    queryKey: ['donor', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('donors')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as DonorRecord;
    },
    enabled: !!id,
  });

  // Fetch all donor records with the same name (aggregated by candidate/cycle)
  const { data: donorRecords = [], isLoading: recordsLoading } = useQuery({
    queryKey: ['donor-records', donor?.name],
    queryFn: async () => {
      if (!donor?.name) return [] as DonorRecord[];
      const { data, error } = await supabase
        .from('donors')
        .select(`*, candidates (id, name, party, office, state, district, image_url)`)
        .eq('name', donor.name)
        .order('amount', { ascending: false });
      if (error) throw error;
      return (data || []).map((row) => ({
        ...row,
        candidates: (row as any).candidates,
      })) as DonorRecord[];
    },
    enabled: !!donor?.name,
  });

  // Fetch individual contributions for detailed history
  const { data: contributions = [], isLoading: contributionsLoading } = useQuery({
    queryKey: ['donor-contributions', donor?.name],
    queryFn: async () => {
      if (!donor?.name) return [] as ContributionRecord[];
      const { data, error } = await supabase
        .from('contributions')
        .select(`*, candidates (id, name, party, office, state)`)
        .ilike('contributor_name', donor.name)
        .order('receipt_date', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []).map((row) => ({
        ...row,
        candidates: (row as any).candidates,
      })) as ContributionRecord[];
    },
    enabled: !!donor?.name,
  });

  // Get unique cycles for filter
  const availableCycles = useMemo(() => {
    const cycles = new Set<string>();
    contributions.forEach(c => cycles.add(c.cycle));
    donorRecords.forEach(r => cycles.add(r.cycle));
    return Array.from(cycles).sort().reverse();
  }, [contributions, donorRecords]);

  // Filter contributions by cycle
  const filteredContributions = useMemo(() => {
    if (cycleFilter === 'all') return contributions;
    return contributions.filter(c => c.cycle === cycleFilter);
  }, [contributions, cycleFilter]);

  // Aggregate stats
  const stats = useMemo(() => {
    const totalAmount = donorRecords.reduce((sum, r) => sum + r.amount, 0);
    const totalTransactions = donorRecords.reduce((sum, r) => sum + (r.transaction_count || 1), 0);
    const uniqueRecipients = new Set(donorRecords.map(r => r.candidate_id)).size;
    const uniqueCycles = new Set(donorRecords.map(r => r.cycle)).size;
    return { totalAmount, totalTransactions, uniqueRecipients, uniqueCycles };
  }, [donorRecords]);

  const isLoading = donorLoading || recordsLoading || contributionsLoading;

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

  if (!donor) {
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

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-8 px-4 space-y-8">
        {/* Back link */}
        <Link
          to="/donors"
          className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Donors
        </Link>

        {/* Header card */}
        <div className="bg-card rounded-2xl border border-border p-6 md:p-8 shadow-elevated">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            {/* Donor info */}
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-primary/10 text-primary">
                {getTypeIcon(donor.type)}
              </div>
              <div>
                <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-2">
                  {donor.name}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Badge variant="outline">{donor.type}</Badge>
                  {donor.contributor_city && donor.contributor_state && (
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5" />
                      {donor.contributor_city}, {donor.contributor_state}
                    </span>
                  )}
                </div>
                {(donor.employer || donor.occupation) && (
                  <p className="text-sm text-muted-foreground">
                    {donor.occupation}{donor.occupation && donor.employer && ' at '}{donor.employer}
                  </p>
                )}
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="border-border">
                <CardContent className="p-4 text-center">
                  <DollarSign className="w-5 h-5 mx-auto mb-1 text-agree" />
                  <p className="text-xl md:text-2xl font-bold text-foreground">
                    {formatAmount(stats.totalAmount)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Given</p>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="p-4 text-center">
                  <Hash className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <p className="text-xl md:text-2xl font-bold text-foreground">
                    {stats.totalTransactions}
                  </p>
                  <p className="text-xs text-muted-foreground">Donations</p>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="p-4 text-center">
                  <Users className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <p className="text-xl md:text-2xl font-bold text-foreground">
                    {stats.uniqueRecipients}
                  </p>
                  <p className="text-xs text-muted-foreground">Recipients</p>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="p-4 text-center">
                  <Calendar className="w-5 h-5 mx-auto mb-1 text-primary" />
                  <p className="text-xl md:text-2xl font-bold text-foreground">
                    {stats.uniqueCycles}
                  </p>
                  <p className="text-xs text-muted-foreground">Cycles</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Top Recipients */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="font-display text-xl font-bold">Top Recipients</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {donorRecords.slice(0, 6).map((record) => (
              <Link
                key={record.id}
                to={`/candidate/${record.candidate_id}`}
                className="block group"
              >
                <Card className="h-full transition-all hover:shadow-md hover:border-primary/30">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {record.candidates?.name || 'Unknown'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {record.candidates?.office} • {record.candidates?.state}
                        </p>
                      </div>
                      {record.candidates?.party && (
                        <Badge variant="outline" className={getPartyColor(record.candidates.party)}>
                          {record.candidates.party.slice(0, 1)}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <Badge variant="secondary" className="text-xs">{record.cycle}</Badge>
                      <span className="font-bold text-agree">{formatAmount(record.amount)}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {donorRecords.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No recipients found for this donor.
              </CardContent>
            </Card>
          )}
        </section>

        {/* Detailed Contribution History */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-primary" />
              <h2 className="font-display text-xl font-bold">Contribution History</h2>
              <span className="text-sm text-muted-foreground">
                ({filteredContributions.length} records)
              </span>
            </div>
            
            {availableCycles.length > 1 && (
              <Select value={cycleFilter} onValueChange={setCycleFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Filter cycle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cycles</SelectItem>
                  {availableCycles.map(cycle => (
                    <SelectItem key={cycle} value={cycle}>{cycle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Contributions table */}
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
                  {filteredContributions.map((contribution) => (
                    <tr key={contribution.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {contribution.candidates ? (
                            <Link 
                              to={`/candidate/${contribution.candidate_id}`}
                              className="hover:text-primary transition-colors"
                            >
                              <p className="font-medium text-foreground">
                                {contribution.candidates.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {contribution.candidates.office} • {contribution.candidates.state}
                              </p>
                            </Link>
                          ) : (
                            <p className="font-medium text-foreground">
                              {contribution.recipient_committee_name || 'Unknown'}
                            </p>
                          )}
                          {contribution.candidates?.party && (
                            <Badge 
                              variant="outline" 
                              className={`shrink-0 text-xs ${getPartyColor(contribution.candidates.party)}`}
                            >
                              {contribution.candidates.party.slice(0, 1)}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                        {formatDate(contribution.receipt_date) || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="text-xs">
                          {contribution.cycle}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-foreground">
                          {formatAmount(contribution.amount)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredContributions.length === 0 && (
              <div className="py-10 text-center text-muted-foreground">
                No contribution records found.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default DonorProfile;
