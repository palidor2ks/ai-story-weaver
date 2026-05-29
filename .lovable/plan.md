## Problem

The auto-generated stat card on `/admin/social-posts` renders a stripped-down version of `CandidateStatCard`. The rep-profile share button (`ShareProfileButton` → `ShareCardModal`) feeds the card a much richer payload that the admin renderer doesn't compute:

| Field | Source on rep profile | Missing in admin renderer |
|---|---|---|
| `topDonors` | aggregated from `useCandidateDonors`, conduit/transfer filtered, top 3 | — |
| `fundingBreakdown` + `fundingCycle` | `computeFundingBreakdown(fundingInput)` over FEC reconciliation + live FEC totals | — |
| `topSpenders` + `ieCycle` | `useCandidateIE` (latest cycle, top 2) | — |
| `candidateImage` | original URL then base64-converted for CORS-safe PNG export | partially (basic data-url fetch only) |
| `agreements` / `disagreements` / `matchScore` / `userScore` | per-user, requires a quiz profile | not applicable for an unpersonalized auto-post — keep empty |

So the admin card is missing the donor list, funding-source ring, IE spenders, and proper image fallback.

## Fix

Extract the rep-profile share-card data assembly into a single reusable hook and use it from both the rep profile page and the admin renderer.

### 1. New hook: `src/hooks/useCandidateShareCardData.ts`

`useCandidateShareCardData(candidateId)` returns:
```ts
{
  loading: boolean;
  data: null | {
    candidate;          // useCandidate
    representativeDetails;
    candidateImageResolved; // base64-converted URL (bioguide fallback for federal IDs)
    score;              // from useCandidateScoreMap, falling back to candidate.overall_score
    cycleLabel;         // from useAvailableCycles
    topDonors;          // aggregated, conduit/transfer filtered, top 3
    fundingBreakdown;   // computeFundingBreakdown + withPercents, filtered
    topSpenders;        // useCandidateIE latest cycle, top 2
    ieCycle;
  }
}
```

Internally it composes the existing hooks already used by `CandidateProfile.tsx` and `ShareProfileButton.tsx`:
`useCandidate`, `useCandidateScoreMap`, `useAvailableCycles`, `useCandidateDonors`, `useFECTotals`, `useFinanceReconciliation`, `useRepresentativeDetails`, `useCandidateIE`, plus `computeFundingBreakdown` / `withPercents` / `isConduitDonor`.

### 2. Refactor consumers to use the hook

- **`src/components/ShareProfileButton.tsx`** — drop the inlined IE / image-conversion logic and accept the resolved data via the hook (or keep it as a thin wrapper that calls the hook). Behavior unchanged.
- **`src/pages/CandidateProfile.tsx`** — keep all on-page logic as-is, but pass the same hook output to `ShareProfileButton` so there's a single computation. (Profile page still computes its own donor/finance breakdown for tabs.)

### 3. Admin renderer uses the hook

In `src/pages/admin/SocialPosts.tsx`, replace the inline `renderAndUpload` data assembly with the hook output. Since the offscreen render happens inside a click handler (not a React subtree), wrap the renderer in a small component:

- Add `<HiddenCardRenderer postId, candidateId, onReady />` that mounts when the user clicks **Re-render**, runs the hook, waits for `loading === false`, renders `<CandidateStatCard data={...}/>` offscreen, captures via `nodeToBlob`, uploads via `uploadShareCard`, persists `image_url` / `share_url` on `social_posts`, then unmounts.
- The component is rendered inside the existing `PostCard` so query-client + auth context are available.

For unpersonalized auto-posts: `userScore = null`, `matchScore = 0`, `agreements = []`, `disagreements = []` — the `CandidateStatCard` already handles this (the right-hand "match" area collapses when those are empty, leaving room for the donor + funding sections to dominate).

## Verification

1. Open `/admin/social-posts` → Queue → click **Re-render** on Mike Bost.
2. The captured card now shows top donors, funding-source ring with cycle label, and IE top spenders — visually identical to clicking **Share** on `/candidate/B001295`.
3. Click **View card** → opens the PNG; matches the rep-profile share image.
4. Open `/candidate/B001295`, click **Share** → modal preview unchanged (regression check on the refactor).
