-- Migration: Add payment settings tables for Stripe Pro plan
-- Created: 2025-03-22
-- Description: Creates tables for therapist payment settings and client payment preferences

-- Table: therapist_payment_settings
-- Stores payment configuration for each therapist
CREATE TABLE IF NOT EXISTS therapist_payment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Plan and permissions
  subscription_plan VARCHAR(50) DEFAULT 'basico', -- basico, avanzado, avanzado-pro
  can_accept_online_payments BOOLEAN DEFAULT false,
  
  -- Stripe configuration
  stripe_connect_account_id VARCHAR(255),
  connect_account_status VARCHAR(50) DEFAULT 'pending', -- pending, active, restricted
  
  -- Platform fee configuration
  platform_fee_percent DECIMAL(5,2) DEFAULT 10.00, -- 10%
  
  -- Default settings for new clients
  default_payment_method VARCHAR(50) DEFAULT 'manual', -- stripe, manual
  require_payment_before_booking BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(therapist_id)
);

-- Add comment for documentation
COMMENT ON TABLE therapist_payment_settings IS 'Stores payment configuration for therapists including Stripe Connect settings';
COMMENT ON COLUMN therapist_payment_settings.subscription_plan IS 'Therapist subscription tier: basico, avanzado, or avanzado-pro';
COMMENT ON COLUMN therapist_payment_settings.can_accept_online_payments IS 'Whether therapist can accept online payments (requires avanzado-pro plan)';
COMMENT ON COLUMN therapist_payment_settings.stripe_connect_account_id IS 'Stripe Connect account ID for receiving payments';
COMMENT ON COLUMN therapist_payment_settings.connect_account_status IS 'Status of Stripe Connect account: pending, active, or restricted';
COMMENT ON COLUMN therapist_payment_settings.platform_fee_percent IS 'Percentage fee charged by platform on each transaction';

-- Table: client_payment_preferences
-- Stores payment method preferences for each client-therapist pair
CREATE TABLE IF NOT EXISTS client_payment_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Payment configuration
  payment_method VARCHAR(50) DEFAULT 'manual', -- stripe, manual
  
  -- Optional: reason for manual payment
  manual_payment_reason TEXT,
  
  -- Coupons assigned to this specific client
  assigned_coupon_ids JSONB DEFAULT '[]'::jsonb,
  
  -- Exemption settings
  is_exempt_from_payment BOOLEAN DEFAULT false,
  exemption_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(therapist_id, client_id)
);

-- Add comment for documentation
COMMENT ON TABLE client_payment_preferences IS 'Stores payment method preferences for each client under each therapist';
COMMENT ON COLUMN client_payment_preferences.payment_method IS 'Preferred payment method: stripe (online) or manual (cash/transfer)';
COMMENT ON COLUMN client_payment_preferences.is_exempt_from_payment IS 'Whether client is exempt from paying';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_therapist_payment_settings_therapist_id 
  ON therapist_payment_settings(therapist_id);

CREATE INDEX IF NOT EXISTS idx_client_payment_preferences_therapist_id 
  ON client_payment_preferences(therapist_id);

CREATE INDEX IF NOT EXISTS idx_client_payment_preferences_client_id 
  ON client_payment_preferences(client_id);

CREATE INDEX IF NOT EXISTS idx_client_payment_preferences_combined 
  ON client_payment_preferences(therapist_id, client_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers
DROP TRIGGER IF EXISTS update_therapist_payment_settings_updated_at ON therapist_payment_settings;
CREATE TRIGGER update_therapist_payment_settings_updated_at
  BEFORE UPDATE ON therapist_payment_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_payment_preferences_updated_at ON client_payment_preferences;
CREATE TRIGGER update_client_payment_preferences_updated_at
  BEFORE UPDATE ON client_payment_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default settings for existing therapists (optional, based on your needs)
-- Uncomment if you want to create default entries for existing users
-- INSERT INTO therapist_payment_settings (therapist_id, subscription_plan)
-- SELECT id, 'basico' FROM users WHERE role = 'therapist'
-- ON CONFLICT (therapist_id) DO NOTHING;

-- Verify creation
SELECT 'Tables created successfully' as status;