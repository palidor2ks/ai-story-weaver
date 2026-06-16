-- PoliScore v0.0 — the curated "key votes" rubric.
-- Each row is one substantive, named, single-subject FINAL-PASSAGE roll call used to score the
-- NC + NJ congressional delegations. `lean` is derived OBJECTIVELY from the delegation's party split
-- on the final-passage roll call (Democrats Yea + Republicans Nay => 'left'; reverse => 'right');
-- it is NOT a judgment of the bill. `neutral_description` is canonical; the sponsor `title` is shown
-- only as labeled reference. Direction/topic were verified against Congress.gov (2026-06-16).
-- See docs/poliscore-methodology.md and docs/poliscore-key-votes-draft.md.
--
-- NOTE: the scored roll call is the final-passage vote = max(vote_number) per bill at compute time;
-- this table stores the rubric (which bills count + their lean), not per-member results.

CREATE TABLE IF NOT EXISTS public.poliscore_key_votes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congress            integer NOT NULL,
  bill_type           text    NOT NULL,
  bill_number         integer NOT NULL,
  topic_id            text    NOT NULL REFERENCES public.topics(id),
  lean                text    NOT NULL CHECK (lean IN ('left', 'right')),
  title               text,              -- sponsor-assigned official short title (reference only)
  neutral_description text    NOT NULL,  -- canonical "what a Yea does", neutral
  source_url          text    NOT NULL,
  score_version       text    NOT NULL DEFAULT 'v0',
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (congress, bill_type, bill_number, score_version)
);

ALTER TABLE public.poliscore_key_votes ENABLE ROW LEVEL SECURITY;

-- Public reference data (no PII): the rubric is meant to be public and auditable.
CREATE POLICY "PoliScore key votes are publicly readable"
  ON public.poliscore_key_votes FOR SELECT USING (true);

-- Writes via service role (bypasses RLS) or admins only.
CREATE POLICY "Admins manage PoliScore key votes"
  ON public.poliscore_key_votes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed: 28 curated key votes (HR2483 excluded as bipartisan/low-signal).
INSERT INTO public.poliscore_key_votes
  (congress, bill_type, bill_number, topic_id, lean, title, neutral_description, source_url)
VALUES
  -- Economy & Work
  (118,'hr',23,'economy-work','right','Family and Small Business Taxpayer Protection Act','Rescind certain unobligated IRA funds for IRS enforcement, operations, and direct-file','https://www.congress.gov/bill/118th-congress/house-bill/23'),
  (119,'hr',2965,'economy-work','right','Small Business Regulatory Reduction Act','Cap the SBA small-business regulatory cost budget at no greater than zero; report compliance costs','https://www.congress.gov/bill/119th-congress/house-bill/2965'),
  (118,'hr',1163,'economy-work','right','Protecting Taxpayers and Victims of Unemployment Fraud Act','Let states retain a share of recovered UI overpayments; extend the fraud statute of limitations to 10 years','https://www.congress.gov/bill/118th-congress/house-bill/1163'),
  (119,'hr',5408,'economy-work','left','Faster Labor Contracts Act','Impose deadlines for first-contract bargaining, then mediation and binding arbitration','https://www.congress.gov/bill/119th-congress/house-bill/5408'),
  (119,'hr',2312,'economy-work','left','Tipped Employee Protection Act','Protect tipped-worker wage rules','https://www.congress.gov/bill/119th-congress/house-bill/2312'),
  (119,'hr',2550,'economy-work','left','Protect America''s Workforce Act','Restore certain union/labor protections','https://www.congress.gov/bill/119th-congress/house-bill/2550'),
  -- Environment & Energy
  (119,'hr',4758,'environment-energy','right','Homeowner Energy Freedom Act','Repeal DOE home-electrification rebate and building-energy-code programs; rescind unobligated funds','https://www.congress.gov/bill/119th-congress/house-bill/4758'),
  (119,'hr',1366,'environment-energy','right','Mining Regulatory Clarity Act','Allow hardrock mining ancillary use of federal land regardless of mineral presence','https://www.congress.gov/bill/119th-congress/house-bill/1366'),
  (118,'hr',4468,'environment-energy','right','Choice in Automobile Retail Sales Act','Bar the EPA from enforcing certain MY2027+ vehicle-emissions rules that limit gas-car availability','https://www.congress.gov/bill/118th-congress/house-bill/4468'),
  (119,'hr',1346,'environment-energy','right','Nationwide Consumer and Fuel Retailer Choice Act','Allow year-round sales of E15 (higher-ethanol) gasoline','https://www.congress.gov/bill/119th-congress/house-bill/1346'),
  -- National Security & Borders
  (118,'hr',2,'national-security-borders','right','Secure the Border Act','Resume border-wall construction; raise the asylum standard; expand detention and expedited removal','https://www.congress.gov/bill/118th-congress/house-bill/2'),
  (119,'hr',30,'national-security-borders','right','Preventing Violence Against Women by Illegal Aliens Act','Make noncitizens with sex-offense, domestic-violence, or stalking convictions inadmissible and deportable','https://www.congress.gov/bill/119th-congress/house-bill/30'),
  (119,'hr',2056,'national-security-borders','right','DC Federal Immigration Compliance Act','Bar DC sanctuary policies that limit cooperation with federal immigration enforcement','https://www.congress.gov/bill/119th-congress/house-bill/2056'),
  (119,'hr',2913,'national-security-borders','left','Ukraine Support Act','Continue U.S. support for Ukraine','https://www.congress.gov/bill/119th-congress/house-bill/2913'),
  -- Rights & Justice
  (119,'hr',28,'rights-justice','right','Protection of Women and Girls in Sports Act','Define sex under Title IX as determined at birth; bar athletes assigned male at birth from female-designated school sports','https://www.congress.gov/bill/119th-congress/house-bill/28'),
  (119,'hr',1041,'rights-justice','right','Veterans 2nd Amendment Protection Act','Require a judicial danger finding before the VA reports a beneficiary to the firearms background-check system','https://www.congress.gov/bill/119th-congress/house-bill/1041'),
  (118,'hr',26,'rights-justice','right','Born-Alive Abortion Survivors Protection Act','Require medical care for an infant born alive after an attempted abortion; impose criminal penalties on providers who fail to provide it','https://www.congress.gov/bill/118th-congress/house-bill/26'),
  -- Health, Education & Welfare
  (119,'hr',6359,'health-safety-net','right','Pregnant Students'' Rights Act','Require colleges to inform students of rights and resources for carrying a pregnancy to term','https://www.congress.gov/bill/119th-congress/house-bill/6359'),
  (119,'hr',498,'health-safety-net','right','Do No Harm in Medicaid Act','Bar federal Medicaid payment for specified gender-transition procedures for individuals under 18','https://www.congress.gov/bill/119th-congress/house-bill/498'),
  (118,'hr',485,'health-safety-net','right','Protecting Health Care for All Patients Act','Bar federal health programs from using quality-adjusted life years (QALYs) in coverage decisions','https://www.congress.gov/bill/118th-congress/house-bill/485'),
  (119,'hr',6703,'health-safety-net','right','Lower Health Care Premiums for All Americans Act','Establish association-health-plan rules and pharmacy-benefit-manager contract standards','https://www.congress.gov/bill/119th-congress/house-bill/6703'),
  (118,'hr',497,'health-safety-net','right','Freedom for Health Care Workers Act','Repeal and block the HHS COVID-19 vaccination mandate for Medicare/Medicaid providers','https://www.congress.gov/bill/118th-congress/house-bill/497'),
  (119,'hr',2270,'health-safety-net','left','Empowering Employer Child and Elder Care Solutions Act','Support employer-provided child- and elder-care benefits','https://www.congress.gov/bill/119th-congress/house-bill/2270'),
  -- Government & Democracy
  (119,'hr',4,'government-democracy','right','Rescissions Act of 2025','Cancel ~$6.9B in unobligated budget authority across multiple accounts, per a presidential rescission request','https://www.congress.gov/bill/119th-congress/house-bill/4'),
  (119,'hr',884,'government-democracy','right','Prohibit noncitizen voting in DC','Bar noncitizens from voting in DC local elections; repeal DC''s 2022 law','https://www.congress.gov/bill/119th-congress/house-bill/884'),
  (119,'hr',5125,'government-democracy','right','DC Judicial Nominations Reform Act','End the DC Judicial Nomination Commission; give the President sole authority to appoint DC judges','https://www.congress.gov/bill/119th-congress/house-bill/5125'),
  (118,'hr',288,'government-democracy','right','Separation of Powers Restoration Act','Require de novo judicial review of agency legal interpretations (end Chevron deference)','https://www.congress.gov/bill/118th-congress/house-bill/288'),
  (119,'hjres',72,'government-democracy','left','Terminating a national emergency declaration','Disapprove a presidential national-emergency declaration','https://www.congress.gov/bill/119th-congress/house-joint-resolution/72')
ON CONFLICT (congress, bill_type, bill_number, score_version) DO NOTHING;
