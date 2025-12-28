import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFetchPacExpenditures, useFetchPacDonors } from '@/hooks/usePacExpenditures';
import { useImportExternalCommittee } from '@/hooks/useImportExternalCommittee';
import { useDiscoverSuperPacs } from '@/hooks/useDiscoverSuperPacs';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DollarSign, RefreshCw, Loader2, Users, Search, Plus, Download, Clock, Sparkles } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const formatCurrency = (value: number) => {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${Math.round(value / 1_000)}K`;
  }
  return `$${value.toLocaleString()}`;
};

const formatPercent = (value: number) => {
  return `${Math.round(value)}%`;
};

export function PacExpenditurePanel() {
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [fetchingDonorsId, setFetchingDonorsId] = useState<string | null>(null);
  const [syncingAllDonors, setSyncingAllDonors] = useState(false);
  const [syncingAllExpenditures, setSyncingAllExpenditures] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; type: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importCommitteeId, setImportCommitteeId] = useState('');
  const [discoverCycle, setDiscoverCycle] = useState('2024');
  const [minSpendThreshold, setMinSpendThreshold] = useState(100000);
  
  const fetchMutation = useFetchPacExpenditures();
  const fetchDonorsMutation = useFetchPacDonors();
  const importMutation = useImportExternalCommittee();
  const discoverMutation = useDiscoverSuperPacs();

  // Fetch external committees (Super PACs) with donor counts
  const { data: externalCommittees = [], isLoading } = useQuery({
    queryKey: ['external-committees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_committees')
        .select('*')
        .eq('role', 'external')
        .eq('active', true)
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch donor counts per PAC
  const { data: donorCounts = {} } = useQuery({
    queryKey: ['pac-donor-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donors')
        .select('recipient_committee_id')
        .is('candidate_id', null);
      
      if (error) throw error;
      
      // Count donors per committee
      const counts: Record<string, number> = {};
      (data || []).forEach(d => {
        if (d.recipient_committee_id) {
          counts[d.recipient_committee_id] = (counts[d.recipient_committee_id] || 0) + 1;
        }
      });
      return counts;
    },
  });

  // Fetch pac_expenditures summary
  const { data: expenditureSummary = {} } = useQuery({
    queryKey: ['pac-expenditure-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pac_candidate_totals')
        .select('committee_id, total_spent, support_total, oppose_total')
        .order('total_spent', { ascending: false });
      
      if (error) throw error;
      
      // Group by committee_id
      const grouped = (data || []).reduce((acc, row) => {
        if (!acc[row.committee_id]) {
          acc[row.committee_id] = { total: 0, support: 0, oppose: 0, candidates: 0 };
        }
        acc[row.committee_id].total += row.total_spent;
        acc[row.committee_id].support += row.support_total;
        acc[row.committee_id].oppose += row.oppose_total;
        acc[row.committee_id].candidates += 1;
        return acc;
      }, {} as Record<string, { total: number; support: number; oppose: number; candidates: number }>);
      
      return grouped;
    },
  });

  const handleFetch = async (committeeId: string) => {
    setFetchingId(committeeId);
    try {
      await fetchMutation.mutateAsync({ committeeId, cycle: '2024' });
    } finally {
      setFetchingId(null);
    }
  };

  const handleFetchDonors = async (committeeId: string) => {
    setFetchingDonorsId(committeeId);
    try {
      await fetchDonorsMutation.mutateAsync({ committeeId, cycle: '2024' });
    } finally {
      setFetchingDonorsId(null);
    }
  };

  const handleSyncAllDonors = async () => {
    if (externalCommittees.length === 0) return;
    
    setSyncingAllDonors(true);
    setSyncProgress({ current: 0, total: externalCommittees.length, type: 'donors' });
    
    for (let i = 0; i < externalCommittees.length; i++) {
      const committee = externalCommittees[i];
      setSyncProgress({ current: i + 1, total: externalCommittees.length, type: 'donors' });
      setFetchingDonorsId(committee.fec_committee_id);
      
      try {
        await fetchDonorsMutation.mutateAsync({ committeeId: committee.fec_committee_id, cycle: '2024' });
      } catch (error) {
        console.error(`Failed to fetch donors for ${committee.name}:`, error);
      }
    }
    
    setFetchingDonorsId(null);
    setSyncingAllDonors(false);
    setSyncProgress(null);
  };

  const handleSyncAllExpenditures = async () => {
    if (externalCommittees.length === 0) return;
    
    setSyncingAllExpenditures(true);
    setSyncProgress({ current: 0, total: externalCommittees.length, type: 'expenditures' });
    
    for (let i = 0; i < externalCommittees.length; i++) {
      const committee = externalCommittees[i];
      setSyncProgress({ current: i + 1, total: externalCommittees.length, type: 'expenditures' });
      setFetchingId(committee.fec_committee_id);
      
      try {
        await fetchMutation.mutateAsync({ committeeId: committee.fec_committee_id, cycle: '2024' });
      } catch (error) {
        console.error(`Failed to fetch expenditures for ${committee.name}:`, error);
      }
    }
    
    setFetchingId(null);
    setSyncingAllExpenditures(false);
    setSyncProgress(null);
  };

  const handleFullSync = async () => {
    await handleSyncAllExpenditures();
    await handleSyncAllDonors();
  };

  const handleImport = async () => {
    if (!importCommitteeId.trim()) return;
    
    try {
      await importMutation.mutateAsync(importCommitteeId.trim());
      setImportCommitteeId('');
      setImportDialogOpen(false);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleDiscover = async () => {
    try {
      await discoverMutation.mutateAsync({ cycle: discoverCycle, minSpend: minSpendThreshold });
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const formatThreshold = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    return `$${Math.round(value / 1_000)}K`;
  };

  const filteredCommittees = externalCommittees.filter(c => 
    !searchQuery || 
    c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.fec_committee_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isSyncing = syncingAllDonors || syncingAllExpenditures || discoverMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Super PACs
            </CardTitle>
            <CardDescription>
              "Discover PACs" finds committees with Schedule E (independent expenditure) activity. 
              PACs that only make contributions won't appear — use "Import by ID" to add any committee manually.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Discover Super PACs - Primary action */}
            <Button
              onClick={handleDiscover}
              disabled={isSyncing}
              className="gap-2"
            >
              {discoverMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Discovering...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Discover PACs ({discoverCycle})
                </>
              )}
            </Button>

            {/* Cycle selector */}
            <Select value={discoverCycle} onValueChange={setDiscoverCycle}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2022">2022</SelectItem>
                <SelectItem value="2020">2020</SelectItem>
              </SelectContent>
            </Select>

            {/* Minimum spend threshold slider */}
            <div className="flex items-center gap-3 bg-muted/50 px-3 py-1.5 rounded-md">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Min Spend:</Label>
              <Slider
                value={[minSpendThreshold]}
                onValueChange={(v) => setMinSpendThreshold(v[0])}
                min={10000}
                max={1000000}
                step={10000}
                className="w-24"
              />
              <span className="text-sm font-medium w-14">{formatThreshold(minSpendThreshold)}</span>
            </div>

            {/* Manual import fallback */}
            <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Import by ID
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import Super PAC by ID</DialogTitle>
                  <DialogDescription>
                    Manually import a specific Super PAC by its FEC Committee ID.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="committee-id">FEC Committee ID</Label>
                    <Input
                      id="committee-id"
                      placeholder="e.g., C00637512"
                      value={importCommitteeId}
                      onChange={(e) => setImportCommitteeId(e.target.value.toUpperCase())}
                    />
                    <p className="text-xs text-muted-foreground">
                      Committee IDs start with "C" followed by 8 digits
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleImport} 
                    disabled={importMutation.isPending || !importCommitteeId.trim()}
                  >
                    {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Import
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {externalCommittees.length > 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={handleSyncAllExpenditures}
                  disabled={isSyncing}
                  className="gap-2"
                >
                  {syncingAllExpenditures ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {syncProgress?.current}/{syncProgress?.total}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Sync All Expenditures
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSyncAllDonors}
                  disabled={isSyncing}
                  className="gap-2"
                >
                  {syncingAllDonors ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {syncProgress?.current}/{syncProgress?.total}
                    </>
                  ) : (
                    <>
                      <Users className="h-4 w-4" />
                      Sync All Donors
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleFullSync}
                  disabled={isSyncing}
                  className="gap-2"
                >
                  {isSyncing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Full Sync All
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search */}
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search PACs by name or FEC ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredCommittees.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchQuery ? (
              <p>No PACs match your search.</p>
            ) : (
              <>
                <p>No Super PACs imported yet.</p>
                <p className="text-sm mt-1">Click "Import Super PAC" to add one.</p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PAC Name</TableHead>
                  <TableHead>FEC ID</TableHead>
                  <TableHead className="text-center">Donors</TableHead>
                  <TableHead className="text-right">Support</TableHead>
                  <TableHead className="text-right">Oppose</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Split</TableHead>
                  <TableHead className="text-center">Last Synced</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCommittees.map((committee) => {
                  const summary = expenditureSummary[committee.fec_committee_id];
                  const hasData = !!summary;
                  const donorCount = donorCounts[committee.fec_committee_id] || 0;
                  const supportPct = hasData && summary.total > 0 ? (summary.support / summary.total) * 100 : 0;
                  const opposePct = hasData && summary.total > 0 ? (summary.oppose / summary.total) * 100 : 0;
                  const lastSync = committee.last_sync_completed_at;
                  
                  return (
                    <TableRow key={committee.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {committee.name || 'Unknown'}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {committee.fec_committee_id}
                        </code>
                      </TableCell>
                      <TableCell className="text-center">
                        {donorCount > 0 ? (
                          <Badge variant="secondary">{donorCount.toLocaleString()}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {hasData ? (
                          <span className="text-agree font-medium">
                            {formatCurrency(summary.support)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {hasData ? (
                          <span className="text-disagree font-medium">
                            {formatCurrency(summary.oppose)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {hasData ? (
                          <span className="font-bold">
                            {formatCurrency(summary.total)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {hasData && summary.total > 0 ? (
                          <div className="flex items-center gap-1 justify-center">
                            <span className="text-xs text-agree">{formatPercent(supportPct)}</span>
                            <span className="text-xs text-muted-foreground">/</span>
                            <span className="text-xs text-disagree">{formatPercent(opposePct)}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {lastSync ? (
                          <div className="flex items-center gap-1 justify-center text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(lastSync), { addSuffix: true })}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">Never</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFetch(committee.fec_committee_id)}
                            disabled={fetchingId === committee.fec_committee_id || isSyncing}
                            title="Fetch expenditures (Schedule E)"
                          >
                            {fetchingId === committee.fec_committee_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleFetchDonors(committee.fec_committee_id)}
                            disabled={fetchingDonorsId === committee.fec_committee_id || isSyncing}
                            title="Fetch donors (Schedule A)"
                          >
                            {fetchingDonorsId === committee.fec_committee_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Users className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
