-- =====================================================
-- MIGRACIÓN: Agregar columna supabase_url a documents
-- DharaTerapeutas Backend
-- Fecha: 2026-02-23
-- =====================================================

-- Agregar columna supabase_url para almacenar URLs de Supabase Storage
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS supabase_url TEXT;

-- Crear índice para búsquedas rápidas por URL
CREATE INDEX IF NOT EXISTS idx_documents_supabase_url ON documents(supabase_url);

-- Actualizar documentos existentes para establecer storage_type en metadata
UPDATE documents 
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"storageType": "local"}'::jsonb
WHERE supabase_url IS NULL AND (metadata->>'storageType') IS NULL;

-- Comentario de documentación
COMMENT ON COLUMN documents.supabase_url IS 'URL pública del archivo en Supabase Storage';

-- =====================================================
-- CREAR BUCKET EN SUPABASE STORAGE (ejecutar en dashboard)
-- =====================================================
-- Nota: Este bucket debe crearse manualmente en el dashboard de Supabase
-- Nombre del bucket: documents
-- Política: Público (para URLs públicas)
-- Política de acceso: Solo usuarios autenticados pueden subir

/*
Instrucciones para crear el bucket en Supabase Dashboard:

1. Ir a Storage en el dashboard de Supabase
2. Click en "New bucket"
3. Nombre: documents
4. Marcar "Public bucket"
5. Click en "Create bucket"

Políticas de seguridad recomendadas:

-- Permitir lectura pública (para descargas)
CREATE POLICY "Allow public read access" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');

-- Permitir subida solo a usuarios autenticados
CREATE POLICY "Allow authenticated uploads" ON storage.objects
  FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'documents');

-- Permitir borrado solo al dueño del archivo
CREATE POLICY "Allow users to delete their own files" ON storage.objects
  FOR DELETE TO authenticated 
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
*/

SELECT 'Migración completada: Columna supabase_url agregada a documents' AS status;
