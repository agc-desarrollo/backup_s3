# Solución de Problemas

## Errores de Instalación

### "Cannot find module"
```bash
npm cache clean --force
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
```

### "pg_dump not found" / "mysqldump not found"

**Windows:** Agregar la carpeta `bin` de PostgreSQL/MySQL al PATH del sistema
```
# PostgreSQL: C:\Program Files\PostgreSQL\15\bin
# MySQL: C:\Program Files\MySQL\MySQL Server 8.0\bin
```

**Linux:**
```bash
sudo apt-get install postgresql-client  # PostgreSQL
sudo apt-get install mysql-client       # MySQL
```

**Verificar:**
```bash
curl -H "api-token: tu-token" http://localhost:3000/api/config/backup-tools
```

### Puerto en uso

```powershell
# Windows: encontrar y matar proceso
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# O cambiar puerto en .env
PORT=3001
```

### "EACCES permission denied"
- Verificar permisos de lectura en las carpetas configuradas para backup
- Windows: ejecutar terminal como administrador

## Errores de Conexión

### Error S3: "Variables de entorno S3 faltantes"
Verificar que `.env` contiene todas las variables S3:
```env
S3_ENDPOINT=...
S3_BUCKET=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_REGION=...
```

### Error S3: "Access Denied"
- Verificar que las credenciales S3 son correctas
- Verificar que el bucket existe y tiene los permisos adecuados
- Para Cloudflare R2: verificar que el endpoint incluye el account ID

### Error BD: "Connection refused"
- Verificar que la base de datos está corriendo
- Verificar host, puerto y credenciales en `.env`
- Verificar firewall/reglas de acceso

## Errores en Runtime

### "Ya hay un backup en progreso" (HTTP 409)
Solo se permite un backup a la vez. Esperar a que termine o verificar:
```bash
curl -H "api-token: tu-token" http://localhost:3000/api/backup/status
```

### Backup timeout (> 30 min)
- Reducir la cantidad de carpetas o su tamaño
- Verificar velocidad de conexión a S3
- Revisar logs: `curl -H "api-token: tu-token" http://localhost:3000/api/logs/errors`

### Errores de autenticación (HTTP 401)
- Verificar que el header es `api-token` (no `Authorization`)
- Verificar que el valor coincide con `API_TOKEN` en `.env`

## Debugging

### Archivos de log

| Archivo | Contenido |
|---------|-----------|
| `logs/application.log` | Logs generales del sistema |
| `logs/error.log` | Solo errores |
| `logs/backup.log` | Operaciones de backup |

### Endpoints de diagnóstico

```bash
# Estado del servicio
curl http://localhost:3000/api/health

# Logs recientes
curl -H "api-token: tu-token" "http://localhost:3000/api/logs/recent?limit=20"

# Solo errores
curl -H "api-token: tu-token" "http://localhost:3000/api/logs/errors?limit=10"

# Info del sistema
curl -H "api-token: tu-token" http://localhost:3000/api/config/system-info

# Herramientas disponibles
curl -H "api-token: tu-token" http://localhost:3000/api/config/backup-tools
```

## Mantenimiento

### Rotación de logs
- Automática: rotación diaria, retención de 14 días
- Configuración en `.env`: `LOG_MAX_SIZE`, `LOG_MAX_FILES`, `LOG_DATE_PATTERN`

### Limpieza de archivos temporales
- Automática después de cada backup
- Directorio: `temp/`
- Si quedan archivos residuales, se pueden eliminar manualmente

### Limpieza de backups antiguos
```bash
curl -X POST -H "api-token: tu-token" -H "Content-Type: application/json" \
  -d '{"daysToKeep": 30}' http://localhost:3000/api/backup/cleanup
```

### Monitoreo recomendado
- Espacio en disco local (carpeta `temp/` y `logs/`)
- Uso de almacenamiento S3 (`GET /api/s3/stats`)
- Logs de errores periódicamente (`GET /api/logs/errors`)
- Estado del servicio (`GET /api/health`)

---

Ver también: [Instalación](INSTALACION.md) | [API Reference](API_REFERENCE.md)
