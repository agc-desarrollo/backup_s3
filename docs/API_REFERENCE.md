# Referencia Rápida de la API - Sistema de Backup S3

## Información General

**Base URL:** `http://localhost:3000/api`  
**Autenticación:** Header `api-token: tu-token`  
**Content-Type:** `application/json` (para POST/PUT)

## Endpoints de Backup

### Backup Manual de Carpetas
```http
POST /api/backup/folders
Content-Type: application/json
api-token: tu-token

{
  "folders": [
    "C:\\ruta\\carpeta1",
    "C:\\ruta\\carpeta2"
  ]
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Backup de carpetas iniciado",
  "jobId": "backup-folders-1642678800",
  "folders": ["C:\\ruta\\carpeta1", "C:\\ruta\\carpeta2"]
}
```

### Backup Manual de Base de Datos
```http
POST /api/backup/database
Content-Type: application/json
api-token: tu-token

{
  "type": "mysql",
  "database": "mi_base_datos"
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Backup de base de datos iniciado",
  "jobId": "backup-db-1642678800",
  "database": "mi_base_datos"
}
```

### Backup Manual Completo
```http
POST /api/backup/now
Content-Type: application/json
api-token: tu-token

{
  "type": "full"
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Backup completo iniciado",
  "jobId": "backup-full-1642678800",
  "type": "full"
}
```

### Estado del Backup
```http
GET /api/backup/status
api-token: tu-token
```

**Respuesta:**
```json
{
  "success": true,
  "isRunning": false,
  "currentJob": null,
  "lastBackup": {
    "timestamp": "2025-01-15T10:30:00.000Z",
    "type": "folders",
    "status": "completed"
  }
}
```

### Estadísticas de Backup
```http
GET /api/backup/stats
api-token: tu-token
```

**Respuesta:**
```json
{
  "success": true,
  "stats": {
    "totalBackups": 45,
    "lastBackup": "2025-01-15T10:30:00.000Z",
    "totalSize": "2.5 GB",
    "avgBackupTime": 120000
  }
}
```

### Historial de Backups
```http
GET /api/backup/history?page=1&limit=20
api-token: tu-token
```

**Respuesta:**
```json
{
  "success": true,
  "backups": [
    {
      "key": "backups/folders/2025-01-15/carpetas-10-30.zip",
      "timestamp": "2025-01-15T10:30:00.000Z",
      "type": "folders",
      "size": "150 MB"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45
  }
}
```

### Eliminar Backup
```http
DELETE /api/backup/:key
api-token: tu-token
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Backup eliminado exitosamente",
  "key": "backups/folders/2025-01-15/carpetas-10-30.zip"
}
```

### Limpiar Backups Antiguos
```http
POST /api/backup/cleanup
Content-Type: application/json
api-token: tu-token

{
  "daysToKeep": 30
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Limpieza completada",
  "deletedCount": 5,
  "freedSpace": "500 MB"
}
```

## Endpoints de S3

### Listar Objetos
```http
GET /api/s3/objects?prefix=backups/&maxKeys=50&continuationToken=abc123
api-token: tu-token
```

**Parámetros de consulta:**
- `prefix` (opcional): Filtrar por prefijo
- `maxKeys` (opcional): Máximo objetos (1-1000, default: 100)
- `continuationToken` (opcional): Token de paginación

**Respuesta:**
```json
{
  "success": true,
  "objects": [
    {
      "key": "backups/folders/2025-01-15/carpeta1_20250115_143022.zip",
      "size": 1048576,
      "sizeFormatted": "1.00 MB",
      "lastModified": "2025-01-15T14:30:22.000Z",
      "etag": "\"abc123def456\"",
      "contentType": "application/zip",
      "type": "folders",
      "folder": "backups/folders/2025-01-15",
      "fileName": "carpeta1_20250115_143022.zip"
    }
  ],
  "count": 1,
  "isTruncated": false,
  "nextContinuationToken": null
}
```

### Estructura de Carpetas
```http
GET /api/s3/folders?prefix=backups/
api-token: tu-token
```

**Respuesta:**
```json
{
  "success": true,
  "folders": [
    {
      "name": "database/",
      "fullPath": "backups/database/",
      "objectCount": 15,
      "totalSize": 52428800,
      "totalSizeFormatted": "50.00 MB",
      "lastModified": "2025-01-15T14:30:00.000Z"
    },
    {
      "name": "folders/",
      "fullPath": "backups/folders/",
      "objectCount": 8,
      "totalSize": 104857600,
      "totalSizeFormatted": "100.00 MB",
      "lastModified": "2025-01-15T14:25:00.000Z"
    }
  ],
  "totalFolders": 2
}
```

### Buscar Objetos
```http
GET /api/s3/search?q=backup&limit=20&prefix=backups/
api-token: tu-token
```

**Parámetros de consulta:**
- `q` (requerido): Término de búsqueda
- `limit` (opcional): Máximo resultados (1-100, default: 20)
- `prefix` (opcional): Limitar búsqueda a prefijo

**Respuesta:**
```json
{
  "success": true,
  "results": [
    {
      "key": "backups/database/2025-01-15/backup_20250115_143030.sql",
      "size": 2097152,
      "sizeFormatted": "2.00 MB",
      "lastModified": "2025-01-15T14:30:30.000Z",
      "type": "database",
      "relevance": 0.95
    }
  ],
  "totalFound": 1,
  "query": "backup",
  "limit": 20
}
```

### Estadísticas de S3
```http
GET /api/s3/stats
api-token: tu-token
```

**Respuesta:**
```json
{
  "success": true,
  "stats": {
    "bucketName": "mi-bucket-backup",
    "totalObjects": 150,
    "totalSize": 1073741824,
    "totalSizeFormatted": "1.00 GB",
    "averageFileSize": 7158278,
    "averageFileSizeFormatted": "6.83 MB",
    "oldestFile": {
      "key": "backups/old-backup.sql",
      "lastModified": "2025-01-01T00:00:00.000Z"
    },
    "newestFile": {
      "key": "backups/latest-backup.sql",
      "lastModified": "2025-01-15T17:30:00.000Z"
    },
    "fileTypes": {
      "sql": 50,
      "zip": 75,
      "txt": 25
    }
  }
}
```

### Detalles de Objeto
```http
GET /api/s3/objects/{key}/details
api-token: tu-token
```

**Ejemplo:**
```http
GET /api/s3/objects/backups%2Fdatabase%2F2025-01-15%2Fbackup.sql/details
api-token: tu-token
```

**Respuesta:**
```json
{
  "success": true,
  "object": {
    "key": "backups/database/2025-01-15/backup.sql",
    "size": 1048576,
    "sizeFormatted": "1.00 MB",
    "lastModified": "2025-01-15T14:30:00.000Z",
    "etag": "\"abc123def456\"",
    "contentType": "application/sql",
    "metadata": {
      "backup-type": "database",
      "database-name": "mi_base_datos"
    },
    "downloadUrl": "https://presigned-url-here"
  }
}
```

## Endpoints de Configuración

### Obtener Configuración
```http
GET /api/config
api-token: tu-token
```

**Respuesta:**
```json
{
  "success": true,
  "config": {
    "backupFolders": [
      "C:\\Users\\usuario\\Documentos",
      "C:\\Proyectos"
    ],
    "updatedAt": "2025-01-15T10:30:00.000Z"
  },
  "stats": {
    "totalFolders": 2,
    "lastUpdate": "2025-01-15T10:30:00.000Z"
  }
}
```

### Actualizar Configuración
```http
POST /api/config
Content-Type: application/json
api-token: tu-token

{
  "backupFolders": [
    "C:\\nueva\\ruta",
    "C:\\otra\\ruta"
  ]
}
```

### Verificar Herramientas de Backup
```http
GET /api/config/backup-tools
api-token: tu-token
```

**Respuesta:**
```json
{
  "success": true,
  "tools": {
    "postgresql": {
      "command": "pg_dump",
      "available": true
    },
    "mysql": {
      "mysqldump": true,
      "mysqlsh": false,
      "available": true
    }
  }
}
```

### Información del Sistema
```http
GET /api/config/system-info
api-token: tu-token
```

**Respuesta:**
```json
{
  "success": true,
  "systemInfo": {
    "node": {
      "version": "v18.17.0",
      "platform": "win32",
      "arch": "x64"
    },
    "memory": {
      "used": 45,
      "total": 128,
      "external": 12
    },
    "uptime": 3600,
    "environment": "development"
  }
}
```

## Endpoints de Logs

### Obtener Logs
```http
GET /api/logs?page=1&limit=50&level=info&startDate=2025-01-15&endDate=2025-01-16
api-token: tu-token
```

**Parámetros de consulta:**
- `page` (opcional): Número de página (default: 1)
- `limit` (opcional): Logs por página (default: 50, max: 100)
- `level` (opcional): Nivel de log (error, warn, info, debug)
- `startDate` (opcional): Fecha inicio (YYYY-MM-DD)
- `endDate` (opcional): Fecha fin (YYYY-MM-DD)

**Respuesta:**
```json
{
  "success": true,
  "logs": [
    {
      "timestamp": "2025-01-15T14:30:00.000Z",
      "level": "info",
      "message": "Backup de carpetas completado exitosamente",
      "meta": {
        "jobId": "backup-folders-1642678800",
        "duration": 120000
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  }
}
```

### Estadísticas de Logs
```http
GET /api/logs/stats
api-token: tu-token
```

**Respuesta:**
```json
{
  "success": true,
  "stats": {
    "totalLogs": 1250,
    "byLevel": {
      "error": 15,
      "warn": 45,
      "info": 1100,
      "debug": 90
    },
    "lastEntry": "2025-01-15T14:30:00.000Z"
  }
}
```

### Logs Recientes
```http
GET /api/logs/recent?limit=10
api-token: tu-token
```

**Respuesta:**
```json
{
  "success": true,
  "logs": [
    {
      "timestamp": "2025-01-15T14:30:00.000Z",
      "level": "info",
      "message": "Backup completado exitosamente"
    }
  ]
}
```

### Logs de Backup
```http
GET /api/logs/backup?limit=20
api-token: tu-token
```

**Respuesta:**
```json
{
  "success": true,
  "logs": [
    {
      "timestamp": "2025-01-15T14:30:00.000Z",
      "level": "info",
      "message": "Backup de carpetas iniciado",
      "jobId": "backup-folders-1642678800"
    }
  ]
}
```

### Logs de Errores
```http
GET /api/logs/errors?limit=20
api-token: tu-token
```

**Respuesta:**
```json
{
  "success": true,
  "logs": [
    {
      "timestamp": "2025-01-15T14:25:00.000Z",
      "level": "error",
      "message": "Error conectando a S3",
      "error": "Connection timeout"
    }
  ]
}
```

### Buscar en Logs
```http
GET /api/logs/search?q=backup&limit=20
api-token: tu-token
```

**Respuesta:**
```json
{
  "success": true,
  "logs": [
    {
      "timestamp": "2025-01-15T14:30:00.000Z",
      "level": "info",
      "message": "Backup de carpetas completado exitosamente"
    }
  ],
  "total": 45
}
```

### Exportar Logs
```http
GET /api/logs/export?format=csv&startDate=2025-01-15&endDate=2025-01-16
api-token: tu-token
```

**Respuesta:** Archivo CSV con los logs del período especificado

## Códigos de Estado HTTP

| Código | Descripción |
|--------|-------------|
| 200 | Éxito |
| 201 | Creado |
| 400 | Solicitud incorrecta |
| 401 | No autorizado (token inválido) |
| 404 | No encontrado |
| 409 | Conflicto (backup en progreso) |
| 500 | Error interno del servidor |

## Códigos de Error Comunes

### Error de Autenticación
```json
{
  "success": false,
  "message": "Token de autenticación requerido",
  "code": "AUTH_REQUIRED"
}
```

### Error de Validación
```json
{
  "success": false,
  "message": "Parámetros inválidos",
  "errors": [
    {
      "field": "folders",
      "message": "Al menos una carpeta es requerida"
    }
  ]
}
```

### Error de Backup en Progreso
```json
{
  "success": false,
  "message": "Ya hay un backup en progreso",
  "code": "BACKUP_IN_PROGRESS",
  "currentJob": "backup-folders-1642678800"
}
```

## Ejemplos de Uso con cURL

### Backup Completo
```bash
# 1. Verificar estado
curl -H "api-token: tu-token" http://localhost:3000/api/backup/status

# 2. Backup de carpetas
curl -X POST \
  -H "Content-Type: application/json" \
  -H "api-token: tu-token" \
  -d '{"folders": ["C:\\Documentos"]}' \
  http://localhost:3000/api/backup/folders

# 3. Backup de base de datos
curl -X POST \
  -H "Content-Type: application/json" \
  -H "api-token: tu-token" \
  -d '{"type": "mysql", "database": "mi_bd"}' \
  http://localhost:3000/api/backup/database

# 4. Verificar resultados
curl -H "api-token: tu-token" "http://localhost:3000/api/s3/objects?prefix=backups/"
```

### Monitoreo
```bash
# Ver estadísticas
curl -H "api-token: tu-token" http://localhost:3000/api/s3/stats

# Ver logs recientes
curl -H "api-token: tu-token" "http://localhost:3000/api/logs?limit=10"

# Buscar backups de hoy
curl -H "api-token: tu-token" "http://localhost:3000/api/s3/search?q=2025-01-15"
```

## Notas Importantes

1. **Autenticación:** Todas las peticiones requieren el header `api-token`
2. **Codificación:** Las rutas en URLs deben estar URL-encoded
3. **Paginación:** Usar `continuationToken` para navegar grandes listas
4. **Límites:** Máximo 1000 objetos por consulta, 100 resultados de búsqueda
5. **Timeouts:** Las operaciones de backup pueden tomar varios minutos
6. **Logs:** Los logs se rotan diariamente y se mantienen por 14 días

---

**Documentación completa:** [DOCUMENTACION_USUARIO.md](./DOCUMENTACION_USUARIO.md)  
**Guía de instalación:** [GUIA_INSTALACION.md](./GUIA_INSTALACION.md)