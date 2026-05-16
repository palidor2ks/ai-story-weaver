UPDATE public.donor_aliases
SET canonical_name = 'ActBlue', updated_at = now()
WHERE id = 'd40bb2e9-74f1-4976-9f48-ccbad57046e3';

INSERT INTO public.donor_alias_members (alias_id, donor_name, donor_type)
SELECT 'd40bb2e9-74f1-4976-9f48-ccbad57046e3', d.name, d.type::text
FROM public.donors d
WHERE d.name = 'ActBlue' AND d.type::text = 'Organization'
ON CONFLICT DO NOTHING;

UPDATE public.donors d
SET display_name = 'ActBlue'
FROM public.donor_alias_members m
WHERE m.alias_id = 'd40bb2e9-74f1-4976-9f48-ccbad57046e3'
  AND d.name = m.donor_name
  AND d.type::text = m.donor_type
  AND d.display_name IS DISTINCT FROM 'ActBlue';