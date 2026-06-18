# Referencia de API

**Base URL:** `http://localhost:3000/api`
**Autenticación:** Header `api-token: tu-token` o query string `?api_token=tu-token`
**Content-Type:** `application/json` (para POST/PUT)

## Respuesta Estándar

```json
// Éxito
{ "success": true, "data": { ... } }

// Error
{ "success": false, "message": "Descripción", "code": "ERROR_CODE" }
```

## Códigos HTTP

| Código | Uso |
|--------|-----|
| 200 | Operación exitosa |
| 400 | Datos de entrada inválidos |
| 401 | Token faltante o inválido |
| 404 | Recurso no encontrado |
| 409 | Conflicto (ej. backup en progreso) |
| 500 | Error interno del servidor |

---

## Backup

### POST /api/backup/folders
Ejecuta backup de carpetas configuradas en `config/config.json`. No requiere body.

```http
POST /api/backup/folders
api-token: tu-token
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Backup de carpetas completado exitosamente",
  "data": {
    "jobId": "backup-folders-1642678800",
    "type": "folders",
    "success": true,
    "startTime": "2024-01-20T10:30:00.000Z",
    "endTime": "2024-01-20T10:35:00.000Z",
    "duration": 300000,
    "filesProcessed": 150,
    "totalSize": "2.5 MB",
    "s3Key": "backups/folders/backup-folders-1642678800.zip"
  }
}
```

### POST /api/backup/database
Ejecuta backup de BD usando la configuración del `.env`. No requiere body.

```http
POST /api/backup/database
api-token: tu-token
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Backup de base de datos completado exitosamente",
  "data": {
    "jobId": "backup-db-1642678800",
    "type": "database",
    "success": true,
    "databaseBackup": {
      "success": true,
      "fileName": "database-backup.zip",
      "size": 1048576,
      "database": "mi_base_datos"
    },
    "s3Upload": {
      "success": true,
      "s3Key": "backups/database/2025-01-15/database-backup.zip",
      "bucket": "mi-bucket-backup"
    },
    "endTime": "2025-01-15T14:30:00.000Z"
  }
}
```

### GET /api/backup/status
Estado actual de backups.

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

### GET /api/backup/stats
Estadísticas de operaciones de backup.

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

### GET /api/backup/history

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| page | number | 1 | Número de página |
| limit | number | 20 | Resultados por página |
| status | string | - | Filtrar por estado |

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
  "pagination": { "page": 1, "limit": 20, "total": 45 }
}
```

### DELETE /api/backup/:key
Elimina un backup específico de S3.

```json
{
  "success": true,
  "message": "Backup eliminado exitosamente",
  "key": "backups/folders/2025-01-15/carpetas-10-30.zip"
}
```

### POST /api/backup/cleanup
Elimina backups más antiguos que los días especificados.

**Body:** `{ "daysToKeep": 30 }`

```json
{
  "success": true,
  "message": "Limpieza completada",
  "deletedCount": 5,
  "freedSpace": "500 MB"
}
```

---

## S3 (Almacenamiento)

### GET /api/s3/objects

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| prefix | string | - | Filtrar por prefijo de ruta |
| maxKeys | number | 100 | Máximo objetos (1-1000) |
| continuationToken | string | - | Token para paginación |

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

### GET /api/s3/folders

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| prefix | string | Prefijo para listar sub-carpetas |

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
    }
  ],
  "totalFolders": 2
}
```

### GET /api/s3/search

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| q | string | *(requerido)* | Término de búsqueda |
| limit | number | 20 | Máximo resultados (1-100) |
| prefix | string | - | Limitar búsqueda a prefijo |

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

### GET /api/s3/stats
Estadísticas de uso del almacenamiento.

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
    "oldestFile": { "key": "backups/old.sql", "lastModified": "2025-01-01T00:00:00.000Z" },
    "newestFile": { "key": "backups/latest.sql", "lastModified": "2025-01-15T17:30:00.000Z" },
    "fileTypes": { "sql": 50, "zip": 75, "txt": 25 }
  }
}
```

### GET /api/s3/objects/:key/details
Detalles de un objeto específico. La key debe estar URL-encoded.

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
    "metadata": { "backup-type": "database", "database-name": "mi_base_datos" },
    "downloadUrl": "https://presigned-url-here"
  }
}
```

### GET /api/s3/objects/:key/download
Descarga directa de un objeto (streaming para archivos grandes).

---

## Configuración

### GET /api/config
Obtiene la configuración actual (no expone credenciales S3/BD).

```json
{
  "success": true,
  "config": {
    "backupFolders": ["C:\\Users\\usuario\\Documentos", "C:\\Proyectos"],
    "updatedAt": "2025-01-15T10:30:00.000Z"
  },
  "stats": { "totalFolders": 2, "lastUpdate": "2025-01-15T10:30:00.000Z" }
}
```

### POST /api/config
Actualiza las carpetas de backup.

**Body:**
```json
{
  "backupFolders": ["C:\\nueva\\ruta", "C:\\otra\\ruta"]
}
```

### GET /api/config/backup-tools
Lista las herramientas de backup disponibles en el sistema.

```json
{
  "success": true,
  "tools": {
    "postgresql": { "command": "pg_dump", "available": true },
    "mysql": { "mysqldump": true, "mysqlsh": false, "available": true }
  }
}
```

### GET /api/config/system-info
Información del sistema y recursos.

```json
{
  "success": true,
  "systemInfo": {
    "node": { "version": "v18.17.0", "platform": "win32", "arch": "x64" },
    "memory": { "used": 45, "total": 128, "external": 12 },
    "uptime": 3600,
    "environment": "development"
  }
}
```

---

## Logs

### GET /api/logs

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| page | number | 1 | Número de página |
| limit | number | 50 | Logs por página (max: 100) |
| level | string | - | Nivel: error, warn, info, debug |
| startDate | string | - | Fecha inicio (YYYY-MM-DD) |
| endDate | string | - | Fecha fin (YYYY-MM-DD) |

```json
{
  "success": true,
  "logs": [
    {
      "timestamp": "2025-01-15T14:30:00.000Z",
      "level": "info",
      "message": "Backup de carpetas completado exitosamente",
      "meta": { "jobId": "backup-folders-1642678800", "duration": 120000 }
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 150, "pages": 3 }
}
```

### GET /api/logs/stats
Estadísticas de logs por nivel.

```json
{
  "success": true,
  "stats": {
    "totalLogs": 1250,
    "byLevel": { "error": 15, "warn": 45, "info": 1100, "debug": 90 },
    "lastEntry": "2025-01-15T14:30:00.000Z"
  }
}
```

### GET /api/logs/recent

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| limit | number | 10 | Cantidad de logs recientes |
| hours | number | 24 | Horas hacia atrás |
| level | string | - | Nivel de log a filtrar |

### GET /api/logs/backup
Logs específicos de operaciones de backup.

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| limit | number | 20 | Cantidad máxima |

### GET /api/logs/errors
Solo logs de nivel error.

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| limit | number | 20 | Cantidad máxima |

### GET /api/logs/search

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| q | string | *(requerido)* | Texto a buscar |
| limit | number | 20 | Cantidad máxima |

### GET /api/logs/export

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| format | string | csv | Formato: json, csv, txt |
| startDate | string | - | Fecha inicio (ISO 8601) |
| endDate | string | - | Fecha fin (ISO 8601) |

Retorna archivo en el formato solicitado con headers de descarga apropiados.

---

## Salud

### GET /api/health
Verificación del estado del servicio. No requiere autenticación.

```json
{ "status": "ok", "uptime": 3600 }
```

---

## Rotación

No existe scheduler interno. Los backups se ejecutan **únicamente vía webhook**
(`POST /api/backup/database` y `POST /api/backup/folders`), y la rotación
(borrado de backups antiguos en S3) se aplica **automáticamente tras cada backup
exitoso**.

Las políticas se definen en `config/rotation.json`, con una clave por tipo de
backup (`database` y `folder`):

```json
{
  "database": {
    "keepLast": 10,
    "keepWeeks": 3,
    "keepMonths": 2
  },
  "folder": {
    "keepLast": 10,
    "keepWeeks": 3,
    "keepMonths": 2
  }
}
```

**Campos de política:**

| Campo        | Descripción                                            |
|--------------|--------------------------------------------------------|
| `keepLast`   | Mantener los N backups más recientes                   |
| `keepDays`   | Mantener los backups de los últimos N días             |
| `keepWeeks`  | Mantener un backup por semana, últimas N semanas       |
| `keepMonths` | Mantener un backup por mes, últimos N meses            |

Si el archivo no existe o no hay clave para el tipo, la rotación se omite y el
backup se conserva igualmente. El resultado de la rotación se incluye en el
campo `rotation` de la respuesta del endpoint de backup. El archivo se lee en
cada backup, por lo que los cambios no requieren reiniciar el servidor.

---

## Interfaz de Gestión Web

### GET /manage
Interfaz web Vue.js para ejecutar backups y gestionar objetos S3.

**Autenticación:** Token en query string (requerido)

```http
GET /manage?api_token=tu-token
```

**Parámetros:**
| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| api_token | string | Sí | Token de API de `.env` |

**Características:**
- Dashboard con botones de backup (Database/Folders) vía webhook, con rotación automática
- Navegador de objetos S3 con filtro por prefijo
- Eliminación y descarga de objetos S3

---

## Ejemplos cURL

```bash
# Flujo completo de backup
curl -H "api-token: tu-token" http://localhost:3000/api/backup/status
curl -X POST -H "api-token: tu-token" http://localhost:3000/api/backup/folders
curl -X POST -H "api-token: tu-token" http://localhost:3000/api/backup/database
curl -H "api-token: tu-token" "http://localhost:3000/api/s3/objects?prefix=backups/"

# Monitoreo
curl -H "api-token: tu-token" http://localhost:3000/api/s3/stats
curl -H "api-token: tu-token" "http://localhost:3000/api/logs?limit=10"
curl -H "api-token: tu-token" "http://localhost:3000/api/s3/search?q=2025-01-15"
```

---

Referencia completa: [Arquitectura](ARQUITECTURA.md) | [Seguridad](SEGURIDAD.md)
