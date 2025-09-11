# Sistema de Backup S3

Sistema integral de backup manual para carpetas y bases de datos con almacenamiento en S3 y API REST completa.

## Características

- 🔄 **Backup manual** bajo demanda
- 📁 **Respaldo de carpetas** con compresión ZIP
- 🗄️ **Respaldo de bases de datos** (PostgreSQL, MySQL)
- ☁️ **Almacenamiento S3** compatible (AWS S3, Cloudflare R2)
- 🔍 **API REST completa** para gestión y visualización
- 📊 **Logs detallados** y estadísticas
- 🔐 **Autenticación por token** segura

## Inicio Rápido

### 1. Instalación
```bash
npm install
```

### 2. Configuración
Crear archivo `.env`:
```env
# Servidor
PORT=3000
API_TOKEN=tu-token-seguro

# S3
S3_ENDPOINT=https://tu-endpoint
S3_BUCKET=tu-bucket
S3_ACCESS_KEY_ID=tu-access-key
S3_SECRET_ACCESS_KEY=tu-secret-key

# Base de Datos
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=usuario
DB_PASSWORD=password
DB_DATABASE=base_datos
```

### 3. Ejecutar
```bash
# Desarrollo
npm run dev

# Producción
npm start
```

## Uso de la API

### Autenticación
Todas las peticiones requieren el header:
```
api-token: tu-token-configurado
```

### Endpoints Principales

```bash
# Backup manual de carpetas
POST /api/backup/folders

# Backup manual de base de datos
POST /api/backup/database

# Listar objetos en S3
GET /api/s3/objects

# Buscar archivos
GET /api/s3/search?q=backup

# Estadísticas
GET /api/s3/stats

# Configuración
GET /api/config
POST /api/config

# Logs
GET /api/logs
```

## Configuración de Backups

Editar `config/config.json`:
```json
{
  "backupFolders": [
    "C:\\ruta\\carpeta1",
    "C:\\ruta\\carpeta2"
  ]
}
```

## Pruebas

```bash
# Todas las pruebas
npm test

# Pruebas específicas
npm run test:api
npm run test:s3
```

## Estructura del Proyecto

```
backup_s3/
├── src/
│   ├── controllers/     # Controladores de API
│   ├── services/        # Lógica de negocio
│   ├── middleware/      # Middleware de seguridad
│   └── utils/           # Utilidades
├── config/              # Archivos de configuración
├── docs/                # Documentación adicional
├── logs/                # Logs del sistema
└── temp/                # Archivos temporales
```

## Documentación Completa

Para documentación detallada, consultar:
- [Documentación del Usuario](./DOCUMENTACION_USUARIO.md)
- [Servicio S3](./SERVICIO_S3.md)
- [Configuración](./docs/configuracion.md)

## Requisitos

- Node.js >= 18.0.0
- pg_dump (para PostgreSQL)
- mysqldump (para MySQL)

## Licencia

MIT

---

**Servidor activo en:** http://localhost:3000  
**API Base:** http://localhost:3000/api