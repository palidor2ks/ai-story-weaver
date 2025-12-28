-- Make candidate_id nullable in candidate_committees to allow "orphan" committees (Super PACs, etc.)
ALTER TABLE candidate_committees ALTER COLUMN candidate_id DROP NOT NULL;