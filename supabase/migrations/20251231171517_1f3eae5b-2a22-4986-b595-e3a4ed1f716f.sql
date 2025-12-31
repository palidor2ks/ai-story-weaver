-- Add admin policies for questions table
CREATE POLICY "Admins can manage questions"
ON public.questions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add admin policies for question_options table
CREATE POLICY "Admins can manage question options"
ON public.question_options
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));