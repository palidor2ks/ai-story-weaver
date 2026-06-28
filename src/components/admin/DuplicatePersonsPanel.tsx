import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Merge, Trash2, Wand2, Sparkles } from 'lucide-react';
import {
  useDuplicatePersonGroups,
  useMergeablePersonPairs,
  useMergePersons,
  useAutoMergePersons,
  useCleanupAiCandidates,
  useDeleteRosterRow,
} from '@/hooks/useDuplicatePersons';

export default function DuplicatePersonsPanel() {
  const groupsQ = useDuplicatePersonGroups();
  const pairsQ = useMergeablePersonPairs();
  const merge = useMergePersons();
  const autoMerge = useAutoMergePersons();
  const cleanupAi = useCleanupAiCandidates();
  const deleteRow = useDeleteRosterRow();

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
                    {g.rows.map((r) => {
                      const rowKey = `${r.source}:${r.source_id}`;
                      return (
                        <div key={rowKey} className="flex items-center gap-2">
                          <Badge variant="outline">{r.source}</Badge>
                          <code className="text-xs text-muted-foreground">{r.source_id}</code>
                          <span>— {r.name}</span>
                          {r.office && <span className="text-muted-foreground">· {r.office}</span>}
                          {r.state && <span className="text-muted-foreground">· {r.state}</span>}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-auto h-7 px-2 text-destructive hover:text-destructive"
                            disabled={deleteRow.isPending}
                            onClick={() => {
                              if (confirm(`Delete ${r.source} row ${r.source_id}? This cannot be undone.`)) {
                                deleteRow.mutate({ source: r.source, id: r.source_id });
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
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
