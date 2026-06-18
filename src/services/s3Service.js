import { S3Client, PutObjectCommand, HeadBucketCommand, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { logger } from './logger.js';

// Cargar variables de entorno
dotenv.config();

class S3Service {
  constructor() {
    this.client = null;
    this.config = null;
  }

  // Inicializar cliente S3
  async init() {
    try {
      // Leer configuración desde variables de entorno
      this.config = {
        endpoint: process.env.S3_ENDPOINT,
        bucket: process.env.S3_BUCKET,
        accessKey: process.env.S3_ACCESS_KEY_ID,
        secretKey: process.env.S3_SECRET_ACCESS_KEY,
        region: process.env.S3_REGION
      };

      // Validar que todas las variables requeridas estén presentes (sin fallback)
      const requiredVars = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_REGION'];
      const missingVars = requiredVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        throw new Error(`Variables de entorno S3 faltantes: ${missingVars.join(', ')}`);
      }
      
      // Configurar cliente S3
      this.client = new S3Client({
        endpoint: this.config.endpoint,
        region: this.config.region, // Para Cloudflare R2, usar 'auto'
        credentials: {
          accessKeyId: this.config.accessKey,
          secretAccessKey: this.config.secretKey
        },
        forcePathStyle: true, // Necesario para algunos proveedores S3-compatible
        signatureVersion: 'v4' // Asegurar compatibilidad con R2
      });

      // Verificar conexión
      await this.testConnection();
      
      logger.info('Servicio S3 inicializado correctamente desde variables de entorno');
    } catch (error) {
      logger.error('Error al inicializar servicio S3:', error);
      throw error;
    }
  }

  // Probar conexión con S3
  async testConnection() {
    try {
      if (!this.client) {
        throw new Error('Cliente S3 no inicializado');
      }

      const command = new HeadBucketCommand({ Bucket: this.config.bucket });
      await this.client.send(command);
      
      logger.info(`Conexión S3 exitosa con bucket: ${this.config.bucket}`);
      return true;
    } catch (error) {
      logger.error('Error al probar conexión S3:', error);
      throw new Error(`Error de conexión S3: ${error.message}`);
    }
  }

  // Subir archivo a S3
  async uploadFile(filePath, s3Key, metadata = {}) {
    try {
      if (!this.client) {
        await this.init();
      }

      // Verificar que el archivo existe
      if (!fs.existsSync(filePath)) {
        throw new Error(`Archivo no encontrado: ${filePath}`);
      }

      // Leer archivo
      const fileContent = fs.readFileSync(filePath);
      const fileStats = fs.statSync(filePath);

      // Preparar metadatos
      const uploadMetadata = {
        'upload-date': new Date().toISOString(),
        'file-size': fileStats.size.toString(),
        'original-path': filePath,
        ...metadata
      };

      // Comando de subida
      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: s3Key,
        Body: fileContent,
        Metadata: uploadMetadata,
        ContentType: this.getContentType(filePath)
      });

      // Ejecutar subida
      const startTime = Date.now();
      const result = await this.client.send(command);
      const uploadTime = Date.now() - startTime;

      logger.info(`Archivo subido a S3: ${s3Key}`, {
        bucket: this.config.bucket,
        size: fileStats.size,
        uploadTime: `${uploadTime}ms`,
        etag: result.ETag
      });

      return {
        success: true,
        s3Key,
        bucket: this.config.bucket,
        size: fileStats.size,
        uploadTime,
        etag: result.ETag,
        url: `${this.config.endpoint}/${this.config.bucket}/${s3Key}`
      };
    } catch (error) {
      logger.error(`Error al subir archivo ${filePath} a S3:`, error);
      throw error;
    }
  }

  // Subir múltiples archivos
  async uploadFiles(files) {
    const results = [];
    const errors = [];

    for (const file of files) {
      try {
        const result = await this.uploadFile(file.path, file.s3Key, file.metadata);
        results.push(result);
      } catch (error) {
        errors.push({
          file: file.path,
          error: error.message
        });
      }
    }

    return {
      successful: results,
      failed: errors,
      totalFiles: files.length,
      successCount: results.length,
      failureCount: errors.length
    };
  }

  // Listar objetos en S3
  async listObjects(prefix = '', maxKeys = 1000, continuationToken = null) {
    try {
      if (!this.client) {
        await this.init();
      }

      const params = {
        Bucket: this.config.bucket,
        Prefix: prefix,
        MaxKeys: maxKeys
      };

      if (continuationToken) {
        params.ContinuationToken = continuationToken;
      }

      const command = new ListObjectsV2Command(params);
      const result = await this.client.send(command);
      
      return {
        objects: result.Contents || [],
        count: result.KeyCount || 0,
        isTruncated: result.IsTruncated || false,
        nextToken: result.NextContinuationToken
      };
    } catch (error) {
      logger.error('Error al listar objetos S3:', error);
      throw error;
    }
  }

  // Listar objetos con delimitador para simular estructura de carpetas
  async listObjectsWithDelimiter(prefix = '', delimiter = '/') {
    try {
      if (!this.client) {
        await this.init();
      }

      const command = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: prefix,
        Delimiter: delimiter,
        MaxKeys: 1000
      });

      const result = await this.client.send(command);
      
      return {
        objects: result.Contents || [],
        commonPrefixes: result.CommonPrefixes || [],
        count: result.KeyCount || 0,
        isTruncated: result.IsTruncated || false,
        nextToken: result.NextContinuationToken
      };
    } catch (error) {
      logger.error('Error al listar objetos con delimitador S3:', error);
      throw error;
    }
  }

  // Obtener detalles de un objeto específico
  async getObjectDetails(s3Key) {
    try {
      if (!this.client) {
        await this.init();
      }

      const command = new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: s3Key
      });

      const result = await this.client.send(command);
      
      return {
        Key: s3Key,
        ContentLength: result.ContentLength,
        LastModified: result.LastModified,
        ETag: result.ETag,
        ContentType: result.ContentType,
        Metadata: result.Metadata,
        StorageClass: result.StorageClass
      };
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      logger.error(`Error al obtener detalles del objeto ${s3Key}:`, error);
      throw error;
    }
  }

  // Descargar objeto de S3
  async downloadObject(s3Key) {
    try {
      if (!this.client) {
        await this.init();
      }

      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: s3Key
      });

      const response = await this.client.send(command);
      logger.info(`Objeto descargado de S3: ${s3Key}`);
      return response;
    } catch (error) {
      logger.error(`Error al descargar objeto de S3 ${s3Key}:`, error);
      throw error;
    }
  }

  // Eliminar objeto de S3
  async deleteObject(s3Key) {
    try {
      if (!this.client) {
        await this.init();
      }

      const command = new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: s3Key
      });

      await this.client.send(command);
      
      logger.info(`Objeto eliminado de S3: ${s3Key}`);
      return true;
    } catch (error) {
      logger.error(`Error al eliminar objeto ${s3Key} de S3:`, error);
      throw error;
    }
  }

  // Eliminar múltiples objetos
  async deleteObjects(s3Keys) {
    const results = [];
    const errors = [];

    for (const s3Key of s3Keys) {
      try {
        await this.deleteObject(s3Key);
        results.push(s3Key);
      } catch (error) {
        errors.push({
          s3Key,
          error: error.message
        });
      }
    }

    return {
      deleted: results,
      failed: errors,
      totalObjects: s3Keys.length,
      successCount: results.length,
      failureCount: errors.length
    };
  }

  // Obtener estadísticas de almacenamiento
  async getStorageStats(prefix = 'backups/') {
    try {
      const objects = await this.listObjects(prefix);
      
      let totalSize = 0;
      let totalFiles = 0;
      const fileTypes = {};
      let oldestFile = null;
      let newestFile = null;

      objects.objects.forEach(obj => {
        totalSize += obj.Size || 0;
        totalFiles++;

        // Contar tipos de archivo
        const ext = path.extname(obj.Key).toLowerCase();
        fileTypes[ext] = (fileTypes[ext] || 0) + 1;

        // Encontrar archivos más antiguos y nuevos
        if (!oldestFile || obj.LastModified < oldestFile.LastModified) {
          oldestFile = obj;
        }
        if (!newestFile || obj.LastModified > newestFile.LastModified) {
          newestFile = obj;
        }
      });

      return {
        totalSize,
        totalFiles,
        fileTypes,
        oldestFile: oldestFile ? {
          key: oldestFile.Key,
          date: oldestFile.LastModified,
          size: oldestFile.Size
        } : null,
        newestFile: newestFile ? {
          key: newestFile.Key,
          date: newestFile.LastModified,
          size: newestFile.Size
        } : null,
        averageFileSize: totalFiles > 0 ? Math.round(totalSize / totalFiles) : 0
      };
    } catch (error) {
      logger.error('Error al obtener estadísticas de almacenamiento:', error);
      throw error;
    }
  }

  // Generar clave S3 para backup
  generateBackupKey(type, timestamp = new Date()) {
    const isoString = timestamp.toISOString();
    const dateStr = isoString.split('T')[0]; // YYYY-MM-DD
    const timeStr = isoString.split('T')[1].substring(0, 5).replace(':', '-'); // HH-mm
    const dateTimeStr = `${dateStr}-${timeStr}`; // YYYY-MM-DD-HH-mm
    
    switch (type) {
      case 'folders':
        return `backups/carpetas ${dateTimeStr}.zip`;
      case 'folders-detail':
        return `backups/carpetas ${dateTimeStr}-detalle.txt`;
      case 'database':
        return `backups/database ${dateTimeStr}.zip`;
      case 'full':
        return `backups/completo ${dateTimeStr}.zip`;
      default:
        return `backups/${type} ${dateTimeStr}.zip`;
    }
  }

  // Obtener tipo de contenido basado en extensión
  getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.zip': 'application/zip',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',
      '.sql': 'application/sql',
      '.json': 'application/json',
      '.log': 'text/plain',
      '.txt': 'text/plain'
    };
    
    return contentTypes[ext] || 'application/octet-stream';
  }

  // Limpiar backups antiguos
  async cleanOldBackups(daysToKeep = 30, prefix = 'backups/') {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const objects = await this.listObjects(prefix);
      const objectsToDelete = objects.objects.filter(obj => 
        obj.LastModified < cutoffDate
      );

      if (objectsToDelete.length === 0) {
        logger.info('No hay backups antiguos para eliminar');
        return { deleted: 0, errors: 0 };
      }

      const s3Keys = objectsToDelete.map(obj => obj.Key);
      const result = await this.deleteObjects(s3Keys);
      
      logger.info(`Limpieza de backups completada: ${result.successCount} eliminados, ${result.failureCount} errores`);
      
      return {
        deleted: result.successCount,
        errors: result.failureCount,
        totalSize: objectsToDelete.reduce((sum, obj) => sum + (obj.Size || 0), 0)
      };
    } catch (error) {
      logger.error('Error al limpiar backups antiguos:', error);
      throw error;
    }
  }
}

// Crear instancia singleton
const s3Service = new S3Service();

export { s3Service };
export default s3Service;