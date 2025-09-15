# Documentación del Usuario - Sistema de Backup S3

## Descripción General

El Sistema de Backup S3 es una aplicación integral que permite automatizar el respaldo de carpetas locales y bases de datos a almacenamiento compatible con S3 (Amazon S3, Cloudflare R2, etc.). El sistema incluye una API REST completa para gestión y visualización de contenidos.

## Características Principales

- ✅ **Backup manual** de carpetas y bases de datos
- ✅ **Compatibilidad con S3** (Amazon S3, Cloudflare R2)
- ✅ **API REST completa** para gestión y visualización
- ✅ **Logs detallados** de todas las operaciones
- ✅ **Autenticación por token** para seguridad
- ✅ **Compresión automática** de archivos
- ✅ **Soporte para PostgreSQL y MySQL**

## Requisitos del Sistema

### Software Requerido
- **Node.js** >= 18.0.0
- **npm** (incluido con Node.js)
- **pg_dump** (para backups de PostgreSQL)
- **mysqldump** o **MySQL Shell** (para backups de MySQL)

### Sistemas Operativos Soportados
- Windows
- Linux
- macOS

## Instalación

### 1. Clonar o Descargar el Proyecto
```bash
git clone <url-del-repositorio>
cd backup_s3
```

### 2. Instalar Dependencias
```bash
npm install
```

### 3. Configurar Variables de Entorno
Crear un archivo `.env` en la raíz del proyecto:

```env
# Configuración del Servidor
PORT=3000
NODE_ENV=development

# Configuración S3
S3_ENDPOINT=https://tu-endpoint-s3.com
S3_BUCKET=tu-bucket-name
S3_ACCESS_KEY_ID=tu-access-key
S3_SECRET_ACCESS_KEY=tu-secret-key
S3_REGION=us-east-1

# Configuración de Base de Datos
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=tu-usuario
DB_PASSWORD=tu-password
DB_DATABASE=tu-base-datos

# Token de Autenticación API
API_TOKEN=tu-token-seguro
```

### 4. Configurar Usuarios (Opcional)
Editar el archivo `config/users.json` para gestionar usuarios:

```json
{
  "admin": {
    "password": "tu-password-hasheado",
    "role": "admin"
  }
}
```

## Configuración

### Configuración Principal
El archivo `config/config.json` contiene la configuración principal:

```json
{
  "backupFolders": [
    "C:\\ruta\\a\\carpeta1",
    "C:\\ruta\\a\\carpeta2"
  ],
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```



## Uso del Sistema

### Iniciar el Servidor

```bash
# Modo desarrollo (con auto-reload)
npm run dev

# Modo producción
npm start
```

El servidor estará disponible en `http://localhost:3000`

### Verificar Estado del Sistema
```bash
curl http://localhost:3000/api
```

## API REST - Guía de Uso

### Autenticación
Todas las peticiones a la API requieren el header de autenticación:

```bash
api-token: tu-token-configurado
```

### Endpoints Principales

#### 1. Gestión de Backups

**Ejecutar Backup Manual**
```bash
# Backup de carpetas
curl -X POST \
  -H "api-token: tu-token" \
  http://localhost:3000/api/backup/folders

# Backup de base de datos
curl -X POST \
  -H "api-token: tu-token" \
  http://localhost:3000/api/backup/database
```

**Obtener Estado del Backup**
```bash
GET /api/backup/status
api-token: tu-token
```

**Obtener Estadísticas de Backups**
```bash
GET /api/backup/stats
api-token: tu-token
```

**Obtener Historial de Backups**
```bash
GET /api/backup/history?page=1&limit=20
api-token: tu-token
```

**Eliminar Backup Específico**
```bash
DELETE /api/backup/{backup-key}
api-token: tu-token
```

**Limpiar Backups Antiguos**
```bash
POST /api/backup/cleanup
Content-Type: application/json
api-token: tu-token

{
  "daysToKeep": 30
}
```

#### 2. Visualización de Contenidos S3

**Listar Objetos en S3**
```bash
GET /api/s3/objects?prefix=backups/&maxKeys=50
api-token: tu-token
```

**Obtener Estructura de Carpetas**
```bash
GET /api/s3/folders?prefix=backups/
api-token: tu-token
```

**Buscar Archivos**
```bash
GET /api/s3/search?q=backup&limit=20
api-token: tu-token
```

**Obtener Estadísticas**
```bash
GET /api/s3/stats
api-token: tu-token
```

**Obtener Detalles de un Archivo**
```bash
GET /api/s3/objects/{key}/details
api-token: tu-token
```

**Descargar Archivo de S3**
```bash
GET /api/s3/objects/{key}/download
api-token: tu-token
```

#### 3. Gestión de Configuración

**Obtener Configuración Actual**
```bash
GET /api/config
api-token: tu-token
```

**Actualizar Configuración**
```bash
POST /api/config
Content-Type: application/json
api-token: tu-token

{
  "backupFolders": ["/nueva/ruta"]
}
```

**Verificar Herramientas de Backup**
```bash
GET /api/config/backup-tools
api-token: tu-token
```

#### 4. Gestión de Logs

**Obtener Logs del Sistema**
```bash
GET /api/logs?page=1&limit=50&level=info&startDate=2025-01-15&endDate=2025-01-16
api-token: tu-token
```

**Obtener Estadísticas de Logs**
```bash
GET /api/logs/stats
api-token: tu-token
```

**Obtener Logs Recientes**
```bash
GET /api/logs/recent?limit=10
api-token: tu-token
```

**Obtener Logs de Backup**
```bash
GET /api/logs/backup?limit=20
api-token: tu-token
```

**Obtener Logs de Errores**
```bash
GET /api/logs/errors?limit=20
api-token: tu-token
```

**Buscar en Logs**
```bash
GET /api/logs/search?q=backup&limit=20
api-token: tu-token
```

**Exportar Logs**
```bash
GET /api/logs/export?format=csv&startDate=2025-01-15&endDate=2025-01-16
api-token: tu-token
```

#### 5. Información del Sistema

**Obtener Información del Sistema**
```bash
GET /api/config/system-info
api-token: tu-token
```

**Verificar Estado del Servicio**
```bash
GET /api/health
```

## Ejemplos de Uso Prácticos

### Ejemplo 1: Configurar Carpetas de Backup

1. **Configurar carpetas a respaldar:**
```bash
curl -X POST http://localhost:3000/api/config \
  -H "Content-Type: application/json" \
  -H "api-token: tu-token" \
  -d '{
    "backupFolders": [
      "C:\\Documentos\\Importantes",
      "C:\\Proyectos"
    ]
  }'
```

2. **Verificar configuración:**
```bash
curl -H "api-token: tu-token" http://localhost:3000/api/config
```

### Ejemplo 2: Monitorear Backups

1. **Ver estado actual:**
```bash
curl -H "api-token: tu-token" http://localhost:3000/api/backup/status
```

2. **Ver logs recientes:**
```bash
curl -H "api-token: tu-token" "http://localhost:3000/api/logs?limit=10"
```

3. **Ver estadísticas de S3:**
```bash
curl -H "api-token: tu-token" http://localhost:3000/api/s3/stats
```

### Ejemplo 3: Buscar y Gestionar Archivos

1. **Buscar backups de una fecha específica:**
```bash
curl -H "api-token: tu-token" "http://localhost:3000/api/s3/search?q=2025-01-15"
```

2. **Listar archivos en una carpeta específica:**
```bash
curl -H "api-token: tu-token" "http://localhost:3000/api/s3/objects?prefix=backups/database/"
```

## Pruebas del Sistema

### Ejecutar Todas las Pruebas
```bash
npm test
```

### Pruebas Específicas
```bash
# Pruebas de API
npm run test:api

# Pruebas de S3
npm run test:s3
```

### Pruebas Manuales
```bash
# Probar backup de carpetas
node test-folders-backup.js

# Probar backup de base de datos
node test-database-backup.js
```

## Estructura de Archivos Generados

Los backups se organizan en S3 con la siguiente estructura:

```
backups/
├── folders/
│   ├── 2025-01-15/
│   │   ├── carpeta1_20250115_143022.zip
│   │   └── carpeta2_20250115_143025.zip
│   └── 2025-01-16/
│       └── carpeta1_20250116_143022.zip
└── database/
    ├── 2025-01-15/
    │   └── database_backup_20250115_143030.sql
    └── 2025-01-16/
        └── database_backup_20250116_143030.sql
```

## Solución de Problemas

### Problemas Comunes

#### Error de Conexión S3
```
Error: Variables de entorno S3 faltantes
```
**Solución:** Verificar que todas las variables S3 estén configuradas en el archivo `.env`

#### Error de Herramientas de Backup
```
Error: pg_dump no disponible
```
**Solución:** Instalar PostgreSQL client tools o MySQL tools según corresponda

#### Error de Permisos
```
Error: EACCES: permission denied
```
**Solución:** Verificar permisos de lectura en las carpetas a respaldar

### Logs de Depuración

Los logs se almacenan en:
- `logs/application.log` - Logs generales
- `logs/error.log` - Solo errores
- `logs/backup.log` - Logs específicos de backup

### Verificar Estado del Sistema

```bash
# Verificar herramientas disponibles
curl -H "api-token: tu-token" http://localhost:3000/api/config/backup-tools

# Verificar información del sistema
curl -H "api-token: tu-token" http://localhost:3000/api/config/system-info
```

## Seguridad

### Mejores Prácticas

1. **Usar tokens seguros:** Generar tokens largos y aleatorios
2. **Variables de entorno:** Nunca commitear el archivo `.env`
3. **Permisos mínimos:** Configurar permisos S3 solo para el bucket necesario
4. **Logs seguros:** Los logs no incluyen información sensible
5. **HTTPS:** Usar HTTPS en producción

### Configuración de Seguridad

El sistema incluye middleware de seguridad:
- Helmet para headers de seguridad
- Validación de entrada
- Sanitización de rutas
- Detección de SQL injection
- Rate limiting

## Mantenimiento

### Rotación de Logs
Los logs se rotan automáticamente diariamente y se mantienen por 14 días.

### Limpieza de Archivos Temporales
Los archivos temporales se limpian automáticamente después de cada backup.

### Monitoreo
Se recomienda monitorear:
- Espacio en disco
- Logs de errores
- Estado de conexión S3
- Éxito de backups manuales

## Soporte

Para soporte técnico:
1. Revisar los logs del sistema
2. Ejecutar las pruebas del sistema
3. Verificar la configuración
4. Consultar esta documentación

---

**Versión:** 1.0.0  
**Última actualización:** Enero 2025  
**Licencia:** MIT