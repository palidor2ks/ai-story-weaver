-- Server-side cache for Congress member data fetched from GitHub's
-- congress-legislators project. Avoids cold-starting the fetch-representatives
-- edge function on every user's first visit — DB read is ~100 ms vs 2-4 s.
CREATE TABLE IF NOT EXISTS public.congress_members (
  bioguide_id  text        PRIMARY KEY,
  name         text        NOT NULL,
  party        text        NOT NULL,
  office       text        NOT NULL,
  state        text        NOT NULL,
  district     text,
  image_url    text        NOT NULL DEFAULT '',
  is_incumbent boolean     NOT NULL DEFAULT true,
  overall_score numeric,
  coverage_tier text       NOT NULL DEFAULT 'tier_3',
  confidence   text        NOT NULL DEFAULT 'low',
  synced_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.congress_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "congress_members_public_read"
  ON public.congress_members
  FOR SELECT
  USING (true);

-- RPC that returns cached rows younger than 25 hours.
-- Returns nothing (triggering edge-function fallback) when cache is stale.
CREATE OR REPLACE FUNCTION public.get_all_congress_members()
RETURNS TABLE(
  bioguide_id   text,
  name          text,
  party         text,
  office        text,
  state         text,
  district      text,
  image_url     text,
  is_incumbent  boolean,
  overall_score numeric,
  coverage_tier text,
  confidence    text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    bioguide_id, name, party, office, state, district,
    image_url, is_incumbent, overall_score, coverage_tier, confidence
  FROM public.congress_members
  WHERE synced_at > now() - interval '25 hours'
  ORDER BY name;
$$;
