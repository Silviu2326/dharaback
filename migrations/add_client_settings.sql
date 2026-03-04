-- Create client_settings table for user preferences
CREATE TABLE IF NOT EXISTS client_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Notification preferences
  email_notifications BOOLEAN DEFAULT true,
  push_notifications BOOLEAN DEFAULT true,
  sms_notifications BOOLEAN DEFAULT false,
  
  -- Appearance preferences
  dark_mode BOOLEAN DEFAULT false,
  theme_color VARCHAR(50) DEFAULT 'sage',
  
  -- Language preference
  language VARCHAR(10) DEFAULT 'es',
  
  -- Privacy settings
  profile_visibility VARCHAR(20) DEFAULT 'terapeutas', -- 'public', 'terapeutas', 'private'
  show_online_status BOOLEAN DEFAULT true,
  show_activity BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one settings record per client
  UNIQUE(client_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_client_settings_client_id ON client_settings(client_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_client_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_client_settings ON client_settings;

CREATE TRIGGER trigger_update_client_settings
  BEFORE UPDATE ON client_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_client_settings_updated_at();
