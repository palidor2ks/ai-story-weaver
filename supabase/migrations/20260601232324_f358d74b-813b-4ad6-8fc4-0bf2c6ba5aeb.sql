CREATE OR REPLACE FUNCTION public.rebuild_donors_for_committee(
  p_committee_id text,
  p_cycle text,
  p_candidate_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  DELETE FROM public.donors d
  WHERE d.recipient_committee_id = p_committee_id
    AND d.cycle = p_cycle
    AND (
      (p_candidate_id IS NULL AND d.candidate_id IS NULL)
      OR d.candidate_id = p_candidate_id
    );

  WITH source_rows AS (
    SELECT
      c.*,
      CASE
        WHEN c.contributor_type = 'Individual' THEN
          'fec-' || substr(encode(digest(concat_ws('|',
            lower(trim(c.contributor_name)),
            lower(trim(coalesce(c.contributor_city, ''))),
            upper(trim(coalesce(c.contributor_state, ''))),
            substr(coalesce(c.contributor_zip, ''), 1, 5),
            p_committee_id,
            p_cycle
          ), 'sha256'), 'hex'), 1, 32)
        ELSE
          'fec-' || substr(encode(digest(concat_ws('|',
            lower(trim(c.contributor_name)),
            upper(trim(coalesce(c.contributor_state, ''))),
            p_committee_id,
            p_cycle
          ), 'sha256'), 'hex'), 1, 32)
      END AS donor_id,
      (
        upper(c.contributor_name) LIKE '%ACTBLUE%'
        OR upper(c.contributor_name) LIKE '%WINRED%'
        OR upper(c.contributor_name) LIKE '%DEMOCRACY ENGINE%'
      ) AS is_conduit_org,
      (
        upper(coalesce(c.memo_text, '')) LIKE '%SEE BELOW%'
        OR upper(coalesce(c.memo_text, '')) LIKE '%EARMARKED CONTRIBUTION:%'
      ) AS is_earmark_pass_through
    FROM public.contributions c
    WHERE c.recipient_committee_id = p_committee_id
      AND c.cycle = p_cycle
      AND (
        (p_candidate_id IS NULL AND c.candidate_id IS NULL)
        OR c.candidate_id = p_candidate_id
      )
  ), aggregated AS (
    SELECT
      donor_id,
      max(candidate_id) AS candidate_id,
      (array_agg(contributor_name ORDER BY receipt_date DESC NULLS LAST))[1] AS name,
      (array_agg(contributor_type ORDER BY receipt_date DESC NULLS LAST))[1]::public.donor_type AS type,
      coalesce(sum(CASE WHEN NOT is_conduit_org AND NOT is_earmark_pass_through THEN amount ELSE 0 END), 0)::integer AS amount,
      p_cycle AS cycle,
      p_committee_id AS recipient_committee_id,
      (array_agg(recipient_committee_name ORDER BY receipt_date DESC NULLS LAST))[1] AS recipient_committee_name,
      min(receipt_date) AS first_receipt_date,
      max(receipt_date) AS last_receipt_date,
      count(*)::integer AS transaction_count,
      (array_agg(contributor_city ORDER BY receipt_date DESC NULLS LAST))[1] AS contributor_city,
      (array_agg(contributor_state ORDER BY receipt_date DESC NULLS LAST))[1] AS contributor_state,
      (array_agg(contributor_zip ORDER BY receipt_date DESC NULLS LAST))[1] AS contributor_zip,
      (array_agg(employer ORDER BY receipt_date DESC NULLS LAST))[1] AS employer,
      (array_agg(occupation ORDER BY receipt_date DESC NULLS LAST))[1] AS occupation,
      (array_agg(line_number ORDER BY receipt_date DESC NULLS LAST))[1] AS line_number,
      bool_or(coalesce(is_contribution, true)) AS is_contribution,
      bool_or(coalesce(is_transfer, false)) AS is_transfer,
      bool_or(is_conduit_org) AS is_conduit_org,
      (array_agg(conduit_committee_name ORDER BY receipt_date DESC NULLS LAST) FILTER (WHERE conduit_committee_name IS NOT NULL))[1] AS conduit_name,
      (array_agg(conduit_committee_id ORDER BY receipt_date DESC NULLS LAST) FILTER (WHERE conduit_committee_id IS NOT NULL))[1] AS conduit_committee_id
    FROM source_rows
    GROUP BY donor_id
  ), inserted AS (
    INSERT INTO public.donors (
      id,
      candidate_id,
      name,
      type,
      amount,
      cycle,
      recipient_committee_id,
      recipient_committee_name,
      first_receipt_date,
      last_receipt_date,
      transaction_count,
      contributor_city,
      contributor_state,
      contributor_zip,
      employer,
      occupation,
      line_number,
      is_contribution,
      is_transfer,
      is_conduit_org,
      conduit_name,
      conduit_committee_id
    )
    SELECT
      donor_id,
      candidate_id,
      name,
      type,
      amount,
      cycle,
      recipient_committee_id,
      recipient_committee_name,
      first_receipt_date,
      last_receipt_date,
      transaction_count,
      contributor_city,
      contributor_state,
      contributor_zip,
      employer,
      occupation,
      line_number,
      is_contribution,
      is_transfer,
      is_conduit_org,
      conduit_name,
      conduit_committee_id
    FROM aggregated
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rebuild_donors_for_committee(text, text, text) TO service_role;