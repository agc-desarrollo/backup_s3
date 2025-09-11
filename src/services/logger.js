import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuración de formato de logs
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    // Agregar metadatos si existen
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta)}`;
    }
    
    return logMessage;
  })
);

// Configuración de rotación diaria para logs generales
const fileRotateTransport = new DailyRotateFile({
  filename: path.join(__dirname, '../../logs/backup-%DATE%.log'),
  datePattern: 'YYYY-MM',
  maxFiles: '12m', // Mantener 12 meses de logs
  maxSize: '20m', // Rotar cuando el archivo alcance 20MB
  format: logFormat
});

// Configuración de rotación para logs de error
const errorFileRotateTransport = new DailyRotateFile({
  filename: path.join(__dirname, '../../logs/error-%DATE%.log'),
  datePattern: 'YYYY-MM',
  maxFiles: '12m',
  maxSize: '20m',
  level: 'error',
  format: logFormat
});

// Configuración de rotación para logs de backup
const backupFileRotateTransport = new DailyRotateFile({
  filename: path.join(__dirname, '../../logs/backup-operations-%DATE%.log'),
  datePattern: 'YYYY-MM',
  maxFiles: '12m',
  maxSize: '20m',
  format: logFormat
});

// Crear logger principal
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Consola para desarrollo
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // Archivo rotativo para todos los logs
    fileRotateTransport,
    // Archivo rotativo solo para errores
    errorFileRotateTransport
  ],
  // Configuración para excepciones no capturadas
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(__dirname, '../../logs/exceptions.log') 
    })
  ],
  // Configuración para promesas rechazadas
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: path.join(__dirname, '../../logs/rejections.log') 
    })
  ]
});

// Logger específico para operaciones de backup
const backupLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    backupFileRotateTransport,
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Función para obtener logs con paginación
export async function getLogs(options = {}) {
  const {
    level = null,
    page = 1,
    limit = 50,
    startDate = null,
    endDate = null,
    source = 'general'
  } = options;

  try {
    const fs = await import('fs/promises');
    const logsDir = path.join(__dirname, '../../logs');
    
    // Determinar qué archivo de logs leer según el source
    const files = await fs.readdir(logsDir);
    let logFileName;
    
    if (source === 'backup') {
      // Buscar archivo de backup operations más reciente
      const backupFiles = files.filter(file => file.startsWith('backup-operations-') && file.endsWith('.log'));
      logFileName = backupFiles.sort().pop() || 'backup-operations-2025-09.log';
    } else {
      // Buscar archivo de logs generales más reciente
      const generalFiles = files.filter(file => file.startsWith('backup-') && !file.includes('operations') && file.endsWith('.log'));
      logFileName = generalFiles.sort().pop() || 'backup-2025-09.log';
    }
    
    const logFilePath = path.join(logsDir, logFileName);
    
    // Verificar si el archivo existe
    try {
      await fs.access(logFilePath);
    } catch (error) {
      return {
        logs: [],
        total: 0,
        page,
        limit,
        totalPages: 0
      };
    }
    
    // Leer el archivo de logs
    const logContent = await fs.readFile(logFilePath, 'utf-8');
    const logLines = logContent.split('\n').filter(line => line.trim());
    
    // Parsear las líneas de logs
    const logs = [];
    for (const line of logLines) {
      try {
        // Formato: YYYY-MM-DD HH:mm:ss [LEVEL]: message
        const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[([A-Z]+)\]: (.+)$/);
        if (match) {
          const [, timestamp, logLevel, message] = match;
          
          // Filtrar por nivel si se especifica
          if (level && logLevel.toLowerCase() !== level.toLowerCase()) {
            continue;
          }
          
          // Filtrar por fecha si se especifica
          const logDate = new Date(timestamp);
          if (startDate && logDate < startDate) continue;
          if (endDate && logDate > endDate) continue;
          
          logs.push({
            timestamp,
            level: logLevel.toLowerCase(),
            message,
            meta: null
          });
        }
      } catch (parseError) {
        // Ignorar líneas que no se pueden parsear
        continue;
      }
    }
    
    // Ordenar por timestamp descendente
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Aplicar paginación
    const total = logs.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedLogs = logs.slice(startIndex, endIndex);
    
    return {
      logs: paginatedLogs,
      total,
      page,
      limit,
      totalPages
    };
    
  } catch (error) {
    logger.error('Error al leer logs:', error);
    return {
      logs: [],
      total: 0,
      page,
      limit,
      totalPages: 0
    };
  }
}

// Función para limpiar logs antiguos
export async function cleanOldLogs(daysToKeep = 90) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    logger.info(`Limpiando logs anteriores a ${cutoffDate.toISOString()}`);
    
    // La limpieza automática se maneja por la configuración maxFiles
    // Esta función puede extenderse para limpieza manual adicional
    
    return true;
  } catch (error) {
    logger.error('Error al limpiar logs antiguos:', error);
    return false;
  }
}

// Función para obtener estadísticas de logs
export async function getLogStats() {
  try {
    const stats = {
      totalLogs: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      debugCount: 0,
      lastError: null,
      lastBackup: null,
      last24Hours: {
        total: 0,
        errors: 0,
        warnings: 0
      }
    };

    // Obtener logs generales para estadísticas
    const generalLogs = await getLogs({ limit: 10000, source: 'general' });
    const backupLogs = await getLogs({ limit: 1000, source: 'backup' });
    
    // Calcular estadísticas de logs generales
    stats.totalLogs = generalLogs.total;
    
    generalLogs.logs.forEach(log => {
      switch (log.level) {
        case 'error':
          stats.errorCount++;
          if (!stats.lastError || new Date(log.timestamp) > new Date(stats.lastError)) {
            stats.lastError = log.timestamp;
          }
          break;
        case 'warn':
          stats.warningCount++;
          break;
        case 'info':
          stats.infoCount++;
          break;
        case 'debug':
          stats.debugCount++;
          break;
      }
    });
    
    // Buscar último backup en logs de backup
    if (backupLogs.logs.length > 0) {
      const lastBackupLog = backupLogs.logs.find(log => 
        log.message.toLowerCase().includes('backup') || 
        log.message.toLowerCase().includes('respaldo')
      );
      if (lastBackupLog) {
        stats.lastBackup = lastBackupLog.timestamp;
      }
    }
    
    // Estadísticas de las últimas 24 horas
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent24hLogs = generalLogs.logs.filter(log => 
      new Date(log.timestamp) > last24Hours
    );
    
    stats.last24Hours.total = recent24hLogs.length;
    stats.last24Hours.errors = recent24hLogs.filter(log => log.level === 'error').length;
    stats.last24Hours.warnings = recent24hLogs.filter(log => log.level === 'warn').length;

    return stats;
  } catch (error) {
    logger.error('Error al obtener estadísticas de logs:', error);
    return {
      totalLogs: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      debugCount: 0,
      lastError: null,
      lastBackup: null,
      last24Hours: {
        total: 0,
        errors: 0,
        warnings: 0
      }
    };
  }
}

// Eventos de rotación de archivos
fileRotateTransport.on('rotate', (oldFilename, newFilename) => {
  logger.info(`Log rotado: ${oldFilename} -> ${newFilename}`);
});

errorFileRotateTransport.on('rotate', (oldFilename, newFilename) => {
  logger.info(`Log de errores rotado: ${oldFilename} -> ${newFilename}`);
});

backupFileRotateTransport.on('rotate', (oldFilename, newFilename) => {
  logger.info(`Log de backup rotado: ${oldFilename} -> ${newFilename}`);
});

// Exportar loggers
export { logger, backupLogger };
export default logger;