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

const getCauseLookupTypes = (type: string) => {
  // Donor cards collapse raw PAC and Organization records into an Org/PAC
  // display bucket, but donor_alias_members stores the raw donor_type values.
  if (type === 'Org/PAC') return ['PAC', 'Organization'];
  return CAUSE_ELIGIBLE_DONOR_TYPES.has(type) ? [type] : [];
};

const aliasMatchesType = (alias: any, type: string) => {
  const lookupTypes = getCauseLookupTypes(type);
  if (lookupTypes.length === 0) return false;

  const aliasTypes = new Set<string>();
  if (alias.donor_type) aliasTypes.add(alias.donor_type);
  if (Array.isArray(alias.donor_types)) {
    alias.donor_types.filter(Boolean).forEach((t: string) => aliasTypes.add(t));
  }

  if (aliasTypes.size === 0) return true;
  return lookupTypes.some((lookupType) => aliasTypes.has(lookupType));
};

const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
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

      // Build a quick lookup from normalized name -> original inputs so we
      // can map case-insensitive DB rows back to the exact input casing used
      // by `getDonorCause` callers.
      const inputsByNormName = new Map<string, DonorNameInput[]>();
      for (const i of uniqueInputs) {
        const list = inputsByNormName.get(norm(i.name)) ?? [];
        list.push(i);
        inputsByNormName.set(norm(i.name), list);
      }

      // 1. Apply direct donor-level cause overrides first. These let admins tag
      //    a donor search result without creating a donor alias.
      const directOverrides = (
        await Promise.all(
          chunk(names, 100).map(async (nameBatch) => {
            const { data, error } = await (supabase as any)
              .from('donor_cause_overrides')
              .select('donor_name, donor_type, primary_cause_id, assigned_by, committee_causes!donor_cause_overrides_primary_cause_id_fkey(id, label, description, stance, quiz_topic_id)')
              .in('donor_name', nameBatch)
              .in('donor_type', types);
            if (error) throw error;
            return data ?? [];
          })
        )
      ).flat();

      for (const row of (directOverrides ?? []) as any[]) {
        const c = row.committee_causes;
        if (!c) continue;
        const matches = inputsByNormName.get(norm(row.donor_name)) ?? [];
        for (const input of matches) {
          if (!getCauseLookupTypes(input.type).includes(row.donor_type)) continue;
          result.set(`${norm(input.name)}|${input.type}`, {
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
      }

      // 2. Resolve names -> aliases (and fec_committee_ids + alias-level cause)
      const { data: members, error: mErr } = await (supabase as any)
        .from('donor_alias_members')
        .select('donor_name, donor_type, alias_id, donor_aliases!inner(id, fec_committee_id, fec_committee_ids, is_active, primary_cause_id, cause_assigned_by, cause_ai_confidence)')
        .in('donor_type', types)
        .eq('donor_aliases.is_active', true);
      if (mErr) throw mErr;

      // name|type -> set of committee ids
      const nameToCommittees = new Map<string, string[]>();
      const allCommitteeIds = new Set<string>();
      // name|type -> alias-level cause id (preferred when set)
      const aliasLevelCause = new Map<string, { causeId: string; assignedBy: string; confidence: string | null; fecCommitteeId: string }>();
      const aliasCauseIds = new Set<string>();

      const applyAliasToKey = (key: string, alias: any) => {
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
            confidence: alias.cause_ai_confidence,
            fecCommitteeId: ids[0] || '',
          });
          aliasCauseIds.add(alias.primary_cause_id);
        }
      };

      // Apply each matched member row back to the ORIGINAL input casing so
      // `getDonorCause(map, name, type)` can find it regardless of how the
      // donor name is cased in the DB vs in the UI.
      for (const m of (members ?? []) as any[]) {
        const alias = m.donor_aliases;
        if (!alias?.is_active) continue;
        const matches = inputsByNormName.get(norm(m.donor_name)) ?? [];
        for (const input of matches) {
          const lookupTypes = getCauseLookupTypes(input.type);
          if (lookupTypes.length > 0 && !lookupTypes.includes(m.donor_type)) continue;
          applyAliasToKey(`${norm(input.name)}|${input.type}`, alias);
        }
      }

      // Consolidated donor rows often use donor_aliases.canonical_name as the
      // displayed name, while donor_alias_members stores only the raw imported
      // FEC names. Resolve canonical names directly (case-insensitively) so
      // alias-level causes still appear for rows like "NorPac" / "AIPAC".
      const { data: canonicalAliases, error: canonicalErr } = await (supabase as any)
        .from('donor_aliases')
        .select('id, canonical_name, fec_committee_id, fec_committee_ids, is_active, primary_cause_id, cause_assigned_by, cause_ai_confidence')
        .eq('is_active', true);
      if (canonicalErr) throw canonicalErr;

      for (const alias of (canonicalAliases ?? []) as any[]) {
        const matches = inputsByNormName.get(norm(alias.canonical_name)) ?? [];
        for (const input of matches) {
          if (!aliasMatchesType(alias, input.type)) continue;
          applyAliasToKey(`${norm(input.name)}|${input.type}`, alias);
        }
      }

      // Resolve alias-level cause metadata
      if (aliasCauseIds.size > 0) {
        const { data: causeRows } = await supabase
          .from('committee_causes')
          .select('id, label, description, stance, quiz_topic_id')
          .in('id', Array.from(aliasCauseIds));
        const causeMap = new Map((causeRows ?? []).map((c: any) => [c.id, c]));
        for (const [key, info] of aliasLevelCause.entries()) {
          const c: any = causeMap.get(info.causeId);
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
      const { data: topics, error: tErr } = await supabase
        .from('committee_topics')
        .select('fec_committee_id, primary_cause_id, ai_confidence, assigned_by, admin_overridden, committee_causes!committee_topics_primary_cause_id_fkey(id, label, description, stance, quiz_topic_id)')
        .in('fec_committee_id', Array.from(allCommitteeIds));

      // Fallback if FK name differs: do a manual join
      let causeByCommittee = new Map<string, DonorCauseInfo>();
      if (tErr || !topics) {
        const { data: topicsPlain } = await supabase
          .from('committee_topics')
          .select('fec_committee_id, primary_cause_id, ai_confidence, assigned_by, admin_overridden')
          .in('fec_committee_id', Array.from(allCommitteeIds));
        const causeIds = Array.from(new Set((topicsPlain ?? []).map(t => t.primary_cause_id).filter(Boolean)));
        const { data: causes } = await supabase
          .from('committee_causes')
          .select('id, label, description, stance, quiz_topic_id')
          .in('id', causeIds);
        const causeMap = new Map((causes ?? []).map(c => [c.id, c]));
        for (const t of topicsPlain ?? []) {
          const c = causeMap.get(t.primary_cause_id);
          if (!c) continue;
          causeByCommittee.set(t.fec_committee_id, {
            causeId: c.id,
            label: c.label,
            description: c.description,
            stance: c.stance,
            quizTopicId: c.quiz_topic_id,
            confidence: t.ai_confidence,
            assignedBy: t.assigned_by,
            adminOverridden: t.admin_overridden,
            fecCommitteeId: t.fec_committee_id,
          });
        }
      } else {
        for (const t of topics as any[]) {
          const c = t.committee_causes;
          if (!c) continue;
          causeByCommittee.set(t.fec_committee_id, {
            causeId: c.id,
            label: c.label,
            description: c.description,
            stance: c.stance,
            quizTopicId: c.quiz_topic_id,
            confidence: t.ai_confidence,
            assignedBy: t.assigned_by,
            adminOverridden: t.admin_overridden,
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
