-- Observability for the TX (TEC) state-finance pipeline: surface it in
-- admin_stats_cache.state_finance_stats alongside nj/fl/ny, so the Data Accuracy
-- Scoreboard and scripts/check-data-accuracy.sh can see TX row counts and drain/
-- discover errors (required by the cron review before enabling tx-cf-* jobs).
--
-- Done as an in-place patch of refresh_admin_stats_cache rather than a full
-- re-paste of the ~220-line function: pg_get_functiondef returns the body
-- verbatim, so we insert the 'tx' jsonb branch right after the 'ny' branch.
-- Idempotent (skips if already patched) and fails loudly if the anchor moves.
do $patch$
declare
  src    text := pg_get_functiondef('public.refresh_admin_stats_cache(text[])'::regprocedure);
  newsrc text;
begin
  if position('tx_cf_sync_runs' in src) > 0 then
    raise notice 'refresh_admin_stats_cache already includes tx; skipping';
    return;
  end if;
  newsrc := regexp_replace(
    src,
    'from ny_sync_runs\)\s*\);',
    E'from ny_sync_runs),\n      ''tx'', (select jsonb_build_object('
      || E'''contributions'', (select count(*) from tx_cf_contributions), '
      || E'''lastRun'', max(finished_at), '
      || E'''errors7d'', count(*) filter (where status = ''error'' and started_at > now() - interval ''7 days'')) '
      || E'from tx_cf_sync_runs)\n    );'
  );
  if newsrc = src then
    raise exception 'tx patch anchor (from ny_sync_runs) not found in refresh_admin_stats_cache';
  end if;
  execute newsrc;
end $patch$;

-- Re-seed so the cache carries tx immediately (guarded: schema drift on some envs).
do $$ begin
  perform public.refresh_admin_stats_cache(array['state_finance_stats']);
exception when others then
  raise notice 'tx state_finance seed skipped: %', sqlerrm;
end $$;
