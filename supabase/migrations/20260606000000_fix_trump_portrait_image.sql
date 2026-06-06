-- Fix: Donald Trump's portrait was not appearing on the Representatives card.
--
-- Migration 20260509213908 overwrote his image_url (in both `candidates` and
-- `candidate_overrides`) with a White House URL whose filename was malformed
-- (".png-1-1.jpg") on a host that blocks cross-origin hotlinking. The frontend
-- renders this URL directly in an <img>, so the request failed and the card
-- fell back to the red "DT" initials avatar.
--
-- Restore a working Wikimedia Commons portrait -- the same host used for every
-- other federal executive (Biden, Harris, Vance) and the value Trump carried
-- before the regression -- so the photo loads cross-origin without hotlink
-- protection.
UPDATE public.candidates
SET image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Donald_Trump_official_portrait.jpg/600px-Donald_Trump_official_portrait.jpg'
WHERE id = 'P80001571';

UPDATE public.candidate_overrides
SET image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Donald_Trump_official_portrait.jpg/600px-Donald_Trump_official_portrait.jpg'
WHERE candidate_id = 'P80001571' AND image_url IS NOT NULL;
