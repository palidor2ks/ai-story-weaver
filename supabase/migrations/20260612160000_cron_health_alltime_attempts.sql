drop function if exists public.get_cron_job_health(integer);

-- Fix: "Attempts" column appeared frozen for high-frequency jobs because
-- total_runs was a 7-day sliding window count that maxes out in steady state.
-- Replace the time-windowed JOIN with per-column FILTER clauses so we can
-- return both all-time totals (for "Attempts") and windowed counts (for
-- succeeded/failed/avg_duration which reflect recent health).

create or replace function public.get_cron_job_health(p_days integer default 7)
returns table (
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  total_runs integer,
  total_runs_alltime integer,
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
    -- windowed count (for the bar chart)
    count(d.runid) filter (
      where d.start_time > now() - make_interval(days => greatest(p_days, 1))
    )::int,
    -- all-time count (for the "Attempts" column so it keeps incrementing)
    count(d.runid)::int,
    count(*) filter (
      where d.status = 'succeeded'
        and d.start_time > now() - make_interval(days => greatest(p_days, 1))
    )::int,
    count(*) filter (
      where d.status = 'failed'
        and d.start_time > now() - make_interval(days => greatest(p_days, 1))
    )::int,
    max(d.start_time),
    (array_agg(d.status order by d.start_time desc nulls last))[1],
    round(avg(
      extract(epoch from (d.end_time - d.start_time))
    ) filter (
      where d.start_time > now() - make_interval(days => greatest(p_days, 1))
    )::numeric, 2)
  from cron.job j
  left join cron.job_run_details d on d.jobid = j.jobid
  group by j.jobid, j.jobname, j.schedule, j.active
  order by count(*) filter (
    where d.status = 'failed'
      and d.start_time > now() - make_interval(days => greatest(p_days, 1))
  ) desc, j.jobname;
end;
$$;

comment on function public.get_cron_job_health(integer) is
  'Admin-only. Per-cron-job run counts and failures. total_runs_alltime = ever; total_runs = last N days (window for health chart).';
