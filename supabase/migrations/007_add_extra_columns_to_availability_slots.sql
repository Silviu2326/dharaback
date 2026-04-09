-- Migration: Add extra columns to availability_slots
-- Adds: color, title, repeat, notes, timezone

ALTER TABLE public.availability_slots
  ADD COLUMN IF NOT EXISTS color      VARCHAR(50)  NOT NULL DEFAULT 'sage',
  ADD COLUMN IF NOT EXISTS title      VARCHAR(200) NOT NULL DEFAULT 'Disponible',
  ADD COLUMN IF NOT EXISTS repeat     VARCHAR(20)  NOT NULL DEFAULT 'none'
    CONSTRAINT availability_slots_repeat_check
      CHECK (repeat IN ('none', 'daily', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS notes      TEXT,
  ADD COLUMN IF NOT EXISTS timezone   VARCHAR(100) NOT NULL DEFAULT 'Europe/Madrid';
