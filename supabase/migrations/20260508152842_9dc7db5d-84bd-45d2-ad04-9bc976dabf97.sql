-- 1. Remove junk override rows (no name + no office)
DELETE FROM public.candidate_overrides
WHERE name IS NULL AND office IS NULL;

-- 2. Prevent future junk rows
ALTER TABLE public.candidate_overrides
  ADD CONSTRAINT candidate_overrides_name_not_null CHECK (name IS NOT NULL) NOT VALID;

-- 3. Backfill federal executive portraits (Wikimedia Commons official portraits)
UPDATE public.candidates SET image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Donald_Trump_official_portrait.jpg/600px-Donald_Trump_official_portrait.jpg'
WHERE id = 'P80001571';

UPDATE public.candidates SET image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Joe_Biden_presidential_portrait.jpg/600px-Joe_Biden_presidential_portrait.jpg'
WHERE id = 'P80000722';

UPDATE public.candidates SET image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Kamala_Harris_Vice_Presidential_Portrait.jpg/600px-Kamala_Harris_Vice_Presidential_Portrait.jpg'
WHERE id = 'P00009423';

UPDATE public.candidates SET image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/JD_Vance_Vice_Presidential_Portrait.jpg/600px-JD_Vance_Vice_Presidential_Portrait.jpg'
WHERE id = 'V000137';

-- 4. Backfill Piscataway mayor portrait
UPDATE public.candidate_overrides
  SET image_url = 'https://www.piscatawaynj.org/ImageRepository/Document?documentID=10678'
WHERE candidate_id = 'mayor_nj_piscataway';