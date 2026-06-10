# Answers enrichment — vote-derived citations (part 1)

Mechanically attaches Congress.gov source URLs to `candidate_answers` rows that are
labeled `source_type='voting_record'` but have no URL, using the member's **actual
recorded actions** in `candidate_votes` joined to the (complete 118+119) `bills`
corpus. This is roadmap priority #1 work — see `docs/DATA-ACCURACY.md` §Answers for
the 35% / 75% / 100% bands the result is measured against.

## What gets cited (and what deliberately doesn't)

| Tier | Anchor | Guard |
| --- | --- | --- |
| 1 | Bill named in the answer's own `source_description` (quoted "… Act" title or explicit `H.R. 1234`-style number) | The member must have a `candidate_votes` row on that exact bill; number refs must resolve to exactly one congress within the member's own actions |
| 2 | Member sponsor/cosponsor actions on bills whose titles match `question-bill-keywords.ts` | Rule axis must equal `sign(answer_value)` (left/right convention of `src/lib/scoring.ts`) |

Accuracy guards (each one earned by a failed sample during the 2026-06-10 run):
- **Congress-consistency:** every action date on a (member, bill) pair must fall
  inside the bill's labeled congress ±1yr. **39% of raw pairs failed this** — the
  bills table has id collisions / congress mislabels that attach actions to the
  wrong bill row, which would have produced wrong-bill URLs. (This number is also
  the first quantification of the deferred bills-hygiene issue.)
- **CRA disapprovals excluded from keyword matching** — "…Repeal of the Affordable
  Clean Energy Rule" contains 'clean energy' with inverted intent.
- **Commemorative / sense-of resolutions excluded from keyword matching** — their
  titles carry incidental keyword text (a Venezuela hostage-release resolution
  matched 'public defender' for a legal-aid question) and are weak policy evidence
  even when topical. Added in round 2; round-1 rows citing ONLY such resolutions
  (205) were reset to the enrichable pool.
- **Junk names excluded** ("On Agreeing to the Amendment"), and tier-2 titles come
  from the keyword-matched row, not whichever duplicate bills row `min()` picked.
- **Floor votes are NOT tier-2 evidence** — `candidate_votes` can't distinguish a
  passage vote from a procedural one, so a "Nay" citation could misrepresent. Part
  1b can revisit with roll-call context. (Tier 1 may cite them: the answer's own
  description claims the vote.)
- **Bipartisan topics** (veterans funding, CHIPS, opioids, rural broadband…) have no
  keyword rules — an axis claim there would be arbitrary.
- **Answers with `answer_value = 0`** get nothing from tier 2 (directional evidence
  can't support a centrist answer).
- ~40.5k of the 81k URL-less `voting_record` answers belong to candidates with **no
  vote data at all** (the generator mislabeled "no record found" prose) — those are
  out of reach by design; relabeling them is a separate hygiene task.

## Ritual

```sh
bun scripts/answers-enrichment/generate-vote-citation-sql.ts staging     # builds _enrich_* scratch tables (no answer writes)
bun scripts/answers-enrichment/generate-vote-citation-sql.ts verify      # samples + invariants — EYEBALL THESE before applying
bun scripts/answers-enrichment/generate-vote-citation-sql.ts apply-tier1
bun scripts/answers-enrichment/generate-vote-citation-sql.ts apply-tier2
bun scripts/answers-enrichment/generate-vote-citation-sql.ts measure     # sourcedWithUrl + refresh the stats cache
bun scripts/answers-enrichment/generate-vote-citation-sql.ts cleanup     # drops scratch tables
```

Each step prints SQL. Pipe to `psql "$SUPABASE_DB_URL"` locally, or run via the
Supabase MCP `execute_sql` from an agent session — in that case run staging one
`-- >>>` block at a time (a single giant CTAS exceeds the 60s tool budget; if a
call times out, the statement may still be running server-side — check
`pg_stat_activity` before re-issuing).

Apply is idempotent: it only touches rows that still have no URL, so re-running is
a no-op, and a populated `source_url`/`source_urls` is never overwritten. Tier 1
applies first and wins overlaps (it's the truer citation).

**Do not skip `verify`.** Check that tier-2 samples' bill titles genuinely support
the answer's direction, and that the `collisions` and `bad_urls` probes return 0.

## Part-1 run record (2026-06-10)

- Round 1: tier 1 = **523** answers (819 citations), tier 2 = **2,786** answers
  (after 189 overlap), total **3,309** answers across ~450 members.
  `sourcedWithUrl`: 22,670 (5.67%) → 25,997 (6.47%).
- Round 2 (after the `candidate_votes.bill_id` repair in `scripts/data-repair/`
  unlocked +142,889 congress-consistent pairs): +48 tier-1, +249 tier-2; then
  **−205** round-1 rows reset by the new commemorative-resolution standard.
  Net standing: **26,123 URL-sourced (6.44% of 405,498 — the answers total keeps
  growing from the regular pipeline)**; cache refreshed both times.
- Not verified from the sandbox (egress-blocked): live HTTP resolution of the
  generated URLs — spot-check a handful from a networked env. The URL pattern is
  Congress.gov's canonical one.
