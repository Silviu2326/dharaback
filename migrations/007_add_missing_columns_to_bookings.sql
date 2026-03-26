-- Migration: Add missing columns to bookings table
-- Created: 2026-03-24
-- Description: Adds columns needed by bookingPaymentController

-- Fix: If service_id exists as UUID, change to VARCHAR (to support non-UUID service IDs like '1773994376803')
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bookings' 
        AND column_name = 'service_id'
    ) THEN
        -- Check if it's a UUID type
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'bookings' 
            AND column_name = 'service_id'
            AND data_type = 'uuid'
        ) THEN
            -- Change column type from UUID to VARCHAR
            ALTER TABLE bookings ALTER COLUMN service_id TYPE VARCHAR(100);
        END IF;
    ELSE
        -- Add service_id column if it doesn't exist
        ALTER TABLE bookings ADD COLUMN service_id VARCHAR(100);
    END IF;
END $$;

-- Add amount columns
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS original_amount DECIMAL(10,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS final_amount DECIMAL(10,2);

-- Add coupon tracking
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50);

-- Add online payment flag
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS requires_online_payment BOOLEAN DEFAULT FALSE;

-- Add session tracking for packages
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS session_number INTEGER DEFAULT 1;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_sessions INTEGER DEFAULT 1;

-- Add client_payment_method for tracking
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_payment_method VARCHAR(20);

-- Add index for service_id
CREATE INDEX IF NOT EXISTS idx_bookings_service_id ON bookings(service_id);
