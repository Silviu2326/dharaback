-- Migration: Add missing last_message column to conversations table
-- This column is needed by the trigger trigger_update_conversation_last_message

-- Agregar columna last_message si no existe
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS last_message JSONB;

-- Verificar que se agregó correctamente
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversations' 
        AND column_name = 'last_message'
    ) THEN
        RAISE NOTICE 'Columna last_message agregada correctamente';
    ELSE
        RAISE EXCEPTION 'No se pudo agregar la columna last_message';
    END IF;
END $$;
