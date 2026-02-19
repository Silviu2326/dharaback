# API de Favoritos - Documentación

Este sistema permite a los clientes marcar terapeutas como favoritos y gestionar su lista de terapeutas preferidos.

## Endpoints Disponibles

### 🔓 Rutas Públicas (sin autenticación)

#### 1. Obtener terapeutas populares
```
GET /api/favorites/popular
```

Parámetros de consulta:
- `limit` (número): Cantidad de terapeutas a retornar (default: 10)
- `period` (string): Período de tiempo ('all', '30days', '7days') (default: 'all')

Ejemplo:
```bash
curl -X GET "http://localhost:5000/api/favorites/popular?limit=5&period=30days"
```

#### 2. Obtener estadísticas de favoritos de un terapeuta
```
GET /api/favorites/stats/:therapistId
```

Ejemplo:
```bash
curl -X GET "http://localhost:5000/api/favorites/stats/68ce20c17931a40b74af366a"
```

### 🔒 Rutas de Cliente (requieren autenticación)

#### 3. Obtener favoritos del cliente
```
GET /api/favorites
```

Parámetros de consulta:
- `page` (número): Página actual (default: 1)
- `limit` (número): Elementos por página (default: 10)
- `sortBy` (string): Campo para ordenar ('addedAt', 'name') (default: 'addedAt')
- `sortOrder` (string): Orden ('asc', 'desc') (default: 'desc')

Ejemplo:
```bash
curl -X GET "http://localhost:5000/api/favorites?page=1&limit=5" \
  -H "Authorization: Bearer YOUR_CLIENT_TOKEN"
```

#### 4. Añadir terapeuta a favoritos
```
POST /api/favorites/:therapistId
```

Body (opcional):
```json
{
  "notes": "Excelente terapeuta especializado en ansiedad"
}
```

Ejemplo:
```bash
curl -X POST "http://localhost:5000/api/favorites/68ce20c17931a40b74af366a" \
  -H "Authorization: Bearer YOUR_CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Mi terapeuta favorito"}'
```

#### 5. Verificar si un terapeuta está en favoritos
```
GET /api/favorites/check/:therapistId
```

Ejemplo:
```bash
curl -X GET "http://localhost:5000/api/favorites/check/68ce20c17931a40b74af366a" \
  -H "Authorization: Bearer YOUR_CLIENT_TOKEN"
```

#### 6. Actualizar notas de favorito
```
PUT /api/favorites/:therapistId
```

Body:
```json
{
  "notes": "Notas actualizadas sobre el terapeuta"
}
```

Ejemplo:
```bash
curl -X PUT "http://localhost:5000/api/favorites/68ce20c17931a40b74af366a" \
  -H "Authorization: Bearer YOUR_CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Especialista en terapia cognitivo-conductual"}'
```

#### 7. Remover terapeuta de favoritos
```
DELETE /api/favorites/:therapistId
```

Ejemplo:
```bash
curl -X DELETE "http://localhost:5000/api/favorites/68ce20c17931a40b74af366a" \
  -H "Authorization: Bearer YOUR_CLIENT_TOKEN"
```

#### 8. Gestión masiva de favoritos
```
POST /api/favorites/bulk
```

Body para añadir múltiples:
```json
{
  "action": "add",
  "therapistIds": ["therapistId1", "therapistId2", "therapistId3"],
  "notes": "Añadidos en lote"
}
```

Body para remover múltiples:
```json
{
  "action": "remove",
  "therapistIds": ["therapistId1", "therapistId2"]
}
```

Ejemplo:
```bash
curl -X POST "http://localhost:5000/api/favorites/bulk" \
  -H "Authorization: Bearer YOUR_CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "add",
    "therapistIds": ["68ce20c17931a40b74af366a"],
    "notes": "Terapeutas recomendados"
  }'
```

## Respuestas de Ejemplo

### Éxito al obtener favoritos:
```json
{
  "success": true,
  "data": [
    {
      "_id": "favorite_id",
      "clientId": "client_id",
      "therapistId": {
        "_id": "therapist_id",
        "name": "Dr. Juan Pérez",
        "email": "juan@example.com",
        "avatar": null,
        "isVerified": true,
        "professionalProfile": {
          "about": "Especialista en terapia cognitivo-conductual",
          "rating": 4.8,
          "isAvailable": true,
          "clientsCount": 45,
          "yearsExperience": 8,
          "therapies": [
            {
              "name": "Terapia Cognitivo-Conductual",
              "description": "..."
            }
          ]
        }
      },
      "notes": "Excelente profesional",
      "addedAt": "2025-09-26T10:00:00.000Z",
      "createdAt": "2025-09-26T10:00:00.000Z",
      "updatedAt": "2025-09-26T10:00:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalItems": 1,
    "itemsPerPage": 10,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

### Error de validación:
```json
{
  "success": false,
  "message": "Therapist is already in your favorites"
}
```

## Características del Sistema

### 🔒 Seguridad
- Autenticación requerida para operaciones de cliente
- Validación de permisos (solo el cliente puede gestionar sus favoritos)
- Índices únicos para prevenir duplicados

### 📊 Funcionalidades
- Paginación en todas las listas
- Ordenamiento configurable
- Búsqueda de terapeutas populares
- Estadísticas de favoritos por terapeuta
- Notas personales para cada favorito
- Operaciones masivas (añadir/remover múltiples)

### 🚀 Rendimiento
- Índices optimizados para consultas rápidas
- Población eficiente de datos relacionados
- Agregaciones para estadísticas

### 🛡️ Validaciones
- Verificación de que el terapeuta existe y está activo
- Verificación de que el cliente existe y está activo
- Validación de roles (solo terapeutas pueden ser favoritos)
- Prevención de duplicados

## Casos de Uso Comunes

1. **Cliente busca su lista de favoritos:**
   ```bash
   GET /api/favorites
   ```

2. **Cliente añade nuevo favorito:**
   ```bash
   POST /api/favorites/therapistId
   ```

3. **Aplicación verifica si terapeuta está en favoritos:**
   ```bash
   GET /api/favorites/check/therapistId
   ```

4. **Vista pública de terapeutas más populares:**
   ```bash
   GET /api/favorites/popular?limit=10
   ```

5. **Cliente reorganiza favoritos añadiendo notas:**
   ```bash
   PUT /api/favorites/therapistId
   ```