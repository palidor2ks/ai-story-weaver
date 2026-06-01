DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'public._award_badge(uuid,text,jsonb,uuid)',
    'public._user_question_scope(uuid)',
    'public._check_onboarding(uuid,text,jsonb,uuid)',
    'public._check_identity(uuid,text,jsonb,uuid)',
    'public._check_question_progress(uuid,text,jsonb,uuid)',
    'public._check_topic_depth(uuid,text,jsonb,uuid)',
    'public._check_engagement_misc(uuid,text,jsonb,uuid)',
    'public._check_social(uuid,text,jsonb,uuid)',
    'public._check_streaks(uuid,text,jsonb,uuid)',
    'public._check_candidate(uuid,text,jsonb,uuid)',
    'public.evaluate_badges(uuid,text,jsonb,uuid)'
  ]) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
