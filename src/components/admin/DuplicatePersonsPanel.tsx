import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Merge, Trash2, Wand2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface SourceRow {
  source: 'candidates' | 'static_officials' | 'election_candidates';
  source_id: string;
  name: string;
  state: string | null;
  office: string | null;
}
interface PersonGroup {
  person_id: string;
  display_name: string;
  rows: SourceRow[];
}

async function fetchDuplicateGroups(): Promise<PersonGroup[]> {
  const [{ data: persons }, { data: cands }, { data: officials }, { data: elects }] = await Promise.all([
    supabase.from('persons').select('id, display_name'),
    supabase.from('candidates').select('id, name, state, office, person_id').not('person_id', 'is', null),
    supabase.from('static_officials').select('id, name, state, office, person_id').not('person_id', 'is', null),
    supabase.from('election_candidates').select('id, office, person_id, candidate_id').not('person_id', 'is', null),
  ]);

  const groups = new Map<string, PersonGroup>();
  const ensure = (pid: string) => {
    let g = groups.get(pid);
    if (!g) {
      const p = persons?.find((x) => x.id === pid);
      g = { person_id: pid, display_name: p?.display_name ?? pid, rows: [] };
      groups.set(pid, g);
    }
    return g;
  };

  for (const c of cands ?? []) {
    ensure(c.person_id!).rows.push({ source: 'candidates', source_id: c.id, name: c.name, state: c.state, office: c.office });
  }
  for (const s of officials ?? []) {
    ensure(s.person_id!).rows.push({ source: 'static_officials', source_id: s.id, name: s.name, state: s.state, office: s.office });
  }
  for (const e of elects ?? []) {
    ensure(e.person_id!).rows.push({ source: 'election_candidates', source_id: e.id, name: e.candidate_id ?? '(election)', state: null, office: e.office });
  }

  return Array.from(groups.values())
    .filter((g) => g.rows.length > 1)
    .sort((a, b) => b.rows.length - a.rows.length);
}

async function fetchMergeCandidates(): Promise<Array<{ a: PersonGroup; b: PersonGroup }>> {
  // Find persons with the same normalized_name + state (different office_key may still be the same human).
  const { data, error } = await supabase
    .from('persons')
    .select('id, display_name, normalized_name, state, office_key');
  if (error || !data) return [];

  const byKey = new Map<string, typeof data>();
  for (const p of data) {
    const key = `${p.normalized_name}::${p.state ?? ''}`;
    const arr = byKey.get(key) ?? [];
    arr.push(p);
    byKey.set(key, arr);
  }

  const out: Array<{ a: PersonGroup; b: PersonGroup }> = [];
  for (const arr of byKey.values()) {
    if (arr.length < 2) continue;
    // Pair every combination (small N expected)
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        out.push({
          a: { person_id: arr[i].id, display_name: arr[i].display_name, rows: [] },
          b: { person_id: arr[j].id, display_name: arr[j].display_name, rows: [] },
        });
      }
    }
  }
  return out;
}

export default function DuplicatePersonsPanel() {
  const queryClient = useQueryClient();
  const groupsQ = useQuery({ queryKey: ['duplicate-persons'], queryFn: fetchDuplicateGroups });
  const pairsQ = useQuery({ queryKey: ['merge-candidate-pairs'], queryFn: fetchMergeCandidates });

  const merge = useMutation({
    mutationFn: async ({ into, from }: { into: string; from: string }) => {
      const { error } = await supabase.rpc('merge_persons', { into_id: into, from_id: from });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Merged');
      queryClient.invalidateQueries({ queryKey: ['duplicate-persons'] });
      queryClient.invalidateQueries({ queryKey: ['merge-candidate-pairs'] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['static-officials'] });
    },
    onError: (e: Error) => toast.error(`Merge failed: ${e.message}`),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['duplicate-persons'] });
    queryClient.invalidateQueries({ queryKey: ['merge-candidate-pairs'] });
    queryClient.invalidateQueries({ queryKey: ['candidates'] });
    queryClient.invalidateQueries({ queryKey: ['static-officials'] });
  };

  const autoMerge = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('auto_merge_obvious_persons');
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => { toast.success(`Auto-merged ${n} person record${n === 1 ? '' : 's'}`); invalidateAll(); },
    onError: (e: Error) => toast.error(`Auto-merge failed: ${e.message}`),
  });

  const cleanupAi = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('cleanup_redundant_ai_candidates');
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => { toast.success(`Removed ${n} redundant AI candidate row${n === 1 ? '' : 's'}`); invalidateAll(); },
    onError: (e: Error) => toast.error(`Cleanup failed: ${e.message}`),
  });

  const deleteRow = useMutation({
    mutationFn: async ({ source, id }: { source: string; id: string }) => {
      const { error } = await supabase.rpc('admin_delete_roster_row', { _source: source, _id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Deleted'); invalidateAll(); },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const doMerge = async (into: string, from: string, key: string) => {
    setBusyKey(key);
    try { await merge.mutateAsync({ into, from }); } finally { setBusyKey(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => autoMerge.mutate()} disabled={autoMerge.isPending}>
          {autoMerge.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Wand2 className="mr-1 h-3 w-3" />}
          Run auto-merge
        </Button>
        <Button size="sm" variant="outline" onClick={() => cleanupAi.mutate()} disabled={cleanupAi.isPending}>
          {cleanupAi.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
          Cleanup AI seed candidates
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Persons with multiple source rows</CardTitle>
          <CardDescription>
            A single canonical person already linked to more than one row in candidates / static_officials / election_candidates. Usually expected (e.g. a candidate who is also an incumbent official). Remove the unwanted source row to clean up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {groupsQ.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : groupsQ.data && groupsQ.data.length > 0 ? (
            <div className="space-y-3">
              {groupsQ.data.map((g) => (
                <div key={g.person_id} className="rounded-md border p-3">
                  <div className="font-medium">{g.display_name}</div>
                  <div className="mt-2 space-y-1 text-sm">
                    {g.rows.map((r) => (
                      <div key={`${r.source}:${r.source_id}`} className="flex items-center gap-2">
                        <Badge variant="outline">{r.source}</Badge>
                        <code className="text-xs text-muted-foreground">{r.source_id}</code>
                        <span>— {r.name}</span>
                        {r.office && <span className="text-muted-foreground">· {r.office}</span>}
                        {r.state && <span className="text-muted-foreground">· {r.state}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No persons with multiple source rows.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mergeable person pairs</CardTitle>
          <CardDescription>
            Distinct person records that share a normalized name and state but differ on office_key. Likely the same human — merging collapses them into one canonical identity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pairsQ.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : pairsQ.data && pairsQ.data.length > 0 ? (
            <div className="space-y-2">
              {pairsQ.data.map((p) => {
                const key = `${p.a.person_id}:${p.b.person_id}`;
                return (
                  <div key={key} className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
                    <span>{p.a.display_name}</span>
                    <code className="text-xs text-muted-foreground">{p.a.person_id.slice(0, 8)}</code>
                    <span className="text-muted-foreground">↔</span>
                    <span>{p.b.display_name}</span>
                    <code className="text-xs text-muted-foreground">{p.b.person_id.slice(0, 8)}</code>
                    <div className="ml-auto flex gap-2">
                      <Button size="sm" variant="outline" disabled={busyKey === key} onClick={() => doMerge(p.a.person_id, p.b.person_id, key)}>
                        <Merge className="mr-1 h-3 w-3" /> Keep A
                      </Button>
                      <Button size="sm" variant="outline" disabled={busyKey === key} onClick={() => doMerge(p.b.person_id, p.a.person_id, key)}>
                        <Merge className="mr-1 h-3 w-3" /> Keep B
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No likely-duplicate pairs detected.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
