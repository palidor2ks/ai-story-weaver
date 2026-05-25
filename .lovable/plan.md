## Goal

Poll questions should not appear in the user-facing Quiz Library by default. Admins can opt-in to library inclusion when creating a poll, and flip that inclusion after the fact from the Polls admin panel.

## Current behavior

- `usePolls.useCreatePoll` inserts new questions with `source: 'poll'` and `include_in_politician_quiz: false`.
- `useQuestions` (consumed by `Quiz.tsx` and `QuizLibrary.tsx`) selects **every** row from `questions`, so poll-sourced questions show up alongside curated quiz questions.
- There is no field on `questions` that controls user-quiz-library inclusion separately from the politician quiz flag.

## Plan

### 1. Database migration

Add a new boolean column to `public.questions`:

- `include_in_quiz_library boolean not null default true`

Backfill: set `include_in_quiz_library = false` for every existing row where `source = 'poll'` so previously-created poll questions disappear from the library immediately (matching the user's screenshot example).

No RLS changes needed (column inherits existing table policies).

### 2. Filter the user quiz library + quiz

Update `useQuestions` in `src/hooks/useCandidates.ts` to filter `.eq('include_in_quiz_library', true)` so both `Quiz.tsx` and `QuizLibrary.tsx` automatically exclude poll questions that aren't opted in. No call-site changes needed.

### 3. Poll creation: opt-in checkbox

In `src/components/admin/PollsPanel.tsx` "New Poll" dialog, add a Switch labeled **"Include questions in Quiz Library"** (default off). Persist the choice through `useCreatePoll`.

In `src/hooks/usePolls.ts`:
- Extend `CreatePollInput` with `include_in_quiz_library?: boolean` (default `false`).
- When inserting each generated question, set `include_in_quiz_library` to that value.

### 4. After-the-fact toggle in admin Polls table

Add a new column **"In Library"** to the polls table in `PollsPanel.tsx` showing a checkbox/switch per poll. Toggling it updates `include_in_quiz_library` on every `questions` row joined via `poll_questions.poll_id = poll.id`.

Implementation:
- New hook `useTogglePollLibraryInclusion` in `usePolls.ts` that:
  1. Reads `poll_questions.question_id` for the given `poll_id`.
  2. Updates `questions.include_in_quiz_library` for those ids.
  3. Invalidates `['polls']` and `['questions']` query keys.
- Derive each poll's current inclusion state via a lightweight join (extend `usePolls` to also fetch, per poll, whether any of its questions are in the library). Simple approach: add a `library_included` boolean computed by a second query that aggregates `poll_questions` + `questions.include_in_quiz_library` (any true → checked).

### 5. UI copy tweak

Update the `PollsPanel` CardDescription line that currently says "Scored poll questions appear in the user Quiz Library but are excluded from the politician quiz." to reflect the new opt-in default.

## Out of scope

- No changes to politician quiz logic (`include_in_politician_quiz` stays false for poll questions).
- No changes to public poll voting page or results.
- No changes to scoring or party alignment logic.
