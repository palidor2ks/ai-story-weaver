import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CommitteeAlias {
  id: string;
  canonical_name: string;
  fec_committee_ids: string[];
  notes: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RawCommitteeSearchResult {
  name: string | null;
  fec_committee_id: string;
  treasurer_name: string | null;
  source: 'outside_spender' | 'pac_registry' | 'candidate_committee' | 'recipient';
}

export interface CommitteeAliasInput {
  canonical_name: string;
  fec_committee_ids: string[];
  notes: string;
  is_active: boolean;
}

const invalidateAliasReaders = (qc: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: ['committee-aliases'] }),
    qc.invalidateQueries({ queryKey: ['active-committee-aliases'] }),
    qc.invalidateQueries({ queryKey: ['top-spenders'] }),
  ]);

export function useCommitteeAliases() {
  return useQuery({
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
}

// Search every committee source an alias can affect: outside spenders, PAC
// registrations, candidate committees, and donor-profile recipients.
export function useCommitteeAliasSearch(debouncedCommitteeSearch: string) {
  return useQuery({
    queryKey: ['committee-aliases-raw-search', debouncedCommitteeSearch],
    enabled: debouncedCommitteeSearch.length >= 2,
    queryFn: async (): Promise<RawCommitteeSearchResult[]> => {
      // Commas/parens would break PostgREST's .or() grouping syntax.
      const safe = debouncedCommitteeSearch.replace(/[,()]/g, ' ').trim();
      if (!safe) return [];
      const like = `%${safe}%`;

      const [ieRes, pacNameRes, candidateCommitteeRes, recipientCommitteeRes] = await Promise.all([
        (supabase as any)
          .from('committee_independent_expenditure_totals')
          .select('spending_committee_fec_id, spending_committee_name, total_amount')
          .or(`spending_committee_name.ilike.${like},spending_committee_fec_id.ilike.${like}`)
          .order('total_amount', { ascending: false })
          .limit(30),
        (supabase as any)
          .from('external_pacs')
          .select('fec_committee_id, name, treasurer_name')
          .or(`name.ilike.${like},fec_committee_id.ilike.${like}`)
          .order('name', { ascending: true })
          .limit(30),
        (supabase as any)
          .from('candidate_committees')
          .select('fec_committee_id, name')
          .or(`name.ilike.${like},fec_committee_id.ilike.${like}`)
          .order('name', { ascending: true })
          .limit(30),
        (supabase as any)
          .from('donors')
          .select('recipient_committee_id, recipient_committee_name, amount')
          .not('recipient_committee_id', 'is', null)
          .or(`recipient_committee_name.ilike.${like},recipient_committee_id.ilike.${like}`)
          .order('amount', { ascending: false })
          .limit(100),
      ]);
      if (ieRes.error) throw ieRes.error;
      if (pacNameRes.error) throw pacNameRes.error;
      if (candidateCommitteeRes.error) throw candidateCommitteeRes.error;
      if (recipientCommitteeRes.error) throw recipientCommitteeRes.error;

      const ieRows = (ieRes.data ?? []) as Array<{
        spending_committee_fec_id: string;
        spending_committee_name: string | null;
      }>;
      const pacRows = (pacNameRes.data ?? []) as Array<{
        fec_committee_id: string;
        name: string | null;
        treasurer_name: string | null;
      }>;
      const candidateRows = (candidateCommitteeRes.data ?? []) as Array<{
        fec_committee_id: string;
        name: string | null;
      }>;
      const recipientRows = (recipientCommitteeRes.data ?? []) as Array<{
        recipient_committee_id: string | null;
        recipient_committee_name: string | null;
      }>;

      // Enrich the IE spenders with their registered FEC name + treasurer when we
      // have it (so "HMP" can display as "HOUSE MAJORITY PAC" once external_pacs
      // is populated). Falls back gracefully to the filer name when it is not.
      const ieIds = Array.from(new Set(ieRows.map((r) => r.spending_committee_fec_id).filter(Boolean)));
      const pacMap = new Map<string, { name: string | null; treasurer_name: string | null }>();
      pacRows.forEach((p) => pacMap.set(p.fec_committee_id, { name: p.name, treasurer_name: p.treasurer_name }));
      if (ieIds.length > 0) {
        const { data: enrich } = await (supabase as any)
          .from('external_pacs')
          .select('fec_committee_id, name, treasurer_name')
          .in('fec_committee_id', ieIds);
        ((enrich ?? []) as typeof pacRows).forEach((p) =>
          pacMap.set(p.fec_committee_id, { name: p.name, treasurer_name: p.treasurer_name }),
        );
      }

      // Merge by FEC id: outside spenders first (ranked by spend), then any
      // registration-only matches (lets a search for the full name work too).
      const merged = new Map<string, RawCommitteeSearchResult>();
      ieRows.forEach((r) => {
        const pac = pacMap.get(r.spending_committee_fec_id);
        merged.set(r.spending_committee_fec_id, {
          name: pac?.name || r.spending_committee_name,
          fec_committee_id: r.spending_committee_fec_id,
          treasurer_name: pac?.treasurer_name ?? null,
          source: 'outside_spender',
        });
      });
      pacRows.forEach((p) => {
        if (merged.has(p.fec_committee_id)) return;
        merged.set(p.fec_committee_id, {
          name: p.name,
          fec_committee_id: p.fec_committee_id,
          treasurer_name: p.treasurer_name,
          source: 'pac_registry',
        });
      });
      candidateRows.forEach((c) => {
        if (!c.fec_committee_id || merged.has(c.fec_committee_id)) return;
        merged.set(c.fec_committee_id, {
          name: c.name,
          fec_committee_id: c.fec_committee_id,
          treasurer_name: null,
          source: 'candidate_committee',
        });
      });
      recipientRows.forEach((r) => {
        if (!r.recipient_committee_id || merged.has(r.recipient_committee_id)) return;
        merged.set(r.recipient_committee_id, {
          name: r.recipient_committee_name,
          fec_committee_id: r.recipient_committee_id,
          treasurer_name: null,
          source: 'recipient',
        });
      });

      return Array.from(merged.values()).slice(0, 30);
    },
  });
}

export function useCreateCommitteeAlias() {
  const qc = useQueryClient();
  return useMutation({
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
      toast.success('Committee alias created');
      await invalidateAliasReaders(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateCommitteeAlias() {
  const qc = useQueryClient();
  return useMutation({
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
      toast.success('Committee alias updated');
      await invalidateAliasReaders(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCommitteeAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('committee_aliases')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success('Committee alias removed');
      await invalidateAliasReaders(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Committee causes live per-FEC-ID in `committee_topics` (the source of truth the
// bulk Committee Causes panel + quiz scoring read). Assigning writes through to
// every member ID so the cause flows into scoring.
export function useSetAliasCause() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fecIds, causeId }: { fecIds: string[]; causeId: string }) => {
      if (fecIds.length === 0) throw new Error('Add an FEC committee ID first');
      const rows = fecIds.map((id) => ({
        fec_committee_id: id,
        primary_cause_id: causeId,
        secondary_cause_ids: [],
        assigned_by: 'admin',
        admin_overridden: true,
      }));
      const { error } = await supabase.from('committee_topics').upsert(rows as any);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success('Cause updated');
      await qc.invalidateQueries({ queryKey: ['committee-topics-map'] });
      qc.refetchQueries({ queryKey: ['committee-pool'], type: 'active' });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Invoke the AI committee-topic classifier. Returns the raw response so the caller
// can branch on `data.queued`.
export function classifyCommitteeTopic(fecCommitteeIds: string[]) {
  return supabase.functions.invoke('classify-committee-topic', {
    body: { fec_committee_ids: fecCommitteeIds, force: true },
  });
}
