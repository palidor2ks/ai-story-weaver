-- Phase B: add indexes for the 18 unindexed foreign keys flagged by the Supabase
-- performance advisor (lint 0001_unindexed_foreign_keys).
--
-- Without these, joins/filters and cascading deletes on the parent tables fall back to
-- sequential scans. All 18 child tables here are small (largest ~181 rows), so a plain
-- (non-CONCURRENTLY) CREATE INDEX takes only a brief lock and runs in milliseconds --
-- and unlike CONCURRENTLY it is compatible with the prod migrator's per-file
-- single-transaction application. IF NOT EXISTS keeps this idempotent.

CREATE INDEX IF NOT EXISTS idx_ai_analysis_cache_user_id           ON public.ai_analysis_cache (user_id);
CREATE INDEX IF NOT EXISTS idx_candidate_topic_scores_topic_id     ON public.candidate_topic_scores (topic_id);
CREATE INDEX IF NOT EXISTS idx_donor_card_causes_cause_id          ON public.donor_card_causes (cause_id);
CREATE INDEX IF NOT EXISTS idx_ie_excluded_committees_excluded_by  ON public.ie_excluded_committees (excluded_by);
CREATE INDEX IF NOT EXISTS idx_party_answers_question_id           ON public.party_answers (question_id);
CREATE INDEX IF NOT EXISTS idx_pending_badge_notifications_badge_slug ON public.pending_badge_notifications (badge_slug);
CREATE INDEX IF NOT EXISTS idx_poll_questions_question_id          ON public.poll_questions (question_id);
CREATE INDEX IF NOT EXISTS idx_poll_response_answers_selected_option_id ON public.poll_response_answers (selected_option_id);
CREATE INDEX IF NOT EXISTS idx_polls_created_by                    ON public.polls (created_by);
CREATE INDEX IF NOT EXISTS idx_polls_topic_id                      ON public.polls (topic_id);
CREATE INDEX IF NOT EXISTS idx_question_news_feed_cache_article_id ON public.question_news_feed_cache (article_id);
CREATE INDEX IF NOT EXISTS idx_questions_topic_id                  ON public.questions (topic_id);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_question_id            ON public.quiz_answers (question_id);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_selected_option_id     ON public.quiz_answers (selected_option_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge_slug             ON public.user_badges (badge_slug);
CREATE INDEX IF NOT EXISTS idx_user_badges_event_id               ON public.user_badges (event_id);
CREATE INDEX IF NOT EXISTS idx_user_topic_scores_topic_id          ON public.user_topic_scores (topic_id);
CREATE INDEX IF NOT EXISTS idx_user_topics_topic_id                ON public.user_topics (topic_id);
