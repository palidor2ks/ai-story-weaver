import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

interface CommitteeAliasRow {
  fec_committee_id: string;
  alias_name: string;
  created_at: string;
}

export function CommitteeAliasesPanel() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [fecId, setFecId] = useState('');
  const [aliasName, setAliasName] = useState('');

  const { data: aliases = [], isLoading } = useQuery({
    queryKey: ['committee-aliases'],
    queryFn: async (): Promise<CommitteeAliasRow[]> => {
      const { data, error } = await (supabase as any)
        .from('committee_aliases')
        .select('fec_committee_id, alias_name, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const id = fecId.trim().toUpperCase();
      const alias = aliasName.trim();
      if (!id || !alias) throw new Error('FEC ID and alias are required');
      const { error } = await (supabase as any)
        .from('committee_aliases')
        .upsert({ fec_committee_id: id, alias_name: alias }, { onConflict: 'fec_committee_id' });
      if (error) throw error;
    },
    onSuccess: async () => {
      setFecId('');
      setAliasName('');
      toast.success('Committee alias saved');
      await qc.invalidateQueries({ queryKey: ['committee-aliases'] });
      await qc.invalidateQueries({ queryKey: ['top-spenders'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('committee_aliases').delete().eq('fec_committee_id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success('Committee alias removed');
      await qc.invalidateQueries({ queryKey: ['committee-aliases'] });
      await qc.invalidateQueries({ queryKey: ['top-spenders'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return aliases;
    return aliases.filter((a) => a.fec_committee_id.toLowerCase().includes(q) || a.alias_name.toLowerCase().includes(q));
  }, [aliases, search]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Set display-name aliases for top outside spenders by FEC committee ID.</p>
      <div className="grid gap-2 md:grid-cols-[180px_1fr_auto]">
        <Input placeholder="FEC ID (e.g. C00669259)" value={fecId} onChange={(e) => setFecId(e.target.value)} />
        <Input placeholder="Alias name (e.g. FF PAC)" value={aliasName} onChange={(e) => setAliasName(e.target.value)} />
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>Save alias</Button>
      </div>

      <Input placeholder="Search aliases..." value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>FEC Committee ID</TableHead>
              <TableHead>Alias name</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No aliases found.</TableCell></TableRow>
            ) : filtered.map((a) => (
              <TableRow key={a.fec_committee_id}>
                <TableCell>{a.fec_committee_id}</TableCell>
                <TableCell>{a.alias_name}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(a.fec_committee_id)} disabled={deleteMutation.isPending}>Remove</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
