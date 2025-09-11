import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Rutas de archivos de configuración
const CONFIG_PATH = path.join(__dirname, '../../config/config.json');

// Configuración por defecto
const DEFAULT_CONFIG = {
  backupFolders: [],
  cronSchedule: '0 2 * * *', // Diario a las 2 AM
  updatedAt: new Date().toISOString()
};

// Configuración de usuarios eliminada - no necesaria para API con token

class ConfigService {
  constructor() {
    this.config = null;
    this.users = null;
  }

  // Inicializar servicio de configuración
  async init() {
    try {
      await this.ensureConfigExists();
      await this.loadConfig();
      logger.info('Servicio de configuración inicializado correctamente');
    } catch (error) {
      logger.error('Error al inicializar servicio de configuración:', error);
      throw error;
    }
  }

  // Asegurar que existe el archivo de configuración
  async ensureConfigExists() {
    try {
      await fs.access(CONFIG_PATH);
    } catch (error) {
      logger.info('Creando archivo de configuración por defecto');
      await fs.writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    }
  }

  // Funciones de usuarios eliminadas - no necesarias para API con token

  // Cargar configuración desde archivo
  async loadConfig() {
    try {
      const data = await fs.readFile(CONFIG_PATH, 'utf8');
      this.config = JSON.parse(data);
      return this.config;
    } catch (error) {
      logger.error('Error al cargar configuración:', error);
      throw error;
    }
  }



  // Obtener configuración actual
  getConfig() {
    return this.config;
  }

  // Obtener configuración de base de datos desde variables de entorno
  getDbConfig() {
    return {
      type: process.env.DB_TYPE || 'postgresql',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      username: process.env.DB_USERNAME || '',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || ''
    };
  }

  // Actualizar configuración
  async updateConfig(newConfig) {
    try {
      // Validar configuración
      const validatedConfig = this.validateConfig(newConfig);
      
      // Actualizar timestamp
      validatedConfig.updatedAt = new Date().toISOString();
      
      // Guardar en archivo
      await fs.writeFile(CONFIG_PATH, JSON.stringify(validatedConfig, null, 2));
      
      // Actualizar en memoria
      this.config = validatedConfig;
      
      logger.info('Configuración actualizada correctamente');
      return this.config;
    } catch (error) {
      logger.error('Error al actualizar configuración:', error);
      throw error;
    }
  }

  // Validar configuración
  validateConfig(config) {
    const errors = [];

    // Validar carpetas de backup
    if (!Array.isArray(config.backupFolders)) {
      errors.push('backupFolders debe ser un array');
    }

    // Validar expresión cron
    if (!config.cronSchedule) {
      errors.push('Programación cron requerida');
    }

    if (errors.length > 0) {
      throw new Error(`Errores de validación: ${errors.join(', ')}`);
    }

    return config;
  }





  // Obtener estadísticas de configuración
  getConfigStats() {
    if (!this.config) {
      return null;
    }

    const dbConfig = this.getDbConfig();
    return {
      dbConfigured: !!(dbConfig.host && dbConfig.database),
      foldersConfigured: this.config.backupFolders.length > 0,
      lastUpdated: this.config.updatedAt,
      cronSchedule: this.config.cronSchedule
    };
  }

  // Validar conexión de base de datos desde variables de entorno
  async validateDbConfig() {
    const dbConfig = this.getDbConfig();
    // Esta función se implementará en el servicio de base de datos
    // Por ahora solo validamos que los campos requeridos estén presentes
    const required = ['type', 'host', 'port', 'username', 'database'];
    const missing = required.filter(field => !dbConfig[field]);
    
    if (missing.length > 0) {
      throw new Error(`Campos requeridos faltantes en variables de entorno: ${missing.join(', ')}`);
    }
    
    return true;
  }
}

// Crear instancia singleton
const configService = new ConfigService();

export { configService };
export default configService;