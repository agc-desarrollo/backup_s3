import fs from 'fs/promises';
import path from 'path';
import archiver from 'archiver';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger, backupLogger } from './logger.js';
import { configService } from './configService.js';
import { s3Service } from './s3Service.js';
import { databaseService } from './databaseService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class BackupService {
  constructor() {
    this.isRunning = false;
    this.currentJob = null;
  }

  // Inicializar servicio de backup
  async init() {
    try {
      // Asegurar que existen los directorios necesarios
      await fs.mkdir(path.join(__dirname, '../../temp'), { recursive: true });
      await fs.mkdir(path.join(__dirname, '../../logs'), { recursive: true });
      
      logger.info('Servicio de backup inicializado correctamente');
    } catch (error) {
      logger.error('Error al inicializar servicio de backup:', error);
      throw error;
    }
  }

  // Ejecutar backup completo
  async runFullBackup() {
    if (this.isRunning) {
      throw new Error('Ya hay un backup en ejecución');
    }

    const jobId = uuidv4();
    this.isRunning = true;
    this.currentJob = {
      id: jobId,
      type: 'full',
      status: 'running',
      startTime: new Date(),
      progress: 0
    };

    try {
      backupLogger.info(`Iniciando backup completo - Job ID: ${jobId}`);
      
      const results = {
        jobId,
        startTime: this.currentJob.startTime,
        folders: null,
        database: null,
        s3Upload: null,
        endTime: null,
        success: false,
        errors: []
      };

      // Paso 1: Backup de carpetas
      try {
        this.currentJob.progress = 10;
        backupLogger.info('Iniciando backup de carpetas...');
        results.folders = await this.backupFolders();
        this.currentJob.progress = 40;
      } catch (error) {
        results.errors.push(`Error en backup de carpetas: ${error.message}`);
        backupLogger.error('Error en backup de carpetas:', error);
      }

      // Paso 2: Backup de base de datos
      try {
        this.currentJob.progress = 50;
        backupLogger.info('Iniciando backup de base de datos...');
        results.database = await this.backupDatabase();
        this.currentJob.progress = 70;
      } catch (error) {
        results.errors.push(`Error en backup de base de datos: ${error.message}`);
        backupLogger.error('Error en backup de base de datos:', error);
      }

      // Paso 3: Subir a S3
      try {
        this.currentJob.progress = 80;
        backupLogger.info('Subiendo backups a S3...');
        results.s3Upload = await this.uploadBackupsToS3(results);
        this.currentJob.progress = 95;
      } catch (error) {
        results.errors.push(`Error al subir a S3: ${error.message}`);
        backupLogger.error('Error al subir a S3:', error);
      }

      // Paso 4: Limpiar archivos temporales
      try {
        await this.cleanupTempFiles(results);
        this.currentJob.progress = 100;
      } catch (error) {
        results.errors.push(`Error al limpiar archivos temporales: ${error.message}`);
        backupLogger.error('Error al limpiar archivos temporales:', error);
      }

      results.endTime = new Date();
      results.success = results.errors.length === 0;
      
      const duration = results.endTime - results.startTime;
      
      if (results.success) {
        backupLogger.info(`Backup completo exitoso - Job ID: ${jobId}`, {
          duration: `${duration}ms`,
          foldersBackup: results.folders?.success || false,
          databaseBackup: results.database?.success || false,
          s3Upload: results.s3Upload?.success || false
        });
      } else {
        backupLogger.error(`Backup completo falló - Job ID: ${jobId}`, {
          duration: `${duration}ms`,
          errors: results.errors
        });
      }

      return results;
    } finally {
      this.isRunning = false;
      this.currentJob = null;
    }
  }

  // Backup solo de carpetas
  async runFoldersBackup() {
    if (this.isRunning) {
      throw new Error('Ya hay un backup en ejecución');
    }

    const jobId = uuidv4();
    this.isRunning = true;
    this.currentJob = {
      id: jobId,
      type: 'folders',
      status: 'running',
      startTime: new Date(),
      progress: 0
    };

    try {
      backupLogger.info(`Iniciando backup de carpetas - Job ID: ${jobId}`);
      
      this.currentJob.progress = 20;
      const foldersResult = await this.backupFolders();
      
      this.currentJob.progress = 50;
      // Subir archivo ZIP
      const s3ZipResult = await this.uploadToS3(foldersResult.filePath, 
        s3Service.generateBackupKey('folders'), 
        { type: 'folders', jobId }
      );
      
      this.currentJob.progress = 70;
      // Subir archivo de detalle TXT
      const s3DetailResult = await this.uploadToS3(foldersResult.detailFile.filePath, 
        s3Service.generateBackupKey('folders-detail'), 
        { type: 'folders-detail', jobId }
      );
      
      this.currentJob.progress = 90;
      // Limpiar archivos temporales
      await this.cleanupFile(foldersResult.filePath);
      await this.cleanupFile(foldersResult.detailFile.filePath);
      
      this.currentJob.progress = 100;
      
      const result = {
        jobId,
        type: 'folders',
        success: true,
        foldersBackup: foldersResult,
        s3Upload: {
          zip: s3ZipResult,
          detail: s3DetailResult
        },
        endTime: new Date()
      };
      
      backupLogger.info(`Backup de carpetas completado - Job ID: ${jobId}`);
      backupLogger.info(`Archivos subidos: ZIP (${s3ZipResult.key}) y Detalle (${s3DetailResult.key})`);
      return result;
    } finally {
      this.isRunning = false;
      this.currentJob = null;
    }
  }

  // Backup solo de base de datos
  async runDatabaseBackup() {
    if (this.isRunning) {
      throw new Error('Ya hay un backup en ejecución');
    }

    const jobId = uuidv4();
    this.isRunning = true;
    this.currentJob = {
      id: jobId,
      type: 'database',
      status: 'running',
      startTime: new Date(),
      progress: 0
    };

    try {
      console.log(`🚀 Iniciando backup de base de datos - Job ID: ${jobId}`);
      backupLogger.info(`Iniciando backup de base de datos - Job ID: ${jobId}`);
      
      console.log('📊 Progreso: 20% - Creando backup de base de datos...');
      this.currentJob.progress = 20;
      const dbResult = await this.backupDatabase();
      
      console.log('📊 Progreso: 60% - Subiendo archivo a S3...');
      this.currentJob.progress = 60;
      const s3Result = await this.uploadToS3(dbResult.filePath, 
        s3Service.generateBackupKey('database'), 
        { type: 'database', jobId }
      );
      
      console.log('📊 Progreso: 90% - Limpiando archivos temporales...');
      this.currentJob.progress = 90;
      await this.cleanupFile(dbResult.filePath);
      
      console.log('📊 Progreso: 100% - Backup completado exitosamente!');
      this.currentJob.progress = 100;
      
      const result = {
        jobId,
        type: 'database',
        success: true,
        databaseBackup: dbResult,
        s3Upload: s3Result,
        endTime: new Date()
      };
      
      console.log(`✅ Backup de base de datos completado - Job ID: ${jobId}`);
      backupLogger.info(`Backup de base de datos completado - Job ID: ${jobId}`);
      return result;
    } finally {
      this.isRunning = false;
      this.currentJob = null;
    }
  }

  // Crear backup de carpetas
  async backupFolders() {
    try {
      const config = configService.getConfig();
      if (!config.backupFolders || config.backupFolders.length === 0) {
        throw new Error('No hay carpetas configuradas para backup');
      }

      const timestamp = new Date();
      const timestampStr = timestamp.toISOString().replace(/[:.]/g, '-');
      const zipFileName = `folders-backup-${timestampStr}.zip`;
      const zipPath = path.join(__dirname, '../../temp', zipFileName);

      // Crear archivo ZIP
      const archive = archiver('zip', { zlib: { level: 9 } });
      const output = await fs.open(zipPath, 'w');
      const writeStream = output.createWriteStream();
      
      archive.pipe(writeStream);

      let totalFiles = 0;
      let totalSize = 0;

      // Agregar cada carpeta al ZIP
      for (const folderPath of config.backupFolders) {
        try {
          // Validar que la carpeta existe
          await fs.access(folderPath);
          
          // Agregar carpeta al archivo
          archive.directory(folderPath, path.basename(folderPath));
          
          // Contar archivos y tamaño
          const stats = await this.getFolderStats(folderPath);
          totalFiles += stats.fileCount;
          totalSize += stats.totalSize;
          
          backupLogger.info(`Carpeta agregada al backup: ${folderPath}`, {
            files: stats.fileCount,
            size: stats.totalSize
          });
        } catch (error) {
          backupLogger.warn(`Error al procesar carpeta ${folderPath}:`, error.message);
        }
      }

      // Finalizar archivo
      await archive.finalize();
      await new Promise((resolve, reject) => {
        writeStream.on('close', resolve);
        writeStream.on('error', reject);
      });
      
      await output.close();

      // Verificar archivo creado
      const zipStats = await fs.stat(zipPath);
      
      // Generar archivo de detalle
      const detailResult = await this.generateBackupDetailFile(config.backupFolders, zipFileName, timestamp);
      
      return {
        success: true,
        filePath: zipPath,
        fileName: zipFileName,
        size: zipStats.size,
        totalFiles,
        totalFolders: config.backupFolders.length,
        originalSize: totalSize,
        compressionRatio: totalSize > 0 ? (zipStats.size / totalSize * 100).toFixed(2) : 0,
        detailFile: detailResult
      };
    } catch (error) {
      backupLogger.error('Error al crear backup de carpetas:', error);
      throw error;
    }
  }

  // Crear backup de base de datos
  async backupDatabase() {
    try {
      // Crear backup SQL
      const dbBackup = await databaseService.createBackup();
      
      // Si el backup ya está comprimido, no comprimir nuevamente
      if (dbBackup.compressed) {
        backupLogger.info('Backup ya está comprimido, usando archivo existente');
        return {
          success: true,
          filePath: dbBackup.filePath,
          fileName: dbBackup.fileName,
          size: dbBackup.size,
          originalSize: dbBackup.size,
          database: dbBackup.database,
          type: dbBackup.type,
          compressionRatio: 100 // Ya está comprimido
        };
      }
      
      // Solo comprimir si el backup no está comprimido (archivo SQL)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const zipFileName = `database-backup-${timestamp}.zip`;
      const zipPath = path.join(__dirname, '../../temp', zipFileName);

      const archive = archiver('zip', { zlib: { level: 9 } });
      const output = await fs.open(zipPath, 'w');
      const writeStream = output.createWriteStream();
      
      archive.pipe(writeStream);
      archive.file(dbBackup.filePath, { name: dbBackup.fileName });
      
      await archive.finalize();
      await new Promise((resolve, reject) => {
        writeStream.on('close', resolve);
        writeStream.on('error', reject);
      });
      
      await output.close();

      // Eliminar archivo SQL original
      await fs.unlink(dbBackup.filePath);

      // Verificar archivo ZIP creado
      const zipStats = await fs.stat(zipPath);
      
      return {
        success: true,
        filePath: zipPath,
        fileName: zipFileName,
        size: zipStats.size,
        originalSize: dbBackup.size,
        database: dbBackup.database,
        type: dbBackup.type,
        compressionRatio: (zipStats.size / dbBackup.size * 100).toFixed(2)
      };
    } catch (error) {
      backupLogger.error('Error al crear backup de base de datos:', error);
      throw error;
    }
  }

  // Subir archivo a S3
  async uploadToS3(filePath, s3Key, metadata = {}) {
    try {
      const fileName = path.basename(filePath);
      const stats = await fs.stat(filePath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      
      console.log(`☁️  Subiendo ${fileName} a S3 (${fileSizeMB} MB)...`);
      console.log(`🔑 Clave S3: ${s3Key}`);
      
      const result = await s3Service.uploadFile(filePath, s3Key, metadata);
      
      console.log(`✅ Archivo subido exitosamente a S3`);
      return result;
    } catch (error) {
      console.error(`❌ Error al subir ${path.basename(filePath)} a S3:`, error.message);
      backupLogger.error(`Error al subir ${filePath} a S3:`, error);
      throw error;
    }
  }

  // Subir múltiples backups a S3
  async uploadBackupsToS3(results) {
    const uploads = [];
    const errors = [];

    // Subir backup de carpetas
    if (results.folders && results.folders.success) {
      try {
        const s3Key = s3Service.generateBackupKey('folders');
        const uploadResult = await this.uploadToS3(results.folders.filePath, s3Key, {
          type: 'folders',
          jobId: results.jobId,
          totalFiles: results.folders.totalFiles,
          totalFolders: results.folders.totalFolders
        });
        uploads.push({ type: 'folders', result: uploadResult });
      } catch (error) {
        errors.push({ type: 'folders', error: error.message });
      }
    }

    // Subir backup de base de datos
    if (results.database && results.database.success) {
      try {
        const s3Key = s3Service.generateBackupKey('database');
        const uploadResult = await this.uploadToS3(results.database.filePath, s3Key, {
          type: 'database',
          jobId: results.jobId,
          database: results.database.database,
          dbType: results.database.type
        });
        uploads.push({ type: 'database', result: uploadResult });
      } catch (error) {
        errors.push({ type: 'database', error: error.message });
      }
    }

    return {
      success: errors.length === 0,
      uploads,
      errors,
      totalUploads: uploads.length,
      totalErrors: errors.length
    };
  }

  // Limpiar archivos temporales
  async cleanupTempFiles(results) {
    const filesToClean = [];
    
    if (results.folders && results.folders.filePath) {
      filesToClean.push(results.folders.filePath);
    }
    
    if (results.database && results.database.filePath) {
      filesToClean.push(results.database.filePath);
    }

    for (const filePath of filesToClean) {
      await this.cleanupFile(filePath);
    }
  }

  // Limpiar archivo específico
  async cleanupFile(filePath) {
    try {
      await fs.unlink(filePath);
      backupLogger.info(`Archivo temporal eliminado: ${filePath}`);
    } catch (error) {
      backupLogger.warn(`Error al eliminar archivo temporal ${filePath}:`, error.message);
    }
  }

  // Obtener estadísticas de carpeta
  async getFolderStats(folderPath) {
    let fileCount = 0;
    let totalSize = 0;

    async function scanDirectory(dirPath) {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile()) {
            const stats = await fs.stat(fullPath);
            fileCount++;
            totalSize += stats.size;
          }
        }
      } catch (error) {
        // Ignorar errores de acceso a archivos/carpetas específicas
      }
    }

    await scanDirectory(folderPath);
    
    return { fileCount, totalSize };
  }

  // Generar archivo TXT con detalle del contenido del backup
  async generateBackupDetailFile(folders, zipFileName, timestamp) {
    try {
      const detailFileName = zipFileName.replace('.zip', '-detalle.txt');
      const detailPath = path.join(__dirname, '../../temp', detailFileName);
      
      let content = `DETALLE DEL BACKUP DE CARPETAS\n`;
      content += `=====================================\n\n`;
      content += `Archivo ZIP: ${zipFileName}\n`;
      content += `Fecha de creación: ${timestamp.toLocaleString('es-ES')}\n`;
      content += `Carpetas incluidas: ${folders.length}\n\n`;
      
      let totalFiles = 0;
      let totalSize = 0;
      
      for (const folderPath of folders) {
        try {
          content += `CARPETA: ${folderPath}\n`;
          content += `${'='.repeat(50)}\n`;
          
          const folderDetails = await this.getFolderDetailedContent(folderPath);
          content += folderDetails.content;
          content += `\nResumen de la carpeta:\n`;
          content += `- Archivos: ${folderDetails.fileCount}\n`;
          content += `- Tamaño total: ${folderDetails.totalSizeMB} MB\n\n`;
          
          totalFiles += folderDetails.fileCount;
          totalSize += folderDetails.totalSize;
        } catch (error) {
          content += `Error al procesar carpeta: ${error.message}\n\n`;
        }
      }
      
      content += `RESUMEN GENERAL\n`;
      content += `===============\n`;
      content += `Total de archivos: ${totalFiles}\n`;
      content += `Tamaño total: ${(totalSize / (1024 * 1024)).toFixed(2)} MB\n`;
      content += `Carpetas procesadas: ${folders.length}\n`;
      
      await fs.writeFile(detailPath, content, 'utf8');
      
      return {
        success: true,
        filePath: detailPath,
        fileName: detailFileName
      };
    } catch (error) {
      backupLogger.error('Error al generar archivo de detalle:', error);
      throw error;
    }
  }

  // Obtener contenido detallado de una carpeta
  async getFolderDetailedContent(folderPath, relativePath = '') {
    let content = '';
    let fileCount = 0;
    let totalSize = 0;
    
    try {
      const items = await fs.readdir(folderPath, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(folderPath, item.name);
        const itemRelativePath = path.join(relativePath, item.name);
        
        if (item.isDirectory()) {
          content += `📁 ${itemRelativePath}/\n`;
          const subContent = await this.getFolderDetailedContent(fullPath, itemRelativePath);
          content += subContent.content;
          fileCount += subContent.fileCount;
          totalSize += subContent.totalSize;
        } else if (item.isFile()) {
          const stats = await fs.stat(fullPath);
          const sizeKB = (stats.size / 1024).toFixed(2);
          const modifiedDate = stats.mtime.toLocaleDateString('es-ES');
          content += `📄 ${itemRelativePath} (${sizeKB} KB - ${modifiedDate})\n`;
          fileCount++;
          totalSize += stats.size;
        }
      }
    } catch (error) {
      content += `Error al leer carpeta ${folderPath}: ${error.message}\n`;
    }
    
    return {
      content,
      fileCount,
      totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
    };
  }

  // Obtener estado actual del backup
  getCurrentJobStatus() {
    return this.currentJob;
  }

  // Verificar si hay un backup en ejecución
  isBackupRunning() {
    return this.isRunning;
  }

  // Obtener estadísticas de backups
  async getBackupStats() {
    try {
      const s3Stats = await s3Service.getStorageStats();
      
      return {
        totalBackups: s3Stats.totalFiles,
        totalSize: s3Stats.totalSize,
        lastBackup: s3Stats.newestFile,
        oldestBackup: s3Stats.oldestFile,
        averageSize: s3Stats.averageFileSize,
        fileTypes: s3Stats.fileTypes,
        isRunning: this.isRunning,
        currentJob: this.currentJob,
        s3Available: true
      };
    } catch (error) {
      logger.warn('S3 no disponible para estadísticas, devolviendo datos básicos:', error.message);
      
      // Devolver estadísticas básicas cuando S3 no esté disponible
      return {
        totalBackups: 0,
        totalSize: 0,
        lastBackup: null,
        oldestBackup: null,
        averageSize: 0,
        fileTypes: {},
        isRunning: this.isRunning,
        currentJob: this.currentJob,
        s3Available: false,
        s3Error: error.message
      };
    }
  }
}

// Crear instancia singleton
const backupService = new BackupService();

export { backupService };
export default backupService;