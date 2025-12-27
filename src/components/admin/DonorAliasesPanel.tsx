import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Check, X, Search, Users, DollarSign, Link2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
    donor_type: 'PAC',
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
    formData.donor_type
  );

  const filteredAliases = aliases?.filter(
    (a) =>
      a.canonical_name.toLowerCase().includes(search.toLowerCase()) ||
      a.alias_pattern.toLowerCase().includes(search.toLowerCase())
  );

  // Find current alias for a donor name
  const findAliasForDonor = (donorName: string, donorType: string) => {
    if (!aliases) return null;
    return aliases.find(alias => {
      if (alias.donor_type !== donorType || !alias.is_active) return false;
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
      donor_type: 'PAC',
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
      donor_type: donorType,
      fec_committee_id: '',
      notes: '',
      is_active: true,
    });
    setDialogOpen(true);
  };

  const handleAddToExistingAlias = (donorName: string, alias: DonorAlias) => {
    // Pre-fill with existing alias data but suggest updating pattern to include new donor
    setSelectedAlias(alias);
    const currentPattern = alias.alias_pattern;
    // If pattern already uses OR, suggest adding to it; otherwise suggest broadening
    const newPatternSuggestion = currentPattern.includes('|') 
      ? currentPattern 
      : currentPattern;
    
    setFormData({
      canonical_name: alias.canonical_name,
      alias_pattern: newPatternSuggestion,
      donor_type: alias.donor_type,
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
      donor_type: alias.donor_type,
      fec_committee_id: alias.fec_committee_id || '',
      notes: alias.notes || '',
      is_active: alias.is_active,
    });
    setDialogOpen(true);
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
                  <TableHead>Type</TableHead>
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
                        <Badge variant="outline">{alias.donor_type}</Badge>
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
              <CardTitle className="text-lg">Search Donors</CardTitle>
              <CardDescription>
                Search for donors and assign them to alias groups. Similar donors will be consolidated under the canonical name.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search donor names (min 2 characters)..."
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
                    {searchLoading ? 'Searching...' : `Found ${searchResults.length} unique donor(s)`}
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
                                </div>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <DollarSign className="h-3 w-3" />
                                    {formatAmount(donor.totalAmount)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {donor.count} record(s)
                                  </span>
                                </div>
                                {existingAlias && (
                                  <div className="flex items-center gap-1.5 mt-2 text-sm">
                                    <Link2 className="h-3 w-3 text-primary" />
                                    <span className="text-primary font-medium">
                                      Alias: {existingAlias.canonical_name}
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
                                    {aliases && aliases.filter(a => a.donor_type === donor.type && a.is_active).length > 0 && (
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
                                            .filter(a => a.donor_type === donor.type && a.is_active)
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
              <Label htmlFor="donor_type">Donor Type</Label>
              <Select
                value={formData.donor_type}
                onValueChange={(value) =>
                  setFormData({ ...formData, donor_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DONOR_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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