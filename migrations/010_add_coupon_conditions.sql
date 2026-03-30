-- Migration: Add conditions to coupons table
-- Created: 2026-03-30
-- Description: Adds only_new_clients, first_session_only and max_uses_per_client
--              to support targeted discount conditions

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS only_new_clients    BOOLEAN  DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS first_session_only  BOOLEAN  DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS max_uses_per_client INTEGER  DEFAULT NULL;

-- Index to speed up "new client" lookups: check if a client has prior bookings
-- with a given therapist (used during coupon validation)
CREATE INDEX IF NOT EXISTS idx_bookings_client_therapist_completed
  ON bookings(client_id, therapist_id)
  WHERE status IN ('completed', 'upcoming', 'pending', 'client_arrived');

COMMENT ON COLUMN coupons.only_new_clients    IS 'When true, coupon is only valid for clients who have never had a booking with the therapist';
COMMENT ON COLUMN coupons.first_session_only  IS 'When true, coupon is only valid for the very first booking of a client with the therapist';
COMMENT ON COLUMN coupons.max_uses_per_client IS 'Maximum number of times a single client can redeem this coupon (NULL = unlimited)';
