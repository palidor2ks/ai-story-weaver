-- Add 'politician' to the app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'politician';

-- Create profile_claims table for politician claim requests
CREATE TABLE public.profile_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  
  -- Verification info submitted by claimant
  verification_info TEXT,
  official_email TEXT,
  
  -- Admin response
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Prevent duplicate pending/approved claims per candidate
  UNIQUE (candidate_id, user_id)
);

-- Enable RLS
ALTER TABLE public.profile_claims ENABLE ROW LEVEL SECURITY;

-- Users can view their own claims
CREATE POLICY "Users can view their own claims" ON public.profile_claims
  FOR SELECT USING (auth.uid() = user_id);

-- Users can submit claims
CREATE POLICY "Users can submit claims" ON public.profile_claims
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can view all claims
CREATE POLICY "Admins can view all claims" ON public.profile_claims
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- Admins can manage claims
CREATE POLICY "Admins can manage claims" ON public.profile_claims
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_profile_claims_updated_at
  BEFORE UPDATE ON public.profile_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add policy to candidate_overrides for politicians to edit their claimed candidate
CREATE POLICY "Politicians can manage their claimed candidate overrides" ON public.candidate_overrides
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.id = candidate_overrides.candidate_id
        AND c.claimed_by_user_id = auth.uid()
    )
  );