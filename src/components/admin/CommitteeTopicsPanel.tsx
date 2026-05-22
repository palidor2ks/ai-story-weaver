import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Sparkles, Search, X, Check, Trash2, Plus, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useTopics } from '@/hooks/useCandidates';
import {
  useUpsertCommitteeTopic,
  useDeleteCommitteeTopic,
  useCommitteeCauses,
  useUpsertCommitteeCause,
  useDeleteCommitteeCause,
} from '@/hooks/useCommitteeTopics';
import { useImportFecCommittee, useSyncFecCommittees } from '@/hooks/useImportFecCommittee';
import { useCommitteePool, useRefreshCommitteePool } from '@/hooks/useCommitteePool';

const sourceLabel = (s: string) =>
  s === 'candidate_committees' ? 'Candidate cmte'
  : s === 'independent_expenditures' ? 'IE spender'
  : 'Standalone PAC';

const stanceColor = (s: string) =>
  s === 'pro' ? 'bg-primary/10 text-primary border-primary/30'
  : s === 'anti' ? 'bg-destructive/10 text-destructive border-destructive/30'
  : 'bg-muted text-muted-foreground border-muted-foreground/20';

const PAGE_SIZE = 100;

// ---------------- Assignments tab ----------------
const AssignmentsTab = () => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unassigned' | 'ai' | 'admin' | 'low-confidence'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'candidate_committees' | 'independent_expenditures' | 'external_pacs'>('all');
  const [page, setPage] = useState(0);
  const [running, setRunning] = useState(false);
  const [importId, setImportId] = useState('');
  const importMut = useImportFecCommittee();
  const syncMut = useSyncFecCommittees();
  const refreshPool = useRefreshCommitteePool();
  const [refreshing, setRefreshing] = useState(false);

  const { data: causes = [] } = useCommitteeCauses(false);
  const upsert = useUpsertCommitteeTopic();
  const del = useDeleteCommitteeTopic();

  const { data, isLoading, isFetching } = useCommitteePool({
    search,
    source: sourceFilter,
    assigned: filter,
    page,
    pageSize: PAGE_SIZE,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Reset to page 0 when filters change
  const resetPage = () => setPage(0);

  const causeById = useMemo(() => new Map(causes.map((c) => [c.id, c])), [causes]);
  const causesByIssue = useMemo(() => {
    const grouped = new Map<string, typeof causes>();
    causes.forEach((c) => {
      const arr = grouped.get(c.issue) ?? [];
      arr.push(c);
      grouped.set(c.issue, arr);
    });
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [causes]);

  const handleClassifyUnassigned = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('classify-committee-topic', { body: { limit: 50 } });
      if (error) throw error;
      toast.success(data?.queued ? `Queued ${data.queued} committees` : `Classified ${data?.processed ?? 0}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Classification failed');
    } finally {
      setRunning(false);
    }
  };

  const handleClassifyOne = async (fecId: string) => {
    try {
      const { error } = await supabase.functions.invoke('classify-committee-topic', {
        body: { fec_committee_ids: [fecId], force: true },
      });
      if (error) throw error;
      toast.success('AI classified');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed');
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="text-sm text-muted-foreground">
          Tag external committees (PACs, SuperPACs, party committees) with one primary cause (Pro-Israel, Pro-gun, etc.).
          <span className="ml-2 text-xs">
            {total.toLocaleString()} committees · page {page + 1} of {totalPages}
            {isFetching && <Loader2 className="inline w-3 h-3 animate-spin ml-2" />}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              setRefreshing(true);
              await refreshPool();
              setRefreshing(false);
            }}
            disabled={refreshing}
            className="gap-2"
          >
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh pool
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (confirm('Pull the full FEC PAC universe (PACs, SuperPACs, party, leadership) for the 2024 + 2026 cycles? This takes a few minutes and runs in the background.')) {
                syncMut.mutate();
              }
            }}
            disabled={syncMut.isPending}
            className="gap-2"
          >
            {syncMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync FEC universe
          </Button>
          <Button onClick={handleClassifyUnassigned} disabled={running} className="gap-2">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Run AI on unassigned
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            placeholder="Search committees by name or FEC ID"
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={(v: any) => { setFilter(v); resetPage(); }}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All committees</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            <SelectItem value="ai">AI-assigned</SelectItem>
            <SelectItem value="admin">Admin override</SelectItem>
            <SelectItem value="low-confidence">Low AI confidence</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={(v: any) => { setSourceFilter(v); resetPage(); }}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="candidate_committees">Candidate cmtes</SelectItem>
            <SelectItem value="independent_expenditures">IE spenders</SelectItem>
            <SelectItem value="external_pacs">Standalone PACs</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2 items-center">
          <Input
            value={importId}
            onChange={(e) => setImportId(e.target.value.toUpperCase())}
            placeholder="Add by FEC ID (e.g. C00797670)"
            className="w-[240px]"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!/^C\d{8}$/.test(importId)) {
                toast.error('FEC ID must be C followed by 8 digits');
                return;
              }
              importMut.mutate(importId, { onSuccess: () => setImportId('') });
            }}
            disabled={importMut.isPending}
            className="gap-1"
          >
            {importMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Committee</TableHead>
                  <TableHead className="w-[300px]">Primary Cause</TableHead>
                  <TableHead className="w-[140px]">Source</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const hasAssign = !!c.primary_cause_id;
                  const currentCause = hasAssign ? causeById.get(c.primary_cause_id!) : null;
                  return (
                    <TableRow key={c.fec_committee_id}>
                      <TableCell>
                        <div className="font-medium">{c.name ?? c.fec_committee_id}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.fec_committee_id}{c.designation && <> · {c.designation}</>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={c.primary_cause_id ?? ''}
                          onValueChange={(causeId) => {
                            upsert.mutate({
                              fec_committee_id: c.fec_committee_id,
                              primary_cause_id: causeId,
                              secondary_cause_ids: c.secondary_cause_ids ?? [],
                            });
                          }}
                        >
                          <SelectTrigger className="h-8"><SelectValue placeholder="— pick a cause —" /></SelectTrigger>
                          <SelectContent>
                            {causesByIssue.map(([issue, list]) => (
                              <div key={issue}>
                                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">{issue}</div>
                                {list.map((cause) => (
                                  <SelectItem key={cause.id} value={cause.id}>
                                    <span className="flex items-center gap-2">
                                      <span className={`inline-block w-2 h-2 rounded-full ${cause.stance === 'pro' ? 'bg-primary' : cause.stance === 'anti' ? 'bg-destructive' : 'bg-muted-foreground'}`} />
                                      {cause.label}
                                    </span>
                                  </SelectItem>
                                ))}
                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                        {currentCause && (
                          <div className="text-[10px] text-muted-foreground mt-1">
                            → {currentCause.quiz_topic_id.replace(/-/g, ' ')}
                          </div>
                        )}
                        {c.ai_reasoning && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.ai_reasoning}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        {hasAssign ? (
                          <div className="flex flex-col gap-1">
                            <Badge variant={c.admin_overridden ? 'default' : 'secondary'} className="w-fit text-[10px]">
                              {c.admin_overridden ? 'Admin' : 'AI'}
                            </Badge>
                            {c.ai_confidence && !c.admin_overridden && (
                              <span className="text-[10px] text-muted-foreground">{c.ai_confidence} confidence</span>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Unassigned</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleClassifyOne(c.fec_committee_id)} title="Re-run AI">
                            <Sparkles className="w-3.5 h-3.5" />
                          </Button>
                          {hasAssign && (
                            <Button variant="ghost" size="sm" onClick={() => del.mutate(c.fec_committee_id)} title="Clear cause">
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No committees match.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="text-xs text-muted-foreground">
              Showing {rows.length === 0 ? 0 : page * PAGE_SIZE + 1}–{page * PAGE_SIZE + rows.length} of {total.toLocaleString()}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || isFetching}>
                <ChevronLeft className="w-4 h-4" /> Prev
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= totalPages || isFetching}>
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

// ---------------- Library tab ----------------
const LibraryTab = () => {
  const { data: causes = [], isLoading } = useCommitteeCauses(true);
  const { data: topics = [] } = useTopics();
  const upsert = useUpsertCommitteeCause();
  const del = useDeleteCommitteeCause();
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ id: '', label: '', stance: 'pro', issue: '', quiz_topic_id: '', description: '' });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return causes.filter((c) =>
      !q || c.label.toLowerCase().includes(q) || c.issue.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    );
  }, [causes, search]);

  const approve = (id: string) => upsert.mutate({ id, label: '', stance: '', issue: '', quiz_topic_id: '', status: 'active' } as any, {
    onSuccess: () => toast.success('Cause activated'),
    onError: (e: any) => toast.error(e?.message ?? 'Failed'),
  });

  const handleCreate = async () => {
    if (!draft.id || !draft.label || !draft.issue || !draft.quiz_topic_id) {
      toast.error('id, label, issue and quiz topic are required');
      return;
    }
    try {
      await upsert.mutateAsync({ ...draft, status: 'active', created_by: 'admin' } as any);
      toast.success('Cause saved');
      setShowNew(false);
      setDraft({ id: '', label: '', stance: 'pro', issue: '', quiz_topic_id: '', description: '' });
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed');
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search causes" className="pl-9" />
        </div>
        <Button onClick={() => setShowNew((s) => !s)}>{showNew ? 'Cancel' : 'New cause'}</Button>
      </div>

      {showNew && (
        <Card className="mb-4">
          <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input placeholder="id (slug, e.g. pro-israel)" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} />
            <Input placeholder="label (e.g. Pro-Israel)" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            <Select value={draft.stance} onValueChange={(v) => setDraft({ ...draft, stance: v })}>
              <SelectTrigger><SelectValue placeholder="stance" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="anti">Anti</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="issue (e.g. Israel)" value={draft.issue} onChange={(e) => setDraft({ ...draft, issue: e.target.value })} />
            <Select value={draft.quiz_topic_id} onValueChange={(v) => setDraft({ ...draft, quiz_topic_id: v })}>
              <SelectTrigger><SelectValue placeholder="maps to quiz topic" /></SelectTrigger>
              <SelectContent>
                {topics.map((t: any) => (<SelectItem key={t.id} value={t.id}>{t.displayName || t.name}</SelectItem>))}
              </SelectContent>
            </Select>
            <Input placeholder="description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="md:col-span-2" />
            <Button onClick={handleCreate} className="md:col-span-2">Save cause</Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cause</TableHead>
                <TableHead>Stance</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Quiz Topic</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c.label}</div>
                    <div className="text-xs text-muted-foreground">{c.id}</div>
                    {c.description && <div className="text-xs text-muted-foreground mt-0.5 max-w-md">{c.description}</div>}
                  </TableCell>
                  <TableCell><Badge variant="outline" className={`text-[10px] ${stanceColor(c.stance)}`}>{c.stance}</Badge></TableCell>
                  <TableCell className="text-sm">{c.issue}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.quiz_topic_id}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === 'active' ? 'default' : c.status === 'pending' ? 'secondary' : 'outline'} className="text-[10px]">
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.created_by}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {c.status === 'pending' && (
                        <Button variant="ghost" size="sm" title="Approve" onClick={() => approve(c.id)}>
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" title="Delete" onClick={() => {
                        if (confirm(`Delete cause "${c.label}"? This will fail if any committee is using it.`)) {
                          del.mutate(c.id, { onError: (e: any) => toast.error(e?.message ?? 'Cannot delete') });
                        }
                      }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No causes.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
};

export const CommitteeTopicsPanel = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Committee Causes</CardTitle>
        <CardDescription>
          Tag PACs / SuperPACs / party committees with a cause/stance label (e.g. <em>Pro-Israel</em>, <em>Pro-gun</em>). Each cause maps to one of the 17 quiz topics.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="assignments">
          <TabsList>
            <TabsTrigger value="assignments">Committee assignments</TabsTrigger>
            <TabsTrigger value="library">Causes library</TabsTrigger>
          </TabsList>
          <TabsContent value="assignments" className="mt-4"><AssignmentsTab /></TabsContent>
          <TabsContent value="library" className="mt-4"><LibraryTab /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
