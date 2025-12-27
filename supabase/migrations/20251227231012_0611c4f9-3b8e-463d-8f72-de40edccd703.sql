-- Create function to resolve donor display name
CREATE OR REPLACE FUNCTION resolve_donor_display_name(p_donor_name text, p_donor_type text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT canonical_name 
     FROM donor_aliases 
     WHERE is_active = true 
       AND p_donor_type = ANY(donor_types)
       AND p_donor_name ILIKE alias_pattern
     ORDER BY length(alias_pattern) DESC
     LIMIT 1),
    p_donor_name
  );
$$;

-- Create trigger function for new donors
CREATE OR REPLACE FUNCTION set_donor_display_name_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.display_name := resolve_donor_display_name(NEW.name, NEW.type::text);
  RETURN NEW;
END;
$$;

-- Create trigger for new inserts
DROP TRIGGER IF EXISTS trigger_set_donor_display_name ON donors;
CREATE TRIGGER trigger_set_donor_display_name
BEFORE INSERT ON donors
FOR EACH ROW
EXECUTE FUNCTION set_donor_display_name_trigger();

-- Create function to refresh display_names when aliases change
CREATE OR REPLACE FUNCTION refresh_donor_display_names()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE donors 
  SET display_name = resolve_donor_display_name(name, type::text);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION refresh_donor_display_names() TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_donor_display_name(text, text) TO authenticated;