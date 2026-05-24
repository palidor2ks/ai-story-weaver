
INSERT INTO public.vendor_refund_organizations (name, is_active)
VALUES ('GAMBIT STRATEGIES', true)
ON CONFLICT DO NOTHING;

DELETE FROM public.contributions WHERE line_number LIKE '20%';
DELETE FROM public.donors WHERE line_number LIKE '20%';

UPDATE public.donors d
   SET is_vendor_refund = true
  FROM public.vendor_refund_organizations v
 WHERE v.is_active = true
   AND d.type = 'Organization'
   AND (d.line_number IN ('14','15','17') OR d.line_number IS NULL)
   AND upper(d.name) LIKE '%' || upper(v.name) || '%'
   AND d.is_vendor_refund = false;
