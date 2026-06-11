-- Evidence index, production slice 1 (owner-approved option 2 — see
-- docs/answers-enrichment-part1b-plan.md §DECIDED and HANDOFF 2026-06-11 4th arc).
--
-- member_statements is the primary-source corpus of sitting members' official
-- statements (press releases etc.), the statements-equivalent of the bills corpus:
-- identity is structural (a member's .gov newsroom), text is held locally so citations
-- cannot rot or be fabricated. Filled by the fetch-member-statements drain (RSS-payload
-- bodies first; validated by the 2026-06-11 five-member spike).
--
-- Replay-safe on purpose (IF NOT EXISTS / drop-then-create policies): preview-branch
-- deploys replay migrations, and a bare CREATE TABLE has already flaked one (HANDOFF,
-- 20260107015931 / admin_stats_cache, 42P07).

create table if not exists public.member_statements (
  id uuid primary key default gen_random_uuid(),
  candidate_id text not null,           -- bioguide id for sitting members
  url text not null,
  title text,
  published_at timestamptz,
  published_at_raw text,                -- raw feed date string, kept for audit
  body_text text,
  body_source text not null default 'none'
    check (body_source in ('rss_payload', 'page_fetch', 'none')),
  body_chars int not null default 0,
  content_hash text,                    -- sha256(body_text) — dedupe & change detection
  source_feed text,                     -- feed or listing URL the item came from
  discovery_method text,                -- rss-advertised | rss-probed | html-listing
  http_status int,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (candidate_id, url)
);

create index if not exists member_statements_candidate_published
  on public.member_statements (candidate_id, published_at desc nulls last);

-- Per-member sync state, mirroring the vote_sync_status pattern.
create table if not exists public.member_statement_sync (
  candidate_id text primary key,
  site_url text,
  feed_url text,
  discovery_method text,
  last_sync_started_at timestamptz,
  last_sync_completed_at timestamptz,
  items_seen int,
  items_new int,
  sync_error text,
  updated_at timestamptz not null default now()
);

-- RLS: statements are public artifacts the app will surface — world-readable, writes
-- only via service role (no insert/update/delete policies). The sync table is
-- operational state: RLS on, no policies (service role bypasses).
alter table public.member_statements enable row level security;
alter table public.member_statement_sync enable row level security;

drop policy if exists "member_statements_public_read" on public.member_statements;
create policy "member_statements_public_read"
  on public.member_statements for select
  to anon, authenticated
  using (true);

-- Atomic work claim for the drain: seeds sync rows for sitting members (those with
-- actual vote records — the same definition every 2026-06-11 pipeline used), then
-- claims the stalest p_limit members (never-synced first), marking them started so
-- concurrent invocations cannot double-claim.
create or replace function public.claim_statement_sync_members(p_limit int default 4)
returns setof text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  insert into member_statement_sync (candidate_id)
  select distinct cv.candidate_id
  from candidate_votes cv
  where not exists (select 1 from member_statement_sync s where s.candidate_id = cv.candidate_id)
    and exists (select 1 from candidates c where c.id = cv.candidate_id)
  on conflict (candidate_id) do nothing;  -- concurrent seeders must not 23505 each other

  return query
  with claimed as (
    select s.candidate_id
    from member_statement_sync s
    where s.last_sync_started_at is null
       or s.last_sync_started_at < now() - interval '1 hour'  -- stuck claims expire
    order by s.last_sync_completed_at asc nulls first, s.candidate_id
    limit greatest(p_limit, 0)
    for update skip locked
  )
  update member_statement_sync s
     set last_sync_started_at = now(), updated_at = now()
    from claimed
   where s.candidate_id = claimed.candidate_id
  returning s.candidate_id;
end;
$$;

revoke all on function public.claim_statement_sync_members(int) from public, anon, authenticated;
grant execute on function public.claim_statement_sync_members(int) to service_role;
