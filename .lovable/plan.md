## Root cause

The admin **Render image / Re-render** button waits on `cardReady` and `cardData` values that were captured when the click handler started. If the hidden card finishes mounting or the hook finishes loading after the click, the loop can keep seeing the old values and time out with `Card data not ready — try again in a moment`.

There is also an avoidable risk from calling `setCardReady` inside the ref callback, which can cause extra render churn while the offscreen card mounts.

## Fix plan

1. **Make the render wait loop read live values**
   - Add refs for the latest `cardData` and hook loading state.
   - Keep those refs updated with `useEffect`.
   - In `render()`, poll `cardNodeRef.current`, `cardDataRef.current`, and `loadingRef.current` instead of closed-over state.

2. **Remove the redundant `cardReady` state**
   - Delete `cardReady` and the `setCardReady` ref callback.
   - Use a plain `ref={cardNodeRef}` for the offscreen card wrapper.

3. **Improve the failure message**
   - If the hook is still loading after the wait, show `Card data is still loading`.
   - If the hidden DOM node is missing, show `Card renderer did not mount`.
   - If candidate data is missing, show `Candidate data not available`.

4. **Keep the full-fidelity card behavior unchanged**
   - Continue using `useCandidateShareCardData` and `CandidateStatCard` so top donors, funding sources, and outside spenders remain included.

## Files to change

- `src/pages/admin/SocialPosts.tsx` only

## Verification

- Open `/admin/social-posts`.
- Click **Render image / Re-render** on a pending candidate.
- Confirm it no longer times out from stale readiness state.
- Confirm **View card** opens the generated full stat card with donors, funding sources, and outside spenders.