UPDATE public.candidate_committees cc
SET name = sub.n,
    updated_at = now()
FROM (
  SELECT DISTINCT ON (recipient_committee_id)
         recipient_committee_id,
         recipient_committee_name AS n
  FROM public.contributions
  WHERE recipient_committee_name IS NOT NULL
    AND recipient_committee_name <> ''
  ORDER BY recipient_committee_id, receipt_date DESC NULLS LAST
) sub
WHERE cc.name IS NULL
  AND cc.fec_committee_id = sub.recipient_committee_id;