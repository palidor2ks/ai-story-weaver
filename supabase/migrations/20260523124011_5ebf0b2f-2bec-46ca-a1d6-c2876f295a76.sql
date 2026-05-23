
UPDATE public.donors
SET is_contribution = false,
    is_vendor_refund = true
WHERE COALESCE(line_number, '') IN ('15','17','17A','17C')
  AND (is_contribution = true OR is_vendor_refund = false);

UPDATE public.donors
SET is_contribution = false
WHERE COALESCE(line_number, '') IN ('18','20A','21')
  AND is_contribution = true;
