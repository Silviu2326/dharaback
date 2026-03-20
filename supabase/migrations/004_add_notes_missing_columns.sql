-- Migration: Add missing columns to notes table
-- Created: 2026-03-20
-- Purpose: Add edit_history, hidden_from, and responses columns that are referenced in the Note model

-- Add edit_history column (JSONB array to track edit history)
ALTER TABLE notes 
ADD COLUMN IF NOT EXISTS edit_history JSONB[] DEFAULT '{}'::jsonb[];

-- Add hidden_from column (array of UUIDs of users who hid this note)
ALTER TABLE notes 
ADD COLUMN IF NOT EXISTS hidden_from UUID[] DEFAULT '{}'::uuid[];

-- Add responses column (JSONB array to store note responses/replies)
ALTER TABLE notes 
ADD COLUMN IF NOT EXISTS responses JSONB[] DEFAULT '{}'::jsonb[];

-- Create index on hidden_from for efficient filtering
CREATE INDEX IF NOT EXISTS idx_notes_hidden_from ON notes USING GIN(hidden_from);
