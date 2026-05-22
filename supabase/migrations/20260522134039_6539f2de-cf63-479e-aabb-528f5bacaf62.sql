CREATE OR REPLACE VIEW public.independent_expenditure_cycles
WITH (security_invoker = true) AS
SELECT DISTINCT cycle
FROM public.independent_expenditures
WHERE cycle IS NOT NULL;

GRANT SELECT ON public.independent_expenditure_cycles TO anon, authenticated;