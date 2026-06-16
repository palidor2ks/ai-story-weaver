-- PoliScore v0.0 — data-accuracy gate fixes (two blockers caught before launch).
--
-- 1) Cross-congress bill_id collision: candidate_votes reuses bill_id 'H R 26' for BOTH the
--    118th-Congress Born-Alive Abortion Survivors Protection Act AND the 119th-Congress
--    Protecting American Energy Production Act. The previous get_poliscore_record picked
--    max(vote_number) across ALL congresses, so the 119th Energy roll was wrongly attributed to
--    the 118th Born-Alive key vote (reported ~11 Democrats as Yea when they voted Nay).
--    FIX: scope the candidate_votes join to the key vote's Congress by date window.
--    A Congress N runs from Jan of year (1789 + (N-1)*2) for two years.
--
-- 2) HR288 (118th, Separation of Powers Restoration Act) had a source_url pointing at the
--    119th Congress (an unrelated bill). FIX: correct the URL.

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
           kv.source_url, kv.congress, kv.bill_type, kv.bill_number, b.id AS bill_id,
           (1789 + (kv.congress - 1) * 2) AS start_year
    FROM public.poliscore_key_votes kv
    JOIN public.bills b
      ON b.congress = kv.congress
     AND lower(b.bill_type) = kv.bill_type
     AND b.bill_number = kv.bill_number
    WHERE kv.score_version = 'v0'
  ),
  fp AS (  -- final-passage roll call number per bill, scoped to the key vote's Congress
    SELECT kb.bill_id, kb.start_year, max(cv.vote_number) AS fp_vote
    FROM kv_bill kb
    JOIN public.candidate_votes cv
      ON cv.bill_id = kb.bill_id
     AND cv.action_type = 'floor_vote'
     AND extract(year FROM cv.action_date) BETWEEN kb.start_year AND kb.start_year + 1
    GROUP BY kb.bill_id, kb.start_year
  )
  SELECT kb.key_vote_id, kb.topic_id, kb.lean, kb.title, kb.neutral_description,
         kb.source_url, kb.congress, kb.bill_type, kb.bill_number, cv.position AS vote_position
  FROM kv_bill kb
  JOIN fp ON fp.bill_id = kb.bill_id
  JOIN public.candidate_votes cv
    ON cv.bill_id = kb.bill_id
   AND cv.vote_number = fp.fp_vote
   AND cv.action_type = 'floor_vote'
   AND extract(year FROM cv.action_date) BETWEEN kb.start_year AND kb.start_year + 1
   AND cv.candidate_id = p_candidate_id;
$$;

UPDATE public.poliscore_key_votes
   SET source_url = 'https://www.congress.gov/bill/118th-congress/house-bill/288'
 WHERE congress = 118 AND bill_type = 'hr' AND bill_number = 288;
