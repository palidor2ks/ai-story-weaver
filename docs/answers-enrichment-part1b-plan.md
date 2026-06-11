# Answers enrichment part 1b — research-pipeline citations (plan)

> **PHASE-1 GATE RESULT (2026-06-11): FAILED — and the failure is the finding.**
> 50-sample run (sitting members, artifact-naming `public_statement` descriptions, batches
> `p1b-gate2-*` in `_enrich_stmt_staging` — kept as the audit trail): **2 cited / 42 none /
> 6 transient errors**. Of the 2 cited, one violates the CLAIM guard (a 2024 re-election
> page cited for a claimed 2020 tweet) and one is borderline (real lee.senate.gov release,
> right stance, wrong specificity). The 42 nones are dominated by verdicts of the form
> "the specified press release / exact quote could not be found" — including artifacts that
> would certainly be indexed if real — and several with positive fabrication evidence (the
> real release of the claimed date was about a different topic; quoted language matching
> White House boilerplate attributed to the wrong speaker). **Conclusion: the answer
> generator fabricated concrete-looking provenance (dates, titles, verbatim quotes) at
> scale.** Do NOT scale this as a citation pipeline; see "Where this goes next" below.
> Mechanics note: standard-effort runs exceed the edge wall-clock — batches need re-kicking
> until pending=0 (resumable by design), or a self-chaining invocation for production use.

## Where this goes next (owner decision)

> **DECIDED (owner, 2026-06-11): option 2 — the evidence index.** Spike ran same day
> (5 sitting members, `spike-ingest-member-statements` + `_evidence_spike_*` scratch
> tables): **mapping 5/5** (sitting members' candidate_ids ARE bioguide ids; official
> sites from the canonical congress-legislators dataset), **discovery 4/5** (all three
> House sites via RSS — two probed `/rss.xml`, one advertised; Booker via HTML-listing
> fallback; Mike Lee's Senate CMS uses query-string item URLs `?ID=…` that the path-based
> filter misreads — fix identified), **extraction clean where pages fetch** (Titus 8/8,
> Booker 6/6, multi-KB bodies) but **house.gov item pages intermittently refuse fetches**
> (Hinson 3/8, Roy 2/8 — bot protection). Production design notes from the spike:
> (1) read release bodies from the RSS `<description>`/`content:encoded` payload first and
> only fall back to page fetches — sidesteps the bot-wall for RSS members; (2) handle
> query-string Senate CMS item URLs; (3) dedupe on (candidate, url) + content hash
> (duplicate feed items observed); (4) per-member walker as a queue drain, mirroring the
> FEC/state-finance pattern (new cron = guardrail #2 review). Next build step: production
> schema (reviewed migration) + the drain, then statement↔topic indexing, then the
> say-vs-do discrepancy layer against the verified votes corpus.

The machinery built for phase 1 (research → strict identity/claim/stance verifier →
staging) is sound — the gate caught everything before a single URL landed. Three pivots:

1. **Verify-and-flag (recommended):** run the same pipeline in reverse — answers whose
   claimed artifacts can't be found get `has_discrepancy=true` + a `discrepancy_note`
   (the column machinery exists and is unused). Turns fabricated provenance into a visible
   trust signal instead of silently shipping it. Cheap: the function already produces the
   verdict; only the apply step changes.
2. **Match against real artifacts:** crawl official press archives (house.gov/senate.gov
   newsrooms are structured) into an evidence index, then attach answers to REAL releases
   by topic+stance match — citations come from the index, not from trusting descriptions.
   Bigger build; honest by construction.
3. **Demote/regenerate:** treat artifact-claiming descriptions as inferred-grade
   (`evidence_type='inferred'`) until re-generated under a no-fabrication prompt with
   citation-required research. Most invasive; touches ~15k artifact-claiming answers
   (~8.9k on sitting members).

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
