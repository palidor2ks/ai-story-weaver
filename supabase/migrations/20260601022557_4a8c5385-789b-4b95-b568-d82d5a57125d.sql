CREATE OR REPLACE FUNCTION public._award_badge(
  p_user_id    uuid,
  p_slug       text,
  p_metadata   jsonb DEFAULT '{}'::jsonb,
  p_event_id   uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM badge_definitions WHERE slug = p_slug AND active) THEN
    RETURN false;
  END IF;
  INSERT INTO user_badges(user_id, badge_slug, metadata, event_id)
  VALUES (p_user_id, p_slug, COALESCE(p_metadata,'{}'::jsonb), p_event_id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    INSERT INTO pending_badge_notifications(user_id, badge_slug)
    VALUES (p_user_id, p_slug);
    RETURN true;
  END IF;
  RETURN false;
END $$;

DO $$
DECLARE
  r RECORD; v_scope text; v_total int; v_answered int; v_pct numeric;
  t RECORD; prof RECORD;
  v_topic_total int; v_topic_answered int; v_topic_pct numeric;
  v_started int; v_in_scope int;
BEGIN
  FOR r IN SELECT id FROM public.profiles LOOP
    PERFORM public._award_badge(r.id, 'first_step');

    IF EXISTS (SELECT 1 FROM public.user_topics WHERE user_id = r.id) THEN
      PERFORM public._award_badge(r.id, 'onboarding_graduate');
      PERFORM public._award_badge(r.id, 'priority_picker');
    END IF;

    IF EXISTS (SELECT 1 FROM public.quiz_answers qa
      JOIN public.questions q ON q.id = qa.question_id
      JOIN public.topics tp ON tp.id = q.topic_id
      WHERE qa.user_id = r.id AND (tp.scope = 'federal' OR tp.scope = 'all')
    ) THEN PERFORM public._award_badge(r.id, 'federal_foundations'); END IF;

    IF EXISTS (SELECT 1 FROM public.quiz_answers qa
      JOIN public.questions q ON q.id = qa.question_id
      JOIN public.topics tp ON tp.id = q.topic_id
      WHERE qa.user_id = r.id AND tp.scope = 'local'
    ) THEN PERFORM public._award_badge(r.id, 'local_lens'); END IF;

    SELECT * INTO prof FROM public.profiles WHERE id = r.id;
    IF prof.address IS NOT NULL AND length(prof.address) > 0 THEN PERFORM public._award_badge(r.id, 'address_added'); END IF;
    IF prof.avatar_url IS NOT NULL AND length(prof.avatar_url) > 0 THEN PERFORM public._award_badge(r.id, 'profile_photo'); END IF;
    IF prof.identity_verified IS TRUE THEN PERFORM public._award_badge(r.id, 'identity_verified'); END IF;
    IF prof.voter_verified IS TRUE THEN PERFORM public._award_badge(r.id, 'registered_voter'); END IF;
    IF prof.name IS NOT NULL AND prof.address IS NOT NULL AND prof.age IS NOT NULL
       AND prof.sex IS NOT NULL AND prof.income IS NOT NULL AND prof.political_party IS NOT NULL THEN
      PERFORM public._award_badge(r.id, 'demographics_complete');
    END IF;

    v_scope := public._user_question_scope(r.id);
    SELECT COUNT(*) INTO v_total FROM public.questions q
      JOIN public.topics tt ON tt.id = q.topic_id
      WHERE (v_scope = 'all' OR tt.scope = v_scope OR tt.scope = 'all');
    SELECT COUNT(*) INTO v_answered FROM public.quiz_answers qa
      JOIN public.questions q ON q.id = qa.question_id
      JOIN public.topics tt ON tt.id = q.topic_id
      WHERE qa.user_id = r.id AND (v_scope = 'all' OR tt.scope = v_scope OR tt.scope = 'all');
    IF v_total > 0 THEN
      v_pct := (v_answered::numeric / v_total::numeric) * 100;
      IF v_pct >=  10 THEN PERFORM public._award_badge(r.id, 'curious_citizen',  jsonb_build_object('percent', round(v_pct,1))); END IF;
      IF v_pct >=  25 THEN PERFORM public._award_badge(r.id, 'issue_scout',      jsonb_build_object('percent', round(v_pct,1))); END IF;
      IF v_pct >=  50 THEN PERFORM public._award_badge(r.id, 'halfway_heard',    jsonb_build_object('percent', round(v_pct,1))); END IF;
      IF v_pct >=  75 THEN PERFORM public._award_badge(r.id, 'policy_regular',   jsonb_build_object('percent', round(v_pct,1))); END IF;
      IF v_pct >= 100 THEN PERFORM public._award_badge(r.id, 'full_ballot',      jsonb_build_object('percent', round(v_pct,1))); END IF;
    END IF;

    FOR t IN SELECT id FROM public.topics LOOP
      SELECT COUNT(*) INTO v_topic_total FROM public.questions WHERE topic_id = t.id;
      SELECT COUNT(*) INTO v_topic_answered FROM public.quiz_answers qa
        JOIN public.questions q ON q.id = qa.question_id
        WHERE qa.user_id = r.id AND q.topic_id = t.id;
      IF v_topic_total > 0 AND v_topic_answered > 0 THEN
        v_topic_pct := (v_topic_answered::numeric / v_topic_total::numeric) * 100;
        PERFORM public._award_badge(r.id, 'topic_starter',
          jsonb_build_object('topic_id', t.id, 'scope_key', 'starter:'||t.id));
        IF v_topic_pct >= 50 THEN
          PERFORM public._award_badge(r.id, 'topic_halfway',
            jsonb_build_object('topic_id', t.id, 'scope_key', 'half:'||t.id));
        END IF;
        IF v_topic_pct >= 100 THEN
          PERFORM public._award_badge(r.id, 'topic_specialist',
            jsonb_build_object('topic_id', t.id, 'scope_key', 'spec:'||t.id));
        END IF;
      END IF;
    END LOOP;

    SELECT COUNT(*) INTO v_started FROM public.user_badges WHERE user_id = r.id AND badge_slug = 'topic_starter';
    IF v_started >= 5 THEN PERFORM public._award_badge(r.id, 'balanced_ballot'); END IF;
    SELECT COUNT(*) INTO v_in_scope FROM public.topics
      WHERE (v_scope = 'all' OR scope = v_scope OR scope = 'all');
    IF v_in_scope > 0 AND v_started >= v_in_scope THEN
      PERFORM public._award_badge(r.id, 'all_issues_explorer');
    END IF;

    IF EXISTS (SELECT 1 FROM public.profile_claims pc
      WHERE pc.user_id = r.id AND pc.status = 'approved'
    ) THEN PERFORM public._award_badge(r.id, 'profile_claimed'); END IF;
  END LOOP;
END $$;
