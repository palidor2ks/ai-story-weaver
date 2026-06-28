import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Search, Sparkles, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { toast } from 'sonner';
import {
  useCommitteeCauses,
  useCommitteeTopicsMap,
  type CommitteeCause,
  type CommitteeTopicRow,
} from '@/hooks/useCommitteeTopics';
import {
  useCommitteeAliases,
  useCommitteeAliasSearch,
  useCreateCommitteeAlias,
  useUpdateCommitteeAlias,
  useDeleteCommitteeAlias,
  useSetAliasCause,
  classifyCommitteeTopic,
  type CommitteeAlias,
  type RawCommitteeSearchResult,
  type CommitteeAliasInput,
} from '@/hooks/useCommitteeAliases';

function formatCommitteeSource(source: RawCommitteeSearchResult['source'], treasurerName: string | null) {
  switch (source) {
    case 'outside_spender':
      return treasurerName ? `Outside spender · ${treasurerName}` : 'Outside spender';
    case 'pac_registry':
      return treasurerName ? `PAC registry · ${treasurerName}` : 'PAC registry';
    case 'candidate_committee':
      return 'Candidate committee';
    case 'recipient':
      return 'Donor recipient';
    default:
      return '—';
  }
}

export function CommitteeAliasesPanel() {
  const qc = useQueryClient();

  const { data: aliases = [], isLoading } = useCommitteeAliases();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAlias, setSelectedAlias] = useState<CommitteeAlias | null>(null);
  const [formData, setFormData] = useState<CommitteeAliasInput>({
    canonical_name: '',
    fec_committee_ids: [],
    notes: '',
    is_active: true,
  });
  const [fecIdsText, setFecIdsText] = useState('');
  const [committeeSearch, setCommitteeSearch] = useState('');
  const [debouncedCommitteeSearch, setDebouncedCommitteeSearch] = useState('');
  const [selectedAttachAliasId, setSelectedAttachAliasId] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCommitteeSearch(committeeSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [committeeSearch]);


  const activeAliases = useMemo(() => aliases.filter((a) => a.is_active), [aliases]);

  const { data: committeeSearchResults = [], isLoading: committeeSearchLoading } =
    useCommitteeAliasSearch(debouncedCommitteeSearch);

  const createMutation = useCreateCommitteeAlias();
  const updateMutation = useUpdateCommitteeAlias();
  const deleteMutation = useDeleteCommitteeAlias();

  // ---- Primary cause (unified) ----
  // Committee causes live per-FEC-ID in `committee_topics` — the same source of
  // truth the bulk "Committee Causes" panel and quiz scoring already read. An
  // alias's cause is derived from its member committee IDs; assigning writes
  // through to every member ID so the cause actually flows into scoring.
  const { data: causes = [] } = useCommitteeCauses(false);
  const allMemberFecIds = useMemo(
    () => Array.from(new Set(aliases.flatMap((a) => a.fec_committee_ids))),
    [aliases],
  );
  const { data: topicsMap } = useCommitteeTopicsMap(allMemberFecIds);
  const [classifyingAliasId, setClassifyingAliasId] = useState<string | null>(null);

  const setAliasCause = useSetAliasCause();

  const handleClassifyAlias = async (alias: CommitteeAlias) => {
    if (alias.fec_committee_ids.length === 0) {
      toast.error('Add an FEC committee ID first');
      return;
    }
    setClassifyingAliasId(alias.id);
    try {
      const { data, error } = await classifyCommitteeTopic(alias.fec_committee_ids);
      if (error) throw error;
      if (data?.queued) {
        toast.success(`Queued ${data.queued} committee(s) — refresh in a moment`);
      } else {
        toast.success('AI classified');
        await qc.invalidateQueries({ queryKey: ['committee-topics-map'] });
        qc.refetchQueries({ queryKey: ['committee-pool'], type: 'active' });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Classification failed');
    } finally {
      setClassifyingAliasId(null);
    }
  };

  const filteredAliases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return aliases
      .filter((a) => {
        if (!q) return true;
        if (a.canonical_name.toLowerCase().includes(q)) return true;
        return a.fec_committee_ids.some((id) => id.toLowerCase().includes(q));
      })
      .slice()
      .sort((a, b) => {
        const aCount = a.fec_committee_ids.length;
        const bCount = b.fec_committee_ids.length;
        if ((aCount === 0) !== (bCount === 0)) return aCount === 0 ? -1 : 1;
        return a.canonical_name.localeCompare(b.canonical_name);
      });
  }, [aliases, search]);

  const handleOpenCreate = () => {
    setSelectedAlias(null);
    setFormData({ canonical_name: '', fec_committee_ids: [], notes: '', is_active: true });
    setFecIdsText('');
    setDialogOpen(true);
  };

  const handleOpenEdit = (alias: CommitteeAlias) => {
    setSelectedAlias(alias);
    setFormData({
      canonical_name: alias.canonical_name,
      fec_committee_ids: alias.fec_committee_ids,
      notes: alias.notes || '',
      is_active: alias.is_active,
    });
    setFecIdsText(alias.fec_committee_ids.join(', '));
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.canonical_name.trim()) return;
    const ids = Array.from(
      new Set(
        fecIdsText
          .split(/[\s,]+/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
      ),
    );
    const payload: CommitteeAliasInput = { ...formData, fec_committee_ids: ids };
    if (selectedAlias) {
      await updateMutation.mutateAsync({ id: selectedAlias.id, ...payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    setDialogOpen(false);
  };

  const handleAddCommitteeId = async (fecCommitteeId: string) => {
    if (!selectedAttachAliasId) return;
    const alias = aliases.find((a) => a.id === selectedAttachAliasId);
    if (!alias) return;

    const nextIds = Array.from(new Set([...alias.fec_committee_ids, fecCommitteeId.toUpperCase()]));
    await updateMutation.mutateAsync({
      id: alias.id,
      canonical_name: alias.canonical_name,
      fec_committee_ids: nextIds,
      notes: alias.notes || '',
      is_active: alias.is_active,
    });
  };

  // Detach a committee from whichever alias currently holds it (drops the FEC ID
  // from that alias's list). The committee's cause in committee_topics is left
  // intact — it belongs to the committee, not the alias grouping.
  const handleRemoveCommitteeId = async (fecCommitteeId: string, aliasId: string) => {
    const alias = aliases.find((a) => a.id === aliasId);
    if (!alias) return;
    await updateMutation.mutateAsync({
      id: alias.id,
      canonical_name: alias.canonical_name,
      fec_committee_ids: alias.fec_committee_ids.filter((id) => id !== fecCommitteeId),
      notes: alias.notes || '',
      is_active: alias.is_active,
    });
  };

  // Reassign a committee from its current alias to the one picked in "Alias to update".
  const handleMoveCommitteeId = async (fecCommitteeId: string, fromAliasId: string) => {
    if (!selectedAttachAliasId || selectedAttachAliasId === fromAliasId) return;
    const fromAlias = aliases.find((a) => a.id === fromAliasId);
    const toAlias = aliases.find((a) => a.id === selectedAttachAliasId);
    if (!fromAlias || !toAlias) return;
    await updateMutation.mutateAsync({
      id: fromAlias.id,
      canonical_name: fromAlias.canonical_name,
      fec_committee_ids: fromAlias.fec_committee_ids.filter((id) => id !== fecCommitteeId),
      notes: fromAlias.notes || '',
      is_active: fromAlias.is_active,
    });
    await updateMutation.mutateAsync({
      id: toAlias.id,
      canonical_name: toAlias.canonical_name,
      fec_committee_ids: Array.from(new Set([...toAlias.fec_committee_ids, fecCommitteeId.toUpperCase()])),
      notes: toAlias.notes || '',
      is_active: toAlias.is_active,
    });
  };

  const handleDelete = async () => {
    if (selectedAlias) {
      await deleteMutation.mutateAsync(selectedAlias.id);
      setDeleteDialogOpen(false);
      setSelectedAlias(null);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading aliases...</div>;


  return (
    <div className="space-y-6">
      <Tabs defaultValue="aliases" className="w-full">
        <TabsList>
          <TabsTrigger value="aliases">Manage Aliases</TabsTrigger>
          <TabsTrigger value="attach">Attach Committees</TabsTrigger>
        </TabsList>

        <TabsContent value="aliases" className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search aliases or FEC IDs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" /> New Alias
            </Button>
          </div>

          <Card><CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canonical Name</TableHead>
                  <TableHead>FEC IDs</TableHead>
                  <TableHead>Primary Cause</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAliases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      {aliases.length === 0 ? 'No aliases yet. Search only filters existing aliases—click “New Alias” to create one first.' : 'No aliases match your search.'}
                    </TableCell>
                  </TableRow>
                ) : filteredAliases.map((alias) => {
                  const count = alias.fec_committee_ids.length;
                  return (
                    <TableRow key={alias.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{alias.canonical_name}</span>
                          {count === 0 && (
                            <Badge variant="outline" className="text-amber-700 border-amber-400 bg-amber-50" title="Add at least one FEC committee ID so this alias overrides spender names on the Top Spenders page.">
                              0 IDs — not applied
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="secondary">{count}</Badge></TableCell>
                      <TableCell>
                        <CommitteeAliasCauseCell
                          alias={alias}
                          causes={causes}
                          topicsMap={topicsMap}
                          onAssign={(causeId) => setAliasCause.mutateAsync({ fecIds: alias.fec_committee_ids, causeId })}
                          onClassify={() => handleClassifyAlias(alias)}
                          isClassifying={classifyingAliasId === alias.id}
                        />
                      </TableCell>
                      <TableCell>{alias.is_active ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(alias)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => { setSelectedAlias(alias); setDeleteDialogOpen(true); }}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="attach" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2"><Label>Alias to update</Label><Select value={selectedAttachAliasId} onValueChange={setSelectedAttachAliasId}><SelectTrigger><SelectValue placeholder="Select an active committee alias" /></SelectTrigger><SelectContent>{activeAliases.map((alias) => <SelectItem key={alias.id} value={alias.id}>{alias.canonical_name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Search committees</Label><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search recipients/spenders by name, abbreviation (e.g. SLF), or FEC ID..." value={committeeSearch} onChange={(e) => setCommitteeSearch(e.target.value)} className="pl-9" /></div></div>
          </div>
          <Card><CardContent className="p-0"><Table>
            <TableHeader>
              <TableRow>
                <TableHead>Committee</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>FEC Committee ID</TableHead>
                <TableHead>Current alias</TableHead>
                <TableHead className="w-44">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {committeeSearch.trim().length < 2 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Type at least 2 characters to search committees.</TableCell></TableRow>
              ) : committeeSearchLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Searching committees...</TableCell></TableRow>
              ) : committeeSearchResults.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No committees match “{committeeSearch.trim()}”. Searches donor recipients, candidate committees, outside spenders, PACs, and FEC IDs.</TableCell></TableRow>
              ) : committeeSearchResults.map((row) => {
                const currentAlias = aliases.find((a) => a.fec_committee_ids.includes(row.fec_committee_id));
                const attachedToSelected = !!currentAlias && currentAlias.id === selectedAttachAliasId;
                return (
                  <TableRow key={row.fec_committee_id}>
                    <TableCell className="font-medium">{row.name || 'Unknown committee'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatCommitteeSource(row.source, row.treasurer_name)}</TableCell>
                    <TableCell className="font-mono">{row.fec_committee_id}</TableCell>
                    <TableCell>{currentAlias ? <Badge variant="secondary">{currentAlias.canonical_name}</Badge> : <span className="text-muted-foreground text-sm">—</span>}</TableCell>
                    <TableCell>
                      {!currentAlias ? (
                        <Button size="sm" disabled={!selectedAttachAliasId || updateMutation.isPending} onClick={() => handleAddCommitteeId(row.fec_committee_id)}>Attach ID</Button>
                      ) : attachedToSelected ? (
                        <Button size="sm" variant="outline" disabled={updateMutation.isPending} onClick={() => handleRemoveCommitteeId(row.fec_committee_id, currentAlias.id)}><Unlink className="h-3 w-3 mr-1" /> Detach</Button>
                      ) : (
                        <div className="flex gap-1">
                          <Button size="sm" disabled={!selectedAttachAliasId || updateMutation.isPending} onClick={() => handleMoveCommitteeId(row.fec_committee_id, currentAlias.id)} title={selectedAttachAliasId ? 'Move to the selected alias' : 'Select a target alias first'}>Move here</Button>
                          <Button size="sm" variant="ghost" disabled={updateMutation.isPending} onClick={() => handleRemoveCommitteeId(row.fec_committee_id, currentAlias.id)} title="Detach"><Unlink className="h-3 w-3" /></Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table></CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedAlias ? 'Edit Alias' : 'New Alias'}</DialogTitle>
            <DialogDescription>
              Aliases merge matching recipient cards on donor profiles and override displayed committee names
              anywhere those FEC committee IDs are grouped.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="canonical_name">Canonical Name</Label>
              <Input
                id="canonical_name"
                value={formData.canonical_name}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, canonical_name: e.target.value }))
                }
                placeholder="e.g. Senate Majority PAC"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fec_ids">FEC Committee IDs</Label>
              <Textarea
                id="fec_ids"
                value={fecIdsText}
                onChange={(e) => setFecIdsText(e.target.value)}
                placeholder="C00484642, C00666820"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Comma- or whitespace-separated. All IDs are uppercased.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(v) => setFormData((p) => ({ ...p, is_active: v }))}
              />
              <Label htmlFor="is_active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !formData.canonical_name.trim() ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {selectedAlias ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete alias?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the alias "{selectedAlias?.canonical_name}". The underlying recipient and spender
              names will revert to their FEC defaults.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Derives a spender alias's cause from its member committee IDs (stored per-ID in
// committee_topics). Assigning writes the chosen cause through to every member ID.
function CommitteeAliasCauseCell({
  alias,
  causes,
  topicsMap,
  onAssign,
  onClassify,
  isClassifying,
}: {
  alias: CommitteeAlias;
  causes: CommitteeCause[];
  topicsMap: Map<string, CommitteeTopicRow> | undefined;
  onAssign: (causeId: string) => Promise<unknown>;
  onClassify: () => Promise<unknown>;
  isClassifying: boolean;
}) {
  const ids = alias.fec_committee_ids;
  if (ids.length === 0) {
    return <span className="text-sm text-muted-foreground">Add an FEC ID first</span>;
  }
  const rows = ids
    .map((id) => topicsMap?.get(id))
    .filter((r): r is CommitteeTopicRow => !!r);
  const distinct = Array.from(new Set(rows.map((r) => r.primary_cause_id)));
  const mixed = distinct.length > 1;
  const current = distinct.length === 1 ? distinct[0] : '';
  const anyAdmin = rows.some((r) => r.admin_overridden);
  const aiConfidence = rows.find((r) => r.assigned_by === 'ai')?.ai_confidence;
  const sourceLabel = mixed
    ? null
    : anyAdmin
      ? 'Admin'
      : rows.some((r) => r.assigned_by === 'ai')
        ? `AI${aiConfidence ? ` · ${aiConfidence}` : ''}`
        : null;

  return (
    <div className="flex items-center gap-2">
      <Select value={current} onValueChange={(v) => onAssign(v)}>
        <SelectTrigger className="h-8 w-[180px]">
          <SelectValue placeholder={mixed ? 'Mixed — pick one' : 'Assign cause'} />
        </SelectTrigger>
        <SelectContent>
          {causes.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        title="Run AI cause classification"
        disabled={isClassifying}
        onClick={() => onClassify()}
      >
        <Sparkles className={`h-4 w-4 ${isClassifying ? 'animate-pulse' : ''}`} />
      </Button>
      {mixed && (
        <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-400">Mixed</Badge>
      )}
      {sourceLabel && (
        <Badge variant="outline" className="text-[10px]">{sourceLabel}</Badge>
      )}
    </div>
  );
}
