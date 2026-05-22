import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Sparkles, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { TopicIcon } from '@/components/TopicIcon';
import { useTopics } from '@/hooks/useCandidates';
import {
  useAllCommitteeTopics,
  useUpsertCommitteeTopic,
  useDeleteCommitteeTopic,
} from '@/hooks/useCommitteeTopics';

interface CommitteeRow {
  fec_committee_id: string;
  name: string | null;
  designation: string | null;
  source: 'candidate_committees' | 'independent_expenditures';
}

const useExternalCommittees = () => {
  return useQuery({
    queryKey: ['admin-external-committees'],
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<CommitteeRow[]> => {
      const { data: cmtes } = await supabase
        .from('candidate_committees')
        .select('fec_committee_id, name, designation')
        .not('designation', 'in', '(P,A)')
        .limit(1000);

      const { data: ieRows } = await supabase
        .from('independent_expenditures')
        .select('spending_committee_fec_id, spending_committee_name')
        .limit(2000);

      const map = new Map<string, CommitteeRow>();
      (cmtes ?? []).forEach((c: any) => {
        if (!c.fec_committee_id) return;
        map.set(c.fec_committee_id, {
          fec_committee_id: c.fec_committee_id,
          name: c.name,
          designation: c.designation,
          source: 'candidate_committees',
        });
      });
      (ieRows ?? []).forEach((r: any) => {
        const id = r.spending_committee_fec_id;
        if (!id || map.has(id)) return;
        map.set(id, {
          fec_committee_id: id,
          name: r.spending_committee_name,
          designation: null,
          source: 'independent_expenditures',
        });
      });
      return Array.from(map.values()).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    },
  });
};

export const CommitteeTopicsPanel = () => {
  const { data: committees = [], isLoading } = useExternalCommittees();
  const { data: topicAssignments = [], isLoading: loadingTopics } = useAllCommitteeTopics();
  const { data: topics = [] } = useTopics();
  const upsert = useUpsertCommitteeTopic();
  const del = useDeleteCommitteeTopic();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unassigned' | 'ai' | 'admin' | 'low-confidence'>('all');
  const [running, setRunning] = useState(false);

  const federalTopics = useMemo(
    () => topics.filter((t: any) => t.scope === 'all' || t.scope === 'federal'),
    [topics],
  );

  const assignmentMap = useMemo(() => {
    const m = new Map<string, (typeof topicAssignments)[number]>();
    topicAssignments.forEach((r) => m.set(r.fec_committee_id, r));
    return m;
  }, [topicAssignments]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return committees.filter((c) => {
      if (q && !(c.name ?? '').toLowerCase().includes(q) && !c.fec_committee_id.toLowerCase().includes(q)) {
        return false;
      }
      const a = assignmentMap.get(c.fec_committee_id);
      if (filter === 'unassigned' && a) return false;
      if (filter === 'ai' && (!a || a.admin_overridden)) return false;
      if (filter === 'admin' && (!a || !a.admin_overridden)) return false;
      if (filter === 'low-confidence' && (!a || a.ai_confidence !== 'low')) return false;
      return true;
    }).slice(0, 500);
  }, [committees, assignmentMap, search, filter]);

  const handleClassifyUnassigned = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('classify-committee-topic', {
        body: { limit: 50 },
      });
      if (error) throw error;
      toast.success(
        data?.queued
          ? `Queued ${data.queued} committees for AI classification`
          : `Classified ${data?.processed ?? 0} committees`,
      );
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
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Committee Topics</CardTitle>
            <CardDescription>
              Tag external committees (PACs, SuperPACs, party committees) with one primary topic
              and optional secondaries. AI suggests; admin overrides are preserved on future runs.
            </CardDescription>
          </div>
          <Button onClick={handleClassifyUnassigned} disabled={running} className="gap-2">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Run AI on unassigned
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search committees by name or FEC ID"
              className="pl-9"
            />
          </div>
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All committees</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectItem value="ai">AI-assigned</SelectItem>
              <SelectItem value="admin">Admin override</SelectItem>
              <SelectItem value="low-confidence">Low AI confidence</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(isLoading || loadingTopics) ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Committee</TableHead>
                  <TableHead className="w-[260px]">Primary Topic</TableHead>
                  <TableHead className="w-[140px]">Source</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((c) => {
                  const assignment = assignmentMap.get(c.fec_committee_id);
                  return (
                    <TableRow key={c.fec_committee_id}>
                      <TableCell>
                        <div className="font-medium">{c.name ?? c.fec_committee_id}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.fec_committee_id}
                          {c.designation && <> · {c.designation}</>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={assignment?.primary_topic_id ?? ''}
                          onValueChange={(topicId) => {
                            upsert.mutate({
                              fec_committee_id: c.fec_committee_id,
                              primary_topic_id: topicId,
                              secondary_topic_ids: assignment?.secondary_topic_ids ?? [],
                            });
                          }}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="— pick a topic —" />
                          </SelectTrigger>
                          <SelectContent>
                            {federalTopics.map((t: any) => (
                              <SelectItem key={t.id} value={t.id}>
                                <span className="flex items-center gap-2">
                                  <TopicIcon name={t.icon} className="w-4 h-4" />
                                  {t.displayName || t.name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {assignment?.ai_reasoning && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {assignment.ai_reasoning}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {assignment ? (
                          <div className="flex flex-col gap-1">
                            <Badge variant={assignment.admin_overridden ? 'default' : 'secondary'} className="w-fit text-[10px]">
                              {assignment.admin_overridden ? 'Admin' : 'AI'}
                            </Badge>
                            {assignment.ai_confidence && !assignment.admin_overridden && (
                              <span className="text-[10px] text-muted-foreground">
                                {assignment.ai_confidence} confidence
                              </span>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Unassigned</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleClassifyOne(c.fec_committee_id)}
                            title="Re-run AI classification"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </Button>
                          {assignment && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => del.mutate(c.fec_committee_id)}
                              title="Clear topic"
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {visible.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No committees match the current filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
