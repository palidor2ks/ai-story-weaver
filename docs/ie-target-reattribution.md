# Independent-expenditure target reattribution

## The problem

FEC Schedule E filings are coded by the filer, and the coded target candidate id
is frequently wrong or missing. More importantly, the FEC reuses a single
candidate/committee id across different people and elections. The clearest case:
the "Biden for President" id **`P80000722`** carried over to the 2024
Biden → Harris ticket after Biden withdrew (2024-07-21). As a result, the bulk of
pro-Harris independent-expenditure spending in 2024 is coded to `P80000722` and,
without correction, attributes to a candidate record labeled "Joseph R. Biden Jr."

Because the app aggregates outside spending by `candidate_id`
(`useCandidateIE`, `candidate_independent_expenditure_totals`) and groups
committee recipients by `candidate_id` first (`useCommitteeIE`), fixing the
attribution at the row level fixes every surface at once.

## How corrections work: `ie_target_overrides`

Rather than remap a shared FEC id globally (which would corrupt the legitimate
owner's data — `P80000722` is genuinely Biden's elsewhere), corrections are
narrowly scoped rows in `public.ie_target_overrides`:

| Column | Meaning |
| --- | --- |
| `spending_committee_fec_id` | match a specific committee (NULL = any) |
| `match_cycle` | match a cycle (NULL = any) |
| `match_target_fec_candidate_id` | match the wrong/coded FEC id (NULL = any) |
| `match_target_candidate_name` | exact filer-name match (NULL = any) |
| `match_name_pattern` | case-insensitive POSIX regex (`~*`) on the filer name |
| `corrected_candidate_id` | canonical candidate to attribute to (required) |
| `corrected_target_fec_candidate_id` | FEC id to display (optional) |
| `corrected_target_candidate_name` | display name to normalize to (optional) |

All `match_*` conditions are ANDed; a NULL condition is a wildcard. Applied in
two places, kept in sync:

1. **Import** — `supabase/functions/import-independent-expenditures` consults the
   overrides for every row, so corrections survive re-syncs and future
   mis-codes are caught automatically.
2. **Backfill** — each override migration re-applies the same logic to existing
   rows (idempotent; guarded to no-op where the IE table is absent).

The original FEC coding is always preserved in `independent_expenditures.raw_payload`.

### Safety rule

Always pair `match_name_pattern` with a specific `match_target_fec_candidate_id`.
The pattern then only ranges over filings already coded to that one id, so even a
loose pattern (e.g. `kamal|kamel`) cannot match an unrelated person.

## Corrections applied so far

| Migration | Rule | Effect |
| --- | --- | --- |
| `20260607120000` | committee `C00606962`, 2024, name `HARRIS, KAMALA` → Harris | the original Working Families Party PAC fix |
| `20260607130000` | any committee, `P80000722`, name `~ Harris` → Harris (`P00009423`) | ~2,283 rows / ~$283M |
| `20260607130000` | any committee, `P80001571` (Trump), name `~ Harris/Walz` → Harris | 1 row / ~$29K |

Net effect of `20260607130000`: Harris's outside spending ~$928M → ~$1.21B;
Biden's ~$332M → ~$49.5M (his genuine 2024 primary + 2020 spending). Verified
that no `BIDEN`-named filing matches the Harris pattern.

## Known deferred items

The small cross-person mis-codes are now handled (migrations `20260607140000`
and `20260607150000`):

- `DESANTIS` coded to Haley's `P40010977` (~$122K) → DeSantis
- `KAINE` coded to Casey's `S6PA00217` (~$2K) → Kaine
- `BALDWIN` coded to Alsobrooks' `S4MD00327` (~$1K) → Baldwin
- `TRUMP` coded to Biden's `P80000722` (~$3K) → Trump

Three of those targets needed linkage work first: Baldwin (`B001230`) and Kaine
(`K000384`) already had profiles but Baldwin's Senate FEC id `S2WI00219` wasn't
aliased (~$60M of IEs unattributed); DeSantis had no record at all because he
withdrew and so never appeared in the active-candidate sweep. He was onboarded
through the shared candidate funnel via the **`onboard-fec-candidate`** edge
function (`{"fec_ids":["P40013039"]}`), which is the reusable path for any
withdrawn/missing candidate the discovery sweep skips.

What's left unattributed is only the uncoded long tail — IE rows with no FEC
candidate id at all (e.g. ~$45M named DeSantis, ~$1.5M named Baldwin). These show
under no profile (not *mis*-attributed) and can't be linked without an id.

Same-person name variants/typos (e.g. `WHITESIDES`/`WHITESIDE`,
`KRISHNAMOORTHI`/`KRIISHNAMOORTHI`, `PAULINA LUNA`/`LUNA`) need **no** correction:
they share one FEC id, so canonical-`candidate_id` grouping already merges them.

## Onboarding a missing candidate

When a candidate that IEs reference has no profile (typically because they
withdrew, so the `candidate_status=C` sweep skips them), invoke
`onboard-fec-candidate` with their FEC id(s). It runs the same
`resolveAndUpsertCandidate` funnel as `discover-fec-candidates` (person
resolution, dedup, skeleton row at `pending_research`) but without the
visible-states gate, and records the `candidate_fec_ids` alias so the importer
links their spending. Then add an IE backfill migration guarded by
`EXISTS (SELECT 1 FROM candidates WHERE id = '<fec_id>')`.

## Adding a new correction

Insert a row into `ie_target_overrides` (admin-only via RLS) and add a small
migration that seeds it and runs the standard idempotent backfill block. Keep
`match_name_pattern` paired with a specific FEC id per the safety rule above.

## Known divergence vs FEC-as-filed (expected — do not "fix")

*(2026-06-10)* Because of these corrections, our per-candidate totals will NOT
match FEC's `schedule_e/by_candidate` aggregation for the 2024 Biden→Harris
ticket — and that's correct behavior. FEC's *processed* layer keeps roughly
$185M of FF PAC's (`C00669259`) post-dropout pro-Harris spending coded to
Biden's `P80000722`, while the F24 notices (our source data) code it to Harris;
at ticket level (Harris+Biden combined) the books reconcile to ~96%. Full
verification trail: `docs/HANDOFF.md`, both 2026-06-10 entries. If FEC support
numbers ever look wildly off for one ticket candidate, check the other ticket ID
before suspecting our data.
