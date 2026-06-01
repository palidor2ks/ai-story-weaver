-- =====================================================================
-- GAMIFICATION & BADGES — Phase 1 schema + engine + seed
-- =====================================================================

-- ---------- ENUMS ----------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.badge_category AS ENUM (
    'onboarding','progress','topic','engagement','social','candidate'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- badge_definitions ----------------------------------------
CREATE TABLE IF NOT EXISTS public.badge_definitions (
  slug          text PRIMARY KEY,
  name          text NOT NULL,
  description   text NOT NULL,
  category      public.badge_category NOT NULL,
  tier          int,
  icon          text,
  points        int NOT NULL DEFAULT 0,
  is_repeatable boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true,
  priority      int NOT NULL DEFAULT 0,
  criteria      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.badge_definitions TO anon, authenticated;
GRANT ALL    ON public.badge_definitions TO service_role;

ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "badge_definitions public read"
  ON public.badge_definitions FOR SELECT
  USING (true);

CREATE POLICY "badge_definitions admin write"
  ON public.badge_definitions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ---------- user_activity_events -------------------------------------
CREATE TABLE IF NOT EXISTS public.user_activity_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  event_type  text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  day_key     date GENERATED ALWAYS AS ((created_at AT TIME ZONE 'UTC')::date) STORED
);

CREATE INDEX IF NOT EXISTS idx_uae_user_created
  ON public.user_activity_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_uae_user_type_day
  ON public.user_activity_events(user_id, event_type, day_key);

GRANT SELECT ON public.user_activity_events TO authenticated;
GRANT ALL    ON public.user_activity_events TO service_role;

ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uae own select"
  ON public.user_activity_events FOR SELECT
  USING (user_id = auth.uid());

-- inserts go through log_user_event() only

-- ---------- user_badges ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_badges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  badge_slug  text NOT NULL REFERENCES public.badge_definitions(slug) ON DELETE CASCADE,
  awarded_at  timestamptz NOT NULL DEFAULT now(),
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  scope_key   text GENERATED ALWAYS AS (COALESCE(metadata->>'scope_key', '')) STORED,
  event_id    uuid REFERENCES public.user_activity_events(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_badges_one_time
  ON public.user_badges(user_id, badge_slug)
  WHERE scope_key = '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_badges_scoped
  ON public.user_badges(user_id, badge_slug, scope_key)
  WHERE scope_key <> '';

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON public.user_badges(user_id);

GRANT SELECT ON public.user_badges TO authenticated;
GRANT ALL    ON public.user_badges TO service_role;

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_badges own or public profile"
  ON public.user_badges FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_badges.user_id
  ));

-- ---------- pending_badge_notifications ------------------------------
CREATE TABLE IF NOT EXISTS public.pending_badge_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  badge_slug  text NOT NULL REFERENCES public.badge_definitions(slug) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pbn_user ON public.pending_badge_notifications(user_id, created_at DESC);

GRANT SELECT, DELETE ON public.pending_badge_notifications TO authenticated;
GRANT ALL ON public.pending_badge_notifications TO service_role;

ALTER TABLE public.pending_badge_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pbn own select" ON public.pending_badge_notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "pbn own delete" ON public.pending_badge_notifications
  FOR DELETE USING (user_id = auth.uid());

-- ---------- helpers --------------------------------------------------
CREATE OR REPLACE FUNCTION public._award_badge(
  p_user_id    uuid,
  p_slug       text,
  p_metadata   jsonb DEFAULT '{}'::jsonb,
  p_event_id   uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inserted boolean := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM badge_definitions WHERE slug = p_slug AND active) THEN
    RETURN false;
  END IF;

  INSERT INTO user_badges(user_id, badge_slug, metadata, event_id)
  VALUES (p_user_id, p_slug, COALESCE(p_metadata,'{}'::jsonb), p_event_id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted THEN
    INSERT INTO pending_badge_notifications(user_id, badge_slug)
    VALUES (p_user_id, p_slug);
  END IF;
  RETURN v_inserted > 0;
END $$;

-- Compute user scope ('federal' | 'local' | 'all') from their topics
CREATE OR REPLACE FUNCTION public._user_question_scope(p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ut AS (
    SELECT t.scope FROM user_topics u JOIN topics t ON t.id = u.topic_id
    WHERE u.user_id = p_user_id
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM ut WHERE scope = 'local')
     AND NOT EXISTS (SELECT 1 FROM ut WHERE scope IN ('all','federal')) THEN 'local'
    WHEN EXISTS (SELECT 1 FROM ut WHERE scope IN ('all','federal')) THEN 'all'
    ELSE 'all'
  END;
$$;

-- ---------- Badge checkers -------------------------------------------

-- Onboarding family
CREATE OR REPLACE FUNCTION public._check_onboarding(p_user uuid, p_event text, p_payload jsonb, p_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_demo_complete boolean;
  v_topics_count int;
BEGIN
  -- First Step: any event implies an authenticated user exists
  PERFORM _award_badge(p_user, 'first_step', '{}'::jsonb, p_event_id);

  IF p_event = 'onboarding_completed' THEN
    PERFORM _award_badge(p_user, 'onboarding_graduate', '{}'::jsonb, p_event_id);
  END IF;

  IF p_event = 'priority_picker' THEN
    SELECT COUNT(*) INTO v_topics_count FROM user_topics WHERE user_id = p_user;
    IF v_topics_count > 0 THEN
      PERFORM _award_badge(p_user, 'priority_picker', '{}'::jsonb, p_event_id);
    END IF;
  END IF;

  IF p_event = 'federal_quiz_completed' THEN
    PERFORM _award_badge(p_user, 'federal_foundations', '{}'::jsonb, p_event_id);
  END IF;

  IF p_event = 'local_quiz_completed' THEN
    PERFORM _award_badge(p_user, 'local_lens', '{}'::jsonb, p_event_id);
  END IF;

  IF p_event = 'address_added' THEN
    PERFORM _award_badge(p_user, 'address_added', '{}'::jsonb, p_event_id);
  END IF;

  IF p_event = 'avatar_uploaded' THEN
    PERFORM _award_badge(p_user, 'profile_photo', '{}'::jsonb, p_event_id);
  END IF;

  IF p_event = 'demographics_updated' THEN
    SELECT (
      p.name IS NOT NULL AND p.address IS NOT NULL AND p.age IS NOT NULL
      AND p.sex IS NOT NULL AND p.income IS NOT NULL AND p.political_party IS NOT NULL
    ) INTO v_demo_complete
    FROM profiles p WHERE p.id = p_user;
    IF COALESCE(v_demo_complete, false) THEN
      PERFORM _award_badge(p_user, 'demographics_complete', '{}'::jsonb, p_event_id);
    END IF;
  END IF;
END $$;

-- Identity family
CREATE OR REPLACE FUNCTION public._check_identity(p_user uuid, p_event text, p_payload jsonb, p_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_event = 'identity_verified' THEN
    PERFORM _award_badge(p_user, 'identity_verified', '{}'::jsonb, p_event_id);
  ELSIF p_event = 'voter_verified' THEN
    PERFORM _award_badge(p_user, 'registered_voter', '{}'::jsonb, p_event_id);
  END IF;
END $$;

-- Question-progress ladder
CREATE OR REPLACE FUNCTION public._check_question_progress(p_user uuid, p_event text, p_payload jsonb, p_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_scope text;
  v_total int;
  v_answered int;
  v_pct numeric;
BEGIN
  IF p_event <> 'question_answered' THEN RETURN; END IF;

  v_scope := _user_question_scope(p_user);

  SELECT COUNT(*) INTO v_total
  FROM questions q JOIN topics t ON t.id = q.topic_id
  WHERE (v_scope = 'all' OR t.scope = v_scope OR t.scope = 'all');

  SELECT COUNT(*) INTO v_answered
  FROM quiz_answers qa
  JOIN questions q ON q.id = qa.question_id
  JOIN topics t ON t.id = q.topic_id
  WHERE qa.user_id = p_user
    AND (v_scope = 'all' OR t.scope = v_scope OR t.scope = 'all');

  IF v_total = 0 THEN RETURN; END IF;
  v_pct := (v_answered::numeric / v_total::numeric) * 100;

  IF v_pct >=  10 THEN PERFORM _award_badge(p_user, 'curious_citizen',  jsonb_build_object('percent', round(v_pct,1)), p_event_id); END IF;
  IF v_pct >=  25 THEN PERFORM _award_badge(p_user, 'issue_scout',      jsonb_build_object('percent', round(v_pct,1)), p_event_id); END IF;
  IF v_pct >=  50 THEN PERFORM _award_badge(p_user, 'halfway_heard',    jsonb_build_object('percent', round(v_pct,1)), p_event_id); END IF;
  IF v_pct >=  75 THEN PERFORM _award_badge(p_user, 'policy_regular',   jsonb_build_object('percent', round(v_pct,1)), p_event_id); END IF;
  IF v_pct >= 100 THEN PERFORM _award_badge(p_user, 'full_ballot',      jsonb_build_object('percent', round(v_pct,1)), p_event_id); END IF;
END $$;

-- Topic-depth badges (per-topic, repeatable via scope_key)
CREATE OR REPLACE FUNCTION public._check_topic_depth(p_user uuid, p_event text, p_payload jsonb, p_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_topic text;
  v_total int;
  v_answered int;
  v_pct numeric;
  v_started_count int;
  v_user_scope text;
  v_in_scope_count int;
  v_scope_started int;
BEGIN
  IF p_event <> 'question_answered' THEN RETURN; END IF;
  v_topic := p_payload->>'topic_id';
  IF v_topic IS NULL THEN RETURN; END IF;

  SELECT COUNT(*) INTO v_total FROM questions WHERE topic_id = v_topic;
  SELECT COUNT(*) INTO v_answered
    FROM quiz_answers qa JOIN questions q ON q.id = qa.question_id
   WHERE qa.user_id = p_user AND q.topic_id = v_topic;

  IF v_total = 0 OR v_answered = 0 THEN RETURN; END IF;
  v_pct := (v_answered::numeric / v_total::numeric) * 100;

  PERFORM _award_badge(p_user, 'topic_starter',
    jsonb_build_object('topic_id', v_topic, 'scope_key', 'starter:'||v_topic), p_event_id);

  IF v_pct >= 50 THEN
    PERFORM _award_badge(p_user, 'topic_halfway',
      jsonb_build_object('topic_id', v_topic, 'scope_key', 'half:'||v_topic), p_event_id);
  END IF;

  IF v_pct >= 100 THEN
    PERFORM _award_badge(p_user, 'topic_specialist',
      jsonb_build_object('topic_id', v_topic, 'scope_key', 'spec:'||v_topic), p_event_id);
  END IF;

  -- Balanced Ballot: ≥5 distinct topics started
  SELECT COUNT(DISTINCT metadata->>'topic_id') INTO v_started_count
    FROM user_badges WHERE user_id = p_user AND badge_slug = 'topic_starter';
  IF v_started_count >= 5 THEN
    PERFORM _award_badge(p_user, 'balanced_ballot', '{}'::jsonb, p_event_id);
  END IF;

  -- All-Issues Explorer: starter in every in-scope topic
  v_user_scope := _user_question_scope(p_user);
  SELECT COUNT(*) INTO v_in_scope_count FROM topics
   WHERE (v_user_scope = 'all' OR scope = v_user_scope OR scope = 'all');
  IF v_in_scope_count > 0 AND v_started_count >= v_in_scope_count THEN
    PERFORM _award_badge(p_user, 'all_issues_explorer', '{}'::jsonb, p_event_id);
  END IF;
END $$;

-- Engagement misc (one-shot triggers)
CREATE OR REPLACE FUNCTION public._check_engagement_misc(p_user uuid, p_event text, p_payload jsonb, p_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_event = 'match_viewed'    THEN PERFORM _award_badge(p_user, 'first_match',     '{}'::jsonb, p_event_id); END IF;
  IF p_event = 'poll_completed'  THEN PERFORM _award_badge(p_user, 'poll_participant','{}'::jsonb, p_event_id); END IF;
  IF p_event = 'election_viewed' THEN PERFORM _award_badge(p_user, 'election_ready',  '{}'::jsonb, p_event_id); END IF;
  IF p_event = 'donor_viewed'    THEN PERFORM _award_badge(p_user, 'money_trail',     '{}'::jsonb, p_event_id); END IF;
  IF p_event = 'scoring_viewed'  THEN PERFORM _award_badge(p_user, 'score_explorer',  '{}'::jsonb, p_event_id); END IF;
END $$;

-- Social/share (target-keyed via scope_key)
CREATE OR REPLACE FUNCTION public._check_social(p_user uuid, p_event text, p_payload jsonb, p_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target text;
  v_kind   text;
BEGIN
  IF p_event = 'share_completed' THEN
    v_target := COALESCE(p_payload->>'target_id', '');
    v_kind   := COALESCE(p_payload->>'target_type', '');

    PERFORM _award_badge(p_user, 'first_share', '{}'::jsonb, p_event_id);
    PERFORM _award_badge(p_user, 'conversation_starter',
      jsonb_build_object('scope_key', v_kind||':'||v_target), p_event_id);

    IF v_kind IN ('candidate','representative','match') THEN
      PERFORM _award_badge(p_user, 'match_messenger',
        jsonb_build_object('scope_key', v_kind||':'||v_target), p_event_id);
    END IF;
    IF v_kind IN ('donor','committee') THEN
      PERFORM _award_badge(p_user, 'donor_detective',
        jsonb_build_object('scope_key', v_kind||':'||v_target), p_event_id);
    END IF;
  ELSIF p_event = 'referral_sent' THEN
    PERFORM _award_badge(p_user, 'civic_inviter', '{}'::jsonb, p_event_id);
  ELSIF p_event = 'referral_signup' THEN
    PERFORM _award_badge(p_user, 'community_builder', '{}'::jsonb, p_event_id);
  END IF;
END $$;

-- Engagement / streaks
CREATE OR REPLACE FUNCTION public._check_streaks(p_user uuid, p_event text, p_payload jsonb, p_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_distinct_week int;
  v_streak int;
  v_prev_event_at timestamptz;
  v_first_event_month date;
  v_last_event_month date;
  v_news_24h int;
BEGIN
  -- Weekly Pulse: 3 distinct days in last 7 days
  SELECT COUNT(DISTINCT day_key) INTO v_distinct_week
    FROM user_activity_events
   WHERE user_id = p_user AND day_key > v_today - 7;
  IF v_distinct_week >= 3 THEN
    PERFORM _award_badge(p_user, 'weekly_pulse',
      jsonb_build_object('scope_key', 'wk:'||to_char(v_today,'IYYY-IW')), p_event_id);
  END IF;

  -- Civic Streak: 7 consecutive day_keys ending today
  WITH days AS (
    SELECT DISTINCT day_key FROM user_activity_events
     WHERE user_id = p_user AND day_key > v_today - 14
  ), grp AS (
    SELECT day_key, (day_key - (row_number() OVER (ORDER BY day_key))::int) AS g FROM days
  ), runs AS (
    SELECT g, COUNT(*) AS len, MAX(day_key) AS end_day FROM grp GROUP BY g
  )
  SELECT COALESCE(MAX(len),0) INTO v_streak FROM runs WHERE end_day = v_today;
  IF v_streak >= 7 THEN
    PERFORM _award_badge(p_user, 'civic_streak',
      jsonb_build_object('scope_key','streak:'||to_char(v_today,'YYYY-MM-DD')), p_event_id);
  END IF;

  -- Comeback Voter: prior event >7d ago and current event is question_answered
  IF p_event = 'question_answered' THEN
    SELECT MAX(created_at) INTO v_prev_event_at FROM user_activity_events
     WHERE user_id = p_user AND id <> COALESCE(p_event_id, gen_random_uuid());
    IF v_prev_event_at IS NOT NULL AND now() - v_prev_event_at > interval '7 days' THEN
      PERFORM _award_badge(p_user, 'comeback_voter', '{}'::jsonb, p_event_id);
    END IF;
  END IF;

  -- Monthly Check-In: event in a new calendar month vs first event
  SELECT MIN(day_key), MAX(day_key) INTO v_first_event_month, v_last_event_month
    FROM user_activity_events WHERE user_id = p_user;
  IF v_first_event_month IS NOT NULL AND v_last_event_month IS NOT NULL
     AND date_trunc('month', v_last_event_month) > date_trunc('month', v_first_event_month) THEN
    PERFORM _award_badge(p_user, 'monthly_checkin',
      jsonb_build_object('scope_key','mo:'||to_char(v_today,'YYYY-MM')), p_event_id);
  END IF;

  -- News Reader: ≥3 news_opened in last 24h
  IF p_event = 'news_opened' THEN
    SELECT COUNT(*) INTO v_news_24h FROM user_activity_events
      WHERE user_id = p_user AND event_type = 'news_opened'
        AND created_at > now() - interval '24 hours';
    IF v_news_24h >= 3 THEN
      PERFORM _award_badge(p_user, 'news_reader',
        jsonb_build_object('scope_key','news:'||to_char(v_today,'YYYY-MM-DD')), p_event_id);
    END IF;
  END IF;

  -- Fresh Perspective
  IF p_event = 'quiz_retaken' THEN
    PERFORM _award_badge(p_user, 'fresh_perspective',
      jsonb_build_object('scope_key','retake:'||to_char(v_today,'YYYY-MM-DD')), p_event_id);
  END IF;
END $$;

-- Candidate-side badges
CREATE OR REPLACE FUNCTION public._check_candidate(p_user uuid, p_event text, p_payload jsonb, p_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_event = 'profile_claimed'      THEN PERFORM _award_badge(p_user, 'profile_claimed',  '{}'::jsonb, p_event_id); END IF;
  IF p_event = 'platform_first_answer'THEN PERFORM _award_badge(p_user, 'platform_builder', '{}'::jsonb, p_event_id); END IF;
  IF p_event = 'platform_complete'    THEN PERFORM _award_badge(p_user, 'platform_complete','{}'::jsonb, p_event_id); END IF;
  IF p_event = 'evidence_added'       THEN PERFORM _award_badge(p_user, 'evidence_added',   '{}'::jsonb, p_event_id); END IF;
  IF p_event = 'finance_synced'       THEN PERFORM _award_badge(p_user, 'finance_synced',   '{}'::jsonb, p_event_id); END IF;
END $$;

-- Dispatcher
CREATE OR REPLACE FUNCTION public.evaluate_badges(p_user uuid, p_event text, p_payload jsonb, p_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Per-user serialization to avoid race double-award attempts
  PERFORM pg_advisory_xact_lock(hashtext(p_user::text));

  PERFORM _check_onboarding(p_user, p_event, p_payload, p_event_id);
  PERFORM _check_identity(p_user, p_event, p_payload, p_event_id);
  PERFORM _check_question_progress(p_user, p_event, p_payload, p_event_id);
  PERFORM _check_topic_depth(p_user, p_event, p_payload, p_event_id);
  PERFORM _check_engagement_misc(p_user, p_event, p_payload, p_event_id);
  PERFORM _check_social(p_user, p_event, p_payload, p_event_id);
  PERFORM _check_streaks(p_user, p_event, p_payload, p_event_id);
  PERFORM _check_candidate(p_user, p_event, p_payload, p_event_id);
END $$;

-- Public entry point
CREATE OR REPLACE FUNCTION public.log_user_event(p_event_type text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_event_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_event_type IS NULL OR length(p_event_type) = 0 OR length(p_event_type) > 64 THEN
    RAISE EXCEPTION 'Invalid event type';
  END IF;

  INSERT INTO user_activity_events(user_id, event_type, payload)
  VALUES (v_user, p_event_type, COALESCE(p_payload,'{}'::jsonb))
  RETURNING id INTO v_event_id;

  PERFORM evaluate_badges(v_user, p_event_type, COALESCE(p_payload,'{}'::jsonb), v_event_id);
  RETURN v_event_id;
END $$;

REVOKE ALL ON FUNCTION public.log_user_event(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_user_event(text, jsonb) TO authenticated;

-- ---------- Seed badge_definitions -----------------------------------
INSERT INTO public.badge_definitions(slug, name, description, category, tier, icon, points, is_repeatable, priority) VALUES
  -- Core
  ('first_step',           'First Step',            'Created your account and entered the app.',                      'onboarding', NULL, '🚀', 5,  false, 0),
  ('onboarding_graduate',  'Onboarding Graduate',   'Completed onboarding.',                                          'onboarding', NULL, '🎓', 10, false, 1),
  ('priority_picker',      'Priority Picker',       'Chose your priority topics.',                                    'onboarding', NULL, '🎯', 5,  false, 0),
  ('federal_foundations',  'Federal Foundations',   'Finished the federal onboarding quiz.',                          'onboarding', NULL, '🏛️', 10, false, 1),
  ('local_lens',           'Local Lens',            'Answered local onboarding questions for your area.',             'onboarding', NULL, '📍', 10, false, 0),
  ('identity_verified',    'Identity Verified',     'Completed ID.me identity verification.',                         'onboarding', NULL, '🪪', 15, false, 1),
  ('registered_voter',     'Registered Voter',      'Completed voter verification.',                                  'onboarding', NULL, '🗳️', 15, false, 0),
  ('demographics_complete','Demographics Complete', 'Filled out every demographic field.',                            'onboarding', NULL, '📋', 10, false, 1),
  ('address_added',        'Address Added',         'Saved an address to unlock local features.',                     'onboarding', NULL, '🏠', 5,  false, 0),
  ('profile_photo',        'Profile Photo',         'Uploaded an avatar.',                                            'onboarding', NULL, '🖼️', 5,  false, 0),
  ('first_match',          'First Match',           'Viewed your first personalized match.',                          'engagement', NULL, '✨', 5,  false, 0),
  ('first_share',          'First Share',           'Shared something from the app.',                                 'social',     NULL, '📤', 5,  false, 0),
  ('poll_participant',     'Poll Participant',      'Completed a poll.',                                              'engagement', NULL, '📊', 5,  false, 0),
  ('election_ready',       'Election Ready',        'Viewed upcoming elections for your area.',                       'engagement', NULL, '📅', 5,  false, 0),
  ('money_trail',          'Money Trail',           'Explored donor, committee, or top-spender details.',             'engagement', NULL, '💰', 5,  false, 0),
  ('score_explorer',       'Score Explorer',        'Opened a scoring explanation.',                                  'engagement', NULL, '🔎', 5,  false, 0),
  -- Question-progress ladder
  ('curious_citizen',      'Curious Citizen',       'Answered 10% of available questions.',                           'progress', 1, '🌱', 5,  false, 1),
  ('issue_scout',          'Issue Scout',           'Answered 25% of available questions.',                           'progress', 2, '🧭', 10, false, 1),
  ('halfway_heard',        'Halfway Heard',         'Answered 50% of available questions.',                           'progress', 3, '🎚️', 15, false, 1),
  ('policy_regular',       'Policy Regular',        'Answered 75% of available questions.',                           'progress', 4, '📚', 20, false, 1),
  ('full_ballot',          'Full Ballot',           'Answered 100% of available questions.',                          'progress', 5, '🏆', 30, false, 1),
  -- Topic-depth (repeatable per-topic)
  ('topic_starter',        'Topic Starter',         'Answered your first question in a topic.',                       'topic',    1, '🔰', 3,  true,  1),
  ('topic_halfway',        'Topic Halfway',         'Answered 50% of a topic''s questions.',                          'topic',    2, '⛰️', 10, true,  1),
  ('topic_specialist',     'Topic Specialist',      'Answered every question in a topic.',                            'topic',    3, '🎖️', 20, true,  1),
  ('balanced_ballot',      'Balanced Ballot',       'Started at least five different topics.',                        'topic',  NULL, '⚖️', 15, false, 0),
  ('all_issues_explorer',  'All-Issues Explorer',   'Touched every topic in your scope.',                             'topic',  NULL, '🌐', 25, false, 0),
  -- Engagement / retention
  ('comeback_voter',       'Comeback Voter',        'Returned after a week and answered another question.',           'engagement', NULL, '🔁', 10, false, 0),
  ('weekly_pulse',         'Weekly Pulse',          'Showed up on three different days in one week.',                 'engagement', NULL, '📈', 10, true,  0),
  ('civic_streak',         'Civic Streak',          'Completed an eligible action seven days in a row.',              'engagement', NULL, '🔥', 25, true,  0),
  ('monthly_checkin',      'Monthly Check-In',      'Came back in a new month.',                                      'engagement', NULL, '📆', 10, true,  0),
  ('fresh_perspective',    'Fresh Perspective',     'Retook a quiz and changed at least one answer.',                 'engagement', NULL, '🌀', 10, true,  0),
  ('news_reader',          'News Reader',           'Opened multiple relevant-news stories.',                         'engagement', NULL, '📰', 10, true,  0),
  -- Social / advocacy
  ('conversation_starter', 'Conversation Starter',  'Shared a generated card or result.',                             'social',   NULL, '💬', 5,  true,  0),
  ('match_messenger',      'Match Messenger',       'Shared a candidate or representative match.',                    'social',   NULL, '📨', 10, true,  0),
  ('donor_detective',      'Donor Detective',       'Shared donor or committee information.',                         'social',   NULL, '🕵️', 10, true,  0),
  ('civic_inviter',        'Civic Inviter',         'Sent an invite or referral link.',                               'social',   NULL, '📩', 10, false, 0),
  ('community_builder',    'Community Builder',     'A referred user signed up and completed onboarding.',            'social',   NULL, '🤝', 25, false, 0),
  -- Candidate / official
  ('profile_claimed',      'Profile Claimed',       'Your candidate/official profile claim was approved.',            'candidate', NULL, '✅', 10, false, 0),
  ('platform_builder',     'Platform Builder',      'Answered your first policy question as a candidate.',            'candidate', NULL, '🏗️', 10, false, 0),
  ('platform_complete',    'Platform Complete',     'Reached 100% answer coverage as a candidate.',                   'candidate', NULL, '📘', 30, false, 0),
  ('evidence_added',       'Evidence Added',        'Attached evidence or source context to an answer.',              'candidate', NULL, '📎', 10, true,  0),
  ('finance_synced',       'Finance Synced',        'Refreshed your campaign-finance data.',                          'candidate', NULL, '💵', 10, true,  0)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  tier = EXCLUDED.tier,
  icon = EXCLUDED.icon,
  points = EXCLUDED.points,
  is_repeatable = EXCLUDED.is_repeatable,
  priority = EXCLUDED.priority,
  updated_at = now();
