import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Check, X, Search, Users, DollarSign, Link2, Layers, RefreshCw, Loader2 } from 'lucide-react';
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

const DONOR_TYPES = ['Individual', 'PAC', 'Organization', 'Unknown'];

const formatAmount = (amount: number) => {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
};

export function DonorAliasesPanel() {
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
    alias_pattern: '',
    donor_types: ['Individual', 'PAC', 'Organization', 'Unknown'],
    fec_committee_id: '',
    notes: '',
    is_active: true,
  });

  // Donor search state
  const [donorSearch, setDonorSearch] = useState('');
  const [donorTypeFilter, setDonorTypeFilter] = useState('all');
  const { data: searchResults = [], isLoading: searchLoading } = useSearchDonors(donorSearch, donorTypeFilter);

  const { data: matchCount } = useMatchingDonorsCount(
    formData.alias_pattern,
    formData.donor_types
  );

  // Display name refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{
    processed: number;
    remaining: number;
    total: number;
  } | null>(null);

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
    } catch (err) {
      console.error('Error in refresh loop:', err);
      toast.error('An error occurred during refresh');
    } finally {
      setIsRefreshing(false);
      setRefreshProgress(null);
    }
  };

  const filteredAliases = aliases?.filter(
    (a) =>
      a.canonical_name.toLowerCase().includes(search.toLowerCase()) ||
      a.alias_pattern.toLowerCase().includes(search.toLowerCase())
  );

  // Find current alias for a donor name (checks all types now)
  const findAliasForDonor = (donorName: string, donorType: string) => {
    if (!aliases) return null;
    return aliases.find(alias => {
      if (!alias.is_active) return false;
      // Check if the donor type is in the alias's donor_types array
      if (!alias.donor_types?.includes(donorType)) return false;
      const pattern = alias.alias_pattern.replace(/%/g, '.*').replace(/_/g, '.');
      const regex = new RegExp(`^${pattern}$`, 'i');
      return regex.test(donorName);
    });
  };

  const handleOpenCreate = () => {
    setSelectedAlias(null);
    setFormData({
      canonical_name: '',
      alias_pattern: '',
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
      alias_pattern: `%${escapedName}%`,
      donor_types: [donorType], // Start with just the donor's type
      fec_committee_id: '',
      notes: '',
      is_active: true,
    });
    setDialogOpen(true);
  };

  const handleAddToExistingAlias = (donorName: string, alias: DonorAlias) => {
    // Pre-fill with existing alias data but suggest updating pattern to include new donor
    setSelectedAlias(alias);
    
    setFormData({
      canonical_name: alias.canonical_name,
      alias_pattern: alias.alias_pattern,
      donor_types: alias.donor_types || [alias.donor_type],
      fec_committee_id: alias.fec_committee_id || '',
      notes: alias.notes ? `${alias.notes}\nAdded: ${donorName}` : `Added: ${donorName}`,
      is_active: alias.is_active,
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (alias: DonorAlias) => {
    setSelectedAlias(alias);
    setFormData({
      canonical_name: alias.canonical_name,
      alias_pattern: alias.alias_pattern,
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
                        <code className="bg-muted px-1.5 py-0.5 rounded text-sm">
                          {alias.alias_pattern}
                        </code>
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
                <Button 
                  onClick={handleRefreshDisplayNames} 
                  disabled={isRefreshing}
                  variant="secondary"
                  size="sm"
                >
                  {isRefreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  <span className="ml-1.5">Backfill</span>
                </Button>
              </div>
              
              {/* Progress indicator for backfill */}
              {refreshProgress && (
                <div className="space-y-2">
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
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleOpenEdit(existingAlias)}
                                  >
                                    <Pencil className="h-3 w-3 mr-1" />
                                    Edit Alias
                                  </Button>
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
                                          if (alias) handleAddToExistingAlias(donor.name, alias);
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
              <Label htmlFor="alias_pattern">Pattern (ILIKE)</Label>
              <Input
                id="alias_pattern"
                placeholder="e.g., %aipac%"
                value={formData.alias_pattern}
                onChange={(e) =>
                  setFormData({ ...formData, alias_pattern: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                SQL ILIKE pattern. Use % as wildcard.
                {matchCount !== undefined && formData.alias_pattern && (
                  <span className="ml-2 font-medium text-primary">
                    Matches {matchCount} donor(s)
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
                !formData.alias_pattern ||
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
