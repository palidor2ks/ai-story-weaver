-- Scheduled TEC (Texas Ethics Commission) campaign-finance ingestion.
--   tx-cf-drain    : every 4 min, process ONE shard-pass (maxShards=1) of the bulk
--                    ZIP. fetch-tx-finance caps rows per shard per call (ROW_CAP) and
--                    resumes via tx_cf_shard_progress.rows_done, so this steadily
--                    grinds the ~1 GB / millions-of-rows backlog across many runs.
--                    NOTE: maxShards stays at 1 — processing several shard-passes in
--                    one invocation accumulates memory (each pass re-streams + inflates
--                    a shard) and trips the worker's WORKER_RESOURCE_LIMIT. One pass per
--                    run is the proven-safe unit; throughput comes from the cadence.
--   tx-cf-discover : weekly, re-read the ZIP's central directory. When TEC publishes
--                    a new dump (ZIP Last-Modified changes), discover wipes
--                    tx_cf_shard_progress and re-seeds every shard pending → a full
--                    idempotent re-drain (upserts by contributionInfoId, so no dupes).
--                    NOTE (v1 tradeoff): the dump refreshes ~daily but we refresh
--                    weekly to bound the cost of a full re-drain; a future incremental
--                    (filter by receivedDt) can tighten freshness without re-draining all.
--
-- Credentials are read from Vault at execution time — none committed to source:
--   * bearer/apikey  : 'nj_elec_cron_anon_key' (this project's publishable key;
--                      shared across the state-finance crons on this project).
--   * x-sync-secret  : 'tx_sync_secret' (gates fetch-tx-finance via check_tx_sync_secret).

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin perform cron.unschedule('tx-cf-drain');    exception when others then null; end $$;
do $$ begin perform cron.unschedule('tx-cf-discover'); exception when others then null; end $$;

select cron.schedule('tx-cf-drain', '*/4 * * * *', $cron$
  select net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/fetch-tx-finance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tx_sync_secret')
    ),
    body := '{"mode":"drain","maxShards":1}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);

select cron.schedule('tx-cf-discover', '15 11 * * 0', $cron$
  select net.http_post(
    url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/fetch-tx-finance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'nj_elec_cron_anon_key'),
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tx_sync_secret')
    ),
    body := '{"mode":"discover"}'::jsonb,
    timeout_milliseconds := 150000
  );
$cron$);
