-- Retire the broken monthly-donor-sync cron.
-- It authenticated to sync-all-donors with the anon key, which sync-all-donors rejects
-- (401) — so federal donor data never refreshed. Donor sync + refresh for federal
-- candidates is now handled by fec-candidate-drain (every 3 min; never-synced OR stale
-- via stale_days), which authenticates correctly using the service-role key from its
-- own env. The sync-all-donors *function* is retained — the admin "sync all" action
-- still uses it with a real admin login.
do $$ begin perform cron.unschedule('monthly-donor-sync'); exception when others then null; end $$;
