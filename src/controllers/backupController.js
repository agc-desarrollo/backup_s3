import express from 'express';
import Joi from 'joi';
import { logger, backupLogger } from '../services/logger.js';
import { backupService } from '../services/backupService.js';
import { s3Service } from '../services/s3Service.js';
import { rotationService } from '../services/rotationService.js';

const router = express.Router();



// POST /api/backup/database - Ejecutar backup de base de datos
router.post('/database', async (req, res) => {
  try {
    const userInfo = 'API usuario';

    // Verificar si ya hay un backup en ejecución
    if (backupService.isBackupRunning()) {
      return res.status(409).json({
        success: false,
        message: 'Ya hay un backup en ejecución',
        currentJob: backupService.getCurrentJobStatus()
      });
    }

    backupLogger.info(`Backup de base de datos iniciado por: ${userInfo}`, {
      type: 'database',
      ip: req.ip
    });

    // Ejecutar backup de base de datos directamente
    try {
      const result = await backupService.runDatabaseBackup();
      
      if (result.success) {
        backupLogger.info(`Backup de base de datos completado exitosamente por: ${userInfo}`);

        // Aplicar rotación si hay una política configurada para 'database' en rotation.json.
        // No bloquea la respuesta del backup: si la rotación falla, el backup sigue siendo válido.
        let rotation = null;
        try {
          const policy = rotationService.getPolicy('database');
          if (policy) {
            backupLogger.info('Aplicando rotación tras backup de base de datos...', policy);
            rotation = await rotationService.applyRotation('database', policy);
            backupLogger.info('Rotación completada:', rotation);
          } else {
            backupLogger.info('Sin política de rotación configurada para "database"; se omite.');
          }
        } catch (rotationError) {
          backupLogger.error('Error al aplicar rotación tras backup de base de datos:', rotationError);
          rotation = { error: rotationError.message };
        }

        // Responder con el resultado del backup completado
        res.json({
          success: true,
          message: 'Backup de base de datos completado exitosamente',
          jobId: result.jobId,
          result: result,
          rotation
        });
      } else {
        backupLogger.error(`Backup de base de datos falló para: ${userInfo}`, {
          errors: result.errors || 'Error desconocido'
        });
        
        // Responder con el error del backup
        res.status(500).json({
          success: false,
          message: 'Backup de base de datos falló',
          errors: result.errors || 'Error desconocido'
        });
      }
    } catch (backupError) {
      backupLogger.error(`Error en backup de base de datos para: ${userInfo}:`, backupError);
      
      // Responder con error de ejecución
      res.status(500).json({
        success: false,
        message: 'Error al ejecutar backup de base de datos',
        error: backupError.message
      });
    }

  } catch (error) {
    logger.error('Error al iniciar backup de base de datos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// POST /api/backup/folders - Ejecutar backup de carpetas (sin parámetros)
router.post('/folders', async (req, res) => {
  try {
    const userInfo = 'API usuario';

    // Verificar si ya hay un backup en ejecución
    if (backupService.isBackupRunning()) {
      return res.status(409).json({
        success: false,
        message: 'Ya hay un backup en ejecución',
        currentJob: backupService.getCurrentJobStatus()
      });
    }

    backupLogger.info(`Backup de carpetas iniciado por: ${userInfo}`, {
      ip: req.ip
    });

    // Ejecutar backup de carpetas usando configuración del config.json
    try {
      const result = await backupService.runFoldersBackup();

      backupLogger.info(`Backup de carpetas completado para: ${userInfo}`, {
        result
      });

      // Aplicar rotación si hay una política configurada para 'folder' en rotation.json.
      // No bloquea la respuesta: si la rotación falla, el backup sigue siendo válido.
      let rotation = null;
      try {
        const policy = rotationService.getPolicy('folder');
        if (policy) {
          backupLogger.info('Aplicando rotación tras backup de carpetas...', policy);
          rotation = await rotationService.applyRotation('folder', policy);
          backupLogger.info('Rotación completada:', rotation);
        } else {
          backupLogger.info('Sin política de rotación configurada para "folder"; se omite.');
        }
      } catch (rotationError) {
        backupLogger.error('Error al aplicar rotación tras backup de carpetas:', rotationError);
        rotation = { error: rotationError.message };
      }

      // Responder con éxito
      res.json({
        success: true,
        message: 'Backup de carpetas completado exitosamente',
        data: result,
        rotation
      });
      
    } catch (backupError) {
      backupLogger.error(`Error en backup de carpetas para: ${userInfo}:`, backupError);
      
      // Responder con error de ejecución
      res.status(500).json({
        success: false,
        message: 'Error al ejecutar backup de carpetas',
        error: backupError.message
      });
    }

  } catch (error) {
    logger.error('Error al iniciar backup de carpetas:', error);
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

    res.json({
      success: true,
      isRunning,
      currentJob
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
  if (key.includes('carpetas ')) return 'folders';
  if (key.includes('database ')) return 'database';
  if (key.includes('completo ')) return 'full';
  return 'unknown';
}

export { router as backupController };
export default router;