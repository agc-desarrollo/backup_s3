# Implementación de Servicios API - Sistema de Backup S3

## 1. Estructura de Controladores

### 1.1 backupController.js

**Endpoints implementados:**
- `POST /api/backup/now` - Ejecuta backup manual con tipos: 'full', 'folders', 'database'
- `GET /api/backup/status` - Estado actual de trabajos de backup
- `GET /api/backup/stats` - Estadísticas de operaciones de backup
- `GET /api/backup/history` - Historial paginado de backups desde S3
- `DELETE /api/backup/:key` - Elimina backup específico de S3
- `POST /api/backup/cleanup` - Limpia backups antiguos (parámetro: daysToKeep)

**Validaciones implementadas:**
- Esquema Joi para tipo de backup y parámetros
- Validación de clave de backup para eliminación
- Verificación de backup en ejecución antes de iniciar nuevo

**Funcionalidades clave:**
- Generación de jobId único para cada backup
- Logging detallado de operaciones
- Manejo de errores específicos por tipo de backup
- Integración con backupService para ejecución

### 1.2 configController.js

**Endpoints implementados:**
- `GET /api/config` - Configuración actual y estadísticas del sistema
- `POST /api/config` - Actualización de configuración de carpetas
- `GET /api/config/backup-tools` - Herramientas de backup disponibles
- `GET /api/config/system-info` - Información detallada del sistema

**Características:**
- Configuración segura (no expone credenciales S3/BD)
- Validación de rutas de carpetas
- Información de recursos del sistema
- Estadísticas de uso actual

### 1.3 logsController.js

**Endpoints implementados:**
- `GET /api/logs` - Logs con filtros avanzados (nivel, fechas, paginación)
- `GET /api/logs/stats` - Estadísticas de logs por nivel
- `GET /api/logs/recent` - Logs más recientes (configurable)
- `GET /api/logs/backup` - Logs específicos de operaciones de backup
- `GET /api/logs/errors` - Logs de errores únicamente
- `GET /api/logs/search` - Búsqueda de texto en logs
- `GET /api/logs/export` - Exportación de logs en formato CSV

**Funcionalidades avanzadas:**
- Filtrado por nivel de log (error, warn, info, debug)
- Filtrado por rango de fechas
- Paginación eficiente
- Búsqueda de texto completo
- Exportación con headers CSV apropiados

### 1.4 s3Controller.js

**Endpoints implementados:**
- `GET /api/s3/objects` - Lista objetos con paginación y filtros
- `GET /api/s3/objects/:key/download` - Descarga directa de objetos
- `GET /api/s3/objects/:key/details` - Detalles específicos de objeto
- `GET /api/s3/folders` - Lista prefijos/carpetas en S3
- `GET /api/s3/stats` - Estadísticas de uso de almacenamiento
- `GET /api/s3/search` - Búsqueda de objetos por nombre

**Características técnicas:**
- Paginación eficiente con tokens de continuación
- Formateo de tamaños de archivo legibles
- Detección automática de tipos de objeto
- Manejo de errores específicos de S3
- Streaming de descargas para archivos grandes

## 2. Capa de Servicios

### 2.1 backupService.js

**Funciones principales:**

```javascript
// Backup de carpetas
runFoldersBackup(jobId) {
  // 1. Valida configuración de carpetas
  // 2. Crea archivo ZIP con compresión
  // 3. Sube a S3 con metadata
  // 4. Limpia archivos temporales
  // 5. Actualiza logs y estado
}

// Backup de base de datos
runDatabaseBackup(jobId) {
  // 1. Detecta tipo de BD (PostgreSQL/MySQL)
  // 2. Ejecuta dump con herramientas nativas
  // 3. Comprime resultado
  // 4. Sube a S3
  // 5. Limpia archivos temporales
}

// Gestión de estado
getBackupStatus() {
  // Retorna estado actual de trabajos
  // Incluye información del scheduler
}
```

**Patrones implementados:**
- Manejo asíncrono con async/await
- Cleanup automático de recursos
- Logging estructurado con contexto
- Validación de prerrequisitos
- Manejo de errores granular

### 2.2 Middleware de Seguridad

**authMiddleware.js:**
- Validación de token API en header 'api-token'
- Logging de actividad de API
- Respuestas de error estandarizadas

**securityMiddleware.js:**
- `sanitizePaths()` - Prevención de directory traversal
- `validatePayloadSize()` - Límites de tamaño de payload
- `validateContentType()` - Validación de content-type
- `sanitizeInput()` - Sanitización de entrada
- `detectSQLInjection()` - Detección de inyección SQL
- `addSecurityHeaders()` - Headers de seguridad HTTP

## 3. Patrones de Implementación

### 3.1 Manejo de Errores

```javascript
// Patrón estándar en controladores
try {
  const result = await service.operation();
  res.json({ success: true, data: result });
} catch (error) {
  logger.error('Operación falló', { error: error.message, stack: error.stack });
  res.status(500).json({ 
    success: false, 
    message: 'Error interno del servidor',
    code: 'INTERNAL_ERROR'
  });
}
```

### 3.2 Validación con Joi

```javascript
// Esquemas de validación reutilizables
const backupSchema = Joi.object({
  type: Joi.string().valid('full', 'folders', 'database').required()
});

// Validación en endpoints
const { error, value } = backupSchema.validate(req.body);
if (error) {
  return res.status(400).json({
    success: false,
    message: 'Datos de entrada inválidos',
    details: error.details
  });
}
```

### 3.3 Logging Estructurado

```javascript
// Logging con contexto
logger.info('Backup iniciado', {
  jobId,
  type: backupType,
  timestamp: new Date().toISOString(),
  user: req.ip
});
```

## 4. Configuración y Variables de Entorno

**Variables requeridas:**
- `API_TOKEN` - Token de autenticación API
- `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` - Configuración S3
- `DB_TYPE`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - Base de datos
- `PORT` - Puerto del servidor (default: 3000)
- `LOG_LEVEL` - Nivel de logging (default: 'info')

**Archivos de configuración:**
- `.env` - Variables de entorno principales
- `config/config.json` - Configuración de carpetas de backup
- `logs/` - Directorio de archivos de log

## 5. Consideraciones de Rendimiento

### 5.1 Optimizaciones Implementadas

- **Paginación eficiente** en listados de S3 y logs
- **Streaming** para descargas de archivos grandes
- **Compresión ZIP** para backups de carpetas
- **Cleanup automático** de archivos temporales
- **Rate limiting** en endpoints sensibles
- **Validación temprana** para reducir procesamiento innecesario

### 5.2 Límites y Restricciones

- Máximo 100 elementos por página en listados
- Timeout de 30 minutos para operaciones de backup
- Validación de tamaño de payload (configurable)
- Límites de rate limiting por IP

## 6. Testing y Debugging

**Archivos de prueba incluidos:**
- `test-folders-backup.js` - Pruebas de backup de carpetas
- `test-database-backup.js` - Pruebas de backup de base de datos

**Endpoints de debugging:**
- `GET /health` - Verificación de estado del servicio
- `GET /api/logs/recent` - Logs recientes para debugging
- `GET /api/backup/status` - Estado actual de operaciones

Este documento proporciona una visión completa de la implementación actual de los servicios API del sistema de backup S3.