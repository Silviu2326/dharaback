-- Migration: Add is_registered_on_platform field to clients table
-- Run this in your Supabase SQL editor

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS is_registered_on_platform BOOLEAN NOT NULL DEFAULT FALSE;

-- Clients that already have a password set by themselves (via RegistroCliente)
-- are considered registered. We can't determine this retroactively, so all
-- existing clients start as false and will be updated when they next register.

COMMENT ON COLUMN clients.is_registered_on_platform IS
  'True when the client has completed self-registration via RegistroCliente. '
  'False when the client was added manually by a therapist but has not yet '
  'registered their own account on the platform.';
