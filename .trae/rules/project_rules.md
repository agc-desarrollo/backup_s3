# Reglas del Proyecto — backup-s3-system

## Convenciones de Código

- **ES Modules**: Usar `import`/`export`, no `require` (`"type": "module"` en package.json)
- **Async/await**: Toda la capa de servicios es asíncrona
- **Manejo de errores**: try/catch en controladores, nunca exponer stack traces en producción
- **Validación**: Usar Joi schemas para validar entrada en endpoints POST/PUT
- **Logging**: Usar `logger` (Winston), no `console.log`. Incluir metadata contextual (jobId, tipo, duración)
- **Respuestas**: Siempre `{ success: true/false, ... }`, códigos HTTP estándar
- **Rutas**: Definidas en controladores, prefijo `/api/`
- **Seguridad**: Nunca exponer credenciales (.env) a través de la API
- **Archivos temporales**: Siempre limpiar en `temp/` después de usar

## Estructura de Archivos

- `server.js` — Punto de entrada, configura Express y middleware
- `src/controllers/` — Un controlador por módulo (backup, config, logs, s3)
- `src/services/` — Lógica de negocio, un servicio por dominio
- `src/middleware/` — Auth y seguridad
- `config/config.json` — Solo carpetas de backup (editable via API)
- `.env` — Todo lo sensible: S3, BD, token, puerto

## Al Modificar Código

1. Mantener el patrón controlador → servicio → recurso externo
2. Agregar logging con metadata relevante en operaciones importantes
3. Validar entrada con Joi antes de procesar
4. No duplicar lógica entre controladores (delegar a servicios)
5. Los endpoints nuevos requieren autenticación (a menos que sea health/status público)
6. Usar los códigos de error establecidos: 400 (validación), 401 (auth), 409 (conflicto), 500 (interno)

## Al Crear Documentación

- La documentación vive en `docs/` (5 archivos, sin duplicación)
- El contexto del agente está en `.trae/documents/AGENT_CONTEXT.md` (fuente única)
- No duplicar información entre documentos; usar cross-references
- La documentación del proyecto está en español

## Scripts

```bash
npm start       # node server.js
npm run dev     # node --watch server.js
npm test        # node test-api-services.js
npm run test:s3 # node test-s3-service.js
```
