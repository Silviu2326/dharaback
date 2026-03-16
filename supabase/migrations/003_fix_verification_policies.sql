-- =====================================================
-- MIGRACIÓN: Ajustar políticas RLS de verification_documents
-- Para casos donde las políticas ya existen
-- =====================================================

-- Asegurar que RLS esté habilitado
ALTER TABLE verification_documents ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes (si hay conflictos)
DROP POLICY IF EXISTS "Users can view their own verification documents" ON verification_documents;
DROP POLICY IF EXISTS "Users can insert their own verification documents" ON verification_documents;
DROP POLICY IF EXISTS "Users can update their own verification documents" ON verification_documents;
DROP POLICY IF EXISTS "Users can delete their own verification documents" ON verification_documents;
DROP POLICY IF EXISTS "Admins can view all verification documents" ON verification_documents;
DROP POLICY IF EXISTS "Admins can update all verification documents" ON verification_documents;

-- Recrear políticas RLS

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

-- Verificar que todo esté configurado
SELECT 'Políticas RLS actualizadas correctamente' as status;
