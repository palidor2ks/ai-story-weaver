import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { Card, CardContent } from '@/components/ui/card';
import { DonorAIAnalysisDialog } from '@/components/DonorAIAnalysisDialog';
import { ShareDonorButton } from '@/components/ShareDonorButton';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useDonorRecord,
  useDonorAliasInfo,
  useDonorNameVariations,
  useDonorRecords,
  useDonorContributions,
  useActiveCommitteeAliases,
  useDonorPacContributors,
  type DonorRecord,
  type ContributionRecord,
  type PACContributor,
  type CommitteeAlias,
} from '@/hooks/useDonorProfile';
import { getDonorCause, useDonorCauses } from '@/hooks/useDonorCauses';
import { CauseBadge } from '@/components/CauseBadge';
import { useAuth } from '@/context/AuthContext';
import { cn, formatCompactCurrency, formatFullCurrency } from '@/lib/utils';
import { normalizeOfficeName } from '@/lib/officeLabel';
import {
  Building2,
  Calendar,
  DollarSign,
  Filter,
  Hash,
  Info,
  Layers,
  Loader2,
  MapPin,
  TrendingUp,
  User as UserIcon,
  Users,
  X,
  Landmark,
  Sparkles
} from 'lucide-react';
import { isConduitDonor } from '@/lib/conduits';
import { logBadgeEvent } from '@/lib/badges';
import { useNjDonorGiving } from '@/hooks/useNjDonorGiving';
import { DonorStateGiving } from '@/components/DonorStateGiving';

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

const formatAmount = (amount: number) => formatCompactCurrency(amount);
const formatAmountFull = (amount: number) => formatFullCurrency(amount);
const formatCompactAmount = (amount: number) => formatCompactCurrency(amount);



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
  const { user } = useAuth();
  const [cycleFilter, setCycleFilter] = useState<string>('all');
  const [showAllDonations, setShowAllDonations] = useState(false);
  const [committeeFilter, setCommitteeFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [showAllRecipients, setShowAllRecipients] = useState(false);
  const [showAllContributors, setShowAllContributors] = useState(false);
  const [profileCycleFilter, setProfileCycleFilter] = useState<string>('all');

  useEffect(() => { if (id) logBadgeEvent('donor_viewed', { donor_id: id }); }, [id]);

  // Fetch the specific donor record
  const { data: donor, isLoading: donorLoading } = useDonorRecord(id);

  // Check if this donor has an alias via donor_alias_members
  const { data: aliasInfo } = useDonorAliasInfo(donor);

  // Get all member name variations for this alias
  const { data: nameVariations = [] } = useDonorNameVariations(aliasInfo, donor?.type);

  // The display name is the canonical name from alias, or the original name
  const displayName = aliasInfo?.canonical_name || donor?.name || '';

  const { data: donorCauseMap } = useDonorCauses(
    donor ? [{ name: displayName, type: donor.type }] : []
  );
  const donorPrimaryCause = donor ? getDonorCause(donorCauseMap, displayName, donor.type) : undefined;

  // Fetch all donor records with the same display name (across all types)
  const { data: donorRecords = [], isLoading: recordsLoading } = useDonorRecords(
    donor,
    aliasInfo,
    nameVariations,
    displayName,
  );

  // Fetch individual contributions for detailed history (across all types)
  const { data: contributions = [], isLoading: contributionsLoading } = useDonorContributions(
    donor,
    aliasInfo,
    displayName,
    showAllDonations,
    donorRecords,
  );

  const { data: committeeAliases = [] } = useActiveCommitteeAliases();

  const committeeAliasById = useMemo(() => {
    const map = new Map<string, CommitteeAlias>();
    committeeAliases.forEach((alias) => {
      alias.fec_committee_ids.forEach((fecId) => map.set(fecId.toUpperCase(), alias));
    });
    return map;
  }, [committeeAliases]);

  const { data: pacContributors = [] } = useDonorPacContributors(
    donor,
    aliasInfo,
    displayName,
    nameVariations,
    id,
  );


  // Recipient summary cards (prefer contribution-level recipient IDs, fallback to donor rows)
  const topRecipients = useMemo(() => {
    const grouped = new Map<string, {
      candidate_id: string | null;
      amount: number;
      candidates?: DonorRecord['candidates'];
      recipient_committee_name?: string | null;
      recipient_committee_id?: string | null;
    }>();

    if (contributions.length > 0) {
      const src = profileCycleFilter === 'all'
        ? contributions
        : contributions.filter(c => c.cycle === profileCycleFilter);
      src.forEach((contribution) => {
        const recipientAlias = contribution.recipient_committee_id
          ? committeeAliasById.get(contribution.recipient_committee_id.toUpperCase())
          : undefined;
        const key = recipientAlias
          ? `alias:${recipientAlias.id}`
          : contribution.candidate_id || contribution.recipient_committee_id || contribution.recipient_committee_name || `unknown-${contribution.id}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.amount += contribution.amount;
        } else {
          grouped.set(key, {
            candidate_id: recipientAlias ? null : contribution.candidate_id,
            amount: contribution.amount,
            candidates: recipientAlias ? undefined : contribution.candidates || undefined,
            recipient_committee_name: recipientAlias?.canonical_name || contribution.recipient_committee_name,
            recipient_committee_id: contribution.recipient_committee_id,
          });
        }
      });
    } else {
      const src = profileCycleFilter === 'all'
        ? donorRecords
        : donorRecords.filter(r => r.cycle === profileCycleFilter);
      src.forEach((record) => {
        const recipientAlias = record.recipient_committee_id
          ? committeeAliasById.get(record.recipient_committee_id.toUpperCase())
          : undefined;
        const key = recipientAlias
          ? `alias:${recipientAlias.id}`
          : record.candidate_id || record.recipient_committee_id || record.recipient_committee_name || `unknown-${record.id}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.amount += record.amount;
        } else {
          grouped.set(key, {
            candidate_id: recipientAlias ? null : record.candidate_id,
            amount: record.amount,
            candidates: recipientAlias ? undefined : record.candidates,
            recipient_committee_name: recipientAlias?.canonical_name || record.recipient_committee_name,
            recipient_committee_id: record.recipient_committee_id,
          });
        }
      });
    }

    return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount);
  }, [committeeAliasById, contributions, donorRecords, profileCycleFilter]);

  // Get unique cycles for filter (contributions/recipients panel)
  const availableCycles = useMemo(() => {
    const cycles = new Set<string>();
    contributions.forEach(c => cycles.add(c.cycle));
    donorRecords.forEach(r => cycles.add(r.cycle));
    return Array.from(cycles).sort().reverse();
  }, [contributions, donorRecords]);

  // Cycles available across the whole profile (Contributors + Recipients)
  const profileAvailableCycles = useMemo(() => {
    const cycles = new Set<string>();
    contributions.forEach(c => c.cycle && cycles.add(String(c.cycle)));
    donorRecords.forEach(r => r.cycle && cycles.add(String(r.cycle)));
    pacContributors.forEach(p => Object.keys(p.byCycle).forEach(c => cycles.add(c)));
    return Array.from(cycles).filter(Boolean).sort().reverse();
  }, [contributions, donorRecords, pacContributors]);

  // PAC contributors filtered by selected cycle
  const filteredPacContributors = useMemo(() => {
    if (profileCycleFilter === 'all') return pacContributors;
    return pacContributors
      .map(p => {
        const c = p.byCycle[profileCycleFilter];
        if (!c || c.totalAmount <= 0) return null;
        return {
          name: p.name,
          totalAmount: c.totalAmount,
          contributionCount: c.contributionCount,
          byCycle: p.byCycle,
        } as PACContributor;
      })
      .filter((x): x is PACContributor => x !== null)
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [pacContributors, profileCycleFilter]);

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
        .map(c => {
          const alias = c.recipient_committee_id ? committeeAliasById.get(c.recipient_committee_id.toUpperCase()) : undefined;
          return alias ? `alias:${alias.id}` : c.candidate_id || c.recipient_committee_id || c.recipient_committee_name;
        })
        .filter((v): v is string => Boolean(v))
    ).size;

    const donorRecipients = new Set(
      donorRecords
        .map(r => {
          const alias = r.recipient_committee_id ? committeeAliasById.get(r.recipient_committee_id.toUpperCase()) : undefined;
          return alias ? `alias:${alias.id}` : r.candidate_id || r.recipient_committee_id || r.recipient_committee_name;
        })
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
  }, [committeeAliasById, contributions, donorRecords]);

  // NJ state (ELEC) giving for this donor, matched by the same name variations.
  const njNames = useMemo(() => {
    const all = [displayName, donor?.name, ...nameVariations].filter(Boolean) as string[];
    return [...new Set(all.map((n) => n.trim()).filter(Boolean))];
  }, [displayName, donor?.name, nameVariations]);

  const { data: njGiving } = useNjDonorGiving(njNames);

  const federalAmount = stats.totalAmount;
  const stateAmount = njGiving?.total ?? 0;
  const spansBoth = federalAmount > 0 && stateAmount > 0;
  const combinedTotal = federalAmount + stateAmount;
  const combinedTransactions = stats.totalTransactions + (njGiving?.transactionCount ?? 0);
  const combinedRecipients = stats.uniqueRecipients + (njGiving?.recipients.length ?? 0);
  const combinedCycles = stats.uniqueCycles + (njGiving?.cycles.length ?? 0);

  const isLoading = donorLoading || recordsLoading || contributionsLoading;

  if (isLoading) {
    return (
    <div className="min-h-screen bg-poli-surface overflow-x-hidden">
        <Header />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-poli-navy" />
        </div>
      </div>
    );
  }

  if (!donor) {
    return (
      <div className="min-h-screen bg-poli-surface">
        <Header />
        <main className="container py-8 px-4 text-center">
          <p className="text-poli-muted mb-4">Donor not found.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-poli-surface">
      <Seo
        title={`${displayName} — Donor Profile — Pulse`}
        description={`Contributions, recipients, and giving history for donor ${displayName}.`}
        path={`/donor/${donor.id}`}
        type="profile"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": donor.type === 'Individual' ? "Person" : "Organization",
          name: displayName,
          url: `https://www.polipulseapp.com/donor/${donor.id}`,
        }}
      />
      <Header />

      <div className="bg-gradient-to-br from-poli-navy to-poli-dark text-white px-4 pt-12 pb-10">
        <p className="font-mono-label text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">
          DONOR PROFILE
        </p>
        <h1 className="text-2xl font-black text-white leading-tight">
          {displayName}
        </h1>
        <p className="text-sm text-white/70 mt-1">
          {donor.type}
          {donor.contributor_city && donor.contributor_state
            ? ` · ${donor.contributor_city}, ${donor.contributor_state}`
            : ''}
        </p>
      </div>

      <main className="container py-8 px-4 space-y-8 pb-20">
        {/* Conduit explainer — only claim "$0" once the zeroing backfill has run */}
        {isConduitDonor(donor) && (
          <div className="p-4 rounded-lg bg-muted/50 border border-border text-sm text-poli-muted flex items-start gap-2">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              <span className="font-medium text-poli-body">{displayName}</span> is a payment
              processor (an FEC “conduit”), not a donor. Donations made through it are credited
              to the individual donors who gave them and excluded from candidate donor lists
              {combinedTotal === 0 ? ', so the dollar totals on this page are intentionally $0' : ''}.
            </span>
          </div>
        )}

        {/* Mobile sticky identity bar */}
        <div className="md:hidden sticky top-16 z-30 -mx-4 px-4 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            {getTypeIcon(donor.type)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display font-bold text-sm truncate">{displayName}</p>
            <p className="text-xs text-poli-muted truncate">{donor.type}{donor.contributor_state ? ` · ${donor.contributor_city ?? ''} ${donor.contributor_state}` : ''}</p>
          </div>
        </div>

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
                  {donorPrimaryCause && <CauseBadge cause={donorPrimaryCause} />}
                  {nameVariations.length > 1 && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <button
                          type="button"
                          className={cn(badgeVariants({ variant: 'secondary' }), 'gap-1 cursor-pointer hover:bg-secondary/80')}
                          aria-label={`View all ${nameVariations.length} name variations`}
                        >
                          <Layers className="h-3 w-3" />
                          {nameVariations.length} name variations
                        </button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Name variations included</DialogTitle>
                          <DialogDescription>
                            All donor names grouped under {displayName}.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="max-h-[60vh] overflow-y-auto pr-1">
                          <div className="flex flex-wrap gap-2">
                            {nameVariations.map((name, i) => (
                              <Badge key={`${name}-${i}`} variant="outline" className="text-xs font-normal">
                                {name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                  {donor.contributor_city && donor.contributor_state && (
                    <span className="flex items-center gap-1 text-sm text-poli-muted">
                      <MapPin className="w-3.5 h-3.5" />
                      {donor.contributor_city}, {donor.contributor_state}
                    </span>
                  )}
                </div>
                {(donor.employer || donor.occupation) && (
                  <p className="text-sm text-poli-muted">
                    {donor.occupation}{donor.occupation && donor.employer && ' at '}{donor.employer}
                  </p>
                )}

              </div>
            </div>

            {/* Right column: share + stats */}
            <div className="flex flex-col gap-3 shrink-0">
              <div className="flex justify-end">
                <ShareDonorButton
                  donorName={displayName}
                  donorType={donor.type}
                  donorLocation={
                    donor.contributor_city && donor.contributor_state
                      ? `${donor.contributor_city}, ${donor.contributor_state}`
                      : null
                  }
                  totalGiven={formatCompactAmount(combinedTotal)}
                  donationCount={formatCompactNumber(combinedTransactions)}
                  recipientCount={formatCompactNumber(combinedRecipients)}
                  cycleCount={combinedCycles}
                  profileUrl={typeof window !== 'undefined' ? window.location.href : ''}
                />
              </div>
              {/* Stats grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <Card className="border-border min-w-0">
                  <CardContent className="p-3 text-center">
                    <DollarSign className="w-4 h-4 mx-auto mb-1 text-agree" />
                    <p className="text-base lg:text-lg font-bold text-foreground truncate">
                      {formatCompactAmount(combinedTotal)}
                    </p>
                    <p className="text-xs text-poli-muted">Total Given</p>
                  </CardContent>
                </Card>
                <Card className="border-border min-w-0">
                  <CardContent className="p-3 text-center">
                    <Hash className="w-4 h-4 mx-auto mb-1 text-poli-navy" />
                    <p className="text-base lg:text-lg font-bold text-poli-body truncate">
                      {formatCompactNumber(combinedTransactions)}
                    </p>
                    <p className="text-xs text-poli-muted">Donations</p>
                  </CardContent>
                </Card>
                <Card className="border-border min-w-0">
                  <CardContent className="p-3 text-center">
                    <Users className="w-4 h-4 mx-auto mb-1 text-poli-navy" />
                    <p className="text-base lg:text-lg font-bold text-poli-body truncate">
                      {formatCompactNumber(combinedRecipients)}
                    </p>
                    <p className="text-xs text-poli-muted">Recipients</p>
                  </CardContent>
                </Card>
                <Card className="border-border min-w-0">
                  <CardContent className="p-3 text-center">
                    <Calendar className="w-4 h-4 mx-auto mb-1 text-poli-navy" />
                    <p className="text-base lg:text-lg font-bold text-poli-body truncate">
                      {combinedCycles}
                    </p>
                    <p className="text-xs text-poli-muted">Cycles</p>
                  </CardContent>
                </Card>
              </div>
              {(spansBoth || stateAmount > 0) && (
                <div className="flex items-center justify-center lg:justify-end gap-2 text-xs text-poli-muted">
                  <span className="font-medium text-poli-body">Federal {formatCompactAmount(federalAmount)}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 text-violet-700 dark:text-violet-400">
                    <Landmark className="h-3 w-3" /> NJ {formatCompactAmount(stateAmount)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Shared cycle filter for Contributors + Recipients */}
        {profileAvailableCycles.length > 1 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-poli-muted">Filter by cycle</p>
            <Select value={profileCycleFilter} onValueChange={setProfileCycleFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cycles</SelectItem>
                {profileAvailableCycles.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Top Contributors to this PAC (PAC/Org only, shown first) */}
        {(donor.type === 'PAC' || donor.type === 'Organization') && pacContributors.length > 0 && (
          <section>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4 min-w-0">
              <Users className="w-5 h-5 text-poli-navy shrink-0" />
              <h2 className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest">Top Contributors to this PAC</h2>
              <span className="text-sm text-poli-muted">({filteredPacContributors.length} {profileCycleFilter === 'all' ? 'total' : `in ${profileCycleFilter}`})</span>
            </div>

            {filteredPacContributors.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-poli-muted">
                  No contributors in cycle {profileCycleFilter}.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(showAllContributors ? filteredPacContributors : filteredPacContributors.slice(0, 6)).map((contributor, index) => {
                  const contributorKey = `contributor:${contributor.name}`;
                  return (
                    <Card
                      key={`${contributor.name}-${index}`}
                      className="h-full transition-all hover:shadow-md hover:border-primary/30 group min-w-0"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-2 min-w-0">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                              {contributor.name}
                            </p>
                            <p className="text-sm text-poli-muted">
                              {formatCompactNumber(contributor.contributionCount)} contribution{contributor.contributionCount === 1 ? '' : 's'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-end pt-2 border-t border-border">
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-bold text-agree">{formatAmount(contributor.totalAmount)}</span>
                            {user && <DonorAIAnalysisDialog
                              id={contributorKey}
                              name={contributor.name}
                              type="Individual"
                              trigger={
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-primary hover:text-primary"
                                  aria-label="Open AI analysis"
                                  title="Open AI analysis"
                                >
                                  <Sparkles className="h-3.5 w-3.5" />
                                  <span className="ml-1 text-xs font-semibold">AI</span>
                                </Button>
                              }
                            />}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {filteredPacContributors.length > 6 && (
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAllContributors(!showAllContributors)}
                >
                  {showAllContributors ? 'Show Top 6' : `View All Contributors (${filteredPacContributors.length})`}
                </Button>
              </div>
            )}
          </section>
        )}

        {/* Top Recipients (federal FEC) */}
        {(donorRecords.length > 0 || stateAmount === 0) && (
        <section>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4 min-w-0">
            <TrendingUp className="w-5 h-5 text-poli-navy shrink-0" />
            <h2 className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest">Top Recipients</h2>
            {profileCycleFilter !== 'all' && (
              <span className="text-sm text-poli-muted">({topRecipients.length} in {profileCycleFilter})</span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(showAllRecipients ? topRecipients : topRecipients.slice(0, 6)).map((record, index) => {
              const recipientName = record.candidates?.name || record.recipient_committee_name || 'Unknown';
              const recipientKey = `recipient:${recipientName}`;
              return (
                <Card
                  key={`${record.candidate_id || recipientName || 'unknown'}-${index}`}
                  className="h-full transition-all hover:shadow-md hover:border-primary/30 group min-w-0"
                >
                  <CardContent className="p-4">
                    <Link
                      to={record.candidate_id ? `/candidate/${record.candidate_id}` : '#'}
                      className={`block ${record.candidate_id ? '' : 'pointer-events-none'}`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                            {recipientName}
                          </p>
                          <p className="text-sm text-poli-muted">
                            {normalizeOfficeName(record.candidates?.office)} • {record.candidates?.state}
                          </p>
                        </div>
                        {record.candidates?.party && (
                          <Badge variant="outline" className={getPartyColor(record.candidates.party)}>
                            {record.candidates.party.slice(0, 1)}
                          </Badge>
                        )}
                      </div>
                    </Link>
                    <div className="flex items-center justify-end pt-2 border-t border-border">
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold text-agree">{formatAmount(record.amount)}</span>
                        {user && <DonorAIAnalysisDialog
                          id={recipientKey}
                          name={recipientName}
                          type="Organization"
                          profileHref={record.candidate_id ? `/candidate/${record.candidate_id}` : undefined}
                          trigger={
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-primary hover:text-primary"
                              aria-label="Open AI analysis"
                              title="Open AI analysis"
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              <span className="ml-1 text-xs font-semibold">AI</span>
                            </Button>
                          }
                        />}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
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

          {donorRecords.length === 0 && stateAmount === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-poli-muted">
                No recipients found for this donor.
              </CardContent>
            </Card>
          )}
        </section>
        )}

        {/* New Jersey state (ELEC) giving */}
        <DonorStateGiving giving={njGiving} />

        {/* Top Contributors moved above Top Recipients */}


        {/* Detailed Contribution History (federal) — hidden for Individual donors */}
        {donor.type !== 'Individual' && donorRecords.length > 0 && (
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-poli-navy" />
              <h2 className="font-mono-label text-xs font-bold text-poli-red uppercase tracking-widest">Contribution History</h2>
              <span className="text-sm text-poli-muted">
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
                <div className="flex items-center gap-4 text-sm text-poli-muted">
                  <span>
                    Total: <strong className="text-poli-body">{formatAmount(filteredStats.total)}</strong>
                  </span>
                  <span>
                    Avg: <strong className="text-poli-body">{formatAmount(Math.round(filteredStats.avg))}</strong>
                  </span>
                </div>
                
                {hasActiveFilters && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={clearAllFilters}
                    className="text-poli-muted hover:text-poli-body"
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
                    <th className="text-left text-xs font-medium text-poli-muted uppercase tracking-wide px-4 py-3">
                      Recipient
                    </th>
                    <th className="text-left text-xs font-medium text-poli-muted uppercase tracking-wide px-4 py-3 hidden sm:table-cell">
                      Date
                    </th>
                    <th className="text-left text-xs font-medium text-poli-muted uppercase tracking-wide px-4 py-3">
                      Cycle
                    </th>
                    <th className="text-right text-xs font-medium text-poli-muted uppercase tracking-wide px-4 py-3">
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
                              <p className="text-xs text-poli-muted">
                                {normalizeOfficeName(contribution.candidates.office)} • {contribution.candidates.state}
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
                              <p className="text-xs text-poli-muted">
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
                      <td className="px-4 py-3 text-sm text-poli-muted hidden sm:table-cell">
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
              <div className="py-10 text-center text-poli-muted">
                No contribution records found.
              </div>
            )}
          </div>
        </section>
        )}
      </main>
    </div>
  );
};

export default DonorProfile;
