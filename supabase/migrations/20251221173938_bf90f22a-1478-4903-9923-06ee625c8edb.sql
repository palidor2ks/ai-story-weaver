-- Create table for candidate/rep answers to questions with source attribution
CREATE TABLE public.candidate_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  question_id TEXT NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  answer_value INTEGER NOT NULL CHECK (answer_value >= -10 AND answer_value <= 10),
  source_url TEXT,
  source_description TEXT,
  source_type TEXT DEFAULT 'voting_record' CHECK (source_type IN ('voting_record', 'public_statement', 'campaign_website', 'interview', 'legislation', 'other')),
  confidence TEXT DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(candidate_id, question_id)
);

-- Enable Row Level Security
ALTER TABLE public.candidate_answers ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access
CREATE POLICY "Candidate answers are viewable by everyone" 
ON public.candidate_answers 
FOR SELECT 
USING (true);

-- Create policy for admin management
CREATE POLICY "Admins can manage candidate answers" 
ON public.candidate_answers 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_candidate_answers_updated_at
BEFORE UPDATE ON public.candidate_answers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_candidate_answers_candidate_id ON public.candidate_answers(candidate_id);
CREATE INDEX idx_candidate_answers_question_id ON public.candidate_answers(question_id);

-- Create a view for calculating candidate topic scores from answers
CREATE OR REPLACE VIEW public.calculated_candidate_topic_scores AS
SELECT 
  ca.candidate_id,
  q.topic_id,
  AVG(ca.answer_value) as calculated_score,
  COUNT(ca.id) as answer_count
FROM public.candidate_answers ca
JOIN public.questions q ON ca.question_id = q.id
GROUP BY ca.candidate_id, q.topic_id;

-- Add comment for documentation
COMMENT ON TABLE public.candidate_answers IS 'Stores candidate/representative answers to questions with source attribution for credibility';
COMMENT ON COLUMN public.candidate_answers.source_type IS 'Type of source: voting_record, public_statement, campaign_website, interview, legislation, other';
COMMENT ON COLUMN public.candidate_answers.confidence IS 'Confidence level in the answer accuracy: high, medium, low';