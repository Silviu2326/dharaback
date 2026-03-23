-- ============================================================
-- PREVENCIÓN DE DUPLICADOS - CONSTRAINTS Y TRIGGERS
-- ============================================================

-- 1. Crear función para verificar duplicados antes de insertar
CREATE OR REPLACE FUNCTION check_duplicate_client()
RETURNS TRIGGER AS $$
BEGIN
    -- Verificar si ya existe un cliente con el mismo email
    IF NEW.email IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM clients 
            WHERE email = NEW.email 
            AND id != NEW.id
        ) THEN
            RAISE EXCEPTION 'Ya existe un cliente con el email: %', NEW.email;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Crear trigger para prevenir duplicados en INSERT
DROP TRIGGER IF EXISTS prevent_duplicate_client_insert ON clients;
CREATE TRIGGER prevent_duplicate_client_insert
    BEFORE INSERT ON clients
    FOR EACH ROW
    EXECUTE FUNCTION check_duplicate_client();

-- 3. Crear trigger para prevenir duplicados en UPDATE
DROP TRIGGER IF EXISTS prevent_duplicate_client_update ON clients;
CREATE TRIGGER prevent_duplicate_client_update
    BEFORE UPDATE ON clients
    FOR EACH ROW
    WHEN (OLD.email IS DISTINCT FROM NEW.email)
    EXECUTE FUNCTION check_duplicate_client();

-- 4. Crear índice único (más eficiente que el trigger, pero requiere datos limpios)
-- Primero verificar si hay duplicados
DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT email, COUNT(*)
        FROM clients
        WHERE email IS NOT NULL
        GROUP BY email
        HAVING COUNT(*) > 1
    ) subquery;
    
    IF duplicate_count = 0 THEN
        -- Solo crear índice único si no hay duplicados
        CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_email_unique 
        ON clients(email) 
        WHERE email IS NOT NULL;
        
        RAISE NOTICE 'Índice único creado exitosamente';
    ELSE
        RAISE WARNING 'No se pudo crear el índice único. Hay % emails duplicados.', duplicate_count;
        RAISE WARNING 'Ejecute primero el script de limpieza: cleanup-duplicate-clients.sql';
    END IF;
END $$;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT 
    'Triggers creados:' as description,
    COUNT(*) as count
FROM pg_trigger
WHERE tgname IN ('prevent_duplicate_client_insert', 'prevent_duplicate_client_update')
AND tgrelid = 'clients'::regclass;

SELECT 
    'Índices en clients:' as description,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'clients'
AND schemaname = 'public';
