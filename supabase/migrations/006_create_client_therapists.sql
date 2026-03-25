-- =====================================================
-- MIGRACIÓN: Crear tabla client_therapists
-- Permite relaciones muchos a muchos entre clientes y terapeutas
-- =====================================================

-- Crear tabla de relación client_therapists
CREATE TABLE IF NOT EXISTS client_therapists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, therapist_id)
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_client_therapists_client ON client_therapists(client_id);
CREATE INDEX IF NOT EXISTS idx_client_therapists_therapist ON client_therapists(therapist_id);
CREATE INDEX IF NOT EXISTS idx_client_therapists_status ON client_therapists(status);
CREATE INDEX IF NOT EXISTS idx_client_therapists_therapist_status ON client_therapists(therapist_id, status);

-- Trigger para updated_at (usando la función existente)
DROP TRIGGER IF EXISTS trg_client_therapists_updated_at ON client_therapists;
CREATE TRIGGER trg_client_therapists_updated_at
    BEFORE UPDATE ON client_therapists
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Habilitar RLS
ALTER TABLE client_therapists ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (sin auth.uid() - se validan en el backend)
CREATE POLICY "Enable all for authenticated users"
    ON client_therapists FOR ALL
    USING (true)
    WITH CHECK (true);

-- Migrar datos existentes: crear relaciones para clientes existentes
INSERT INTO client_therapists (client_id, therapist_id, status, created_at)
SELECT 
    id as client_id,
    therapist_id,
    CASE 
        WHEN status = 'inactive' THEN 'archived'
        ELSE 'active'
    END as status,
    created_at
FROM clients
WHERE therapist_id IS NOT NULL
ON CONFLICT (client_id, therapist_id) DO NOTHING;

-- Comentario para documentación
COMMENT ON TABLE client_therapists IS 'Tabla de relación muchos a muchos entre clientes y terapeutas. Permite que un cliente tenga múltiples terapeutas y viceversa. El campo status indica el estado de la relación (active, inactive, archived).';

COMMENT ON COLUMN client_therapists.status IS 'Estado de la relación cliente-terapeuta: active (relación activa), inactive (relación inactiva), archived (relación archivada/eliminada)';