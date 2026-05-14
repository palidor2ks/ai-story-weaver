import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowLeft, DollarSign, Users, Landmark, MapPin, Calendar, RefreshCw, TrendingUp, Sparkles } from 'lucide-react';
import { useCommittee, useCommitteeDonors } from '@/hooks/useCommittees';
import { useFetchCommitteeDonors } from '@/hooks/useImportExternalCommittee';
import { useAdminRole } from '@/hooks/useAdminRole';
import { RecipientAIAnalysisDialog } from '@/components/RecipientAIAnalysisDialog';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

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

export const CommitteeProfile = () => {
  const { id } = useParams<{ id: string }>();
  const { data: committee, isLoading: committeeLoading } = useCommittee(id);
  const { data: donors = [], isLoading: donorsLoading } = useCommitteeDonors(id);
  const { data: adminData } = useAdminRole();
  const fetchDonorsMutation = useFetchCommitteeDonors();

  const isAdmin = adminData?.isAdmin ?? false;
  const isLoading = committeeLoading || donorsLoading;

  const availableCycles = useMemo(() => {
    const baseYear = new Date().getFullYear();
    const baseline = baseYear % 2 === 0 ? baseYear : baseYear + 1;
    const set = new Set<string>([String(baseline), String(baseline - 2)]);
    (committee?.cycles ?? []).forEach((c) => c && set.add(String(c)));
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [committee?.cycles]);
  const [selectedCycle, setSelectedCycle] = useState<string | undefined>(undefined);
  const effectiveCycle = selectedCycle ?? availableCycles[0];

  const handleSyncDonors = () => {
    if (!committee?.fecCommitteeId) return;
    fetchDonorsMutation.mutate({ committeeId: committee.fecCommitteeId, cycle: effectiveCycle ?? '2024' });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-8 px-4">
        <div className="flex items-center gap-2 mb-6">
          <Link to="/committees">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <p className="text-sm text-muted-foreground">Back to Committees</p>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!isLoading && !committee && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">Committee not found.</p>
            <Link to="/committees">
              <Button className="mt-4">Return to list</Button>
            </Link>
          </div>
        )}

        {committee && (
          <div className="space-y-8">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Landmark className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Committee</p>
                  <h1 className="font-display text-3xl font-bold text-foreground leading-tight">
                    {committee.name || 'Unknown Committee'}
                  </h1>
                  <p className="text-muted-foreground mt-1">
                    FEC ID: {committee.fecCommitteeId}
                  </p>
                  {committee.candidate && (
                    <p className="text-muted-foreground text-sm">
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

                <RecipientAIAnalysisDialog
                  entityType="committee"
                  entityId={committee.fecCommitteeId}
                  displayName={committee.name || 'Unknown Committee'}
                  cycle={effectiveCycle ?? undefined}
                  trigger={
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      AI analysis
                    </Button>
                  }
                />
                
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
                  <p className="text-xs text-muted-foreground mt-1">Includes latest synced totals</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="w-4 h-4" />
                    Unique Donors
                  </div>
                  <p className="text-2xl font-bold text-foreground mt-2">{formatNumber(committee.donorCount)}</p>
                  <p className="text-xs text-muted-foreground mt-1">From committee finance rollups</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Landmark className="w-4 h-4" />
                    Contributions
                  </div>
                  <p className="text-2xl font-bold text-foreground mt-2">{formatNumber(committee.contributionCount)}</p>
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
                              <div className="font-medium text-foreground">{donor.name}</div>
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
