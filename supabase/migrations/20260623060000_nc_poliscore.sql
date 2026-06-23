-- PoliScore for NC General Assembly state legislators (v0_nc).
--
-- Federal key votes are identified by (congress, bill_type, bill_number).
-- NC state key votes use the bridged bill_id directly (nc-2025-SB1080 etc.)
-- since NC bills carry no congress/bill_type/bill_number in our schema.
--
-- Lean is determined the same way as federal: party split on the final-passage
-- roll call (Republican Yea + Democrat Nay → 'right'; reverse → 'left').
-- NC final-passage = Third Reading vote; bicameral bills produce one
-- candidate_votes row per chamber (chamber discriminator added 2026-06-22).
-- The RPC selects the chamber row matching the legislator's office.
--
-- bill_id is a soft reference to bills.id (no FK constraint) so this migration
-- is safe on preview branches where the NC sync has not yet run.

CREATE TABLE IF NOT EXISTS public.poliscore_nc_key_votes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id             text    NOT NULL,   -- e.g. 'nc-2025-SB1080'; matches bills.id when synced
  session             text    NOT NULL DEFAULT '2025',
  topic_id            text    NOT NULL REFERENCES public.topics(id),
  lean                text    NOT NULL CHECK (lean IN ('left', 'right')),
  title               text,               -- NCGA short title (sponsor-assigned reference only)
  neutral_description text    NOT NULL,   -- canonical "what a Yea does", neutral
  source_url          text    NOT NULL,
  score_version       text    NOT NULL DEFAULT 'v0_nc',
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bill_id, score_version)
);

ALTER TABLE public.poliscore_nc_key_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "NC PoliScore key votes are publicly readable"
  ON public.poliscore_nc_key_votes FOR SELECT USING (true);

CREATE POLICY "Admins manage NC PoliScore key votes"
  ON public.poliscore_nc_key_votes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Starter seed: SB1080 (2025 session) — verified against NCGA roll call records.
-- Lean 'right': Republican caucus voted Yea; Democratic caucus voted Nay.
-- Additional key votes added by admin via DB insert as curation gate expands.
INSERT INTO public.poliscore_nc_key_votes (bill_id, session, topic_id, lean, title, neutral_description, source_url)
VALUES (
  'nc-2025-SB1080', '2025', 'economy-work', 'right',
  'Lower Taxes for All NC',
  'Reduce individual income tax rates, franchise taxes, and certain business taxes in North Carolina',
  'https://www.ncleg.gov/BillLookUp/2025/SB1080'
)
ON CONFLICT (bill_id, score_version) DO NOTHING;

-- RPC: returns the curated NC key votes with this legislator's position on each.
-- LEFT JOIN so every key vote appears even when the member did not vote (NULL position).
-- Chamber is derived from candidates.office so bicameral bills resolve to the correct row.
CREATE OR REPLACE FUNCTION public.get_poliscore_record_nc(p_candidate_id text)
RETURNS TABLE (
  key_vote_id         uuid,
  topic_id            text,
  lean                text,
  title               text,
  neutral_description text,
  source_url          text,
  bill_id             text,
  session             text,
  vote_position       text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH cand AS (
    SELECT CASE WHEN c.office = 'State Senator' THEN 'upper' ELSE 'lower' END AS chamber
    FROM public.candidates c WHERE c.id = p_candidate_id
  )
  SELECT kv.id AS key_vote_id, kv.topic_id, kv.lean, kv.title, kv.neutral_description,
         kv.source_url, kv.bill_id, kv.session, cv.position AS vote_position
  FROM public.poliscore_nc_key_votes kv
  CROSS JOIN cand
  LEFT JOIN public.candidate_votes cv
    ON cv.bill_id = kv.bill_id
   AND cv.candidate_id = p_candidate_id
   AND cv.jurisdiction = 'nc_state'
   AND cv.action_type = 'floor_vote'
   AND cv.chamber = cand.chamber
  WHERE kv.score_version = 'v0_nc'
$$;

GRANT EXECUTE ON FUNCTION public.get_poliscore_record_nc(text) TO anon, authenticated;
