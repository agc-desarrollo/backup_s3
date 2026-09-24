# backup-s3-system

Sistema de backup para carpetas locales y bases de datos (PostgreSQL / MySQL) con almacenamiento en S3, gestionado mediante API REST con autenticación por token.

## Índice

1. [Características](#características)
2. [Requisitos](#requisitos)
3. [Instalación](#instalación)
4. [Configuración](#configuración)
5. [Uso](#uso)
6. [Referencia de API](#referencia-de-api)
7. [Arquitectura](#arquitectura)
8. [Seguridad](#seguridad)
9. [Despliegue en producción](#despliegue-en-producción)
10. [Solución de problemas](#solución-de-problemas)

---

## Características

- **Backup vía webhook** de carpetas (comprimidas en ZIP) y de base de datos (PostgreSQL con `pg_dump`, MySQL con `mysqldump` o `mysqlsh`).
- **Rotación automática** de backups antiguos en S3 tras cada backup exitoso (`config/rotation.json`).
- **Almacenamiento S3 compatible**: AWS S3, Cloudflare R2, MinIO.
- **API REST** para ejecutar, consultar y eliminar backups, explorar el bucket y consultar logs.
- **Interfaz web** de gestión (`/manage`) para lanzar backups y administrar objetos S3.
- **Logs** estructurados con Winston y rotación mensual.
- **Seguridad**: token de API, helmet, sanitización de entrada, detección de inyección SQL y prevención de *directory traversal*.

No hay scheduler interno: la programación de backups se delega a una herramienta externa (cron, Programador de tareas de Windows, n8n, Node-RED…) que llame a los endpoints.

---

## Requisitos

| Software | Versión | Verificar |
|----------|---------|-----------|
| Node.js | >= 18.0.0 | `node --version` |
| pg_dump | solo si `DB_TYPE=postgresql` | `pg_dump --version` |
| mysqldump / mysqlsh | solo si `DB_TYPE=mysql` | `mysqldump --version` |

Además se necesita un bucket S3 compatible ya creado y credenciales con permisos de lectura, escritura, listado y borrado sobre él.

---

## Instalación

```bash
git clone https://github.com/agc-desarrollo/backup_s3.git
cd backup_s3
npm install

# Copiar plantillas de configuración
copy .env.example .env                                  # Windows
copy config\config.json.example config\config.json
copy config\rotation.example.json config\rotation.json
# (Linux/Mac: cp en lugar de copy, con barras /)

# Editar .env, config/config.json y config/rotation.json (ver Configuración)

npm start        # producción
npm run dev      # desarrollo (auto-reload con --watch)
```

Servidor disponible en `http://localhost:3000` (o el `PORT` configurado).

Al arrancar, `startupValidator` comprueba las variables obligatorias y aborta con un mensaje claro si falta alguna o es inválida.

### Verificar la instalación

```bash
curl http://localhost:3000/api/health
curl -H "api-token: TU_TOKEN" http://localhost:3000/api/config
curl -H "api-token: TU_TOKEN" http://localhost:3000/api/config/backup-tools
```

---

## Configuración

### Variables de entorno (`.env`)

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `PORT` | Sí | Puerto del servidor (p. ej. `3000`) |
| `NODE_ENV` | No | `development` o `production` (en producción se ocultan los mensajes de error internos y se desactiva CORS) |
| `API_TOKEN` | Sí | Token de autenticación de la API. Usar un valor largo y aleatorio (`openssl rand -hex 32`) |
| `S3_ENDPOINT` | Sí | `https://s3.amazonaws.com`, `https://<account-id>.r2.cloudflarestorage.com`, etc. |
| `S3_BUCKET` | Sí | Nombre del bucket |
| `S3_ACCESS_KEY_ID` | Sí | Access key |
| `S3_SECRET_ACCESS_KEY` | Sí | Secret key |
| `S3_REGION` | Sí | Región (`us-east-1`, `auto` para R2) |
| `DB_TYPE` | Sí | `postgresql` o `mysql` |
| `DB_CONNECTION_STRING` | Si `DB_TYPE=postgresql` | `postgresql://usuario:password@host:5432/base`. Codificar caracteres especiales de la contraseña (`@` → `%40`) |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` | Si `DB_TYPE=mysql` | Datos de conexión MySQL |
| `MYSQL_BACKUP_TOOL` | No | `mysqldump` (por defecto) o `mysqlsh`. Solo aplica a MySQL |
| `LOG_LEVEL` | No | `error`, `warn`, `info` (por defecto), `debug` |

Ejemplo mínimo (PostgreSQL + Cloudflare R2):

```env
PORT=3000
NODE_ENV=production
API_TOKEN=un-token-largo-y-aleatorio

S3_ENDPOINT=https://1234567890abcdef.r2.cloudflarestorage.com
S3_BUCKET=mi-bucket-backup
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_REGION=auto

DB_TYPE=postgresql
DB_CONNECTION_STRING=postgresql://usuario:password@localhost:5432/mi_base
```

### Carpetas a respaldar (`config/config.json`)

```json
{
  "backupFolders": [
    "C:\\Users\\usuario\\Documentos\\Importantes",
    "D:\\Proyectos"
  ]
}
```

En Windows se usa doble barra invertida (`\\`); en Linux/Mac, barra normal (`/`). También se puede modificar vía `POST /api/config`.

### Rotación (`config/rotation.json`)

La rotación borra backups antiguos de S3 y se aplica automáticamente tras cada backup exitoso. Hay una política por tipo de backup (`database` y `folder`):

```json
{
  "database": { "keepLast": 10, "keepWeeks": 3, "keepMonths": 2 },
  "folder":   { "keepLast": 10, "keepWeeks": 3, "keepMonths": 2 }
}
```

| Campo | Descripción |
|-------|-------------|
| `keepLast` | Mantener los N backups más recientes |
| `keepDays` | Mantener los backups de los últimos N días |
| `keepWeeks` | Mantener un backup por semana, últimas N semanas |
| `keepMonths` | Mantener un backup por mes, últimos N meses |

Todos los campos son opcionales y se combinan: un backup se conserva si cumple al menos una regla. Si el archivo no existe o no hay clave para un tipo, no se rota nada. El archivo se lee en cada backup, así que los cambios no requieren reiniciar. El resultado se devuelve en el campo `rotation` de la respuesta del backup.

---

## Uso

### Ejecutar backups

```bash
curl -X POST -H "api-token: TU_TOKEN" http://localhost:3000/api/backup/folders
curl -X POST -H "api-token: TU_TOKEN" http://localhost:3000/api/backup/database
curl -H "api-token: TU_TOKEN" http://localhost:3000/api/backup/status
```

Solo se permite un backup a la vez; si ya hay uno en curso se responde `409`.

### Programar backups

Ejemplo con cron (Linux), backup de BD diario a las 03:00:

```cron
0 3 * * * curl -s -X POST -H "api-token: TU_TOKEN" http://localhost:3000/api/backup/database
```

En Windows se puede usar el Programador de tareas con el mismo `curl`, o cualquier orquestador (n8n, Node-RED) que haga un POST al endpoint.

### Interfaz web

```
http://localhost:3000/manage?api_token=TU_TOKEN
```

Permite lanzar backups de BD y carpetas, navegar el bucket por prefijo, y descargar o eliminar objetos.

### Scripts de prueba

Con el servidor levantado:

```bash
npm test                 # ambos
npm run test:folders     # node test-folders-backup.js
npm run test:database    # node test-database-backup.js
```

Los scripts leen `PORT` y `API_TOKEN` del `.env` y ejecutan backups reales contra el bucket configurado.

---

## Referencia de API

- **Base URL:** `http://localhost:3000/api`
- **Autenticación:** header `api-token: TU_TOKEN` o query `?api_token=TU_TOKEN`. Todos los endpoints la requieren excepto `/api/health`.
- **Formato de error:** `{ "success": false, "message": "..." }`

| Código | Uso |
|--------|-----|
| 200 | Operación exitosa |
| 400 | Datos de entrada inválidos |
| 401 | Token faltante o inválido |
| 404 | Recurso o ruta no encontrados |
| 409 | Ya hay un backup en progreso |
| 500 | Error interno |

### Backup — `/api/backup`

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/backup/folders` | Comprime las carpetas configuradas y las sube a S3 (más un `.txt` con el detalle). Sin body |
| POST | `/api/backup/database` | Hace el dump de la BD configurada en `.env`, lo comprime y lo sube a S3. Sin body |
| GET | `/api/backup/status` | Estado actual (`isRunning`, trabajo en curso, último backup) |
| GET | `/api/backup/stats` | Estadísticas calculadas desde S3 |
| GET | `/api/backup/history` | Historial paginado. Query: `page` (1), `limit` (20), `status` |
| DELETE | `/api/backup/:key` | Elimina un backup de S3 (key URL-encoded) |
| POST | `/api/backup/cleanup` | Elimina backups más antiguos que N días. Body: `{ "daysToKeep": 30 }` |

Respuesta de ejemplo de `POST /api/backup/database`:

```json
{
  "success": true,
  "message": "Backup de base de datos completado exitosamente",
  "data": {
    "jobId": "backup-db-1642678800",
    "type": "database",
    "success": true,
    "databaseBackup": { "success": true, "fileName": "database-backup.zip", "size": 1048576 },
    "s3Upload": { "success": true, "s3Key": "backups/database 2025-01-15-14-30.zip" },
    "rotation": { "...": "resultado de la rotación" }
  }
}
```

### S3 — `/api/s3`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/s3/objects` | Lista objetos. Query: `prefix`, `maxKeys` (1-1000, 100), `continuationToken` |
| GET | `/api/s3/folders` | Lista prefijos (pseudo-carpetas). Query: `prefix` |
| GET | `/api/s3/search` | Busca por nombre. Query: `q` (obligatorio), `limit` (1-100, 20), `prefix` |
| GET | `/api/s3/stats` | Estadísticas del bucket (objetos, tamaño total, tipos, más antiguo/reciente) |
| GET | `/api/s3/objects/:key/details` | Metadata del objeto y URL prefirmada |
| GET | `/api/s3/objects/:key/download` | Descarga en streaming |
| DELETE | `/api/s3/objects/:key` | Elimina el objeto |

La `:key` debe ir URL-encoded.

### Configuración — `/api/config`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/config` | Configuración de carpetas (no expone credenciales) |
| POST | `/api/config` | Actualiza carpetas. Body: `{ "backupFolders": ["C:\\ruta"] }` |
| GET | `/api/config/backup-tools` | Disponibilidad de `pg_dump`, `mysqldump` y `mysqlsh` |
| GET | `/api/config/system-info` | Versión de Node, plataforma, memoria, uptime |

### Logs — `/api/logs`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/logs` | Paginado. Query: `page`, `limit` (máx. 100), `level`, `startDate`, `endDate` |
| GET | `/api/logs/stats` | Conteo por nivel |
| GET | `/api/logs/recent` | Query: `limit` (10), `hours` (24), `level` |
| GET | `/api/logs/backup` | Logs de operaciones de backup. Query: `limit` (20) |
| GET | `/api/logs/errors` | Solo errores. Query: `limit` (20) |
| GET | `/api/logs/search` | Query: `q` (obligatorio), `limit` (20) |
| GET | `/api/logs/export` | Descarga. Query: `format` (`json`, `csv`, `txt`), `startDate`, `endDate` |

### Otros

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Sin autenticación. `{ "success": true, "message": "...", "timestamp": "..." }` |
| GET | `/manage?api_token=...` | Interfaz web de gestión |

---

## Arquitectura

```
Cliente / cron ──► Express ──► Middleware ──► Controladores ──► Servicios ──► S3 / PostgreSQL / MySQL / FS
                                  │               │                 │
                             helmet, cors     backup, config,   backupService, databaseService,
                             sanitización     logs, s3          s3Service, rotationService,
                             auth (token)                       configService, logger
```

### Estructura del proyecto

```
backup_s3/
├── server.js                  # Punto de entrada: middlewares, rutas, arranque
├── .env                       # Variables de entorno (no versionado)
├── config/
│   ├── config.json            # Carpetas a respaldar (no versionado)
│   └── rotation.json          # Políticas de rotación (no versionado)
├── public/manage.html         # Interfaz web (Vue.js)
├── src/
│   ├── controllers/           # backup, config, logs, s3
│   ├── middleware/            # authMiddleware, securityMiddleware
│   └── services/              # backup, database, s3, rotation, config, logger, startupValidator
├── logs/                      # Generado automáticamente
└── temp/                      # Archivos temporales, se limpian tras cada backup
```

### Servicios

| Servicio | Responsabilidad |
|----------|-----------------|
| `backupService` | Orquesta los backups: comprime, sube a S3, limpia `temp/`, aplica rotación; estado, historial y estadísticas |
| `databaseService` | Ejecuta `pg_dump` / `mysqldump` / `mysqlsh`, limpia la salida y comprime el dump |
| `s3Service` | Cliente S3 (`@aws-sdk/client-s3`): listar, subir, descargar, buscar, borrar, URLs prefirmadas |
| `rotationService` | Aplica las políticas de `config/rotation.json` |
| `configService` | Lee y escribe `config/config.json`; información del sistema |
| `startupValidator` | Valida las variables de entorno al arrancar |
| `logger` | Winston con rotación de archivos |

### Almacenamiento en S3

Los objetos se guardan con fecha y hora UTC en el nombre:

```
backups/database 2025-01-15-14-30.zip
backups/carpetas 2025-01-15-14-30.zip
backups/carpetas 2025-01-15-14-30-detalle.txt
```

### Stack

Node.js (ES Modules), Express 4, `@aws-sdk/client-s3`, `pg`, `mysql2`, `archiver` / `adm-zip`, `winston` + `winston-daily-rotate-file`, `joi`, `helmet`, `cors`, `compression`, `dotenv`.

---

## Seguridad

### Autenticación

Todas las rutas `/api/*` (excepto `/api/health`) y `/manage` requieren el token definido en `API_TOKEN`, enviado en el header `api-token` o en el query `api_token`. Si falta o no coincide se responde `401`.

> El query `api_token` queda registrado en logs de acceso y en el historial del navegador. En integraciones (cron, webhooks) conviene usar siempre el header.

### Middlewares

| Middleware | Protección |
|------------|------------|
| `helmet` | Headers de seguridad estándar y CSP |
| `cors` | Permitido en desarrollo, deshabilitado en `production` |
| `addSecurityHeaders`, `validateSecurityHeaders` | Headers de seguridad adicionales |
| `validatePayloadSize`, `validateContentType` | Límites de tamaño (body JSON máx. 10 MB) y content-type |
| `sanitizeInput` | Limpieza de la entrada |
| `detectSQLInjection` | Rechaza patrones de inyección SQL |
| `sanitizePaths` | Prevención de *directory traversal* (`../`) |

No hay rate limiting. Si el servicio se expone fuera de la red local, conviene aplicarlo en el proxy reverso.

### Buenas prácticas

1. **Nunca versionar credenciales.** `.env`, `config/config.json` y `config/rotation.json` están en `.gitignore`; no crear scripts ni ejemplos con valores reales.
2. **Token largo y aleatorio** en `API_TOKEN`, rotado periódicamente y si se sospecha una fuga.
3. **Permisos mínimos en S3**: credenciales limitadas al bucket de backups.
4. **Usuario de BD de solo lectura** para los dumps.
5. **HTTPS** mediante un proxy reverso si el servicio se expone fuera de localhost.
6. **`NODE_ENV=production`** para no devolver mensajes de error internos.

La API nunca devuelve credenciales de S3 ni de BD, ni el token.

---

## Despliegue en producción

### PM2 (Windows / Linux)

```bash
npm install -g pm2
pm2 start server.js --name backup-s3
pm2 startup
pm2 save
```

### systemd (Linux)

`/etc/systemd/system/backup-s3.service`:

```ini
[Unit]
Description=Sistema de Backup S3
After=network.target

[Service]
Type=simple
User=tu-usuario
WorkingDirectory=/ruta/al/proyecto
ExecStart=/usr/bin/node server.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now backup-s3
```

### Nginx como proxy reverso (opcional)

```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## Solución de problemas

### El servidor no arranca

- **Variables faltantes o inválidas**: el mensaje de `startupValidator` indica cuál. Revisar `.env` según la tabla de [Configuración](#variables-de-entorno-env).
- **`DB_CONNECTION_STRING` inválida**: comprobar el formato `postgresql://usuario:password@host:puerto/base` y codificar los caracteres especiales de la contraseña.
- **"Cannot find module"**: borrar `node_modules` y `package-lock.json` y ejecutar `npm install`.
- **Puerto en uso**: `netstat -ano | findstr :3000` y `taskkill /PID <PID> /F`, o cambiar `PORT`.

### `pg_dump` / `mysqldump` no encontrado

- **Windows**: agregar al `PATH` la carpeta `bin` de PostgreSQL (`C:\Program Files\PostgreSQL\<versión>\bin`) o de MySQL.
- **Linux**: `sudo apt-get install postgresql-client` o `mysql-client`.
- Verificar con `GET /api/config/backup-tools`.

### Errores de S3

- **Access Denied**: revisar las credenciales, que el bucket exista y los permisos. En R2, el endpoint debe incluir el account ID y la región `auto`.

### Errores de base de datos

- **Connection refused**: la BD no está accesible. Revisar host, puerto, credenciales y firewall.

### Errores en ejecución

- **401**: el header debe llamarse `api-token` (no `Authorization`) y coincidir con `API_TOKEN`.
- **409**: ya hay un backup en curso; consultar `GET /api/backup/status`.
- **EACCES**: el proceso no tiene permisos de lectura sobre alguna carpeta configurada.

### Logs

Se escriben en `logs/`, rotan cada mes o al llegar a 20 MB, y se conservan 12 meses:

| Archivo | Contenido |
|---------|-----------|
| `backup-YYYY-MM.log` | Log general |
| `error-YYYY-MM.log` | Solo errores |
| `backup-operations-YYYY-MM.log` | Operaciones de backup |
| `exceptions.log`, `rejections.log` | Excepciones y promesas no manejadas |

También se pueden consultar vía API: `GET /api/logs/recent`, `GET /api/logs/errors`, `GET /api/logs/search?q=...`.

### Mantenimiento

- `temp/` se limpia tras cada backup; si quedan residuos (p. ej. tras una caída), se pueden borrar a mano.
- Vigilar el espacio en disco (`temp/`, `logs/`) y el uso del bucket (`GET /api/s3/stats`).

---

## Licencia

MIT
