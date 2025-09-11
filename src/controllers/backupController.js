import express from 'express';
import Joi from 'joi';
import { logger, backupLogger } from '../services/logger.js';
import { backupService } from '../services/backupService.js';
import { s3Service } from '../services/s3Service.js';

const router = express.Router();

// Esquema de validación para backup manual
const backupSchema = Joi.object({
  type: Joi.string().valid('full', 'folders', 'database').required()
});

// POST /api/backup/now - Ejecutar backup manual
router.post('/now', async (req, res) => {
  try {
    // Validar datos de entrada
    const { error, value } = backupSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de backup inválido',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { type } = value;
    const userInfo = 'API usuario';

    // Verificar si ya hay un backup en ejecución
    if (backupService.isBackupRunning()) {
      return res.status(409).json({
        success: false,
        message: 'Ya hay un backup en ejecución',
        currentJob: backupService.getCurrentJobStatus()
      });
    }

    backupLogger.info(`Backup manual iniciado por: ${userInfo}`, {
      type,
      ip: req.ip
    });

    // Ejecutar backup manual directamente
    try {
      let result;
      
      if (type === 'database') {
        result = await backupService.runDatabaseBackup();
      } else if (type === 'folders') {
        result = await backupService.runFoldersBackup();
      } else if (type === 'full') {
        const dbResult = await backupService.backupDatabase();
        const foldersResult = await backupService.backupFolders();
        result = {
          success: dbResult.success && foldersResult.success,
          database: dbResult,
          folders: foldersResult
        };
      }
      
      if (result.success) {
        backupLogger.info(`Backup manual ${type} completado exitosamente por: ${userInfo}`, {
          type: type
        });
        
        // Responder con el resultado del backup completado
        res.json({
          success: true,
          message: `Backup ${type} completado exitosamente`,
          result: result
        });
      } else {
        backupLogger.error(`Backup manual ${type} falló para: ${userInfo}`, {
          errors: result.errors || 'Error desconocido'
        });
        
        // Responder con el error del backup
        res.status(500).json({
          success: false,
          message: `Backup ${type} falló`,
          errors: result.errors || 'Error desconocido'
        });
      }
    } catch (backupError) {
      backupLogger.error(`Error en backup manual ${type} para: ${userInfo}:`, backupError);
      
      // Responder con error de ejecución
      res.status(500).json({
        success: false,
        message: `Error al ejecutar backup ${type}`,
        error: backupError.message
      });
    }

  } catch (error) {
    logger.error('Error al iniciar backup manual:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/backup/status - Obtener estado del backup actual
router.get('/status', (req, res) => {
  try {
    const currentJob = backupService.getCurrentJobStatus();
    const isRunning = backupService.isBackupRunning();
    const schedulerStatus = {
      enabled: true,
      nextRun: null,
      lastRun: null
    };

    res.json({
      success: true,
      isRunning,
      currentJob,
      scheduler: schedulerStatus
    });

  } catch (error) {
    logger.error('Error al obtener estado de backup:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/backup/stats - Obtener estadísticas de backups
router.get('/stats', async (req, res) => {
  try {
    const stats = {
      totalBackups: 0,
      successfulBackups: 0,
      failedBackups: 0,
      lastBackup: null,
      averageSize: 0
    };

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    logger.error('Error al obtener estadísticas de backup:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// GET /api/backup/history - Obtener historial de backups desde S3
router.get('/history', async (req, res) => {
  try {
    // Parámetros de consulta
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const prefix = req.query.prefix || 'backups/';

    // Validar parámetros
    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: 'Parámetros de paginación inválidos'
      });
    }

    let s3Objects;
    let s3Available = true;
    let s3Error = null;

    try {
      // Intentar obtener lista de objetos S3
      s3Objects = await s3Service.listObjects(prefix, limit * page);
    } catch (s3Err) {
      // Manejar errores de S3 graciosamente
      logger.warn('Error de S3 al obtener historial:', s3Err.message);
      s3Available = false;
      s3Error = s3Err.message;
      
      // Devolver respuesta con información de error pero sin fallar
      return res.json({
        success: true,
        history: [],
        s3Available: false,
        s3Error: s3Error,
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false
        },
        message: 'Servicio S3 no disponible temporalmente'
      });
    }
    
    // Procesar y paginar resultados
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedObjects = s3Objects.objects.slice(startIndex, endIndex);

    // Formatear resultados
    const backupHistory = paginatedObjects.map(obj => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified,
      etag: obj.ETag,
      type: getBackupTypeFromKey(obj.Key),
      url: `${s3Service.config?.endpoint}/${s3Service.config?.bucket}/${obj.Key}`
    }));

    res.json({
      success: true,
      history: backupHistory,
      s3Available: true,
      pagination: {
        page,
        limit,
        total: s3Objects.count,
        totalPages: Math.ceil(s3Objects.count / limit),
        hasNext: endIndex < s3Objects.count,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    logger.error('Error al obtener historial de backups:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// DELETE /api/backup/:key - Eliminar backup específico
router.delete('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const userInfo = 'API usuario';

    // Validar que la clave pertenece a backups
    if (!key.startsWith('backups/')) {
      return res.status(400).json({
        success: false,
        message: 'Clave de backup inválida'
      });
    }

    // Eliminar objeto de S3
    await s3Service.deleteObject(key);

    logger.info(`Backup eliminado por: ${userInfo}`, {
      key,
      ip: req.ip
    });

    res.json({
      success: true,
      message: 'Backup eliminado exitosamente'
    });

  } catch (error) {
    logger.error('Error al eliminar backup:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// POST /api/backup/cleanup - Limpiar backups antiguos
router.post('/cleanup', async (req, res) => {
  try {
    const daysToKeep = parseInt(req.body.daysToKeep) || 30;
    const userInfo = 'API usuario';

    // Validar parámetro
    if (daysToKeep < 1 || daysToKeep > 365) {
      return res.status(400).json({
        success: false,
        message: 'Días a mantener debe estar entre 1 y 365'
      });
    }

    // Ejecutar limpieza
    const cleanupResult = await s3Service.cleanOldBackups(daysToKeep);

    logger.info(`Limpieza de backups ejecutada por: ${userInfo}`, {
      daysToKeep,
      deleted: cleanupResult.deleted,
      errors: cleanupResult.errors,
      ip: req.ip
    });

    res.json({
      success: true,
      message: 'Limpieza de backups completada',
      result: cleanupResult
    });

  } catch (error) {
    logger.error('Error en limpieza de backups:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Rutas del scheduler eliminadas - funcionalidad no disponible en API simplificada

// Función auxiliar para determinar el tipo de backup desde la clave S3
function getBackupTypeFromKey(key) {
  if (key.includes('/folders/')) return 'folders';
  if (key.includes('/database/')) return 'database';
  if (key.includes('/full/')) return 'full';
  return 'unknown';
}

export { router as backupController };
export default router;