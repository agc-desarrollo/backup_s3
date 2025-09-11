# Plan de Simplificación del Sistema de Backup S3

## Objetivo
Simplificar el proyecto eliminando la interfaz web y manteniendo únicamente los servicios esenciales de backup manual y logs, con autenticación simplificada mediante API token.

## 1. Eliminación de la Interfaz Web

### Archivos a eliminar:
- `public/config.html`
- `public/dashboard.html`
- `public/login.html`
- `public/logs.html`
- Directorio completo `public/`

### Código a modificar:
- **server.js**: Eliminar todas las rutas que sirven archivos estáticos y páginas HTML
- **package.json**: Remover dependencias relacionadas con la interfaz web (si las hay)

### Rutas a eliminar del servidor:
- Rutas GET para servir páginas HTML
- Middleware para archivos estáticos
- Cualquier ruta relacionada con la interfaz web

## 2. Simplificación de la Autenticación

### Modificaciones en middleware:
- **src/middleware/authMiddleware.js**:
  - Eliminar lógica de sesiones y cookies
  - Implementar validación simple de header `api-token`
  - Comparar con variable de entorno `API_TOKEN`

### Archivo .env:
- Agregar variable `API_TOKEN=tu_token_secreto_aqui`
- Eliminar variables relacionadas con sesiones web

### Controladores a modificar:
- **src/controllers/authController.js**: Eliminar o simplificar drasticamente
- Remover endpoints de login/logout web

## 3. Eliminación del Backup Programado

### Archivos a modificar/eliminar:
- **src/services/backupScheduler.js**: Eliminar completamente
- **server.js**: Remover inicialización del scheduler
- **package.json**: Eliminar dependencias de cron/scheduling (node-cron, etc.)

### Funcionalidades a remover:
- Tareas programadas automáticas
- Configuración de intervalos de backup
- Cualquier lógica de scheduling

## 4. Servicios Esenciales a Mantener

### APIs a conservar:

#### Backup Manual de Base de Datos:
- **Endpoint**: `POST /api/backup/database`
- **Autenticación**: Header `api-token`
- **Funcionalidad**: Ejecutar backup manual de base de datos
- **Archivos**: `src/controllers/backupController.js`, `src/services/backupService.js`, `src/services/databaseService.js`

#### Backup Manual de Carpetas:
- **Endpoint**: `POST /api/backup/folders`
- **Autenticación**: Header `api-token`
- **Funcionalidad**: Ejecutar backup manual de carpetas específicas
- **Archivos**: `src/controllers/backupController.js`, `src/services/backupService.js`

#### Servicio de Logs:
- **Endpoint**: `GET /api/logs`
- **Autenticación**: Header `api-token`
- **Funcionalidad**: Obtener registros del sistema
- **Archivos**: `src/controllers/logsController.js`, `src/services/logger.js`

### Servicios de soporte a mantener:
- **src/services/s3Service.js**: Para subida a S3
- **src/services/configService.js**: Para configuración básica
- **src/services/logger.js**: Para logging

## 5. Estructura Final del Proyecto

```
backup_s3/
├── .env (simplificado)
├── config/
│   └── config.json (simplificado)
├── logs/ (mantener)
├── package.json (dependencias reducidas)
├── server.js (simplificado)
├── src/
│   ├── controllers/
│   │   ├── backupController.js (simplificado)
│   │   └── logsController.js (simplificado)
│   ├── middleware/
│   │   ├── authMiddleware.js (simplificado)
│   │   └── securityMiddleware.js (mantener)
│   └── services/
│       ├── backupService.js (mantener)
│       ├── configService.js (mantener)
│       ├── databaseService.js (mantener)
│       ├── logger.js (mantener)
│       └── s3Service.js (mantener)
└── temp/ (mantener)
```

## 6. Dependencias a Revisar

### Posibles dependencias a eliminar:
- `express-session` (si se usa para sesiones web)
- `cookie-parser` (si se usa para cookies web)
- `node-cron` o similar (para scheduling)
- Cualquier dependencia relacionada con templating web

### Dependencias a mantener:
- `express` (para API REST)
- `aws-sdk` o `@aws-sdk/*` (para S3)
- `winston` (para logging)
- Dependencias de base de datos
- `dotenv` (para variables de entorno)

## 7. Configuración Final

### Variables de entorno necesarias (.env):
```
API_TOKEN=tu_token_secreto_muy_seguro
AWS_ACCESS_KEY_ID=tu_access_key
AWS_SECRET_ACCESS_KEY=tu_secret_key
AWS_REGION=tu_region
S3_BUCKET=tu_bucket
DB_CONNECTION_STRING=tu_string_conexion
PORT=3000
```

### Endpoints finales de la API:
- `POST /api/backup/database` - Backup manual de base de datos
- `POST /api/backup/folders` - Backup manual de carpetas
- `GET /api/logs` - Obtener logs del sistema
- `GET /api/health` - Health check del servicio

## 8. Pasos de Implementación

1. **Fase 1**: Eliminar interfaz web y rutas relacionadas
2. **Fase 2**: Simplificar autenticación a API token
3. **Fase 3**: Eliminar scheduler y backup automático
4. **Fase 4**: Limpiar dependencias innecesarias
5. **Fase 5**: Probar endpoints esenciales
6. **Fase 6**: Actualizar documentación

## 9. Consideraciones de Seguridad

- El API token debe ser suficientemente complejo y único
- Implementar rate limiting en los endpoints
- Mantener logs de acceso para auditoría
- Validar todas las entradas de la API
- Usar HTTPS en producción

## 10. Testing

### Casos de prueba:
- Autenticación con token válido/inválido
- Backup manual de base de datos
- Backup manual de carpetas
- Obtención de logs
- Manejo de errores

---

**Nota**: Este plan mantiene la funcionalidad esencial del sistema mientras elimina la complejidad innecesaria de la interfaz web y el scheduling automático. El resultado será un servicio API simple y eficiente para backups manuales.