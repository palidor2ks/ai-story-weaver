
# Add Local Topics to Onboarding

## Overview

Add a new onboarding step where all users select their top 2 local topics (from the 5 local-scope topics), then answer 4 local questions (2 per selected local topic) as a separate quiz section after the federal quiz.

## Flow Changes

Current: Welcome → Demographics → Topics (3 federal) → Quiz (20 federal) → Results

New: Welcome → Demographics → Topics (3 federal) → Quiz (20 federal) → **Local Topics (2 local)** → **Local Quiz (4 local)** → Results

## Changes

### 1. Onboarding.tsx — New steps and state

- Add two new step values to `ExtendedOnboardingStep`: `'local_topics'` and `'local_quiz'`
- Add state: `selectedLocalTopics` (Topic[]), `localQuizAnswers` (QuizAnswer[]), `currentLocalQuestionIndex`, `skippedLocalQuestionIds`
- Fetch local topics separately from `dbTopics` (filter `scope === 'local'`)
- Fetch canonical questions for selected local topic IDs using `useCanonicalQuestions(selectedLocalTopicIds)`
- After the federal quiz results calculation, transition to `'local_topics'` instead of `'results'`

### 2. Local Topics step UI

- Similar to the federal topics step but labeled "Select Your Top 2 Local Topics"
- Shows only the 5 local topics (🏫 🏠 🩺 💲 🚔)
- `maxSelections={2}`
- Back button returns to the last federal quiz question; Continue goes to local quiz

### 3. Local Quiz step UI

- Identical quiz UI to the federal quiz but for 4 local questions
- Progress shows "Question X of 4"
- After completing, combine federal + local answers, recalculate scores including local topics, then show results

### 4. Results and saving

- `calculateUserScore()` updated to include local topics in the weight map (selected local topics get weight 2/1)
- `handleComplete()` saves all 5 topic IDs (3 federal + 2 local) via `save_user_topics`
- All quiz answers (federal + local) saved together via `save_quiz_results`

### 5. Welcome step update

- Update welcome text: "Select Your Top 3 Topics" → also mention "Top 2 Local Topics"
- Update "Answer 20 Questions" → "Answer 24 Questions" (20 federal + 4 local)

### 6. Memory update

- Update topic architecture memory to note that local topics now appear in user onboarding quiz

## Technical Notes

- No database changes needed — `save_user_topics` and `save_quiz_results` RPCs already handle arbitrary topic IDs and answers
- `useCanonicalQuestions` hook already exists and filters by topic IDs + `is_onboarding_canonical`
- The 5 local topics must have canonical onboarding questions (2 per topic) already seeded in the DB — if not present, they need to be created via admin
