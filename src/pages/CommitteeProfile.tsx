import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowLeft, DollarSign, Users, Landmark, MapPin, Calendar, RefreshCw, TrendingUp, Sparkles } from 'lucide-react';
import { useCommittee, useCommitteeDonors } from '@/hooks/useCommittees';
import { useFetchCommitteeDonors, useImportExternalCommittee } from '@/hooks/useImportExternalCommittee';
import { useAdminRole } from '@/hooks/useAdminRole';
import { useIEExclusions, useRestoreCommittee } from '@/hooks/useIEExclusions';
import { toast } from 'sonner';
import { RecipientAIAnalysisDialog } from '@/components/RecipientAIAnalysisDialog';
import { CommitteeIESection } from '@/components/IndependentExpenditureSections';
import { CommitteeTopicBadge } from '@/components/CommitteeTopicBadge';
import { formatCompactCurrency as formatCurrency } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? '—'
    : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatNumber = (value: number) =>
  value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1_000
      ? `${(value / 1_000).toFixed(0)}K`
      : value.toLocaleString();

const raisedSourceCopy = (source: string | undefined) => {
  if (source === 'external_fec') return 'From FEC receipt totals for this external committee';
  if (source === 'local_contributions') return 'Calculated from synced contribution entries';
  if (source === 'independent_expenditures') return 'No receipt totals synced yet; spending is shown below';
  return 'Includes latest synced totals';
};

export const CommitteeProfile = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const location = useLocation();
  // Load committee once (no cycle) to discover available cycles, then re-query scoped to selected cycle below.
  const { data: committeeBase } = useCommittee(id);
  const { data: adminData } = useAdminRole();
  const { data: ieExclusions = [] } = useIEExclusions();
  const restoreCommittee = useRestoreCommittee();
  const fetchDonorsMutation = useFetchCommitteeDonors();
  const importCommitteeMutation = useImportExternalCommittee();

  const isAdmin = adminData?.isAdmin ?? false;
  const exclusion = useMemo(
    () => ieExclusions.find((e) => e.fec_committee_id === (committeeBase?.fecCommitteeId ?? id)),
    [ieExclusions, committeeBase?.fecCommitteeId, id],
  );

  const handleRestore = async () => {
    if (!exclusion) return;
    try {
      await restoreCommittee.mutateAsync(exclusion.fec_committee_id);
      toast.success('Committee restored to IE rollups');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to restore');
    }
  };

  const fromState = (location.state as { from?: string } | null)?.from;
  // If the committee has no candidate-committee receipts, it's an outside-spender (IE-only) committee
  // that lives on /top-spenders rather than /committees.
  const isOutsideSpenderOnly = !!committeeBase && !committeeBase.totalRaised && !committeeBase.candidate;
  const backTo = fromState === '/top-spenders' || fromState === '/committees'
    ? fromState
    : isOutsideSpenderOnly ? '/top-spenders' : '/committees';
  const backLabel = backTo === '/top-spenders' ? 'Back to Top Spenders' : 'Back to Committees';

  const availableCycles = useMemo(() => {
    const baseYear = new Date().getFullYear();
    const baseline = baseYear % 2 === 0 ? baseYear : baseYear + 1;
    const set = new Set<string>([String(baseline), String(baseline - 2)]);
    (committeeBase?.cycles ?? []).forEach((c) => c && set.add(String(c)));
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [committeeBase?.cycles]);
  const [selectedCycle, setSelectedCycle] = useState<string | undefined>(undefined);
  const effectiveCycle = selectedCycle ?? availableCycles[0] ?? '2024';

  // Re-query committee scoped to the selected cycle so totals (raised, donors, contributions) match the filter.
  const { data: committeeScoped, isLoading: committeeLoading } = useCommittee(id, effectiveCycle);
  const committee = committeeScoped ?? committeeBase;

  const { data: donors = [], isLoading: donorsLoading } = useCommitteeDonors(id, effectiveCycle);
  const isLoading = committeeLoading || donorsLoading;

  const handleSyncDonors = async () => {
    if (!committee?.fecCommitteeId) return;
    const fecId = committee.fecCommitteeId;
    const cycle = effectiveCycle ?? '2024';
    try {
      await fetchDonorsMutation.mutateAsync({ committeeId: fecId, cycle });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/Committee not found/i.test(msg)) {
        try {
          await importCommitteeMutation.mutateAsync(fecId);
          await fetchDonorsMutation.mutateAsync({ committeeId: fecId, cycle });
        } catch {
          /* toast already shown by mutation onError */
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title={`${committee?.name ?? 'Committee'} — Pulse`}
        description={`Donor breakdown, totals, and contribution history for ${committee?.name ?? 'this committee'}.`}
        path={`/committee/${committee?.id ?? ''}`}
        type="article"
      />
      <Header />

      {/* Mobile back sub-bar — sits directly under Header */}
      <div className="md:hidden sticky top-16 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-10 items-center px-4">
          <Link to={backTo} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
            <span>{backLabel}</span>
          </Link>
        </div>
      </div>

      <main className="container py-8 px-4">
        <div className="hidden md:flex items-center gap-2 mb-6">
          <Link to={backTo}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <p className="text-sm text-muted-foreground">{backLabel}</p>
        </div>

        {isAdmin && exclusion && (
          <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-destructive">Excluded from public IE rollups</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Reason: {exclusion.reason} · Excluded {new Date(exclusion.excluded_at).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Non-admins do not see this committee in Top Spenders, candidate IE summaries, or election dialogs.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={handleRestore} disabled={restoreCommittee.isPending}>
              {restoreCommittee.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              Restore
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!isLoading && !committee && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">Committee not found.</p>
            <Link to={backTo}>
              <Button className="mt-4">Return to list</Button>
            </Link>
          </div>
        )}

        {committee && (
          <div className="space-y-8">
            <div className="md:static sticky top-[6.5rem] z-30 -mx-4 px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border md:border-0 md:bg-transparent md:backdrop-blur-none md:py-0 md:mx-0 md:px-0 flex flex-col gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Landmark className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs md:text-sm text-muted-foreground md:mb-1">Committee</p>
                  <h1 className="font-display text-xl md:text-3xl font-bold text-foreground leading-tight truncate">
                    {committee.name || 'Unknown Committee'}
                  </h1>
                  <p className="text-muted-foreground text-xs md:text-base md:mt-1 truncate">
                    FEC ID: {committee.fecCommitteeId}
                  </p>
                  {committee.candidate && (
                    <p className="hidden md:block text-muted-foreground text-sm">
                      Linked Candidate: {committee.candidate.name} ({committee.candidate.party}) • {committee.candidate.office} {committee.candidate.state}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {committee.designation && <Badge variant="secondary">{committee.designation}</Badge>}
                {committee.designationFull && <Badge variant="outline">{committee.designationFull}</Badge>}
                {committee.role && <Badge variant="outline">{committee.role}</Badge>}
                {committee.cycles && committee.cycles.length > 0 && (
                  <Badge variant="outline">Cycles: {committee.cycles.join(', ')}</Badge>
                )}
                <CommitteeTopicBadge
                  fecCommitteeId={committee.fecCommitteeId}
                  size="md"
                  showSecondaries
                />


                {user && <RecipientAIAnalysisDialog
                  entityKind="committee"
                  entityId={committee.id ?? committee.fecCommitteeId ?? ''}
                  entityName={committee.name || 'Unknown Committee'}
                  fecId={committee.fecCommitteeId ?? null}
                  cycle={effectiveCycle ?? null}
                  trigger={
                    <IconActionButton
                      label="AI Analysis"
                      icon={<Sparkles className="h-4 w-4" />}
                      className="ml-1"
                    />
                  }
                />}

                {/* Admin Sync Button */}
                {isAdmin && (
                  <div className="ml-2 flex items-center gap-2">
                    <Select value={effectiveCycle ?? ''} onValueChange={setSelectedCycle}>
                      <SelectTrigger className="h-8 w-[130px]">
                        <SelectValue placeholder="Cycle" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCycles.map((cy) => (
                          <SelectItem key={cy} value={cy}>{cy} Cycle</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSyncDonors}
                      disabled={fetchDonorsMutation.isPending}
                    >
                      {fetchDonorsMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Sync Donors
                    </Button>
                  </div>
                )}
              </div>
            </div>


            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <DollarSign className="w-4 h-4" />
                    Total Raised
                  </div>
                  <p className="text-2xl font-bold text-foreground mt-2">{formatCurrency(committee.totalRaised)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{raisedSourceCopy(committee.financeSource)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="w-4 h-4" />
                    Unique Donors
                  </div>
                  <p className="text-2xl font-bold text-foreground mt-2">{committee.donorCount == null ? '—' : formatNumber(committee.donorCount)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {committee.financeSource === 'external_fec' ? 'Donor-level sync not available for this total' : 'From committee finance rollups'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Landmark className="w-4 h-4" />
                    Contributions
                  </div>
                  <p className="text-2xl font-bold text-foreground mt-2">{committee.contributionCount == null ? '—' : formatNumber(committee.contributionCount)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Recorded contribution entries</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    Last Sync
                  </div>
                  <p className="text-2xl font-bold text-foreground mt-2">
                    {committee.lastSyncDate ? formatDate(committee.lastSyncDate) : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Last contribution: {committee.lastContributionDate ? formatDate(committee.lastContributionDate) : '—'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Top Contributors Section */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <TrendingUp className="w-5 h-5 text-primary" />
                <h2 className="font-display text-xl font-bold text-foreground">Top Contributors</h2>
              </div>

              {donors.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {donors.slice(0, 6).map((donor) => (
                    <Link key={donor.id} to={`/donor/${donor.id}`}>
                      <Card className="h-full hover:border-primary/50 hover:shadow-md transition-all cursor-pointer">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-foreground truncate">
                                {donor.name}
                              </p>
                              {(donor.city || donor.state) && (
                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                  <MapPin className="w-3 h-3 flex-shrink-0" />
                                  {donor.city && donor.state 
                                    ? `${donor.city}, ${donor.state}` 
                                    : donor.state || donor.city}
                                </p>
                              )}
                            </div>
                          </div>
                          {(donor.employer || donor.occupation) && (
                            <p className="text-xs text-muted-foreground mb-2 truncate">
                              {donor.occupation}{donor.occupation && donor.employer && ' • '}{donor.employer}
                            </p>
                          )}
                          <div className="flex items-center justify-between pt-2 border-t border-border">
                            <span className="text-xs text-muted-foreground">
                              {donor.contributionCount} contribution{donor.contributionCount !== 1 ? 's' : ''}
                            </span>
                            <span className="font-bold text-agree">{formatCurrency(donor.totalAmount)}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground">
                    No contributors found for this committee.
                  </CardContent>
                </Card>
              )}
            </section>

            <CommitteeIESection committeeFecId={committee.fecCommitteeId} cycle={effectiveCycle} />


            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">Donor Details</h2>
                    <p className="text-sm text-muted-foreground">
                      Showing consolidated donors for this committee (top 500 contributions).
                    </p>
                  </div>
                  {committee.candidate && (
                    <Link to={`/candidate/${committee.candidate.id}`}>
                      <Button variant="outline">View Candidate</Button>
                    </Link>
                  )}
                </div>

                {donors.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">No donors recorded for this committee yet.</div>
                ) : (
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Donor</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Contributions</TableHead>
                          <TableHead>Last Contribution</TableHead>
                          <TableHead>Candidate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {donors.map((donor) => (
                          <TableRow key={donor.id}>
                            <TableCell>
                              <Link to={`/donor/${donor.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                                {donor.name}
                              </Link>
                              {(donor.employer || donor.occupation) && (
                                <p className="text-xs text-muted-foreground">
                                  {[donor.occupation, donor.employer].filter(Boolean).join(' • ')}
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {donor.city || donor.state ? (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="w-4 h-4" />
                                  {donor.city && donor.state ? `${donor.city}, ${donor.state}` : donor.state || donor.city}
                                </span>
                              ) : '—'}
                            </TableCell>
                            <TableCell className="font-semibold">{formatCurrency(donor.totalAmount)}</TableCell>
                            <TableCell>{formatNumber(donor.contributionCount)}</TableCell>
                            <TableCell>{formatDate(donor.latestDate)}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {donor.candidateNames?.length
                                ? donor.candidateNames.join(', ')
                                : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};
