-- Industry-specific business causes.
--
-- The generic "Pro-Business" cause was being assigned to single-industry donor
-- entities and committees (e.g. the National Association of Realtors -> real
-- estate) where a more precise, industry-specific cause is warranted. Seed the
-- major industry money blocs so both the AI classifiers and admins can pick a
-- specific cause, and reserve "Pro-Business" for broad cross-industry coalitions.

INSERT INTO public.committee_causes (id, label, stance, issue, quiz_topic_id, description, created_by) VALUES
  ('pro-real-estate',        'Pro-Real Estate',         'pro', 'Real estate industry',  'economy-work',              'Aligned with real estate, homebuilder, and realtor interests (e.g. National Association of Realtors)', 'seed'),
  ('pro-finance',            'Pro-Finance / Banking',   'pro', 'Finance & banking',      'economy-work',              'Aligned with bank, securities, and investment industry interests', 'seed'),
  ('pro-insurance',          'Pro-Insurance Industry',  'pro', 'Insurance industry',     'economy-work',              'Aligned with insurance carrier and agent interests', 'seed'),
  ('pro-agriculture',        'Pro-Agriculture',         'pro', 'Agriculture industry',   'economy-work',              'Aligned with agribusiness, farm, and commodity interests', 'seed'),
  ('pro-telecom',            'Pro-Telecom',             'pro', 'Telecom industry',       'economy-work',              'Aligned with telecom, cable, and broadband interests', 'seed'),
  ('pro-manufacturing',      'Pro-Manufacturing',       'pro', 'Manufacturing industry', 'economy-work',              'Aligned with manufacturing and industrial interests', 'seed'),
  ('pro-gaming',             'Pro-Gaming / Casino',     'pro', 'Gaming industry',        'economy-work',              'Aligned with casino, gaming, and hospitality interests', 'seed'),
  ('pro-healthcare-industry','Pro-Healthcare Industry', 'pro', 'Healthcare industry',    'health-safety-net',         'Aligned with hospital, physician, and provider interests (distinct from pharma)', 'seed'),
  ('pro-defense-industry',   'Pro-Defense Industry',    'pro', 'Defense industry',       'national-security-borders', 'Aligned with defense contractor and aerospace industry interests', 'seed'),
  ('pro-trial-lawyers',      'Pro-Trial-Lawyers',       'pro', 'Trial lawyers / tort',   'rights-justice',            'Aligned with the plaintiffs'' bar; opposes tort and liability limits', 'seed')
ON CONFLICT (id) DO NOTHING;

-- Reserve the generic bucket for genuinely cross-industry coalitions so it is no
-- longer the default landing spot for single-industry donors and committees.
UPDATE public.committee_causes
SET description = 'Broad, cross-industry business coalitions only (e.g. U.S. Chamber of Commerce, Business Roundtable). For a single industry, use the specific industry cause instead.'
WHERE id = 'pro-business';
