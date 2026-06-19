-- Daily cron to keep the pre-baked candidates-directory CDN JSON fresh.
--
-- Why: refresh-candidates-cache generates candidates-directory.json in Supabase
-- Storage so the /candidates page fetches ~50ms from CDN instead of hitting
-- Postgres on every cold visit. Scores and candidate data change ~daily, so we
-- refresh at 3 AM UTC to avoid stale results by morning traffic.
--
-- Auth: verify_jwt=false on the function, so only the apikey header is needed for
-- gateway routing. Using supabase_publishable_key from Vault (public anon key).

do $$ begin perform cron.unschedule('refresh-candidates-cache-daily'); exception when others then null; end $$;
do $$ begin
  perform cron.schedule('refresh-candidates-cache-daily', '0 3 * * *', $cron$
    select net.http_post(
      url := 'https://ornnzinjrcyigazecctf.supabase.co/functions/v1/refresh-candidates-cache',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_publishable_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$);
exception when others then raise notice 'refresh-candidates-cache-daily not scheduled: %', sqlerrm; end $$;
