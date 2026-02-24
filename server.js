import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// Importar servicios y controladores
import { logger } from './src/services/logger.js';
import { configService } from './src/services/configService.js';
import { databaseService } from './src/services/databaseService.js';
import { backupService } from './src/services/backupService.js';
import { s3Service } from './src/services/s3Service.js';
import { schedulerService } from './src/services/schedulerService.js';
import { backupController } from './src/controllers/backupController.js';
import { configController } from './src/controllers/configController.js';
import { logsController } from './src/controllers/logsController.js';
import { s3Controller } from './src/controllers/s3Controller.js';
import { authMiddleware } from './src/middleware/authMiddleware.js';
import {
  sanitizePaths,
  validatePayloadSize,
  validateContentType,
  sanitizeInput,
  detectSQLInjection,
  validateSecurityHeaders,
  addSecurityHeaders
} from './src/middleware/securityMiddleware.js';

// Configuración básica

// Crear aplicación Express
const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de seguridad básica para API
app.use(helmet());

// Configuración de CORS para API
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true
}));

// Middleware de compresión
app.use(compression());



// Aplicar middlewares de seguridad
app.use(addSecurityHeaders);
app.use(validateSecurityHeaders);
app.use(validatePayloadSize());
app.use(validateContentType());

// Middleware de parsing JSON y URL-encoded
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middlewares de sanitización y validación (después del parsing)
app.use(sanitizeInput);
app.use(detectSQLInjection);
app.use(sanitizePaths);

// Sin configuración de sesiones - usando API token

// Middleware de logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Rutas de API únicamente
app.use('/api/backup', authMiddleware, backupController);
app.use('/api/config', authMiddleware, configController);
app.use('/api/logs', authMiddleware, logsController);
app.use('/api/s3', authMiddleware, s3Controller);

// Scheduler endpoints (no auth required - runs locally)
app.get('/api/scheduler/status', (req, res) => {
  res.json({ success: true, data: schedulerService.getStatus() });
});

app.get('/api/scheduler/jobs', (req, res) => {
  res.json({ success: true, data: schedulerService.getJobs() });
});

app.post('/api/scheduler/run/:jobName', async (req, res) => {
  try {
    const { jobName } = req.params;
    const result = await schedulerService.runJob(jobName);
    res.json({ success: true, message: result.message });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
});

app.post('/api/scheduler/reload', async (req, res) => {
  try {
    await schedulerService.reload();
    res.json({ success: true, message: 'Scheduler recargado' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Servicio de backup S3 funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});

// Middleware de manejo de errores
app.use((err, req, res, next) => {
  logger.error('Error no manejado:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor'
      : err.message
  });
});

// Middleware para rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada'
  });
});

// Función para inicializar el servidor
async function startServer() {
  try {
    // Inicializar servicios
    logger.info('Iniciando API de backup S3...');

    // Inicializar servicios en orden
    await configService.init();
    await databaseService.init();
    await backupService.init();
    await s3Service.init();

    logger.info('Todos los servicios inicializados correctamente');

    // Inicializar scheduler si está habilitado
    if (process.env.ENABLE_SCHEDULER === 'true') {
      logger.info('Inicializando scheduler de backups...');
      const schedulerInitialized = await schedulerService.init();
      if (schedulerInitialized) {
        schedulerService.start();
        logger.info('Scheduler de backups iniciado');
      }
    } else {
      logger.info('Scheduler deshabilitado (establezca ENABLE_SCHEDULER=true para habilitar)');
    }

    // Iniciar servidor
    app.listen(PORT, () => {
      logger.info(`Servidor API iniciado en puerto ${PORT}`);
      console.log(`\n🚀 API de Backup S3 iniciada`);
      console.log(`📡 API disponible en: http://localhost:${PORT}/api`);
      console.log(`💾 Backup manual: POST /api/backup/database`);
      console.log(`📁 Backup carpetas: POST /api/backup/folders`);
      console.log(`📋 Logs: GET /api/logs`);
      console.log(`❤️  Health check: GET /api/health`);
      console.log(`🔑 Autenticación: Header 'api-token'`);
      if (process.env.ENABLE_SCHEDULER === 'true') {
        console.log(`⏰ Scheduler: HABILITADO`);
        console.log(`📋 Jobs: GET /api/scheduler/jobs`);
        console.log(`📊 Estado: GET /api/scheduler/status`);
      } else {
        console.log(`⏰ Scheduler: DESHABILITADO (use ENABLE_SCHEDULER=true)`);
      }
    });

  } catch (error) {
    logger.error('Error al iniciar el servidor:', error);
    process.exit(1);
  }
}

// Manejo de señales del sistema
process.on('SIGTERM', () => {
  logger.info('Recibida señal SIGTERM, cerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Recibida señal SIGINT, cerrando servidor...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('Excepción no capturada:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promesa rechazada no manejada:', { reason, promise });
  process.exit(1);
});

// Iniciar el servidor
startServer();

export default app;