# Guía de Instalación - Sistema de Backup S3

## Prerrequisitos

### Software Requerido

1. **Node.js** (versión 18 o superior)
   - Descargar desde: https://nodejs.org/
   - Verificar instalación: `node --version`

2. **npm** (incluido con Node.js)
   - Verificar instalación: `npm --version`

3. **Herramientas de Base de Datos** (según tu tipo de BD)
   
   **Para PostgreSQL:**
   ```bash
   # Windows
   # Instalar PostgreSQL desde https://www.postgresql.org/download/windows/
   # Verificar
   pg_dump --version
   ```
   
   **Para MySQL:**
   ```bash
   # Windows
   # Instalar MySQL desde https://dev.mysql.com/downloads/mysql/
   # Verificar
   mysqldump --version
   ```

### Servicios Externos

1. **Almacenamiento S3 Compatible**
   - Amazon S3, Cloudflare R2, MinIO, etc.
   - Credenciales de acceso (Access Key, Secret Key)
   - Bucket creado y configurado

2. **Base de Datos** (opcional)
   - PostgreSQL o MySQL
   - Credenciales de acceso

## Instalación Paso a Paso

### Paso 1: Obtener el Código

```bash
# Si tienes Git
git clone <url-del-repositorio>
cd backup_s3

# O descargar y extraer el ZIP
# Navegar a la carpeta extraída
```

### Paso 2: Instalar Dependencias

```bash
npm install
```

Esto instalará todas las dependencias necesarias:
- Express.js (servidor web)
- AWS SDK (cliente S3)
- Winston (logging)
- Y otras dependencias

### Paso 3: Configurar Variables de Entorno

Crear archivo `.env` en la raíz del proyecto:

```bash
# Windows
copy .env.example .env

# Linux/Mac
cp .env.example .env
```

Editar el archivo `.env` con tus configuraciones:

```env
# ===========================================
# CONFIGURACIÓN DEL SERVIDOR
# ===========================================
PORT=3000
NODE_ENV=development

# ===========================================
# CONFIGURACIÓN DE SEGURIDAD
# ===========================================
# Token para autenticación de API (cambiar por uno seguro)
API_TOKEN=mi-token-super-seguro-123456

# ===========================================
# CONFIGURACIÓN S3
# ===========================================
# Para Amazon S3
S3_ENDPOINT=https://s3.amazonaws.com
# Para Cloudflare R2
# S3_ENDPOINT=https://tu-account-id.r2.cloudflarestorage.com

S3_BUCKET=mi-bucket-backup
S3_ACCESS_KEY_ID=tu-access-key-aqui
S3_SECRET_ACCESS_KEY=tu-secret-key-aqui
S3_REGION=us-east-1

# ===========================================
# CONFIGURACIÓN DE BASE DE DATOS
# ===========================================
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=tu-usuario-bd
DB_PASSWORD=tu-password-bd
DB_DATABASE=tu-base-datos

# Para PostgreSQL, cambiar:
# DB_TYPE=postgresql
# DB_PORT=5432
```

### Paso 4: Configurar Carpetas de Backup

Editar el archivo `config/config.json`:

```json
{
  "backupFolders": [
    "C:\\Users\\tu-usuario\\Documentos\\Importantes",
    "C:\\Proyectos",
    "D:\\Datos"
  ],
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

**Notas importantes:**
- En Windows, usar doble barra invertida `\\` en las rutas
- En Linux/Mac, usar barra normal `/`

### Paso 5: Configurar Usuarios (Opcional)

Si planeas usar la interfaz web, editar `config/users.json`:

```json
{
  "admin": {
    "password": "$2b$10$hash-de-tu-password",
    "role": "admin"
  }
}
```

**Para generar hash de password:**
```bash
node -e "console.log(require('bcrypt').hashSync('tu-password', 10))"
```

### Paso 6: Verificar Configuración

```bash
# Verificar herramientas de backup
node -e "import('./src/services/databaseService.js').then(m => m.databaseService.checkBackupTools().then(console.log))"

# Verificar conexión S3
node -e "import('./src/services/s3Service.js').then(m => m.s3Service.init().then(() => console.log('S3 OK')))"
```

### Paso 7: Ejecutar el Sistema

```bash
# Modo desarrollo (con auto-reload)
npm run dev

# Modo producción
npm start
```

El servidor estará disponible en: http://localhost:3000

## Verificación de la Instalación

### 1. Verificar que el Servidor Funciona

```bash
curl http://localhost:3000/api
```

Deberías ver una respuesta JSON con información del sistema.

### 2. Probar Autenticación

```bash
curl -H "api-token: mi-token-super-seguro-123456" http://localhost:3000/api/config
```

### 3. Ejecutar Pruebas

```bash
# Todas las pruebas
npm test

# Solo pruebas de API
npm run test:api

# Solo pruebas de S3
npm run test:s3
```

### 4. Probar Backup Manual

```bash
# Backup de carpetas
curl -X POST \
  -H "Content-Type: application/json" \
  -H "api-token: mi-token-super-seguro-123456" \
  -d '{"folders": ["C:\\ruta\\test"]}' \
  http://localhost:3000/api/backup/folders
```

## Configuración para Producción

### 1. Variables de Entorno de Producción

```env
NODE_ENV=production
PORT=3000

# Token más seguro
API_TOKEN=token-super-complejo-y-largo-para-produccion

# Configuración S3 de producción
S3_ENDPOINT=https://s3.amazonaws.com
# ... resto de configuración
```

### 2. Configurar como Servicio del Sistema

**Windows (usando PM2):**
```bash
# Instalar PM2
npm install -g pm2

# Iniciar servicio
pm2 start server.js --name "backup-s3"

# Configurar inicio automático
pm2 startup
pm2 save
```

**Linux (systemd):**
Crear archivo `/etc/systemd/system/backup-s3.service`:

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

### 3. Configurar Proxy Reverso (Opcional)

**Nginx:**
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

## Solución de Problemas de Instalación

### Error: "Cannot find module"
```bash
# Limpiar cache y reinstalar
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Error: "pg_dump not found"
```bash
# Windows: Agregar PostgreSQL al PATH
# Agregar C:\Program Files\PostgreSQL\15\bin al PATH del sistema

# Linux
sudo apt-get install postgresql-client

# Mac
brew install postgresql
```

### Error: "Access denied" en S3
- Verificar credenciales S3
- Verificar permisos del bucket
- Verificar endpoint correcto

### Error: "EACCES permission denied"
```bash
# Verificar permisos de las carpetas
# Windows: Ejecutar como administrador
# Linux: Verificar permisos con ls -la
```

### Puerto en uso
```bash
# Cambiar puerto en .env
PORT=3001

# O matar proceso en puerto 3000
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3000 | xargs kill
```

## Siguientes Pasos

1. **Configurar backups manuales** usando la API
2. **Monitorear logs** en la carpeta `logs/`
3. **Configurar alertas** para fallos de backup
4. **Revisar documentación completa** en `DOCUMENTACION_USUARIO.md`
5. **Configurar monitoreo** del sistema en producción

## Soporte

Si encuentras problemas durante la instalación:

1. Revisar logs en `logs/application.log`
2. Ejecutar `npm run test` para diagnosticar
3. Verificar configuración con los comandos de verificación
4. Consultar la documentación completa

---

¡Instalación completada! El sistema está listo para usar.