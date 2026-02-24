import schedule from 'node-schedule';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { logger } from './logger.js';
import { rotationService } from './rotationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * SchedulerService - Maneja la programación de backups automáticos
 */
class SchedulerService {
  constructor() {
    this.config = null;
    this.jobs = new Map(); // jobName -> scheduledJob
    this.isRunning = false;
    this.lastRun = new Map(); // jobName -> lastRunTime
    this.configPath = path.join(__dirname, '../../config/schedule.json');
  }

  /**
   * Inicializa el scheduler cargando la configuración
   */
  async init() {
    try {
      // Verificar si existe el archivo de configuración
      if (!fs.existsSync(this.configPath)) {
        logger.warn('Archivo de configuración de scheduler no encontrado. Cree config/schedule.json');
        return false;
      }

      // Cargar configuración
      const configData = fs.readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(configData);

      // Usar URL del servidor desde variables de entorno
      const port = process.env.PORT || 3000;
      this.serverUrl = `http://localhost:${port}`;

      if (!this.config.jobs || this.config.jobs.length === 0) {
        logger.warn('No hay jobs configurados en schedule.json');
        return false;
      }

      // Obtener token de autenticación (usar API_TOKEN del .env)
      this.authToken = process.env.API_TOKEN;

      if (!this.authToken) {
        logger.warn('Variable de entorno API_TOKEN no configurada. Los jobs del scheduler no podrán ejecutarse.');
      }

      logger.info(Scheduler cargado con  jobs);
      return true;
    } catch (error) {
      logger.error('Error al inicializar scheduler:', error);
      return false;
    }
  }

  /**
   * Inicia todos los jobs programados
   */
  start() {
    if (!this.config || !this.config.jobs) {
      logger.warn('Scheduler no configurado. No se pueden iniciar jobs.');
      return;
    }

    this.isRunning = true;
    logger.info('Iniciando scheduler de backups...');

    for (const jobConfig of this.config.jobs) {
      if (jobConfig.enabled === false) {
        logger.info(Job  deshabilitado, omitiendo.);
        continue;
      }

      this.scheduleJob(jobConfig);
    }

    logger.info(Scheduler iniciado con  jobs activos.);
  }

  /**
   * Programa un job específico
   */
  scheduleJob(jobConfig) {
    const { name, days, time, type } = jobConfig;

    // Validar configuración del job
    if (!days || !time || !type) {
      logger.error(Job  tiene configuración inválida.);
      return;
    }

    // Convertir tiempo a regla de cron
    const [hours, minutes] = time.split(':').map(Number);

    // Crear regla de recurrencia
    const rule = new schedule.RecurrenceRule();
    rule.hour = hours;
    rule.minute = minutes;
    rule.dayOfWeek = days;

    // Programar el job
    const scheduledJob = schedule.scheduleJob(rule, async () => {
      await this.executeJob(jobConfig);
    });

    if (scheduledJob) {
      this.jobs.set(name, scheduledJob);
      logger.info(Job '' programado: backup, días  a las);
    } else {
      logger.error(Error al programar job '');
    }
  }

  /**
   * Ejecuta un job de backup
   */
  async executeJob(jobConfig) {
    const { name, type, rotation } = jobConfig;
    const startTime = new Date();

    logger.info(=== Iniciando job: () ===);

    try {
      // Determinar endpoint según el tipo
      const endpoint = type === 'folder'
        ? '/api/backup/folders'
        : '/api/backup/database';

      const url = `${this.serverUrl}${endpoint}`;

      // Llamar a la API
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': Bearer
        }
      });

      if (!response.ok) {
        throw new Error(API responded with status);
      }

      const result = await response.json();
      logger.info(Backup  completado:, result);

      // Aplicar rotación si está configurada
      if (rotation) {
        logger.info(Aplicando política de rotación para ...);
        const rotationResult = await rotationService.applyRotation(type, rotation);
        logger.info(Rotación completada:, rotationResult);
      }

      // Registrar tiempo de ejecución
      this.lastRun.set(name, {
        startTime,
        endTime: new Date(),
        success: true,
        type
      });

      logger.info(=== Job  completado exitosamente ===);
    } catch (error) {
      logger.error(Error en job :, error.message);

      this.lastRun.set(name, {
        startTime,
        endTime: new Date(),
        success: false,
        error: error.message,
        type
      });
    }
  }

  /**
   * Detiene todos los jobs
   */
  stop() {
    logger.info('Deteniendo scheduler...');

    for (const [name, job] of this.jobs) {
      job.cancel();
      logger.info(Job  cancelado);
    }

    this.jobs.clear();
    this.isRunning = false;
    logger.info('Scheduler detenido.');
  }

  /**
   * Obtiene el estado del scheduler
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: Array.from(this.jobs.keys()),
      jobsConfigured: this.config?.jobs?.length || 0,
      lastRun: Object.fromEntries(this.lastRun)
    };
  }

  /**
   * Obtiene la lista de jobs configurados
   */
  getJobs() {
    if (!this.config || !this.config.jobs) {
      return [];
    }

    return this.config.jobs.map(job => ({
      name: job.name,
      description: job.description,
      type: job.type,
      days: job.days,
      time: job.time,
      enabled: job.enabled !== false,
      hasRotation: !!job.rotation,
      rotation: job.rotation || null
    }));
  }

  /**
   * Ejecuta un job manualmente
   */
  async runJob(jobName) {
    const jobConfig = this.config?.jobs?.find(j => j.name === jobName);

    if (!jobConfig) {
      throw new Error(Job '' no encontrado);
    }

    logger.info(Ejecutando job manualmente: );
    await this.executeJob(jobConfig);
    return { message: Job  ejecutado };
  }

  /**
   * Recarga la configuración del scheduler
   */
  async reload() {
    this.stop();
    await this.init();
    if (this.isRunning || this.config?.jobs?.length > 0) {
      this.start();
    }
    logger.info('Scheduler recargado');
  }
}

export const schedulerService = new SchedulerService();
