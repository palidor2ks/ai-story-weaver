import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { 
  ArrowLeft, 
  Building2, 
  Calendar, 
  DollarSign, 
  Filter,
  Hash, 
  Layers,
  Loader2, 
  MapPin, 
  TrendingUp, 
  User as UserIcon, 
  Users,
  X
} from 'lucide-react';

interface DonorRecord {
  id: string;
  name: string;
  display_name?: string | null;
  type: 'Individual' | 'PAC' | 'Organization' | 'Unknown';
  amount: number;
  cycle: string;
  candidate_id: string;
  recipient_committee_name?: string | null;
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
  recipient_committee_id: string | null;
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

const formatCompactAmount = (amount: number) => {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}K`;
  }
  return formatAmount(amount);
};

const formatCompactNumber = (num: number) => {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toLocaleString();
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
  const [showAllDonations, setShowAllDonations] = useState(false);
  const [committeeFilter, setCommitteeFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [showAllRecipients, setShowAllRecipients] = useState(false);

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

  // Check if this donor has an alias (canonical name)
  const { data: aliasInfo } = useQuery({
    queryKey: ['donor-alias-info', donor?.name, donor?.type],
    queryFn: async () => {
      if (!donor?.name || !donor?.type) return null;
      
      // Fetch all active aliases (without filtering by type initially)
      const { data, error } = await supabase
        .from('donor_aliases')
        .select('*')
        .eq('is_active', true);
      
      if (error) throw error;
      
      // Find matching alias - check if donor's type is in donor_types array
      const matchingAlias = (data || []).find(alias => {
        // Check name pattern match
        const pattern = alias.alias_pattern.replace(/%/g, '.*').replace(/_/g, '.');
        const regex = new RegExp(`^${pattern}$`, 'i');
        const nameMatches = regex.test(donor.name);
        
        // Check type match - either in donor_types array or legacy donor_type field
        const typeMatches = alias.donor_types?.includes(donor.type) || alias.donor_type === donor.type;
        
        return nameMatches && typeMatches;
      });
      
      return matchingAlias || null;
    },
    enabled: !!donor?.name && !!donor?.type,
  });

  // Get all name variations if there's an alias
  const { data: nameVariations = [] } = useQuery({
    queryKey: ['donor-name-variations', aliasInfo?.alias_pattern, donor?.type],
    queryFn: async () => {
      if (!aliasInfo?.alias_pattern || !donor?.type) return [];
      
      const { data, error } = await supabase
        .from('donors')
        .select('name')
        .eq('type', donor.type)
        .ilike('name', aliasInfo.alias_pattern);
      
      if (error) throw error;
      
      // Get unique names
      const uniqueNames = [...new Set((data || []).map(d => d.name))];
      return uniqueNames.sort();
    },
    enabled: !!aliasInfo?.alias_pattern && !!donor?.type,
  });

  // The display name is the canonical name from alias, or the original name
  const displayName = aliasInfo?.canonical_name || donor?.name || '';

  // Fetch all donor records with the same display name (across all types)
  const { data: donorRecords = [], isLoading: recordsLoading } = useQuery({
    queryKey: ['donor-records', displayName, aliasInfo?.alias_pattern],
    queryFn: async () => {
      if (!donor?.name) return [] as DonorRecord[];
      
      let query = supabase
        .from('donors')
        .select(`*, candidates (id, name, party, office, state, district, image_url)`)
        .order('amount', { ascending: false });
      
      // If there's an alias, get all donors matching the pattern (across all types)
      if (aliasInfo?.alias_pattern) {
        query = query.ilike('name', aliasInfo.alias_pattern);
      } else if (aliasInfo?.canonical_name) {
        // Match by display_name for consolidated donors
        query = query.or(`name.eq.${donor.name},display_name.eq.${aliasInfo.canonical_name}`);
      } else {
        // Match by exact name OR display_name
        query = query.or(`name.eq.${donor.name},display_name.eq.${donor.name}`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((row) => ({
        ...row,
        candidates: (row as any).candidates,
      })) as DonorRecord[];
    },
    enabled: !!donor?.name,
  });

  // Fetch individual contributions for detailed history (across all types)
  const { data: contributions = [], isLoading: contributionsLoading } = useQuery({
    queryKey: ['donor-contributions', displayName, aliasInfo?.alias_pattern, showAllDonations, donorRecords.length],
    queryFn: async () => {
      if (!donor?.name || donorRecords.length === 0) return [] as ContributionRecord[];

      const donorNames = [...new Set(donorRecords.map(r => r.name).filter(Boolean))];

      let query = supabase
        .from('contributions')
        .select(`*, candidates (id, name, party, office, state)`)
        .order('receipt_date', { ascending: false })
        .limit(showAllDonations ? 5000 : 500);

      // If there's an alias, get all contributions matching the pattern
      if (aliasInfo?.alias_pattern) {
        query = query.ilike('contributor_name', aliasInfo.alias_pattern);
      } else {
        query = query.in('contributor_name', donorNames);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((row) => ({
        ...row,
        candidates: (row as any).candidates,
      })) as ContributionRecord[];
    },
    enabled: !!donor?.name && donorRecords.length > 0,
  });


  // Recipient summary cards (prefer contribution-level recipient IDs, fallback to donor rows)
  const topRecipients = useMemo(() => {
    const grouped = new Map<string, {
      candidate_id: string | null;
      amount: number;
      cycle: string;
      candidates?: DonorRecord['candidates'];
      recipient_committee_name?: string | null;
    }>();

    if (contributions.length > 0) {
      contributions.forEach((contribution) => {
        const key = contribution.candidate_id || contribution.recipient_committee_id || contribution.recipient_committee_name || `unknown-${contribution.id}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.amount += contribution.amount;
        } else {
          grouped.set(key, {
            candidate_id: contribution.candidate_id,
            amount: contribution.amount,
            cycle: contribution.cycle,
            candidates: contribution.candidates || undefined,
            recipient_committee_name: contribution.recipient_committee_name,
          });
        }
      });
    } else {
      donorRecords.forEach((record) => {
        const key = record.candidate_id || record.recipient_committee_name || `unknown-${record.id}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.amount += record.amount;
        } else {
          grouped.set(key, {
            candidate_id: record.candidate_id,
            amount: record.amount,
            cycle: record.cycle,
            candidates: record.candidates,
            recipient_committee_name: record.recipient_committee_name,
          });
        }
      });
    }

    return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount);
  }, [contributions, donorRecords]);

  // Get unique cycles for filter
  const availableCycles = useMemo(() => {
    const cycles = new Set<string>();
    contributions.forEach(c => cycles.add(c.cycle));
    donorRecords.forEach(r => cycles.add(r.cycle));
    return Array.from(cycles).sort().reverse();
  }, [contributions, donorRecords]);

  // Get unique committees for filter
  const availableCommittees = useMemo(() => {
    const committees = new Map<string, string>();
    contributions.forEach(c => {
      if (c.recipient_committee_id && c.recipient_committee_name) {
        committees.set(c.recipient_committee_id, c.recipient_committee_name);
      }
    });
    return Array.from(committees.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [contributions]);

  // Filter contributions by all criteria
  const filteredContributions = useMemo(() => {
    let filtered = contributions;
    
    if (cycleFilter !== 'all') {
      filtered = filtered.filter(c => c.cycle === cycleFilter);
    }
    
    if (committeeFilter !== 'all') {
      filtered = filtered.filter(c => c.recipient_committee_id === committeeFilter);
    }
    
    if (dateRange.start) {
      filtered = filtered.filter(c => c.receipt_date && c.receipt_date >= dateRange.start);
    }
    
    if (dateRange.end) {
      filtered = filtered.filter(c => c.receipt_date && c.receipt_date <= dateRange.end);
    }
    
    return filtered;
  }, [contributions, cycleFilter, committeeFilter, dateRange]);

  // Summary stats for filtered contributions
  const filteredStats = useMemo(() => {
    const total = filteredContributions.reduce((sum, c) => sum + c.amount, 0);
    const avg = filteredContributions.length > 0 ? total / filteredContributions.length : 0;
    return { total, avg, count: filteredContributions.length };
  }, [filteredContributions]);

  const hasActiveFilters = cycleFilter !== 'all' || committeeFilter !== 'all' || dateRange.start || dateRange.end;

  const clearAllFilters = () => {
    setCycleFilter('all');
    setCommitteeFilter('all');
    setDateRange({ start: '', end: '' });
  };

  // Aggregate stats (including type breakdown)
  const stats = useMemo(() => {
    const totalAmount = donorRecords.reduce((sum, r) => sum + r.amount, 0);
    const totalTransactions = donorRecords.reduce((sum, r) => sum + (r.transaction_count || 1), 0);
    const contributionRecipients = new Set(
      contributions
        .map(c => c.candidate_id || c.recipient_committee_id || c.recipient_committee_name)
        .filter((v): v is string => Boolean(v))
    ).size;

    const donorRecipients = new Set(
      donorRecords
        .map(r => r.candidate_id || r.recipient_committee_name)
        .filter((v): v is string => Boolean(v))
    ).size;

    const uniqueRecipients = contributionRecipients || donorRecipients;
    const uniqueCycles = new Set(donorRecords.map(r => r.cycle)).size;
    const uniqueTypes = [...new Set(donorRecords.map(r => r.type))];
    
    // Type breakdown
    const byType = uniqueTypes.map(t => ({
      type: t,
      amount: donorRecords.filter(r => r.type === t).reduce((sum, r) => sum + r.amount, 0),
    })).sort((a, b) => b.amount - a.amount);
    
    return { totalAmount, totalTransactions, uniqueRecipients, uniqueCycles, uniqueTypes, byType };
  }, [contributions, donorRecords]);

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
                  {displayName}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {stats.uniqueTypes.length > 1 ? (
                    stats.uniqueTypes.map(t => (
                      <Badge key={t} variant="outline">{t}</Badge>
                    ))
                  ) : (
                    <Badge variant="outline">{donor.type}</Badge>
                  )}
                  {nameVariations.length > 1 && (
                    <Badge variant="secondary" className="gap-1">
                      <Layers className="h-3 w-3" />
                      {nameVariations.length} name variations
                    </Badge>
                  )}
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
                
                {/* Show name variations if there are multiple */}
                {nameVariations.length > 1 && (
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Name variations included:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {nameVariations.slice(0, 8).map((name, i) => (
                        <Badge key={i} variant="outline" className="text-xs font-normal">
                          {name}
                        </Badge>
                      ))}
                      {nameVariations.length > 8 && (
                        <Badge variant="outline" className="text-xs font-normal">
                          +{nameVariations.length - 8} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
              <Card className="border-border min-w-0">
                <CardContent className="p-3 text-center">
                  <DollarSign className="w-4 h-4 mx-auto mb-1 text-agree" />
                  <p className="text-base lg:text-lg font-bold text-foreground truncate">
                    {formatCompactAmount(stats.totalAmount)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Given</p>
                </CardContent>
              </Card>
              <Card className="border-border min-w-0">
                <CardContent className="p-3 text-center">
                  <Hash className="w-4 h-4 mx-auto mb-1 text-primary" />
                  <p className="text-base lg:text-lg font-bold text-foreground truncate">
                    {formatCompactNumber(stats.totalTransactions)}
                  </p>
                  <p className="text-xs text-muted-foreground">Donations</p>
                </CardContent>
              </Card>
              <Card className="border-border min-w-0">
                <CardContent className="p-3 text-center">
                  <Users className="w-4 h-4 mx-auto mb-1 text-primary" />
                  <p className="text-base lg:text-lg font-bold text-foreground truncate">
                    {formatCompactNumber(stats.uniqueRecipients)}
                  </p>
                  <p className="text-xs text-muted-foreground">Recipients</p>
                </CardContent>
              </Card>
              <Card className="border-border min-w-0">
                <CardContent className="p-3 text-center">
                  <Calendar className="w-4 h-4 mx-auto mb-1 text-primary" />
                  <p className="text-base lg:text-lg font-bold text-foreground truncate">
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
            {(showAllRecipients ? topRecipients : topRecipients.slice(0, 6)).map((record, index) => (
              <Link
                key={`${record.candidate_id || 'unknown'}-${record.cycle}-${index}`}
                to={record.candidate_id ? `/candidate/${record.candidate_id}` : '#'}
                className={`block group ${record.candidate_id ? '' : 'pointer-events-none'}`}
              >
                <Card className="h-full transition-all hover:shadow-md hover:border-primary/30">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {record.candidates?.name || record.recipient_committee_name || 'Unknown'}
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

          {topRecipients.length > 6 && (
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllRecipients(!showAllRecipients)}
              >
                {showAllRecipients ? 'Show Top 6' : `View All Recipients (${topRecipients.length})`}
              </Button>
            </div>
          )}

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
                ({filteredStats.count} of {contributions.length} records)
              </span>
            </div>
            
            <Button 
              variant={showAllDonations ? "default" : "outline"}
              size="sm"
              onClick={() => setShowAllDonations(!showAllDonations)}
            >
              <Filter className="w-4 h-4 mr-2" />
              {showAllDonations ? 'Hide Filters' : 'View All Donations'}
            </Button>
          </div>

          {/* Advanced Filters Panel */}
          {showAllDonations && (
            <Card className="mb-4 p-4 bg-muted/30 border-border">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Cycle Filter */}
                <div>
                  <label className="text-sm font-medium mb-1.5 block text-foreground">Cycle</label>
                  <Select value={cycleFilter} onValueChange={setCycleFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Cycles" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Cycles</SelectItem>
                      {availableCycles.map(cycle => (
                        <SelectItem key={cycle} value={cycle}>{cycle}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Committee Filter */}
                <div>
                  <label className="text-sm font-medium mb-1.5 block text-foreground">Committee</label>
                  <Select value={committeeFilter} onValueChange={setCommitteeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Committees" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Committees</SelectItem>
                      {availableCommittees.map(([id, name]) => (
                        <SelectItem key={id} value={id}>
                          <span className="truncate max-w-[200px] block">{name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Date Range - Start */}
                <div>
                  <label className="text-sm font-medium mb-1.5 block text-foreground">From Date</label>
                  <Input 
                    type="date" 
                    value={dateRange.start}
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="bg-background"
                  />
                </div>
                
                {/* Date Range - End */}
                <div>
                  <label className="text-sm font-medium mb-1.5 block text-foreground">To Date</label>
                  <Input 
                    type="date" 
                    value={dateRange.end}
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="bg-background"
                  />
                </div>
              </div>
              
              {/* Clear Filters and Stats Row */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 pt-4 border-t border-border">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>
                    Total: <strong className="text-foreground">{formatAmount(filteredStats.total)}</strong>
                  </span>
                  <span>
                    Avg: <strong className="text-foreground">{formatAmount(Math.round(filteredStats.avg))}</strong>
                  </span>
                </div>
                
                {hasActiveFilters && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={clearAllFilters}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Clear all filters
                  </Button>
                )}
              </div>
            </Card>
          )}

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
                          ) : contribution.recipient_committee_id ? (
                            <Link 
                              to={`/committee/${contribution.recipient_committee_id}`}
                              className="hover:text-primary transition-colors"
                            >
                              <p className="font-medium text-foreground">
                                {contribution.recipient_committee_name || 'Unknown Committee'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {contribution.recipient_committee_id}
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