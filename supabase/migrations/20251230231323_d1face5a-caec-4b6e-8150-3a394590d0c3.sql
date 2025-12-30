-- Update the donor_consolidated view to include search_text for improved searching
CREATE OR REPLACE VIEW public.donor_consolidated AS
SELECT 
    cycle,
    type,
    COALESCE(display_name, name) AS display_name,
    min(id) AS primary_id,
    array_agg(DISTINCT name ORDER BY name) AS name_variations,
    array_agg(DISTINCT id ORDER BY id) AS donor_ids,
    sum(amount) AS total_amount,
    sum(COALESCE(transaction_count, 1)) AS total_transactions,
    count(DISTINCT candidate_id) AS recipient_count,
    count(DISTINCT name) > 1 OR COALESCE(display_name, name) <> min(name) AS is_consolidated,
    -- New search_text field: combines display_name with all name variations for comprehensive searching
    COALESCE(display_name, name) || ' ' || string_agg(DISTINCT name, ' ' ORDER BY name) AS search_text
FROM donors
GROUP BY cycle, type, (COALESCE(display_name, name));