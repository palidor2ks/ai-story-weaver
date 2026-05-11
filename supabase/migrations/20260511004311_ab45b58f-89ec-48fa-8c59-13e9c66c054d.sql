
-- 1. civic_lookup_cache: restrict reads to admins/service_role only
DROP POLICY IF EXISTS "Cache is readable by authenticated users" ON public.civic_lookup_cache;

CREATE POLICY "Admins can view civic lookup cache"
  ON public.civic_lookup_cache FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. bill_ingestion_status: add explicit admin-only SELECT (in addition to existing ALL policies)
CREATE POLICY "Admins can view bill ingestion status"
  ON public.bill_ingestion_status FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. share_cards: keep public SELECT for unfurl crawlers, but hide user_id column from anon/authenticated
REVOKE SELECT (user_id) ON public.share_cards FROM anon, authenticated;
