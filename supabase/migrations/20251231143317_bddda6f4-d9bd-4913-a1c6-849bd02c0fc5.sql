
UPDATE donor_aliases
SET alias_patterns = ARRAY['%AIPAC%', '%AMERICAN ISRAEL PUBLIC AFFAIRS%'],
    updated_at = now()
WHERE id = '3d355306-7e7a-437a-a1a8-a93549661a71';
