## Problem

The 3 new questions (`civil-rights-q21` guns, `civil-rights-q22` abortion, `government-q21` Citizens United) were inserted without `question_options` rows. Existing questions have 6 options (5 scored: -10/-5/0/+5/+10 + 1 skip). The quiz will render them broken.

## Fix

Insert 6 `question_options` rows per new question, matching the existing pattern: id `{question_id}-opt-{N}` (skip = `-opt-skip`), values -10/-5/0/+5/+10/0, with `is_skip_option = true` on the skip row.

### Proposed option text

**civil-rights-q21 — "Should Congress require universal background checks for all gun sales?"**
1. (-10) Yes—close all loopholes including private and gun-show sales.
2. (-5) Yes—expand checks but keep some private-sale exemptions.
3. (0) Neutral—support modest improvements to current system.
4. (+5) No—but improve enforcement of existing laws.
5. (+10) No—current background-check laws are sufficient or too strict.
6. (skip) Not important to me

**civil-rights-q22 — "Should federal law protect the right to abortion nationwide?"**
1. (-10) Yes—codify Roe-level protections in federal law.
2. (-5) Yes—protect access with reasonable limits (e.g., viability).
3. (0) Neutral—leave to states with minimum federal standards.
4. (+5) No—states should decide, with limited federal restrictions.
5. (+10) No—federal law should restrict or ban abortion.
6. (skip) Not important to me

**government-q21 — "Should Congress act to overturn Citizens United and limit super PAC spending?"**
1. (-10) Yes—pass a constitutional amendment to overturn it.
2. (-5) Yes—pass statutory limits on super PAC spending and disclosure.
3. (0) Neutral—support disclosure rules only.
4. (+5) No—but tighten foreign-money rules.
5. (+10) No—Citizens United correctly protects political speech.
6. (skip) Not important to me

## Implementation

Single migration: 18 INSERT rows into `public.question_options` with `ON CONFLICT (id) DO NOTHING`.

No code changes needed — the quiz reads options from this table automatically.
