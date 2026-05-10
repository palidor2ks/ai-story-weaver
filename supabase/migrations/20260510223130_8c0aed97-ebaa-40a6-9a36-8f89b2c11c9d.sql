ALTER TABLE candidate_answers   DISABLE TRIGGER prevent_politician_score_tampering_trigger;
ALTER TABLE candidate_overrides DISABLE TRIGGER prevent_candidate_override_tampering_trg;
ALTER TABLE candidate_overrides DISABLE TRIGGER trg_prevent_politician_sensitive_override_changes;

SELECT _merge_candidate('H0IA01174', 'H001091');  -- Hinson
SELECT _merge_candidate('S4IA00129', 'E000295');  -- Ernst
SELECT _merge_candidate('S0IA00028', 'G000386');  -- Grassley

ALTER TABLE candidate_answers   ENABLE TRIGGER prevent_politician_score_tampering_trigger;
ALTER TABLE candidate_overrides ENABLE TRIGGER prevent_candidate_override_tampering_trg;
ALTER TABLE candidate_overrides ENABLE TRIGGER trg_prevent_politician_sensitive_override_changes;