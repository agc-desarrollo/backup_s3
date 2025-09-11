import pg from 'pg';
import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import fsSync from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import archiver from 'archiver';
import { logger } from './logger.js';
import { configService } from './configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DatabaseService {
  constructor() {
    this.config = null;
    this.connection = null;
  }

  // Parsear datos de MySQL Shell a INSERT statements
  parseDataToInserts(output, tableName) {
    const lines = output.split('\n');
    let insertStatements = '';
    let headers = [];
    let dataRows = [];
    
    // Filtrar líneas válidas (ignorar separadores y headers)
    const validLines = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed && 
             !trimmed.startsWith('+') && 
             !trimmed.startsWith('|') && 
             trimmed.length > 0;
    });
    
    if (validLines.length === 0) {
      return `-- Tabla ${tableName} está vacía\n`;
    }
    
    // Procesar líneas para extraer headers y datos
    let headerFound = false;
    for (const line of validLines) {
      const columns = line.split('\t').map(col => col.trim());
      
      if (!headerFound && columns.length > 1) {
        headers = columns;
        headerFound = true;
      } else if (headerFound && columns.length === headers.length) {
        dataRows.push(columns);
      }
    }
    
    if (dataRows.length === 0) {
      return `-- Tabla ${tableName} está vacía\n`;
    }
    
    // Generar INSERT statements
    insertStatements += `-- Datos para tabla ${tableName}\n`;
    
    for (const row of dataRows) {
      const values = row.map(value => {
        if (value === null || value === 'NULL' || value === '') {
          return 'NULL';
        }
        // Escapar comillas simples y envolver en comillas
        return "'" + value.replace(/'/g, "\\'") + "'";
      }).join(', ');
      
      const columnNames = headers.map(header => `\`${header}\``).join(', ');
      insertStatements += `INSERT INTO \`${tableName}\` (${columnNames}) VALUES (${values});\n`;
    }
    
    return insertStatements;
  }

  // Inicializar servicio de base de datos
  async init() {
    try {
      // Obtener configuración de base de datos desde variables de entorno
      this.config = configService.getDbConfig();
      
      // Validar configuración
      await configService.validateDbConfig();
      
      // Probar conexión
      await this.testConnection();
      
      logger.info(`Servicio de base de datos ${this.config.type} inicializado correctamente`);
    } catch (error) {
      logger.error('Error al inicializar servicio de base de datos:', error);
      throw error;
    }
  }

  // Probar conexión con la base de datos
  async testConnection() {
    try {
      if (this.config.type === 'postgresql') {
        await this.testPostgreSQLConnection();
      } else if (this.config.type === 'mysql') {
        await this.testMySQLConnection();
      } else {
        throw new Error(`Tipo de base de datos no soportado: ${this.config.type}`);
      }
      
      logger.info(`Conexión exitosa con base de datos ${this.config.type}`);
      return true;
    } catch (error) {
      logger.error('Error al probar conexión de base de datos:', error);
      throw new Error(`Error de conexión ${this.config.type}: ${error.message}`);
    }
  }

  // Probar conexión PostgreSQL
  async testPostgreSQLConnection() {
    const client = new pg.Client({
      host: this.config.host,
      port: this.config.port,
      user: this.config.username,
      password: this.config.password,
      database: this.config.database,
      connectionTimeoutMillis: 5000
    });

    try {
      await client.connect();
      const result = await client.query('SELECT version()');
      logger.info('PostgreSQL version:', result.rows[0].version);
      await client.end();
    } catch (error) {
      await client.end();
      throw error;
    }
  }

  // Probar conexión MySQL
  async testMySQLConnection() {
    const connection = await mysql.createConnection({
      host: this.config.host,
      port: this.config.port,
      user: this.config.username,
      password: this.config.password,
      database: this.config.database,
      connectTimeout: 5000
    });

    try {
      const [rows] = await connection.execute('SELECT VERSION() as version');
      logger.info('MySQL version:', rows[0].version);
      await connection.end();
    } catch (error) {
      await connection.end();
      throw error;
    }
  }

  // Crear backup de base de datos
  async createBackup() {
    try {
      console.log('🔄 Iniciando proceso de backup de base de datos...');
      
      // Verificar que el servicio esté inicializado
      if (!this.config) {
        console.log('⚙️  Inicializando servicio de base de datos...');
        await this.init();
        console.log('✅ Servicio de base de datos inicializado');
      }
      
      console.log(`📊 Configuración de BD: ${this.config.type} - ${this.config.database}`);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `${this.config.database}-${timestamp}.sql`;
      const backupPath = path.join(__dirname, '../../temp', backupFileName);

      console.log(`📁 Preparando directorio temporal: ${path.dirname(backupPath)}`);
      // Asegurar que existe el directorio temp
      await fs.mkdir(path.dirname(backupPath), { recursive: true });
      console.log('✅ Directorio temporal preparado');

      console.log(`🚀 Ejecutando backup de ${this.config.type}...`);
      let backupResult;
      if (this.config.type === 'postgresql') {
        backupResult = await this.createPostgreSQLBackup(backupPath);
      } else if (this.config.type === 'mysql') {
        backupResult = await this.createMySQLBackup(backupPath);
      } else {
        throw new Error(`Tipo de base de datos no soportado: ${this.config.type}`);
      }
      console.log('✅ Backup ejecutado correctamente');

      console.log('📏 Verificando archivo de backup...');
      // Verificar si el archivo es ZIP (comprimido) o SQL
      const finalPath = backupResult.zipPath || backupPath;
      const finalStats = await fs.stat(finalPath);
      const finalFileName = path.basename(finalPath);
      
      const sizeInMB = (finalStats.size / (1024 * 1024)).toFixed(2);
      console.log(`✅ Backup completado: ${finalFileName} (${sizeInMB} MB)`);
      
      logger.info(`Backup de base de datos creado: ${finalFileName}`, {
        size: finalStats.size,
        path: finalPath,
        database: this.config.database,
        type: this.config.type,
        compressed: !!backupResult.zipPath
      });
      
      return {
        success: true,
        filePath: finalPath,
        fileName: finalFileName,
        size: finalStats.size,
        database: this.config.database,
        type: this.config.type,
        timestamp: new Date().toISOString(),
        compressed: !!backupResult.zipPath
      };
    } catch (error) {
      console.error('❌ Error en el backup de base de datos:', error.message);
      logger.error('Error al crear backup de base de datos:', error);
      throw error;
    }
  }

  // Crear backup PostgreSQL usando pg_dump
  async createPostgreSQLBackup(backupPath) {
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        PGPASSWORD: this.config.password
      };

      const args = [
        '-h', this.config.host,
        '-p', this.config.port.toString(),
        '-U', this.config.username,
        '-d', this.config.database,
        '--verbose',
        '--clean',
        '--no-owner',
        '--no-privileges',
        '--format=plain',
        '--file', backupPath
      ];

      const pgDump = spawn('pg_dump', args, { env });
      
      let stderr = '';
      
      pgDump.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pgDump.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output: stderr });
        } else {
          reject(new Error(`pg_dump falló con código ${code}: ${stderr}`));
        }
      });

      pgDump.on('error', (error) => {
        reject(new Error(`Error ejecutando pg_dump: ${error.message}`));
      });
    });
  }

  // Crear backup MySQL usando la herramienta especificada
  async createMySQLBackup(backupPath) {
    // Obtener herramienta especificada desde configuración
    const backupTool = process.env.MYSQL_BACKUP_TOOL || 'mysqldump';
    console.log(`🔧 Usando herramienta de backup MySQL: ${backupTool}`);
    
    // Usar únicamente la herramienta especificada sin fallback
    if (backupTool === 'mysqlsh') {
      console.log('🐚 Ejecutando backup con MySQL Shell...');
      return await this.createMySQLBackupWithShell(backupPath);
    } else if (backupTool === 'mysqldump') {
      console.log('🗃️  Ejecutando backup con mysqldump...');
      return await this.createMySQLBackupWithDump(backupPath);
    } else {
      throw new Error(`Herramienta de backup MySQL no soportada: ${backupTool}`);
    }
  }

  // Crear backup usando mysqldump tradicional
  async createMySQLBackupWithDump(backupPath) {
    return new Promise((resolve, reject) => {
      console.log(`🔗 Conectando a MySQL: ${this.config.host}:${this.config.port}`);
      const args = [
        '-h', this.config.host,
        '-P', this.config.port.toString(),
        '-u', this.config.username,
        `-p${this.config.password}`,
        '--single-transaction',
        '--routines',
        '--triggers',
        '--complete-insert',
        '--extended-insert',
        '--add-drop-table',
        '--add-locks',
        '--disable-keys',
        '--lock-tables=false',
        '--result-file', backupPath,
        this.config.database
      ];

      console.log('⚡ Iniciando proceso mysqldump...');
      const mysqldump = spawn('mysqldump', args);
      
      let stderr = '';
      
      mysqldump.stderr.on('data', (data) => {
        stderr += data.toString();
        // Mostrar progreso si hay mensajes informativos
        const message = data.toString().trim();
        if (message && !message.includes('Warning')) {
          console.log(`📊 mysqldump: ${message}`);
        }
      });

      mysqldump.on('close', async (code) => {
        if (code === 0) {
          try {
            console.log('✅ mysqldump completado, iniciando compresión...');
            // Comprimir el archivo SQL en un ZIP
            const zipPath = await this.compressBackupFile(backupPath);
            console.log('🗜️  Archivo comprimido exitosamente');
            
            console.log('🧹 Limpiando archivo temporal SQL...');
            // Eliminar el archivo SQL original
            await fs.unlink(backupPath);
            
            logger.info(`Backup mysqldump comprimido creado: ${zipPath}`);
            resolve({ success: true, output: stderr, tool: 'mysqldump', zipPath });
          } catch (error) {
            reject(new Error(`Error comprimiendo backup mysqldump: ${error.message}`));
          }
        } else {
          reject(new Error(`mysqldump falló con código ${code}: ${stderr}`));
        }
      });

      mysqldump.on('error', (error) => {
        reject(new Error(`Error ejecutando mysqldump: ${error.message}`));
      });
    });
  }

  // Crear backup usando MySQL Shell con enfoque alternativo
  async createMySQLBackupWithShell(backupPath) {
    return new Promise((resolve, reject) => {
      const connectionUri = `mysql://${this.config.username}:${this.config.password}@${this.config.host}:${this.config.port}/${this.config.database}`;
      
      // Timeout de 30 segundos para evitar que se cuelgue
      const timeout = setTimeout(() => {
        mysqlsh.kill('SIGKILL');
        reject(new Error('MySQL Shell timeout - el proceso se colgó después de 30 segundos'));
      }, 30000);
      
      // Usar un script SQL personalizado que no requiera permisos de sistema
      const sqlScript = `
        -- Backup de base de datos ${this.config.database}
        -- Generado el: ${new Date().toISOString()}
        
        SET FOREIGN_KEY_CHECKS=0;
        SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";
        SET time_zone = "+00:00";
        
        -- Crear base de datos si no existe
        CREATE DATABASE IF NOT EXISTS \`${this.config.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        USE \`${this.config.database}\`;
      `;
      
      const args = [
        '--uri', connectionUri,
        '--sql',
        '--execute', 'SHOW TABLES;'
      ];

      const mysqlsh = spawn('mysqlsh', args);
      
      let stdout = '';
      let stderr = '';
      
      mysqlsh.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      mysqlsh.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      mysqlsh.on('close', async (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          try {
            // Procesar la lista de tablas y crear backup tabla por tabla
            const backupResult = await this.createTableByTableBackup(backupPath, connectionUri, stdout);
            resolve({ success: true, output: stdout, tool: 'mysqlsh', zipPath: backupResult.zipPath });
          } catch (error) {
            reject(new Error(`Error creando backup tabla por tabla: ${error.message}`));
          }
        } else {
          reject(new Error(`MySQL Shell falló con código ${code}: ${stderr}`));
        }
      });

      mysqlsh.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Error ejecutando MySQL Shell: ${error.message}`));
      });
    });
  }

  // Crear backup tabla por tabla usando MySQL Shell
  async createTableByTableBackup(backupPath, connectionUri, tablesOutput) {
    try {
      // Parsear la salida de SHOW TABLES
      const lines = tablesOutput.split('\n');
      const tables = [];
      
      // Extraer nombres de tablas (ignorar headers y líneas vacías)
      for (const line of lines) {
        const trimmed = line.trim();
        // Ignorar líneas vacías, headers y líneas con caracteres especiales
        if (trimmed && 
            !trimmed.includes('Tables_in_') && 
            !trimmed.includes('+') && 
            !trimmed.includes('-') &&
            !trimmed.includes('|') &&
            trimmed.length > 0) {
          tables.push(trimmed);
        }
      }
      
      logger.info(`Encontradas ${tables.length} tablas para backup: ${tables.join(', ')}`);
      console.log(`📋 Procesando ${tables.length} tablas para backup...`);
      
      let sqlContent = `-- Backup de base de datos ${this.config.database}\n`;
      sqlContent += `-- Generado el: ${new Date().toISOString()}\n\n`;
      sqlContent += `SET FOREIGN_KEY_CHECKS=0;\n`;
      sqlContent += `SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";\n`;
      sqlContent += `SET time_zone = "+00:00";\n\n`;
      sqlContent += `CREATE DATABASE IF NOT EXISTS \`${this.config.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n`;
      sqlContent += `USE \`${this.config.database}\`;\n\n`;
      
      console.log('🔄 Iniciando backup tabla por tabla...');
      
      // Crear backup de cada tabla individualmente
      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        const progress = Math.round(((i + 1) / tables.length) * 100);
        
        try {
          console.log(`📊 [${i + 1}/${tables.length}] Procesando tabla: ${table} (${progress}%)`);
          const tableBackup = await this.backupSingleTable(connectionUri, table);
          sqlContent += tableBackup + '\n\n';
          console.log(`✅ [${i + 1}/${tables.length}] Tabla ${table} completada`);
        } catch (error) {
          console.log(`❌ [${i + 1}/${tables.length}] Error en tabla ${table}: ${error.message}`);
          logger.warn(`Error haciendo backup de tabla ${table}: ${error.message}`);
          sqlContent += `-- Error haciendo backup de tabla ${table}: ${error.message}\n\n`;
        }
      }
      
      sqlContent += `SET FOREIGN_KEY_CHECKS=1;\n`;
      
      // Escribir archivo SQL
      await fs.writeFile(backupPath, sqlContent);
      
      logger.info(`Backup completado: ${backupPath}`);
      
      // Comprimir el archivo SQL en un ZIP
      const zipPath = await this.compressBackupFile(backupPath);
      
      // Eliminar el archivo SQL original
      await fs.unlink(backupPath);
      
      logger.info(`Backup comprimido creado: ${zipPath}`);
      
      return { zipPath };
      
    } catch (error) {
      throw new Error(`Error creando backup tabla por tabla: ${error.message}`);
    }
  }
  
  // Comprimir archivo de backup en ZIP
  async compressBackupFile(sqlFilePath) {
    return new Promise((resolve, reject) => {
      const zipPath = sqlFilePath.replace('.sql', '.zip');
      console.log(`🗜️  Iniciando compresión: ${path.basename(sqlFilePath)} -> ${path.basename(zipPath)}`);
      
      const output = fsSync.createWriteStream(zipPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Máximo nivel de compresión
      });
      
      output.on('close', () => {
        const compressedSizeKB = (archive.pointer() / 1024).toFixed(2);
        console.log(`✅ Compresión completada: ${compressedSizeKB} KB`);
        logger.info(`Archivo comprimido: ${archive.pointer()} bytes`);
        resolve(zipPath);
      });
      
      output.on('error', (err) => {
        console.error(`❌ Error creando archivo ZIP: ${err.message}`);
        reject(new Error(`Error creando archivo ZIP: ${err.message}`));
      });
      
      archive.on('error', (err) => {
        console.error(`❌ Error en archiver: ${err.message}`);
        reject(new Error(`Error en archiver: ${err.message}`));
      });
      
      archive.on('progress', (progress) => {
        if (progress.entries && progress.entries.processed > 0) {
          console.log(`📊 Progreso compresión: ${progress.entries.processed}/${progress.entries.total} archivos`);
        }
      });
      
      archive.pipe(output);
      
      // Agregar el archivo SQL al ZIP
      const fileName = path.basename(sqlFilePath);
      archive.file(sqlFilePath, { name: fileName });
      
      archive.finalize();
    });
  }
  
  // Hacer backup de una sola tabla
  async backupSingleTable(connectionUri, tableName) {
    return new Promise((resolve, reject) => {
      const args = [
        '--uri', connectionUri,
        '--sql',
        '--execute', `SHOW CREATE TABLE \`${tableName}\`;`
      ];

      const mysqlsh = spawn('mysqlsh', args);
      
      let stdout = '';
      let stderr = '';
      
      mysqlsh.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      mysqlsh.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      mysqlsh.on('close', async (code) => {
        if (code === 0) {
          try {
            // Extraer CREATE TABLE statement
            let createStatement = this.extractCreateStatement(stdout, tableName);
            
            // Obtener datos de la tabla
            const tableData = await this.getTableData(connectionUri, tableName);
            
            let result = `-- Estructura de tabla para ${tableName}\n`;
            result += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
            result += createStatement + ';\n\n';
            
            if (tableData) {
              result += `-- Datos de tabla para ${tableName}\n`;
              result += tableData;
            }
            
            resolve(result);
          } catch (error) {
            reject(new Error(`Error procesando tabla ${tableName}: ${error.message}`));
          }
        } else {
          reject(new Error(`Error obteniendo estructura de tabla ${tableName}: ${stderr}`));
        }
      });

      mysqlsh.on('error', (error) => {
        reject(new Error(`Error ejecutando comando para tabla ${tableName}: ${error.message}`));
      });
    });
  }
  
  // Extraer CREATE TABLE statement del output
  extractCreateStatement(output, tableName) {
    const lines = output.split('\n');
    let createStatement = '';
    let capturing = false;
    
    for (const line of lines) {
      if (line.includes('CREATE TABLE')) {
        capturing = true;
      }
      if (capturing && line.trim()) {
        const cleanLine = line.replace(/^\|\s*/, '').replace(/\s*\|$/, '').trim();
        if (cleanLine && !cleanLine.includes('Create Table')) {
          createStatement += cleanLine + ' ';
        }
      }
    }
    
    return createStatement.trim();
  }
  
  // Obtener datos de una tabla
  async getTableData(connectionUri, tableName) {
    return new Promise((resolve, reject) => {
      // Primero obtener la estructura de columnas
      const describeArgs = [
        '--uri', connectionUri,
        '--sql',
        '--execute', `DESCRIBE \`${tableName}\`;`
      ];

      const describeProcess = spawn('mysqlsh', describeArgs);
      let describeOutput = '';
      
      describeProcess.stdout.on('data', (data) => {
        describeOutput += data.toString();
      });
      
      describeProcess.on('close', (describeCode) => {
        if (describeCode === 0) {
          // Obtener los datos de la tabla
          const selectArgs = [
            '--uri', connectionUri,
            '--sql',
            '--execute', `SELECT * FROM \`${tableName}\` LIMIT 1000;`
          ];

          const selectProcess = spawn('mysqlsh', selectArgs);
          let selectOutput = '';
          
          selectProcess.stdout.on('data', (data) => {
            selectOutput += data.toString();
          });
          
          selectProcess.on('close', (selectCode) => {
            if (selectCode === 0) {
              try {
                const insertStatements = this.parseDataToInserts(selectOutput, tableName);
                resolve(insertStatements);
              } catch (error) {
                resolve(`-- Error procesando datos de ${tableName}: ${error.message}\n`);
              }
            } else {
              resolve(`-- No se pudieron obtener datos de ${tableName}\n`);
            }
          });

          selectProcess.on('error', (error) => {
            resolve(`-- Error obteniendo datos de ${tableName}: ${error.message}\n`);
          });
        } else {
          resolve(`-- No se pudo obtener estructura de ${tableName}\n`);
        }
      });

      describeProcess.on('error', (error) => {
        resolve(`-- Error obteniendo estructura de ${tableName}: ${error.message}\n`);
      });
    });
  }

  // Obtener información de la base de datos
  async getDatabaseInfo() {
    try {
      if (this.config.type === 'postgresql') {
        return await this.getPostgreSQLInfo();
      } else if (this.config.type === 'mysql') {
        return await this.getMySQLInfo();
      } else {
        throw new Error(`Tipo de base de datos no soportado: ${this.config.type}`);
      }
    } catch (error) {
      logger.error('Error al obtener información de base de datos:', error);
      throw error;
    }
  }

  // Obtener información PostgreSQL
  async getPostgreSQLInfo() {
    const client = new pg.Client({
      host: this.config.host,
      port: this.config.port,
      user: this.config.username,
      password: this.config.password,
      database: this.config.database
    });

    try {
      await client.connect();
      
      // Obtener versión
      const versionResult = await client.query('SELECT version()');
      
      // Obtener tamaño de base de datos
      const sizeResult = await client.query(
        'SELECT pg_size_pretty(pg_database_size($1)) as size',
        [this.config.database]
      );
      
      // Obtener número de tablas
      const tablesResult = await client.query(
        "SELECT count(*) as table_count FROM information_schema.tables WHERE table_schema = 'public'"
      );
      
      await client.end();
      
      return {
        type: 'postgresql',
        version: versionResult.rows[0].version,
        size: sizeResult.rows[0].size,
        tableCount: parseInt(tablesResult.rows[0].table_count),
        database: this.config.database,
        host: this.config.host,
        port: this.config.port
      };
    } catch (error) {
      await client.end();
      throw error;
    }
  }

  // Obtener información MySQL
  async getMySQLInfo() {
    const connection = await mysql.createConnection({
      host: this.config.host,
      port: this.config.port,
      user: this.config.username,
      password: this.config.password,
      database: this.config.database
    });

    try {
      // Obtener versión
      const [versionRows] = await connection.execute('SELECT VERSION() as version');
      
      // Obtener tamaño de base de datos
      const [sizeRows] = await connection.execute(
        'SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 1) AS size_mb FROM information_schema.tables WHERE table_schema = ?',
        [this.config.database]
      );
      
      // Obtener número de tablas
      const [tablesRows] = await connection.execute(
        'SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = ?',
        [this.config.database]
      );
      
      await connection.end();
      
      return {
        type: 'mysql',
        version: versionRows[0].version,
        size: `${sizeRows[0].size_mb} MB`,
        tableCount: parseInt(tablesRows[0].table_count),
        database: this.config.database,
        host: this.config.host,
        port: this.config.port
      };
    } catch (error) {
      await connection.end();
      throw error;
    }
  }

  // Verificar herramientas de backup
  async checkBackupTools() {
    const tools = {
      postgresql: { command: 'pg_dump', available: false },
      mysql: { 
        mysqldump: false,
        mysqlsh: false,
        available: false
      }
    };

    // Verificar pg_dump
    try {
      await this.executeCommand('pg_dump', ['--version']);
      tools.postgresql.available = true;
    } catch (error) {
      logger.warn('pg_dump no disponible:', error.message);
    }

    // Verificar mysqldump
    try {
      await this.executeCommand('mysqldump', ['--version']);
      tools.mysql.mysqldump = true;
      tools.mysql.available = true;
    } catch (error) {
      logger.warn('mysqldump no disponible:', error.message);
    }

    // Verificar MySQL Shell
    try {
      await this.executeCommand('mysqlsh', ['--version']);
      tools.mysql.mysqlsh = true;
      tools.mysql.available = true;
    } catch (error) {
      logger.warn('MySQL Shell no disponible:', error.message);
    }

    return tools;
  }

  // Ejecutar comando del sistema
  async executeCommand(command, args) {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args);
      
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Comando falló con código ${code}: ${stderr}`));
        }
      });
      
      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  // Limpiar archivos temporales de backup
  async cleanTempFiles(olderThanHours = 24) {
    try {
      const tempDir = path.join(__dirname, '../../temp');
      const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
      
      const files = await fs.readdir(tempDir);
      let deletedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
          deletedCount++;
          logger.info(`Archivo temporal eliminado: ${file}`);
        }
      }
      
      logger.info(`Limpieza de archivos temporales completada: ${deletedCount} archivos eliminados`);
      return deletedCount;
    } catch (error) {
      logger.error('Error al limpiar archivos temporales:', error);
      throw error;
    }
  }
}

// Crear instancia singleton
const databaseService = new DatabaseService();

export { databaseService };
export default databaseService;