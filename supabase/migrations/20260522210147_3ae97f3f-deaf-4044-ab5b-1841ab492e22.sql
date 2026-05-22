-- 1. Vendor refund organizations table
CREATE TABLE public.vendor_refund_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category text DEFAULT 'media',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_refund_organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor refund orgs are publicly readable"
  ON public.vendor_refund_organizations FOR SELECT USING (true);

CREATE POLICY "Admins manage vendor refund orgs"
  ON public.vendor_refund_organizations FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages vendor refund orgs"
  ON public.vendor_refund_organizations FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_vendor_refund_orgs_updated_at
  BEFORE UPDATE ON public.vendor_refund_organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Seed
INSERT INTO public.vendor_refund_organizations (name, category, notes) VALUES
  ('WATERFRONT STRATEGIES', 'media', 'Democratic media buying / ad placement firm'),
  ('GMMB', 'media', 'Media/advertising agency'),
  ('AL MEDIA', 'media', 'Media buying'),
  ('BULLY PULPIT INTERACTIVE', 'consulting', 'Digital/political consulting'),
  ('SKDK', 'consulting', 'SKDKnickerbocker comms/consulting'),
  ('SKDKNICKERBOCKER', 'consulting', 'SKDK alias'),
  ('MISSION CONTROL', 'media', 'Media/ad buying'),
  ('ASSEMBLE THE AGENCY', 'media', 'Ad agency'),
  ('CANAL PARTNERS MEDIA', 'media', 'Media buying'),
  ('BUYING TIME', 'media', 'Media buying'),
  ('PUTNAM PARTNERS', 'media', 'Media/ad consulting'),
  ('DEVINE MULVEY LONGABAUGH', 'media', 'Ad agency'),
  ('SCREEN STRATEGIES MEDIA', 'media', 'Media buying'),
  ('TRILOGY INTERACTIVE', 'consulting', 'Digital consulting'),
  ('MOTHERSHIP STRATEGIES', 'consulting', 'Digital fundraising/consulting');

-- 3. Donor flag
ALTER TABLE public.donors
  ADD COLUMN IF NOT EXISTS is_vendor_refund boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_donors_is_vendor_refund
  ON public.donors(is_vendor_refund) WHERE is_vendor_refund = true;

-- 4. Backfill
UPDATE public.donors d
SET is_vendor_refund = true
FROM public.vendor_refund_organizations v
WHERE v.is_active = true
  AND d.type = 'Organization'
  AND (d.line_number IN ('15','17') OR d.line_number IS NULL)
  AND upper(d.name) LIKE '%' || upper(v.name) || '%';

-- 5. Re-tag helper RPC (admin-only)
CREATE OR REPLACE FUNCTION public.retag_vendor_refunds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin required';
  END IF;

  -- Reset
  UPDATE public.donors SET is_vendor_refund = false WHERE is_vendor_refund = true;

  -- Re-apply
  WITH upd AS (
    UPDATE public.donors d
    SET is_vendor_refund = true
    FROM public.vendor_refund_organizations v
    WHERE v.is_active = true
      AND d.type = 'Organization'
      AND (d.line_number IN ('15','17') OR d.line_number IS NULL)
      AND upper(d.name) LIKE '%' || upper(v.name) || '%'
    RETURNING d.id
  )
  SELECT count(*) INTO updated_count FROM upd;

  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.retag_vendor_refunds() FROM public;
GRANT EXECUTE ON FUNCTION public.retag_vendor_refunds() TO authenticated;