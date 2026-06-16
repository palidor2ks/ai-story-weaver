# PoliScore v0.0 — Build Plan

> The objective record scorecard (ships first). Scopes the work before schema changes, per the repo's
> migration guardrails. See [`poliscore-methodology.md`](./poliscore-methodology.md) for the rules.

## Goal

A public, sourced **record scorecard** for the NC + NJ federal delegations (~30 members): each
member's **participation rate** + their **actual vote on each curated key vote**, grouped by topic,
every vote linked to Congress.gov, behind the "free & un-buyable" wall. **No directional/−10..+10
score** — that's v0.1.

## Data rule (locked)

Score the **final-passage roll call only** = **max `vote_number` per bill** (never aggregate by
`bill_id` — it conflates procedural + passage votes). Validate against `passed_house`/`passed_senate`.

## Storage

- **`poliscore_key_votes`** (this migration): the curated rubric — bill, topic, party-split `lean`,
  neutral description, source URL. Public-read; admin/service-role writes. **28 rows seeded.**
- **No new member-score storage for v0.0.** Participation + per-key-vote record are computed **live**
  from `candidate_votes` joined to the rubric (cheap; 30 members). A materialized view or
  `poliscore_*` member columns come with v0.1's directional score.

## Steps

1. **Migration** `…_poliscore_key_votes.sql` — create + seed the rubric. **Created, not applied**
   (guardrail #1: apply deliberately after `migration-safety-reviewer`).
2. **Compute** — a read SQL/view `poliscore_member_record`: per (member, key vote) the final-passage
   position; per-member participation; per-topic "N of M cast." Routed through the one-front-door
   data layer (a `src/hooks/usePoliScoreRecord.ts`).
3. **UI** — a public member PoliScore section: participation + per-topic record with Congress.gov
   links, methodology link, "free & un-buyable" wall.
4. **Gate** — `data-accuracy-verifier` spot-checks positions vs Congress.gov; `migration-safety-reviewer`
   on the migration before apply.
5. **Ship v0.0.**

## Status (2026-06-16)

- **Applied to prod:** `poliscore_key_votes` (28 rows; 6 left / 22 right; all resolve to roll calls)
  and the compute RPC **`get_poliscore_record(p_candidate_id text)`** → returns per key vote:
  `key_vote_id, topic_id, lean, title, neutral_description, source_url, congress, bill_type,
  bill_number, vote_position`. Security advisor: clean (no `poliscore` findings).
- **Validated:** Alma Adams (D, NC-12) = 28/28 on record, **28 left-aligned / 0 right-aligned**
  (face-valid for a progressive). The RPC computes alignment correctly.
- **Known gap (deferred):** the rubric is **House bills only**, so it scores the **~26 House members,
  not the 4 Senators** (Tillis/Budd + NJ's two) — Senate floor roll calls differ. Add Senate key votes
  in a later pass.

## Frontend contract (for the build)

Hook `usePoliScoreRecord(candidateId)` → `supabase.rpc('get_poliscore_record', { p_candidate_id })`,
group by `topic_id`, compute participation (`vote_position IN ('Yea','Nay')`) and per-topic
"N of M cast". Render per-topic record with each vote's `neutral_description` + Yea/Nay/Not Voting +
`source_url` link, the methodology link, the "free & un-buyable" wall, and the Left/Right disclaimer.
Empty record (e.g., Senators) → show "Not yet scored — House votes only in v0."

## RLS

`poliscore_key_votes` is public reference data (no PII): `SELECT USING (true)`; writes via
service-role/admin only — matches the repo's public-table pattern.
