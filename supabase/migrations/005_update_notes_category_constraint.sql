-- Migration: Update notes category constraint to match API validation
-- Created: 2026-03-20
-- Purpose: The API allows more categories than the database constraint permits

-- Drop the existing constraint
ALTER TABLE notes 
DROP CONSTRAINT IF EXISTS notes_category_check;

-- Add the new constraint with all valid categories from API validation
ALTER TABLE notes 
ADD CONSTRAINT notes_category_check 
CHECK (category IN ('general', 'therapy', 'personal', 'medication', 'lifestyle', 'relationships', 'work', 'family', 'emotions', 'symptoms', 'goals', 'other'));
