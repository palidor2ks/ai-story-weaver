-- Merge 3 WFWA donor name variants under one alias with FEC ID anchor
DO $$
DECLARE
  v_alias_id uuid;
BEGIN
  -- Upsert alias canonical name
  SELECT id INTO v_alias_id FROM public.donor_aliases
   WHERE canonical_name = 'Working for Working Americans' LIMIT 1;

  IF v_alias_id IS NULL THEN
    INSERT INTO public.donor_aliases (canonical_name, is_active, fec_committee_id, notes)
    VALUES ('Working for Working Americans', true, 'C00490847',
            'LIUNA-affiliated federal PAC based in Las Vegas, NV')
    RETURNING id INTO v_alias_id;
  ELSE
    UPDATE public.donor_aliases
       SET fec_committee_id = COALESCE(fec_committee_id, 'C00490847'),
           is_active = true,
           updated_at = now()
     WHERE id = v_alias_id;
  END IF;

  -- Attach all 3 name variants as PAC members (idempotent)
  INSERT INTO public.donor_alias_members (alias_id, donor_name, donor_type)
  VALUES
    (v_alias_id, 'WORKING FOR WORKING AMERICANS', 'PAC'),
    (v_alias_id, 'WORKING FOR WORKING AMERICANS - FEDERAL', 'PAC'),
    (v_alias_id, 'WORKING FOR WORKING AMERICANS FEDERAL', 'PAC')
  ON CONFLICT DO NOTHING;

  -- Normalize donors.display_name for those rows
  UPDATE public.donors
     SET display_name = 'Working for Working Americans'
   WHERE (name, type::text) IN (
     ('WORKING FOR WORKING AMERICANS', 'PAC'),
     ('WORKING FOR WORKING AMERICANS - FEDERAL', 'PAC'),
     ('WORKING FOR WORKING AMERICANS FEDERAL', 'PAC')
   )
     AND COALESCE(display_name, '') <> 'Working for Working Americans';
END $$;