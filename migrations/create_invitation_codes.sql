-- Create invitation_codes table for client invitation system
CREATE TABLE IF NOT EXISTS invitation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'used', 'invalidated', 'expired')),
  used_at TIMESTAMP WITH TIME ZONE,
  registered_user_id UUID REFERENCES users(id),
  expires_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_invitation_codes_client_id ON invitation_codes(client_id);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_therapist_id ON invitation_codes(therapist_id);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_code ON invitation_codes(code);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_status ON invitation_codes(status);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_email ON invitation_codes(email);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_invitation_codes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_invitation_codes ON invitation_codes;

CREATE TRIGGER trigger_update_invitation_codes
  BEFORE UPDATE ON invitation_codes
  FOR EACH ROW
  EXECUTE FUNCTION update_invitation_codes_updated_at();

-- Add RLS policies (if you want to restrict access)
-- Enable RLS
ALTER TABLE invitation_codes ENABLE ROW LEVEL SECURITY;

-- Policy: Therapists can only see their own invitation codes
CREATE POLICY "Therapists can view own invitation codes"
ON invitation_codes FOR SELECT
TO authenticated
USING (therapist_id = auth.uid());

-- Policy: Therapists can only create their own invitation codes
CREATE POLICY "Therapists can create own invitation codes"
ON invitation_codes FOR INSERT
TO authenticated
WITH CHECK (therapist_id = auth.uid());

-- Policy: Therapists can only update their own invitation codes
CREATE POLICY "Therapists can update own invitation codes"
ON invitation_codes FOR UPDATE
TO authenticated
USING (therapist_id = auth.uid());

-- Policy: Therapists can only delete their own invitation codes
CREATE POLICY "Therapists can delete own invitation codes"
ON invitation_codes FOR DELETE
TO authenticated
USING (therapist_id = auth.uid());
