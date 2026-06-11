# Answers enrichment part 1b — research-pipeline citations (plan)

> **Decision (owner, 2026-06-11):** accept the coverage-vs-% dilution (no throttle on
> `batch-populate-answers-job`), do the mislabel hygiene (done — see below), then pursue
> **option (b): research-pipeline citations**, starting with `public_statement` answers.
> Option (a) — extending the mechanical vote route — stays available but cannot reach the
> goal: the 35% floor needs ~155k URL-sourced answers and the vote-eligible pool is ~36k.

## Where the URL-less answers live (live, 2026-06-11, post-relabel)

| source_type | without URL | route |
| --- | --- | --- |
| public_statement | 155,599 | **part 1b (this plan)** |
| other / inferred | 157,570 | none — see "the inferred question" below |
| campaign_website | 51,074 | part 1b, phase 2 (site-domain guard) |
| voting_record | 36,282 | existing vote-citation route (all have vote data now) |
| web_research | 15,106 | part 1b (same mechanism) |
| interview | 650 | part 1b, low priority |

Hygiene completed 2026-06-11: **47,066** answers labeled `voting_record` for candidates
with zero `candidate_votes` rows were relabeled (`evidence_type='inferred'`,
`source_type='other'`) — they were party-affiliation inferences, confirmed by sampling
(incl. two answers researched for the *wrong person* — see Risks). A write-time guard
(`supabase/functions/_shared/answer-label-guard.ts`, used by `get-candidate-answers`)
stops the pool regrowing: uncited vote claims for vote-less candidates are stored as
inferred. ~5.2k of the relabeled rows belong to 161 orphaned candidate_ids (no
`candidates` row) — repoint/delete via `candidate_merge_map` is a separate hygiene task.

## Mechanism

Reuse the grounded-research primitives that already exist (the `news-research.ts` /
`callYouSmart` pattern): research WITH citations, distill via a tool-call that returns a
`source_index` into the citation list — the model can never mint a URL. Per answer batch:

1. **Anchor on the answer's own `source_description`** — highest-precision targets first:
   descriptions that name a concrete artifact ("in a 2019 press release…", "his campaign
   website's Issues section states '…'", "in an interview with…"). The research query is
   "find THIS artifact", not "research this topic".
2. **Stance guard:** the distiller must confirm the found source supports the answer's
   recorded direction (`sign(answer_value)`), else return NONE. Mirrors the part-1
   sign-consistency guard.
3. **Host guard (phase 2, campaign_website):** when `candidates.website` is known, the
   citation host must match it (or an archive.org capture of it).
4. **NONE is a valid outcome** — never attach a "close enough" URL. Unresolvable answers
   stay URL-less; accuracy beats present (north star).

## Ritual (same as part 1 — non-negotiable)

stage → **sample-eyeball** (50 answers/phase before scaling; record precision here) →
invariant probes (0 collisions with existing URLs, URL shape, host sanity) → apply
(idempotent; never overwrite an existing URL) → measure + `refresh_admin_stats_cache` →
cleanup. Run from a **networked env or edge function** — the research calls and URL
liveness checks cannot run in an egress-blocked sandbox.

## Throughput & sequencing

One research call per (candidate × topic cluster) covers several answers — ~12 clusters
across the 351 questions ⇒ worst case ≈ 29k calls for all candidates; far fewer in the
phases below. Queue it on the existing research-queue machinery (`drain-research-queue` /
`requeue-stalled-research` crons already run); **any new cron entry needs review first
(guardrail #2)**.

- **Phase 1:** sitting members + active-race challengers, `public_statement` answers whose
  descriptions name a concrete artifact. Measure precision on the 50-sample gate; abort
  and redesign if < ~90% on the eyeball.
- **Phase 2:** `campaign_website` answers with the host guard.
- **Phase 3:** remaining `public_statement` / `web_research` / `interview` by candidate
  prominence (active races first), until the 35% floor is crossed.

## The inferred question (flag for maintainer — metric definition)

157,570 answers are now honestly labeled inferred ("party affiliation suggests…"). They
can never be URL-sourced — there is no artifact to cite. Two coherent stances:
(1) keep them in the denominator (35% stays hard; effectively requires REPLACING inferred
answers with researched ones over time), or (2) exclude `inferred` from the eligible
denominator and report both numbers. Today the scoreboard does (1). Worth an explicit
call in `DATA-ACCURACY.md` §Answers when part-1b ships its first phase.

## Risks (earned, not hypothetical)

- **Wrong-person research:** the relabel sampling surfaced answers researched for a
  different politician with a similar name (e.g. "Gianaris" prose on a "JONES, GIAN A"
  row; a researcher's-typo note on a CA-34 row). The stance/artifact guards catch most of
  this (the artifact must mention the candidate), but phase samples must explicitly check
  identity, and a name+state assertion belongs in the distiller prompt.
- **Dead/moved artifacts:** press releases and campaign sites rot. Record what was
  verified (title + host + retrieval date in `source_titles`/audit) so a later liveness
  pass can re-check; prefer archive.org fallbacks for campaign_website.
- **Volume cost:** phase gates + per-candidate batching keep API spend bounded; no
  unbounded backfill without a measured phase-1 precision number.
