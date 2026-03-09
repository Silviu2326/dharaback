-- Migration: Make client_id nullable in payments table
-- This allows creating payments for external clients (clients not in the system)

ALTER TABLE payments 
ALTER COLUMN client_id DROP NOT NULL;

-- Update the foreign key constraint to use SET NULL instead of CASCADE
-- This requires dropping and recreating the constraint
ALTER TABLE payments 
DROP CONSTRAINT IF EXISTS payments_client_id_fkey;

ALTER TABLE payments 
ADD CONSTRAINT payments_client_id_fkey 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

-- Add a comment to document this change
COMMENT ON COLUMN payments.client_id IS 'Reference to registered client. NULL for external clients (client data stored in metadata)';
