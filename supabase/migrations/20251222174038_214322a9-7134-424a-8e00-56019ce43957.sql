-- Create audit log table for tracking profile access and modifications
CREATE TABLE public.profile_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  changed_fields text[] NULL, -- List of fields that were modified
  accessed_at timestamptz DEFAULT now(),
  ip_address text NULL,
  user_agent text NULL
);

-- Add index for efficient querying by user and time
CREATE INDEX idx_profile_access_log_user_id ON public.profile_access_log(user_id);
CREATE INDEX idx_profile_access_log_accessed_at ON public.profile_access_log(accessed_at DESC);

-- Enable Row Level Security
ALTER TABLE public.profile_access_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs (using existing has_role function)
CREATE POLICY "Admins can view all audit logs"
ON public.profile_access_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Service role can insert audit logs (for triggers)
CREATE POLICY "Service role can insert audit logs"
ON public.profile_access_log
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create trigger function to log profile modifications
CREATE OR REPLACE FUNCTION public.log_profile_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed text[] := ARRAY[]::text[];
BEGIN
  -- Determine which fields changed (for UPDATE operations)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.name IS DISTINCT FROM NEW.name THEN changed := array_append(changed, 'name'); END IF;
    IF OLD.email IS DISTINCT FROM NEW.email THEN changed := array_append(changed, 'email'); END IF;
    IF OLD.address IS DISTINCT FROM NEW.address THEN changed := array_append(changed, 'address'); END IF;
    IF OLD.location IS DISTINCT FROM NEW.location THEN changed := array_append(changed, 'location'); END IF;
    IF OLD.age IS DISTINCT FROM NEW.age THEN changed := array_append(changed, 'age'); END IF;
    IF OLD.sex IS DISTINCT FROM NEW.sex THEN changed := array_append(changed, 'sex'); END IF;
    IF OLD.income IS DISTINCT FROM NEW.income THEN changed := array_append(changed, 'income'); END IF;
    IF OLD.political_party IS DISTINCT FROM NEW.political_party THEN changed := array_append(changed, 'political_party'); END IF;
    IF OLD.overall_score IS DISTINCT FROM NEW.overall_score THEN changed := array_append(changed, 'overall_score'); END IF;
  ELSIF TG_OP = 'INSERT' THEN
    changed := ARRAY['*']; -- All fields for insert
  ELSIF TG_OP = 'DELETE' THEN
    changed := ARRAY['*']; -- All fields for delete
  END IF;

  -- Insert audit log entry
  INSERT INTO profile_access_log (user_id, action, changed_fields)
  VALUES (
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    changed
  );

  RETURN NEW;
END;
$$;

-- Create trigger for INSERT and UPDATE on profiles
CREATE TRIGGER audit_profile_modifications
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.log_profile_modification();

-- Add comment for documentation
COMMENT ON TABLE public.profile_access_log IS 'Audit log for tracking modifications to user profiles containing sensitive PII';