# Seguridad

## Autenticación

El sistema usa autenticación por token API. Todas las peticiones (excepto `/api/health`) requieren el header:

```
api-token: <valor-del-token>
```

El token se configura en `.env`:
```env
API_TOKEN=tu-token-seguro-aqui
```

### Respuestas de error

| Código | Code | Causa |
|--------|------|-------|
| 401 | `MISSING_API_TOKEN` | Header `api-token` no enviado |
| 401 | `INVALID_API_TOKEN` | Token no coincide |
| 401 | `UNAUTHORIZED_ACCESS` | Acceso no autorizado al recurso |

## Middleware de Seguridad

### authMiddleware.js
- Valida el token contra la variable de entorno `API_TOKEN`
- Registra intentos de acceso (exitosos y fallidos) en logs
- Excluye `/api/health` de autenticación

### securityMiddleware.js

| Función | Protección |
|---------|-----------|
| `sanitizePaths()` | Prevención de directory traversal (`../`, `..\\`) |
| `validatePayloadSize()` | Limita tamaño de body (configurable) |
| `validateContentType()` | Rechaza content-types inesperados |
| `sanitizeInput()` | Limpia caracteres peligrosos de entrada |
| `detectSQLInjection()` | Detecta patrones de inyección SQL |
| `addSecurityHeaders()` | Headers HTTP de seguridad adicionales |

### Otras protecciones

- **Helmet** — Headers HTTP estándar de seguridad (X-Frame-Options, CSP, etc.)
- **CORS** — Configuración de orígenes permitidos
- **Rate Limiting** — Limita peticiones por IP para prevenir abuso

## Variables de Entorno

### Servidor
```env
PORT=3000
NODE_ENV=development|production
```

### Seguridad
```env
API_TOKEN=tu-token-seguro
RATE_LIMIT_WINDOW_MS=900000       # Ventana de rate limit (15 min)
RATE_LIMIT_MAX_REQUESTS=100       # Max peticiones por ventana
CORS_ORIGIN=*                     # Orígenes permitidos
CORS_METHODS=GET,POST,PUT,DELETE  # Métodos permitidos
```

### S3
```env
S3_ENDPOINT=https://s3.amazonaws.com
S3_BUCKET=mi-bucket
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_REGION=us-east-1
```

### Base de Datos
```env
DB_TYPE=mysql|postgresql
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=usuario
DB_PASSWORD=password
DB_DATABASE=mi_bd
```

### Logging
```env
LOG_LEVEL=info                    # error, warn, info, debug
LOG_MAX_SIZE=20m
LOG_MAX_FILES=14d
LOG_DATE_PATTERN=YYYY-MM-DD
```

## Mejores Prácticas

1. **Nunca commitear `.env`** — Está en `.gitignore`
2. **Tokens largos y aleatorios** en producción
3. **Permisos mínimos S3** — Solo las acciones necesarias para el bucket
4. **HTTPS en producción** — Usar proxy reverso (Nginx) con SSL
5. **Logs no contienen credenciales** — Solo metadata operacional
6. **NODE_ENV=production** — Desactiva stack traces en respuestas de error

## Información Sensible

La API **nunca expone** a través de endpoints:
- Credenciales S3 (access key, secret key)
- Credenciales de base de datos
- Tokens API
- Variables de entorno sensibles

El endpoint `GET /api/config` devuelve solo la configuración de carpetas y metadata no sensible.

---

Ver también: [Arquitectura](ARQUITECTURA.md) | [Instalación](INSTALACION.md)
