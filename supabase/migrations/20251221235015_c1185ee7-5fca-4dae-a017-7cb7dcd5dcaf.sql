-- Add RLS policy for politicians to manage their own candidate answers
-- Politicians who have claimed a candidate profile can manage answers for that candidate

CREATE POLICY "Politicians can manage their claimed candidate answers" 
ON public.candidate_answers 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.candidates c
    WHERE c.id = candidate_answers.candidate_id
    AND c.claimed_by_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.candidates c
    WHERE c.id = candidate_answers.candidate_id
    AND c.claimed_by_user_id = auth.uid()
  )
);