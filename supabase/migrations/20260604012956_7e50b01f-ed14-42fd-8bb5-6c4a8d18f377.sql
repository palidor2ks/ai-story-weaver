
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') THEN
    PERFORM vault.create_secret(
      'f28f0d1be7740de2773060d78d31780597e87b994e18697890d192c118184a13',
      'cron_secret',
      'Shared secret used to authenticate pg_cron-initiated edge function calls (sent as x-cron-secret header).'
    );
  END IF;
END $$;
