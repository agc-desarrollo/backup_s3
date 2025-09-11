# Configuración del Sistema de Backup

## Descripción
Este sistema permite realizar backups automáticos de:
- Base de datos MySQL
- Carpetas específicas del sistema

## Características
- Subida automática a S3
- Programación con cron
- API REST para control manual
- Logs detallados

## Configuración
La configuración se encuentra en:
- `config/config.json` - Configuración principal
- `.env` - Variables de entorno (S3, base de datos)

## Uso
```bash
# Backup manual de carpetas
POST /api/backup/now
{
  "type": "folders"
}
```