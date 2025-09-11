# Script de Pruebas para API de Backup S3

## Descripción

Este documento describe el uso del script de pruebas `test-api-services.js` que verifica el funcionamiento de todos los servicios de la API simplificada de backup S3.

## Requisitos Previos

1. **Servidor en funcionamiento**: El servidor debe estar ejecutándose en `http://localhost:3000`
   ```bash
   npm start
   ```

2. **Dependencias instaladas**: El script requiere `node-fetch` (ya incluido como dependencia de desarrollo)
   ```bash
   npm install
   ```

## Ejecución de Pruebas

### Método 1: Script npm
```bash
npm test
# o
npm run test:api
```

### Método 2: Ejecución directa
```bash
node test-api-services.js
```

## Pruebas Incluidas

El script ejecuta las siguientes verificaciones:

### 1. Pruebas Básicas
- **Health Check**: Verifica que el servicio esté funcionando
  - Endpoint: `GET /api/health`
  - Esperado: Respuesta exitosa con información del servicio

### 2. Pruebas de Autenticación
- **Token Válido**: Verifica que el token configurado sea aceptado
  - Token usado: `AABBCC` (configurado en `.env`)
  - Esperado: Acceso permitido a endpoints protegidos

- **Token Inválido**: Verifica que tokens incorrectos sean rechazados
  - Esperado: Error 401 (No autorizado)

### 3. Pruebas de Endpoints
- **Logs**: `GET /api/logs`
  - Verifica obtención de logs del sistema
  - Incluye paginación y filtros

- **Status de Backup**: `GET /api/backup/status`
  - Verifica estado del sistema de backup
  - Nota: Puede mostrar errores de configuración en desarrollo

- **Backup Manual**: `POST /api/backup/now`
  - Verifica endpoint de backup manual
  - Payload: `{"type": "database"}`
  - Nota: Puede fallar por configuración de base de datos

- **Historial**: `GET /api/backup/history`
  - Verifica obtención del historial de backups

- **Estadísticas**: `GET /api/backup/stats`
  - Verifica obtención de estadísticas del sistema

## Interpretación de Resultados

### Códigos de Color
- 🟢 **Verde (✓ PASS)**: Prueba exitosa
- 🔴 **Rojo (✗ FAIL)**: Prueba fallida
- 🟡 **Amarillo**: Secciones y advertencias
- 🔵 **Azul**: Información adicional

### Porcentajes de Éxito
- **≥ 80%**: Sistema funcionando correctamente
- **60-79%**: Sistema parcialmente funcional
- **< 60%**: Sistema con problemas críticos

### Errores Esperados en Desarrollo

Algunos errores son normales en un entorno de desarrollo:

1. **Error de configuración de base de datos**
   - Endpoint: `/api/backup/now`
   - Causa: Variables de entorno de base de datos no configuradas
   - Solución: Configurar `DB_*` en `.env`

2. **Error interno del servidor**
   - Endpoint: `/api/backup/stats`
   - Causa: Dependencias de configuración faltantes
   - Solución: Verificar configuración completa

## Configuración del Token

El script usa el token `AABBCC` por defecto. Para cambiar:

1. **En el script**: Modificar la constante `API_TOKEN`
2. **En el servidor**: Actualizar `API_TOKEN` en `.env`

## Personalización

### Modificar URL Base
```javascript
const API_BASE_URL = 'http://localhost:3000/api';
```

### Ajustar Timeout
```javascript
const TIMEOUT = 10000; // 10 segundos
```

### Agregar Nuevas Pruebas

1. Crear función de prueba siguiendo el patrón:
```javascript
async function testNuevoEndpoint() {
  try {
    const response = await makeRequest(`${API_BASE_URL}/nuevo-endpoint`);
    const data = await response.json();
    
    if (response.ok && data.success) {
      showResult('Nuevo Endpoint', true, 'Descripción del éxito', data);
      return true;
    } else {
      showResult('Nuevo Endpoint', false, `Error: ${response.status}`, data);
      return false;
    }
  } catch (error) {
    showResult('Nuevo Endpoint', false, `Error: ${error.message}`);
    return false;
  }
}
```

2. Agregar a la función `runTests()`:
```javascript
results.push(await testNuevoEndpoint());
```

## Solución de Problemas

### El script no se ejecuta
- Verificar que Node.js esté instalado
- Verificar que las dependencias estén instaladas: `npm install`
- Verificar que el servidor esté ejecutándose

### Todas las pruebas fallan
- Verificar que el servidor esté en `http://localhost:3000`
- Verificar el token en `.env`
- Verificar conectividad de red

### Errores de timeout
- Aumentar el valor de `TIMEOUT` en el script
- Verificar rendimiento del servidor

## Integración con CI/CD

Para usar en pipelines de integración continua:

```yaml
# Ejemplo para GitHub Actions
- name: Ejecutar pruebas de API
  run: |
    npm start &
    sleep 5
    npm test
    pkill -f "npm start"
```

## Logs y Debugging

Para obtener más información de debug:

```bash
# Ejecutar con warnings detallados
node --trace-warnings test-api-services.js

# Ver logs del servidor en paralelo
tail -f logs/backup-*.log
```