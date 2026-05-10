## Goal

Ensure every quiz question has a "Not important to me" skip option. A database audit found **220 questions** missing this option (covering civil-rights, economy, education, and other topics).

## Approach

Add a single Supabase migration that inserts a skip option for every question that doesn't already have one.

For each missing question, insert one `question_options` row:

- `id`: `{question_id}-opt-skip`
- `question_id`: the question's id
- `text`: `Not important to me`
- `value`: `0`
- `display_order`: `6` (consistent with existing skip options)
- `is_skip_option`: `true`

## SQL

```sql
INSERT INTO public.question_options
  (id, question_id, text, value, display_order, is_skip_option)
SELECT
  q.id || '-opt-skip',
  q.id,
  'Not important to me',
  0,
  6,
  true
FROM public.questions q
WHERE NOT EXISTS (
  SELECT 1
  FROM public.question_options o
  WHERE o.question_id = q.id
    AND o.is_skip_option = true
);
```

This is idempotent — re-running it inserts nothing once every question has a skip option.

## Verification

After the migration, run:

```sql
SELECT COUNT(*) FROM questions q
WHERE NOT EXISTS (
  SELECT 1 FROM question_options o
  WHERE o.question_id = q.id AND o.is_skip_option = true
);
-- expected: 0
```

## Out of Scope

- No frontend changes — `Onboarding.tsx`, `Quiz.tsx`, and `QuizQuestion.tsx` already render skip options when present.
- No changes to scoring, since the skip flow is already implemented.
