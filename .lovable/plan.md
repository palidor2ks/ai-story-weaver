# Fix: Seed Local Onboarding Questions

## Problem
The 5 local topics each have 20 questions, but **none** are marked `is_onboarding_canonical = true`. The onboarding local quiz filters for canonical questions only, so it finds 0 and shows "No local questions available."

## Solution
Run a data update to set `is_onboarding_canonical = true` and assign `onboarding_slot` values for 2 questions per local topic (10 total).

### Selected questions (2 per topic):

**Local Education**
1. `local-edu-1` — "Should the state increase funding for public K-12 schools?"
2. `local-edu-5` — "Should the state expand school choice voucher programs?"

**Local Housing**
1. `local-housing-1` — "Should local governments reform zoning laws to allow more housing development?"
2. `local-housing-3` — "Should the state fund affordable housing programs?"

**Local Public Health**
1. `local-ph-1` — "Should the state expand Medicaid coverage?"
2. `local-ph-7` — "Should local governments regulate vaping and tobacco sales?"

**Local Cost of Living**
1. `local-col-1` — "Should the state or city set a minimum wage above the federal level?"
2. `local-col-4` — "Should groceries be exempt from state and local sales tax?"

**Local Public Safety**
1. `local-ps-1` — "Should local police departments receive increased funding?"
2. `local-ps-5` — "Should the state implement stricter gun control laws?"

### Changes
- **Database**: UPDATE 10 rows in `questions` table — set `is_onboarding_canonical = true` and `onboarding_slot` (1 or 2)
- **No code changes needed** — the existing onboarding flow already queries for `is_onboarding_canonical` questions by topic ID

## Technical Notes
- This is a data-only change (UPDATE existing rows), not a schema change
- The onboarding code in `Onboarding.tsx` already handles local questions correctly — the only missing piece was the data flags
