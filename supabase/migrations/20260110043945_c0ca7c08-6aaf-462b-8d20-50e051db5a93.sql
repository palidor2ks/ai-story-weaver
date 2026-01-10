-- Add new columns to bills table for status, sponsor, and cosponsor tracking
ALTER TABLE bills ADD COLUMN IF NOT EXISTS status text DEFAULT 'introduced';
ALTER TABLE bills ADD COLUMN IF NOT EXISTS latest_action_text text;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS latest_action_date date;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS sponsor_bioguide_id text;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS sponsor_name text;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS sponsor_party text;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS sponsor_state text;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS cosponsor_count integer DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

-- Create index for status filtering
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_sponsor ON bills(sponsor_bioguide_id);

-- Create bill_sponsors junction table for tracking all sponsors/cosponsors
CREATE TABLE IF NOT EXISTS bill_sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id text NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  bioguide_id text NOT NULL,
  name text NOT NULL,
  party text,
  state text,
  is_sponsor boolean DEFAULT false,
  sponsorship_date date,
  created_at timestamptz DEFAULT now(),
  UNIQUE(bill_id, bioguide_id)
);

-- Enable RLS on bill_sponsors
ALTER TABLE bill_sponsors ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for bill_sponsors
CREATE POLICY "Bill sponsors are viewable by everyone" 
ON bill_sponsors FOR SELECT 
USING (true);

CREATE POLICY "Service role can manage bill sponsors" 
ON bill_sponsors FOR ALL 
USING (auth.role() = 'service_role');

CREATE POLICY "Admins can manage bill sponsors" 
ON bill_sponsors FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for bill_sponsors
CREATE INDEX IF NOT EXISTS idx_bill_sponsors_bioguide ON bill_sponsors(bioguide_id);
CREATE INDEX IF NOT EXISTS idx_bill_sponsors_bill ON bill_sponsors(bill_id);

-- Create a sync status table for tracking nightly syncs
CREATE TABLE IF NOT EXISTS bill_sync_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL DEFAULT 'nightly',
  last_sync_started_at timestamptz,
  last_sync_completed_at timestamptz,
  bills_checked integer DEFAULT 0,
  bills_updated integer DEFAULT 0,
  new_bills_added integer DEFAULT 0,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on bill_sync_status
ALTER TABLE bill_sync_status ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for bill_sync_status
CREATE POLICY "Bill sync status is viewable by everyone" 
ON bill_sync_status FOR SELECT 
USING (true);

CREATE POLICY "Service role can manage bill sync status" 
ON bill_sync_status FOR ALL 
USING (auth.role() = 'service_role');

CREATE POLICY "Admins can manage bill sync status" 
ON bill_sync_status FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default sync status row
INSERT INTO bill_sync_status (sync_type) 
VALUES ('nightly') 
ON CONFLICT DO NOTHING;