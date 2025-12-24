-- Phase A & B: Add incremental sync columns to candidate_committees
ALTER TABLE candidate_committees 
  ADD COLUMN IF NOT EXISTS last_sync_date timestamptz,
  ADD COLUMN IF NOT EXISTS last_contribution_date date,
  ADD COLUMN IF NOT EXISTS last_index text,
  ADD COLUMN IF NOT EXISTS local_itemized_total integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fec_itemized_total integer;

-- Phase C: Create committee_finance_rollups table
CREATE TABLE IF NOT EXISTS committee_finance_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id text NOT NULL,
  candidate_id text NOT NULL,
  cycle text NOT NULL,
  local_itemized integer DEFAULT 0,
  local_transfers integer DEFAULT 0,
  local_earmarked integer DEFAULT 0,
  local_other integer DEFAULT 0,
  fec_itemized integer,
  fec_unitemized integer,
  fec_total_receipts integer,
  contribution_count integer DEFAULT 0,
  donor_count integer DEFAULT 0,
  last_sync timestamptz,
  last_fec_check timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(committee_id, cycle)
);

-- Enable RLS
ALTER TABLE committee_finance_rollups ENABLE ROW LEVEL SECURITY;

-- RLS Policies for committee_finance_rollups
CREATE POLICY "Committee rollups are viewable by everyone"
  ON committee_finance_rollups FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage rollups"
  ON committee_finance_rollups FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Admins can manage rollups"
  ON committee_finance_rollups FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Phase E: Create finance_reconciliation table
CREATE TABLE IF NOT EXISTS finance_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id text NOT NULL,
  cycle text NOT NULL,
  local_itemized integer DEFAULT 0,
  local_transfers integer DEFAULT 0,
  local_earmarked integer DEFAULT 0,
  fec_itemized integer,
  fec_unitemized integer,
  fec_total_receipts integer,
  delta_amount integer,
  delta_pct numeric,
  status text DEFAULT 'pending', -- 'ok', 'warning', 'error', 'pending'
  checked_at timestamptz DEFAULT now(),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(candidate_id, cycle)
);

-- Enable RLS
ALTER TABLE finance_reconciliation ENABLE ROW LEVEL SECURITY;

-- RLS Policies for finance_reconciliation
CREATE POLICY "Reconciliation data is viewable by everyone"
  ON finance_reconciliation FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage reconciliation"
  ON finance_reconciliation FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Admins can manage reconciliation"
  ON finance_reconciliation FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Add updated_at trigger for new tables
CREATE TRIGGER update_committee_rollups_updated_at
  BEFORE UPDATE ON committee_finance_rollups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_finance_reconciliation_updated_at
  BEFORE UPDATE ON finance_reconciliation
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();