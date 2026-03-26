-- Migration: Add stripe_session_id column to bookings table
-- Created: 2026-03-26
-- Description: Adds stripe_session_id column for tracking Stripe payments

-- Add stripe_session_id column
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);

-- Add payment_intent_id column for tracking
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_intent_id VARCHAR(255);

-- Add index for stripe_session_id
CREATE INDEX IF NOT EXISTS idx_bookings_stripe_session_id ON bookings(stripe_session_id);

-- Add index for payment_intent_id
CREATE INDEX IF NOT EXISTS idx_bookings_payment_intent_id ON bookings(payment_intent_id);
