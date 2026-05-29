Root cause: the hidden `CandidateStatCard` wrapper only exists when `cardData` is truthy. If data arrives after the click, or if the conditional render never commits before the polling timeout, `cardNodeRef.current` stays null and the render path throws `Card renderer did not mount`.

Plan:
1. In `src/pages/admin/SocialPosts.tsx`, mount the offscreen renderer container unconditionally for candidate posts instead of only when `cardData` exists.
2. Put the ref on a stable fixed-size wrapper that always mounts, and render `CandidateStatCard` inside it only after `cardData` exists.
3. Update the render wait loop to require both the stable wrapper node and `cardDataRef.current`, then capture the stable wrapper node.
4. Keep the same full-fidelity `useCandidateShareCardData` + `CandidateStatCard` pipeline so donors, funding source, and outside spenders remain included.

Technical details:
- This is a one-file fix in `src/pages/admin/SocialPosts.tsx`.
- The key change is making `cardNodeRef` point to a persistent DOM node, not a child that disappears while data is null.
- Error messages can distinguish between “renderer missing” and “candidate data unavailable,” but the normal path should no longer hit the mount error.