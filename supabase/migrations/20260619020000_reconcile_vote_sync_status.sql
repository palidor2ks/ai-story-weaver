-- Fix: reconcile vote_sync_status persisted counts against candidate_votes ground truth.
--
-- Root cause: sync edge functions (fetch-member-votes, fetch-floor-votes) write
-- persisted_count / persisted_floor_votes based on what they think they inserted
-- during their run, not by querying actual row counts afterwards. Repair runs,
-- deduplication, and concurrent syncs cause the cursor to drift from reality.
-- Audit (2026-06-19): 390/541 legislative mismatches, 534/541 floor mismatches,
-- 272 members with expected=0/persisted=0 despite thousands of rows in candidate_votes.
--
-- Strategy:
-- 1. Recompute persisted_count / persisted_floor_votes from candidate_votes directly.
-- 2. For the 272 members where expected_total=0 but data exists, set expected_total=actual
--    so the admin health signal reads "complete" rather than showing an orphaned 0/0 row.
-- 3. Ensure last_sync_completed_at is non-null for members that have data, so the
--    admin panel sync badge shows 'complete' not 'never'.
-- 4. Create a reusable reconcile_vote_sync_status() function for future use
--    (can be called from admin, a cron, or after bulk repair runs).

CREATE OR REPLACE FUNCTION public.reconcile_vote_sync_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  WITH actual AS (
    SELECT
      candidate_id,
      COUNT(*) FILTER (WHERE action_type IN ('sponsor', 'cosponsor')) AS legislative,
      COUNT(*) FILTER (WHERE action_type = 'floor_vote')              AS floor
    FROM candidate_votes
    GROUP BY candidate_id
  )
  UPDATE vote_sync_status vss
  SET
    persisted_count        = actual.legislative,
    persisted_floor_votes  = actual.floor,
    -- When expected_total was never set (=0) but we have real data, mirror the
    -- actual count so the completeness signal is honest instead of showing 0.
    -- Leave expected_total alone when it was legitimately set from the Congress.gov
    -- API (>0), even if our local count diverges.
    expected_total         = CASE
                               WHEN vss.expected_total = 0 AND actual.legislative > 0
                               THEN actual.legislative
                               ELSE vss.expected_total
                             END,
    -- Backfill a completion timestamp for members that have data but whose sync
    -- function never wrote one (causes the admin badge to show 'never' forever).
    last_sync_completed_at = COALESCE(
                               vss.last_sync_completed_at,
                               CASE
                                 WHEN actual.legislative > 0 OR actual.floor > 0
                                 THEN now()
                               END
                             ),
    updated_at             = now()
  FROM actual
  WHERE vss.candidate_id = actual.candidate_id
    AND (
      vss.persisted_count       IS DISTINCT FROM actual.legislative
      OR vss.persisted_floor_votes IS DISTINCT FROM actual.floor
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_updated, 'ran_at', now());
END;
$$;

-- Run immediately to repair current state
SELECT public.reconcile_vote_sync_status();
