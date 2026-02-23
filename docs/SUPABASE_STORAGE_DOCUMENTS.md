# Integración de Supabase Storage para Documentos

## Resumen de Cambios

Se ha integrado **Supabase Storage** en el backend para almacenar documentos de forma persistente. Esto soluciona el problema de que los archivos se pierden cuando Railway reinicia los servidores.

## Estructura de Almacenamiento

```
Frontend → Backend (multer) → Supabase Storage → URL pública
         ↓
    Base de datos (metadata + URL)
```

## Cambios Realizados

### 1. Backend (`documentController.js`)

- ✅ Función `uploadToSupabaseStorage()` para subir archivos
- ✅ Modificado `uploadDocument()` para subir a Supabase después de recibir el archivo
- ✅ Eliminación automática del archivo local después de subir a Supabase
- ✅ Fallback a almacenamiento local si Supabase falla
- ✅ Modificado `downloadDocument()` para redirigir a URLs de Supabase

### 2. Modelo (`Document.js` - Supabase)

- ✅ Campo `supabaseUrl` agregado al modelo
- ✅ Campo `supabase_url` en la base de datos
- ✅ Actualizado método `toJSON()` para incluir la URL

### 3. Migraciones SQL

- ✅ `001_complete_schema.sql` - Tabla documents con columna supabase_url
- ✅ `002_add_supabase_url_to_documents.sql` - Migración para tablas existentes

## Configuración Requerida

### 1. Crear Bucket en Supabase Dashboard

```
1. Ir a Storage en el dashboard de Supabase
2. Click en "New bucket"
3. Nombre: documents
4. Marcar "Public bucket"
5. Click en "Create bucket"
```

### 2. Configurar Políticas de Seguridad

En el SQL Editor de Supabase, ejecutar:

```sql
-- Permitir lectura pública (para descargas)
CREATE POLICY "Allow public read access" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');

-- Permitir subida a usuarios autenticados
CREATE POLICY "Allow authenticated uploads" ON storage.objects
  FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'documents');

-- Permitir borrado solo al dueño del archivo
CREATE POLICY "Allow users to delete their own files" ON storage.objects
  FOR DELETE TO authenticated 
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
```

### 3. Variables de Entorno (ya configuradas)

Las variables necesarias ya están en Railway:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

## Ejecutar Migración

Para tablas existentes, ejecutar en el SQL Editor de Supabase:

```sql
-- Agregar columna supabase_url
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS supabase_url TEXT;

-- Crear índice
CREATE INDEX IF NOT EXISTS idx_documents_supabase_url ON documents(supabase_url);
```

## Comportamiento

### Subida de Archivos

1. Frontend envía archivo al backend
2. Backend recibe y guarda temporalmente localmente (multer)
3. Backend sube archivo a Supabase Storage
4. Si éxito: elimina archivo local, guarda URL en BD
5. Si falla: mantiene archivo local, marca como "local" en metadata

### Descarga de Archivos

1. Backend verifica si existe `supabaseUrl`
2. Si existe: redirige directamente a la URL pública de Supabase
3. Si no existe: sirve archivo local (fallback)

## Beneficios

✅ **Persistencia**: Archivos no se pierden en reinicios de Railway  
✅ **CDN**: Supabase proporciona CDN global para descargas rápidas  
✅ **Escalabilidad**: No límite de almacenamiento en filesystem local  
✅ **Backup**: Supabase maneja backups automáticos  
✅ **Fallback**: Si Supabase falla, sigue funcionando con almacenamiento local  

## URLs de Archivos

- **Supabase**: `https://[project].supabase.co/storage/v1/object/public/documents/[userId]/[timestamp]-[random].[ext]`
- **Local**: `/uploads/documents/[filename]`

## Troubleshooting

### Error: "Supabase Storage upload failed"
- Verificar que el bucket "documents" existe
- Verificar políticas de seguridad
- Verificar variables de entorno

### Archivos no aparecen en Supabase
- Revisar logs del backend
- Verificar que la migración SQL se ejecutó
- Comprobar permisos del bucket

### Descargas lentas
- Los archivos en Supabase usan CDN automáticamente
- Verificar región del proyecto Supabase
