# Committee AI Analysis: Related Entities + FEC ID Aliasing

## Problem

`ai-recipient-analysis` anchors hard on a single FEC ID and instructs Perplexity to discard any results that describe a "different same-named entity." This is too strict in two real cases:

1. **Same-named successor / sibling committees.** A brand-new 2026-cycle committee (`C00897926` PROGRESSIVE PROMISE) gets flagged as "Insufficient public information / 20/100 Low" because Perplexity correctly finds the older `C00744789` America's Progressive Promise PAC and is told to stop.
2. **Multiple FEC IDs for the same operation.** Donor aliases exist today, but there is no committee alias concept. Even if a user manually links two FEC IDs as the same org, the recipient AI panel still only analyzes one and rejects the other.

## Solution Overview

Add a committee-alias concept, teach `ai-recipient-analysis` to aggregate across aliased FEC IDs, and let it report on same-named related committees with a clear disclaimer instead of discarding them.

## Changes

### 1. Database: committee alias model

New table `public.committee_aliases`:
- `id uuid pk`
- `canonical_fec_id text not null` — the "primary" FEC ID for the alias group
- `member_fec_id text not null unique` — every FEC ID in the group, including the canonical one
- `display_name text` — optional override label
- `notes text` — admin note explaining why these are grouped
- `created_by uuid`, `created_at`, `updated_at`
- Unique `(canonical_fec_id, member_fec_id)`; index on `member_fec_id`
- RLS: read by `authenticated`; write restricted to `admin`/`editor` roles
- GRANTs for `authenticated` (select) and `service_role` (all)

Helper SQL function `public.resolve_committee_alias(fec text)` returning `text[]` (all member FEC IDs for the group, or `ARRAY[fec]` if not aliased).

### 2. Edge function: `ai-recipient-analysis`

- On entry, resolve `fec_id` via `committee_aliases` to get the full member list.
- Aggregate finance signals (donors, totals, top donors, spending) across **all** member FEC IDs instead of just `entity_id`.
- Pass the full FEC ID list into the Perplexity prompt: "These FEC filings (`C00...`, `C00...`) are the same operation under different registrations — analyze them together."
- Relax the same-entity guardrail: any FEC ID in the alias group is allowed. For non-aliased same-named entities, allow Perplexity to return them in a new `related_entities` array with `{name, fec_id, relationship, evidence, citation}` instead of discarding.
- Tier the confidence cap:
  - Unidentifiable → cap 20 (current).
  - Identifiable but thin (matches a known sibling/predecessor) → cap 40 with caveat.
  - Fully identified or aliased group → no cap.
- Cache key becomes `canonical_fec_id` (or sorted member-list hash) instead of raw FEC ID. Bump cache version to invalidate existing "20/100" results.

### 3. JSON schema additions

Extend the Perplexity output schema and `RecipientAIAnalysisDialog` rendering:
- `related_entities: [{name, fec_id, relationship, evidence, citation}]` — rendered as "Possibly related committees" with a "distinct FEC filer" disclaimer.
- `aliased_fec_ids: string[]` — rendered as a chip strip in the dialog header showing every FEC ID being analyzed together.

### 4. Admin UI: manage committee aliases

In the existing committee admin surface, add:
- "Link to another FEC ID" action on a committee → modal to pick another committee and merge them into an alias group.
- "Unlink" action to remove a member from the group.
- List view of current alias members on the committee detail page.

### 5. Verification

- Open `C00897926` panel → AI now returns a populated analysis with `related_entities` flagging `C00744789` and "different filer" disclaimer.
- Alias `C00897926` ↔ `C00744789` → AI panel on either committee returns combined analysis, header shows both FEC IDs, confidence cap lifted.
- Existing recipient panels with cached "20/100" results regenerate on next open.

## Technical Notes

- No changes to the donor-side alias system (`apply-donor-alias`, `ai-donor-analysis`) — this is purely recipient-side.
- Finance aggregation queries inside `ai-recipient-analysis` switch from `.eq("candidate_id", entity_id)` to `.in("committee_fec_id", memberFecIds)` (or equivalent for the candidate path).
- Confidence rationale string must mention when an alias group or related-entity caveat is in effect, so the UI tooltip explains the score.
- Cache invalidation: increment the `kind` discriminator (e.g. `recipient_v2`) so old cached payloads are bypassed without a manual purge.
