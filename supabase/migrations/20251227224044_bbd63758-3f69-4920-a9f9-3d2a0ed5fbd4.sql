-- Drop existing view
DROP VIEW IF EXISTS public.donor_consolidated;

-- Create improved donor_consolidated view that applies aliases automatically
-- This view groups donors by their canonical name (from aliases) or original name
CREATE VIEW public.donor_consolidated AS
WITH donor_with_alias AS (
  SELECT 
    d.id,
    d.name as original_name,
    d.type,
    d.cycle,
    d.amount,
    d.candidate_id,
    d.transaction_count,
    d.contributor_state,
    d.contributor_city,
    d.employer,
    d.occupation,
    -- Use alias canonical_name if matched, otherwise original name
    COALESCE(
      (
        SELECT da.canonical_name 
        FROM donor_aliases da 
        WHERE da.is_active = true 
          AND d.type::text = da.donor_type
          AND d.name ILIKE da.alias_pattern
        LIMIT 1
      ),
      d.name
    ) as display_name
  FROM donors d
)
SELECT 
  cycle,
  type,
  display_name,
  MIN(id) as primary_id,
  ARRAY_AGG(DISTINCT original_name ORDER BY original_name) as name_variations,
  ARRAY_AGG(DISTINCT id) as donor_ids,
  SUM(amount) as total_amount,
  SUM(COALESCE(transaction_count, 1)) as total_transactions,
  COUNT(DISTINCT candidate_id) as recipient_count,
  COUNT(DISTINCT original_name) > 1 as is_consolidated
FROM donor_with_alias
GROUP BY cycle, type, display_name;