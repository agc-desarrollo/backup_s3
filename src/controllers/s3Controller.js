import express from 'express';
import Joi from 'joi';
import { logger } from '../services/logger.js';
import { s3Service } from '../services/s3Service.js';

const router = express.Router();

// Esquemas de validación
const listObjectsSchema = Joi.object({
  prefix: Joi.string().allow('').default(''),
  maxKeys: Joi.number().integer().min(1).max(1000).default(100),
  continuationToken: Joi.string().allow('').optional()
}).unknown(true);

const objectDetailsSchema = Joi.object({
  key: Joi.string().required()
}).unknown(true);

// GET /api/s3/objects/:key/download - Descargar objeto desde S3
router.get('/objects/:key/download', async (req, res) => {
  try {
    const { key } = req.params;

    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'Clave del objeto requerida'
      });
    }

    // Decodificar la clave del objeto
    const decodedKey = decodeURIComponent(key);

    // Descargar el objeto desde S3
    const s3Object = await s3Service.downloadObject(decodedKey);

    if (!s3Object || !s3Object.Body) {
      return res.status(404).json({
        success: false,
        message: 'Objeto no encontrado'
      });
    }

    // Configurar headers para la descarga
    res.setHeader('Content-Type', s3Object.ContentType || 'application/octet-stream');
    res.setHeader('Content-Length', s3Object.ContentLength);
    res.setHeader('Content-Disposition', `attachment; filename="${getFileName(decodedKey)}"`);
    // Enviar el stream del objeto
    s3Object.Body.pipe(res);

  } catch (error) {
    logger.error('Error al descargar objeto S3:', error);

    if (error.name === 'NoSuchKey' || error.message.includes('NoSuchKey')) {
      return res.status(404).json({
        success: false,
        message: 'Objeto no encontrado'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error al descargar objeto',
      error: error.message
    });
  }
});

// DELETE /api/s3/objects/:key - Eliminar objeto de S3
router.delete('/objects/:key', async (req, res) => {
  try {
    const { key } = req.params;

    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'Clave del objeto requerida'
      });
    }

    // Decodificar la clave del objeto
    const decodedKey = decodeURIComponent(key);

    logger.info('Eliminando objeto S3', {
      key: decodedKey,
      ip: req.ip
    });

    // Eliminar el objeto de S3
    await s3Service.deleteObject(decodedKey);

    res.json({
      success: true,
      message: 'Objeto eliminado correctamente',
      key: decodedKey
    });

  } catch (error) {
    logger.error('Error al eliminar objeto S3:', error);

    res.status(500).json({
      success: false,
      message: 'Error al eliminar objeto',
      error: error.message
    });
  }
});

// GET /api/s3/objects - Listar objetos en S3
router.get('/objects', async (req, res) => {
  try {
    // Validar parámetros de consulta
    const { error, value } = listObjectsSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Parámetros de consulta inválidos',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { prefix, maxKeys, continuationToken } = value;

    logger.info('Listando objetos S3', {
      prefix,
      maxKeys,
      ip: req.ip
    });

    // Obtener lista de objetos desde S3
    const result = await s3Service.listObjects(prefix, maxKeys, continuationToken);

    // Formatear respuesta con información adicional
    const formattedObjects = result.objects.map(obj => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified,
      etag: obj.ETag,
      storageClass: obj.StorageClass,
      // Extraer información adicional de la clave
      type: getObjectType(obj.Key),
      folder: getObjectFolder(obj.Key),
      fileName: getFileName(obj.Key),
      sizeFormatted: formatBytes(obj.Size)
    }));

    res.json({
      success: true,
      objects: formattedObjects,
      count: result.count,
      isTruncated: result.isTruncated,
      nextToken: result.nextToken,
      prefix,
      totalSize: formattedObjects.reduce((sum, obj) => sum + obj.size, 0),
      totalSizeFormatted: formatBytes(formattedObjects.reduce((sum, obj) => sum + obj.size, 0))
    });

  } catch (error) {
    logger.error('Error al listar objetos S3:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener lista de objetos S3',
      error: error.message
    });
  }
});

// GET /api/s3/objects/:key/details - Obtener detalles de un objeto específico
router.get('/objects/:key/details', async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);

    // Validar parámetros
    const { error } = objectDetailsSchema.validate({ key });
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Clave de objeto inválida',
        errors: error.details.map(detail => detail.message)
      });
    }

    logger.info('Obteniendo detalles de objeto S3', {
      key,
      ip: req.ip
    });

    // Obtener detalles del objeto
    const objectDetails = await s3Service.getObjectDetails(key);

    if (!objectDetails) {
      return res.status(404).json({
        success: false,
        message: 'Objeto no encontrado'
      });
    }

    // Formatear respuesta con información detallada
    const formattedDetails = {
      key: objectDetails.Key,
      size: objectDetails.ContentLength,
      sizeFormatted: formatBytes(objectDetails.ContentLength),
      lastModified: objectDetails.LastModified,
      etag: objectDetails.ETag,
      contentType: objectDetails.ContentType,
      metadata: objectDetails.Metadata || {},
      storageClass: objectDetails.StorageClass,
      // Información adicional
      type: getObjectType(objectDetails.Key),
      folder: getObjectFolder(objectDetails.Key),
      fileName: getFileName(objectDetails.Key),
      downloadUrl: `${s3Service.config?.endpoint}/${s3Service.config?.bucket}/${objectDetails.Key}`
    };

    res.json({
      success: true,
      object: formattedDetails
    });

  } catch (error) {
    logger.error('Error al obtener detalles del objeto S3:', error);

    if (error.name === 'NoSuchKey' || error.message.includes('NoSuchKey')) {
      return res.status(404).json({
        success: false,
        message: 'Objeto no encontrado'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error al obtener detalles del objeto',
      error: error.message
    });
  }
});

// GET /api/s3/folders - Obtener estructura de carpetas
router.get('/folders', async (req, res) => {
  try {
    const prefix = req.query.prefix || '';
    const delimiter = req.query.delimiter || '/';

    logger.info('Obteniendo estructura de carpetas S3', {
      prefix,
      ip: req.ip
    });

    // Obtener objetos con delimitador para simular estructura de carpetas
    const result = await s3Service.listObjectsWithDelimiter(prefix, delimiter);

    // Separar carpetas y archivos
    const folders = (result.commonPrefixes || []).map(prefixObj => ({
      name: prefixObj.Prefix.replace(prefix, '').replace(delimiter, ''),
      fullPath: prefixObj.Prefix,
      type: 'folder'
    }));

    const files = (result.objects || []).map(obj => ({
      key: obj.Key,
      name: getFileName(obj.Key),
      size: obj.Size,
      sizeFormatted: formatBytes(obj.Size),
      lastModified: obj.LastModified,
      type: 'file',
      fileType: getObjectType(obj.Key)
    }));

    res.json({
      success: true,
      currentPath: prefix,
      folders,
      files,
      totalFolders: folders.length,
      totalFiles: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
      totalSizeFormatted: formatBytes(files.reduce((sum, file) => sum + file.size, 0))
    });

  } catch (error) {
    logger.error('Error al obtener estructura de carpetas S3:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estructura de carpetas',
      error: error.message
    });
  }
});

// GET /api/s3/stats - Obtener estadísticas generales de S3
router.get('/stats', async (req, res) => {
  try {
    logger.info('Obteniendo estadísticas de S3', {
      ip: req.ip
    });

    // Obtener estadísticas del servicio S3
    const stats = await s3Service.getStorageStats();

    res.json({
      success: true,
      stats: {
        totalObjects: stats.totalFiles,
        totalSize: stats.totalSize,
        totalSizeFormatted: formatBytes(stats.totalSize),
        averageFileSize: stats.averageFileSize,
        averageFileSizeFormatted: formatBytes(stats.averageFileSize),
        newestFile: stats.newestFile,
        oldestFile: stats.oldestFile,
        fileTypes: stats.fileTypes,
        bucketName: s3Service.config?.bucket,
        endpoint: s3Service.config?.endpoint
      }
    });

  } catch (error) {
    logger.error('Error al obtener estadísticas de S3:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas de S3',
      error: error.message
    });
  }
});

// GET /api/s3/search - Buscar objetos por nombre o patrón
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const prefix = req.query.prefix || '';
    const maxResults = parseInt(req.query.limit) || 50;

    if (!query.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Parámetro de búsqueda requerido'
      });
    }

    logger.info('Buscando objetos en S3', {
      query,
      prefix,
      maxResults,
      ip: req.ip
    });

    // Obtener todos los objetos con el prefijo y filtrar por consulta
    const result = await s3Service.listObjects(prefix, 1000);

    // Filtrar objetos que coincidan con la consulta
    const filteredObjects = result.objects
      .filter(obj => obj.Key.toLowerCase().includes(query.toLowerCase()))
      .slice(0, maxResults)
      .map(obj => ({
        key: obj.Key,
        size: obj.Size,
        sizeFormatted: formatBytes(obj.Size),
        lastModified: obj.LastModified,
        etag: obj.ETag,
        type: getObjectType(obj.Key),
        folder: getObjectFolder(obj.Key),
        fileName: getFileName(obj.Key)
      }));

    res.json({
      success: true,
      query,
      results: filteredObjects,
      totalFound: filteredObjects.length,
      totalSize: filteredObjects.reduce((sum, obj) => sum + obj.size, 0),
      totalSizeFormatted: formatBytes(filteredObjects.reduce((sum, obj) => sum + obj.size, 0))
    });

  } catch (error) {
    logger.error('Error al buscar objetos en S3:', error);
    res.status(500).json({
      success: false,
      message: 'Error al buscar objetos',
      error: error.message
    });
  }
});

// Funciones auxiliares

/**
 * Determinar el tipo de objeto basado en su clave
 */
function getObjectType(key) {
  const extension = key.split('.').pop()?.toLowerCase();

  const typeMap = {
    'zip': 'archive',
    'tar': 'archive',
    'gz': 'archive',
    'sql': 'database',
    'json': 'data',
    'log': 'log',
    'txt': 'text',
    'csv': 'data',
    'xml': 'data'
  };

  return typeMap[extension] || 'unknown';
}

/**
 * Obtener la carpeta padre de un objeto
 */
function getObjectFolder(key) {
  const parts = key.split('/');
  if (parts.length > 1) {
    return parts.slice(0, -1).join('/');
  }
  return '';
}

/**
 * Obtener el nombre del archivo de una clave
 */
function getFileName(key) {
  return key.split('/').pop() || key;
}

/**
 * Formatear bytes a formato legible
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export { router as s3Controller };
export default router;