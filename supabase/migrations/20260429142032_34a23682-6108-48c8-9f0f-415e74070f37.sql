CREATE TABLE public.hidden_states (
  state_code text PRIMARY KEY,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  hidden_by uuid
);

ALTER TABLE public.hidden_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hidden states readable by everyone"
  ON public.hidden_states FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage hidden states"
  ON public.hidden_states FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));