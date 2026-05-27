## Goal
PR #112 ("Show primary cause wherever donors are displayed") was merged but the `DonorCard` integration is incomplete — it passes only a label string, which breaks `CauseBadge`'s type contract and produces a broken tooltip ("Assigned by undefined"). Donor listing also discards the rest of the cause info.

## Changes

### 1. `src/components/DonorCard.tsx`
- Replace the `primaryCauseLabel?: string` prop with `primaryCause?: DonorCauseInfo` (import the type from `@/hooks/useDonorCauses`).
- Render `{primaryCause && <CauseBadge cause={primaryCause} />}` so the badge gets the full object (label, description, assignedBy, confidence, etc.) and the tooltip renders correctly.

### 2. `src/pages/Donors.tsx`
- Change the prop pass-through from `primaryCauseLabel={getDonorCause(...)?.label}` to `primaryCause={getDonorCause(donorCauseMap, donor.name, donor.type)}`.

### 3. Verify (no code change expected)
- `src/pages/DonorProfile.tsx` already passes the full `donorPrimaryCause` object — leave as is.
- `useDonorCauses` already returns `DonorCauseInfo` with all fields populated (alias-level + committee-topic fallback).

## Out of scope
- No DB, edge function, or `CauseBadge` changes.
- No changes to how causes are resolved.
