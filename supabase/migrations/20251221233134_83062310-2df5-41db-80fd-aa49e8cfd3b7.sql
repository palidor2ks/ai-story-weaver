-- Create party_platforms table for official party information
CREATE TABLE public.party_platforms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT,
  website_url TEXT,
  logo_icon TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.party_platforms ENABLE ROW LEVEL SECURITY;

-- Create read policy for party platforms (public)
CREATE POLICY "Party platforms are viewable by everyone"
ON public.party_platforms
FOR SELECT
USING (true);

-- Create admin management policy
CREATE POLICY "Admins can manage party platforms"
ON public.party_platforms
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create party_answers table for party stances on each question
CREATE TABLE public.party_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id TEXT REFERENCES public.party_platforms(id) ON DELETE CASCADE NOT NULL,
  question_id TEXT REFERENCES public.questions(id) ON DELETE CASCADE NOT NULL,
  answer_value INTEGER NOT NULL CHECK (answer_value >= -10 AND answer_value <= 10),
  source_url TEXT,
  source_description TEXT,
  confidence TEXT DEFAULT 'high' CHECK (confidence IN ('high', 'medium', 'low')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(party_id, question_id)
);

-- Enable RLS
ALTER TABLE public.party_answers ENABLE ROW LEVEL SECURITY;

-- Create read policy for party answers (public)
CREATE POLICY "Party answers are viewable by everyone"
ON public.party_answers
FOR SELECT
USING (true);

-- Create admin management policy
CREATE POLICY "Admins can manage party answers"
ON public.party_answers
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at on party_platforms
CREATE TRIGGER update_party_platforms_updated_at
BEFORE UPDATE ON public.party_platforms
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on party_answers
CREATE TRIGGER update_party_answers_updated_at
BEFORE UPDATE ON public.party_answers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert the 4 main parties
INSERT INTO public.party_platforms (id, name, short_name, color, description, website_url, logo_icon) VALUES
('democrat', 'Democratic Party', 'Democrat', '#3B82F6', 'The Democratic Party is one of two major political parties in the United States. It generally supports progressive policies on social issues, government-funded healthcare, environmental protection, labor rights, and civil liberties.', 'https://democrats.org', 'Building2'),
('republican', 'Republican Party', 'Republican', '#EF4444', 'The Republican Party (GOP) is one of two major political parties in the United States. It generally supports conservative policies on fiscal issues, limited government, free markets, traditional values, and strong national defense.', 'https://gop.com', 'Building2'),
('green', 'Green Party', 'Green', '#22C55E', 'The Green Party focuses on environmentalism, nonviolence, social justice, and grassroots democracy. It advocates for bold climate action, universal healthcare, and peaceful foreign policy.', 'https://gp.org', 'Leaf'),
('libertarian', 'Libertarian Party', 'Libertarian', '#EAB308', 'The Libertarian Party advocates for civil liberties, free markets, and minimal government intervention in both personal and economic matters. It opposes government overreach in all areas.', 'https://lp.org', 'Scale');