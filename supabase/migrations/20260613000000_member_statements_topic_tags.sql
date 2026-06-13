-- statement↔topic indexing: tag each member_statements row with the quiz topic_ids it
-- covers. This bridges the primary-source corpus to the alignment quiz, letting the
-- citation matcher efficiently retrieve topic-relevant statements per candidate.
--
-- Design (docs/answers-enrichment-part1b-plan.md §DECIDED):
--   • keyword-based tagging is intentionally broad (recall > precision) — the distiller in
--     match-answer-citations verifies actual stance, so a false-positive topic tag is fine.
--   • FTS GIN index supports on-the-fly keyword search in the matcher.
--   • trigger auto-tags rows as they arrive from the fetch-member-statements drain.
--   • initial UPDATE populates existing 5k+ rows (safe to re-run; idempotent).
--
-- Migration is replay-safe: IF NOT EXISTS + CREATE OR REPLACE throughout.

alter table public.member_statements
  add column if not exists topic_tags text[] not null default '{}';

create index if not exists idx_member_statements_topic_tags
  on public.member_statements using gin (topic_tags);

-- FTS on title + body for on-the-fly keyword matching in the citation matcher.
create index if not exists idx_member_statements_body_fts
  on public.member_statements
  using gin (to_tsvector('english',
    coalesce(title, '') || ' ' || coalesce(body_text, '')));

-- assign_statement_topics: pure keyword tagging — no LLM, immutable, deterministic.
-- Patterns are intentionally broad (substring, case-insensitive). The distiller in
-- match-answer-citations is responsible for stance verification; these tags only narrow
-- the search space. Local-* topics use narrow patterns because federal press releases
-- rarely address them directly.
create or replace function public.assign_statement_topics(p_text text)
returns text[]
language sql immutable strict
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    array_agg(distinct t.topic_id order by t.topic_id),
    '{}'::text[]
  )
  from (values
    ('economy-work',
     '(econom|employ|unemploy|\btax(es|ation|payer)?|wage|inflation|trade.?(deal|deficit|war)?|tariff|budget|fiscal|deficit|spending|manufactur|labor.union|small.?busi|financial.?regulat|treasury|appropriat|stimulus|supply.chain|job.creation|minimum.wage|income.gap|cost.of.living|bank.oversight|gdp)'),
    ('environment-energy',
     '(climat|clean.energy|renewable|fossil.fuel|carbon.emiss|greenhouse|epa\b|solar|wind.power|wildfire|sea.level|pollut|sustainab|green.new.deal|paris.accord|offshore.drill|coal.plant|pipeline|fracking|nuclear.power|flood.risk|drought|clean.air|clean.water)'),
    ('government-democracy',
     '(filibuster|election.integrit|voter.suppression|democrac|debt.ceiling|government.shutdown|appropriation|constitutional|oversight.of|amendment|gerrymander|campaign.finance|dark.money|lobbying|checks.and.balance|electoral|bipartisan|legislative.agenda|national.debt|government.spending)'),
    ('health-safety-net',
     '(health.?care|medicare|medicaid|affordable.care|aca\b|obamacare|prescription.drug|drug.price|opioid|fentanyl|mental.health|social.security|food.stamp|snap\b|welfare|student.loan|disability.benefit|child.tax.credit|earned.income|nutrition.assist|medicaid.expan|public.option|uninsured|nursing.home|veteran.health|maternal.health)'),
    ('national-security-borders',
     '(defense.spending|military|border.securit|immigration.enforce|national.security|nato\b|troops?|armed.forces|terrorism|isis\b|al.qaeda|china\b|russia\b|ukraine|nuclear.weapon|pentagon|air.force|\bnavy\b|\barmy\b|\bmarines?\b|coast.guard|veteran.benefit|foreign.policy|homeland.security|asylum|refugee|deportat|human.traffick|drug.traffick|\bsanctions\b|ukraine.aid|israel|hamas|taiwan|south.china.sea)'),
    ('rights-justice',
     '(abortion|reproductive.right|second.amendment|gun.control|gun.violence|lgbtq|transgender|police.reform|civil.right|criminal.justice|supreme.court|racial.justice|discriminat|privacy.right|equal.pay|affirmative.action|voting.right|due.process|mass.incarcerat|qualified.immunity|hate.crime|free.speech|religious.freedom|roe.v.wade|title.ix|ada\b|fair.sentencing)'),
    ('local-cost-of-living',
     '(cost.of.living|childcare.affordab|child.care.cost|utility.cost|commut|transit.afford|housing.cost|food.insecur)'),
    ('local-education',
     '(public.school.fund|k.?12.school|charter.school|school.voucher|higher.education.access|college.affordab|teacher.shortage|classroom.size|curriculum.stand)'),
    ('local-housing',
     '(affordable.housing|housing.shortage|zoning.reform|homeowner|mortgage.rate|eviction.protect|homelessness|rent.control|public.housing|housing.crisis)'),
    ('local-public-health',
     '(vaccin|pandemic.prepar|public.health.infra|hospital.closure|opioid.crisis|addiction.treatment|mental.health.crisis|uninsured.rate|maternal.mortal)'),
    ('local-public-safety',
     '(\bcrime.rate|public.safety.fund|law.enforcement.fund|fire.department|first.responder|emergency.service|community.policing|violent.crime)'))
  as t(topic_id, pattern)
  where p_text ~* t.pattern
$$;

revoke all on function public.assign_statement_topics(text) from public, anon, authenticated;
grant execute on function public.assign_statement_topics(text) to service_role;

-- Trigger: auto-tag on insert or body/title update.
create or replace function public.tg_member_statements_retag()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.topic_tags := public.assign_statement_topics(
    coalesce(new.title, '') || ' ' || coalesce(new.body_text, '')
  );
  return new;
end;
$$;

drop trigger if exists tg_member_statements_retag on public.member_statements;
create trigger tg_member_statements_retag
  before insert or update of title, body_text
  on public.member_statements
  for each row execute function public.tg_member_statements_retag();

-- Initial population of existing rows. Safe to re-run (idempotent).
update public.member_statements
set topic_tags = public.assign_statement_topics(
  coalesce(title, '') || ' ' || coalesce(body_text, '')
);
