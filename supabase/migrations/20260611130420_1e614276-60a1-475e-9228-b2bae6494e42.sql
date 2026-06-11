
REVOKE ALL ON FUNCTION public.check_fl_sync_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_fl_sync_secret(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_fl_sync_secret(text) TO service_role;

REVOKE ALL ON FUNCTION public.check_ny_sync_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_ny_sync_secret(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ny_sync_secret(text) TO service_role;

REVOKE ALL ON FUNCTION public.check_photo_enrich_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_photo_enrich_secret(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_photo_enrich_secret(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.refresh_donor_consolidated_mv() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_donor_consolidated_mv() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_donor_consolidated_mv() TO service_role;
