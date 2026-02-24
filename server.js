import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
    },
  },
}));

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

// Scheduler CRUD endpoints
app.put('/api/scheduler/jobs', authMiddleware, async (req, res) => {
  try {
    const job = req.body;
    if (!job.name) {
      return res.status(400).json({ success: false, message: 'Job name is required' });
    }

    const result = await schedulerService.saveJob(job);
    res.json({ success: true, message: 'Job saved', data: result });
  } catch (error) {
    logger.error('Error saving job:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/scheduler/jobs/:jobName', authMiddleware, async (req, res) => {
  try {
    const { jobName } = req.params;
    const result = await schedulerService.deleteJob(jobName);
    res.json({ success: true, message: 'Job deleted', data: result });
  } catch (error) {
    logger.error('Error deleting job:', error);
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

// Interceptar acceso directo a manage.html
app.use((req, res, next) => {
  if (req.path.toLowerCase() === '/manage.html') {
    const queryString = Object.keys(req.query).length > 0 ? '?' + new URLSearchParams(req.query).toString() : '';
    return res.redirect('/manage' + queryString);
  }
  next();
});

// Management interface route with token validation (must be before static middleware)
app.get('/manage', (req, res) => {
  const token = req.query.api_token;
  const expectedToken = process.env.API_TOKEN;

  if (!token || token !== expectedToken) {
    return res.status(401).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Acceso Denegado</title>
        <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;background:#f5f7fa;margin:0;}</style>
      </head>
      <body>
        <div style="text-align:center;padding:2.5rem;background:white;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:400px;width:90%;">
          <h2 style="color:#e53e3e;margin-top:0;">Acceso Denegado</h2>
          <p style="color:#4a5568;margin-bottom:1.5rem;">Token de API faltante o inv&aacute;lido.</p>
          <div style="background:#edf2f7;padding:1rem;border-radius:8px;font-family:monospace;font-size:14px;color:#2d3748;word-break:break-all;">
            Agregar: ?api_token=TU_TOKEN
          </div>
        </div>
      </body>
      </html>
    `);
  }

  res.sendFile(path.join(__dirname, 'public', 'manage.html'));
});

// Serve static files from public directory
app.use(express.static('public'));

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

    // Verificar si la base de datos está configurada
    const dbConfig = configService.getDbConfig();
    const dbConfigured = !!(dbConfig.host && dbConfig.database && dbConfig.type);

    if (dbConfigured) {
      try {
        await databaseService.init();
        logger.info('Servicio de base de datos inicializado correctamente');
      } catch (error) {
        logger.warn('Error al inicializar base de datos, continuando sin ella:', error.message);
      }
    } else {
      logger.info('Base de datos no configurada, continuando sin ella');
    }

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