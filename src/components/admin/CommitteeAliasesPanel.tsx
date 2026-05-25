import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

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
      const { error } = await (supabase as any)
        .from('committee_aliases')
        .delete()
        .eq('fec_committee_id', id);
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
    return aliases.filter(
      (a) =>
        a.fec_committee_id.toLowerCase().includes(q) ||
        a.alias_name.toLowerCase().includes(q),
    );
  }, [aliases, search]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Outside Spender Aliases</CardTitle>
        <CardDescription>
          Set display-name aliases for top outside spenders by FEC committee ID. Aliases override
          the default name shown on the Top Spenders page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-[180px]"
            placeholder="FEC committee ID"
            value={fecId}
            onChange={(e) => setFecId(e.target.value)}
          />
          <Input
            className="max-w-sm flex-1"
            placeholder="Alias name"
            value={aliasName}
            onChange={(e) => setAliasName(e.target.value)}
          />
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            Save alias
          </Button>
        </div>

        <Input
          className="max-w-sm"
          placeholder="Search aliases..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

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
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No aliases found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((a) => (
                <TableRow key={a.fec_committee_id}>
                  <TableCell className="font-mono text-xs">{a.fec_committee_id}</TableCell>
                  <TableCell>{a.alias_name}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(a.fec_committee_id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
