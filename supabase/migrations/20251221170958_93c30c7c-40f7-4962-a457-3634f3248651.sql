-- Create official_transitions table for tracking election results and role transitions
CREATE TABLE public.official_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  official_name text NOT NULL,
  current_office text,
  new_office text NOT NULL,
  state text NOT NULL,
  district text,
  party text,
  election_date date NOT NULL,
  inauguration_date date NOT NULL,
  transition_type text NOT NULL DEFAULT 'elected', -- 'elected', 'appointed', 'resigned', 'term_ended'
  source_url text,
  ai_confidence text DEFAULT 'medium', -- 'high', 'medium', 'low'
  verified boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_transition_type CHECK (transition_type IN ('elected', 'appointed', 'resigned', 'term_ended')),
  CONSTRAINT valid_ai_confidence CHECK (ai_confidence IN ('high', 'medium', 'low'))
);

-- Enable RLS
ALTER TABLE public.official_transitions ENABLE ROW LEVEL SECURITY;

-- Everyone can view active transitions
CREATE POLICY "Active transitions are viewable by everyone"
ON public.official_transitions
FOR SELECT
USING (is_active = true);

-- Admins can manage transitions
CREATE POLICY "Admins can manage transitions"
ON public.official_transitions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert/update (for edge functions)
CREATE POLICY "Service role can manage transitions"
ON public.official_transitions
FOR ALL
USING (auth.role() = 'service_role');

-- Create index for common queries
CREATE INDEX idx_official_transitions_state ON public.official_transitions(state);
CREATE INDEX idx_official_transitions_active ON public.official_transitions(is_active) WHERE is_active = true;

-- Create trigger to update updated_at
CREATE TRIGGER update_official_transitions_updated_at
BEFORE UPDATE ON public.official_transitions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();