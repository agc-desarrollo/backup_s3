# Servicio de Visualización de Contenidos S3

Este documento describe el nuevo servicio implementado para visualizar y gestionar los contenidos alojados en Amazon S3.

## Descripción General

El servicio S3 permite:
- Listar objetos almacenados en S3
- Obtener detalles específicos de archivos
- Visualizar la estructura de carpetas
- Obtener estadísticas de almacenamiento
- Buscar objetos por nombre
- Navegar por la jerarquía de carpetas

## Endpoints Disponibles

### 1. Listar Objetos
```
GET /api/s3/objects
```

**Parámetros de consulta:**
- `prefix` (opcional): Filtrar objetos por prefijo
- `maxKeys` (opcional): Número máximo de objetos a retornar (1-1000, por defecto 100)
- `continuationToken` (opcional): Token para paginación

**Ejemplo:**
```bash
curl -H "api-token: AABBCC" "http://localhost:3000/api/s3/objects?prefix=backups/&maxKeys=50"
```

**Respuesta:**
```json
{
  "success": true,
  "objects": [
    {
      "key": "backups/database/2025-09-11/backup.sql",
      "size": 1024,
      "sizeFormatted": "1.00 KB",
      "lastModified": "2025-09-11T10:30:00.000Z",
      "etag": "\"abc123\"",
      "contentType": "application/sql",
      "type": "database",
      "folder": "backups/database/2025-09-11",
      "fileName": "backup.sql"
    }
  ],
  "count": 1,
  "isTruncated": false,
  "nextContinuationToken": null
}
```

### 2. Estructura de Carpetas
```
GET /api/s3/folders
```

**Parámetros de consulta:**
- `prefix` (opcional): Prefijo de carpeta a explorar
- `delimiter` (opcional): Delimitador de carpetas (por defecto "/")

**Ejemplo:**
```bash
curl -H "api-token: AABBCC" "http://localhost:3000/api/s3/folders?prefix=backups/"
```

**Respuesta:**
```json
{
  "success": true,
  "folders": [
    {
      "name": "database/",
      "fullPath": "backups/database/",
      "type": "folder"
    },
    {
      "name": "folders/",
      "fullPath": "backups/folders/",
      "type": "folder"
    }
  ],
  "files": [
    {
      "key": "backups/readme.txt",
      "size": 256,
      "sizeFormatted": "256 B",
      "lastModified": "2025-09-11T10:00:00.000Z",
      "type": "text"
    }
  ],
  "totalFolders": 2,
  "totalFiles": 1,
  "currentPath": "backups/"
}
```

### 3. Detalles de Objeto
```
GET /api/s3/objects/:key/details
```

**Parámetros:**
- `key`: Clave del objeto (debe estar codificada en URL)

**Ejemplo:**
```bash
curl -H "api-token: AABBCC" "http://localhost:3000/api/s3/objects/backups%2Fdatabase%2F2025-09-11%2Fbackup.sql/details"
```

**Respuesta:**
```json
{
  "success": true,
  "object": {
    "key": "backups/database/2025-09-11/backup.sql",
    "size": 1024,
    "sizeFormatted": "1.00 KB",
    "lastModified": "2025-09-11T10:30:00.000Z",
    "etag": "\"abc123\"",
    "contentType": "application/sql",
    "metadata": {
      "type": "database",
      "upload-date": "2025-09-11T10:30:00.000Z"
    },
    "type": "database",
    "folder": "backups/database/2025-09-11",
    "fileName": "backup.sql",
    "downloadUrl": "https://bucket.s3.amazonaws.com/backups/database/2025-09-11/backup.sql"
  }
}
```

### 4. Estadísticas de S3
```
GET /api/s3/stats
```

**Ejemplo:**
```bash
curl -H "api-token: AABBCC" "http://localhost:3000/api/s3/stats"
```

**Respuesta:**
```json
{
  "success": true,
  "stats": {
    "bucketName": "mi-bucket",
    "totalObjects": 150,
    "totalSize": 1073741824,
    "totalSizeFormatted": "1.00 GB",
    "averageFileSize": 7158278,
    "averageFileSizeFormatted": "6.83 MB",
    "oldestFile": {
      "key": "backups/old-backup.sql",
      "lastModified": "2025-01-01T00:00:00.000Z"
    },
    "newestFile": {
      "key": "backups/latest-backup.sql",
      "lastModified": "2025-09-11T17:30:00.000Z"
    },
    "fileTypes": {
      "sql": 50,
      "zip": 75,
      "txt": 25
    }
  }
}
```

### 5. Buscar Objetos
```
GET /api/s3/search
```

**Parámetros de consulta:**
- `q` (requerido): Término de búsqueda
- `limit` (opcional): Número máximo de resultados (1-100, por defecto 20)
- `prefix` (opcional): Limitar búsqueda a un prefijo específico

**Ejemplo:**
```bash
curl -H "api-token: AABBCC" "http://localhost:3000/api/s3/search?q=backup&limit=10"
```

**Respuesta:**
```json
{
  "success": true,
  "results": [
    {
      "key": "backups/database/2025-09-11/backup.sql",
      "size": 1024,
      "sizeFormatted": "1.00 KB",
      "lastModified": "2025-09-11T10:30:00.000Z",
      "type": "database",
      "relevance": 0.95
    }
  ],
  "totalFound": 1,
  "query": "backup",
  "limit": 10
}
```

## Autenticación

Todos los endpoints requieren autenticación mediante el header `api-token`:

```bash
api-token: AABBCC
```

## Códigos de Error

- `400 Bad Request`: Parámetros inválidos
- `401 Unauthorized`: Token de autenticación inválido
- `404 Not Found`: Objeto no encontrado
- `500 Internal Server Error`: Error del servidor

## Ejemplos de Uso

### Explorar la estructura de backups
```bash
# Listar carpetas principales
curl -H "api-token: AABBCC" "http://localhost:3000/api/s3/folders"

# Explorar carpeta de backups
curl -H "api-token: AABBCC" "http://localhost:3000/api/s3/folders?prefix=backups/"

# Listar archivos en una fecha específica
curl -H "api-token: AABBCC" "http://localhost:3000/api/s3/objects?prefix=backups/database/2025-09-11/"
```

### Buscar archivos específicos
```bash
# Buscar todos los archivos SQL
curl -H "api-token: AABBCC" "http://localhost:3000/api/s3/search?q=.sql"

# Buscar backups de una fecha específica
curl -H "api-token: AABBCC" "http://localhost:3000/api/s3/search?q=2025-09-11"
```

### Obtener información detallada
```bash
# Estadísticas generales
curl -H "api-token: AABBCC" "http://localhost:3000/api/s3/stats"

# Detalles de un archivo específico
curl -H "api-token: AABBCC" "http://localhost:3000/api/s3/objects/backups%2Fdatabase%2F2025-09-11%2Fbackup.sql/details"
```

## Pruebas

Para ejecutar las pruebas del servicio S3:

```bash
npm run test:s3
```

Esto ejecutará un conjunto completo de pruebas que verifican:
- Conectividad del servidor
- Autenticación
- Listado de objetos
- Estructura de carpetas
- Búsqueda de objetos
- Obtención de estadísticas
- Detalles de objetos
- Validación de parámetros
- Manejo de errores

## Notas Técnicas

- El servicio utiliza paginación para manejar grandes cantidades de objetos
- Los tamaños de archivo se formatean automáticamente (B, KB, MB, GB)
- Las fechas se devuelven en formato ISO 8601
- Los tipos de archivo se detectan automáticamente basándose en la extensión
- Las URLs de descarga se generan dinámicamente
- El servicio es compatible con buckets de S3 y Cloudflare R2

## Configuración

El servicio utiliza las mismas variables de entorno que el sistema de backup:

- `AWS_ACCESS_KEY_ID`: Clave de acceso de AWS
- `AWS_SECRET_ACCESS_KEY`: Clave secreta de AWS
- `AWS_REGION`: Región de AWS
- `S3_BUCKET_NAME`: Nombre del bucket S3
- `S3_ENDPOINT`: Endpoint personalizado (para Cloudflare R2)
- `API_TOKEN`: Token de autenticación de la API

## Limitaciones

- Máximo 1000 objetos por consulta de listado
- Máximo 100 resultados por búsqueda
- Los objetos muy grandes (>5GB) pueden tener tiempos de respuesta más lentos
- La búsqueda es sensible a mayúsculas y minúsculas