// Tests for the candidate-onboarding dedup funnel — specifically the committee-based
// resolution that collapses a person changing office (e.g. a U.S. House incumbent
// filing for U.S. Senate) onto their existing profile instead of minting a duplicate.
// Root cause + plan: docs/candidate-deduplication-plan.md.
import { expect, test } from 'bun:test';
import { type CandidateInput, resolveAndUpsertCandidate } from './onboard-candidate.ts';

// Minimal chainable fake of the supabase-js query builder — only the calls the
// funnel makes. `.maybeSingle()/.single()` resolve a single row; awaiting the
// builder itself resolves a list; `.insert()` is recorded so we can assert that a
// collapse did NOT create a new row.
function makeFakeSupabase(opts: {
  committeeOwners?: Record<string, string>;
  existingIds?: string[];
  candidateStates?: Record<string, string>;
}) {
  const committeeOwners = opts.committeeOwners ?? {};
  const existingIds = new Set(opts.existingIds ?? []);
  const candidateStates = opts.candidateStates ?? {};
  const inserted: Array<Record<string, unknown>> = [];
  const flagged: Array<Record<string, unknown>> = [];

  function resolve(table: string, filters: Record<string, unknown>, mode: 'one' | 'many') {
    if (table === 'candidate_committees') {
      const owner = committeeOwners[String(filters.fec_committee_id)];
      return { data: owner ? [{ candidate_id: owner }] : [], error: null };
    }
    if (table === 'candidate_fec_ids' || table === 'static_officials') {
      return { data: [], error: null };
    }
    if (table === 'candidates') {
      if ('fec_candidate_id' in filters) return { data: null, error: null }; // step 1 maybeSingle
      if ('person_id' in filters || 'state' in filters) return { data: [], error: null };
      if ('id' in filters) {
        const id = String(filters.id);
        const hit = existingIds.has(id) || id in candidateStates;
        const row = { id, answers_source: 'ai_generated', state: candidateStates[id] ?? null };
        return mode === 'one'
          ? { data: hit ? row : null, error: null }
          : { data: hit ? [row] : [], error: null };
      }
    }
    return { data: mode === 'one' ? null : [], error: null };
  }

  class Q {
    table: string;
    filters: Record<string, unknown> = {};
    constructor(table: string) { this.table = table; }
    select() { return this; }
    eq(k: string, v: unknown) { this.filters[k] = v; return this; }
    in() { return this; }
    order() { return this; }
    limit() { return this; }
    maybeSingle() { return Promise.resolve(resolve(this.table, this.filters, 'one')); }
    single() { return Promise.resolve(resolve(this.table, this.filters, 'one')); }
    insert(row: Record<string, unknown>) { inserted.push(row); return Promise.resolve({ error: null }); }
    upsert(row: Record<string, unknown>) {
      if (this.table === 'candidate_merge_map') flagged.push(row);
      return Promise.resolve({ error: null });
    }
    // deno-lint-ignore no-explicit-any
    then(onF: any, onR: any) { return Promise.resolve(resolve(this.table, this.filters, 'many')).then(onF, onR); }
  }

  const supabase = {
    from(table: string) { return new Q(table); },
    rpc() { return Promise.resolve({ data: null, error: null }); },
  };
  return { supabase, inserted, flagged };
}

const senateCandidacy: CandidateInput = {
  id: 'S6MA00296',
  name: 'MOULTON, SETH',
  party: 'Democrat',
  office: 'U.S. Senate (MA)',
  state: 'MA',
  district: null,
  is_incumbent: false,
  fec_candidate_id: 'S6MA00296',
  source: 'fec-targeted',
};

test('collapses a House→Senate candidacy onto the existing person via shared committee', async () => {
  // The House incumbent (M001196) already owns committee C00547240. Onboarding the
  // Senate candidacy that shares that committee must resolve to M001196, not insert.
  const { supabase, inserted, flagged } = makeFakeSupabase({
    committeeOwners: { C00547240: 'M001196' },
    existingIds: ['M001196'],
    candidateStates: { M001196: 'MA' }, // same state as the Senate candidacy → unambiguous
  });

  const res = await resolveAndUpsertCandidate(supabase, {
    ...senateCandidacy,
    principal_committee_id: 'C00547240',
  });

  expect(res.candidateId).toBe('M001196');
  expect(res.isNew).toBe(false);
  expect(inserted).toHaveLength(0); // no duplicate row created
  expect(flagged).toHaveLength(0); // same-state: no review flag needed
});

test('type E guard: cross-state shared committee is NOT auto-collapsed, but queued for review', async () => {
  // The committee's owner is in MA but the discovered candidacy is TX — could be a
  // clerical filing error, a genuine multi-state candidate, or two different people
  // with a mis-linked committee. The funnel must keep them separate and write a
  // 'proposed' review row to candidate_merge_map instead of silently merging.
  const { supabase, inserted, flagged } = makeFakeSupabase({
    committeeOwners: { C00547240: 'M001196' },
    existingIds: [],
    candidateStates: { M001196: 'MA' },
  });

  const res = await resolveAndUpsertCandidate(supabase, {
    ...senateCandidacy,
    id: 'S6TX99999',
    fec_candidate_id: 'S6TX99999',
    office: 'U.S. Senate (TX)',
    state: 'TX',
    principal_committee_id: 'C00547240',
  });

  expect(res.candidateId).toBe('S6TX99999'); // kept separate
  expect(res.isNew).toBe(true);
  expect(inserted).toHaveLength(1);
  expect(flagged).toHaveLength(1); // review row queued
  expect(flagged[0].canonical_id).toBe('M001196');
  expect(flagged[0].dup_id).toBe('S6TX99999');
  expect(flagged[0].status).toBe('proposed');
});

test('without the committee signal, a cross-office candidacy still creates a new row (documents the gap the fix closes)', async () => {
  // No principal_committee_id and the office class differs (house≠senate), so none of
  // the office-scoped steps match — the pre-fix behavior. Confirms the committee
  // signal is precisely what prevents the duplicate.
  const { supabase, inserted } = makeFakeSupabase({ committeeOwners: { C00547240: 'M001196' }, existingIds: [] });

  const res = await resolveAndUpsertCandidate(supabase, { ...senateCandidacy });

  expect(res.candidateId).toBe('S6MA00296');
  expect(res.isNew).toBe(true);
  expect(inserted).toHaveLength(1);
});

test('does not collapse onto itself when the committee already belongs to this id', async () => {
  const { supabase, inserted } = makeFakeSupabase({
    committeeOwners: { C00547240: 'S6MA00296' },
    existingIds: ['S6MA00296'],
  });

  const res = await resolveAndUpsertCandidate(supabase, {
    ...senateCandidacy,
    principal_committee_id: 'C00547240',
  });

  expect(res.candidateId).toBe('S6MA00296');
  expect(res.isNew).toBe(false);
  expect(inserted).toHaveLength(0);
});
