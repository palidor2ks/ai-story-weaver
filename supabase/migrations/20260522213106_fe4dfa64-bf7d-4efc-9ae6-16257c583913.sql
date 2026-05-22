CREATE TABLE public.committee_topics (
  fec_committee_id text PRIMARY KEY,
  primary_topic_id text NOT NULL REFERENCES public.topics(id),
  secondary_topic_ids text[] NOT NULL DEFAULT '{}',
  assigned_by text NOT NULL DEFAULT 'ai' CHECK (assigned_by IN ('ai','admin')),
  ai_confidence text CHECK (ai_confidence IN ('low','medium','high')),
  ai_reasoning text,
  admin_overridden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_committee_topics_primary ON public.committee_topics(primary_topic_id);

ALTER TABLE public.committee_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Committee topics are viewable by everyone"
  ON public.committee_topics FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage committee topics"
  ON public.committee_topics FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage committee topics"
  ON public.committee_topics FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_committee_topics_updated_at
  BEFORE UPDATE ON public.committee_topics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();