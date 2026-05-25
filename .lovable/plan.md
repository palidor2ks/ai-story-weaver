## Problem

The "Topic Weighting" card on `/how-scoring-works` lists 5 generic priority ranks (Priority #1–#5), implying users rank 5 topics. The actual onboarding flow is different:

- **Federal**: user picks **3** topics and ranks them → weights **3, 2, 1**. Unranked federal topics still receive weight **1** (all 6 federal questions are asked of every user).
- **Local**: user picks **2** topics and ranks them → weights **2, 1**.

So users rank 3 + 2 = 5 *slots* across two separate flows, not one flat 1–5 list.

## Fix

Rewrite the "Topic Weighting" card in `src/pages/HowScoringWorks.tsx` to show two grouped sections:

**Federal priorities (pick 3 of 6 topics)**
- Priority #1 — weight 3 (most influence)
- Priority #2 — weight 2
- Priority #3 — weight 1
- Unranked federal topics — weight 1 (still counted, lowest influence)

**Local priorities (pick 2 topics)**
- Priority #1 — weight 2
- Priority #2 — weight 1

Update the trailing explainer to say: "You rank 3 federal topics and 2 local topics during onboarding. Higher-ranked topics count more in your overall score; unranked federal topics still contribute at the baseline weight."

No other pages or scoring logic change — this is purely a documentation fix on the How Scoring Works page.
