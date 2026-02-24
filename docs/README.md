# Sistema de Backup S3

Sistema integral de backup para carpetas locales y bases de datos con almacenamiento S3, gestionado mediante API REST con autenticación por token.

## Características

- **Backup manual** de carpetas (compresión ZIP) y bases de datos (PostgreSQL, MySQL)
- **Almacenamiento S3** compatible (AWS S3, Cloudflare R2, MinIO)
- **API REST completa** para gestión, monitoreo y visualización
- **Interfaz web** de gestión (Vue.js) para scheduler y objetos S3
- **Logs avanzados** con rotación, filtros, búsqueda y exportación
- **Seguridad** mediante token API, rate limiting, sanitización de entrada y helmet

## Inicio Rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar entorno (copiar y editar)
copy .env.example .env

# 3. Configurar carpetas de backup
# Editar config/config.json

# 4. Ejecutar
npm start          # producción
npm run dev        # desarrollo (auto-reload)
```

## Uso Básico

```bash
# Backup de carpetas
curl -X POST -H "api-token: tu-token" http://localhost:3000/api/backup/folders

# Backup de base de datos
curl -X POST -H "api-token: tu-token" http://localhost:3000/api/backup/database

# Ver estado
curl -H "api-token: tu-token" http://localhost:3000/api/backup/status

# Interfaz web de gestión
# Acceder a: http://localhost:3000/manage?api_token=tu-token
```

## Estructura del Proyecto

```
backup_s3/
├── server.js                # Punto de entrada
├── config/config.json       # Carpetas de backup
├── .env                     # Variables de entorno (S3, BD, seguridad)
├── src/
│   ├── controllers/         # backupController, configController, logsController, s3Controller
│   ├── services/            # backupService, configService, databaseService, s3Service, logger
│   └── middleware/          # authMiddleware, securityMiddleware
├── docs/                    # Documentación (esta carpeta)
├── logs/                    # Logs del sistema (auto-generados)
└── temp/                    # Archivos temporales (auto-limpiados)
```

## Mapa de Documentación

| Documento | Contenido | Audiencia |
|-----------|-----------|-----------|
| [INSTALACION.md](INSTALACION.md) | Prerrequisitos, instalación paso a paso, despliegue en producción | DevOps / Administrador |
| [API_REFERENCE.md](API_REFERENCE.md) | Todos los endpoints con ejemplos de request/response | Desarrollador / Integrador |
| [ARQUITECTURA.md](ARQUITECTURA.md) | Diseño del sistema, servicios, modelos de datos, patrones | Desarrollador |
| [SEGURIDAD.md](SEGURIDAD.md) | Autenticación, middleware, variables de entorno, mejores prácticas | DevOps / Seguridad |
| [SOLUCION_PROBLEMAS.md](SOLUCION_PROBLEMAS.md) | Errores comunes, debugging, mantenimiento | Soporte / Administrador |

## Requisitos

- Node.js >= 18.0.0
- `pg_dump` (para PostgreSQL) o `mysqldump` (para MySQL)
- Bucket S3 compatible configurado

## Licencia

MIT
