-- Create enum for party types
CREATE TYPE public.party_type AS ENUM ('Democrat', 'Republican', 'Independent', 'Other');

-- Create enum for vote positions
CREATE TYPE public.vote_position AS ENUM ('Yea', 'Nay', 'Present', 'Not Voting');

-- Create enum for donor types
CREATE TYPE public.donor_type AS ENUM ('Individual', 'PAC', 'Organization', 'Unknown');

-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  location TEXT,
  overall_score INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- Create topics table
CREATE TABLE public.topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  weight INTEGER DEFAULT 1
);

ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Topics are viewable by everyone"
ON public.topics FOR SELECT
USING (true);

-- Create user_topics table for priority topics
CREATE TABLE public.user_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  topic_id TEXT REFERENCES public.topics(id) ON DELETE CASCADE NOT NULL,
  weight INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, topic_id)
);

ALTER TABLE public.user_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own topics"
ON public.user_topics FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own topics"
ON public.user_topics FOR ALL
USING (auth.uid() = user_id);

-- Create user_topic_scores table
CREATE TABLE public.user_topic_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  topic_id TEXT REFERENCES public.topics(id) ON DELETE CASCADE NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, topic_id)
);

ALTER TABLE public.user_topic_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own scores"
ON public.user_topic_scores FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own scores"
ON public.user_topic_scores FOR ALL
USING (auth.uid() = user_id);

-- Create questions table
CREATE TABLE public.questions (
  id TEXT PRIMARY KEY,
  topic_id TEXT REFERENCES public.topics(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Questions are viewable by everyone"
ON public.questions FOR SELECT
USING (true);

-- Create question_options table
CREATE TABLE public.question_options (
  id TEXT PRIMARY KEY,
  question_id TEXT REFERENCES public.questions(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  value INTEGER NOT NULL,
  display_order INTEGER DEFAULT 0
);

ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Question options are viewable by everyone"
ON public.question_options FOR SELECT
USING (true);

-- Create quiz_answers table
CREATE TABLE public.quiz_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  question_id TEXT REFERENCES public.questions(id) ON DELETE CASCADE NOT NULL,
  selected_option_id TEXT REFERENCES public.question_options(id) ON DELETE CASCADE NOT NULL,
  value INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, question_id)
);

ALTER TABLE public.quiz_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own answers"
ON public.quiz_answers FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own answers"
ON public.quiz_answers FOR ALL
USING (auth.uid() = user_id);

-- Create candidates table
CREATE TABLE public.candidates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  party party_type NOT NULL,
  office TEXT NOT NULL,
  state TEXT NOT NULL,
  district TEXT,
  image_url TEXT,
  overall_score INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Candidates are viewable by everyone"
ON public.candidates FOR SELECT
USING (true);

-- Create candidate_topic_scores table
CREATE TABLE public.candidate_topic_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id TEXT REFERENCES public.candidates(id) ON DELETE CASCADE NOT NULL,
  topic_id TEXT REFERENCES public.topics(id) ON DELETE CASCADE NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  UNIQUE(candidate_id, topic_id)
);

ALTER TABLE public.candidate_topic_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Candidate scores are viewable by everyone"
ON public.candidate_topic_scores FOR SELECT
USING (true);

-- Create donors table
CREATE TABLE public.donors (
  id TEXT PRIMARY KEY,
  candidate_id TEXT REFERENCES public.candidates(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type donor_type NOT NULL,
  amount INTEGER NOT NULL,
  cycle TEXT NOT NULL
);

ALTER TABLE public.donors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Donors are viewable by everyone"
ON public.donors FOR SELECT
USING (true);

-- Create votes table for voting records
CREATE TABLE public.votes (
  id TEXT PRIMARY KEY,
  candidate_id TEXT REFERENCES public.candidates(id) ON DELETE CASCADE NOT NULL,
  bill_id TEXT NOT NULL,
  bill_name TEXT NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  position vote_position NOT NULL,
  topic TEXT NOT NULL,
  description TEXT
);

ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Votes are viewable by everyone"
ON public.votes FOR SELECT
USING (true);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for profile timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default topics
INSERT INTO public.topics (id, name, icon, weight) VALUES
  ('economy', 'Economy', '💰', 1),
  ('healthcare', 'Healthcare', '🏥', 1),
  ('immigration', 'Immigration', '🌍', 1),
  ('environment', 'Environment', '🌱', 1),
  ('education', 'Education', '📚', 1),
  ('foreign-policy', 'Foreign Policy', '🌐', 1),
  ('civil-rights', 'Civil Rights', '⚖️', 1),
  ('gun-policy', 'Gun Policy', '🔫', 1),
  ('technology', 'Technology', '💻', 1),
  ('criminal-justice', 'Criminal Justice', '🏛️', 1);

-- Insert questions
INSERT INTO public.questions (id, topic_id, text) VALUES
  ('q1', 'economy', 'The government should increase taxes on the wealthy to fund social programs.'),
  ('q2', 'economy', 'The minimum wage should be raised to $15/hour nationally.'),
  ('q3', 'healthcare', 'The government should provide universal healthcare for all citizens.'),
  ('q4', 'immigration', 'There should be a pathway to citizenship for undocumented immigrants.'),
  ('q5', 'environment', 'The U.S. should prioritize renewable energy over fossil fuels.'),
  ('q6', 'education', 'College tuition should be free at public universities.'),
  ('q7', 'gun-policy', 'There should be stricter background checks for gun purchases.'),
  ('q8', 'criminal-justice', 'Police departments should receive increased funding for training and resources.');

-- Insert question options
INSERT INTO public.question_options (id, question_id, text, value, display_order) VALUES
  ('q1-a', 'q1', 'Strongly Agree', 10, 1),
  ('q1-b', 'q1', 'Agree', 5, 2),
  ('q1-c', 'q1', 'Neutral', 0, 3),
  ('q1-d', 'q1', 'Disagree', -5, 4),
  ('q1-e', 'q1', 'Strongly Disagree', -10, 5),
  ('q2-a', 'q2', 'Strongly Agree', 10, 1),
  ('q2-b', 'q2', 'Agree', 5, 2),
  ('q2-c', 'q2', 'Neutral', 0, 3),
  ('q2-d', 'q2', 'Disagree', -5, 4),
  ('q2-e', 'q2', 'Strongly Disagree', -10, 5),
  ('q3-a', 'q3', 'Strongly Agree', 10, 1),
  ('q3-b', 'q3', 'Agree', 5, 2),
  ('q3-c', 'q3', 'Neutral', 0, 3),
  ('q3-d', 'q3', 'Disagree', -5, 4),
  ('q3-e', 'q3', 'Strongly Disagree', -10, 5),
  ('q4-a', 'q4', 'Strongly Agree', 10, 1),
  ('q4-b', 'q4', 'Agree', 5, 2),
  ('q4-c', 'q4', 'Neutral', 0, 3),
  ('q4-d', 'q4', 'Disagree', -5, 4),
  ('q4-e', 'q4', 'Strongly Disagree', -10, 5),
  ('q5-a', 'q5', 'Strongly Agree', 10, 1),
  ('q5-b', 'q5', 'Agree', 5, 2),
  ('q5-c', 'q5', 'Neutral', 0, 3),
  ('q5-d', 'q5', 'Disagree', -5, 4),
  ('q5-e', 'q5', 'Strongly Disagree', -10, 5),
  ('q6-a', 'q6', 'Strongly Agree', 10, 1),
  ('q6-b', 'q6', 'Agree', 5, 2),
  ('q6-c', 'q6', 'Neutral', 0, 3),
  ('q6-d', 'q6', 'Disagree', -5, 4),
  ('q6-e', 'q6', 'Strongly Disagree', -10, 5),
  ('q7-a', 'q7', 'Strongly Agree', 10, 1),
  ('q7-b', 'q7', 'Agree', 5, 2),
  ('q7-c', 'q7', 'Neutral', 0, 3),
  ('q7-d', 'q7', 'Disagree', -5, 4),
  ('q7-e', 'q7', 'Strongly Disagree', -10, 5),
  ('q8-a', 'q8', 'Strongly Agree', -10, 1),
  ('q8-b', 'q8', 'Agree', -5, 2),
  ('q8-c', 'q8', 'Neutral', 0, 3),
  ('q8-d', 'q8', 'Disagree', 5, 4),
  ('q8-e', 'q8', 'Strongly Disagree', 10, 5);

-- Insert candidates
INSERT INTO public.candidates (id, name, party, office, state, district, image_url, overall_score) VALUES
  ('c1', 'Sarah Mitchell', 'Democrat', 'Senator', 'California', NULL, '', 65),
  ('c2', 'James Richardson', 'Republican', 'Representative', 'Texas', 'TX-12', '', -45),
  ('c3', 'Maria Santos', 'Democrat', 'Representative', 'New York', 'NY-14', '', 82),
  ('c4', 'Robert Thompson', 'Republican', 'Senator', 'Florida', NULL, '', -30),
  ('c5', 'Emily Chen', 'Independent', 'Representative', 'Washington', 'WA-7', '', 25),
  ('c6', 'Michael Brooks', 'Democrat', 'Senator', 'Michigan', NULL, '', 55);

-- Insert candidate topic scores
INSERT INTO public.candidate_topic_scores (candidate_id, topic_id, score) VALUES
  ('c1', 'economy', 70),
  ('c1', 'healthcare', 85),
  ('c1', 'immigration', 60),
  ('c1', 'environment', 90),
  ('c1', 'education', 75),
  ('c2', 'economy', -60),
  ('c2', 'healthcare', -40),
  ('c2', 'immigration', -70),
  ('c2', 'environment', -50),
  ('c2', 'gun-policy', -80),
  ('c3', 'economy', 85),
  ('c3', 'healthcare', 95),
  ('c3', 'immigration', 80),
  ('c3', 'environment', 90),
  ('c3', 'criminal-justice', 75),
  ('c4', 'economy', -45),
  ('c4', 'healthcare', -20),
  ('c4', 'immigration', -55),
  ('c4', 'foreign-policy', -35),
  ('c4', 'gun-policy', -60),
  ('c5', 'economy', 20),
  ('c5', 'healthcare', 40),
  ('c5', 'environment', 50),
  ('c5', 'technology', 30),
  ('c5', 'civil-rights', 35),
  ('c6', 'economy', 50),
  ('c6', 'healthcare', 65),
  ('c6', 'environment', 70),
  ('c6', 'education', 60),
  ('c6', 'criminal-justice', 45);

-- Insert donors
INSERT INTO public.donors (id, candidate_id, name, type, amount, cycle) VALUES
  ('d1', 'c1', 'ActBlue', 'PAC', 2500000, '2024'),
  ('d2', 'c1', 'Tech Workers Union', 'Organization', 500000, '2024'),
  ('d3', 'c1', 'Environmental Defense Fund', 'PAC', 350000, '2024'),
  ('d4', 'c1', 'Individual Contributors', 'Individual', 1200000, '2024'),
  ('d5', 'c2', 'America First PAC', 'PAC', 1800000, '2024'),
  ('d6', 'c2', 'Oil & Gas Association', 'Organization', 750000, '2024'),
  ('d7', 'c2', 'NRA Victory Fund', 'PAC', 400000, '2024'),
  ('d8', 'c2', 'Individual Contributors', 'Individual', 950000, '2024'),
  ('d9', 'c3', 'Progressive Action PAC', 'PAC', 3200000, '2024'),
  ('d10', 'c3', 'Teachers Union', 'Organization', 600000, '2024'),
  ('d11', 'c3', 'Climate Action Now', 'PAC', 450000, '2024');

-- Insert votes
INSERT INTO public.votes (id, candidate_id, bill_id, bill_name, date, position, topic, description) VALUES
  ('v1', 'c1', 'HR-1234', 'Climate Action Act', '2024-01-05', 'Yea', 'Environment', 'Legislation to reduce carbon emissions'),
  ('v2', 'c1', 'HR-5678', 'Medicare Expansion', '2024-01-03', 'Yea', 'Healthcare', 'Expand Medicare coverage to age 60+'),
  ('v3', 'c1', 'HR-9012', 'Tax Reform Act', '2023-12-15', 'Yea', 'Economy', 'Increase taxes on incomes over $400k'),
  ('v4', 'c2', 'HR-1234', 'Climate Action Act', '2024-01-05', 'Nay', 'Environment', 'Legislation to reduce carbon emissions'),
  ('v5', 'c2', 'HR-3456', 'Border Security Act', '2024-01-02', 'Yea', 'Immigration', 'Increase border security funding'),
  ('v6', 'c2', 'HR-7890', 'Gun Rights Protection', '2023-12-20', 'Yea', 'Gun Policy', 'Protect 2nd Amendment rights');