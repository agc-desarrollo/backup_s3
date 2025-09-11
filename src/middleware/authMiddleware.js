import { logger } from '../services/logger.js';

// Middleware de autenticación simplificado con API token
export function authMiddleware(req, res, next) {
  try {
    // Obtener el token del header
    const token = req.headers['api-token'];
    const expectedToken = process.env.API_TOKEN;

    // Verificar que existe el token esperado en las variables de entorno
    if (!expectedToken) {
      logger.error('API_TOKEN no configurado en variables de entorno');
      return res.status(500).json({
        success: false,
        message: 'Error de configuración del servidor',
        code: 'SERVER_CONFIG_ERROR'
      });
    }

    // Verificar que se proporcionó el token
    if (!token) {
      logger.warn('Intento de acceso sin token', {
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(401).json({
        success: false,
        message: 'Token de autenticación requerido. Incluya el header "api-token".',
        code: 'TOKEN_REQUIRED'
      });
    }

    // Verificar que el token es válido
    if (token !== expectedToken) {
      logger.warn('Intento de acceso con token inválido', {
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        providedToken: token.substring(0, 8) + '...' // Solo mostrar los primeros 8 caracteres por seguridad
      });

      return res.status(401).json({
        success: false,
        message: 'Token de autenticación inválido.',
        code: 'INVALID_TOKEN'
      });
    }

    // Token válido - agregar información básica al request
    req.user = {
      authenticated: true,
      accessTime: new Date().toISOString()
    };

    // Continuar con el siguiente middleware
    next();

  } catch (error) {
    logger.error('Error en middleware de autenticación:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      code: 'INTERNAL_ERROR'
    });
  }
}

// Middleware para registrar actividad de la API
export function apiActivityLogger(req, res, next) {
  try {
    logger.info('Actividad de API', {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    next();
  } catch (error) {
    logger.error('Error en logger de actividad de API:', error);
    next(); // Continuar aunque falle el logging
  }
}

export default authMiddleware;