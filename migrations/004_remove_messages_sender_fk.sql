-- Migration: Remove foreign key constraint from messages.sender_id
-- This allows messages to be sent by both therapists (users table) and clients (clients table)

-- Eliminar la constraint si existe
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;

-- Asegurarse de que sender_id no tenga foreign key
-- Esto es necesario porque los mensajes pueden ser enviados por:
-- - Terapeutas (tabla users)
-- - Clientes (tabla clients)
-- - O usuarios no autenticados en el futuro

-- Verificar que la constraint fue eliminada
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'messages_sender_id_fkey' 
        AND table_name = 'messages'
    ) THEN
        RAISE EXCEPTION 'La constraint messages_sender_id_fkey todavía existe';
    ELSE
        RAISE NOTICE 'Constraint messages_sender_id_fkey eliminada correctamente';
    END IF;
END $$;
