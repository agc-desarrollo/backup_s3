# Agent Context — Sistema de Backup S3

> Documento consolidado con todo el contexto del proyecto para agentes AI.

## Identidad del Proyecto

- **Nombre:** backup-s3-system v1.0.0
- **Propósito:** API REST para backup manual de carpetas y bases de datos a S3
- **Runtime:** Node.js >= 18 con ES Modules (`"type": "module"`)
- **Framework:** Express.js 4.x
- **Sin interfaz web** — solo API REST con autenticación por token
- **Repo:** agc-desarrollo/backup_s3 (rama: main)

## Estructura de Archivos

```
server.js                          # Punto de entrada Express
.env                               # Variables de entorno (S3, BD, token, puerto)
config/config.json                 # Carpetas de backup (editable via API)
src/
  controllers/
    backupController.js            # POST folders|database, GET status|stats|history, DELETE :key, POST cleanup
    configController.js            # GET|POST config, GET backup-tools|system-info
    logsController.js              # GET logs|stats|recent|backup|errors|search|export
    s3Controller.js                # GET objects|folders|search|stats|details|download
  services/
    backupService.js               # Lógica: comprimir, subir S3, limpiar
    configService.js               # Leer/escribir config.json
    databaseService.js             # pg_dump / mysqldump
    s3Service.js                   # @aws-sdk/client-s3 wrapper
    logger.js                      # Winston con rotación diaria
  middleware/
    authMiddleware.js              # Validación api-token header
    securityMiddleware.js          # Sanitize, rate limit, SQL injection
logs/                              # application.log, error.log, backup.log
temp/                              # Archivos temporales (auto-limpiados)
```

## Dependencias Clave

| Paquete | Uso |
|---------|-----|
| express | Framework web |
| @aws-sdk/client-s3 | Cliente S3 |
| pg | PostgreSQL |
| mysql2 | MySQL |
| archiver / adm-zip | Compresión ZIP |
| winston / winston-daily-rotate-file | Logging |
| joi | Validación de schemas |
| helmet | Headers de seguridad |
| cors | CORS |
| express-rate-limit | Rate limiting |
| dotenv | Variables de entorno |

## Endpoints (Resumen Completo)

### Backup (`/api/backup`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /folders | Backup de carpetas (usa config.json, sin body) |
| POST | /database | Backup de BD (usa .env, sin body) |
| GET | /status | Estado actual (isRunning, currentJob, lastBackup) |
| GET | /stats | Estadísticas (totalBackups, totalSize, avgTime) |
| GET | /history | Historial paginado (?page, ?limit, ?status) |
| DELETE | /:key | Eliminar backup de S3 |
| POST | /cleanup | Limpiar antiguos (body: {daysToKeep}) |

### S3 (`/api/s3`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /objects | Listar objetos (?prefix, ?maxKeys, ?continuationToken) |
| GET | /objects/:key/details | Detalles + URL presignada |
| GET | /objects/:key/download | Descarga streaming |
| GET | /folders | Listar prefijos/carpetas (?prefix) |
| GET | /stats | Estadísticas del bucket |
| GET | /search | Buscar objetos (?q, ?limit, ?prefix) |

### Config (`/api/config`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | / | Configuración actual (sin credenciales) |
| POST | / | Actualizar carpetas (body: {backupFolders}) |
| GET | /backup-tools | Herramientas disponibles (pg_dump, mysqldump) |
| GET | /system-info | Info sistema (node, memoria, uptime) |

### Logs (`/api/logs`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | / | Logs filtrados (?page, ?limit, ?level, ?startDate, ?endDate) |
| GET | /stats | Estadísticas por nivel |
| GET | /recent | Logs recientes (?limit, ?hours, ?level) |
| GET | /backup | Logs de backup (?limit) |
| GET | /errors | Solo errores (?limit) |
| GET | /search | Buscar texto (?q, ?limit) |
| GET | /export | Exportar (?format=csv/json/txt, ?startDate, ?endDate) |

### Salud
| GET | /api/health | Sin autenticación |

## Autenticación

Header: `api-token: <valor>` — validado contra `API_TOKEN` en `.env`.
Excepción: `/api/health` no requiere token.

## Formato de Respuesta

```json
{ "success": true, "data": { ... } }
{ "success": false, "message": "...", "code": "ERROR_CODE" }
```

Códigos HTTP: 200 (ok), 400 (validación), 401 (auth), 404 (no encontrado), 409 (conflicto), 500 (interno).

## Patrones de Código

- Controladores: try/catch → service call → res.json
- Validación: Joi schemas antes de procesar
- Logging: Winston con metadata estructurada (jobId, duration, etc.)
- Async: async/await en toda la capa de servicios
- Cleanup: archivos temporales eliminados después de cada backup
- Config sensible: solo vía .env, nunca expuesta por API

## Variables de Entorno (.env)

```env
PORT=3000
NODE_ENV=development
API_TOKEN=...
S3_ENDPOINT=...
S3_BUCKET=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_REGION=us-east-1
DB_TYPE=mysql|postgresql
DB_HOST=localhost
DB_PORT=3306|5432
DB_USERNAME=...
DB_PASSWORD=...
DB_DATABASE=...
LOG_LEVEL=info
```

## Estructura S3

```
backups/
├── folders/YYYY-MM-DD/carpeta_YYYYMMDD_HHmmss.zip
└── database/YYYY-MM-DD/database_backup_YYYYMMDD_HHmmss.sql
```

## Documentación Detallada

Referir a `docs/` para documentación completa:
- `README.md` — Overview e inicio rápido
- `API_REFERENCE.md` — Referencia completa con ejemplos request/response
- `ARQUITECTURA.md` — Arquitectura, servicios, modelos de datos
- `SEGURIDAD.md` — Autenticación, middleware, variables de entorno
- `SOLUCION_PROBLEMAS.md` — Debugging y mantenimiento
