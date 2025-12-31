-- Delete all existing party answers to force regeneration with new evidence-only prompts
DELETE FROM party_answers;

-- Log the cleanup
DO $$
BEGIN
  RAISE NOTICE 'Deleted all party_answers for evidence-only regeneration';
END $$;