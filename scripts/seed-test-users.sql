-- Seed 20 test users by replaying the onboarding data model server-side.
--
-- WHY THIS EXISTS (in addition to scripts/seed-test-users.ts):
-- The TypeScript version replays the real flow via anon `signUp` + the
-- `save_user_topics`/`save_quiz_results` RPCs, but it needs network egress to the
-- Supabase host. In environments where egress is blocked (e.g. Claude Code on the
-- web with a restrictive network policy), run THIS file instead through the
-- Supabase MCP (`execute_sql`) or psql with admin/service credentials. It produces
-- the same end state in the same tables.
--
-- It is idempotent: existing seed users are reused, and a user who already has
-- quiz answers is left untouched.
--
-- PASSWORD: no credential is hardcoded. Optionally choose one for the run with
--   set seed.password = '<your-password>';
-- before this block; otherwise each user gets a throwaway random password (these
-- are disposable example.com test accounts; per-user data is protected by RLS).
--
-- The local politician is NOT stored per-user; the app derives it live from
-- `profiles.address` at view time (geocode-address -> fetch-civic-officials, which
-- auto-triggers fetch-mayor for uncached cities). Setting a real address is enough.
--
-- Scoring mirrors src/lib/scoring.ts: per-topic = average of answer values;
-- overall = average weighted by topic rank weights [5,4,3,2,1].
DO $$
DECLARE
  addresses text[] := ARRAY[
    '120 Stelton Rd, Piscataway, NJ 08854','317 Hoes Ln, Piscataway, NJ 08854',
    '920 Broad St, Newark, NJ 07102','50 Springfield Ave, Newark, NJ 07103',
    '263 Central Ave, Jersey City, NJ 07307','180 Sip Ave, Jersey City, NJ 07306',
    '100 Municipal Blvd, Edison, NJ 08817','319 E State St, Trenton, NJ 08608',
    '155 Broadway, Paterson, NJ 07505','50 Winans Ave, Elizabeth, NJ 07202',
    '600 E 4th St, Charlotte, NC 28202','2300 Selwyn Ave, Charlotte, NC 28207',
    '101 City Hall Plaza, Durham, NC 27701','300 W Washington St, Greensboro, NC 27401',
    '222 W Hargett St, Raleigh, NC 27601','101 N Main St, Winston-Salem, NC 27101',
    '70 Court Plaza, Asheville, NC 28801','305 Chestnut St, Wilmington, NC 28401',
    '316 Pittsboro St, Chapel Hill, NC 27516','316 N Academy St, Cary, NC 27513'];
  names text[] := ARRAY[
    'Alex Rivera','Jordan Chen','Taylor Patel','Morgan Johnson','Casey Nguyen','Riley Garcia',
    'Jamie Smith','Avery Kim','Quinn Brooks','Cameron Okafor','Drew Rossi','Sam Cohen',
    'Reese Murphy','Skyler Diaz','Devon Walsh','Harper Hassan','Rowan Park','Emerson Flores',
    'Parker Bauer','Sage Ahmed'];
  parties text[] := ARRAY['Democrat','Republican','Independent','Libertarian','Green Party','Other','Prefer not to say'];
  incomes text[] := ARRAY['Under $50,000','$50,000 - $100,000','$100,000 - $200,000','$200,000 - $500,000','$500,000 - $1M','$1M - $5M','Over $100M','Prefer not to say'];
  employments text[] := ARRAY['Self-employed','Employed (1 job)','Employed (multiple jobs)','Part-time employed','Student','Prefer not to say'];
  sexes text[] := ARRAY['Male','Female','Non-binary','Other','Prefer not to say'];
  educations text[] := ARRAY['Less than high school','High school diploma or GED','Some college','Associate degree','Bachelor''s degree','Master''s degree','Doctorate or professional degree','Prefer not to say'];
  races text[] := ARRAY['Asian','Black or African American','Hispanic or Latino','Middle Eastern or North African','White','Multiracial','Other','Prefer not to say'];
  religions text[] := ARRAY['Catholic','Baptist','Non-denominational Christian','Sunni','Reform Jewish','Zen','Hinduism (General)','Sikhism','Atheist','Agnostic','None','Spiritual but not religious'];
  weights int[] := ARRAY[5,4,3,2,1];
  i int; j int; uid uuid; em text; addr text; loc text;
  sel_topics text[]; overall numeric; ans_count int;
BEGIN
  FOR i IN 1..20 LOOP
    em := 'polipulse-seed-' || lpad(i::text,2,'0') || '@example.com';
    addr := addresses[i];
    loc := trim(split_part(addr, ',', 2)) || ', ' || split_part(trim(split_part(addr, ',', 3)), ' ', 1);

    -- 1. create auth user + identity if absent (trigger creates the profiles row)
    SELECT id INTO uid FROM auth.users WHERE email = em;
    IF uid IS NULL THEN
      uid := gen_random_uuid();
      INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
          email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          is_sso_user, is_anonymous)
      VALUES (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', em,
          crypt(coalesce(nullif(current_setting('seed.password', true), ''),
                         'seed-' || lpad(i::text,2,'0') || '-' || gen_random_uuid()::text),
                gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('name', names[i]), now(), now(), false, false);
      INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (uid::text, uid, jsonb_build_object('sub', uid::text, 'email', em), 'email', now(), now(), now());
    END IF;

    -- 2. profile demographics + address (random per user)
    UPDATE profiles SET
      name = names[i], address = addr, location = loc,
      political_party = parties[1 + floor(random()*array_length(parties,1))::int],
      age = 18 + floor(random()*73)::int,
      income = incomes[1 + floor(random()*array_length(incomes,1))::int],
      employment_status = employments[1 + floor(random()*array_length(employments,1))::int],
      sex = sexes[1 + floor(random()*array_length(sexes,1))::int],
      education_level = educations[1 + floor(random()*array_length(educations,1))::int],
      race = races[1 + floor(random()*array_length(races,1))::int],
      religion = religions[1 + floor(random()*array_length(religions,1))::int],
      updated_at = now()
    WHERE id = uid;

    -- idempotent: skip quiz if already answered
    SELECT count(*) INTO ans_count FROM quiz_answers WHERE user_id = uid;
    IF ans_count > 0 THEN CONTINUE; END IF;

    -- 3. pick 3 random federal + 2 random local topics that have canonical questions
    sel_topics := ARRAY(
      SELECT id FROM (
        SELECT t.id FROM topics t WHERE t.scope <> 'local'
          AND EXISTS (SELECT 1 FROM questions q WHERE q.topic_id=t.id AND q.is_onboarding_canonical)
        ORDER BY random() LIMIT 3) a)
    || ARRAY(
      SELECT id FROM (
        SELECT t.id FROM topics t WHERE t.scope = 'local'
          AND EXISTS (SELECT 1 FROM questions q WHERE q.topic_id=t.id AND q.is_onboarding_canonical)
        ORDER BY random() LIMIT 2) b);

    -- 4. user_topics with rank weights 5,4,3,2,1
    FOR j IN 1..array_length(sel_topics,1) LOOP
      INSERT INTO user_topics (user_id, topic_id, weight)
      VALUES (uid, sel_topics[j], weights[j])
      ON CONFLICT (user_id, topic_id) DO UPDATE SET weight = excluded.weight;
    END LOOP;

    -- 5. one random non-skip option per canonical question in selected topics
    INSERT INTO quiz_answers (user_id, question_id, selected_option_id, value)
    SELECT uid, q.id, picked.id, picked.value
    FROM questions q
    JOIN LATERAL (
      SELECT o.id, o.value FROM question_options o
      WHERE o.question_id = q.id AND coalesce(o.is_skip_option,false)=false
      ORDER BY random() LIMIT 1
    ) picked ON true
    WHERE q.is_onboarding_canonical AND q.topic_id = ANY(sel_topics)
    ON CONFLICT (user_id, question_id) DO UPDATE
      SET selected_option_id = excluded.selected_option_id, value = excluded.value;

    -- 6. per-topic average score
    INSERT INTO user_topic_scores (user_id, topic_id, score, updated_at)
    SELECT uid, q.topic_id, round(avg(qa.value)::numeric, 2), now()
    FROM quiz_answers qa JOIN questions q ON q.id = qa.question_id
    WHERE qa.user_id = uid AND q.topic_id = ANY(sel_topics)
    GROUP BY q.topic_id
    ON CONFLICT (user_id, topic_id) DO UPDATE SET score = excluded.score, updated_at = now();

    -- 7. weighted overall, written to the profile
    SELECT round(sum(uts.score * ut.weight)/nullif(sum(ut.weight),0), 2) INTO overall
    FROM user_topic_scores uts JOIN user_topics ut
      ON ut.user_id = uts.user_id AND ut.topic_id = uts.topic_id
    WHERE uts.user_id = uid;
    UPDATE profiles SET overall_score = coalesce(overall,0), score_version='v1.0', updated_at=now() WHERE id = uid;
  END LOOP;
END $$;
