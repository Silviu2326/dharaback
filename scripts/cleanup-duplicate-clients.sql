-- ============================================================
-- SCRIPT PARA LIMPIAR CLIENTES DUPLICADOS EN SUPABASE
-- ============================================================
-- Este script:
-- 1. Identifica clientes duplicados por email
-- 2. Selecciona el registro más reciente como "principal"
-- 3. Actualiza todas las referencias en otras tablas
-- 4. Elimina los duplicados
-- ============================================================

-- Paso 1: Ver duplicados por email
SELECT 
    email,
    COUNT(*) as count,
    STRING_AGG(id::text, ', ' ORDER BY created_at DESC) as ids,
    STRING_AGG(name, ', ' ORDER BY created_at DESC) as names,
    MIN(created_at) as oldest_created,
    MAX(created_at) as newest_created
FROM clients
WHERE email IS NOT NULL
GROUP BY email
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- Paso 2: Crear tabla temporal con los IDs a conservar (el más reciente de cada email)
CREATE TEMP TABLE clients_to_keep AS
SELECT DISTINCT ON (email)
    id as keep_id,
    email,
    created_at
FROM clients
WHERE email IS NOT NULL
ORDER BY email, created_at DESC;

-- Paso 3: Crear tabla temporal con los IDs a eliminar
CREATE TEMP TABLE clients_to_delete AS
SELECT c.id as delete_id, c.email, ctk.keep_id
FROM clients c
JOIN clients_to_keep ctk ON c.email = ctk.email
WHERE c.id != ctk.keep_id;

-- Paso 4: Ver qué se va a eliminar
SELECT * FROM clients_to_delete;

-- ============================================================
-- ⚠️  PASOS DE ACTUALIZACIÓN - EJECUTAR CON CUIDADO
-- ============================================================

-- Paso 5: Actualizar referencias en tabla 'appointments'
UPDATE appointments
SET client_id = ctk.keep_id
FROM clients_to_delete ctd
JOIN clients_to_keep ctk ON ctd.email = ctk.email
WHERE appointments.client_id = ctd.delete_id;

-- Paso 6: Actualizar referencias en tabla 'bookings'
UPDATE bookings
SET client_id = ctk.keep_id
FROM clients_to_delete ctd
JOIN clients_to_keep ctk ON ctd.email = ctk.email
WHERE bookings.client_id = ctd.delete_id;

-- Paso 7: Actualizar referencias en tabla 'document_clients'
UPDATE document_clients
SET client_id = ctk.keep_id
FROM clients_to_delete ctd
JOIN clients_to_keep ctk ON ctd.email = ctk.email
WHERE document_clients.client_id = ctd.delete_id;

-- Paso 8: Actualizar referencias en tabla 'documents' (client_id directo)
UPDATE documents
SET client_id = ctk.keep_id
FROM clients_to_delete ctd
JOIN clients_to_keep ctk ON ctd.email = ctk.email
WHERE documents.client_id = ctd.delete_id;

-- Paso 9: Actualizar referencias en tabla 'messages'
UPDATE messages
SET client_id = ctk.keep_id
FROM clients_to_delete ctd
JOIN clients_to_keep ctk ON ctd.email = ctk.email
WHERE messages.client_id = ctd.delete_id;

-- Paso 10: Actualizar referencias en tabla 'notifications'
UPDATE notifications
SET client_id = ctk.keep_id
FROM clients_to_delete ctd
JOIN clients_to_keep ctk ON ctd.email = ctk.email
WHERE notifications.client_id = ctd.delete_id;

-- Paso 11: Actualizar referencias en tabla 'reviews'
UPDATE reviews
SET client_id = ctk.keep_id
FROM clients_to_delete ctd
JOIN clients_to_keep ctk ON ctd.email = ctk.email
WHERE reviews.client_id = ctd.delete_id;

-- Paso 12: Actualizar referencias en tabla 'payments'
UPDATE payments
SET client_id = ctk.keep_id
FROM clients_to_delete ctd
JOIN clients_to_keep ctk ON ctd.email = ctk.email
WHERE payments.client_id = ctd.delete_id;

-- Paso 13: Actualizar referencias en tabla 'client_therapists' (si existe)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables 
               WHERE table_name = 'client_therapists') THEN
        EXECUTE 'UPDATE client_therapists
                 SET client_id = ctk.keep_id
                 FROM clients_to_delete ctd
                 JOIN clients_to_keep ctk ON ctd.email = ctk.email
                 WHERE client_therapists.client_id = ctd.delete_id';
    END IF;
END $$;

-- Paso 14: Actualizar referencias en tabla 'invitations' (invited_client_id)
UPDATE invitations
SET invited_client_id = ctk.keep_id
FROM clients_to_delete ctd
JOIN clients_to_keep ctk ON ctd.email = ctk.email
WHERE invitations.invited_client_id = ctd.delete_id;

-- Paso 15: Actualizar referencias en tabla 'invitations' (registered_client_id)
UPDATE invitations
SET registered_client_id = ctk.keep_id
FROM clients_to_delete ctd
JOIN clients_to_keep ctk ON ctd.email = ctk.email
WHERE invitations.registered_client_id = ctd.delete_id;

-- Paso 16: ELIMINAR los clientes duplicados
DELETE FROM clients
WHERE id IN (SELECT delete_id FROM clients_to_delete);

-- Paso 17: Verificar que se eliminaron
SELECT 
    email,
    COUNT(*) as count
FROM clients
WHERE email IS NOT NULL
GROUP BY email
HAVING COUNT(*) > 1;

-- Paso 18: Limpiar tablas temporales
DROP TABLE IF EXISTS clients_to_keep;
DROP TABLE IF EXISTS clients_to_delete;

-- ============================================================
-- PASO FINAL: Crear índice único para prevenir futuros duplicados
-- ============================================================

-- Verificar si ya existe un índice único
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'clients' 
AND schemaname = 'public';

-- Crear índice único en email (si no existe)
-- NOTA: Esto fallará si hay emails duplicados que no fueron limpiados
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_email_unique 
ON clients(email) 
WHERE email IS NOT NULL;

-- ============================================================
-- VERIFICACIÓN FINAL
-- ============================================================
SELECT COUNT(*) as total_clients FROM clients;
SELECT COUNT(DISTINCT email) as unique_emails FROM clients WHERE email IS NOT NULL;
