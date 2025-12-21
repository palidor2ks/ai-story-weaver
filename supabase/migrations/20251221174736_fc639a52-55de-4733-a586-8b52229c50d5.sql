-- Add unique constraint for candidate_id + question_id to enable upserts
ALTER TABLE public.candidate_answers 
ADD CONSTRAINT candidate_answers_candidate_question_unique 
UNIQUE (candidate_id, question_id);