-- Voting-record citation tables (part 2 of answers-enrichment).
-- docs/answers-enrichment-part2-plan.md
--
-- question_bill_map: maps quiz questions to specific congressional roll call votes.
-- member_votes: cache of parsed roll call positions keyed by bioguide_id.
--
-- Roll call numbers verified against clerk.house.gov/Votes/YYYYNNN.
-- All 9 initial bills cover 19 quiz questions across economy/environment/healthcare.

-- ────────────────────────────────────────────────────────────────────────────
-- question_bill_map
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.question_bill_map (
  id                  bigserial primary key,
  question_id         text      not null references questions(id),
  congress            int       not null,
  bill_type           text      not null,  -- HR, S, HRES, SRES, HJRES, SJRES
  bill_number         int       not null,
  bill_title          text      not null,
  roll_call_number    int,                 -- null = needs lookup; set before running fetch script
  roll_call_year      int,                 -- calendar year of the roll call vote
  chamber             text      not null check (chamber in ('house','senate')),
  yea_is_conservative boolean   not null,  -- TRUE = YES vote maps to right-lean on -10..+10 scale
  notes               text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_qbm_question_id
  on public.question_bill_map(question_id);
create index if not exists idx_qbm_roll_call
  on public.question_bill_map(congress, chamber, roll_call_number)
  where roll_call_number is not null;

alter table public.question_bill_map enable row level security;

create policy "question_bill_map_read_all"
  on public.question_bill_map for select
  using (true);

-- ────────────────────────────────────────────────────────────────────────────
-- member_votes
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.member_votes (
  candidate_id   text        not null,           -- bioguide_id; no FK (XML has all 435 members)
  congress       int         not null,
  chamber        text        not null check (chamber in ('house','senate')),
  roll_call      int         not null,
  bill_id        text,                            -- e.g. 'HR5376-117'
  position       text        not null,            -- 'Yea'|'Nay'|'Not Voting'|'Present'
  source_url     text,                            -- clerk.house.gov or senate.gov roll call URL
  fetched_at     timestamptz not null default now(),
  primary key (candidate_id, congress, chamber, roll_call)
);

create index if not exists idx_member_votes_candidate
  on public.member_votes(candidate_id);

alter table public.member_votes enable row level security;

create policy "member_votes_read_all"
  on public.member_votes for select
  using (true);

-- ────────────────────────────────────────────────────────────────────────────
-- Seed: question_bill_map (19 mappings across 9 bills)
-- ────────────────────────────────────────────────────────────────────────────

-- H.R.3684 — Infrastructure Investment and Jobs Act (IIJA) 2021
-- House final passage Roll 369, Nov 5 2021, 117th Congress, 228–206
-- Covers: infrastructure spending (×2), broadband, drinking water
insert into public.question_bill_map
  (question_id, congress, bill_type, bill_number, bill_title,
   roll_call_number, roll_call_year, chamber, yea_is_conservative, notes)
values
  ('economy-q8',     117, 'HR', 3684, 'Infrastructure Investment and Jobs Act', 369, 2021, 'house', false,
   'IIJA general infra investment; YES=support gov spending=progressive'),
  ('economy-q20',    117, 'HR', 3684, 'Infrastructure Investment and Jobs Act', 369, 2021, 'house', false,
   'IIJA general infra investment; YES=support gov spending=progressive'),
  ('technology-q2',  117, 'HR', 3684, 'Infrastructure Investment and Jobs Act', 369, 2021, 'house', false,
   'IIJA §60102 $65B broadband access fund; YES=expand broadband funding=progressive'),
  ('environment-q19',117, 'HR', 3684, 'Infrastructure Investment and Jobs Act', 369, 2021, 'house', false,
   'IIJA $55B water/lead-pipe provisions; YES=more water infra funding=progressive');

-- H.R.5376 — Inflation Reduction Act 2022 (IRA)
-- House final passage Roll 394, Aug 12 2022, 117th Congress, 220–207 party-line
-- Covers: renewable energy, oil/gas, emissions, methane, high-income tax,
--         corporate tax, Medicare drug negotiation, out-of-pocket cap
insert into public.question_bill_map
  (question_id, congress, bill_type, bill_number, bill_title,
   roll_call_number, roll_call_year, chamber, yea_is_conservative, notes)
values
  ('environment-q7',  117, 'HR', 5376, 'Inflation Reduction Act of 2022', 394, 2022, 'house', false,
   'IRA §13101-13802 clean energy tax credits; YES=expand renewable subsidies=progressive'),
  ('environment-q8',  117, 'HR', 5376, 'Inflation Reduction Act of 2022', 394, 2022, 'house', false,
   'IRA overall energy bill; YES=progressive energy policy direction'),
  ('environment-q9',  117, 'HR', 5376, 'Inflation Reduction Act of 2022', 394, 2022, 'house', false,
   'IRA EPA enforcement funding + power sector incentives; YES=stricter standards=progressive'),
  ('environment-q10', 117, 'HR', 5376, 'Inflation Reduction Act of 2022', 394, 2022, 'house', false,
   'IRA §60113 methane emissions reduction fees; YES=limit methane=progressive'),
  ('economy-q18',     117, 'HR', 5376, 'Inflation Reduction Act of 2022', 394, 2022, 'house', false,
   'IRA 15% corp min tax + IRS enforcement; YES=raise taxes on high earners=progressive'),
  ('economy-q19',     117, 'HR', 5376, 'Inflation Reduction Act of 2022', 394, 2022, 'house', false,
   'IRA 15% corporate alternative minimum tax on book income; YES=increase corp tax=progressive'),
  ('healthcare-q12',  117, 'HR', 5376, 'Inflation Reduction Act of 2022', 394, 2022, 'house', false,
   'IRA §11001 Medicare drug price negotiation authority; YES=allow Medicare negotiation=progressive'),
  ('healthcare-q13',  117, 'HR', 5376, 'Inflation Reduction Act of 2022', 394, 2022, 'house', false,
   'IRA §11002 $2,000 Medicare out-of-pocket annual cap; YES=cap costs=progressive');

-- H.R.4346 — CHIPS and Science Act 2022
-- House final passage Roll 404, Jul 28 2022, 117th Congress, 243–187
insert into public.question_bill_map
  (question_id, congress, bill_type, bill_number, bill_title,
   roll_call_number, roll_call_year, chamber, yea_is_conservative, notes)
values
  ('technology-q12', 117, 'HR', 4346, 'CHIPS and Science Act of 2022', 404, 2022, 'house', false,
   'CHIPS §10201 $52B domestic semiconductor manufacturing; YES=increase chip investment=progressive');

-- H.R.842 — Protecting the Right to Organize Act (PRO Act) 117th
-- House passage Roll 70, Mar 9 2021, 117th Congress, 225–206 party-line
insert into public.question_bill_map
  (question_id, congress, bill_type, bill_number, bill_title,
   roll_call_number, roll_call_year, chamber, yea_is_conservative, notes)
values
  ('economy-q16', 117, 'HR', 842, 'Protecting the Right to Organize Act of 2021', 70, 2021, 'house', false,
   'PRO Act strengthened NLRA protections; YES=make it easier to unionize=progressive');

-- H.R.582 — Raise the Wage Act 116th Congress
-- House passage Roll 496, Jul 18 2019, 116th Congress, 231–199
-- Note: H.R.603 (117th) never came to a House floor vote; 116th version is the roll call proxy.
insert into public.question_bill_map
  (question_id, congress, bill_type, bill_number, bill_title,
   roll_call_number, roll_call_year, chamber, yea_is_conservative, notes)
values
  ('economy-q15', 116, 'HR', 582, 'Raise the Wage Act', 496, 2019, 'house', false,
   '116th version used; H.R.603 117th never voted; YES=increase federal minimum wage=progressive');

-- H.R.1319 — American Rescue Plan Act 2021 (ARP)
-- House final passage (motion to concur) Roll 72, Mar 10 2021, 117th Congress, 220–211
insert into public.question_bill_map
  (question_id, congress, bill_type, bill_number, bill_title,
   roll_call_number, roll_call_year, chamber, yea_is_conservative, notes)
values
  ('economy-q10', 117, 'HR', 1319, 'American Rescue Plan Act of 2021', 72, 2021, 'house', false,
   'ARP expanded UI, direct payments, state fiscal aid = stronger automatic stabilizers; YES=progressive');

-- H.R.1628 — American Health Care Act 2017 (AHCA)
-- House passage Roll 256, May 4 2017, 115th Congress, 217–213 (R only)
-- YES = repeal/replace ACA = LESS public health insurance = conservative
insert into public.question_bill_map
  (question_id, congress, bill_type, bill_number, bill_title,
   roll_call_number, roll_call_year, chamber, yea_is_conservative, notes)
values
  ('healthcare-q11', 115, 'HR', 1628, 'American Health Care Act of 2017', 256, 2017, 'house', true,
   'AHCA repealed ACA Medicaid expansion + subsidies; YES=reduce public health insurance access=conservative');

-- H.R.1 — Tax Cuts and Jobs Act 2017 (TCJA)
-- House final passage Roll 699, Dec 20 2017, 115th Congress, 224–201 (R only)
-- YES = cut high-income and corporate taxes = conservative
-- Note: also mapped to economy-q18/q19 via IRA (opposite direction) for 117th members.
insert into public.question_bill_map
  (question_id, congress, bill_type, bill_number, bill_title,
   roll_call_number, roll_call_year, chamber, yea_is_conservative, notes)
values
  ('economy-q18', 115, 'HR', 1, 'Tax Cuts and Jobs Act', 699, 2017, 'house', true,
   'TCJA cut top marginal rate + pass-through deduction; YES=cut high-income taxes=conservative'),
  ('economy-q19', 115, 'HR', 1, 'Tax Cuts and Jobs Act', 699, 2017, 'house', true,
   'TCJA cut corporate rate 35%→21%; YES=cut corporate taxes=conservative');

-- S.2155 — Economic Growth, Regulatory Relief, and Consumer Protection Act 2018
-- House passage Roll 216, May 22 2018, 115th Congress, 258–159 (bipartisan)
-- YES = roll back Dodd-Frank = less bank oversight = conservative
insert into public.question_bill_map
  (question_id, congress, bill_type, bill_number, bill_title,
   roll_call_number, roll_call_year, chamber, yea_is_conservative, notes)
values
  ('economy-q11', 115, 'S', 2155, 'Economic Growth, Regulatory Relief, and Consumer Protection Act', 216, 2018, 'house', true,
   'S.2155 raised SIFI threshold $50B→$250B; YES=less bank oversight=conservative'),
  ('economy-q12', 115, 'S', 2155, 'Economic Growth, Regulatory Relief, and Consumer Protection Act', 216, 2018, 'house', true,
   'S.2155 loosened Volcker Rule for small banks; YES=less commercial/investment separation=conservative');
