-- PoliScore v0.0 — compute RPC.
-- Returns, for one official, their FINAL-PASSAGE vote on each curated key vote
-- (final passage = max(vote_number) per bill among the delegation's floor votes — the locked rule
-- that avoids conflating procedural + passage roll calls). SECURITY INVOKER so it respects the RLS
-- of the underlying public tables; granted to anon/authenticated for the public score page.
-- See docs/poliscore-methodology.md.

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
    SELECT kv.id AS key_vote_id, kv.topic_id, kv.lean, kv.title, kv.neutral_description,
           kv.source_url, kv.congress, kv.bill_type, kv.bill_number, b.id AS bill_id
    FROM public.poliscore_key_votes kv
    JOIN public.bills b
      ON b.congress = kv.congress
     AND lower(b.bill_type) = kv.bill_type
     AND b.bill_number = kv.bill_number
    WHERE kv.score_version = 'v0'
  ),
  fp AS (  -- final-passage roll call number per bill
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
