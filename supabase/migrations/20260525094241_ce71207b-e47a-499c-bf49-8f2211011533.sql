ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS include_in_quiz_library boolean NOT NULL DEFAULT true;
UPDATE public.questions SET include_in_quiz_library = false WHERE source = 'poll';