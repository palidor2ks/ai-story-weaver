import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DonorCauseInfo {
  causeId: string;
  label: string;
  description: string | null;
  stance: string | null;
  quizTopicId: string | null;
  confidence: string | null;
  assignedBy: string;
  adminOverridden: boolean;
  fecCommitteeId: string;
}

const norm = (s: string) => s.trim().toUpperCase();
const CAUSE_ELIGIBLE_DONOR_TYPES = new Set(['Individual', 'PAC', 'Organization', 'Org/PAC']);
const SUPABASE_IN_FILTER_BATCH_SIZE = 100;

const chunk = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const getCauseLookupTypes = (type: string) => {
  // Donor cards collapse raw PAC and Organization records into an Org/PAC
  // display bucket, but donor_alias_members stores the raw donor_type values.
  if (type === 'Org/PAC') return ['PAC', 'Organization'];
  return CAUSE_ELIGIBLE_DONOR_TYPES.has(type) ? [type] : [];
};

export interface DonorNameInput {
  name: string;
  type: string; // 'Individual' | 'PAC' | 'Organization' | ...
}

export function useDonorCauses(inputs: DonorNameInput[]) {
  const uniqueInputs = Array.from(
    inputs
      .filter(d => d.name && CAUSE_ELIGIBLE_DONOR_TYPES.has(d.type))
      .flatMap(d => getCauseLookupTypes(d.type).map(type => ({ name: d.name, type })))
      .reduce((map, d) => {
        const key = `${norm(d.name)}|${d.type}`;
        if (!map.has(key)) map.set(key, { name: d.name.trim(), type: d.type });
        return map;
      }, new Map<string, DonorNameInput>())
      .values()
  );

  // Stable key from sorted unique name+type pairs. Keep the original-cased
  // names above for Supabase equality filters; donor_alias_members stores the
  // FEC/display name as imported, not normalized uppercase.
  const pairs = uniqueInputs.map(d => `${norm(d.name)}|${d.type}`).sort();

  return useQuery({
    queryKey: ['donor-causes', pairs],
    enabled: pairs.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, DonorCauseInfo>> => {
      const result = new Map<string, DonorCauseInfo>();
      if (pairs.length === 0) return result;

      const names = Array.from(new Set(uniqueInputs.map(d => d.name)));
      const types = Array.from(new Set(uniqueInputs.map(d => d.type)));

      // donor_alias_members stores FEC-imported names, which are typically
      // uppercase, while donor cards display Title Case canonical names. The
      // Supabase `.in()` filter is case-sensitive, so match against both the
      // original-cased names and their uppercase variants. Downstream keys are
      // built with norm() (uppercase), so the extra variants are harmless.
      const lookupNames = Array.from(new Set(names.flatMap(n => [n, n.toUpperCase()])));

      // The first three lookup groups (direct overrides, alias members, canonical
      // aliases) don't depend on each other's results, so fetch the groups in
      // parallel. Each group is batched to keep Supabase/PostgREST URLs small on
      // candidate pages with thousands of donors. The processing below still runs
      // in the original order so cause-precedence (direct override > alias) holds.
      //
      // NOTE: keep these queries (and the loops that consume their results) free of
      // `as any` casts. The typed query builder brands the result row as a
      // SelectQueryError when a selected column no longer exists, so accessing the
      // row fields below fails the build instead of silently breaking at runtime —
      // which is exactly the regression that previously hid the primary-cause badge.
      const [directChunks, memberChunks, canonicalChunks] = await Promise.all([
        Promise.all(
          chunk(lookupNames, SUPABASE_IN_FILTER_BATCH_SIZE).map((nameBatch) =>
            supabase
              .from('donor_cause_overrides')
              .select('donor_name, donor_type, primary_cause_id, assigned_by, committee_causes!donor_cause_overrides_primary_cause_id_fkey(id, label, description, stance, quiz_topic_id)')
              .in('donor_name', nameBatch)
              .in('donor_type', types),
          ),
        ),
        Promise.all(
          chunk(lookupNames, SUPABASE_IN_FILTER_BATCH_SIZE).map((nameBatch) =>
            supabase
              .from('donor_alias_members')
              .select('donor_name, donor_type, alias_id, donor_aliases!inner(id, fec_committee_id, fec_committee_ids, is_active, primary_cause_id, cause_assigned_by, cause_ai_confidence)')
              .in('donor_name', nameBatch)
              .in('donor_type', types),
          ),
        ),
        Promise.all(
          chunk(lookupNames, SUPABASE_IN_FILTER_BATCH_SIZE).map((nameBatch) =>
            supabase
              .from('donor_aliases')
              .select('canonical_name, fec_committee_id, fec_committee_ids, is_active, primary_cause_id, cause_assigned_by, cause_ai_confidence')
              .in('canonical_name', nameBatch)
              .eq('is_active', true),
          ),
        ),
      ]);

      // 1. Apply direct donor-level cause overrides first. These let admins tag
      //    a donor search result without creating a donor alias.
      const directErr = directChunks.find((res) => res.error)?.error;
      if (directErr) throw directErr;
      const directOverrides = directChunks.flatMap((res) => res.data ?? []);

      for (const row of directOverrides) {
        const c = row.committee_causes;
        if (!c) continue;
        result.set(`${norm(row.donor_name)}|${row.donor_type}`, {
          causeId: c.id,
          label: c.label,
          description: c.description,
          stance: c.stance,
          quizTopicId: c.quiz_topic_id,
          confidence: null,
          assignedBy: row.assigned_by || 'admin',
          adminOverridden: row.assigned_by === 'admin',
          fecCommitteeId: '',
        });
      }

      // 2. Resolve names -> aliases (and fec_committee_ids + alias-level cause)
      const mErr = memberChunks.find((res) => res.error)?.error;
      if (mErr) throw mErr;
      const members = memberChunks.flatMap((res) => res.data ?? []);

      // name|type -> set of committee ids
      const nameToCommittees = new Map<string, string[]>();
      const allCommitteeIds = new Set<string>();
      // name|type -> alias-level cause id (preferred when set)
      const aliasLevelCause = new Map<string, { causeId: string; assignedBy: string; confidence: string | null; fecCommitteeId: string }>();
      const aliasCauseIds = new Set<string>();

      type AliasCauseRow = {
        fec_committee_id?: string | null;
        fec_committee_ids?: string[] | null;
        primary_cause_id?: string | null;
        cause_assigned_by?: string | null;
        cause_ai_confidence?: string | null;
      };
      const applyAliasToKey = (key: string, alias: AliasCauseRow) => {
        const ids: string[] = [];
        if (alias.fec_committee_id) ids.push(alias.fec_committee_id);
        if (Array.isArray(alias.fec_committee_ids)) ids.push(...alias.fec_committee_ids);
        if (ids.length > 0) {
          nameToCommittees.set(key, ids);
          ids.forEach(id => allCommitteeIds.add(id));
        }
        if (alias.primary_cause_id && !result.has(key)) {
          aliasLevelCause.set(key, {
            causeId: alias.primary_cause_id,
            assignedBy: alias.cause_assigned_by || 'admin',
            confidence: alias.cause_ai_confidence ?? null,
            fecCommitteeId: ids[0] || '',
          });
          aliasCauseIds.add(alias.primary_cause_id);
        }
      };

      for (const m of members) {
        const alias = m.donor_aliases;
        if (!alias?.is_active) continue;
        applyAliasToKey(`${norm(m.donor_name)}|${m.donor_type}`, alias as unknown as AliasCauseRow);
      }

      // Consolidated donor rows often use donor_aliases.canonical_name as the
      // displayed name, while donor_alias_members stores only the raw imported
      // FEC names. Resolve canonical names directly so alias-level causes still
      // appear for rows like "AIPAC". donor_aliases is type-agnostic (the donor
      // type lives on donor_alias_members), so match on name alone — uniqueInputs
      // is already filtered to cause-eligible types upstream.
      const canonicalErr = canonicalChunks.find((res) => res.error)?.error;
      if (canonicalErr) throw canonicalErr;
      const canonicalAliases = canonicalChunks.flatMap((res) => res.data ?? []);

      for (const alias of canonicalAliases) {
        for (const input of uniqueInputs) {
          if (norm(input.name) !== norm(alias.canonical_name)) continue;
          applyAliasToKey(`${norm(input.name)}|${input.type}`, alias as unknown as AliasCauseRow);
        }
      }

      // Resolve alias-level cause metadata
      if (aliasCauseIds.size > 0) {
        const causeChunks = await Promise.all(
          chunk(Array.from(aliasCauseIds), SUPABASE_IN_FILTER_BATCH_SIZE).map((causeIdBatch) =>
            supabase
              .from('committee_causes')
              .select('id, label, description, stance, quiz_topic_id')
              .in('id', causeIdBatch),
          ),
        );
        const causeErr = causeChunks.find((res) => res.error)?.error;
        if (causeErr) throw causeErr;
        const causeRows = causeChunks.flatMap((res) => res.data ?? []);
        const causeMap = new Map(
          ((causeRows ?? []) as Array<{ id: string; label: string; description: string | null; stance: string | null; quiz_topic_id: string | null }>).map((c) => [c.id, c]),
        );
        for (const [key, info] of aliasLevelCause.entries()) {
          const c = causeMap.get(info.causeId);
          if (!c) continue;
          result.set(key, {
            causeId: c.id,
            label: c.label,
            description: c.description,
            stance: c.stance,
            quizTopicId: c.quiz_topic_id,
            confidence: info.confidence,
            assignedBy: info.assignedBy,
            adminOverridden: info.assignedBy === 'admin',
            fecCommitteeId: info.fecCommitteeId,
          });
        }
      }

      if (allCommitteeIds.size === 0) return result;


      // 3. Fetch topics + causes for those committees
      const committeeIdBatches = chunk(Array.from(allCommitteeIds), SUPABASE_IN_FILTER_BATCH_SIZE);
      const topicChunks = await Promise.all(
        committeeIdBatches.map((committeeIdBatch) =>
          supabase
            .from('committee_topics')
            .select('fec_committee_id, primary_cause_id, ai_confidence, assigned_by, admin_overridden, committee_causes!committee_topics_primary_cause_id_fkey(id, label, description, stance, quiz_topic_id)')
            .in('fec_committee_id', committeeIdBatch),
        ),
      );
      const tErr = topicChunks.find((res) => res.error)?.error;
      const topics = tErr ? null : topicChunks.flatMap((res) => res.data ?? []);

      // Fallback if FK name differs: do a manual join
      const causeByCommittee = new Map<string, DonorCauseInfo>();
      if (tErr || !topics) {
        const topicPlainChunks = await Promise.all(
          committeeIdBatches.map((committeeIdBatch) =>
            supabase
              .from('committee_topics')
              .select('fec_committee_id, primary_cause_id, ai_confidence, assigned_by, admin_overridden')
              .in('fec_committee_id', committeeIdBatch),
          ),
        );
        const topicPlainErr = topicPlainChunks.find((res) => res.error)?.error;
        if (topicPlainErr) throw topicPlainErr;
        const topicsPlain = topicPlainChunks.flatMap((res) => res.data ?? []);
        const causeIds = Array.from(new Set(topicsPlain.map(t => t.primary_cause_id).filter(Boolean)));
        const causeChunks = await Promise.all(
          chunk(causeIds, SUPABASE_IN_FILTER_BATCH_SIZE).map((causeIdBatch) =>
            supabase
              .from('committee_causes')
              .select('id, label, description, stance, quiz_topic_id')
              .in('id', causeIdBatch),
          ),
        );
        const causesErr = causeChunks.find((res) => res.error)?.error;
        if (causesErr) throw causesErr;
        const causes = causeChunks.flatMap((res) => res.data ?? []);
        const causeMap = new Map((causes ?? []).map(c => [c.id, c]));
        for (const t of topicsPlain) {
          const c = causeMap.get(t.primary_cause_id);
          if (!c) continue;
          causeByCommittee.set(t.fec_committee_id, {
            causeId: c.id,
            label: c.label,
            description: c.description,
            stance: c.stance,
            quizTopicId: c.quiz_topic_id,
            confidence: t.ai_confidence,
            assignedBy: t.assigned_by || 'admin',
            adminOverridden: Boolean(t.admin_overridden),
            fecCommitteeId: t.fec_committee_id,
          });
        }
      } else {
        // Intentional `as any[]` here (unlike the queries above): the
        // committee_topics -> committee_causes embed relation is not present in
        // the generated types, so the typed builder can't resolve it. The
        // `if (tErr || !topics)` branch above is the runtime fallback for that.
        for (const t of topics as unknown as Array<{
          fec_committee_id: string;
          ai_confidence: string | null;
          assigned_by: string | null;
          admin_overridden: boolean | null;
          committee_causes: { id: string; label: string; description: string | null; stance: string | null; quiz_topic_id: string | null } | null;
        }>) {
          const c = t.committee_causes;
          if (!c) continue;
          causeByCommittee.set(t.fec_committee_id, {
            causeId: c.id,
            label: c.label,
            description: c.description,
            stance: c.stance,
            quizTopicId: c.quiz_topic_id,
            confidence: t.ai_confidence,
            assignedBy: t.assigned_by || 'admin',
            adminOverridden: Boolean(t.admin_overridden),
            fecCommitteeId: t.fec_committee_id,
          });
        }
      }

      // 4. Map donor name|type -> cause (prefer first committee with a cause)
      for (const [key, ids] of nameToCommittees.entries()) {
        if (result.has(key)) continue; // alias-level cause already set
        for (const id of ids) {
          const c = causeByCommittee.get(id);
          if (c) {
            result.set(key, c);
            break;
          }
        }
      }
      return result;
    },
  });
}

export function getDonorCause(
  map: Map<string, DonorCauseInfo> | undefined,
  name: string,
  type: string
): DonorCauseInfo | undefined {
  if (!map) return undefined;

  for (const lookupType of getCauseLookupTypes(type)) {
    const cause = map.get(`${norm(name)}|${lookupType}`);
    if (cause) return cause;
  }

  return undefined;
}
