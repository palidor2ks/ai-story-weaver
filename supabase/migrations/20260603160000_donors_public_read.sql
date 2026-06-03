-- Allow anonymous (public) visitors to read the donors table.
--
-- The `donors` table holds public FEC campaign-finance records that the app
-- already exposes publicly via SECURITY DEFINER RPCs (get_donors_paginated,
-- get_donor_cycles). However its RLS only granted SELECT to `authenticated`,
-- so any *direct* anonymous query returned zero rows. That left the public
-- donor explorer's filter options empty for anonymous visitors -- notably the
-- cycle dropdown and the "Donor State" dropdown, which read `donors` directly.
--
-- This adds a public-read policy mirroring the existing "public read" policies
-- on sibling public tables (e.g. news_articles, share_cards). It exposes no new
-- data, since the same rows are already retrievable through the RPCs.

DROP POLICY IF EXISTS "donors public read" ON public.donors;

CREATE POLICY "donors public read"
  ON public.donors
  FOR SELECT
  TO anon
  USING (true);
