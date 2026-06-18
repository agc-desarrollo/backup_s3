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
    // Sin valores por defecto: la presencia de estas variables se valida en el
    // arranque (startupValidator). 'postgres' se normaliza a 'postgresql'.
    let dbType = process.env.DB_TYPE;
    if (dbType === 'postgres') {
      dbType = 'postgresql';
    }

    // PostgreSQL se configura mediante una única cadena de conexión. Se parsea
    // para exponer los campos sueltos (host, puerto, base...) que el resto del
    // código sigue usando (nombre de archivo de backup, info de la BD, etc.).
    if (dbType === 'postgresql') {
      const connectionString = process.env.DB_CONNECTION_STRING;
      const parsed = this.parsePostgresConnectionString(connectionString);
      return {
        type: dbType,
        connectionString,
        host: parsed.host,
        port: parsed.port,
        username: parsed.username,
        password: parsed.password,
        database: parsed.database
      };
    }

    // MySQL mantiene los valores sueltos.
    return {
      type: dbType,
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT, 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE
    };
  }

  // Parsear una cadena de conexión PostgreSQL en sus componentes.
  parsePostgresConnectionString(connectionString) {
    if (!connectionString) {
      return { host: undefined, port: undefined, username: undefined, password: undefined, database: undefined };
    }

    try {
      const url = new URL(connectionString);
      const database = url.pathname ? decodeURIComponent(url.pathname.replace(/^\//, '')) : undefined;
      return {
        host: url.hostname || undefined,
        port: url.port ? parseInt(url.port, 10) : 5432,
        username: url.username ? decodeURIComponent(url.username) : undefined,
        password: url.password ? decodeURIComponent(url.password) : undefined,
        database: database || undefined
      };
    } catch (error) {
      throw new Error(`DB_CONNECTION_STRING no es una cadena de conexión válida: ${error.message}`);
    }
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
      lastUpdated: this.config.updatedAt
    };
  }

  // Validar conexión de base de datos desde variables de entorno
  async validateDbConfig() {
    const dbConfig = this.getDbConfig();

    // PostgreSQL: basta con la cadena de conexión.
    if (dbConfig.type === 'postgresql') {
      if (!dbConfig.connectionString) {
        throw new Error('Falta la variable de entorno requerida: DB_CONNECTION_STRING (PostgreSQL)');
      }
      return true;
    }

    // MySQL: validar los campos sueltos.
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