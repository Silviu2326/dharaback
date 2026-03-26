-- Migration: Add payment_method column to client_therapists table
-- Created: 2026-03-26
-- Description: Adds payment_method column to store client's preferred payment method per therapist

-- Add payment_method column with default 'cash' (efectivo)
ALTER TABLE client_therapists 
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'cash';

-- Add constraint to ensure valid payment methods
ALTER TABLE client_therapists 
ADD CONSTRAINT chk_client_therapists_payment_method 
CHECK (payment_method IN ('cash', 'card', 'transfer', 'stripe', 'other'));

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_client_therapists_payment_method 
ON client_therapists(payment_method);

-- Update existing records to have 'cash' as default if null
UPDATE client_therapists 
SET payment_method = 'cash' 
WHERE payment_method IS NULL;
