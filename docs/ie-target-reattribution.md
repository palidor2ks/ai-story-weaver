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

Small cross-person mis-codes remain where the correct target has **no candidate
record** yet, so they can't be reattributed without first creating one:

- `DESANTIS` coded to Haley's `P40010977` (~$122K)
- `KAINE` coded to Casey's `S6PA00217` (~$2K)
- `BALDWIN` coded to Alsobrooks' `S4MD00327` (~$1K)
- `TRUMP` coded to Biden's `P80000722` (~$3K)

Same-person name variants/typos (e.g. `WHITESIDES`/`WHITESIDE`,
`KRISHNAMOORTHI`/`KRIISHNAMOORTHI`, `PAULINA LUNA`/`LUNA`) need **no** correction:
they share one FEC id, so canonical-`candidate_id` grouping already merges them.

## Adding a new correction

Insert a row into `ie_target_overrides` (admin-only via RLS) and add a small
migration that seeds it and runs the standard idempotent backfill block. Keep
`match_name_pattern` paired with a specific FEC id per the safety rule above.
