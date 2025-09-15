# Configuración del Sistema de Backup

## Descripción
Este sistema permite realizar backups manuales de:
- Base de datos MySQL
- Carpetas específicas del sistema

## Características
- Subida a S3
- API REST para control manual
- Logs detallados

## Configuración
La configuración se encuentra en:
- `config/config.json` - Configuración principal
- `.env` - Variables de entorno (S3, base de datos)

## Uso
```bash
# Backup manual de carpetas
POST /api/backup/folders

# Backup manual de base de datos
POST /api/backup/database
```