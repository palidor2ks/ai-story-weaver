## Upcoming Elections on Profile + auto-onboard new candidates

### Data sources (free only)

| Layer | Source | Notes |
|---|---|---|
| Federal candidates (Pres / Senate / House) | **FEC API** `/candidates/search` filtered by `cycle`, `state`, `district`, `office`, `candidate_status='C'`. `incumbent_challenge='I'` flags incumbents. | Complete for filed federal candidates. |
| State (Gov, AG, state leg) | **Open States v3** — current officeholders for incumbent flag; `/elections` for challenger lists where supported. | Challenger coverage is patchy by state. |
| Election dates + sample ballot (all levels, including local) | **Google Civic Information API** — `elections.electionQuery` + `elections.voterInfoQuery(address, electionId)`. | Best free source for *what's on this user's ballot*. Local data only populated in weeks before an active election. |
| Local-only filler | None reliable & free | UI shows "Local race coverage is limited" with a "Submit a missing race" placeholder CTA. |

### Auto-onboarding new candidates (the key change)

Every candidate returned by the sources above is upserted into the existing `candidates` table so they automatically inherit the full profile/quiz/comparison pipeline. No new "election candidate" type — they ARE candidates.

Candidate ID convention (matches existing patterns):
- Federal: use FEC ID (e.g. `H4NJ07123`) when no `bioguide_id` exists; if they win, an admin can later merge to bioguide.
- State (Open States): `openstates_<id>` (already used by `fetch-civic-officials`).
- Google Civic / unmatched: `civic_<sha1(name|office|state|district)>` deterministic hash so reruns idempotently upsert.

Upsert payload into `candidates`:
```text
id, name, party, office, state, district,
image_url       (from FEC photo / openstates / null),
fec_candidate_id,
is_incumbent    (true if matched against existing incumbent in candidates/static_officials/civic response, OR FEC flag = 'I'),
coverage_tier   = 'tier_3',
confidence      = 'low',
overall_score   = 0,
answers_source  = 'pending_research',
last_answers_sync = null
```

After upsert, for each newly-inserted candidate the `fetch-upcoming-elections` edge function calls the existing `get-candidate-answers` function with `useBackground: true` (same pattern `fetch-civic-officials` already uses for representatives). That kicks the existing Perplexity deep-research pipeline, which populates `candidate_answers`, `candidate_topic_scores`, `overall_score`, and bumps coverage tier — exactly the same flow as for sitting reps.

Throttle: cap at **5 new candidates researched per request** (same `MAX_RESEARCH_PER_RUN` pattern), defer the rest to the next request via the existing background-batch infrastructure. Avoids 546 WORKER_LIMIT.

### New tables

```text
elections
  id (uuid pk)
  election_date (date) NOT NULL
  election_type (text)   -- 'general' | 'primary' | 'special' | 'runoff' | 'municipal'
  level (text)           -- 'federal' | 'state' | 'local'
  state (text)           -- 'NJ', or null
  jurisdiction (text)    -- 'NJ-7', 'Piscataway, NJ', null
  name (text)            -- '2026 NJ General'
  source (text)          -- 'fec' | 'google_civic' | 'manual'
  source_ref (text)      -- electionId / cycle key
  created_at, updated_at
  unique (source, source_ref, election_date, jurisdiction)

election_candidates
  id (uuid pk)
  election_id (uuid fk -> elections)
  candidate_id (text)   -- FK-style ref to candidates.id (always populated after auto-onboard)
  office (text)
  status (text)         -- 'declared' | 'filed' | 'withdrawn' | 'won_primary' | 'lost_primary'
  is_incumbent (boolean)
  source, source_ref
  created_at, updated_at
  unique (election_id, candidate_id)
```

RLS: public SELECT on both; INSERT/UPDATE/DELETE restricted to admins + service role (matches existing pattern on `candidates`).

### New edge functions

**`fetch-upcoming-elections`** (per-user, public):
1. Input `{ address, lat, lng, state, district }` — same shape as `fetch-civic-officials`.
2. Read cached rows from `elections` + `election_candidates` for state/district where `election_date >= today`. Return immediately if `< 24h` old.
3. Run FEC + Open States + Google Civic queries in parallel.
4. For each returned candidate: deterministic `id` → upsert into `candidates` → upsert into `election_candidates`.
5. For up to 5 newly-created candidates per call, fire `get-candidate-answers` with `useBackground: true` via `EdgeRuntime.waitUntil`.
6. Return `{ federal: [...], state: [...], local: [...] }` joined with current scores from `candidates` + `candidate_overrides` (so users see "Researching…" placeholder until pipeline completes).

**`sync-upcoming-elections`** (admin / cron, service role):
- Walks all 50 states once per day to pre-warm FEC + Open States data so user-driven calls are cache hits.

### Frontend

`src/pages/UserProfile.tsx` — new card between "Representatives" and "Political Analysis":

```text
🗳  Upcoming Elections on Your Ballot

Tue Nov 4, 2025 — NJ General Election
  Governor of New Jersey
    • Mikie Sherrill (D) — Incumbent ✓     [score badge → /candidate/...]
    • Jack Ciattarelli (R)                  [Researching…]
  NJ Assembly District 17
    ...
Tue Jun 2, 2026 — NJ Primary
  U.S. House NJ-7
    • Tom Kean Jr. (R) — Incumbent ✓
    • Sue Altman (D)                        [Researching…]

Local race coverage is limited — [Submit a missing race]
```

New files:
- `src/components/profile/UpcomingElectionsCard.tsx`
- `src/components/profile/ElectionGroup.tsx`
- `src/components/profile/UpcomingCandidateRow.tsx` — name, party, "Incumbent" badge when `is_incumbent`, score badge when populated, "Researching…" placeholder when `answers_source='pending_research'` and `overall_score=0`. Clicking the row navigates to `/candidate/:id` (works for every candidate since they all have a `candidates` row now).
- `src/hooks/useUpcomingElections.ts` — wraps `supabase.functions.invoke('fetch-upcoming-elections', ...)` with React Query, 1h `staleTime`, 24h `gcTime`. Auto-refetches every 60s while any candidate is still `pending_research` so badges fill in live.

Incumbent flag merging: union of (a) source flag, (b) candidate's name matching anyone in the user's already-loaded `civicData` / `federalReps` (cheap client-side check).

### Comparison flow

Because every candidate now lives in `candidates`, the existing `RepresentativeComparisonCard` / `useCandidateScoreMap` / `/candidate/:id` profile page work without any change. Newly-onboarded candidates start at `tier_3` with no answers; once the background research finishes their `overall_score`, topic scores, and answer evidence appear, and they become directly comparable to the user's quiz answers — identical UX to incumbents.

### Out of scope

- Paid local-candidate feed (BallotReady / Ballotpedia).
- Manual race submission form (button is a placeholder for now).
- Merging FEC IDs into bioguide IDs after a winner is sworn in (admin-only follow-up).

### Migration & deploy order

1. Migration: create `elections` + `election_candidates` with RLS.
2. Edge function: `fetch-upcoming-elections` (calls existing `get-candidate-answers`).
3. Edge function: `sync-upcoming-elections`.
4. Frontend: hook + card + wire into `UserProfile.tsx`.
5. (Follow-up) Schedule daily `sync-upcoming-elections` via pg_cron.
