import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Check, X, Search, Users, DollarSign, Link2, Layers, RefreshCw, Loader2, Building2, AlertTriangle, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useDonorAliases,
  useCreateDonorAlias,
  useUpdateDonorAlias,
  useDeleteDonorAlias,
  useMatchingDonorsCount,
  DonorAlias,
  DonorAliasInput,
} from '@/hooks/useDonorAliases';
import { useSearchDonors } from '@/hooks/useDonorsPaginated';
import { useUnallocatedCommittees, useCandidatesForAllocation, useAllocateCommittee, useBatchAllocateCommittees, useCommitteeDiagnostics, type BatchAllocateResult } from '@/hooks/useCommitteeAllocation';
import { useImportExternalCommittee, useFetchCommitteeDonors } from '@/hooks/useImportExternalCommittee';

const DONOR_TYPES = ['Individual', 'PAC', 'Organization', 'Unknown'];

const formatAmount = (amount: number) => {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
};

export function DonorAliasesPanel() {
  const queryClient = useQueryClient();
  const { data: aliases, isLoading } = useDonorAliases();
  const createMutation = useCreateDonorAlias();
  const updateMutation = useUpdateDonorAlias();
  const deleteMutation = useDeleteDonorAlias();

  // Alias management state
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAlias, setSelectedAlias] = useState<DonorAlias | null>(null);
  const [formData, setFormData] = useState<DonorAliasInput>({
    canonical_name: '',
    alias_patterns: [''],
    donor_types: ['Individual', 'PAC', 'Organization', 'Unknown'],
    fec_committee_id: '',
    notes: '',
    is_active: true,
  });

  // Donor search state (debounced to avoid hammering the DB on every keystroke)
  const [donorSearch, setDonorSearch] = useState('');
  const [debouncedDonorSearch, setDebouncedDonorSearch] = useState('');
  const [donorTypeFilter, setDonorTypeFilter] = useState('all');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedDonorSearch(donorSearch), 300);
    return () => clearTimeout(t);
  }, [donorSearch]);
  const { data: searchResults = [], isLoading: searchLoading } = useSearchDonors(debouncedDonorSearch, donorTypeFilter);

  const { data: matchCount } = useMatchingDonorsCount(
    formData.alias_patterns.filter(p => p.trim()),
    formData.donor_types
  );

  // Committee allocation hooks - must be at top level of component
  const { data: unallocatedCommittees, isLoading: committeesLoading, refetch: refetchCommittees } = useUnallocatedCommittees();
  const { data: diagnostics } = useCommitteeDiagnostics();
  const { data: allCandidates } = useCandidatesForAllocation();
  const allocateMutation = useAllocateCommittee();
  const batchAllocateMutation = useBatchAllocateCommittees();
  const [selectedCommitteeForAllocation, setSelectedCommitteeForAllocation] = useState<string | null>(null);
  const [forceReallocate, setForceReallocate] = useState(false);
  const [lastBatchResult, setLastBatchResult] = useState<{
    committeesFound: number;
    committeesChanged: number;
    totalContributionsUpdated: number;
    totalDonorsUpdated: number;
    totalTransfersDeleted: number;
  } | null>(null);

  // Import external committee hooks
  const importCommitteeMutation = useImportExternalCommittee();
  const fetchCommitteeDonorsMutation = useFetchCommitteeDonors();
  const [importCommitteeId, setImportCommitteeId] = useState('');
  const [fetchingDonorsForCommittee, setFetchingDonorsForCommittee] = useState<string | null>(null);

  // Display name refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{
    processed: number;
    remaining: number;
    total: number;
  } | null>(null);
  
  // Per-alias backfill state
  const [backfillingAliasId, setBackfillingAliasId] = useState<string | null>(null);
  
  // Conduit committee backfill state
  const [isBackfillingConduit, setIsBackfillingConduit] = useState(false);
  const [conduitBackfillResult, setConduitBackfillResult] = useState<{
    donors: { before: number; updated: number; remaining: number };
    contributions: { before: number; updated: number; remaining: number };
  } | null>(null);

  const handleBackfillAlias = async (aliasId: string) => {
    setBackfillingAliasId(aliasId);
    try {
      const { data, error } = await supabase.functions.invoke('refresh-donor-display-names', {
        body: { alias_id: aliasId }
      });
      
      if (error) {
        console.error('Error backfilling alias:', error);
        toast.error('Failed to backfill alias');
        return;
      }

      if (!data.success) {
        toast.error(data.error || 'Failed to backfill alias');
        return;
      }

      toast.success(data.message || `Updated ${data.processed} donor(s)`);
      
      // Invalidate donors page caches so changes appear immediately
      queryClient.invalidateQueries({ queryKey: ['donors-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['donor-filter-options'] });
      queryClient.invalidateQueries({ queryKey: ['donor-search'] });
    } catch (err) {
      console.error('Error backfilling alias:', err);
      toast.error('An error occurred during backfill');
    } finally {
      setBackfillingAliasId(null);
    }
  };

  const handleRefreshDisplayNames = async () => {
    setIsRefreshing(true);
    let totalProcessed = 0;
    let remaining = 1; // Start with non-zero to enter loop

    try {
      while (remaining > 0) {
        const { data, error } = await supabase.functions.invoke('refresh-donor-display-names');
        
        if (error) {
          console.error('Error refreshing display names:', error);
          toast.error('Failed to refresh display names');
          break;
        }

        if (!data.success) {
          toast.error(data.error || 'Failed to refresh display names');
          break;
        }

        totalProcessed += data.processed;
        remaining = data.remaining;
        
        setRefreshProgress({
          processed: totalProcessed,
          remaining: remaining,
          total: data.totalNull + totalProcessed - data.processed
        });

        if (remaining === 0) {
          toast.success(`Completed! Updated ${totalProcessed} donor display names.`);
        }
      }
      
      // Invalidate donors page caches so changes appear immediately
      queryClient.invalidateQueries({ queryKey: ['donors-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['donor-filter-options'] });
      queryClient.invalidateQueries({ queryKey: ['donor-search'] });
    } catch (err) {
      console.error('Error in refresh loop:', err);
      toast.error('An error occurred during refresh');
    } finally {
      setIsRefreshing(false);
      setRefreshProgress(null);
    }
  };

  const handleBackfillConduitCommittees = async () => {
    setIsBackfillingConduit(true);
    setConduitBackfillResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-conduit-committees');
      
      if (error) {
        console.error('Error backfilling conduit committees:', error);
        toast.error('Failed to backfill conduit committees');
        return;
      }

      if (!data.success) {
        toast.error(data.error || 'Failed to backfill conduit committees');
        return;
      }

      setConduitBackfillResult({
        donors: data.donors,
        contributions: data.contributions
      });
      toast.success(data.message || 'Backfill complete');
    } catch (err) {
      console.error('Error in conduit backfill:', err);
      toast.error('An error occurred during backfill');
    } finally {
      setIsBackfillingConduit(false);
    }
  };

  const filteredAliases = aliases?.filter(
    (a) =>
      a.canonical_name.toLowerCase().includes(search.toLowerCase()) ||
      (a.alias_patterns || [a.alias_pattern]).some(p => p.toLowerCase().includes(search.toLowerCase()))
  );

  // Find current alias for a donor name (checks all types now)
  const findAliasForDonor = (donorName: string, donorType: string) => {
    if (!aliases) return null;
    return aliases.find(alias => {
      if (!alias.is_active) return false;
      // Check if the donor type is in the alias's donor_types array
      if (!alias.donor_types?.includes(donorType)) return false;
      // Check against all patterns in alias_patterns
      const patterns = alias.alias_patterns?.length ? alias.alias_patterns : [alias.alias_pattern];
      return patterns.some(p => {
        const pattern = p.replace(/%/g, '.*').replace(/_/g, '.');
        const regex = new RegExp(`^${pattern}$`, 'i');
        return regex.test(donorName);
      });
    });
  };

  const handleOpenCreate = () => {
    setSelectedAlias(null);
    setFormData({
      canonical_name: '',
      alias_patterns: [''],
      donor_types: ['Individual', 'PAC', 'Organization', 'Unknown'],
      fec_committee_id: '',
      notes: '',
      is_active: true,
    });
    setDialogOpen(true);
  };

  const handleOpenCreateFromDonor = (donorName: string, donorType: string) => {
    setSelectedAlias(null);
    // Create a pattern from the donor name - escape special chars and add wildcards
    const escapedName = donorName.replace(/[%_]/g, '\\$&');
    setFormData({
      canonical_name: donorName,
      alias_patterns: [`%${escapedName}%`],
      donor_types: [donorType], // Start with just the donor's type
      fec_committee_id: '',
      notes: '',
      is_active: true,
    });
    setDialogOpen(true);
  };

  // Quick add donor to existing alias - directly updates and applies
  const handleQuickAddToAlias = async (donorName: string, donorType: string, alias: DonorAlias) => {
    // Check if donor already matches this alias
    const existingMatch = findAliasForDonor(donorName, donorType);
    if (existingMatch?.id === alias.id) {
      toast.info('This donor already matches this alias');
      return;
    }
    
    // Ensure the donor type is included in the alias
    const currentTypes = alias.donor_types || [alias.donor_type];
    const updatedTypes = currentTypes.includes(donorType) 
      ? currentTypes 
      : [...currentTypes, donorType];
    
    // Create new pattern for this donor name
    const escapedName = donorName.replace(/[%_]/g, '\\$&');
    const newPattern = `%${escapedName}%`;
    const currentPatterns = alias.alias_patterns?.length ? alias.alias_patterns : [alias.alias_pattern];
    const updatedPatterns = [...currentPatterns, newPattern];
    
    try {
      // Update the alias with the new pattern and donor type
      await updateMutation.mutateAsync({
        id: alias.id,
        canonical_name: alias.canonical_name,
        alias_patterns: updatedPatterns,
        donor_types: updatedTypes,
        fec_committee_id: alias.fec_committee_id || null,
        notes: alias.notes ? `${alias.notes}\nAdded: ${donorName}` : `Added: ${donorName}`,
        is_active: alias.is_active,
      });
      
      // Directly update this specific donor's display_name in the database
      const { error: updateError } = await supabase
        .from('donors')
        .update({ display_name: alias.canonical_name })
        .eq('name', donorName)
        .eq('type', donorType as 'Individual' | 'PAC' | 'Organization' | 'Unknown');
      
      if (updateError) {
        console.error('Error updating donor display_name:', updateError);
        toast.error('Failed to update donor display name');
        return;
      }
      
      toast.success(`Added "${donorName}" to alias "${alias.canonical_name}"`);
      
      // Invalidate donor search query to refresh the UI
      await queryClient.invalidateQueries({ queryKey: ['donor-search'] });
    } catch (error) {
      console.error('Error adding donor to alias:', error);
      toast.error('Failed to add donor to alias');
    }
  };

  const handleOpenEdit = (alias: DonorAlias) => {
    setSelectedAlias(alias);
    setFormData({
      canonical_name: alias.canonical_name,
      alias_patterns: alias.alias_patterns?.length ? alias.alias_patterns : [alias.alias_pattern],
      donor_types: alias.donor_types || [alias.donor_type],
      fec_committee_id: alias.fec_committee_id || '',
      notes: alias.notes || '',
      is_active: alias.is_active,
    });
    setDialogOpen(true);
  };

  const handleToggleDonorType = (type: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      donor_types: checked 
        ? [...prev.donor_types, type]
        : prev.donor_types.filter(t => t !== type)
    }));
  };

  const handleSubmit = async () => {
    if (selectedAlias) {
      await updateMutation.mutateAsync({ id: selectedAlias.id, ...formData });
    } else {
      await createMutation.mutateAsync(formData);
    }
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (selectedAlias) {
      await deleteMutation.mutateAsync(selectedAlias.id);
      setDeleteDialogOpen(false);
      setSelectedAlias(null);
    }
  };

  const handleOpenDelete = (alias: DonorAlias) => {
    setSelectedAlias(alias);
    setDeleteDialogOpen(true);
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading aliases...</div>;
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="aliases" className="w-full">
        <TabsList>
          <TabsTrigger value="aliases">Manage Aliases</TabsTrigger>
          <TabsTrigger value="search">Search Donors</TabsTrigger>
          <TabsTrigger value="committees">Committee Allocation</TabsTrigger>
        </TabsList>

        {/* Aliases Tab */}
        <TabsContent value="aliases" className="space-y-4">
          {/* Refresh Display Names Card */}
          <Card className="bg-muted/50">
            <CardContent className="py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="font-medium">Refresh Display Names</p>
                  <p className="text-sm text-muted-foreground">
                    Apply alias patterns to all donor display names. Required after adding new aliases.
                  </p>
                </div>
                <Button 
                  onClick={handleRefreshDisplayNames} 
                  disabled={isRefreshing}
                  variant="secondary"
                >
                  {isRefreshing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh Display Names
                    </>
                  )}
                </Button>
              </div>
              {refreshProgress && (
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Progress: {refreshProgress.processed.toLocaleString()} processed</span>
                    <span>{refreshProgress.remaining.toLocaleString()} remaining</span>
                  </div>
                  <Progress 
                    value={refreshProgress.total > 0 
                      ? (refreshProgress.processed / refreshProgress.total) * 100 
                      : 0
                    } 
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Backfill Conduit Committees Card */}
          <Card className="bg-muted/50">
            <CardContent className="py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="font-medium">Backfill Committee Transfer Links</p>
                  <p className="text-sm text-muted-foreground">
                    Link Line 12 transfers to their source committees by matching contributor names to candidate_committees.
                  </p>
                </div>
                <Button 
                  onClick={handleBackfillConduitCommittees} 
                  disabled={isBackfillingConduit}
                  variant="secondary"
                >
                  {isBackfillingConduit ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Backfilling...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4 mr-2" />
                      Backfill Conduit IDs
                    </>
                  )}
                </Button>
              </div>
              {conduitBackfillResult && (
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex gap-4">
                    <span className="text-muted-foreground">
                      Donors: <span className="text-foreground font-medium">{conduitBackfillResult.donors.updated}</span> updated
                      {conduitBackfillResult.donors.remaining > 0 && (
                        <span className="text-amber-500 ml-1">({conduitBackfillResult.donors.remaining} unmatched)</span>
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      Contributions: <span className="text-foreground font-medium">{conduitBackfillResult.contributions.updated}</span> updated
                      {conduitBackfillResult.contributions.remaining > 0 && (
                        <span className="text-amber-500 ml-1">({conduitBackfillResult.contributions.remaining} unmatched)</span>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search aliases..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Alias
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canonical Name</TableHead>
                  <TableHead>Pattern</TableHead>
                  <TableHead>Types</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAliases?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No aliases found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAliases?.map((alias) => (
                    <TableRow key={alias.id}>
                      <TableCell className="font-medium">{alias.canonical_name}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(alias.alias_patterns?.length ? alias.alias_patterns : [alias.alias_pattern]).map((pattern, idx) => (
                            <code key={idx} className="bg-muted px-1.5 py-0.5 rounded text-sm">
                              {pattern}
                            </code>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(alias.donor_types || [alias.donor_type]).map(type => (
                            <Badge key={type} variant="outline" className="text-xs">
                              {type}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {alias.is_active ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">
                        {alias.notes || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(alias)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDelete(alias)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Donor Search Tab */}
        <TabsContent value="search" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Search Donors by Canonical Name</CardTitle>
              <CardDescription>
                Search donors by their canonical name (alias or original name). Assign aliases to group similar donors across all types.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by canonical name (min 2 characters)..."
                    value={donorSearch}
                    onChange={(e) => setDonorSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={donorTypeFilter} onValueChange={setDonorTypeFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {DONOR_TYPES.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Search Results */}
              {donorSearch.length >= 2 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {searchLoading ? 'Searching...' : `Found ${searchResults.length} donor(s)`}
                  </p>
                  
                  {searchResults.length > 0 && (
                    <div className="rounded-md border divide-y max-h-[400px] overflow-y-auto">
                      {searchResults.map((donor, index) => {
                        const existingAlias = findAliasForDonor(donor.name, donor.type);
                        return (
                          <div key={index} className="p-3 hover:bg-muted/50 transition-colors">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-medium text-foreground truncate">{donor.name}</p>
                                  <Badge variant="outline" className="shrink-0">{donor.type}</Badge>
                                  {donor.isConsolidated && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <Badge variant="secondary" className="shrink-0">
                                            <Layers className="h-3 w-3 mr-1" />
                                            {donor.count} merged
                                          </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs font-medium mb-1">Merged names:</p>
                                          <ul className="text-xs">
                                            {donor.nameVariations?.slice(0, 10).map((name: string, i: number) => (
                                              <li key={i}>{name}</li>
                                            ))}
                                            {(donor.nameVariations?.length || 0) > 10 && (
                                              <li>...and {(donor.nameVariations?.length || 0) - 10} more</li>
                                            )}
                                          </ul>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </div>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <DollarSign className="h-3 w-3" />
                                    {formatAmount(donor.totalAmount)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {donor.count} name(s)
                                  </span>
                                </div>
                                {existingAlias && (
                                  <div className="flex items-center gap-1.5 mt-2 text-sm">
                                    <Link2 className="h-3 w-3 text-primary" />
                                    <span className="text-primary font-medium">
                                      Alias: {existingAlias.canonical_name}
                                    </span>
                                    <span className="text-muted-foreground">
                                      ({(existingAlias.donor_types || [existingAlias.donor_type]).join(', ')})
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {existingAlias ? (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleOpenEdit(existingAlias)}
                                    >
                                      <Pencil className="h-3 w-3 mr-1" />
                                      Edit Alias
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleBackfillAlias(existingAlias.id)}
                                      disabled={backfillingAliasId === existingAlias.id}
                                      title="Apply this alias to all matching donors"
                                    >
                                      {backfillingAliasId === existingAlias.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <RefreshCw className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleOpenCreateFromDonor(donor.name, donor.type)}
                                    >
                                      <Plus className="h-3 w-3 mr-1" />
                                      New Alias
                                    </Button>
                                    {aliases && aliases.filter(a => a.is_active).length > 0 && (
                                      <Select
                                        onValueChange={(aliasId) => {
                                          const alias = aliases.find(a => a.id === aliasId);
                                          if (alias) handleQuickAddToAlias(donor.name, donor.type, alias);
                                        }}
                                      >
                                        <SelectTrigger className="w-[140px]">
                                          <SelectValue placeholder="Add to..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {aliases
                                            .filter(a => a.is_active)
                                            .map(alias => (
                                              <SelectItem key={alias.id} value={alias.id}>
                                                {alias.canonical_name}
                                              </SelectItem>
                                            ))}
                                        </SelectContent>
                                      </Select>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!searchLoading && searchResults.length === 0 && donorSearch.length >= 2 && (
                    <div className="py-8 text-center text-muted-foreground">
                      No donors found matching "{donorSearch}"
                    </div>
                  )}
                </div>
              )}

              {donorSearch.length < 2 && donorSearch.length > 0 && (
                <p className="text-sm text-muted-foreground">Type at least 2 characters to search</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Committee Allocation Tab */}
        <TabsContent value="committees" className="space-y-4">
          {/* Import External Committee Card */}
          <Card className="bg-muted/50">
            <CardContent className="py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="font-medium flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Import External Committee
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Import a Super PAC or other committee by FEC Committee ID (e.g., C00879510 for AMERICA PAC)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="FEC Committee ID (e.g., C00879510)"
                    value={importCommitteeId}
                    onChange={(e) => setImportCommitteeId(e.target.value.toUpperCase())}
                    className="w-[280px]"
                  />
                  <Button
                    onClick={async () => {
                      if (!importCommitteeId.trim()) {
                        toast.error('Please enter a committee ID');
                        return;
                      }
                      const result = await importCommitteeMutation.mutateAsync(importCommitteeId.trim());
                      if (result.success && !result.alreadyExists) {
                        // Automatically fetch donors for the newly imported committee
                        setFetchingDonorsForCommittee(importCommitteeId.trim());
                        await fetchCommitteeDonorsMutation.mutateAsync({ committeeId: importCommitteeId.trim() });
                        setFetchingDonorsForCommittee(null);
                        setImportCommitteeId('');
                      }
                    }}
                    disabled={importCommitteeMutation.isPending || fetchCommitteeDonorsMutation.isPending}
                  >
                    {importCommitteeMutation.isPending || fetchCommitteeDonorsMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {fetchCommitteeDonorsMutation.isPending ? 'Fetching Donors...' : 'Importing...'}
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Import & Fetch
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Committee Allocation
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    J/U/B/D committees and imported external committees. Allocate them to candidates to associate their contributions.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="force-reallocate" 
                      checked={forceReallocate} 
                      onCheckedChange={(checked) => setForceReallocate(!!checked)} 
                    />
                    <Label htmlFor="force-reallocate" className="text-sm cursor-pointer">
                      Force Reallocate
                    </Label>
                  </div>
                  <Button
                    onClick={() => {
                      setLastBatchResult(null);
                      batchAllocateMutation.mutate({ cycle: '2024', force: forceReallocate }, {
                        onSuccess: (data) => {
                          setLastBatchResult({
                            committeesFound: data.committeesFound || 0,
                            committeesChanged: data.committeesChanged || 0,
                            totalContributionsUpdated: data.totalContributionsUpdated || 0,
                            totalDonorsUpdated: data.totalDonorsUpdated || 0,
                            totalTransfersDeleted: data.totalTransfersDeleted || 0,
                          });
                        }
                      });
                    }}
                    disabled={batchAllocateMutation.isPending}
                    className="shrink-0"
                  >
                    {batchAllocateMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Batch Sync All
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Diagnostics line */}
              {diagnostics && (
                <div className="flex flex-wrap gap-4 text-sm p-3 bg-muted/50 rounded-md">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Linked J/U/B/D Committees:</span>
                    <Badge variant="secondary">{diagnostics.linkedJUBDCommittees}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Unallocated Contributions:</span>
                    <Badge variant={diagnostics.unallocatedContributions > 0 ? "default" : "secondary"}>
                      {diagnostics.unallocatedContributions.toLocaleString()}
                    </Badge>
                    <span className="text-muted-foreground text-xs">of {diagnostics.totalContributions.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* Batch sync result summary */}
              {lastBatchResult && (
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="font-medium text-green-700 dark:text-green-400">Batch Sync Complete</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Scanned</p>
                      <p className="text-lg font-semibold">{lastBatchResult.committeesFound}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Changed</p>
                      <p className="text-lg font-semibold">{lastBatchResult.committeesChanged}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Contributions</p>
                      <p className="text-lg font-semibold">{lastBatchResult.totalContributionsUpdated.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Donors</p>
                      <p className="text-lg font-semibold">{lastBatchResult.totalDonorsUpdated.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Transfers Removed</p>
                      <p className="text-lg font-semibold">{lastBatchResult.totalTransfersDeleted.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              )}

              {committeesLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading committees...
                </div>
              ) : !unallocatedCommittees || unallocatedCommittees.length === 0 ? (
                <div className="py-8 text-center space-y-4">
                  <Building2 className="h-8 w-8 mx-auto opacity-50 text-muted-foreground" />
                  <div>
                    <p className="font-medium">No J/U/B/D Committees Found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      To populate this table, follow the data pipeline:
                    </p>
                  </div>
                  <div className="inline-flex flex-col items-start text-left text-sm bg-muted/50 p-4 rounded-md">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="w-6 h-6 p-0 justify-center">1</Badge>
                      <span>Link FEC IDs to candidates (Admin → Coverage Dashboard)</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="w-6 h-6 p-0 justify-center">2</Badge>
                      <span>Fetch committees for linked candidates</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="w-6 h-6 p-0 justify-center">3</Badge>
                      <span>Fetch donors/contributions from FEC</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This table shows J/U/B/D committees with contribution data.
                  </p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Committee</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Unallocated</TableHead>
                        <TableHead className="text-right">Donors</TableHead>
                        <TableHead>Linked Candidate</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unallocatedCommittees.map((committee) => (
                        <TableRow key={committee.fec_committee_id}>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-medium">{committee.name || committee.fec_committee_id}</p>
                              <p className="text-xs text-muted-foreground">{committee.fec_committee_id}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="outline">
                                    {committee.designation === 'J' ? '(J) Joint' :
                                     committee.designation === 'U' ? '(U) Leadership' :
                                     committee.designation === 'B' ? '(B) Lobbyist' :
                                     committee.designation === 'D' ? '(D) Delegate' :
                                     committee.designation}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{committee.designation_full || 'Unknown designation'}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-medium">{formatAmount(committee.total_contributions)}</span>
                            <span className="text-xs text-muted-foreground ml-1">
                              ({committee.contribution_count})
                            </span>
                          </TableCell>
                          <TableCell className="text-right">{committee.donor_count}</TableCell>
                          <TableCell>
                            {committee.linked_candidate_name ? (
                              <span className="text-sm">{committee.linked_candidate_name}</span>
                            ) : (
                              <span className="text-muted-foreground text-sm">Not linked</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Select
                              value={selectedCommitteeForAllocation === committee.fec_committee_id ? 'selecting' : ''}
                              onValueChange={(candidateId) => {
                                if (candidateId && candidateId !== 'selecting') {
                                  allocateMutation.mutate({
                                    committeeId: committee.fec_committee_id,
                                    candidateId: candidateId === 'none' ? null : candidateId,
                                  });
                                }
                              }}
                            >
                              <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Allocate to..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  <span className="text-muted-foreground">Deallocate</span>
                                </SelectItem>
                                {allCandidates?.map(candidate => (
                                  <SelectItem key={candidate.id} value={candidate.id}>
                                    {candidate.name} ({candidate.party?.[0]}-{candidate.state})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {/* Fetch donors button for committees without data */}
                            {committee.contribution_count === 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="ml-2"
                                onClick={async () => {
                                  setFetchingDonorsForCommittee(committee.fec_committee_id);
                                  await fetchCommitteeDonorsMutation.mutateAsync({ committeeId: committee.fec_committee_id });
                                  setFetchingDonorsForCommittee(null);
                                }}
                                disabled={fetchingDonorsForCommittee === committee.fec_committee_id}
                              >
                                {fetchingDonorsForCommittee === committee.fec_committee_id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              
              <div className="mt-4 p-3 bg-muted/50 rounded-md flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">About Committee Allocation</p>
                  <p>J (Joint Fundraising) and U (Leadership PAC) committees often collect donations for multiple candidates. 
                  Allocating them to a specific candidate will associate all unallocated contributions with that candidate.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedAlias ? 'Edit Donor Alias' : 'Add Donor Alias'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="canonical_name">Canonical Name</Label>
              <Input
                id="canonical_name"
                placeholder="e.g., AIPAC"
                value={formData.canonical_name}
                onChange={(e) =>
                  setFormData({ ...formData, canonical_name: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                The standardized name that will be displayed
              </p>
            </div>
            <div className="space-y-2">
              <Label>Patterns (ILIKE)</Label>
              <div className="space-y-2">
                {formData.alias_patterns.map((pattern, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      placeholder="e.g., %aipac%"
                      value={pattern}
                      onChange={(e) => {
                        const newPatterns = [...formData.alias_patterns];
                        newPatterns[index] = e.target.value;
                        setFormData({ ...formData, alias_patterns: newPatterns });
                      }}
                    />
                    {formData.alias_patterns.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const newPatterns = formData.alias_patterns.filter((_, i) => i !== index);
                          setFormData({ ...formData, alias_patterns: newPatterns });
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFormData({ ...formData, alias_patterns: [...formData.alias_patterns, ''] })}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Pattern
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                SQL ILIKE patterns. Use % as wildcard. Add multiple patterns to match different name variations.
                {matchCount !== undefined && formData.alias_patterns.some(p => p.trim()) && (
                  <span className="ml-2 font-medium text-primary">
                    Matches {matchCount} donor(s) across all patterns
                  </span>
                )}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Donor Types</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Select which donor types this alias applies to
              </p>
              <div className="grid grid-cols-2 gap-3">
                {DONOR_TYPES.map((type) => (
                  <div key={type} className="flex items-center space-x-2">
                    <Checkbox
                      id={`type-${type}`}
                      checked={formData.donor_types.includes(type)}
                      onCheckedChange={(checked) => handleToggleDonorType(type, !!checked)}
                    />
                    <label
                      htmlFor={`type-${type}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {type}
                    </label>
                  </div>
                ))}
              </div>
              {formData.donor_types.length === 0 && (
                <p className="text-xs text-destructive">Select at least one type</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="fec_committee_id">FEC Committee ID (optional)</Label>
              <Input
                id="fec_committee_id"
                placeholder="e.g., C00104299"
                value={formData.fec_committee_id || ''}
                onChange={(e) =>
                  setFormData({ ...formData, fec_committee_id: e.target.value || null })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional information about this alias"
                value={formData.notes || ''}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value || null })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active</Label>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_active: checked })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !formData.canonical_name ||
                !formData.alias_patterns.some(p => p.trim()) ||
                formData.donor_types.length === 0 ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {selectedAlias ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Alias</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the alias "{selectedAlias?.canonical_name}"?
              This will affect how donors are consolidated across the platform.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
