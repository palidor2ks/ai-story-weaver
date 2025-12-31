-- Clean-slate regeneration for Trump and Vance
-- Delete existing answers so they can be regenerated with corrected scoring

DELETE FROM candidate_answers WHERE candidate_id IN ('federal_president', 'federal_vice_president');

DELETE FROM candidate_overrides WHERE candidate_id IN ('federal_president', 'federal_vice_president');