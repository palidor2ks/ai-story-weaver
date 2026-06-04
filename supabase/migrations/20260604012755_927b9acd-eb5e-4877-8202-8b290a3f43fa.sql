
-- Restrict candidate_ingest_status to admins only (remove public read)
DROP POLICY IF EXISTS "Candidate ingest status readable by everyone" ON public.candidate_ingest_status;

-- Remove anonymous read on share_cards (only edge functions with service-role read it)
DROP POLICY IF EXISTS "share_cards public read" ON public.share_cards;

-- Pin search_path on the three flagged functions
ALTER FUNCTION public.fl_legislator_finance(text, text, text) SET search_path = public;
ALTER FUNCTION public.nj_legislator_finance(text, text, text) SET search_path = public;
ALTER FUNCTION public.ny_legislator_finance(text, text, text) SET search_path = public;
