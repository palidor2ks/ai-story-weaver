import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
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

interface CommitteeAlias {
  id: string;
  canonical_name: string;
  fec_committee_ids: string[];
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface RawCommitteeSearchResult {
  name: string | null;
  fec_committee_id: string;
  treasurer_name: string | null;
}

interface CommitteeAliasInput {
  canonical_name: string;
  fec_committee_ids: string[];
  notes: string;
  is_active: boolean;
}

export function CommitteeAliasesPanel() {
  const qc = useQueryClient();

  const { data: aliases = [], isLoading } = useQuery({
    queryKey: ['committee-aliases'],
    queryFn: async (): Promise<CommitteeAlias[]> => {
      const { data, error } = await (supabase as any)
        .from('committee_aliases')
        .select('*')
        .order('canonical_name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

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

  const { data: committeeSearchResults = [], isLoading: committeeSearchLoading } = useQuery({
    queryKey: ['committee-aliases-raw-search', debouncedCommitteeSearch],
    enabled: debouncedCommitteeSearch.length >= 2,
    queryFn: async (): Promise<RawCommitteeSearchResult[]> => {
      const safe = debouncedCommitteeSearch.replace(/,/g, ' ').trim();
      const { data, error } = await (supabase as any)
        .from('committees')
        .select('name, fec_committee_id, treasurer_name')
        .or(`name.ilike.%${safe}%,fec_committee_id.ilike.%${safe}%`)
        .order('name', { ascending: true })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: CommitteeAliasInput) => {
      const { error } = await (supabase as any)
        .from('committee_aliases')
        .insert({
          canonical_name: input.canonical_name,
          fec_committee_ids: input.fec_committee_ids,
          notes: input.notes || null,
          is_active: input.is_active,
        });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success('Spender alias created');
      await qc.invalidateQueries({ queryKey: ['committee-aliases'] });
      await qc.invalidateQueries({ queryKey: ['top-spenders'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...input }: CommitteeAliasInput & { id: string }) => {
      const { error } = await (supabase as any)
        .from('committee_aliases')
        .update({
          canonical_name: input.canonical_name,
          fec_committee_ids: input.fec_committee_ids,
          notes: input.notes || null,
          is_active: input.is_active,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success('Spender alias updated');
      await qc.invalidateQueries({ queryKey: ['committee-aliases'] });
      await qc.invalidateQueries({ queryKey: ['top-spenders'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('committee_aliases')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success('Spender alias removed');
      await qc.invalidateQueries({ queryKey: ['committee-aliases'] });
      await qc.invalidateQueries({ queryKey: ['top-spenders'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
          <TabsTrigger value="attach">Attach Spenders</TabsTrigger>
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
            <Table><TableHeader><TableRow>
              <TableHead>Canonical Name</TableHead><TableHead>FEC IDs</TableHead><TableHead>FEC Committee IDs</TableHead><TableHead>Active</TableHead><TableHead>Notes</TableHead><TableHead className="w-32">Actions</TableHead>
            </TableRow></TableHeader><TableBody>
              {filteredAliases.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{aliases.length === 0 ? 'No aliases yet. Search only filters existing aliases—click “New Alias” to create one first.' : 'No aliases match your search.'}</TableCell></TableRow> : filteredAliases.map((alias) => {
                const count = alias.fec_committee_ids.length;
                return (<TableRow key={alias.id}><TableCell className="font-medium"><div className="flex items-center gap-2 flex-wrap"><span>{alias.canonical_name}</span>{count===0 && <Badge variant="outline" className="text-amber-700 border-amber-400 bg-amber-50" title="Add at least one FEC committee ID so this alias overrides spender names on the Top Spenders page.">0 IDs — not applied</Badge>}</div></TableCell><TableCell><Badge variant="secondary">{count}</Badge></TableCell><TableCell className="font-mono text-xs">{count===0?'—':<div className="flex flex-wrap gap-1">{alias.fec_committee_ids.map((id)=><Badge key={id} variant="outline" className="font-mono text-[10px]">{id}</Badge>)}</div>}</TableCell><TableCell>{alias.is_active ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell><TableCell className="max-w-xs truncate text-sm text-muted-foreground">{alias.notes||'—'}</TableCell><TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => handleOpenEdit(alias)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => { setSelectedAlias(alias); setDeleteDialogOpen(true); }}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>);
              })}
            </TableBody></Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="attach" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2"><Label>Alias to update</Label><Select value={selectedAttachAliasId} onValueChange={setSelectedAttachAliasId}><SelectTrigger><SelectValue placeholder="Select an active spender alias" /></SelectTrigger><SelectContent>{activeAliases.map((alias) => <SelectItem key={alias.id} value={alias.id}>{alias.canonical_name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Search committees</Label><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Type committee name or FEC ID..." value={committeeSearch} onChange={(e) => setCommitteeSearch(e.target.value)} className="pl-9" /></div></div>
          </div>
          <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Committee</TableHead><TableHead>Treasurer</TableHead><TableHead>FEC Committee ID</TableHead><TableHead className="w-36">Action</TableHead></TableRow></TableHeader><TableBody>
          {committeeSearch.trim().length<2 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Type at least 2 characters to search committees.</TableCell></TableRow> : committeeSearchLoading ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Searching committees...</TableCell></TableRow> : committeeSearchResults.length===0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No committees found for that query.</TableCell></TableRow> : committeeSearchResults.map((row)=> { const alreadyAttached=aliases.some((a)=>a.fec_committee_ids.includes(row.fec_committee_id)); return <TableRow key={row.fec_committee_id}><TableCell className="font-medium">{row.name || 'Unknown committee'}</TableCell><TableCell className="text-sm text-muted-foreground">{row.treasurer_name || '—'}</TableCell><TableCell className="font-mono">{row.fec_committee_id}</TableCell><TableCell><Button size="sm" disabled={!selectedAttachAliasId || updateMutation.isPending || alreadyAttached} onClick={() => handleAddCommitteeId(row.fec_committee_id)}>{alreadyAttached ? 'Already attached' : 'Attach ID'}</Button></TableCell></TableRow>; })}
          </TableBody></Table></CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedAlias ? 'Edit Alias' : 'New Alias'}</DialogTitle>
            <DialogDescription>
              Aliases override the displayed name on the Top Spenders page for any of the listed FEC
              committee IDs.
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
              This will remove the alias "{selectedAlias?.canonical_name}". The underlying spender
              names on the Top Spenders page will revert to their FEC defaults.
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
