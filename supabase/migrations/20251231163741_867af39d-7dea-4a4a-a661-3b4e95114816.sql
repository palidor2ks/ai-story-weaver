-- Add identity verification fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS identity_verified boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS identity_provider text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS identity_verification_id text;

-- Add voter registration verification fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS voter_verified boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS voter_verified_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS voter_registration_status text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS voter_state text;

-- Add birth_date for voter verification (needed by most voter lookup APIs)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_date date;