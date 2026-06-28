import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SourceRow {
  source: 'candidates' | 'static_officials' | 'election_candidates';
  source_id: string;
  name: string;
  state: string | null;
  office: string | null;
}
export interface PersonGroup {
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

function invalidateRoster(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['duplicate-persons'] });
  queryClient.invalidateQueries({ queryKey: ['merge-candidate-pairs'] });
  queryClient.invalidateQueries({ queryKey: ['candidates'] });
  queryClient.invalidateQueries({ queryKey: ['static-officials'] });
}

export function useDuplicatePersonGroups() {
  return useQuery({ queryKey: ['duplicate-persons'], queryFn: fetchDuplicateGroups });
}

export function useMergeablePersonPairs() {
  return useQuery({ queryKey: ['merge-candidate-pairs'], queryFn: fetchMergeCandidates });
}

export function useMergePersons() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ into, from }: { into: string; from: string }) => {
      const { error } = await supabase.rpc('merge_persons', { into_id: into, from_id: from });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Merged');
      invalidateRoster(queryClient);
    },
    onError: (e: Error) => toast.error(`Merge failed: ${e.message}`),
  });
}

export function useAutoMergePersons() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('auto_merge_obvious_persons');
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => { toast.success(`Auto-merged ${n} person record${n === 1 ? '' : 's'}`); invalidateRoster(queryClient); },
    onError: (e: Error) => toast.error(`Auto-merge failed: ${e.message}`),
  });
}

export function useCleanupAiCandidates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('cleanup_redundant_ai_candidates');
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => { toast.success(`Removed ${n} redundant AI candidate row${n === 1 ? '' : 's'}`); invalidateRoster(queryClient); },
    onError: (e: Error) => toast.error(`Cleanup failed: ${e.message}`),
  });
}

export function useDeleteRosterRow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ source, id }: { source: string; id: string }) => {
      const { error } = await supabase.rpc('admin_delete_roster_row', { _source: source, _id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Deleted'); invalidateRoster(queryClient); },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });
}
