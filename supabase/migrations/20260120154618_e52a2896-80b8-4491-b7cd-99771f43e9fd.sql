-- Create conduit_organizations reference table
CREATE TABLE IF NOT EXISTS public.conduit_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type TEXT DEFAULT 'payment_processor',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.conduit_organizations ENABLE ROW LEVEL SECURITY;

-- Allow public read access (reference data)
CREATE POLICY "Conduit organizations are publicly readable"
  ON public.conduit_organizations
  FOR SELECT
  USING (true);

-- Insert known conduit organizations
INSERT INTO public.conduit_organizations (name, type) VALUES
  ('ACTBLUE', 'payment_processor'),
  ('ACTBLUE TECHNICAL SERVICES', 'payment_processor'),
  ('ACTBLUE VENDOR SERVICES', 'payment_processor'),
  ('ACTBLUE OF CALIFORNIA', 'payment_processor'),
  ('ACTBLUE CONDUIT COMMITTEE', 'payment_processor'),
  ('DEMOCRACY ENGINE', 'payment_processor'),
  ('DEMOCRACY ENGINE LLC', 'payment_processor'),
  ('WINRED', 'payment_processor'),
  ('WINRED INC', 'payment_processor'),
  ('WINRED TECHNICAL SERVICES', 'payment_processor'),
  ('ANEDOT', 'payment_processor'),
  ('ANEDOT INC', 'payment_processor')
ON CONFLICT (name) DO NOTHING;

-- Drop and recreate get_contribution_totals to exclude conduit organizations
DROP FUNCTION IF EXISTS public.get_contribution_totals(text, text);

CREATE OR REPLACE FUNCTION public.get_contribution_totals(p_candidate_id text, p_cycle text)
RETURNS TABLE (
  individual_total numeric,
  organization_total numeric,
  pac_total numeric,
  party_total numeric,
  transfer_total numeric,
  loan_total numeric,
  other_total numeric,
  earmarked_total numeric,
  memo_x_total numeric,
  conduit_excluded numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Individual contributions (Line 11AI, not memo_code='X')
    COALESCE(SUM(CASE 
      WHEN c.contributor_type = 'Individual' 
        AND c.line_number = '11AI'
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
      THEN c.amount ELSE 0 
    END), 0)::numeric as individual_total,
    
    -- Organization contributions (Line 11AI, not memo_code='X', NOT a conduit)
    COALESCE(SUM(CASE 
      WHEN c.contributor_type IN ('Organization', 'Unknown') 
        AND c.line_number = '11AI'
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
        AND NOT EXISTS (
          SELECT 1 FROM conduit_organizations co 
          WHERE co.is_active = true 
          AND UPPER(c.contributor_name) LIKE '%' || co.name || '%'
        )
      THEN c.amount ELSE 0 
    END), 0)::numeric as organization_total,
    
    -- PAC contributions (Line 11C)
    COALESCE(SUM(CASE 
      WHEN c.line_number = '11C'
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
      THEN c.amount ELSE 0 
    END), 0)::numeric as pac_total,
    
    -- Party contributions (Line 11B)
    COALESCE(SUM(CASE 
      WHEN c.line_number = '11B'
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
      THEN c.amount ELSE 0 
    END), 0)::numeric as party_total,
    
    -- Transfers (Line 12)
    COALESCE(SUM(CASE 
      WHEN c.line_number LIKE '12%'
        AND COALESCE(c.memo_code, '') != 'X'
      THEN c.amount ELSE 0 
    END), 0)::numeric as transfer_total,
    
    -- Loans (Line 13)
    COALESCE(SUM(CASE 
      WHEN c.line_number LIKE '13%'
        AND COALESCE(c.memo_code, '') != 'X'
      THEN c.amount ELSE 0 
    END), 0)::numeric as loan_total,
    
    -- Other receipts (Lines 14 + 15)
    COALESCE(SUM(CASE 
      WHEN c.line_number IN ('14', '15')
        AND COALESCE(c.memo_code, '') != 'X'
      THEN c.amount ELSE 0 
    END), 0)::numeric as other_total,
    
    -- Earmarked contributions
    COALESCE(SUM(CASE 
      WHEN c.is_earmarked = true
      THEN c.amount ELSE 0 
    END), 0)::numeric as earmarked_total,
    
    -- Memo code X contributions (for reference)
    COALESCE(SUM(CASE 
      WHEN c.memo_code = 'X'
      THEN c.amount ELSE 0 
    END), 0)::numeric as memo_x_total,
    
    -- Conduit organizations excluded from organization_total
    COALESCE(SUM(CASE 
      WHEN c.contributor_type IN ('Organization', 'Unknown') 
        AND c.line_number = '11AI'
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
        AND EXISTS (
          SELECT 1 FROM conduit_organizations co 
          WHERE co.is_active = true 
          AND UPPER(c.contributor_name) LIKE '%' || co.name || '%'
        )
      THEN c.amount ELSE 0 
    END), 0)::numeric as conduit_excluded
    
  FROM contributions c
  WHERE c.candidate_id = p_candidate_id
    AND c.cycle = p_cycle;
END;
$$;

-- Drop and recreate get_contribution_totals_by_committee
DROP FUNCTION IF EXISTS public.get_contribution_totals_by_committee(text, text);

CREATE OR REPLACE FUNCTION public.get_contribution_totals_by_committee(p_committee_id text, p_cycle text)
RETURNS TABLE (
  individual_total numeric,
  organization_total numeric,
  pac_total numeric,
  party_total numeric,
  transfer_total numeric,
  loan_total numeric,
  other_total numeric,
  earmarked_total numeric,
  memo_x_total numeric,
  conduit_excluded numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Individual contributions (Line 11AI, not memo_code='X')
    COALESCE(SUM(CASE 
      WHEN c.contributor_type = 'Individual' 
        AND c.line_number = '11AI'
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
      THEN c.amount ELSE 0 
    END), 0)::numeric as individual_total,
    
    -- Organization contributions (Line 11AI, not memo_code='X', NOT a conduit)
    COALESCE(SUM(CASE 
      WHEN c.contributor_type IN ('Organization', 'Unknown') 
        AND c.line_number = '11AI'
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
        AND NOT EXISTS (
          SELECT 1 FROM conduit_organizations co 
          WHERE co.is_active = true 
          AND UPPER(c.contributor_name) LIKE '%' || co.name || '%'
        )
      THEN c.amount ELSE 0 
    END), 0)::numeric as organization_total,
    
    -- PAC contributions (Line 11C)
    COALESCE(SUM(CASE 
      WHEN c.line_number = '11C'
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
      THEN c.amount ELSE 0 
    END), 0)::numeric as pac_total,
    
    -- Party contributions (Line 11B)
    COALESCE(SUM(CASE 
      WHEN c.line_number = '11B'
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
      THEN c.amount ELSE 0 
    END), 0)::numeric as party_total,
    
    -- Transfers (Line 12)
    COALESCE(SUM(CASE 
      WHEN c.line_number LIKE '12%'
        AND COALESCE(c.memo_code, '') != 'X'
      THEN c.amount ELSE 0 
    END), 0)::numeric as transfer_total,
    
    -- Loans (Line 13)
    COALESCE(SUM(CASE 
      WHEN c.line_number LIKE '13%'
        AND COALESCE(c.memo_code, '') != 'X'
      THEN c.amount ELSE 0 
    END), 0)::numeric as loan_total,
    
    -- Other receipts (Lines 14 + 15)
    COALESCE(SUM(CASE 
      WHEN c.line_number IN ('14', '15')
        AND COALESCE(c.memo_code, '') != 'X'
      THEN c.amount ELSE 0 
    END), 0)::numeric as other_total,
    
    -- Earmarked contributions
    COALESCE(SUM(CASE 
      WHEN c.is_earmarked = true
      THEN c.amount ELSE 0 
    END), 0)::numeric as earmarked_total,
    
    -- Memo code X contributions (for reference)
    COALESCE(SUM(CASE 
      WHEN c.memo_code = 'X'
      THEN c.amount ELSE 0 
    END), 0)::numeric as memo_x_total,
    
    -- Conduit organizations excluded from organization_total
    COALESCE(SUM(CASE 
      WHEN c.contributor_type IN ('Organization', 'Unknown') 
        AND c.line_number = '11AI'
        AND COALESCE(c.memo_code, '') != 'X'
        AND COALESCE(c.is_contribution, true) = true
        AND EXISTS (
          SELECT 1 FROM conduit_organizations co 
          WHERE co.is_active = true 
          AND UPPER(c.contributor_name) LIKE '%' || co.name || '%'
        )
      THEN c.amount ELSE 0 
    END), 0)::numeric as conduit_excluded
    
  FROM contributions c
  WHERE c.recipient_committee_id = p_committee_id
    AND c.cycle = p_cycle;
END;
$$;