-- Backfill local_itemized for existing finance_reconciliation records
-- local_itemized = individual + organization + pac + party (Lines 11A + 11B + 11C)
UPDATE finance_reconciliation
SET 
  local_itemized = COALESCE(local_individual_itemized, 0) 
                 + COALESCE(local_organization, 0) 
                 + COALESCE(local_pac_contributions, 0) 
                 + COALESCE(local_party_contributions, 0),
  local_itemized_net = COALESCE(local_individual_itemized, 0) 
                     + COALESCE(local_organization, 0) 
                     + COALESCE(local_pac_contributions, 0) 
                     + COALESCE(local_party_contributions, 0),
  updated_at = NOW()
WHERE (local_itemized IS NULL OR local_itemized = 0)
  AND (COALESCE(local_individual_itemized, 0) > 0 
       OR COALESCE(local_pac_contributions, 0) > 0
       OR COALESCE(local_party_contributions, 0) > 0
       OR COALESCE(local_organization, 0) > 0);