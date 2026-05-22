
-- 1) Causes taxonomy
CREATE TABLE public.committee_causes (
  id text PRIMARY KEY,
  label text NOT NULL,
  stance text NOT NULL CHECK (stance IN ('pro','anti','neutral')),
  issue text NOT NULL,
  quiz_topic_id text NOT NULL REFERENCES public.topics(id),
  description text,
  aliases text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','rejected')),
  created_by text NOT NULL DEFAULT 'seed' CHECK (created_by IN ('seed','ai','admin')),
  approved_by uuid,
  ai_reasoning text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_committee_causes_status ON public.committee_causes(status);
CREATE INDEX idx_committee_causes_quiz_topic ON public.committee_causes(quiz_topic_id);

ALTER TABLE public.committee_causes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Committee causes are viewable by everyone"
  ON public.committee_causes FOR SELECT USING (true);

CREATE POLICY "Admins can manage committee causes"
  ON public.committee_causes FOR ALL
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Service role can manage committee causes"
  ON public.committee_causes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_committee_causes_updated_at
  BEFORE UPDATE ON public.committee_causes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Repoint committee_topics from quiz topics -> causes
DELETE FROM public.committee_topics;

ALTER TABLE public.committee_topics RENAME COLUMN primary_topic_id TO primary_cause_id;
ALTER TABLE public.committee_topics RENAME COLUMN secondary_topic_ids TO secondary_cause_ids;

ALTER TABLE public.committee_topics
  ADD CONSTRAINT committee_topics_primary_cause_fk
  FOREIGN KEY (primary_cause_id) REFERENCES public.committee_causes(id) ON DELETE RESTRICT;

-- 3) Seed causes
INSERT INTO public.committee_causes (id, label, stance, issue, quiz_topic_id, description) VALUES
  ('pro-israel','Pro-Israel','pro','Israel','foreign-affairs','Supports strong US-Israel alliance and aid'),
  ('pro-palestine','Pro-Palestine','pro','Palestine','foreign-affairs','Supports Palestinian statehood and rights'),
  ('hawkish','Hawkish / Pro-Military','pro','Military strength','defense','Supports increased defense spending and military intervention'),
  ('dovish','Dovish / Anti-War','anti','Military intervention','defense','Opposes military intervention abroad'),
  ('pro-ukraine','Pro-Ukraine Aid','pro','Ukraine','foreign-affairs','Supports US aid to Ukraine'),
  ('anti-china','Anti-CCP / China-Hawk','anti','China','foreign-affairs','Hawkish toward the Chinese Communist Party'),

  ('pro-gun','Pro-Gun Rights','pro','Gun rights','civil-rights','Second Amendment / opposes gun restrictions'),
  ('pro-gun-control','Pro-Gun Control','pro','Gun control','civil-rights','Supports gun safety regulations'),

  ('pro-choice','Pro-Choice','pro','Abortion rights','civil-rights','Supports abortion access'),
  ('pro-life','Pro-Life','anti','Abortion','civil-rights','Opposes abortion'),

  ('pro-lgbtq','Pro-LGBTQ Rights','pro','LGBTQ rights','civil-rights','Supports LGBTQ equality and protections'),
  ('anti-lgbtq','Anti-LGBTQ','anti','LGBTQ rights','civil-rights','Opposes LGBTQ legal protections'),

  ('pro-labor','Pro-Labor / Union','pro','Labor unions','economy','Backs labor unions and worker organizing'),
  ('anti-union','Anti-Union / Right-to-Work','anti','Labor unions','economy','Opposes union power'),

  ('pro-crypto','Pro-Crypto','pro','Cryptocurrency','technology','Supports crypto-friendly regulation'),
  ('anti-crypto','Anti-Crypto','anti','Cryptocurrency','technology','Supports stricter crypto regulation'),
  ('pro-tech','Pro-Tech Industry','pro','Tech industry','technology','Generally pro-tech-industry positions'),
  ('anti-big-tech','Anti-Big-Tech','anti','Big Tech','technology','Supports breaking up or regulating Big Tech'),

  ('pro-fossil-fuel','Pro-Fossil Fuel','pro','Oil & gas','environment','Supports fossil fuel industry and production'),
  ('pro-climate-action','Pro-Climate Action','pro','Climate change','environment','Supports aggressive climate policy'),
  ('anti-climate-regulation','Anti-Climate-Regulation','anti','Climate regulation','environment','Opposes climate regulations'),
  ('pro-conservation','Pro-Conservation','pro','Conservation','environment','Supports land and wildlife conservation'),

  ('anti-tax','Anti-Tax','anti','Taxes','economy','Opposes tax increases; supports cuts'),
  ('pro-progressive-tax','Pro-Progressive Taxation','pro','Progressive taxes','economy','Supports higher taxes on wealth/corporations'),
  ('pro-business','Pro-Business','pro','Business interests','economy','General pro-business / pro-deregulation'),
  ('pro-consumer','Pro-Consumer Protection','pro','Consumer rights','economy','Supports consumer financial protections'),

  ('pro-immigration','Pro-Immigration','pro','Immigration','immigration','Supports expanded legal immigration / immigrant rights'),
  ('anti-immigration','Anti-Immigration','anti','Immigration','immigration','Supports immigration restriction and stricter enforcement'),

  ('pro-medicare-for-all','Pro-Medicare-for-All','pro','Single-payer healthcare','healthcare','Supports single-payer / universal healthcare'),
  ('pro-aca','Pro-ACA','pro','Affordable Care Act','healthcare','Supports the Affordable Care Act'),
  ('anti-aca','Anti-ACA','anti','Affordable Care Act','healthcare','Opposes the Affordable Care Act'),
  ('pro-pharma','Pro-Pharma','pro','Pharmaceutical industry','healthcare','Aligned with pharmaceutical industry interests'),

  ('pro-public-education','Pro-Public-Education','pro','Public schools','education','Supports public school funding and teachers'),
  ('pro-school-choice','Pro-School-Choice','pro','School choice','education','Supports vouchers, charters, school choice'),

  ('pro-criminal-justice-reform','Pro-Criminal-Justice Reform','pro','Criminal justice reform','judicial','Supports reducing incarceration and reform'),
  ('pro-law-enforcement','Pro-Law-Enforcement','pro','Law enforcement','judicial','Supports police and tough-on-crime policies'),

  ('pro-social-security','Pro-Social-Security / Medicare','pro','Entitlement protection','social-programs','Protects Social Security and Medicare benefits'),
  ('pro-welfare-reform','Pro-Welfare-Reform','anti','Welfare expansion','social-programs','Supports cutting / reforming welfare programs'),

  ('pro-trump','Pro-Trump / MAGA','pro','Trump movement','government','Aligned with Donald Trump and MAGA movement'),
  ('anti-trump','Anti-Trump','anti','Trump movement','government','Opposes Donald Trump'),
  ('conservative','Conservative (general)','neutral','Conservative ideology','government','Generic conservative / Republican-aligned'),
  ('progressive','Progressive (general)','neutral','Progressive ideology','government','Generic progressive / Democratic-aligned'),
  ('libertarian','Libertarian','neutral','Libertarianism','government','Libertarian / limited-government orientation');
