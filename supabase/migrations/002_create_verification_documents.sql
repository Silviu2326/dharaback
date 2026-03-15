-- =====================================================
-- MIGRACIÓN: Crear tabla verification_documents
-- DharaTerapeutas Backend
-- =====================================================

-- Crear tabla de documentos de verificación
CREATE TABLE IF NOT EXISTS verification_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL DEFAULT 'other' CHECK (type IN ('degree', 'license', 'certification', 'insurance', 'id', 'background_check', 'other')),
    document_number VARCHAR(255),
    issuing_body VARCHAR(255),
    issue_date DATE,
    expiry_date DATE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    file_url TEXT,
    notes TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mejorar performance
CREATE INDEX IF NOT EXISTS idx_verification_docs_user_id ON verification_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_docs_status ON verification_documents(status);
CREATE INDEX IF NOT EXISTS idx_verification_docs_type ON verification_documents(type);
CREATE INDEX IF NOT EXISTS idx_verification_docs_user_status ON verification_documents(user_id, status);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_verification_docs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_verification_docs_updated_at ON verification_documents;
CREATE TRIGGER update_verification_docs_updated_at
    BEFORE UPDATE ON verification_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_verification_docs_updated_at();

-- Políticas RLS (Row Level Security)
ALTER TABLE verification_documents ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios solo pueden ver sus propios documentos
CREATE POLICY "Users can view their own verification documents"
ON verification_documents FOR SELECT
USING (user_id = auth.uid());

-- Política: Los usuarios solo pueden insertar sus propios documentos
CREATE POLICY "Users can insert their own verification documents"
ON verification_documents FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Política: Los usuarios solo pueden actualizar sus propios documentos
CREATE POLICY "Users can update their own verification documents"
ON verification_documents FOR UPDATE
USING (user_id = auth.uid());

-- Política: Los usuarios solo pueden eliminar sus propios documentos
CREATE POLICY "Users can delete their own verification documents"
ON verification_documents FOR DELETE
USING (user_id = auth.uid());

-- Política: Los administradores pueden ver todos los documentos
CREATE POLICY "Admins can view all verification documents"
ON verification_documents FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.role = 'admin'
    )
);

-- Política: Los administradores pueden actualizar todos los documentos
CREATE POLICY "Admins can update all verification documents"
ON verification_documents FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.role = 'admin'
    )
);

-- Comentarios de documentación
COMMENT ON TABLE verification_documents IS 'Documentos de verificación subidos por los terapeutas (títulos, licencias, seguros, etc.)';
COMMENT ON COLUMN verification_documents.type IS 'Tipo de documento: degree (título), license (licencia), certification (certificación), insurance (seguro), id (identificación), background_check (antecedentes), other (otro)';
COMMENT ON COLUMN verification_documents.status IS 'Estado del documento: pending (pendiente), approved (aprobado), rejected (rechazado), expired (expirado)';

-- Verificar que la tabla se creó correctamente
SELECT 'Tabla verification_documents creada exitosamente' as status;
