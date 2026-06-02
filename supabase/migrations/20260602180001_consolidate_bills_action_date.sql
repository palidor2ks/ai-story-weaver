-- Consolidate bills.last_action_date into bills.latest_action_date.
-- Two columns have been tracking the same concept from different sync paths:
--   last_action_date  — written by fetch-floor-votes / fetch-member-votes
--   latest_action_date — written by fetch-all-bills / nightly-bill-sync / import-bills-excel
-- The UI (TopicReviewPanel) reads last_action_date; all import paths now write
-- latest_action_date. Merge and drop the legacy column.

-- 1. Fill in latest_action_date from last_action_date where it is still null
--    (bills that were created via vote-sync before a full bill sync ran).
UPDATE public.bills
SET latest_action_date = last_action_date
WHERE latest_action_date IS NULL AND last_action_date IS NOT NULL;

-- 2. Also prefer the more recent of the two where both are set.
UPDATE public.bills
SET latest_action_date = last_action_date
WHERE last_action_date IS NOT NULL
  AND latest_action_date IS NOT NULL
  AND last_action_date > latest_action_date;

-- 3. Drop the legacy column.
ALTER TABLE public.bills DROP COLUMN IF EXISTS last_action_date;
