-- Switch the daily social-post rotation to three candidate-anchored "follow the
-- money" angles, each highlighting a different verified finance fact about the
-- featured politician:
--   rep_profile        — their overall campaign-finance headline
--   committee_spender  — the biggest outside / Super-PAC spender for or against them
--   top_donor          — their single largest direct donor
-- (Drops ai_analysis from the rotation per the new money-focused direction; the
--  caption/render code still handles ai_analysis if it's ever re-added.)
update public.social_post_settings
  set rotation_types = ARRAY['rep_profile', 'committee_spender', 'top_donor'],
      rotation_index = 0
  where id = 1;

alter table public.social_post_settings
  alter column rotation_types set default ARRAY['rep_profile', 'committee_spender', 'top_donor'];
