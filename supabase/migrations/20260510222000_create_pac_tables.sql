-- Create pac_candidate_totals and pac_expenditures tables.
-- These tables exist in production but were never added to the migration chain,
-- causing _merge_candidate (called in 20260510223010) to fail on fresh replays
-- with "relation does not exist".
-- Using CREATE TABLE IF NOT EXISTS so this is safe to run on production too.

CREATE TABLE IF NOT EXISTS public.pac_candidate_totals (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    text        NOT NULL,
  candidate_name  text,
  committee_id    text        NOT NULL,
  committee_name  text,
  cycle           text        NOT NULL,
  support_total   numeric     NOT NULL DEFAULT 0,
  oppose_total    numeric     NOT NULL DEFAULT 0,
  total_spent     numeric     NOT NULL DEFAULT 0,
  support_ratio   numeric,
  oppose_ratio    numeric,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pac_candidate_totals_candidate
  ON public.pac_candidate_totals (candidate_id);
CREATE INDEX IF NOT EXISTS idx_pac_candidate_totals_committee_cycle
  ON public.pac_candidate_totals (committee_id, cycle);

ALTER TABLE public.pac_candidate_totals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pac_candidate_totals public read" ON public.pac_candidate_totals;
CREATE POLICY "pac_candidate_totals public read"
  ON public.pac_candidate_totals FOR SELECT USING (true);

GRANT SELECT ON public.pac_candidate_totals TO anon, authenticated;
GRANT ALL    ON public.pac_candidate_totals TO service_role;


CREATE TABLE IF NOT EXISTS public.pac_expenditures (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id          text,
  candidate_name        text,
  committee_id          text        NOT NULL,
  committee_name        text,
  cycle                 text        NOT NULL,
  support_oppose        text        NOT NULL,
  total_amount          numeric     NOT NULL DEFAULT 0,
  expenditure_count     integer     NOT NULL DEFAULT 0,
  fec_candidate_id      text,
  last_expenditure_date date,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pac_expenditures_candidate
  ON public.pac_expenditures (candidate_id);
CREATE INDEX IF NOT EXISTS idx_pac_expenditures_committee_cycle
  ON public.pac_expenditures (committee_id, cycle);

ALTER TABLE public.pac_expenditures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pac_expenditures public read" ON public.pac_expenditures;
CREATE POLICY "pac_expenditures public read"
  ON public.pac_expenditures FOR SELECT USING (true);

GRANT SELECT ON public.pac_expenditures TO anon, authenticated;
GRANT ALL    ON public.pac_expenditures TO service_role;
