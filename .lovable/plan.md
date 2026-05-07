# Convert Local Question Options to Yes/No Format

## What
Update all 100 local questions (across 5 topics: Local Cost of Living, Local Education, Local Housing, Local Public Health, Local Public Safety) from the generic "Strongly Disagree / Disagree / Neutral / Agree / Strongly Agree / Not important to me" format to the contextual "Yes—because… / Yes—but… / Neutral—… / No—but… / No—because…" format used by federal questions.

## Scope
- **500 option texts** need updating (5 per question × 100 questions)
- The 6th option ("Not important to me") stays unchanged
- Option IDs, values (-10, -5, 0, 5, 10), and display_order remain the same
- No code changes needed — this is a data-only migration

## Approach
1. Write a migration script that uses AI to generate contextual Yes/No explanations for each question, then runs UPDATE statements on the `question_options` table.
2. Actually, since we need deterministic, high-quality text for each of 100 questions, I'll generate all 500 option texts in a script, review them, and apply via a single SQL migration.

## Process
1. Generate a complete SQL migration with all 500 UPDATE statements — one per option, each with a contextual explanation tailored to the question.
2. Apply via `supabase--migration`.

## Format Pattern
For each question (e.g., "Should the state cap annual rent increases?"):
- **Value -10**: `Yes—because tenants need protection from price gouging.`
- **Value -5**: `Yes—but with reasonable limits that still allow market adjustments.`
- **Value 0**: `Neutral—support studying the issue before acting.`
- **Value 5**: `No—but encourage voluntary landlord restraint.`
- **Value 10**: `No—because rent control distorts the housing market.`

## Existing user answers
Quiz answers store `question_id`, `value`, and `selected_option` (FK to `question_options.id`). Since option IDs and values don't change, existing user answers remain valid — only the display text changes.

## Technical Details
- Single migration with ~500 UPDATE statements on `question_options` table
- No schema changes, no new tables, no RLS changes
