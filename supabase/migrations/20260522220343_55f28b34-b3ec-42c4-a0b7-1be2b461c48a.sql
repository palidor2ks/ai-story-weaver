CREATE OR REPLACE FUNCTION public.list_ie_spenders()
RETURNS TABLE(fec_committee_id text, name text, total numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    spending_committee_fec_id AS fec_committee_id,
    (array_agg(spending_committee_name ORDER BY expenditure_date DESC NULLS LAST))[1] AS name,
    SUM(amount)::numeric AS total
  FROM independent_expenditures
  WHERE spending_committee_fec_id IS NOT NULL
  GROUP BY spending_committee_fec_id
  ORDER BY SUM(amount) DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.list_ie_spenders() TO anon, authenticated, service_role;