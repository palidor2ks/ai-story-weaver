-- PoliScore Senate key vote support.
--
-- Senate votes in candidate_votes are stored under PROC pseudo-bill IDs
-- (e.g. 'VOTE-119-1-00654'), not under the congress/bill_type/bill_number
-- scheme used for House bills.  This migration adds a senate_vote_id column
-- so the rubric can pin a specific PROC bill_id for Senate key votes, and
-- updates get_poliscore_record to use it.
--
-- When senate_vote_id IS NULL  → standard path: join bills via congress/bill_type/bill_number
-- When senate_vote_id IS NOT NULL → Senate path: join candidate_votes via senate_vote_id directly
--
-- No Senate key votes are seeded here; this is infrastructure-only.
-- The Big Beautiful Bill (HR 1, 119th) Senate passage vote is not yet in
-- candidate_votes; seed rows will be added once the data is available.

ALTER TABLE public.poliscore_key_votes
  ADD COLUMN IF NOT EXISTS senate_vote_id text;

COMMENT ON COLUMN public.poliscore_key_votes.senate_vote_id IS
  'PROC bill_id (e.g. VOTE-119-1-00654) for Senate key votes. When set the RPC '
  'joins candidate_votes directly via this bill_id, bypassing the bills JOIN. '
  'NULL for standard House key votes.';

-- Replace get_poliscore_record to handle the two paths.
-- UNION ALL: standard key votes (senate_vote_id IS NULL) use bills JOIN;
--            Senate key votes (senate_vote_id IS NOT NULL) use senate_vote_id.
-- The fp CTE finds max(vote_number) per bill_id — correct for both paths
-- (Senate PROC bills have exactly one vote_number per vote event).

CREATE OR REPLACE FUNCTION public.get_poliscore_record(p_candidate_id text)
RETURNS TABLE (
  key_vote_id         uuid,
  topic_id            text,
  lean                text,
  title               text,
  neutral_description text,
  source_url          text,
  congress            integer,
  bill_type           text,
  bill_number         integer,
  vote_position       text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH kv_bill AS (
    -- Standard House key votes: resolve bill via congress/bill_type/bill_number.
    SELECT kv.id AS key_vote_id, kv.topic_id, kv.lean, kv.title, kv.neutral_description,
           kv.source_url, kv.congress, kv.bill_type, kv.bill_number, b.id AS bill_id
    FROM public.poliscore_key_votes kv
    JOIN public.bills b
      ON b.congress = kv.congress
     AND lower(b.bill_type) = kv.bill_type
     AND b.bill_number = kv.bill_number
    WHERE kv.score_version = 'v0'
      AND kv.senate_vote_id IS NULL

    UNION ALL

    -- Senate key votes: use the PROC bill_id directly.
    SELECT kv.id AS key_vote_id, kv.topic_id, kv.lean, kv.title, kv.neutral_description,
           kv.source_url, kv.congress, kv.bill_type, kv.bill_number, kv.senate_vote_id AS bill_id
    FROM public.poliscore_key_votes kv
    WHERE kv.score_version = 'v0'
      AND kv.senate_vote_id IS NOT NULL
  ),
  fp AS (  -- final-passage roll call per bill (max vote_number)
    SELECT kb.bill_id, max(cv.vote_number) AS fp_vote
    FROM kv_bill kb
    JOIN public.candidate_votes cv
      ON cv.bill_id = kb.bill_id AND cv.action_type = 'floor_vote'
    GROUP BY kb.bill_id
  )
  SELECT kb.key_vote_id, kb.topic_id, kb.lean, kb.title, kb.neutral_description,
         kb.source_url, kb.congress, kb.bill_type, kb.bill_number, cv.position AS vote_position
  FROM kv_bill kb
  JOIN fp ON fp.bill_id = kb.bill_id
  JOIN public.candidate_votes cv
    ON cv.bill_id = kb.bill_id
   AND cv.vote_number = fp.fp_vote
   AND cv.action_type = 'floor_vote'
   AND cv.candidate_id = p_candidate_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_poliscore_record(text) TO anon, authenticated;
