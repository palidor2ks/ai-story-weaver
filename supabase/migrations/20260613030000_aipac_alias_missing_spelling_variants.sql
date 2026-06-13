-- Attach missing AIPAC spelling variants to the AIPAC donor alias.
--
-- Why: donor aliases consolidate by an EXACT (donor_name, donor_type) member
-- list (donor_alias_members), not a wildcard pattern. That is deliberate — a
-- naive '%aipac%' match would wrongly merge the opposing committee
-- "CITIZENS AGAINST AIPAC CORRUPTION" into AIPAC. The tradeoff is that every
-- new raw FEC spelling has to be attached by hand.
--
-- A handful of legitimate AIPAC spellings were never attached, so their stored
-- donors.display_name kept the raw FEC name. The most visible case: Ben Cline
-- (C001118) 2024-cycle rows resolve to "AIPAC", but his 2026 contribution is
-- filed under the truncated spelling "AMERICAN ISRAEL PUBLIC AFFAIRS COMMITTEE
-- POLITICAL" (drops "ACTION COMMITTEE"). The stat card defaults to the latest
-- cycle, so it surfaced the un-aliased 2026 row and showed the full raw name
-- instead of "AIPAC".
--
-- These four (name, type) pairs are all unambiguously AIPAC. The anti-AIPAC
-- committee is intentionally NOT in this list.
-- Idempotent: ON CONFLICT on the (donor_name, donor_type) unique key.

-- 1. Attach the missing spelling variants as members of the AIPAC alias.
INSERT INTO public.donor_alias_members (alias_id, donor_name, donor_type)
SELECT a.id, v.donor_name, v.donor_type
FROM public.donor_aliases a
CROSS JOIN (VALUES
  ('AMERICAN ISRAEL PUBLIC AFFAIRS COMMITTEE POLITICAL',                  'PAC'),
  ('AMERICAN ISRAEL PUBLIC AFFAIRS COMMITTEE PAC',                        'Organization'),
  ('AMERICAN ISRAEL PUBLIC AFFAIRS COMMITTEE POLITICAL ACTION COMMITTEE, JUSTIN', 'PAC'),
  ('AMERICAN ISRAEL PUBLIC AFFAIRS COMMITTEE POLITICAL ACTION FUND',      'PAC')
) AS v(donor_name, donor_type)
WHERE a.canonical_name = 'AIPAC' AND a.is_active = true
ON CONFLICT (donor_name, donor_type) DO NOTHING;

-- 2. Backfill stored display_name on the federal donor rows so the stat card,
--    profile list, and captions all read "AIPAC" for these spellings.
UPDATE public.donors d
SET display_name = a.canonical_name
FROM public.donor_alias_members m
JOIN public.donor_aliases a ON a.id = m.alias_id AND a.is_active = true
WHERE a.canonical_name = 'AIPAC'
  AND d.name = m.donor_name
  AND d.type::text = m.donor_type
  AND d.display_name IS DISTINCT FROM a.canonical_name;

-- NOTE: refresh the donor-explorer consolidation MVs for the change to show in
-- the consolidated donor views (the candidate stat card reads donors directly,
-- so it updates immediately):
--   SELECT public.refresh_donor_consolidated_mv();
