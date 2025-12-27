-- Add donor_types array column to donor_aliases
ALTER TABLE donor_aliases ADD COLUMN IF NOT EXISTS donor_types text[] DEFAULT ARRAY['Individual', 'PAC', 'Organization', 'Unknown'];

-- Migrate existing data: convert single donor_type to array
UPDATE donor_aliases SET donor_types = ARRAY[donor_type] WHERE donor_types = ARRAY['Individual', 'PAC', 'Organization', 'Unknown'];

-- Drop and recreate the donor_consolidated view to use the new donor_types array
DROP VIEW IF EXISTS donor_consolidated;

CREATE VIEW donor_consolidated AS
WITH alias_matched AS (
  SELECT 
    d.*,
    da.canonical_name,
    da.id as alias_id
  FROM donors d
  LEFT JOIN donor_aliases da ON 
    da.is_active = true 
    AND d.type::text = ANY(da.donor_types)
    AND d.name ILIKE da.alias_pattern
),
consolidated AS (
  SELECT
    COALESCE(canonical_name, name) as display_name,
    type,
    cycle,
    MIN(id) as primary_id,
    array_agg(DISTINCT id) as donor_ids,
    array_agg(DISTINCT name) as name_variations,
    SUM(amount) as total_amount,
    SUM(transaction_count) as total_transactions,
    COUNT(DISTINCT candidate_id) as recipient_count,
    CASE WHEN canonical_name IS NOT NULL THEN true ELSE false END as is_consolidated
  FROM alias_matched
  GROUP BY COALESCE(canonical_name, name), type, cycle, (canonical_name IS NOT NULL)
)
SELECT * FROM consolidated;