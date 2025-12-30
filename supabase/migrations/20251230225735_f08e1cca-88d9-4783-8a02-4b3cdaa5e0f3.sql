-- Add new array column for multiple patterns
ALTER TABLE donor_aliases 
ADD COLUMN alias_patterns text[] DEFAULT ARRAY[]::text[];

-- Migrate existing single pattern to the array
UPDATE donor_aliases 
SET alias_patterns = ARRAY[alias_pattern] 
WHERE alias_pattern IS NOT NULL AND alias_pattern != '';

-- Create RPC function for multi-pattern matching count
CREATE OR REPLACE FUNCTION count_donors_matching_patterns(
  patterns text[],
  p_donor_types text[]
) RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(DISTINCT id)::bigint
  FROM donors 
  WHERE type::text = ANY(p_donor_types)
  AND name ILIKE ANY(patterns);
$$;

-- Update the resolve_donor_display_name function to check alias_patterns array
CREATE OR REPLACE FUNCTION public.resolve_donor_display_name(p_donor_name text, p_donor_type text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT canonical_name 
     FROM donor_aliases 
     WHERE is_active = true 
       AND p_donor_type = ANY(donor_types)
       AND (
         p_donor_name ILIKE ANY(alias_patterns)
         OR (alias_patterns IS NULL OR array_length(alias_patterns, 1) IS NULL) 
            AND p_donor_name ILIKE alias_pattern
       )
     ORDER BY 
       CASE WHEN p_donor_name ILIKE ANY(alias_patterns) THEN 0 ELSE 1 END,
       length(alias_pattern) DESC
     LIMIT 1),
    p_donor_name
  );
$$;