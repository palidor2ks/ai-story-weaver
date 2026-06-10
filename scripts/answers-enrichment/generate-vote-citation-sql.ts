/**
 * Generates the SQL for the vote-derived citation enrichment (answers push, part 1).
 *
 * Usage:  bun scripts/answers-enrichment/generate-vote-citation-sql.ts <step>
 *   step = staging | verify | apply-tier1 | apply-tier2 | measure | cleanup
 *
 * Prints SQL to stdout. Run it via psql when SUPABASE_DB_URL is available, or
 * statement-by-statement via the Supabase MCP `execute_sql` from an agent session
 * (each `-- >>>` block stays under the MCP 60s statement budget; a giant single
 * CTAS does not — learned the hard way on 2026-06-10).
 * Read README.md in this directory for the full ritual (verify BEFORE apply).
 *
 * What it does (all read-only on candidate_answers until apply-*):
 *  - Tier 1: answers whose own source_description already names a bill (quoted
 *    "<...> Act/Resolution" titles, or explicit H.R./S./H.Res... numbers) get that
 *    bill's Congress.gov URL — but ONLY if candidate_votes confirms the member
 *    actually sponsored/cosponsored/voted on that exact bill.
 *  - Tier 2: answers on questions covered by question-bill-keywords.ts get URLs of
 *    bills the member sponsored/cosponsored whose titles match the rule keywords,
 *    ONLY when the rule's axis equals sign(answer_value) (sign-consistency guard).
 *    Floor votes are deliberately excluded from tier 2: procedural Nay votes are
 *    indistinguishable from passage votes in candidate_votes (part 1b decision).
 *
 * Accuracy guards baked in after sample verification on 2026-06-10:
 *  - CONGRESS-CONSISTENCY: every action date on a (member, bill) pair must fall
 *    within the bill's labeled congress (±1yr slack). 39% of raw pairs failed this
 *    — bills-table id collisions / congress mislabels attach actions to the wrong
 *    bill row — and would have produced wrong-bill URLs (e.g. a "congress 119"
 *    HR 4682 with a 2006 cosponsorship).
 *  - CRA disapproval resolutions are excluded from keyword matching: their long
 *    official titles contain keyword text with INVERTED intent ("...Repeal of the
 *    Affordable Clean Energy Rule" matched 'clean energy').
 *  - Vote-action junk names ("On Agreeing to the Amendment") are excluded, and
 *    tier-2 display titles come from the keyword-matched bills row, not whichever
 *    duplicate row min() happened to pick.
 *  - Only rows with source_type='voting_record' and NO existing URL are touched;
 *    apply never overwrites a populated source_url/source_urls (idempotent).
 */

import { QUESTION_BILL_KEYWORDS, BILL_TYPE_SLUGS } from './question-bill-keywords';

const CANONICAL_TYPES = Object.keys(BILL_TYPE_SLUGS)
  .map((t) => `'${t}'`)
  .join(', ');

const sqlLit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** congress ordinal + slug → https://www.congress.gov/bill/118th-congress/house-bill/1234 */
const URL_EXPR = `
  'https://www.congress.gov/bill/' || congress::text ||
  case when congress % 100 between 11 and 13 then 'th'
       when congress % 10 = 1 then 'st'
       when congress % 10 = 2 then 'nd'
       when congress % 10 = 3 then 'rd'
       else 'th' end || '-congress/' ||
  case upper(bill_type)
${Object.entries(BILL_TYPE_SLUGS)
  .map(([t, slug]) => `    when '${t}' then '${slug}'`)
  .join('\n')}
  end || '/' || bill_number::text`;

/** lower, collapse spaces, strip trailing " of <year>", strip leading "the " */
const normExpr = (x: string) =>
  `trim(regexp_replace(regexp_replace(regexp_replace(lower(${x}), '\\s+', ' ', 'g'), ' of (19|20)[0-9]{2}$', ''), '^the ', ''))`;

const ELIGIBLE = `
    ca.source_type = 'voting_record'
    and ca.source_url is null
    and coalesce(array_length(ca.source_urls, 1), 0) = 0`;

const RANK_AND_AGG = (auditKeyExpr: string) => `
ranked as (
  select *,
         row_number() over (partition by candidate_id, question_id
                            order by strength desc, last_action desc nulls last) as rn,
${URL_EXPR} as url
  from deduped
)
select candidate_id, question_id,
       array_agg(url order by rn) as urls,
       array_agg(name order by rn) as titles,
       count(*) as n_cites,
       jsonb_agg(jsonb_build_object(
         'congress', congress, 'bill', bill_type || ' ' || bill_number,
         'action', best_action, 'last_action', last_action, ${auditKeyExpr}
       ) order by rn) as audit
from ranked
where rn <= 3
group by candidate_id, question_id`;

function stagingSql(): string {
  const keywordRows = QUESTION_BILL_KEYWORDS.flatMap((rule) =>
    rule.keywords.map((kw) => `(${sqlLit(rule.questionId)}, ${rule.axis}, ${sqlLit(kw.toLowerCase())})`),
  );

  return `-- ===== answers enrichment part 1: STAGING (read-only on candidate_answers) =====

-- >>> 1. keyword rules
drop table if exists _enrich_vc_keywords;
create unlogged table _enrich_vc_keywords (
  question_id text not null,
  axis int not null check (axis in (-1, 1)),
  keyword text not null
);
revoke all on _enrich_vc_keywords from anon, authenticated;
insert into _enrich_vc_keywords (question_id, axis, keyword) values
${keywordRows.join(',\n')};

-- >>> 2. member ↔ bill pairs, CONGRESS-CONSISTENT only (see header)
drop table if exists _enrich_member_bills;
create unlogged table _enrich_member_bills as
with raw as (
  select cv.candidate_id,
         b.congress, upper(b.bill_type) as bill_type, b.bill_number,
         min(b.name) as name,
         ${normExpr('min(b.name)')} as norm_name,
         max(case cv.action_type when 'sponsor' then 3 when 'cosponsor' then 2 else 1 end) as strength,
         min(cv.action_date) as first_action,
         max(cv.action_date) as last_action,
         (array_agg(cv.action_type order by case cv.action_type when 'sponsor' then 3 when 'cosponsor' then 2 else 1 end desc))[1] as best_action
  from candidate_votes cv
  join bills b on b.id = cv.bill_id
  where upper(b.bill_type) in (${CANONICAL_TYPES})
    and b.bill_number is not null
    and b.congress between 93 and 130
  group by cv.candidate_id, b.congress, upper(b.bill_type), b.bill_number
)
select * from raw
where first_action::date >= make_date(1787 + 2*congress - 1, 1, 1)
  and last_action::date  <= make_date(1787 + 2*congress + 2, 12, 31);
revoke all on _enrich_member_bills from anon, authenticated;
analyze _enrich_member_bills;
create index on _enrich_member_bills (candidate_id);
create index on _enrich_member_bills (candidate_id, bill_type, bill_number);
create index on _enrich_member_bills (candidate_id, norm_name);

-- >>> 3. bill references extracted from answer descriptions (tier-1 anchors)
drop table if exists _enrich_refs;
create unlogged table _enrich_refs as
with targets as (
  select ca.candidate_id, ca.question_id, ca.source_description
  from candidate_answers ca
  where ${ELIGIBLE}
    and ca.source_description is not null
    and ca.candidate_id in (select distinct candidate_id from _enrich_member_bills)
)
select candidate_id, question_id, 'title' as ref_kind,
       ${normExpr('m[1]')} as norm_ref,
       null::text as ref_type, null::int as ref_number
from targets t,
lateral regexp_matches(t.source_description, '''([^'']{3,140}?(?:Act|Resolution)(?: of (?:19|20)[0-9]{2})?)''', 'g') m
union all
select candidate_id, question_id, 'number' as ref_kind,
       null::text as norm_ref,
       upper(regexp_replace(m[1], '[^A-Za-z]', '', 'g')) as ref_type,
       m[2]::int as ref_number
from targets t,
lateral regexp_matches(t.source_description,
  '\\m(H\\.? ?J\\.? ?Res\\.?|S\\.? ?J\\.? ?Res\\.?|H\\.? ?Con\\.? ?Res\\.?|S\\.? ?Con\\.? ?Res\\.?|H\\.? ?Res\\.?|S\\.? ?Res\\.?|H\\.? ?R\\.?|S\\.) ?([0-9]{1,5})\\M', 'g') m;
revoke all on _enrich_refs from anon, authenticated;
analyze _enrich_refs;

-- >>> 4. keyword ↔ bill matches (tier-2 anchors)
drop table if exists _enrich_bill_kw;
create unlogged table _enrich_bill_kw as
select k.question_id, k.axis,
       b.congress, upper(b.bill_type) as bill_type, b.bill_number,
       min(b.name) as name,
       min(k.keyword) as matched_keyword
from bills b
join _enrich_vc_keywords k on b.name ilike '%' || k.keyword || '%'
where upper(b.bill_type) in (${CANONICAL_TYPES})
  and b.bill_number is not null
  and b.congress between 93 and 130
  and b.name not ilike '%congressional disapproval%'   -- CRA disapprovals invert keyword intent
  and b.name !~* '^on (agreeing|motion|passage)'       -- vote-action junk masquerading as a name
group by k.question_id, k.axis, b.congress, upper(b.bill_type), b.bill_number;
revoke all on _enrich_bill_kw from anon, authenticated;
analyze _enrich_bill_kw;

-- >>> 5. tier 1: description-anchored citations
drop table if exists _enrich_vc_tier1;
create unlogged table _enrich_vc_tier1 as
with resolved_titles as (
  select distinct r.candidate_id, r.question_id, mb.congress, mb.bill_type, mb.bill_number,
         mb.name, mb.strength, mb.last_action, mb.best_action, 'title' as ref_kind
  from _enrich_refs r
  join _enrich_member_bills mb
    on mb.candidate_id = r.candidate_id
   and mb.norm_name = r.norm_ref
  where r.ref_kind = 'title'
),
resolved_numbers as (
  select distinct candidate_id, question_id, congress, bill_type, bill_number,
         name, strength, last_action, best_action, 'number' as ref_kind
  from (
    select r.candidate_id, r.question_id, mb.congress, mb.bill_type, mb.bill_number,
           mb.name, mb.strength, mb.last_action, mb.best_action,
           count(*) over (partition by r.candidate_id, r.question_id, r.ref_type, r.ref_number) as n_matches
    from (select distinct candidate_id, question_id, ref_type, ref_number from _enrich_refs where ref_kind = 'number') r
    join _enrich_member_bills mb
      on mb.candidate_id = r.candidate_id
     and mb.bill_type = r.ref_type
     and mb.bill_number = r.ref_number
  ) z
  where n_matches = 1  -- member acted on this type+number in exactly one congress, else ambiguous
),
all_refs as (
  select * from resolved_titles
  union all
  select * from resolved_numbers
),
deduped as (
  select distinct on (candidate_id, question_id, congress, bill_type, bill_number)
         candidate_id, question_id, congress, bill_type, bill_number,
         name, strength, last_action, best_action, ref_kind
  from all_refs
  order by candidate_id, question_id, congress, bill_type, bill_number, strength desc
),
${RANK_AND_AGG(`'ref_kind', ref_kind`)};
revoke all on _enrich_vc_tier1 from anon, authenticated;

-- >>> 6. tier 2: sponsor/cosponsor actions on keyword-matched bills, sign-consistent
drop table if exists _enrich_vc_tier2;
create unlogged table _enrich_vc_tier2 as
with targets as (
  select ca.candidate_id, ca.question_id, sign(ca.answer_value) as answer_sign
  from candidate_answers ca
  where ${ELIGIBLE}
    and ca.answer_value <> 0
    and ca.candidate_id in (select distinct candidate_id from _enrich_member_bills)
),
hits as (
  -- kw.name (the row that matched the keyword), NOT mb.name: duplicate bills rows
  -- can carry junk names and min() may pick one
  select t.candidate_id, t.question_id, kw.congress, kw.bill_type, kw.bill_number,
         kw.name, mb.strength, mb.last_action, mb.best_action, kw.matched_keyword
  from targets t
  join _enrich_bill_kw kw
    on kw.question_id = t.question_id
   and kw.axis = t.answer_sign  -- sign-consistency guard
  join _enrich_member_bills mb
    on mb.candidate_id = t.candidate_id
   and mb.congress = kw.congress
   and mb.bill_type = kw.bill_type
   and mb.bill_number = kw.bill_number
   and mb.strength >= 2          -- sponsor/cosponsor only, no floor votes
),
deduped as (
  select distinct on (candidate_id, question_id, congress, bill_type, bill_number)
         candidate_id, question_id, congress, bill_type, bill_number,
         name, strength, last_action, best_action, matched_keyword
  from hits
  order by candidate_id, question_id, congress, bill_type, bill_number, strength desc
),
${RANK_AND_AGG(`'keyword', matched_keyword`)};
revoke all on _enrich_vc_tier2 from anon, authenticated;

-- >>> 7. staging summary
select 'tier1' as tier, count(*) as answers, coalesce(sum(n_cites),0) as citations,
       count(distinct candidate_id) as candidates, count(distinct question_id) as questions
from _enrich_vc_tier1
union all
select 'tier2', count(*), coalesce(sum(n_cites),0), count(distinct candidate_id), count(distinct question_id)
from _enrich_vc_tier2;`;
}

function verifySql(): string {
  return `-- ===== VERIFY (run + eyeball BEFORE apply; see README.md) =====
-- Tier 1 sample: the description should itself name the cited bill.
select c.name as candidate, s.question_id, s.titles, s.audit,
       substring(ca.source_description, 1, 260) as description
from _enrich_vc_tier1 s
join candidate_answers ca using (candidate_id, question_id)
join candidates c on c.id = s.candidate_id
order by random() limit 10;

-- Tier 2 sample: bill title must plausibly support the answer's direction
-- (answer_value < 0 = left, > 0 = right; src/lib/scoring.ts).
select s.candidate_id, c.name as candidate, s.question_id, q.text as question,
       ca.answer_value, s.titles, s.urls, s.audit
from _enrich_vc_tier2 s
join candidate_answers ca using (candidate_id, question_id)
join candidates c on c.id = s.candidate_id
join questions q on q.id = s.question_id
order by random() limit 15;

-- No staged row may target an answer that already has a URL (must return 0).
select count(*) as collisions
from (select candidate_id, question_id from _enrich_vc_tier1
      union all
      select candidate_id, question_id from _enrich_vc_tier2) s
join candidate_answers ca using (candidate_id, question_id)
where ca.source_url is not null or coalesce(array_length(ca.source_urls, 1), 0) > 0;

-- URL shape check (must return 0).
select count(*) as bad_urls
from (select unnest(urls) as url from _enrich_vc_tier1
      union all
      select unnest(urls) from _enrich_vc_tier2) u
where url !~ '^https://www\\.congress\\.gov/bill/[0-9]{2,3}(st|nd|rd|th)-congress/[a-z-]+/[0-9]{1,5}$';

-- Tier overlap (informational; tier 1 applies first and wins).
select count(*) as overlap
from _enrich_vc_tier1 t1 join _enrich_vc_tier2 t2 using (candidate_id, question_id);`;
}

function applySql(tier: 1 | 2): string {
  return `-- ===== APPLY tier ${tier} (idempotent; never overwrites an existing URL) =====
with updated as (
  update candidate_answers ca
  set source_url = s.urls[1],
      source_urls = s.urls,
      source_titles = s.titles,
      updated_at = now()
  from _enrich_vc_tier${tier} s
  where ca.candidate_id = s.candidate_id
    and ca.question_id = s.question_id
    and ${ELIGIBLE}
  returning ca.id
)
select count(*) as tier${tier}_rows_updated from updated;`;
}

function measureSql(): string {
  return `-- ===== MEASURE: the DATA-ACCURACY §Answers number (sourcedWithUrl) =====
select count(*) as total_answers,
       count(*) filter (where source_url is not null or coalesce(array_length(source_urls,1),0) > 0) as sourced_with_url,
       round(100.0 * count(*) filter (where source_url is not null or coalesce(array_length(source_urls,1),0) > 0) / count(*), 2) as pct
from candidate_answers;
-- then push it to the dashboard/scoreboard:
select refresh_admin_stats_cache(array['candidate_answer_stats']);`;
}

function cleanupSql(): string {
  return `-- ===== CLEANUP (after apply is verified) =====
drop table if exists _enrich_vc_keywords;
drop table if exists _enrich_member_bills;
drop table if exists _enrich_refs;
drop table if exists _enrich_bill_kw;
drop table if exists _enrich_vc_tier1;
drop table if exists _enrich_vc_tier2;`;
}

const step = process.argv[2];
const steps: Record<string, () => string> = {
  staging: stagingSql,
  verify: verifySql,
  'apply-tier1': () => applySql(1),
  'apply-tier2': () => applySql(2),
  measure: measureSql,
  cleanup: cleanupSql,
};

if (!step || !steps[step]) {
  console.error(`usage: bun ${process.argv[1]} <${Object.keys(steps).join(' | ')}>`);
  process.exit(1);
}
console.log(steps[step]());
