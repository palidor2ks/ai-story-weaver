## Goal

On the candidate profile donor list (e.g. DELOITTE PAC row), show the PAC's **primary cause** as a small badge next to the "PAC" type badge, sourced from the existing `committee_topics` + `committee_causes` tables.

## Where it appears

`src/pages/CandidateProfile.tsx`, donor row rendering around lines 950–1010, only for sources where `source.sourceType === 'donor'` and `donor.type === 'PAC'` (or `'Organization'`).

Render after the existing `<Badge>{donor.type}</Badge>`:

```
PAC  • Tech industry (primary cause)  • WASHINGTON, DC
```

Style: `variant="outline"`, neutral muted color, tooltip showing the cause `description` and "Assigned by AI / Admin" based on `assigned_by` / `admin_overridden`.

## Data path

PAC donor rows don't carry the PAC's own FEC committee ID. We resolve PAC name → committee ID via existing `donor_aliases`:

1. `donor_aliases` (active) has `canonical_name` + `fec_committee_id` and `fec_committee_ids[]`.
2. `donor_alias_members` links raw `donor_name` + `donor_type` → `alias_id`.
3. `committee_topics.fec_committee_id` → `primary_cause_id` (+ `ai_confidence`, `assigned_by`, `admin_overridden`).
4. `committee_causes.id` → `label`, `description`, `stance`, `quiz_topic_id`.

## Implementation

1. **New hook** `src/hooks/useDonorCauses.ts`:
   - Input: list of `{ name, type }` from the visible PAC/Organization donors.
   - Query `donor_alias_members` + joined `donor_aliases` for those name/type pairs (chunked `.in()`), collect `fec_committee_id` and `fec_committee_ids[]`.
   - Query `committee_topics` for those committee IDs, join `committee_causes` on `primary_cause_id`.
   - Return `Map<normalizedName, { causeId, label, description, confidence, adminOverridden }>`.
   - 5 min `staleTime`; key includes sorted name list hash.

2. **Wire into `CandidateProfile.tsx`**:
   - Compute `pacDonorNames` from `donors.filter(d => d.type === 'PAC' || d.type === 'Organization')`.
   - Call `useDonorCauses(pacDonorNames)`.
   - In the PAC donor row meta line, render a `CauseBadge` when a cause is found, with `<Tooltip>` showing description + source.

3. **Small `CauseBadge` component** in `src/components/CauseBadge.tsx` (reusable later for the donor profile and committee profile).

## Out of scope

- No DB changes; no edge functions; no AI assignment changes.
- Cause is not shown on non-PAC rows (individuals, transfers, small donors).
- Filter/sort by cause is a follow-up.
