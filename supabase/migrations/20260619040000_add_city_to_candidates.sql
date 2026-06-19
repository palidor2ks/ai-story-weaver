-- Add city column to candidates table.
-- City officials get city name (e.g. 'Piscataway', 'Newark').
-- County-level officials get "X County" (e.g. 'Middlesex County').
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS city text;

-- Piscataway local officials
UPDATE candidates SET city = 'Piscataway' WHERE id IN (
  'seed_piscataway_mayor_1',
  'ai_a02fd188c5ae52fa5a98d2f3e812261d9a753533',
  'ai_d37fc8446d34a11102e2b9eaf1c44885de65f70c',
  'ai_25d68a2afa1eb9a3e14d7ae28966a9f6465741fe',
  'ai_60f0d161bf044f1619207cefad0cff4f1ebec7d9',
  'manual_betsy_aumack_piscataway_w2',
  'manual_rashaad_couloote_piscataway_w4',
  'manual_shantell_cherry_piscataway_w1',
  'manual_william_lawrence_piscataway_w1',
  'manual_viola_stone_piscataway_w3'
);

UPDATE candidates SET city = 'Newark' WHERE id = 'seed_newark_mayor_1';

-- Middlesex County officials
UPDATE candidates SET city = 'Middlesex County' WHERE id IN (
  'ai_f93b7e9b81c5becb28506e349d53ce4286f52e7a',
  'ai_3ff9ae5536f9b7aa5e3ed20bfe90fd931f25ad0d',
  'ai_850fe7d5a62d61012b9387e460a941f7e9e60fd6'
);

-- Rebuild get_visible_candidates to expose city
DROP FUNCTION IF EXISTS public.get_visible_candidates();

CREATE OR REPLACE FUNCTION public.get_visible_candidates()
RETURNS TABLE(
  id text, name text, party text, office text, state text, city text,
  district text, image_url text, overall_score numeric, coverage_tier text,
  confidence text, is_incumbent boolean, score_version text,
  last_updated timestamp with time zone, claimed_by_user_id uuid,
  claimed_at timestamp with time zone, fec_candidate_id text,
  last_donor_sync timestamp with time zone, person_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.id, c.name, c.party::text, c.office, c.state, c.city,
    c.district, c.image_url, c.overall_score, c.coverage_tier::text,
    c.confidence::text, c.is_incumbent, c.score_version, c.last_updated,
    c.claimed_by_user_id, c.claimed_at, c.fec_candidate_id,
    c.last_donor_sync, c.person_id
  FROM public.candidates c
  WHERE c.state NOT IN (SELECT state_code FROM public.hidden_states)
  ORDER BY c.name;
$$;
