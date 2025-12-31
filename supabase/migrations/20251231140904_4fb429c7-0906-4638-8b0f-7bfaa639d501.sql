-- Drop and recreate donor_consolidated view to consolidate by name regardless of type
DROP VIEW IF EXISTS public.donor_consolidated;

CREATE VIEW public.donor_consolidated AS
SELECT 
    cycle,
    COALESCE(display_name, name) AS display_name,
    min(id) AS primary_id,
    -- Aggregate types into an array for display
    array_agg(DISTINCT type ORDER BY type) AS types,
    -- Keep primary type as the one with highest total amount
    (array_agg(type ORDER BY amount DESC))[1] AS type,
    array_agg(DISTINCT name ORDER BY name) AS name_variations,
    array_agg(DISTINCT id ORDER BY id) AS donor_ids,
    sum(amount) AS total_amount,
    sum(COALESCE(transaction_count, 1)) AS total_transactions,
    count(DISTINCT candidate_id) AS recipient_count,
    count(DISTINCT name) > 1 OR COALESCE(display_name, name) <> min(name) AS is_consolidated,
    COALESCE(display_name, name) || ' ' || string_agg(DISTINCT name, ' ' ORDER BY name) AS search_text
FROM donors
GROUP BY cycle, COALESCE(display_name, name);

COMMENT ON VIEW public.donor_consolidated IS 'Consolidated donor view that groups by name regardless of type';