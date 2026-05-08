## Move "Refresh Piscataway" button to the Static Officials tab

**Problem:** The button was added to `CivicOfficialsPanel.tsx`, which is never imported or rendered in `Admin.tsx`. Meanwhile, the "Static Officials" tab you're viewing is an inline section in `Admin.tsx` backed by `useStaticOfficials` — the same `static_officials` table the Piscataway scraper updates.

**Fix:**
1. In `src/pages/Admin.tsx`, add a "Refresh Piscataway" button to the `CardHeader` of the Manual Entry Officials card (around line 504), aligned to the right of the title.
2. Wire it to `supabase.functions.invoke('scrape-piscataway-officials')` with a loading state, success/error toast, and `queryClient.invalidateQueries` on the static officials query key.
3. Leave the (unused) `CivicOfficialsPanel` button in place for now — it's harmless and may be wired up later.

Result: button appears in the same Static Officials tab shown in your screenshot, top-right of the "Manual Entry Officials" card.