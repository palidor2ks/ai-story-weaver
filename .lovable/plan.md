
# Add Local-Only Topics for State/Local Officials

## Overview

Add 5 new local-specific topics exclusively for state executives (governors) down to mayors/town officials. These topics will NOT appear for federal candidates. Each topic gets 20 questions. All topic names are clearly prefixed with "Local" to distinguish them from federal topics.

### New Topics
| ID | Name | Icon |
|---|---|---|
| `local-education` | Local Education | 🏫 |
| `local-housing` | Local Housing | 🏠 |
| `local-public-health` | Local Public Health | 🩺 |
| `local-cost-of-living` | Local Cost of Living | 💲 |
| `local-public-safety` | Local Public Safety | 🚔 |

## Technical Details

### Step 1: Database Migration — Add `scope` column to `topics` table

Add a `scope` column to `topics`:
- `scope TEXT NOT NULL DEFAULT 'all'` — values: `'all'` (shown for everyone), `'local'` (governor and below only)
- Existing 12 topics keep `scope = 'all'`
- New 5 topics get `scope = 'local'`

### Step 2: Insert 5 new topics + 100 questions

Insert the 5 topics and 20 questions each (100 total) via the import edge function. Questions focus on state/local governance:

- **Local Education**: School funding formulas, teacher pay, charter schools, school board authority, curriculum standards, school choice vouchers, special education funding, etc.
- **Local Housing**: Zoning reform, rent control, affordable housing mandates, homelessness, property tax, public housing, inclusionary zoning, etc.
- **Local Public Health**: Local health departments, water quality, mental health services, substance abuse programs, food safety inspections, air quality, etc.
- **Local Cost of Living**: Minimum wage (state/local), utility rates, childcare costs, grocery taxes, gas taxes, property taxes, transit affordability, etc.
- **Local Public Safety**: Police funding, community policing, fire department resources, 911 response times, gun ordinances, emergency preparedness, code enforcement, etc.

### Step 3: Update `populate-civic-answers` edge function

Currently fetches ALL questions. Update to only fetch questions from topics with `scope = 'local'`, since local officials should ONLY answer the 5 local topics.

### Step 4: Update `get-candidate-answers` edge function

Add logic to determine if a candidate is "local" (governor and below) and only fetch/generate answers for `scope = 'local'` topics. Federal candidates continue using only `scope = 'all'` topics.

### Step 5: Update frontend topic filtering

- **Feed/Candidate Profile pages**: When displaying topic scores for a local official, show only local topics. For federal candidates, show only `scope = 'all'` topics.
- **Quiz/Onboarding**: Local topics do NOT appear in the user quiz. Match scores for local officials are computed only against local topic answers.
- **Admin panels**: Show topic scope badge so admins know which topics are local-only.
- **TopicIcon component**: Add emoji mappings for the 5 new topic IDs.

### Step 6: Update scoring functions

- `calculate_coverage_tier` DB function: When calculating for local officials, count only local-topic questions as the denominator.
- Frontend scoring: Filter topic scores by scope when computing match percentages.

### Step 7: Update project memory

Update topic architecture memory from "12 topics" to "12 federal + 5 local topics (17 total)".

## What Does NOT Change
- User quiz questions remain the existing 12 topics only
- Federal candidate answer generation unchanged
- Party answers remain on the 12 federal topics
- Bill topic mapping stays on the 12 federal topics
