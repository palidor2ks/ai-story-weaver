-- Cron + pipeline health RPCs for the Coverage & Finance Dashboard.
--
-- Two layers of "job health":
--   1. pg_cron run history (cron.job / cron.job_run_details) — attempts &
--      failures of each scheduled job. The cron schema is NOT exposed to
--      PostgREST, so these SECURITY DEFINER wrappers are the only safe way to
--      read it from the client.
--   2. Rep-level failures from the domain tables the cron jobs feed. Cron runs
--      almost always "succeed" at the HTTP level even when an individual
--      representative fails downstream, so this is where "which rep failed and
--      why" actually lives.
--
-- All functions are admin-guarded via public.has_role(auth.uid(), 'admin').

-- 1a. Per-job run summary over the last N days.
create or replace function public.get_cron_job_health(p_days integer default 7)
returns table (
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  total_runs integer,
  succeeded integer,
  failed integer,
  last_run timestamptz,
  last_status text,
  avg_duration_seconds numeric
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden: admin role required';
  end if;

  return query
  select
    j.jobid,
    j.jobname,
    j.schedule,
    j.active,
    count(d.runid)::int,
    count(*) filter (where d.status = 'succeeded')::int,
    count(*) filter (where d.status = 'failed')::int,
    max(d.start_time),
    (array_agg(d.status order by d.start_time desc nulls last))[1],
    round(avg(extract(epoch from (d.end_time - d.start_time)))::numeric, 2)
  from cron.job j
  left join cron.job_run_details d
    on d.jobid = j.jobid
   and d.start_time > now() - make_interval(days => greatest(p_days, 1))
  group by j.jobid, j.jobname, j.schedule, j.active
  order by count(*) filter (where d.status = 'failed') desc, j.jobname;
end;
$$;

-- 1b. Recent failed runs for a single job (the cron-level error messages).
create or replace function public.get_cron_job_failures(p_jobname text, p_limit integer default 20)
returns table (
  runid bigint,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  return_message text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden: admin role required';
  end if;

  return query
  select d.runid, d.start_time, d.end_time, d.status, d.return_message
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
  where j.jobname = p_jobname
    and d.status = 'failed'
  order by d.start_time desc
  limit greatest(p_limit, 1);
end;
$$;

-- 2a. Rolled-up count of rep-level failures per pipeline source.
create or replace function public.get_pipeline_failure_summary()
returns table (
  source text,
  label text,
  failure_count integer,
  last_failed_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden: admin role required';
  end if;

  return query
  select 'legislation_sync'::text, 'Legislation sync'::text,
         count(*)::int, max(v.updated_at)
  from public.vote_sync_status v
  where v.sync_error is not null
  union all
  select 'floor_votes_sync', 'Floor votes sync',
         count(*)::int, max(v.updated_at)
  from public.vote_sync_status v
  where v.floor_vote_sync_error is not null
  union all
  select 'fec_reconciliation', 'FEC reconciliation',
         count(*)::int, max(fr.checked_at)
  from public.finance_reconciliation fr
  where fr.status = 'error'
  union all
  select 'mayor_discovery', 'Mayor discovery',
         count(*)::int, max(m.last_attempted_at)
  from public.mayor_fetch_queue m
  where m.status = 'failed' or m.error is not null
  union all
  select 'dead_letter', 'Dead-letter jobs',
         count(*)::int, max(dl.failed_at)
  from public.job_dead_letters dl;
end;
$$;

-- 2b. The individual reps that failed for a given pipeline source.
create or replace function public.get_pipeline_failures(p_source text, p_limit integer default 100)
returns table (
  rep_id text,
  rep_name text,
  state text,
  cycle text,
  reason text,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden: admin role required';
  end if;

  if p_source = 'legislation_sync' then
    return query
    select v.candidate_id, coalesce(c.name, v.candidate_id), c.state, null::text,
           v.sync_error, v.updated_at
    from public.vote_sync_status v
    left join public.candidates c on c.id = v.candidate_id
    where v.sync_error is not null
    order by v.updated_at desc nulls last
    limit greatest(p_limit, 1);

  elsif p_source = 'floor_votes_sync' then
    return query
    select v.candidate_id, coalesce(c.name, v.candidate_id), c.state, null::text,
           v.floor_vote_sync_error, v.updated_at
    from public.vote_sync_status v
    left join public.candidates c on c.id = v.candidate_id
    where v.floor_vote_sync_error is not null
    order by v.updated_at desc nulls last
    limit greatest(p_limit, 1);

  elsif p_source = 'fec_reconciliation' then
    return query
    select fr.candidate_id, coalesce(c.name, fr.candidate_id), c.state, fr.cycle,
           coalesce(
             nullif(fr.notes, ''),
             'Δ ' || coalesce(round(fr.total_receipts_delta_pct, 1)::text, '?')
               || '% vs FEC $' || coalesce(to_char(fr.fec_total_receipts, 'FM999,999,999'), '?')
           ),
           fr.checked_at
    from public.finance_reconciliation fr
    left join public.candidates c on c.id = fr.candidate_id
    where fr.status = 'error'
    order by abs(coalesce(fr.total_receipts_delta_amount, 0)) desc
    limit greatest(p_limit, 1);

  elsif p_source = 'mayor_discovery' then
    return query
    select coalesce(m.resulting_candidate_id, m.city || ', ' || m.state),
           m.city || ', ' || m.state, m.state, null::text,
           coalesce(m.error, 'status: ' || m.status), m.last_attempted_at
    from public.mayor_fetch_queue m
    where m.status = 'failed' or m.error is not null
    order by m.last_attempted_at desc nulls last
    limit greatest(p_limit, 1);

  elsif p_source = 'dead_letter' then
    return query
    select coalesce(dl.payload ->> 'candidate_id', dl.job_type),
           coalesce(dl.payload ->> 'name', dl.job_type), null::text, null::text,
           dl.last_error, dl.failed_at
    from public.job_dead_letters dl
    order by dl.failed_at desc nulls last
    limit greatest(p_limit, 1);
  end if;
end;
$$;

comment on function public.get_cron_job_health(integer) is
  'Admin-only. Per-cron-job run counts (attempts) and failures over the last N days.';
comment on function public.get_pipeline_failures(text, integer) is
  'Admin-only. Rep-level failures for a pipeline source so admins can see which rep failed and why.';
