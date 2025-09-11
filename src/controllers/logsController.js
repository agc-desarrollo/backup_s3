import express from 'express';
import Joi from 'joi';
import { logger, getLogs, getLogStats } from '../services/logger.js';

const router = express.Router();

// Esquema de validación para consulta de logs
const logsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(1000).default(50),
  level: Joi.string().valid('error', 'warn', 'info', 'debug').optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  source: Joi.string().valid('general', 'backup').default('general')
});

// GET /api/logs - Obtener logs con paginación y filtros
router.get('/', async (req, res) => {
  try {
    // Validar parámetros de consulta
    const { error, value } = logsQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Parámetros de consulta inválidos',
        errors: error.details.map(detail => detail.message)
      });
    }

    const {
      page,
      limit,
      level,
      startDate,
      endDate,
      source
    } = value;

    // Obtener logs
    const logsResult = await getLogs({
      page,
      limit,
      level,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      source
    });

    res.json({
      success: true,
      logs: logsResult.logs,
      pagination: {
        page: logsResult.page,
        limit: logsResult.limit,
        total: logsResult.total,
        totalPages: logsResult.totalPages,
        hasNext: page < logsResult.totalPages,
        hasPrev: page > 1
      },
      filters: {
        level,
        startDate,
        endDate,
        source
      }
    });

  } catch (error) {
    logger.error('Error al obtener logs:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/logs/stats - Obtener estadísticas de logs
router.get('/stats', async (req, res) => {
  try {
    const stats = await getLogStats();
    
    if (!stats) {
      return res.status(404).json({
        success: false,
        message: 'No se pudieron obtener estadísticas de logs'
      });
    }

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    logger.error('Error al obtener estadísticas de logs:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/logs/recent - Obtener logs recientes (últimas 24 horas)
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const level = req.query.level;
    
    // Validar límite
    if (limit < 1 || limit > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Límite debe estar entre 1 y 1000'
      });
    }

    // Obtener logs de las últimas 24 horas
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

    const logsResult = await getLogs({
      page: 1,
      limit,
      level,
      startDate,
      endDate,
      source: 'general'
    });

    res.json({
      success: true,
      logs: logsResult.logs,
      count: logsResult.logs.length,
      timeRange: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }
    });

  } catch (error) {
    logger.error('Error al obtener logs recientes:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/logs/backup - Obtener logs específicos de backup
router.get('/backup', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const level = req.query.level;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    // Validar parámetros
    if (page < 1 || limit < 1 || limit > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Parámetros de paginación inválidos'
      });
    }

    // Obtener logs de backup
    const logsResult = await getLogs({
      page,
      limit,
      level,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      source: 'backup'
    });

    res.json({
      success: true,
      logs: logsResult.logs,
      pagination: {
        page: logsResult.page,
        limit: logsResult.limit,
        total: logsResult.total,
        totalPages: logsResult.totalPages,
        hasNext: page < logsResult.totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    logger.error('Error al obtener logs de backup:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/logs/errors - Obtener solo logs de error
router.get('/errors', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const days = parseInt(req.query.days) || 7;

    // Validar parámetros
    if (page < 1 || limit < 1 || limit > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Parámetros de paginación inválidos'
      });
    }

    if (days < 1 || days > 365) {
      return res.status(400).json({
        success: false,
        message: 'Días debe estar entre 1 y 365'
      });
    }

    // Calcular rango de fechas
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    // Obtener logs de error
    const logsResult = await getLogs({
      page,
      limit,
      level: 'error',
      startDate,
      endDate,
      source: 'general'
    });

    res.json({
      success: true,
      logs: logsResult.logs,
      pagination: {
        page: logsResult.page,
        limit: logsResult.limit,
        total: logsResult.total,
        totalPages: logsResult.totalPages,
        hasNext: page < logsResult.totalPages,
        hasPrev: page > 1
      },
      timeRange: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        days
      }
    });

  } catch (error) {
    logger.error('Error al obtener logs de error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/logs/search - Buscar en logs
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const level = req.query.level;
    const source = req.query.source || 'general';

    // Validar parámetros
    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Consulta de búsqueda debe tener al menos 2 caracteres'
      });
    }

    if (page < 1 || limit < 1 || limit > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Parámetros de paginación inválidos'
      });
    }

    // Obtener logs
    const logsResult = await getLogs({
      page,
      limit,
      level,
      source
    });

    // Filtrar logs que contengan la consulta de búsqueda
    const searchTerm = query.toLowerCase();
    const filteredLogs = logsResult.logs.filter(log => 
      log.message.toLowerCase().includes(searchTerm) ||
      (log.meta && JSON.stringify(log.meta).toLowerCase().includes(searchTerm))
    );

    res.json({
      success: true,
      logs: filteredLogs,
      searchQuery: query,
      totalResults: filteredLogs.length,
      pagination: {
        page,
        limit,
        total: filteredLogs.length,
        totalPages: Math.ceil(filteredLogs.length / limit)
      }
    });

  } catch (error) {
    logger.error('Error al buscar en logs:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/logs/export - Exportar logs
router.get('/export', async (req, res) => {
  try {
    const format = req.query.format || 'json';
    const level = req.query.level;
    const days = parseInt(req.query.days) || 7;
    const source = req.query.source || 'general';

    // Validar formato
    if (!['json', 'csv', 'txt'].includes(format)) {
      return res.status(400).json({
        success: false,
        message: 'Formato debe ser json, csv o txt'
      });
    }

    // Calcular rango de fechas
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    // Obtener logs
    const logsResult = await getLogs({
      page: 1,
      limit: 10000, // Límite alto para exportación
      level,
      startDate,
      endDate,
      source
    });

    // Configurar headers de respuesta
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `logs-${source}-${timestamp}.${format}`;
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Formatear y enviar datos según el formato
    switch (format) {
      case 'json':
        res.setHeader('Content-Type', 'application/json');
        res.json({
          exportDate: new Date().toISOString(),
          timeRange: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
          filters: { level, source },
          totalLogs: logsResult.logs.length,
          logs: logsResult.logs
        });
        break;

      case 'csv':
        res.setHeader('Content-Type', 'text/csv');
        let csvContent = 'Timestamp,Level,Message,Meta\n';
        logsResult.logs.forEach(log => {
          const meta = log.meta ? JSON.stringify(log.meta).replace(/"/g, '""') : '';
          csvContent += `"${log.timestamp}","${log.level}","${log.message.replace(/"/g, '""')}","${meta}"\n`;
        });
        res.send(csvContent);
        break;

      case 'txt':
        res.setHeader('Content-Type', 'text/plain');
        let txtContent = `Logs Export - ${new Date().toISOString()}\n`;
        txtContent += `Time Range: ${startDate.toISOString()} to ${endDate.toISOString()}\n`;
        txtContent += `Filters: Level=${level || 'all'}, Source=${source}\n`;
        txtContent += `Total Logs: ${logsResult.logs.length}\n\n`;
        txtContent += '='.repeat(80) + '\n\n';
        
        logsResult.logs.forEach(log => {
          txtContent += `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}\n`;
          if (log.meta) {
            txtContent += `Meta: ${JSON.stringify(log.meta, null, 2)}\n`;
          }
          txtContent += '-'.repeat(40) + '\n';
        });
        res.send(txtContent);
        break;
    }

    logger.info(`Logs exportados por usuario: ${req.session.user?.username}`, {
      format,
      level,
      days,
      source,
      totalLogs: logsResult.logs.length,
      ip: req.ip
    });

  } catch (error) {
    logger.error('Error al exportar logs:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

export { router as logsController };
export default router;