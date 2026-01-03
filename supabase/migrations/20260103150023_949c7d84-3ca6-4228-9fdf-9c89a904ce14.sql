-- Create vote_sync_status table to track expected vs persisted vote counts per member
CREATE TABLE vote_sync_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id TEXT NOT NULL UNIQUE,
  expected_sponsored INTEGER DEFAULT 0,
  expected_cosponsored INTEGER DEFAULT 0,
  expected_total INTEGER DEFAULT 0,
  persisted_count INTEGER DEFAULT 0,
  last_sync_started_at TIMESTAMPTZ,
  last_sync_completed_at TIMESTAMPTZ,
  sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE vote_sync_status ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Vote sync status is viewable by everyone"
  ON vote_sync_status FOR SELECT USING (true);

CREATE POLICY "Service role can manage vote sync status"
  ON vote_sync_status FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admins can manage vote sync status"
  ON vote_sync_status FOR ALL USING (has_role(auth.uid(), 'admin'));