# Arquitectura Técnica

## Diagrama General

```
Cliente API ──► Express.js ──► Middleware ──► Controladores ──► Servicios ──► Externos
                                  │              │                 │            │
                              Auth Token    backupCtrl       backupService    S3
                              Security      configCtrl       configService    PostgreSQL
                              Rate Limit    logsCtrl         databaseService  MySQL
                              Sanitize      s3Ctrl           s3Service        FileSystem
                                                             logger (Winston)
```

## Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Runtime | Node.js | >= 18.0.0 |
| Framework | Express.js | 4.x |
| Módulos | ES Modules (`"type": "module"`) | - |
| S3 Client | @aws-sdk/client-s3 | 3.x |
| PostgreSQL | pg | 8.x |
| MySQL | mysql2 | 3.x |
| Compresión | archiver + adm-zip | 6.x / 0.5.x |
| Logging | winston + winston-daily-rotate-file | 3.x / 4.x |
| Validación | joi | 17.x |
| Seguridad | helmet, cors, express-rate-limit | - |
| Env | dotenv | 17.x |

## Capas de la Aplicación

### 1. Middleware (`src/middleware/`)

**authMiddleware.js**
- Valida header `api-token` contra `API_TOKEN` del `.env`
- Registra actividad de API en logs
- Respuestas estandarizadas 401

**securityMiddleware.js**
- `sanitizePaths()` — Prevención de directory traversal
- `validatePayloadSize()` — Límites de tamaño de payload
- `validateContentType()` — Validación de content-type
- `sanitizeInput()` — Sanitización de entrada
- `detectSQLInjection()` — Detección de inyección SQL
- `addSecurityHeaders()` — Headers HTTP de seguridad adicionales

### 2. Controladores (`src/controllers/`)

| Controlador | Prefijo de rutas | Endpoints |
|-------------|-----------------|-----------|
| backupController.js | `/api/backup` | folders, database, status, stats, history, cleanup, delete |
| configController.js | `/api/config` | get, update, backup-tools, system-info |
| logsController.js | `/api/logs` | list, stats, recent, backup, errors, search, export |
| s3Controller.js | `/api/s3` | objects, folders, search, stats, details, download |

### 3. Servicios (`src/services/`)

**backupService.js** — Lógica principal de backup
- `runFoldersBackup(jobId)` — Comprime carpetas en ZIP → sube a S3 → limpia temp
- `runDatabaseBackup(jobId)` — Ejecuta dump (pg_dump/mysqldump) → comprime → sube a S3
- `getBackupStatus()` — Estado actual de trabajos
- `getBackupStats()` — Estadísticas calculadas desde S3
- `getBackupHistory()` — Historial paginado desde S3
- `deleteBackup(key)` — Elimina backup de S3
- `cleanupOldBackups(daysToKeep)` — Limpia backups antiguos

**databaseService.js** — Gestión de base de datos
- Detecta tipo de BD (PostgreSQL/MySQL) desde `.env`
- Ejecuta dump con herramientas nativas del sistema
- `checkBackupTools()` — Verifica disponibilidad de pg_dump/mysqldump

**configService.js** — Configuración
- `getConfig()` / `updateConfig()` — Lee/escribe `config/config.json`
- `getBackupTools()` — Herramientas disponibles
- `getSystemInfo()` — Información del sistema (memoria, uptime, versión Node)

**s3Service.js** — Cliente S3
- `listObjects()` — Con paginación por token de continuación
- `downloadObject()` — Streaming para archivos grandes
- `getObjectDetails()` — Metadata y URL presignada
- `listFolders()` — Lista prefijos/pseudo-carpetas
- `getS3Stats()` — Estadísticas agregadas del bucket
- `searchObjects()` — Búsqueda por nombre
- `deleteObject()` — Eliminación

**logger.js** — Logging con Winston
- Formato JSON estructurado con timestamps
- Rotación diaria de archivos (`logs/backup-YYYY-MM.log`)
- Niveles: error, warn, info, debug
- Archivos: `logs/application.log`, `logs/error.log`, `logs/backup.log`

## Modelo de Datos

### Configuración (config/config.json)

```json
{
  "backupFolders": ["/path/to/folder1", "/path/to/folder2"],
  "backupSettings": {
    "compression": true,
    "excludePatterns": ["*.tmp", "node_modules"],
    "maxFileSize": 104857600,
    "retentionDays": 30
  },
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

### Trabajo de Backup (en memoria / logs)

```json
{
  "id": "backup-20240101-120000",
  "type": "folders|database",
  "status": "running|completed|failed",
  "startTime": "2024-01-01T12:00:00Z",
  "endTime": "2024-01-01T12:15:30Z",
  "filesCount": 1250,
  "totalSize": 524288000,
  "s3Objects": [
    { "key": "backups/folders/2024-01-01-folders.zip", "size": 314572800 }
  ],
  "metadata": {
    "triggeredBy": "api",
    "compressionRatio": 0.65,
    "errors": [],
    "warnings": []
  }
}
```

### Estructura de S3

```
backups/
├── folders/
│   └── YYYY-MM-DD/
│       └── carpeta_YYYYMMDD_HHmmss.zip
└── database/
    └── YYYY-MM-DD/
        └── database_backup_YYYYMMDD_HHmmss.sql
```

### Entrada de Log (Winston)

```json
{
  "level": "info",
  "message": "Backup completed successfully",
  "timestamp": "2024-01-01T12:00:01Z",
  "source": "BackupService",
  "category": "backup",
  "metadata": { "backupId": "...", "duration": 930000, "filesProcessed": 1250 }
}
```

## Patrones de Implementación

### Manejo de errores en controladores

```javascript
try {
  const result = await service.operation();
  res.json({ success: true, data: result });
} catch (error) {
  logger.error('Operación falló', { error: error.message, stack: error.stack });
  res.status(500).json({ success: false, message: 'Error interno', code: 'INTERNAL_ERROR' });
}
```

### Validación con Joi

```javascript
const schema = Joi.object({
  type: Joi.string().valid('full', 'folders', 'database').required()
});
const { error, value } = schema.validate(req.body);
if (error) return res.status(400).json({ success: false, message: 'Datos inválidos', details: error.details });
```

### Logging estructurado

```javascript
logger.info('Backup iniciado', { jobId, type: backupType, timestamp: new Date().toISOString(), user: req.ip });
```

## Restricciones y Límites

| Aspecto | Límite |
|---------|--------|
| Objetos por página (S3) | 1-1000 (default: 100) |
| Logs por página | 1-100 (default: 50) |
| Timeout de backup | 30 minutos |
| Retención de logs | 14 días (rotación diaria) |
| Rate limiting | Configurable por IP |
| Resultados de búsqueda S3 | Máximo 100 |

---

Ver también: [Seguridad](SEGURIDAD.md) | [API Reference](API_REFERENCE.md)
