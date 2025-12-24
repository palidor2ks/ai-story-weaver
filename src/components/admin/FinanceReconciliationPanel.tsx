import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, ExternalLink, AlertTriangle, CheckCircle2, XCircle, Search, Clock } from 'lucide-react';
import { useCandidatesWithSyncStatus, getSyncStatus, CandidateSyncStatus } from '@/hooks/useFinanceReconciliation';
import { useFECIntegration } from '@/hooks/useFECIntegration';
import { SyncStatusBadge } from '@/components/FinanceReconciliationCard';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

type FilterType = 'all' | 'ok' | 'warning' | 'error' | 'stale' | 'never';

export function FinanceReconciliationPanel() {
  const { data: candidates, isLoading } = useCandidatesWithSyncStatus();
  const { fetchFECDonors, isDonorLoading } = useFECIntegration();
  const queryClient = useQueryClient();
  
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');

  const filteredCandidates = (candidates || []).filter(c => {
    const status = getSyncStatus(c);
    
    // Filter by status
    if (filter !== 'all' && status.status !== filter) return false;
    
    // Filter by search
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    
    return true;
  });

  const handleResync = async (candidate: CandidateSyncStatus) => {
    if (!candidate.fec_candidate_id) return;
    
    const result = await fetchFECDonors(candidate.id, candidate.fec_candidate_id, undefined, false);
    if (result.success) {
      toast.success(`Synced ${result.imported} donors for ${candidate.name}`);
      queryClient.invalidateQueries({ queryKey: ['candidates-sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['finance-reconciliation', candidate.id] });
    } else {
      toast.error(result.error || 'Sync failed');
    }
  };

  // Stats
  const stats = {
    total: candidates?.length || 0,
    ok: candidates?.filter(c => getSyncStatus(c).status === 'ok').length || 0,
    warning: candidates?.filter(c => getSyncStatus(c).status === 'warning').length || 0,
    error: candidates?.filter(c => getSyncStatus(c).status === 'error').length || 0,
    stale: candidates?.filter(c => getSyncStatus(c).status === 'stale').length || 0,
    never: candidates?.filter(c => getSyncStatus(c).status === 'never').length || 0,
  };

  const getPartyColor = (party: string) => {
    switch (party) {
      case 'Democrat': return 'bg-blue-500/10 text-blue-700 border-blue-500/30';
      case 'Republican': return 'bg-red-500/10 text-red-700 border-red-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setFilter('all')}>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className={cn("cursor-pointer hover:border-primary/50 transition-colors", filter === 'ok' && "border-agree")} onClick={() => setFilter('ok')}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-agree" />
              <p className="text-2xl font-bold text-agree">{stats.ok}</p>
            </div>
            <p className="text-xs text-muted-foreground">Matched</p>
          </CardContent>
        </Card>
        <Card className={cn("cursor-pointer hover:border-primary/50 transition-colors", filter === 'warning' && "border-amber-500")} onClick={() => setFilter('warning')}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <p className="text-2xl font-bold text-amber-500">{stats.warning}</p>
            </div>
            <p className="text-xs text-muted-foreground">Warning</p>
          </CardContent>
        </Card>
        <Card className={cn("cursor-pointer hover:border-primary/50 transition-colors", filter === 'error' && "border-destructive")} onClick={() => setFilter('error')}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-destructive" />
              <p className="text-2xl font-bold text-destructive">{stats.error}</p>
            </div>
            <p className="text-xs text-muted-foreground">Mismatch</p>
          </CardContent>
        </Card>
        <Card className={cn("cursor-pointer hover:border-primary/50 transition-colors", filter === 'stale' && "border-orange-500")} onClick={() => setFilter('stale')}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              <p className="text-2xl font-bold text-orange-500">{stats.stale}</p>
            </div>
            <p className="text-xs text-muted-foreground">Stale (&gt;30d)</p>
          </CardContent>
        </Card>
        <Card className={cn("cursor-pointer hover:border-primary/50 transition-colors", filter === 'never' && "border-muted-foreground")} onClick={() => setFilter('never')}>
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-muted-foreground">{stats.never}</p>
            <p className="text-xs text-muted-foreground">Never synced</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Finance Reconciliation</CardTitle>
              <CardDescription>Compare local donor data against FEC totals</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search candidates..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 w-[200px]"
                />
              </div>
              <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="ok">Matched</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="error">Mismatch</SelectItem>
                  <SelectItem value="stale">Stale</SelectItem>
                  <SelectItem value="never">Never synced</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCandidates.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Office</TableHead>
                    <TableHead>Party</TableHead>
                    <TableHead className="text-right">Local Itemized</TableHead>
                    <TableHead className="text-right">FEC Itemized</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Sync</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCandidates.map((candidate) => {
                    const status = getSyncStatus(candidate);
                    const rec = candidate.reconciliation;
                    
                    return (
                      <TableRow key={candidate.id}>
                        <TableCell>
                          <Link 
                            to={`/candidate/${candidate.id}`}
                            className="font-medium hover:underline flex items-center gap-1"
                          >
                            {candidate.name}
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{candidate.office}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-xs", getPartyColor(candidate.party))}>
                            {candidate.party}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {rec?.local_itemized != null ? `$${rec.local_itemized.toLocaleString()}` : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {rec?.fec_itemized != null ? `$${rec.fec_itemized.toLocaleString()}` : '-'}
                        </TableCell>
                        <TableCell>
                          <SyncStatusBadge status={rec?.status || null} deltaPct={rec?.delta_pct || null} />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {candidate.last_donor_sync 
                            ? new Date(candidate.last_donor_sync).toLocaleDateString()
                            : 'Never'
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResync(candidate)}
                            disabled={isDonorLoading(candidate.id)}
                          >
                            <RefreshCw className={cn(
                              "w-4 h-4",
                              isDonorLoading(candidate.id) && "animate-spin"
                            )} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {filter !== 'all' || search 
                ? 'No candidates match your filters'
                : 'No candidates with FEC data found'
              }
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
