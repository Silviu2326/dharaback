-- =====================================================
-- MIGRACIÓN: Crear tabla invitation_codes
-- DharaTerapeutas Backend
-- Fecha: 2026-02-23
-- =====================================================

CREATE TABLE IF NOT EXISTS invitation_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'invalidated')),
    used_at TIMESTAMPTZ,
    registered_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_invitation_codes_client ON invitation_codes(client_id);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_therapist ON invitation_codes(therapist_id);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_code ON invitation_codes(code);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_status ON invitation_codes(status);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_expires ON invitation_codes(expires_at);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_invitation_codes_updated_at ON invitation_codes;
CREATE TRIGGER update_invitation_codes_updated_at
    BEFORE UPDATE ON invitation_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Función para invalidar códigos expirados
CREATE OR REPLACE FUNCTION invalidate_expired_invitation_codes()
RETURNS void AS $$
BEGIN
    UPDATE invitation_codes
    SET status = 'expired'
    WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Comentarios de documentación
COMMENT ON TABLE invitation_codes IS 'Almacena códigos de invitación para que los clientes se registren en la app';
COMMENT ON COLUMN invitation_codes.code IS 'Código único de invitación (8 caracteres alfanuméricos)';
COMMENT ON COLUMN invitation_codes.status IS 'Estado: active, used, expired, invalidated';
COMMENT ON COLUMN invitation_codes.expires_at IS 'Fecha de expiración del código';

SELECT 'Migración completada: Tabla invitation_codes creada' AS status;
