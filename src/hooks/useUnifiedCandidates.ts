import { useMemo } from 'react';
import { Candidate, TransitionStatus } from '@/types';

type CandidateLevel = NonNullable<Candidate['level']>; // 'federal' | 'state' | 'local'
import { CoverageTier, ConfidenceLevel } from '@/lib/scoreFormat';
import { useCandidates } from './useCandidates';
import { useAllPoliticians } from './useAllPoliticians';
import { useRepresentatives, Representative } from './useRepresentatives';
import { useCivicOfficials, CivicOfficial } from './useCivicOfficials';
import { useCandidateScoreMap } from './useCandidateScoreMap';
import { useUserQuizQuestionIds, useRepresentativeAnswersAndScores } from './useRepresentativeScores';
import { resolveCandidateImageUrl } from '@/lib/candidateImages';

/**
 * SINGLE SOURCE OF TRUTH for candidate cards across the app.
 *
 * Combines DB candidates, Congress.gov members, civic officials (federal/state/local
 * executives + state legislature + local), per-user AI match scores, and the saved
 * candidate-score map into one set of fully-populated `Candidate` objects.
 *
 * Field-resolution priority (same on every page):
 *   overallScore: scoreMap → DB.overall_score → API.overall_score → 0
 *   imageUrl:     DB.image_url → API.image_url
 *   coverageTier: DB → API → 'tier_3'
 *   confidence:   DB → API → 'medium'
 *   party/office/state/district/name: DB → API
 *   isIncumbent:  DB → API → true
 *   topicScores:  DB → []
 *   transition fields: civic API only (no DB equivalent)
 *   level:        civic API → derived from office
 *   matchScore / hasAIAnswers / answerCount: from useRepresentativeAnswersAndScores
 *
 * Dedup uses a normalized `name::office` key plus id collision guards. The
 * civic-vs-Congress collision rule (skip a civic row whose name matches a
 * Congress member) lives here so every page enforces it.
 */

type DbCandidate = ReturnType<typeof useCandidates>['data'] extends (infer U)[] | undefined ? U : never;

const normName = (name: string) =>
  name.toLowerCase().replace(/\b[a-z]\.\s*/g, '').replace(/\s+/g, ' ').trim();
const normOffice = (office: string) =>
  office.toLowerCase().replace(/\s+of\s+the\s+united\s+states/g, '').replace(/\s+/g, ' ').trim();
const nameKey = (name: string, office: string) => `${normName(name)}::${normOffice(office)}`;

const deriveLevelFromOffice = (office: string): CandidateLevel => {
  const o = office.toLowerCase();
  if (/president|vice president|senator|representative|congress/.test(o)) return 'federal';
  if (/governor|lieutenant|attorney general|secretary of state|treasurer|comptroller|state senator|state rep|assembly|delegate/.test(o)) return 'state';
  if (/mayor|council|alderman|selectman|sheriff|district attorney|school board|county/.test(o)) return 'local';
  return 'federal';
};

const civicLevelToGovLevel = (lvl?: string): CandidateLevel => {
  if (!lvl) return 'federal';
  if (lvl.includes('state')) return 'state';
  if (lvl === 'local') return 'local';
  return 'federal';
};

interface UnifiedSources {
  db?: DbCandidate;
  rep?: Representative;
  civic?: CivicOfficial;
}

const buildCandidate = (
  id: string,
  sources: UnifiedSources,
  scoreMap: Map<string, number> | undefined,
  matchInfo?: { score: number; answerCount: number; generated: boolean },
): Candidate => {
  const { db, rep, civic } = sources;
  const api = rep ?? civic;

  const name = db?.name ?? api?.name ?? 'Unknown';
  // The civic feed is the live authority on whether someone still holds office.
  // When it explicitly marks a federal executive as "Former …" (President/VP
  // who left office), trust that label — and the not-incumbent flag — over a
  // stale DB row that may still read "President" / incumbent from their term.
  const civicMarksFormer = !!civic?.office && /^former\b/i.test(civic.office);
  const office = (civicMarksFormer ? civic!.office : db?.office) ?? api?.office ?? '';
  const party = (db?.party ?? api?.party ?? 'Other') as Candidate['party'];
  const state = db?.state ?? api?.state ?? '';
  const district = db?.district ?? api?.district ?? undefined;

  const imageUrl = resolveCandidateImageUrl({
    candidateUrl: db?.image_url,
    apiUrl: api?.image_url,
    candidateId: id,
    personId: (db as { person_id?: string | null } | undefined)?.person_id,
    bioguideId: (api as { bioguide_id?: string | null } | undefined)?.bioguide_id,
  });

  const stored = scoreMap?.get(id);
  const apiExtra = api as { overall_score?: number; coverage_tier?: string; confidence?: string } | undefined;
  const overallScore =
    stored ?? db?.overall_score ?? apiExtra?.overall_score ?? 0;

  const coverageTier = (db?.coverage_tier ?? apiExtra?.coverage_tier ?? 'tier_3') as CoverageTier;
  const confidence = (db?.confidence ?? apiExtra?.confidence ?? 'medium') as ConfidenceLevel;

  const isIncumbent = civicMarksFormer ? false : (db?.is_incumbent ?? api?.is_incumbent ?? true);

  let level: CandidateLevel = 'federal';
  if (civic) level = civicLevelToGovLevel(civic.level);
  else if (rep) level = 'federal';
  else level = deriveLevelFromOffice(office);

  return {
    id,
    name,
    party,
    office,
    state,
    district: district || undefined,
    imageUrl: imageUrl || undefined,
    overallScore,
    topicScores:
      ((db?.topicScores || []) as Array<{ topic_id: string; topics?: { name?: string } | null; score: number }>).map((ts) => ({
        topicId: ts.topic_id,
        topicName: ts.topics?.name || ts.topic_id,
        score: ts.score,
      })) ?? [],
    lastUpdated: db?.last_updated ? new Date(db.last_updated) : new Date(),
    coverageTier,
    confidence,
    isIncumbent,
    scoreVersion: db?.score_version || 'v1.0',
    transitionStatus: civic?.transition_status as TransitionStatus | undefined,
    newOffice: civic?.new_office,
    inaugurationDate: civic?.inauguration_date,
    level,
    matchScore: matchInfo?.score,
    hasAIAnswers: matchInfo?.generated,
    answerCount: matchInfo?.answerCount,
  };
};

export interface UnifiedCandidatesResult {
  byId: Map<string, Candidate>;
  byNameKey: Map<string, Candidate>;
  all: Candidate[];
  myReps: Candidate[];
  congress: Candidate[];
  federalExec: Candidate[];
  /** Recent former Presidents & VPs — surfaced in the directory, not "my reps". */
  formerExec: Candidate[];
  stateExec: Candidate[];
  stateLeg: Candidate[];
  local: Candidate[];
  dbOnly: Candidate[];
  isLoading: boolean;
  isAddressLoading: boolean;
  dbLoading: boolean;
  allLoading: boolean;
  repsLoading: boolean;
  civicLoading: boolean;
}

interface Options {
  address?: string | null;
  /** Whether to load all Congress members (Candidates page). Defaults to false. */
  includeAllCongress?: boolean;
}

export const useUnifiedCandidates = ({
  address,
  includeAllCongress = false,
}: Options = {}): UnifiedCandidatesResult => {
  const { data: dbCandidates = [], isLoading: dbLoading } = useCandidates();
  const { data: allPoliticians = [], isLoading: allLoading } = useAllPoliticians({
    enabled: includeAllCongress,
  });
  const { data: repsData, isLoading: repsLoading } = useRepresentatives(address);
  const { data: civicData, isLoading: civicLoading } = useCivicOfficials(address);

  const userReps = repsData?.representatives ?? [];
  const federalExecRaw = civicData?.federalExecutive ?? [];
  const formerExecRaw = civicData?.formerFederalExecutive ?? [];
  const stateExecRaw = civicData?.stateExecutive ?? [];
  const stateLegRaw = civicData?.stateLegislative ?? [];
  const localRaw = civicData?.local ?? [];

  // Combined civic list, memoized so downstream useMemos don't churn
  const civicAll = useMemo(
    () => [...federalExecRaw, ...formerExecRaw, ...stateExecRaw, ...stateLegRaw, ...localRaw],
    [federalExecRaw, formerExecRaw, stateExecRaw, stateLegRaw, localRaw],
  );

  // Build O(1) lookup maps once per data change
  const lookups = useMemo(() => {
    const dbById = new Map<string, DbCandidate>();
    for (const c of dbCandidates) dbById.set(c.id, c);
    const allById = new Map<string, Representative>();
    for (const c of allPoliticians) allById.set(c.bioguide_id || c.id, c);
    const repsById = new Map<string, Representative>();
    for (const c of userReps) repsById.set(c.bioguide_id || c.id, c);
    const civicById = new Map<string, CivicOfficial>();
    for (const c of civicAll) civicById.set(c.id, c);
    return { dbById, allById, repsById, civicById };
  }, [dbCandidates, allPoliticians, userReps, civicAll]);

  // Collect all ids we need to look up scores for.
  const allIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of dbCandidates) set.add(c.id);
    for (const c of allPoliticians) set.add(c.bioguide_id || c.id);
    for (const c of userReps) set.add(c.bioguide_id || c.id);
    for (const c of civicAll) set.add(c.id);
    return Array.from(set);
  }, [dbCandidates, allPoliticians, userReps, civicAll]);

  const { data: scoreMap } = useCandidateScoreMap(allIds);

  // AI match scores (per-user) — pulled for every candidate we know about.
  const { data: userQuizAnswers = [] } = useUserQuizQuestionIds();
  const repInfoList = useMemo(
    () =>
      allIds
        .map((id) => {
          const src = (lookups.allById.get(id) ||
            lookups.repsById.get(id) ||
            lookups.civicById.get(id) ||
            lookups.dbById.get(id)) as
            | { name?: string; party?: string; office?: string; state?: string }
            | undefined;
          return src
            ? {
                id,
                name: src.name,
                party: src.party,
                office: src.office,
                state: src.state,
              }
            : null;
        })
        .filter(Boolean) as { id: string; name: string; party: string; office: string; state: string }[],
    [allIds, lookups],
  );
  const { data: scoresData } = useRepresentativeAnswersAndScores(repInfoList, userQuizAnswers);
  const matchByCandidate = scoresData?.scores ?? {};

  return useMemo<UnifiedCandidatesResult>(() => {
    // Build DB lookup maps
    const dbById = new Map<string, DbCandidate>();
    const dbByName = new Map<string, DbCandidate>();
    for (const c of dbCandidates) {
      dbById.set(c.id, c);
      dbByName.set(nameKey(c.name, c.office), c);
    }

    const findDb = (id: string, name: string, office: string): DbCandidate | undefined =>
      dbById.get(id) ?? dbByName.get(nameKey(name, office));

    const make = (id: string, sources: UnifiedSources): Candidate => {
      const m = matchByCandidate[id];
      return buildCandidate(
        id,
        sources,
        scoreMap,
        m && m.answerCount > 0
          ? { score: m.score, answerCount: m.answerCount, generated: m.generated }
          : undefined,
      );
    };

    // Build group buckets ----------------------------------------------------
    const congressList: Candidate[] = [];
    const congressNameKeys = new Set<string>();
    const congressById = new Map<string, Candidate>();

    const addCongress = (rep: Representative) => {
      const id = rep.bioguide_id || rep.id;
      if (congressById.has(id)) return;
      const db = findDb(id, rep.name, rep.office);
      const c = make(id, { db, rep });
      congressById.set(id, c);
      congressNameKeys.add(nameKey(c.name, c.office));
      congressList.push(c);
    };

    // myReps loaded first so they're always present in `congress` list too
    for (const r of userReps) addCongress(r);
    for (const r of allPoliticians) addCongress(r);

    const myReps: Candidate[] = userReps.map((r) => congressById.get(r.bioguide_id || r.id)!).filter(Boolean);

    // Civic groups: drop civic rows whose name matches a Congress member
    const buildCivicGroup = (raw: CivicOfficial[]): Candidate[] => {
      const out: Candidate[] = [];
      const seen = new Set<string>();
      for (const o of raw) {
        const k = nameKey(o.name, o.office);
        if (congressNameKeys.has(k)) continue;
        if (seen.has(o.id) || seen.has(k)) continue;
        seen.add(o.id);
        seen.add(k);
        const db = findDb(o.id, o.name, o.office);
        out.push(make(o.id, { db, civic: o }));
      }
      return out;
    };

    const federalExec = buildCivicGroup(federalExecRaw);
    const formerExec = buildCivicGroup(formerExecRaw);
    const stateExec = buildCivicGroup(stateExecRaw);
    const stateLeg = buildCivicGroup(stateLegRaw);
    const local = buildCivicGroup(localRaw);

    // President & Vice President are *national* offices — they don't depend on
    // the user's address. The only source that classifies them as executives is
    // the civic feed, which requires an address and whose upstream fetch can be
    // slow (tens of seconds) or fail. When that feed is empty, the Executive tab
    // collapses to 0 even though the sitting President/VP are already loaded from
    // the `candidates` table — they'd otherwise be miscategorized into `dbOnly`,
    // which the Executive tab never reads. Promote the incumbent President/VP DB
    // rows into `federalExec` so executives appear instantly and unconditionally.
    // Only incumbents qualify: non-incumbent "President of the United States"
    // rows are challengers, not executives, and recent former holders are left to
    // the civic feed (which alone can date-scope them via term history).
    const isFederalExecOffice = (office: string) =>
      /^(president|vice president)$/.test(normOffice(office));
    const execNameKeys = new Set(federalExec.map((c) => nameKey(c.name, c.office)));
    for (const c of dbCandidates) {
      if (!isFederalExecOffice(c.office)) continue;
      if (!(c.is_incumbent ?? true)) continue;
      const k = nameKey(c.name, c.office);
      if (execNameKeys.has(k) || congressNameKeys.has(k)) continue;
      execNameKeys.add(k);
      federalExec.push(make(c.id, { db: c }));
    }

    // DB-only candidates: in DB but not matched by id or name to any above
    const knownIds = new Set<string>();
    const knownNames = new Set<string>();
    for (const c of [...congressList, ...federalExec, ...formerExec, ...stateExec, ...stateLeg, ...local]) {
      knownIds.add(c.id);
      knownNames.add(nameKey(c.name, c.office));
    }
    const dbOnly: Candidate[] = [];
    for (const c of dbCandidates) {
      if (knownIds.has(c.id)) continue;
      if (knownNames.has(nameKey(c.name, c.office))) continue;
      dbOnly.push(make(c.id, { db: c }));
    }

    // Combined `all` — dedupe by id, name+office, AND db person_id when present
    const all: Candidate[] = [];
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const seenPersonIds = new Set<string>();
    const personIdOf = (c: Candidate): string | undefined => {
      const db = dbById.get(c.id) ?? dbByName.get(nameKey(c.name, c.office));
      return (db as { person_id?: string } | undefined)?.person_id ?? undefined;
    };
    const push = (c: Candidate) => {
      if (seenIds.has(c.id)) return;
      const k = nameKey(c.name, c.office);
      if (seenNames.has(k)) return;
      const pid = personIdOf(c);
      if (pid && seenPersonIds.has(pid)) return;
      seenIds.add(c.id);
      seenNames.add(k);
      if (pid) seenPersonIds.add(pid);
      all.push(c);
    };
    for (const c of dbOnly) push(c);
    for (const c of congressList) push(c);
    for (const c of federalExec) push(c);
    for (const c of formerExec) push(c);
    for (const c of stateExec) push(c);
    for (const c of stateLeg) push(c);
    for (const c of local) push(c);

    const byId = new Map<string, Candidate>();
    const byNameKey = new Map<string, Candidate>();
    for (const c of all) {
      byId.set(c.id, c);
      byNameKey.set(nameKey(c.name, c.office), c);
    }

    return {
      byId,
      byNameKey,
      all,
      myReps,
      congress: congressList,
      federalExec,
      formerExec,
      stateExec,
      stateLeg,
      local,
      dbOnly,
      isLoading: dbLoading || allLoading || repsLoading || civicLoading,
      isAddressLoading: repsLoading || civicLoading,
      dbLoading,
      allLoading,
      repsLoading,
      civicLoading,
    };
  }, [
    dbCandidates,
    allPoliticians,
    userReps,
    federalExecRaw,
    formerExecRaw,
    stateExecRaw,
    stateLegRaw,
    localRaw,
    scoreMap,
    matchByCandidate,
    dbLoading,
    allLoading,
    repsLoading,
    civicLoading,
  ]);
};

export const unifiedCandidateNameKey = nameKey;
