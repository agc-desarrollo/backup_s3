import fetch from 'node-fetch';
import AdmZip from 'adm-zip';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// Configuración del servidor desde variables de entorno
const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;
const API_BASE = `${BASE_URL}/api`;

// Token de autenticación para API desde variables de entorno
const API_TOKEN = process.env.API_TOKEN;



// Clase para probar backup de base de datos
class DatabaseBackupTester {
  constructor() {
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  // Método para realizar peticiones HTTP con timeout de 10 segundos
  async makeRequest(method, endpoint, data = null, headers = {}, returnBuffer = false) {
    // Agregar delay entre peticiones
    await new Promise(resolve => setTimeout(resolve, 100));

    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Database-Backup-Tester/1.0',
        'api-token': API_TOKEN,
        ...headers
      }
    };

    if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
      options.body = JSON.stringify(data);
    }

    try {
      // Crear una promesa de timeout de 5 minutos
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Request timeout after 5 minutes'));
        }, 300000);
      });

      // Ejecutar la petición con timeout
      const response = await Promise.race([
        fetch(url, options),
        timeoutPromise
      ]);

      let responseData = null;
      
      if (returnBuffer) {
        responseData = await response.buffer();
      } else {
        responseData = await response.json().catch(() => null);
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: responseData,
        ok: response.ok,
        buffer: returnBuffer ? responseData : null
      };
    } catch (error) {
      return {
        status: 0,
        statusText: error.message.includes('timeout') ? 'Request Timeout' : 'Network Error',
        headers: {},
        data: null,
        ok: false,
        error: error.message
      };
    }
  }

  // Método para registrar resultados de pruebas
  logTest(name, passed, details = {}) {
    this.results.total++;
    if (passed) {
      this.results.passed++;
    } else {
      this.results.failed++;
    }

    this.results.tests.push({
      name,
      passed,
      timestamp: new Date().toISOString(),
      ...details
    });

    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} - ${name}`);
    if (details.message) {
      console.log(`   ${details.message}`);
    }
    if (!passed && details.error) {
      console.log(`   Error: ${details.error}`);
    }
    if (details.response) {
      console.log(`   Response: ${JSON.stringify(details.response, null, 2)}`);
    }
  }

  // Verificar autenticación con API token
  async authenticate() {
    console.log('🔐 Verificando autenticación con API token...');
    const healthResponse = await this.makeRequest('GET', '/health');

    if (!healthResponse.ok) {
      throw new Error(`Error de autenticación: ${healthResponse.statusText}`);
    }

    console.log('✅ Autenticación exitosa');
    return true;
  }

  // Prueba específica de backup de base de datos
  async testDatabaseBackup() {
    console.log('\n💾 PRUEBA DE BACKUP DE BASE DE DATOS');
    console.log('='.repeat(50));

    // 1. Verificar estado del servicio de backup
    const statusResponse = await this.makeRequest('GET', '/backup/status');
    this.logTest(
      'Verificar estado del servicio de backup',
      statusResponse.ok && statusResponse.data?.success,
      {
        message: `Status: ${statusResponse.status}`,
        error: !statusResponse.ok ? statusResponse.statusText : null,
        response: statusResponse.data
      }
    );

    // 2. Probar backup de base de datos
    console.log('\n🚀 Probando backup de base de datos...');
    const backupResponse = await this.makeRequest('POST', '/backup/database');

    this.logTest(
      'Ejecutar backup de base de datos',
      backupResponse.ok && backupResponse.data?.success,
      {
        message: `Status: ${backupResponse.status}, Message: ${backupResponse.data?.message || 'Sin mensaje'}`,
        error: !backupResponse.ok ? `${backupResponse.statusText} - ${backupResponse.data?.message || 'Sin detalles'}` : null,
        response: backupResponse.data
      }
    );

    // 3. Si el backup fue exitoso, verificar que el archivo existe en S3
    if (backupResponse.ok && backupResponse.data?.success && backupResponse.data?.result?.s3Upload?.s3Key) {
      console.log('\n🔍 Verificando existencia del archivo en S3...');
      const s3Key = backupResponse.data.result.s3Upload.s3Key;
      const s3CheckResponse = await this.makeRequest('GET', `/s3/objects/${encodeURIComponent(s3Key)}/details`);
      
      this.logTest(
        'Verificar existencia del archivo en S3',
        s3CheckResponse.ok && s3CheckResponse.data?.success,
        {
          message: s3CheckResponse.ok ? 
            `Archivo encontrado en S3: ${s3Key} (${s3CheckResponse.data?.object?.sizeFormatted || 'tamaño desconocido'})` : 
            `Archivo no encontrado en S3: ${s3Key}`,
          error: !s3CheckResponse.ok ? s3CheckResponse.statusText : null,
          response: s3CheckResponse.data
        }
      );

      // 5.1. Verificar que el backup contiene datos de las tablas
      if (s3CheckResponse.ok && s3CheckResponse.data?.success) {
        await this.verifyBackupContainsTableData(s3Key);
      }
    }

    // 4. Si el backup falló, mostrar detalles del error
    if (!backupResponse.ok) {
      console.log('\n❌ DETALLES DEL ERROR:');
      console.log('Status:', backupResponse.status);
      console.log('Status Text:', backupResponse.statusText);
      console.log('Response Data:', JSON.stringify(backupResponse.data, null, 2));

      // Esperar un poco y verificar logs de error
      await new Promise(resolve => setTimeout(resolve, 2000));

      const errorLogsResponse = await this.makeRequest('GET', '/logs/errors?days=1');
      if (errorLogsResponse.ok && errorLogsResponse.data?.logs) {
        console.log('\n📋 LOGS DE ERROR RECIENTES:');
        errorLogsResponse.data.logs.slice(0, 3).forEach((log, index) => {
          console.log(`${index + 1}. [${log.timestamp}] ${log.level}: ${log.message}`);
          if (log.meta && log.meta.stack) {
            console.log(`   Stack: ${log.meta.stack.split('\n')[0]}`);
          }
        });
      }
    }

    // 4. Verificar historial de backups
    const historyResponse = await this.makeRequest('GET', '/backup/history?page=1&limit=5');
    this.logTest(
      'Verificar historial de backups',
      historyResponse.ok && historyResponse.data?.success,
      {
        message: `Backups en historial: ${historyResponse.data?.backups?.length || 0}`,
        error: !historyResponse.ok ? historyResponse.statusText : null
      }
    );

    // 5. Verificar estadísticas de backup
    const statsResponse = await this.makeRequest('GET', '/backup/stats');
    this.logTest(
      'Verificar estadísticas de backup',
      statsResponse.ok && statsResponse.data?.success,
      {
        message: `Status: ${statsResponse.status}`,
        error: !statsResponse.ok ? statsResponse.statusText : null,
        response: statsResponse.data?.stats
      }
    );
  }

  // Verificar que el backup contiene datos de las tablas
  async verifyBackupContainsTableData(s3Key) {
    try {
      console.log(`\n🔍 Descargando backup para verificar contenido: ${s3Key}`);
      
      // Descargar el archivo de backup desde el backend
      const downloadResponse = await this.makeRequest('GET', `/s3/objects/${encodeURIComponent(s3Key)}/download`, null, {}, true);
      if (!downloadResponse.ok) {
        throw new Error(`Error descargando backup: ${downloadResponse.statusText}`);
      }

      // Obtener el contenido como buffer
      const buffer = downloadResponse.buffer;
      console.log(`📦 Archivo descargado: ${buffer.length} bytes`);

      // Verificar si es un archivo ZIP (los backups se comprimen)
      const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B;
      
      if (isZip) {
        // Para archivos ZIP, extraer y verificar contenido
        try {
          const zip = new AdmZip(buffer);
          const zipEntries = zip.getEntries();
          
          console.log(`📁 Archivos en ZIP: ${zipEntries.length}`);
          
          if (zipEntries.length === 0) {
            throw new Error('El archivo ZIP está vacío');
          }
          
          // Mostrar todos los archivos en el ZIP
          console.log('📋 Contenido del ZIP:');
          zipEntries.forEach((entry, index) => {
            console.log(`   ${index + 1}. ${entry.entryName} (${entry.header.size} bytes)`);
          });
          
          // Buscar archivos SQL en el ZIP
          const sqlFiles = zipEntries.filter(entry => entry.entryName.endsWith('.sql'));
          
          if (sqlFiles.length === 0) {
            // Si no hay archivos .sql, verificar si hay otros archivos de texto
            const textFiles = zipEntries.filter(entry => 
              entry.entryName.endsWith('.txt') || 
              entry.entryName.endsWith('.dump') ||
              !entry.entryName.includes('.') || // archivos sin extensión
              entry.entryName.toLowerCase().includes('backup')
            );
            
            if (textFiles.length > 0) {
              console.log(`📄 Archivos de texto encontrados: ${textFiles.length}`);
              // Usar el primer archivo de texto como backup
              const backupContent = textFiles[0].getData().toString('utf8');
              console.log(`📄 Contenido del backup: ${textFiles[0].entryName} (${backupContent.length} caracteres)`);
              
              // Verificar si contiene comandos de base de datos
              const hasCreateStatements = backupContent.includes('CREATE TABLE') || backupContent.includes('CREATE DATABASE');
              const hasInsertStatements = backupContent.includes('INSERT INTO') || backupContent.includes('COPY ');
              const hasData = backupContent.includes('VALUES') || backupContent.includes('COPY ') || backupContent.length > 1000;
              
              this.logTest(
                'Verificar que el backup contiene datos (archivo de texto extraído)',
                hasCreateStatements || hasData,
                {
                  message: `Archivo: ${textFiles[0].entryName} (${backupContent.length} caracteres)`,
                  details: {
                    'Archivos en ZIP': zipEntries.length,
                    'Archivos de texto': textFiles.length,
                    'Contiene CREATE': hasCreateStatements,
                    'Contiene INSERT/COPY': hasInsertStatements,
                    'Tiene contenido': hasData,
                    'Muestra del contenido': backupContent.substring(0, 300) + (backupContent.length > 300 ? '...' : '')
                  }
                }
              );
              return;
            }
            
            throw new Error('No se encontraron archivos SQL ni de texto en el backup ZIP');
          }
          
          // Verificar contenido del primer archivo SQL
          const sqlContent = sqlFiles[0].getData().toString('utf8');
          console.log(`📄 Archivo SQL encontrado: ${sqlFiles[0].entryName} (${sqlContent.length} caracteres)`);
          
          // Mostrar una muestra del contenido para debug
          const contentPreview = sqlContent.substring(0, 500);
          console.log(`📋 Muestra del contenido SQL:`);
          console.log(contentPreview);
          console.log(sqlContent.length > 500 ? '...(contenido truncado)' : '(contenido completo)');
          
          // Buscar patrones que indiquen contenido de tablas
          const hasInsertStatements = sqlContent.includes('INSERT INTO') || sqlContent.includes('COPY ');
          const hasCreateStatements = sqlContent.includes('CREATE TABLE');
          const hasData = sqlContent.includes('VALUES') || sqlContent.includes('COPY ') || sqlContent.length > 10000;
          
          this.logTest(
            'Verificar que el backup contiene datos (archivo ZIP extraído)',
            hasCreateStatements && hasData,
            {
              message: `Archivo SQL: ${sqlFiles[0].entryName} (${sqlContent.length} caracteres)`,
              details: {
                'Archivos en ZIP': zipEntries.length,
                'Archivos SQL': sqlFiles.length,
                'Contiene CREATE TABLE': hasCreateStatements,
                'Contiene INSERT INTO o COPY': hasInsertStatements,
                'Tiene datos suficientes': hasData,
                'Muestra del contenido': sqlContent.substring(0, 500) + (sqlContent.length > 500 ? '...' : '')
              }
            }
          );
          
        } catch (zipError) {
          this.logTest(
            'Verificar contenido del archivo ZIP',
            false,
            {
              error: `Error procesando archivo ZIP: ${zipError.message}`,
              message: `Tamaño del archivo ZIP: ${buffer.length} bytes`
            }
          );
        }
      } else {
        // Para archivos SQL sin comprimir, buscar patrones que indiquen datos
        const content = buffer.toString('utf8', 0, Math.min(buffer.length, 10000)); // Leer primeros 10KB
        
        // Buscar patrones que indiquen que hay datos de tablas
        const hasInsertStatements = content.includes('INSERT INTO') || content.includes('COPY ');
        const hasCreateStatements = content.includes('CREATE TABLE');
        const hasData = content.length > 1000 && (hasInsertStatements || hasCreateStatements);
        
        this.logTest(
          'Verificar que el backup contiene datos de las tablas',
          hasData,
          {
            message: `Tamaño del contenido: ${content.length} caracteres`,
            details: {
              'Contiene CREATE TABLE': hasCreateStatements,
              'Contiene INSERT INTO o COPY': hasInsertStatements,
              'Muestra del contenido': content.substring(0, 500) + (content.length > 500 ? '...' : '')
            }
          }
        );
      }
      
    } catch (error) {
      this.logTest(
        'Verificar contenido del backup',
        false,
        {
          error: error.message
        }
      );
    }
  }

  // Ejecutar todas las pruebas de backup de base de datos
  async runDatabaseBackupTests() {
    console.log('🚀 INICIANDO PRUEBAS DE BACKUP DE BASE DE DATOS');
    console.log('='.repeat(60));
    console.log(`Servidor: ${BASE_URL}`);
    console.log(`Fecha: ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    const startTime = Date.now();

    try {
      // Autenticarse primero
      await this.authenticate();

      // Ejecutar pruebas de backup de base de datos
      await this.testDatabaseBackup();

    } catch (error) {
      console.error('\n❌ Error durante las pruebas:', error.message);
      this.logTest(
        'Error general en pruebas',
        false,
        {
          error: error.message
        }
      );
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    // Generar reporte final
    this.generateReport(duration);
  }

  // Generar reporte de resultados
  generateReport(duration) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 REPORTE DE RESULTADOS - BACKUP DE BASE DE DATOS');
    console.log('='.repeat(60));
    console.log(`Total de pruebas: ${this.results.total}`);
    console.log(`✅ Exitosas: ${this.results.passed}`);
    console.log(`❌ Fallidas: ${this.results.failed}`);
    console.log(`⏱️  Duración: ${duration.toFixed(2)} segundos`);
    console.log(`📈 Tasa de éxito: ${this.results.total > 0 ? ((this.results.passed / this.results.total) * 100).toFixed(1) : 0}%`);

    if (this.results.failed > 0) {
      console.log('\n❌ PRUEBAS FALLIDAS:');
      this.results.tests
        .filter(test => !test.passed)
        .forEach(test => {
          console.log(`   - ${test.name}`);
          if (test.error) {
            console.log(`     Error: ${test.error}`);
          }
        });
    }

    console.log('\n' + '='.repeat(60));
    console.log('✨ PRUEBAS DE BACKUP DE BASE DE DATOS COMPLETADAS');
    console.log('='.repeat(60));

    // Retornar si todas las pruebas pasaron
    return this.results.failed === 0;
  }
}

// Función principal
async function main() {
  const tester = new DatabaseBackupTester();

  try {
    const success = await tester.runDatabaseBackupTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Error fatal:', error);
    process.exit(1);
  }
}

// Verificar si el servidor está ejecutándose
async function checkServer() {
  try {
    const response = await fetch(BASE_URL);
    return response.status !== 0;
  } catch (error) {
    return false;
  }
}

// Ejecutar pruebas
console.log('🔍 Verificando servidor...');

checkServer().then(isRunning => {
  if (!isRunning) {
    console.error('❌ El servidor no está ejecutándose en', BASE_URL);
    console.log('💡 Asegúrate de ejecutar: npm start');
    process.exit(1);
  }

  console.log('✅ Servidor detectado, iniciando pruebas de backup de base de datos...');
  main();
}).catch(error => {
  console.error('❌ Error al verificar servidor:', error.message);
  process.exit(1);
});

export default DatabaseBackupTester;