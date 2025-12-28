-- Drop old view and create simplified version
DROP VIEW IF EXISTS donor_consolidated;

CREATE VIEW donor_consolidated AS
SELECT 
  cycle,
  type,
  COALESCE(display_name, name) as display_name,
  MIN(id) as primary_id,
  ARRAY_AGG(DISTINCT name ORDER BY name) as name_variations,
  ARRAY_AGG(DISTINCT id ORDER BY id) as donor_ids,
  SUM(amount)::bigint as total_amount,
  SUM(COALESCE(transaction_count, 1))::bigint as total_transactions,
  COUNT(DISTINCT candidate_id)::bigint as recipient_count,
  (COUNT(DISTINCT name) > 1 OR COALESCE(display_name, name) <> MIN(name)) as is_consolidated
FROM donors
GROUP BY cycle, type, COALESCE(display_name, name);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_donors_display_name ON donors(display_name);
CREATE INDEX IF NOT EXISTS idx_donors_consolidated_lookup ON donors(cycle, type, display_name);