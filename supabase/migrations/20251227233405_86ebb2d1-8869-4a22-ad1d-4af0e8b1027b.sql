-- Add optimized index for donor_consolidated view
CREATE INDEX IF NOT EXISTS idx_donors_for_consolidation 
ON donors(cycle, type, display_name, name);

-- Add index for NULL display_name lookups (used by refresh function)
CREATE INDEX IF NOT EXISTS idx_donors_null_display_name 
ON donors(id) 
WHERE display_name IS NULL;