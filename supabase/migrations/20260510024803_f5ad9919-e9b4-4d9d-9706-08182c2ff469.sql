
CREATE TABLE public.elections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_date date NOT NULL,
  election_type text NOT NULL DEFAULT 'general',
  level text NOT NULL,
  state text,
  jurisdiction text,
  name text NOT NULL,
  source text NOT NULL,
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX elections_dedupe_idx
  ON public.elections (source, COALESCE(source_ref, ''), election_date, COALESCE(jurisdiction, ''), COALESCE(state, ''));

CREATE INDEX elections_date_idx ON public.elections (election_date);
CREATE INDEX elections_state_idx ON public.elections (state);

ALTER TABLE public.elections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elections are viewable by everyone"
  ON public.elections FOR SELECT USING (true);

CREATE POLICY "Admins can manage elections"
  ON public.elections FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage elections"
  ON public.elections FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER elections_set_updated_at
  BEFORE UPDATE ON public.elections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.election_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES public.elections(id) ON DELETE CASCADE,
  candidate_id text NOT NULL,
  office text NOT NULL,
  status text NOT NULL DEFAULT 'declared',
  is_incumbent boolean NOT NULL DEFAULT false,
  source text NOT NULL,
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (election_id, candidate_id)
);

CREATE INDEX election_candidates_election_idx ON public.election_candidates (election_id);
CREATE INDEX election_candidates_candidate_idx ON public.election_candidates (candidate_id);

ALTER TABLE public.election_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Election candidates are viewable by everyone"
  ON public.election_candidates FOR SELECT USING (true);

CREATE POLICY "Admins can manage election candidates"
  ON public.election_candidates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage election candidates"
  ON public.election_candidates FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER election_candidates_set_updated_at
  BEFORE UPDATE ON public.election_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
