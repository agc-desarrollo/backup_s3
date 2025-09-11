import express from 'express';
import Joi from 'joi';
import { logger } from '../services/logger.js';
import { configService } from '../services/configService.js';
import { databaseService } from '../services/databaseService.js';

const router = express.Router();

// Esquema de validación para configuración completa
const configSchema = Joi.object({
  backupFolders: Joi.array().items(Joi.string().min(1)).default([]),
  cronSchedule: Joi.string().required(),
  updatedAt: Joi.string().isoDate().optional()
});

// GET /api/config - Obtener configuración actual
router.get('/', async (req, res) => {
  try {
    const config = configService.getConfig();
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Configuración no encontrada'
      });
    }

    // Configuración segura sin información sensible
    const safeConfig = {
      backupFolders: config.backupFolders,
      cronSchedule: config.cronSchedule,
      updatedAt: config.updatedAt
    };

    // Obtener estadísticas de configuración
    const configStats = configService.getConfigStats();
    
    res.json({
      success: true,
      config: safeConfig,
      stats: configStats
    });

  } catch (error) {
    logger.error('Error al obtener configuración:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// POST /api/config - Actualizar configuración
router.post('/', async (req, res) => {
  try {
    // Validar datos de entrada
    const { error, value } = configSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Datos de configuración inválidos',
        errors: error.details.map(detail => detail.message)
      });
    }

    const newConfig = value;
    const userInfo = 'API usuario';

    // Validar carpetas de backup
    const folderValidation = await validateBackupFolders(newConfig.backupFolders);
    if (!folderValidation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Carpetas de backup inválidas',
        errors: folderValidation.errors
      });
    }

    // Actualizar configuración
    const updatedConfig = await configService.updateConfig(newConfig);

    // Reinicializar servicios con nueva configuración
    try {
      await databaseService.init();
    } catch (serviceError) {
      logger.warn('Error al reinicializar servicios:', serviceError.message);
    }

    logger.info(`Configuración actualizada por: ${userInfo}`, {
      ip: req.ip,
      changes: {
        foldersCount: newConfig.backupFolders.length,
        cronSchedule: newConfig.cronSchedule
      }
    });

    res.json({
      success: true,
      message: 'Configuración actualizada exitosamente',
      config: updatedConfig
    });

  } catch (error) {
    logger.error('Error al actualizar configuración:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      details: error.message
    });
  }
});



// GET /api/config/backup-tools - Verificar herramientas de backup disponibles
router.get('/backup-tools', async (req, res) => {
  try {
    const tools = await databaseService.checkBackupTools();
    
    res.json({
      success: true,
      tools
    });

  } catch (error) {
    logger.error('Error al verificar herramientas de backup:', error);
    res.status(500).json({
      success: false,
      message: 'Error al verificar herramientas de backup'
    });
  }
});

// GET /api/config/system-info - Información del sistema
router.get('/system-info', async (req, res) => {
  try {
    const systemInfo = {
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024)
      },
      uptime: Math.round(process.uptime()),
      environment: process.env.NODE_ENV || 'development'
    };

    res.json({
      success: true,
      systemInfo
    });

  } catch (error) {
    logger.error('Error al obtener información del sistema:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Función auxiliar para validar carpetas de backup
async function validateBackupFolders(folders) {
  const errors = [];
  
  for (const folder of folders) {
    try {
      const fs = await import('fs/promises');
      await fs.access(folder);
      
      // Verificar que es un directorio
      const stats = await fs.stat(folder);
      if (!stats.isDirectory()) {
        errors.push(`${folder} no es un directorio`);
      }
    } catch (error) {
      errors.push(`Carpeta no accesible: ${folder}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}



export { router as configController };
export default router;