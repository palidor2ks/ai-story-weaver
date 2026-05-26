import { useState, useEffect, useMemo } from 'react';
import { Plus, Pencil, Trash2, Search, Link2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
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
  DialogDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useDonorAliases,
  useCreateDonorAlias,
  useUpdateDonorAlias,
  useDeleteDonorAlias,
  useAttachDonors,
  useDetachDonors,
  useAliasMemberCounts,
  useAliasMembers,
  DonorAlias,
  DonorAliasInput,
} from '@/hooks/useDonorAliases';
import { useSearchRawDonors } from '@/hooks/useDonorsPaginated';
import { supabase } from '@/integrations/supabase/client';

const DONOR_TYPES = ['Individual', 'PAC', 'Organization', 'Unknown'];

export function DonorAliasesPanel() {
  const { data: aliases = [], isLoading } = useDonorAliases();
  const { data: memberCounts = {} } = useAliasMemberCounts();
  const createMutation = useCreateDonorAlias();
  const updateMutation = useUpdateDonorAlias();
  const deleteMutation = useDeleteDonorAlias();
  const attachMutation = useAttachDonors();
  const detachMutation = useDetachDonors();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAlias, setSelectedAlias] = useState<DonorAlias | null>(null);
  const [viewMembersFor, setViewMembersFor] = useState<DonorAlias | null>(null);
  const [formData, setFormData] = useState<DonorAliasInput>({
    canonical_name: '',
    fec_committee_ids: [],
    notes: '',
    is_active: true,
  });
  // Raw text the admin types in the FEC IDs field (comma- or newline-separated).
  const [fecIdsText, setFecIdsText] = useState('');

  // Donor search state
  const [donorSearch, setDonorSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [donorTypeFilter, setDonorTypeFilter] = useState('all');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(donorSearch), 300);
    return () => clearTimeout(t);
  }, [donorSearch]);
  const { data: searchResults = [], isLoading: searchLoading } = useSearchRawDonors(
    debouncedSearch,
    donorTypeFilter,
  );

  // Multi-select state
  const [selected, setSelected] = useState<Record<string, { name: string; type: string }>>({});
  const selectedList = useMemo(() => Object.values(selected), [selected]);

  // Picker dialog
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTargets, setPickerTargets] = useState<{ name: string; type: string }[]>([]);
  const [pickerAliasId, setPickerAliasId] = useState<string>('');

  // Current alias attached to each search result row
  const [rowAliasMap, setRowAliasMap] = useState<Record<string, DonorAlias | null>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (searchResults.length === 0) {
        setRowAliasMap({});
        return;
      }
      const keys = searchResults.map((r) => `${r.name}|${r.type}`);
      const { data } = await supabase
        .from('donor_alias_members')
        .select('donor_name, donor_type, donor_aliases!inner(*)')
        .in(
          'donor_name',
          searchResults.map((r) => r.name),
        );
      if (cancelled) return;
      const map: Record<string, DonorAlias | null> = {};
      keys.forEach((k) => (map[k] = null));
      (data || []).forEach((m: any) => {
        map[`${m.donor_name}|${m.donor_type}`] = m.donor_aliases as DonorAlias;
      });
      setRowAliasMap(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [searchResults]);

  const filteredAliases = aliases
    .filter((a) => a.canonical_name.toLowerCase().includes(search.toLowerCase()))
    .slice()
    .sort((a, b) => {
      const aCount = memberCounts[a.id] || 0;
      const bCount = memberCounts[b.id] || 0;
      // 0-member aliases first, then alphabetical
      if ((aCount === 0) !== (bCount === 0)) return aCount === 0 ? -1 : 1;
      return a.canonical_name.localeCompare(b.canonical_name);
    });

  const handleOpenCreate = () => {
    setSelectedAlias(null);
    setFormData({ canonical_name: '', fec_committee_ids: [], notes: '', is_active: true });
    setFecIdsText('');
    setDialogOpen(true);
  };

  const handleOpenEdit = (alias: DonorAlias) => {
    setSelectedAlias(alias);
    const ids = (alias.fec_committee_ids && alias.fec_committee_ids.length
      ? alias.fec_committee_ids
      : alias.fec_committee_id ? [alias.fec_committee_id] : []);
    setFormData({
      canonical_name: alias.canonical_name,
      fec_committee_ids: ids,
      notes: alias.notes || '',
      is_active: alias.is_active,
    });
    setFecIdsText(ids.join(', '));
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.canonical_name.trim()) return;
    // Parse the FEC IDs textbox: split on commas/whitespace, uppercase, dedupe.
    const ids = Array.from(new Set(
      fecIdsText.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean),
    ));
    const payload: DonorAliasInput = { ...formData, fec_committee_ids: ids };
    if (selectedAlias) {
      await updateMutation.mutateAsync({ id: selectedAlias.id, ...payload });
    } else {
      await createMutation.mutateAsync(payload);
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

  const activeAliases = useMemo(() => aliases.filter((a) => a.is_active), [aliases]);

  const openPicker = (targets: { name: string; type: string }[]) => {
    setPickerTargets(targets);
    // Auto-select when there's exactly one active alias to choose from
    setPickerAliasId(activeAliases.length === 1 ? activeAliases[0].id : '');
    setPickerOpen(true);
  };

  const handleAttachConfirm = async () => {
    if (!pickerAliasId || pickerTargets.length === 0) return;
    try {
      await attachMutation.mutateAsync({ alias_id: pickerAliasId, donors: pickerTargets });
      setPickerOpen(false);
      setSelected({});
    } catch (err) {
      // Error toast shown by mutation; keep dialog open so user can retry
      console.error('[attach-donors] failed', err);
    }
  };

  const handleDetach = async (name: string, type: string) => {
    await detachMutation.mutateAsync({ donors: [{ name, type }] });
  };

  const toggleSelect = (name: string, type: string) => {
    const key = `${name}|${type}`;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = { name, type };
      return next;
    });
  };

  if (isLoading) return <div className="text-muted-foreground">Loading aliases...</div>;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="aliases" className="w-full">
        <TabsList>
          <TabsTrigger value="aliases">Manage Aliases</TabsTrigger>
          <TabsTrigger value="search">Attach Donors</TabsTrigger>
        </TabsList>

        {/* Aliases Tab */}
        <TabsContent value="aliases" className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search existing aliases..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" /> New Alias
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Canonical Name</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>FEC Committee ID</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAliases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No aliases yet. Search only filters existing aliases—click “New Alias” to create one first.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAliases.map((alias) => {
                      const count = memberCounts[alias.id] || 0;
                      return (
                      <TableRow key={alias.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{alias.canonical_name}</span>
                            {count === 0 && (
                              <Badge
                                variant="outline"
                                className="text-amber-700 border-amber-400 bg-amber-50"
                                title="Attach donor name variations under the Attach tab so this alias shows up on the Donors page."
                              >
                                0 attached — not visible publicly
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewMembersFor(alias)}
                          >
                            <Badge variant="secondary">{count}</Badge>
                          </Button>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {(() => {
                            const ids = alias.fec_committee_ids && alias.fec_committee_ids.length
                              ? alias.fec_committee_ids
                              : alias.fec_committee_id ? [alias.fec_committee_id] : [];
                            if (ids.length === 0) return '—';
                            return (
                              <div className="flex flex-wrap gap-1">
                                {ids.map((id) => (
                                  <Badge key={id} variant="outline" className="font-mono text-[10px]">{id}</Badge>
                                ))}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          {alias.is_active ? (
                            <Badge>Active</Badge>
                          ) : (
                            <Badge variant="outline">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                          {alias.notes || '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(alias)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedAlias(alias);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attach Tab */}
        <TabsContent value="search" className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search donors by name (min 3 chars)..."
                value={donorSearch}
                onChange={(e) => setDonorSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={donorTypeFilter} onValueChange={setDonorTypeFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {DONOR_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedList.length > 0 && (
            <Card className="bg-muted/50 sticky top-0 z-10">
              <CardContent className="py-3 flex items-center justify-between">
                <span className="text-sm font-medium">
                  {selectedList.length} donor(s) selected
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setSelected({})}>
                    Clear
                  </Button>
                  <Button size="sm" onClick={() => openPicker(selectedList)}>
                    <Link2 className="h-4 w-4 mr-2" /> Attach to alias…
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Current alias</TableHead>
                    <TableHead className="w-48">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searchLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Searching…
                      </TableCell>
                    </TableRow>
                  ) : searchResults.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        {debouncedSearch.length < 3
                          ? 'Type at least 3 characters to search.'
                          : 'No donors found.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    searchResults.map((r) => {
                      const key = `${r.name}|${r.type}`;
                      const currentAlias = rowAliasMap[key];
                      return (
                        <TableRow key={key}>
                          <TableCell>
                            <Checkbox
                              checked={!!selected[key]}
                              onCheckedChange={() => toggleSelect(r.name, r.type)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{r.type}</Badge>
                          </TableCell>
                          <TableCell>
                            {currentAlias ? (
                              <Badge>{currentAlias.canonical_name}</Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openPicker([{ name: r.name, type: r.type }])}
                              >
                                <Link2 className="h-3 w-3 mr-1" /> Attach
                              </Button>
                              {currentAlias && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDetach(r.name, r.type)}
                                >
                                  <Unlink className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedAlias ? 'Edit Alias' : 'New Alias'}</DialogTitle>
            <DialogDescription>
              The canonical name is shown wherever attached donors appear.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Canonical name *</Label>
              <Input
                value={formData.canonical_name}
                onChange={(e) =>
                  setFormData({ ...formData, canonical_name: e.target.value })
                }
                placeholder="e.g. Apple Inc."
              />
            </div>
            <div className="space-y-2">
              <Label>FEC Committee IDs (optional)</Label>
              <Textarea
                value={fecIdsText}
                onChange={(e) => setFecIdsText(e.target.value)}
                placeholder="C00502906, C00xxxxxx, C00yyyyyy"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Separate multiple IDs with commas, spaces, or new lines. All listed committees are used as the AI analysis anchor so multi-PAC parent entities (e.g. Meta/Facebook) are analyzed as one organization.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!formData.canonical_name.trim()}>
              {selectedAlias ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete alias?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the alias and detaches all member donors. Their display
              names will revert to the raw donor names.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alias picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach {pickerTargets.length} donor(s) to alias</DialogTitle>
            <DialogDescription>
              {pickerTargets.slice(0, 3).map((t) => t.name).join(', ')}
              {pickerTargets.length > 3 ? `, +${pickerTargets.length - 3} more` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Pick an alias</Label>
            <Select value={pickerAliasId} onValueChange={setPickerAliasId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose alias..." />
              </SelectTrigger>
              <SelectContent>
                {activeAliases.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.canonical_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {activeAliases.length === 0
                ? 'No active aliases — create one in the Manage Aliases tab first.'
                : 'Need a new alias? Create it in the Manage Aliases tab first.'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAttachConfirm}
              disabled={!pickerAliasId || pickerTargets.length === 0 || attachMutation.isPending}
            >
              {attachMutation.isPending
                ? `Attaching ${pickerTargets.length}…`
                : `Attach ${pickerTargets.length || ''}`.trim()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members viewer */}
      <Dialog open={!!viewMembersFor} onOpenChange={(o) => !o && setViewMembersFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Members of "{viewMembersFor?.canonical_name}"</DialogTitle>
          </DialogHeader>
          <MembersList aliasId={viewMembersFor?.id} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MembersList({ aliasId }: { aliasId: string | undefined }) {
  const { data: members = [] } = useAliasMembers(aliasId);
  const detachMutation = useDetachDonors();
  if (members.length === 0) {
    return <p className="text-muted-foreground py-4 text-sm">No donors attached yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="w-24"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((m) => (
          <TableRow key={m.id}>
            <TableCell>{m.donor_name}</TableCell>
            <TableCell>
              <Badge variant="outline">{m.donor_type}</Badge>
            </TableCell>
            <TableCell>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  detachMutation.mutate({
                    donors: [{ name: m.donor_name, type: m.donor_type }],
                  })
                }
              >
                <Unlink className="h-3 w-3" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
