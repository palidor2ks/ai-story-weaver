
-- 1. Extend questions table for poll source tracking
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS include_in_politician_quiz BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_questions_source ON public.questions(source);
CREATE INDEX IF NOT EXISTS idx_questions_include_in_politician_quiz
  ON public.questions(include_in_politician_quiz);

-- 2. Polls table
CREATE TABLE IF NOT EXISTS public.polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('mc','scored','mini_quiz')),
  title TEXT NOT NULL,
  description TEXT,
  topic_id TEXT REFERENCES public.topics(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
  og_image_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_polls_status ON public.polls(status);
CREATE INDEX IF NOT EXISTS idx_polls_slug ON public.polls(slug);

-- 3. Poll questions junction
CREATE TABLE IF NOT EXISTS public.poll_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(poll_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_questions_poll ON public.poll_questions(poll_id);

-- 4. Poll responses
CREATE TABLE IF NOT EXISTS public.poll_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  anon_session_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referrer TEXT,
  user_agent TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (anon_session_id IS NOT NULL OR user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_poll_responses_poll ON public.poll_responses(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_responses_anon ON public.poll_responses(anon_session_id);
CREATE INDEX IF NOT EXISTS idx_poll_responses_user ON public.poll_responses(user_id);

-- 5. Poll response answers
CREATE TABLE IF NOT EXISTS public.poll_response_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES public.poll_responses(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_option_id TEXT NOT NULL REFERENCES public.question_options(id) ON DELETE CASCADE,
  value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poll_response_answers_response ON public.poll_response_answers(response_id);
CREATE INDEX IF NOT EXISTS idx_poll_response_answers_question ON public.poll_response_answers(question_id);

-- 6. updated_at triggers
DROP TRIGGER IF EXISTS update_polls_updated_at ON public.polls;
CREATE TRIGGER update_polls_updated_at
BEFORE UPDATE ON public.polls
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. RLS
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_response_answers ENABLE ROW LEVEL SECURITY;

-- Polls policies
DROP POLICY IF EXISTS "Anyone can view published polls" ON public.polls;
CREATE POLICY "Anyone can view published polls"
ON public.polls FOR SELECT
USING (status = 'published' OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage polls" ON public.polls;
CREATE POLICY "Admins manage polls"
ON public.polls FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Poll questions policies
DROP POLICY IF EXISTS "Anyone can view poll questions of published polls" ON public.poll_questions;
CREATE POLICY "Anyone can view poll questions of published polls"
ON public.poll_questions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.polls p
    WHERE p.id = poll_id
      AND (p.status = 'published' OR public.has_role(auth.uid(), 'admin'))
  )
);

DROP POLICY IF EXISTS "Admins manage poll questions" ON public.poll_questions;
CREATE POLICY "Admins manage poll questions"
ON public.poll_questions FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Poll responses policies
DROP POLICY IF EXISTS "Anyone can submit poll responses" ON public.poll_responses;
CREATE POLICY "Anyone can submit poll responses"
ON public.poll_responses FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.polls p
    WHERE p.id = poll_id AND p.status = 'published'
  )
);

DROP POLICY IF EXISTS "Users see own responses, admins see all" ON public.poll_responses;
CREATE POLICY "Users see own responses, admins see all"
ON public.poll_responses FOR SELECT
USING (
  user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Admins update poll responses" ON public.poll_responses;
CREATE POLICY "Admins update poll responses"
ON public.poll_responses FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Poll response answers policies
DROP POLICY IF EXISTS "Anyone can insert answers for own response" ON public.poll_response_answers;
CREATE POLICY "Anyone can insert answers for own response"
ON public.poll_response_answers FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.poll_responses r
    JOIN public.polls p ON p.id = r.poll_id
    WHERE r.id = response_id AND p.status = 'published'
  )
);

DROP POLICY IF EXISTS "Users see own answers, admins see all" ON public.poll_response_answers;
CREATE POLICY "Users see own answers, admins see all"
ON public.poll_response_answers FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.poll_responses r
    WHERE r.id = response_id
      AND (r.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

-- 8. Aggregate tally function (callable by anyone, returns counts only)
CREATE OR REPLACE FUNCTION public.get_poll_tally(p_poll_id UUID)
RETURNS TABLE (
  question_id TEXT,
  selected_option_id TEXT,
  count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pra.question_id, pra.selected_option_id, COUNT(*)::bigint
  FROM public.poll_response_answers pra
  JOIN public.poll_responses pr ON pr.id = pra.response_id
  JOIN public.polls p ON p.id = pr.poll_id
  WHERE pr.poll_id = p_poll_id
    AND p.status = 'published'
  GROUP BY pra.question_id, pra.selected_option_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_poll_tally(UUID) TO anon, authenticated;

-- 9. Claim anonymous responses on signup
CREATE OR REPLACE FUNCTION public.claim_anon_poll_responses(p_anon_session_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID;
  v_count INTEGER;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;
  IF p_anon_session_id IS NULL OR length(p_anon_session_id) < 8 THEN
    RETURN 0;
  END IF;

  UPDATE public.poll_responses
     SET user_id = v_user
   WHERE anon_session_id = p_anon_session_id
     AND user_id IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Copy scored poll answers into quiz_answers (only for scored / mini_quiz polls)
  INSERT INTO public.quiz_answers (user_id, question_id, selected_option_id, value)
  SELECT v_user, pra.question_id, pra.selected_option_id, pra.value
  FROM public.poll_response_answers pra
  JOIN public.poll_responses pr ON pr.id = pra.response_id
  JOIN public.polls p ON p.id = pr.poll_id
  WHERE pr.user_id = v_user
    AND pr.anon_session_id = p_anon_session_id
    AND p.type IN ('scored','mini_quiz')
  ON CONFLICT DO NOTHING;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_anon_poll_responses(TEXT) TO authenticated;
