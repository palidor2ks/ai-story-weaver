-- UNITED 2024 (C00880906) was created to support Curtis Shaw, so give it
-- a specific candidate-support cause instead of the generic progressive tag.
INSERT INTO public.committee_causes (
  id,
  label,
  stance,
  issue,
  quiz_topic_id,
  description,
  aliases,
  status,
  created_by,
  ai_reasoning
)
VALUES (
  'pro-curtis-shaw',
  'Pro-Curtis Shaw',
  'pro',
  'Curtis Shaw',
  'government',
  'Supports Curtis Shaw election efforts',
  ARRAY['Curtis Shaw', 'Shaw', 'UNITED 2024'],
  'active',
  'admin',
  'Admin override: UNITED 2024 was identified as a committee created to help Curtis Shaw get elected.'
)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  stance = EXCLUDED.stance,
  issue = EXCLUDED.issue,
  quiz_topic_id = EXCLUDED.quiz_topic_id,
  description = EXCLUDED.description,
  aliases = EXCLUDED.aliases,
  status = EXCLUDED.status,
  created_by = EXCLUDED.created_by,
  ai_reasoning = EXCLUDED.ai_reasoning,
  updated_at = now();

INSERT INTO public.committee_topics (
  fec_committee_id,
  primary_cause_id,
  secondary_cause_ids,
  assigned_by,
  ai_confidence,
  ai_reasoning,
  admin_overridden
)
VALUES (
  'C00880906',
  'pro-curtis-shaw',
  ARRAY[]::text[],
  'admin',
  'high',
  'Admin override: UNITED 2024 was created for the purpose of helping Curtis Shaw get elected.',
  true
)
ON CONFLICT (fec_committee_id) DO UPDATE SET
  primary_cause_id = EXCLUDED.primary_cause_id,
  secondary_cause_ids = EXCLUDED.secondary_cause_ids,
  assigned_by = EXCLUDED.assigned_by,
  ai_confidence = EXCLUDED.ai_confidence,
  ai_reasoning = EXCLUDED.ai_reasoning,
  admin_overridden = EXCLUDED.admin_overridden,
  updated_at = now();
