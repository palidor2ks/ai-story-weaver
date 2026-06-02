-- candidate_committees is defined canonically in 20251224120000_candidate_committees.sql.
-- This migration aligns that table (idempotently), enables RLS + policies, adds the
-- donors.is_transfer flag, and creates supporting indexes. The CREATE TABLE below
-- mirrors the canonical definition (same columns, inline FK, no UNIQUE table
-- constraint — uniqueness is provided by idx_candidate_committees_unique) so the
-- resulting schema is identical regardless of which migration runs first.
CREATE TABLE IF NOT EXISTS public.candidate_committees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id text NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  fec_committee_id text NOT NULL,
  role text DEFAULT 'authorized', -- 'principal', 'authorized', 'joint'
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Safety net: ensure updated_at exists even if an older revision of this table
-- (without the column) was created in some environment before this migration.
ALTER TABLE public.candidate_committees
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Enable RLS
ALTER TABLE public.candidate_committees ENABLE ROW LEVEL SECURITY;

-- Public read access (idempotent: drop before create so replays don't hit 42710)
DROP POLICY IF EXISTS "Committee mappings are viewable by everyone" ON public.candidate_committees;
CREATE POLICY "Committee mappings are viewable by everyone"
  ON public.candidate_committees FOR SELECT
  USING (true);

-- Admin management (idempotent)
DROP POLICY IF EXISTS "Admins can manage committee mappings" ON public.candidate_committees;
CREATE POLICY "Admins can manage committee mappings"
  ON public.candidate_committees FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add is_transfer flag to donors table
ALTER TABLE public.donors
ADD COLUMN IF NOT EXISTS is_transfer boolean DEFAULT false;

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_candidate_committees_candidate
  ON public.candidate_committees(candidate_id);

CREATE INDEX IF NOT EXISTS idx_candidate_committees_committee
  ON public.candidate_committees(fec_committee_id);

CREATE INDEX IF NOT EXISTS idx_donors_is_transfer
  ON public.donors(is_transfer) WHERE is_transfer = true;
