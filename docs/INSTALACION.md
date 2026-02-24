# Guía de Instalación y Despliegue

## Prerrequisitos

| Software | Versión | Verificar |
|----------|---------|-----------|
| Node.js | >= 18.0.0 | `node --version` |
| npm | (incluido) | `npm --version` |
| pg_dump | (PostgreSQL) | `pg_dump --version` |
| mysqldump | (MySQL) | `mysqldump --version` |

Además necesitas:
- Almacenamiento S3 compatible (AWS S3, Cloudflare R2, MinIO) con bucket creado
- Base de datos PostgreSQL o MySQL (opcional, solo si se usa backup de BD)

## Instalación

### 1. Obtener el código

```bash
git clone <url-del-repositorio>
cd backup_s3
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

```bash
copy .env.example .env   # Windows
cp .env.example .env     # Linux/Mac
```

Editar `.env`:

```env
# Servidor
PORT=3000
NODE_ENV=development

# Seguridad
API_TOKEN=tu-token-seguro-aqui

# S3
S3_ENDPOINT=https://s3.amazonaws.com
S3_BUCKET=mi-bucket-backup
S3_ACCESS_KEY_ID=tu-access-key
S3_SECRET_ACCESS_KEY=tu-secret-key
S3_REGION=us-east-1

# Base de Datos (opcional)
DB_TYPE=mysql              # mysql | postgresql
DB_HOST=localhost
DB_PORT=3306               # 3306 (MySQL) | 5432 (PostgreSQL)
DB_USERNAME=usuario
DB_PASSWORD=password
DB_DATABASE=mi_base_datos
```

> Para Cloudflare R2: `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`

### 4. Configurar carpetas de backup

Editar `config/config.json`:

```json
{
  "backupFolders": [
    "C:\\Users\\usuario\\Documentos\\Importantes",
    "C:\\Proyectos"
  ]
}
```

- Windows: doble barra invertida `\\`
- Linux/Mac: barra normal `/`

### 5. Configurar scheduler (opcional)

Para habilitar backups automáticos, crea `config/schedule.json` basado en el ejemplo:

```bash
copy config\schedule.example.json config\schedule.json
```

Edita `config/schedule.json` con tus jobs programados:

```json
{
  "jobs": [
    {
      "name": "weekday-folder-backup",
      "type": "folder",
      "days": [1, 2, 3, 4, 5],
      "time": "23:00",
      "enabled": true,
      "rotation": {
        "keepLast": 10,
        "keepWeeks": 3,
        "keepMonths": 2
      }
    }
  ]
}
```

**Parámetros de job:**
- `name`: Identificador único del job
- `type`: `"folder"` o `"database"`
- `days`: Array de días (0=Domingo, 1=Lunes, ..., 6=Sábado)
- `time`: Hora en formato HH:MM (24 horas)
- `enabled`: true/false para habilitar/deshabilitar
- `rotation`: Política de retención (opcional)

**Variables de entorno requeridas:**
```env
API_TOKEN=tu-token-de-api
ENABLE_SCHEDULER=true
```

> El scheduler usa el mismo `API_TOKEN` configurado en el archivo `.env` para autenticar las llamadas a la API interna.

### 6. Ejecutar

```bash
npm start       # Producción
npm run dev     # Desarrollo (auto-reload con --watch)
```

Servidor disponible en: `http://localhost:3000`

### 7. Verificar instalación

```bash
# Estado del servicio
curl http://localhost:3000/api/health

# Probar autenticación
curl -H "api-token: tu-token" http://localhost:3000/api/config

# Verificar herramientas de BD
curl -H "api-token: tu-token" http://localhost:3000/api/config/backup-tools

# Verificar scheduler (si está habilitado)
curl http://localhost:3000/api/scheduler/status
curl http://localhost:3000/api/scheduler/jobs
```

## Pruebas

```bash
npm test                    # Todas las pruebas
npm run test:api            # Pruebas de API
npm run test:s3             # Pruebas de S3
node test-folders-backup.js # Prueba manual de carpetas
node test-database-backup.js # Prueba manual de BD
```

## Despliegue en Producción

### Variables de entorno de producción

```env
NODE_ENV=production
API_TOKEN=token-largo-aleatorio-para-produccion
```

### Con PM2 (Windows/Linux)

```bash
npm install -g pm2
pm2 start server.js --name "backup-s3"
pm2 startup    # Inicio automático
pm2 save
```

### Con systemd (Linux)

Crear `/etc/systemd/system/backup-s3.service`:

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
sudo systemctl enable backup-s3
sudo systemctl start backup-s3
```

### Proxy reverso con Nginx (opcional)

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

Siguiente: [Verificar la API](API_REFERENCE.md) | [Solución de problemas](SOLUCION_PROBLEMAS.md)
