-- Phase 1: Cleanup - Delete all existing question-related data
-- Delete in order to respect foreign key dependencies

-- 1. Delete user quiz answers (references questions and question_options)
DELETE FROM quiz_answers;

-- 2. Delete candidate answers (references questions)
DELETE FROM candidate_answers;

-- 3. Delete party answers (references questions)
DELETE FROM party_answers;

-- 4. Delete question update notifications (references questions)
DELETE FROM question_update_notifications;

-- 5. Delete question options (references questions)
DELETE FROM question_options;

-- 6. Delete questions (references topics)
DELETE FROM questions;

-- 7. Delete topics
DELETE FROM topics;