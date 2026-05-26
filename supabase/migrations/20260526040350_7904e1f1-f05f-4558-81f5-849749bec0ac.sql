CREATE TABLE public.x_account_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_handle text NOT NULL UNIQUE,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.x_account_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view x_account_tokens"
ON public.x_account_tokens FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert x_account_tokens"
ON public.x_account_tokens FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update x_account_tokens"
ON public.x_account_tokens FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete x_account_tokens"
ON public.x_account_tokens FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_x_account_tokens_updated_at
BEFORE UPDATE ON public.x_account_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();