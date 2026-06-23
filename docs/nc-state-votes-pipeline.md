# NC General Assembly — Roll-Call Votes Pipeline (design)

> Beachhead **Task 2** ([`strategy-nc-beachhead.md`](./strategy-nc-beachhead.md)) — the votes half.
> **Source probe COMPLETE 2026-06-22 → GO.** The roster is already ingested; this doc designs the
> votes drain + member linkage. Feeds [`poliscore-methodology.md`](./poliscore-methodology.md)
> (votes are the score's substrate) and unblocks the parked NC finance build
> ([`nc-campaign-finance-pipeline.md`](./nc-campaign-finance-pipeline.md), roster-driven discover).

## Status

- **Roster — DONE.** 120 State Representatives (districts 1–120) + 49 State Senators + 2
  unclassified `State Legislator` rows, ingested by `discover-state-legislators` (OpenStates v3
  `/people`, weekly, visibility-driven). Keyed `openstates_${ocd-person-id}` (slashes → `_`).
  *(The strategy doc's "NC state legislature = 0 rows" is stale — this landed 2026-06-18.)*
- **Votes — designed, NOT built.** The spike gate is cleared; **Wisconsin fallback NOT triggered.**

## Probe findings (live OpenStates v3, 2026-06-22) — the GO

Ran via a temporary `nc-leg-vote-probe` edge function (used the existing `OPEN_STATES_API_KEY`;
since neutralized — see [Cleanup](#cleanup--deferred)).

| Question | Finding |
|---|---|
| Are NC roll-call votes machine-readable? | **Yes.** Current session = **`2025`**; **19 of 20** recently-actioned bills carry vote events. NC records votes prolifically. |
| Vote shape | VoteEvent with `motion_text` (e.g. *Second Reading*, *Third Reading*, *Motion to Concur*), `result` (`pass`), `counts[]`, and a per-person `votes[]` array. Real example: SB 889 3rd Reading **69–43**, 118 individual records. |
| Option vocabulary | Clean: `yes` / `no` / `absent` / `abstain` (+ `not voting`, `excused` in `counts`). |
| **Stable person id on each vote?** | **NO — the blocker.** **0 of 1,072** sampled per-person records had a `voter_id`. OpenStates gives **surname only** (`"Cohn"`, `"G. Pierce"`, `"Pittman"`). → Linkage must be **name-based**, not an id join. |
| Volume | 66,285 NC bills all-time; the drain filters to the **current session** (size it in build step 1). |

## Member linkage — the name-match (tractable)

Since votes lack `voter_id`, each surname must resolve to a roster `candidate_id`. Measured against
the live 171-row NC roster:

- **158 / 171 (92%) surnames are unique within their chamber** → direct match.
- **6 colliding surname groups (13 members), all in the House:** BROWN×3, HALL×2, SMITH×3,
  JONES×3, PIERCE×2, JACKSON×4.
- **Chamber + first initial resolves all but ONE pair.** OpenStates supplies the disambiguating
  initial exactly when needed — the sampled `"G. Pierce"` correctly picks Garland over Rodney.
- **The lone residual:** *Carson Smith* vs *Charles Smith* — both House, both initial "C". Needs a
  2-char prefix (`Car` vs `Cha`) or district tiebreak. **One hand-handled pair out of 171.**

**Matcher rule:** normalize → strip suffixes (JR/SR/II–IV) → take surname → scope by the **vote
event's chamber** (`organization`) → match unique surname; on collision use the leading initial(s);
fall back to district. Emit an **unmatched-voter report** every run so silent drops are visible
(a dropped legislator = a hole in their score). Confidence: ~99.4% automatic.

> **Roster hygiene (fix before/with the build):** Senate shows **49 of 50** seats, and there are
> **2 unclassified `State Legislator` rows** — one is *Jeff Jackson*, who is **not** a sitting NC
> legislator (he's the Attorney General; an OpenStates artifact). Reconcile to exactly 120 + 50.

## Source contract (OpenStates v3 — reuse `discover-state-legislators`'s client)

- `GET https://v3.openstates.org/bills?jurisdiction=North Carolina&session=2025&sort=latest_action_desc&per_page=20&page=N&include=votes`
- Header `X-API-KEY: $OPEN_STATES_API_KEY`. **Free tier: 10 req/min** → 7 s sleep between pages
  (same as the roster sweep). Pagination via `pagination.max_page` / `total_items`.
- `include=votes` nests every VoteEvent on each bill (votes are **not** a standalone endpoint).
- Capture per VoteEvent: `id`, `organization` (chamber — load-bearing for the matcher),
  `motion_text`, `result`, `start_date`, `counts[]`, `votes[]` (`option`, `voter_name`).

## Proposed schema (`nc_leg_*`, isolated raw landing — mirrors `tx_cf_*` / `fl_*`)

```sql
-- Bills in scope (current + future NC sessions).
create table public.nc_leg_bills (
  bill_id          text primary key,        -- 'nc-2025-SB889' (namespaced: session + identifier)
  os_bill_id       text unique,             -- OpenStates ocd-bill id
  session          text not null,           -- '2025'
  identifier       text not null,           -- 'SB 889'
  chamber_origin   text,                    -- 'upper' | 'lower'
  title            text,
  classification   text[],
  latest_action_at timestamptz,
  topic            text,                    -- hand/auto-assigned for scoring (see poliscore methodology)
  raw              jsonb,
  synced_at        timestamptz not null default now()
);

-- One row per roll call (VoteEvent).
create table public.nc_leg_vote_events (
  vote_event_id    text primary key,        -- OpenStates VoteEvent id (idempotent key)
  bill_id          text not null references public.nc_leg_bills(bill_id),
  chamber          text,                    -- from VoteEvent.organization
  motion_text      text,                    -- 'Third Reading' (final passage in NC)
  result           text,                    -- 'pass' | 'fail'
  is_final_passage boolean,                 -- derived: the determinative reading per bill/chamber
  start_date       date,
  counts           jsonb,                   -- [{option,value}]
  raw              jsonb,
  synced_at        timestamptz not null default now()
);

-- Per-legislator vote, with the resolved roster linkage.
create table public.nc_leg_vote_records (
  vote_event_id    text not null references public.nc_leg_vote_events(vote_event_id),
  voter_name_raw   text not null,           -- 'G. Pierce' (as published)
  candidate_id     text,                    -- matched roster id (null = unmatched → report it)
  match_method     text,                    -- 'surname' | 'surname+initial' | 'district' | 'manual' | 'unmatched'
  option           text,                    -- 'yes' | 'no' | 'absent' | 'abstain' | 'not voting' | 'excused'
  primary key (vote_event_id, voter_name_raw)
);

create table public.nc_leg_sync_runs ( /* started/finished, mode, session, pages, upserts, unmatched_count, error */ );
```

**RLS:** `nc_leg_bills` / `nc_leg_vote_events` / `nc_leg_vote_records` → public `select` (read-only
reference data, service-role writes). `nc_leg_sync_runs` → internal (no public policy). *(Guardrail:
RLS on every table.)*

## Drain + cron

- **One edge function** `sync-nc-legislator-votes` (modes `discover` | `drain` | `full`), shared-secret
  / `requireCronAuth` like the existing syncs. Background sweep (`EdgeRuntime.waitUntil`), idempotent
  upsert keyed on `vote_event_id`, resumable via `nc_leg_sync_runs` cursor (page + session).
- **Determinative-vote rule** (reuse the PoliScore key-vote learning): a bill gets multiple readings;
  score the **final passage** (NC: **Third Reading**, or concurrence), not procedural readings —
  mark it `is_final_passage`. *Never aggregate by bill across readings* (the federal HR-aggregation
  bug).
- **Cron:** weekly during session, aligned with the roster sweep (`discover_state_legislators_cron`).

## Scoring integration — the one decision to confirm before building

Finance stays isolated forever, but **votes are meant to feed the score**, so they need a path into
the scoring layer. Two options:

- **(A) Bridge into the shared `candidate_votes` + `bills` tables** (recommended) — after matching,
  upsert state rows into the same tables federal scoring already uses (`candidate_id` = roster id,
  `bill_id` = namespaced NC id, `position` = Yea/Nay), tagged by a `jurisdiction`/`source`
  discriminator. **Upside:** state legislators flow into the existing Voting-Record UI + PoliScore
  for ~free (makes Task 3 cheap). **Cost:** add/confirm a jurisdiction column; ensure the federal
  sync functions scope to federal so they never clobber state rows.
- **(B) Keep `nc_leg_*` fully isolated** and union into scoring via a view/RPC. **Upside:** zero risk
  to the federal pipeline. **Cost:** more glue; a second code path to maintain.

**Recommendation: raw-land in `nc_leg_*` (decided — matches repo pattern), then bridge matched
final-passage rows into `candidate_votes`/`bills` (Option A).** This is a data-model change to a
shared table, so it wants an **architect / `migration-safety-reviewer` sign-off** before the
migration lands (guardrail: deliberate schema changes, don't break federal).

## Build sequence

1. **Size the 2025 session** (one session-filtered `/bills` count) → confirm drain cost.
2. Roster hygiene: reconcile to 120 House + 50 Senate; classify the 2 stragglers.
3. Migration: `nc_leg_*` tables + RLS + indexes.
4. `sync-nc-legislator-votes` edge fn (discover/drain/full) + the name-matcher + unmatched report.
5. Confirm the **scoring-integration decision** (A vs B) → bridge migration + transform.
6. Cron (weekly, in-session).
7. Gate: `data-accuracy-verifier` spot-checks a few members' votes vs the NCGA site / OpenStates;
   `etl-pipeline-reviewer` on idempotency/resume; then surface in UI (Task 3).

## Cleanup / deferred

- **Delete the `nc-leg-vote-probe` edge function** from the dashboard (now an inert 410 stub; no MCP
  delete tool). Joins the existing `tx-cf-probe` / `nc-cf-probe` deletion list.
- Roster hygiene (above) — also good for NC finance discover.
- Drop the `http` extension on `ornnzinjrcyigazecctf` once recon is fully done (live syncs use Deno
  `fetch`).
