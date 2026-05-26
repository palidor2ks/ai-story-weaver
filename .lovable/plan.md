# Add Employment Status & Expanded Income Ranges

Port PR #90 from the ai-story-weaver repo into this project.

## Changes

**1. Database migration**
- Add `employment_status text` column to `public.profiles` (nullable).

**2. `src/hooks/useProfile.ts`**
- Add `employment_status: string | null` to the `Profile` interface.

**3. `src/components/DemographicsForm.tsx`**
- Add `employment_status: string` to `DemographicsData`.
- Replace `INCOME_RANGES` with the new 10-bucket set (Under $50k → Over $100M + Prefer not to say).
- Add `EMPLOYMENT_STATUSES` constant: Self-employed, Employed (1 job), Employed (multiple jobs), Part-time employed, Student, Prefer not to say.
- Initialize `employment_status` in state, include in `isFormValid`, render a `Select` between Income and Sex.

**4. `src/components/EditProfileDialog.tsx`**
- Same income range update.
- Add `EMPLOYMENT_STATUSES`, include `employment_status` in initial state, reset effect, save payload, and add a `Select` field.

**5. `src/pages/Onboarding.tsx`**
- Persist `employment_status` in the profile update payload and pass it as `initialData` to `DemographicsForm`.

## Out of scope
- Skipping the `supabase/integrations/supabase/types.ts` edit — it regenerates from the DB after migration.
- No changes to scoring, party-match, or any downstream consumers of demographics.

Reply **go** to start with the migration.
