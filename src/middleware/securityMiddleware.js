import path from 'path';
import { logger } from '../services/logger.js';

// Middleware para sanitizar rutas de archivos y prevenir directory traversal
export function sanitizePaths(req, res, next) {
  try {
    // Lista de campos que pueden contener rutas de archivos
    const pathFields = ['folderPath', 'backupFolders', 'path', 'filePath'];
    
    // Función para sanitizar una ruta
    function sanitizePath(inputPath) {
      if (!inputPath || typeof inputPath !== 'string') {
        return inputPath;
      }
      
      // Normalizar la ruta
      let sanitized = path.normalize(inputPath);
      
      // Detectar intentos de directory traversal
      const dangerousPatterns = [
        /\.\./g,           // ../ o ..\
        /~\//g,            // ~/
        /\$\{.*\}/g,       // ${...} (template injection)
        /%2e%2e/gi,        // URL encoded ..
        /%2f/gi,           // URL encoded /
        /%5c/gi,           // URL encoded \
        /\x00/g,           // Null bytes
        /[<>"|?*]/g        // Caracteres no válidos en nombres de archivo (excluir : para rutas Windows)
      ];
      
      // Verificar patrones peligrosos
      for (const pattern of dangerousPatterns) {
        if (pattern.test(inputPath)) {
          throw new Error(`Ruta de archivo no válida: contiene caracteres peligrosos`);
        }
      }
      
      // Verificar que no sea una ruta absoluta hacia directorios del sistema
      const systemPaths = [
        '/etc',
        '/var',
        '/usr',
        '/bin',
        '/sbin',
        '/boot',
        '/dev',
        '/proc',
        '/sys',
        'C:\\Program Files',
        'C:\\System32'
      ];
      
      // Rutas del sistema que están permitidas para backup
      const allowedSystemPaths = [
        'C:\\Windows\\Temp',
        'C:\\Users\\Public'
      ];
      
      // Verificar si es una ruta permitida del sistema
      const isAllowedSystemPath = allowedSystemPaths.some(allowedPath => 
        sanitized.toLowerCase().startsWith(allowedPath.toLowerCase())
      );
      
      if (!isAllowedSystemPath) {
        for (const sysPath of systemPaths) {
          if (sanitized.toLowerCase().startsWith(sysPath.toLowerCase())) {
            throw new Error(`Acceso denegado a directorio del sistema: ${sysPath}`);
          }
        }
      }
      
      return sanitized;
    }
    
    // Sanitizar campos en el body
    if (req.body) {
      for (const field of pathFields) {
        if (req.body[field]) {
          if (Array.isArray(req.body[field])) {
            req.body[field] = req.body[field].map(sanitizePath);
          } else {
            req.body[field] = sanitizePath(req.body[field]);
          }
        }
      }
      
      // Sanitizar rutas anidadas en objetos de configuración
      if (req.body.backupFolders && Array.isArray(req.body.backupFolders)) {
        req.body.backupFolders = req.body.backupFolders.map(sanitizePath);
      }
    }
    
    // Sanitizar parámetros de consulta
    if (req.query) {
      for (const field of pathFields) {
        if (req.query[field]) {
          req.query[field] = sanitizePath(req.query[field]);
        }
      }
    }
    
    // Sanitizar parámetros de ruta
    if (req.params) {
      for (const field of pathFields) {
        if (req.params[field]) {
          req.params[field] = sanitizePath(req.params[field]);
        }
      }
    }
    
    next();
    
  } catch (error) {
    logger.warn('Intento de directory traversal detectado', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl,
      body: req.body,
      error: error.message
    });
    
    return res.status(400).json({
      success: false,
      message: 'Ruta de archivo no válida',
      code: 'INVALID_PATH'
    });
  }
}

// Middleware para validar tamaño de payload
export function validatePayloadSize(maxSize = 10 * 1024 * 1024) { // 10MB por defecto
  return (req, res, next) => {
    const contentLength = parseInt(req.get('Content-Length') || '0');
    
    if (contentLength > maxSize) {
      logger.warn('Payload demasiado grande detectado', {
        ip: req.ip,
        contentLength,
        maxSize,
        url: req.originalUrl
      });
      
      return res.status(413).json({
        success: false,
        message: 'Payload demasiado grande',
        code: 'PAYLOAD_TOO_LARGE',
        maxSize
      });
    }
    
    next();
  };
}

// Middleware para validar tipos de contenido
export function validateContentType(allowedTypes = ['application/json', 'application/x-www-form-urlencoded']) {
  return (req, res, next) => {
    // Solo validar para métodos que envían datos
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const contentType = req.get('Content-Type');
      
      if (!contentType) {
        return res.status(400).json({
          success: false,
          message: 'Content-Type requerido',
          code: 'MISSING_CONTENT_TYPE'
        });
      }
      
      // Extraer el tipo base (sin charset, etc.)
      const baseType = contentType.split(';')[0].trim();
      
      if (!allowedTypes.includes(baseType)) {
        logger.warn('Tipo de contenido no permitido', {
          ip: req.ip,
          contentType: baseType,
          allowedTypes,
          url: req.originalUrl
        });
        
        return res.status(415).json({
          success: false,
          message: 'Tipo de contenido no soportado',
          code: 'UNSUPPORTED_MEDIA_TYPE',
          allowedTypes
        });
      }
    }
    
    next();
  };
}

// Middleware para sanitizar entrada de texto
export function sanitizeInput(req, res, next) {
  try {
    function sanitizeValue(value) {
      if (typeof value === 'string') {
        // Remover caracteres de control y scripts potencialmente peligrosos
        return value
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Caracteres de control
          .replace(/<script[^>]*>.*?<\/script>/gi, '') // Scripts
          .replace(/javascript:/gi, '') // URLs javascript
          .replace(/on\w+\s*=/gi, '') // Event handlers
          .trim();
      }
      
      if (Array.isArray(value)) {
        return value.map(sanitizeValue);
      }
      
      if (value && typeof value === 'object') {
        const sanitized = {};
        for (const [key, val] of Object.entries(value)) {
          sanitized[key] = sanitizeValue(val);
        }
        return sanitized;
      }
      
      return value;
    }
    
    // Sanitizar body
    if (req.body) {
      req.body = sanitizeValue(req.body);
    }
    
    // Sanitizar query parameters
    if (req.query) {
      req.query = sanitizeValue(req.query);
    }
    
    next();
    
  } catch (error) {
    logger.error('Error en sanitización de entrada:', error);
    return res.status(500).json({
      success: false,
      message: 'Error procesando datos de entrada',
      code: 'INPUT_PROCESSING_ERROR'
    });
  }
}

// Middleware para detectar y bloquear ataques de inyección SQL básicos
export function detectSQLInjection(req, res, next) {
  try {
    const sqlPatterns = [
      /('|(\-\-);|(\||\|))/i, // Removido patrones de asterisco que afectan cron
      /(\b(union|insert|delete|update|drop|create|alter|exec|execute)\b)/i, // Agregado word boundaries y removido select
      /(script|javascript|vbscript|onload|onerror|onclick)/i,
      /(<script|<iframe|<object)/i // Más específico para tags HTML peligrosos
    ];
    
    function checkForSQLInjection(value, path = '') {
      if (typeof value === 'string') {
        // Excluir campos específicos que pueden contener caracteres especiales legítimos
        const excludedPaths = [
          'body.cronSchedule', 'query.cronSchedule',
          'body.s3Config.endpoint', 'body.s3Config.accessKey', 'body.s3Config.secretKey',
          'body.dbConfig.password', 'body.dbConfig.username'
        ];
        
        if (!excludedPaths.includes(path)) {
          for (const pattern of sqlPatterns) {
            if (pattern.test(value)) {
              throw new Error(`Posible inyección SQL detectada en ${path}: ${value.substring(0, 50)}`);
            }
          }
        }
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          checkForSQLInjection(item, `${path}[${index}]`);
        });
      } else if (value && typeof value === 'object') {
        for (const [key, val] of Object.entries(value)) {
          checkForSQLInjection(val, path ? `${path}.${key}` : key);
        }
      }
    }
    
    // Verificar body
    if (req.body) {
      checkForSQLInjection(req.body, 'body');
    }
    
    // Verificar query parameters
    if (req.query) {
      checkForSQLInjection(req.query, 'query');
    }
    
    next();
    
  } catch (error) {
    logger.warn('Posible ataque de inyección SQL detectado', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl,
      error: error.message,
      body: req.body,
      query: req.query
    });
    
    return res.status(400).json({
      success: false,
      message: 'Entrada no válida detectada',
      code: 'INVALID_INPUT'
    });
  }
}





// Middleware para validar headers de seguridad
export function validateSecurityHeaders(req, res, next) {
  try {
    // Verificar User-Agent (bloquear bots maliciosos conocidos)
    const userAgent = req.get('User-Agent') || '';
    const maliciousBots = [
      /sqlmap/i,
      /nikto/i,
      /nessus/i,
      /openvas/i,
      /nmap/i,
      /masscan/i,
      /zap/i // OWASP ZAP
    ];
    
    for (const botPattern of maliciousBots) {
      if (botPattern.test(userAgent)) {
        logger.warn('Bot malicioso detectado', {
          ip: req.ip,
          userAgent,
          url: req.originalUrl
        });
        
        return res.status(403).json({
          success: false,
          message: 'Acceso denegado',
          code: 'FORBIDDEN'
        });
      }
    }
    
    // Verificar headers sospechosos
    const suspiciousHeaders = [
      'x-forwarded-for',
      'x-real-ip',
      'x-originating-ip'
    ];
    
    for (const header of suspiciousHeaders) {
      const value = req.get(header);
      if (value && value.includes('127.0.0.1')) {
        logger.warn('Header sospechoso detectado', {
          ip: req.ip,
          header,
          value,
          url: req.originalUrl
        });
      }
    }
    
    next();
    
  } catch (error) {
    logger.error('Error validando headers de seguridad:', error);
    next(); // Continuar en caso de error
  }
}

// Middleware para agregar headers de seguridad a las respuestas
export function addSecurityHeaders(req, res, next) {
  // Prevenir clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevenir MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Habilitar XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
}

export default {
  sanitizePaths,
  validatePayloadSize,
  validateContentType,
  sanitizeInput,
  detectSQLInjection,
  validateSecurityHeaders,
  addSecurityHeaders
};