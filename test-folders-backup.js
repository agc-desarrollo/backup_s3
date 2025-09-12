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



// Clase para probar backup de carpetas
class FoldersBackupTester {
  constructor() {
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  // Método para realizar peticiones HTTP con timeout de 5 minutos
  async makeRequest(method, endpoint, data = null, headers = {}, returnBuffer = false) {
    // Agregar delay entre peticiones
    await new Promise(resolve => setTimeout(resolve, 100));

    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Folders-Backup-Tester/1.0',
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

  // Verificar configuración de carpetas para backup
  async verifyFoldersConfiguration() {
    console.log('\n📁 Verificando configuración de carpetas...');
    const configResponse = await this.makeRequest('GET', '/backup/status');
    
    this.logTest(
      'Verificar configuración de carpetas',
      configResponse.ok && configResponse.data?.success,
      {
        message: `Status: ${configResponse.status}`,
        error: !configResponse.ok ? configResponse.statusText : null,
        response: configResponse.data
      }
    );

    return configResponse.ok && configResponse.data?.success;
  }

  // Prueba específica de backup de carpetas
  async testFoldersBackup() {
    console.log('\n📁 PRUEBA DE BACKUP DE CARPETAS');
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

    // 2. Intentar backup manual de carpetas
    console.log('\n🚀 Iniciando backup manual de carpetas...');
    const backupResponse = await this.makeRequest('POST', '/backup/now', { type: 'folders' });

    this.logTest(
      'Ejecutar backup manual de carpetas',
      backupResponse.ok && backupResponse.data?.success,
      {
        message: `Status: ${backupResponse.status}, Message: ${backupResponse.data?.message || 'Sin mensaje'}`,
        error: !backupResponse.ok ? `${backupResponse.statusText} - ${backupResponse.data?.message || 'Sin detalles'}` : null,
        response: backupResponse.data
      }
    );

    // 3. Si el backup fue exitoso, verificar que los archivos existen en S3
    if (backupResponse.ok && backupResponse.data?.success && backupResponse.data?.result?.s3Upload) {
      console.log('\n🔍 Verificando existencia de archivos en S3...');
      
      // 3.1. Verificar archivo ZIP
      if (backupResponse.data.result.s3Upload.zip?.key) {
        const zipKey = backupResponse.data.result.s3Upload.zip.key;
        const zipCheckResponse = await this.makeRequest('GET', `/s3/objects/${encodeURIComponent(zipKey)}/details`);
        
        this.logTest(
          'Verificar existencia del archivo ZIP en S3',
          zipCheckResponse.ok && zipCheckResponse.data?.success,
          {
            message: zipCheckResponse.ok ? 
              `Archivo ZIP encontrado en S3: ${zipKey} (${zipCheckResponse.data?.object?.sizeFormatted || 'tamaño desconocido'})` : 
              `Archivo ZIP no encontrado en S3: ${zipKey}`,
            error: !zipCheckResponse.ok ? zipCheckResponse.statusText : null,
            response: zipCheckResponse.data
          }
        );

        // Verificar que el backup contiene archivos de las carpetas
        if (zipCheckResponse.ok && zipCheckResponse.data?.success) {
          await this.verifyBackupContainsFolderData(zipKey);
        }
      }
      
      // 3.2. Verificar archivo TXT de detalle
      if (backupResponse.data.result.s3Upload.detail?.key) {
        const detailKey = backupResponse.data.result.s3Upload.detail.key;
        const detailCheckResponse = await this.makeRequest('GET', `/s3/objects/${encodeURIComponent(detailKey)}/details`);
        
        this.logTest(
          'Verificar existencia del archivo TXT de detalle en S3',
          detailCheckResponse.ok && detailCheckResponse.data?.success,
          {
            message: detailCheckResponse.ok ? 
              `Archivo TXT encontrado en S3: ${detailKey} (${detailCheckResponse.data?.object?.sizeFormatted || 'tamaño desconocido'})` : 
              `Archivo TXT no encontrado en S3: ${detailKey}`,
            error: !detailCheckResponse.ok ? detailCheckResponse.statusText : null,
            response: detailCheckResponse.data
          }
        );
        
        // Verificar contenido del archivo TXT de detalle
        if (detailCheckResponse.ok && detailCheckResponse.data?.success) {
          await this.verifyDetailFileContent(detailKey);
        }
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

    // 5. Verificar historial de backups
    const historyResponse = await this.makeRequest('GET', '/backup/history?page=1&limit=5');
    this.logTest(
      'Verificar historial de backups',
      historyResponse.ok && historyResponse.data?.success,
      {
        message: `Backups en historial: ${historyResponse.data?.backups?.length || 0}`,
        error: !historyResponse.ok ? historyResponse.statusText : null
      }
    );

    // 6. Verificar estadísticas de backup
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
    
    // Retornar la respuesta del backup para poder acceder a la ruta del archivo
    return backupResponse;
  }

  // Verificar contenido del archivo TXT de detalle
  async verifyDetailFileContent(detailKey) {
    try {
      console.log(`\n📄 Descargando archivo de detalle para verificar contenido: ${detailKey}`);
      
      // Descargar el archivo de detalle desde el backend
      const downloadResponse = await this.makeRequest('GET', `/s3/objects/${encodeURIComponent(detailKey)}/download`, null, {}, true);
      if (!downloadResponse.ok) {
        throw new Error(`Error descargando archivo de detalle: ${downloadResponse.statusText}`);
      }

      // Obtener el contenido como texto
      const buffer = downloadResponse.buffer;
      const content = buffer.toString('utf-8');
      console.log(`📄 Archivo de detalle descargado: ${buffer.length} bytes`);

      // Verificar que el archivo contiene información esperada
      const hasHeader = content.includes('DETALLE DEL BACKUP DE CARPETAS');
      const hasTimestamp = content.includes('Fecha y hora:');
      const hasSummary = content.includes('RESUMEN GENERAL');
      const hasFolderDetails = content.includes('DETALLE POR CARPETA');
      const hasFileCount = content.includes('Total de archivos:');
      const hasTotalSize = content.includes('Tamaño total:');
      
      const isValidDetailFile = hasHeader && hasTimestamp && hasSummary && hasFolderDetails && hasFileCount && hasTotalSize;
      
      this.logTest(
        'Verificar contenido del archivo TXT de detalle',
        isValidDetailFile,
        {
          message: isValidDetailFile ? 
            `Archivo de detalle válido con ${content.length} caracteres` : 
            'El archivo de detalle no contiene la información esperada',
          details: {
            'Tamaño del archivo': `${buffer.length} bytes`,
            'Caracteres de texto': content.length,
            'Tiene encabezado': hasHeader,
            'Tiene timestamp': hasTimestamp,
            'Tiene resumen': hasSummary,
            'Tiene detalle de carpetas': hasFolderDetails,
            'Tiene conteo de archivos': hasFileCount,
            'Tiene tamaño total': hasTotalSize,
            'Muestra del contenido': content.substring(0, 200) + (content.length > 200 ? '...' : '')
          }
        }
      );
      
    } catch (error) {
      this.logTest(
        'Verificar contenido del archivo TXT de detalle',
        false,
        {
          error: error.message
        }
      );
    }
  }

  // Verificar que el backup contiene archivos de las carpetas
  async verifyBackupContainsFolderData(s3Key) {
    let tempFilePath = null;
    
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

      // Guardar temporalmente el archivo para limpieza posterior
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');
      
      tempFilePath = path.join(os.tmpdir(), `backup_test_${Date.now()}.zip`);
      await fs.writeFile(tempFilePath, buffer);

      // Verificar si es un archivo ZIP (los backups de carpetas se comprimen)
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
          
          // Verificar que hay archivos de carpetas
          const hasDirectories = zipEntries.some(entry => entry.isDirectory);
          const hasFiles = zipEntries.some(entry => !entry.isDirectory && entry.header.size > 0);
          const totalSize = zipEntries.reduce((sum, entry) => sum + entry.header.size, 0);
          
          this.logTest(
            'Verificar que el backup contiene archivos de carpetas',
            hasFiles && totalSize > 0,
            {
              message: `ZIP con ${zipEntries.length} entradas (${totalSize} bytes total)`,
              details: {
                'Archivos en ZIP': zipEntries.length,
                'Contiene directorios': hasDirectories,
                'Contiene archivos': hasFiles,
                'Tamaño total': totalSize,
                'Muestra de archivos': zipEntries.slice(0, 5).map(entry => `${entry.entryName} (${entry.header.size} bytes)`)
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
        // Para archivos sin comprimir, verificar que no esté vacío
        const hasContent = buffer.length > 100; // Al menos 100 bytes
        
        this.logTest(
          'Verificar que el backup contiene datos de carpetas',
          hasContent,
          {
            message: `Tamaño del archivo: ${buffer.length} bytes`,
            details: {
              'Tamaño del archivo': buffer.length,
              'Tiene contenido': hasContent
            }
          }
        );
      }
      
    } catch (error) {
      this.logTest(
        'Verificar contenido del backup de carpetas',
        false,
        {
          error: error.message
        }
      );
    } finally {
      // Limpiar archivo temporal
      if (tempFilePath) {
        await this.cleanupDownloadedFile(tempFilePath);
      }
    }
  }

  // Verificar que el backup se subió correctamente a S3
  async verifyBackupUploadedToS3(backupResult) {
    try {
      // Verificar si el resultado incluye información de S3
      if (backupResult && backupResult.s3Upload) {
        this.logTest(
          'Verificar subida a S3',
          true,
          {
            message: `Backup subido exitosamente a S3`,
            details: {
              s3Key: backupResult.s3Upload.key,
              bucket: backupResult.s3Upload.bucket,
              size: backupResult.s3Upload.size
            }
          }
        );
        return true;
      }
      
      // Si no hay información de S3, intentar verificar a través de la API
      const response = await this.makeRequest('GET', '/s3/objects?prefix=backups/');
      
      if (response.ok && response.data?.success) {
        const objects = response.data.objects || [];
        const folderBackups = objects.filter(obj => 
          obj.key && obj.key.includes('carpetas ') && 
          obj.lastModified && new Date(obj.lastModified) > new Date(Date.now() - 5 * 60 * 1000) // Últimos 5 minutos
        );
        
        if (folderBackups.length > 0) {
          this.logTest(
            'Verificar backup reciente en S3',
            true,
            {
              message: `Encontrados ${folderBackups.length} backups recientes`,
              details: {
                backupsEncontrados: folderBackups.length,
                ultimoBackup: folderBackups[0].key
              }
            }
          );
          return true;
        } else {
          this.logTest(
            'Verificar backup reciente en S3',
            false,
            {
              message: 'No se encontraron backups recientes en S3',
              details: {
                totalObjects: objects.length,
                nota: 'El backup se ejecutó localmente pero no se subió a S3'
              }
            }
          );
          return false;
        }
      } else {
        this.logTest(
          'Verificar objetos en S3',
          false,
          {
            error: `Error al consultar S3: ${response.statusText}`,
            details: {
              status: response.status,
              error: response.data?.error || 'Error desconocido'
            }
          }
        );
        return false;
      }
    } catch (error) {
      this.logTest(
        'Verificar subida a S3',
        false,
        {
          error: error.message
        }
      );
      return false;
    }
  }

  // Verificar que existen carpetas en S3 con prefijo 'folders'
  async verifyFoldersInS3() {
    console.log('\n🗂️ Verificando carpetas de backup en S3...');
    
    // Buscar objetos con prefijo 'backups' y filtrar por carpetas
    const foldersResponse = await this.makeRequest('GET', '/s3/objects?prefix=backups/');
    
    // Filtrar solo archivos de carpetas
    const folderBackups = foldersResponse.data?.objects?.filter(obj => 
      obj.key && obj.key.includes('carpetas ')
    ) || [];
    
    this.logTest(
      'Verificar existencia de backups de carpetas en S3',
      foldersResponse.ok && foldersResponse.data?.success && folderBackups.length > 0,
      {
        message: `Backups de carpetas encontrados: ${folderBackups.length}`,
        error: !foldersResponse.ok ? foldersResponse.statusText : null,
        response: foldersResponse.data
      }
    );

    // Si hay backups, mostrar información del más reciente
    if (foldersResponse.ok && folderBackups.length > 0) {
      const latestBackup = folderBackups[0]; // Asumiendo que están ordenados por fecha
      console.log(`📁 Backup más reciente: ${latestBackup.key} (${latestBackup.sizeFormatted})`);
      
      // Verificar detalles del backup más reciente
      const detailsResponse = await this.makeRequest('GET', `/s3/objects/${encodeURIComponent(latestBackup.key)}/details`);
      
      this.logTest(
        'Verificar detalles del backup más reciente',
        detailsResponse.ok && detailsResponse.data?.success,
        {
          message: `Detalles obtenidos para: ${latestBackup.key}`,
          error: !detailsResponse.ok ? detailsResponse.statusText : null,
          response: detailsResponse.data?.object
        }
      );
    }
  }

  // Limpiar archivo descargado después de las pruebas
  async cleanupDownloadedFile(filePath) {
    try {
      const fs = await import('fs/promises');
      
      // Verificar si el archivo existe
      try {
        await fs.access(filePath);
      } catch (error) {
        // El archivo no existe, considerarlo como éxito
        console.log(`🧹 Archivo ya eliminado: ${filePath}`);
        return true;
      }
      
      // Eliminar el archivo
      await fs.unlink(filePath);
      
      console.log(`🧹 Archivo temporal eliminado: ${filePath}`);
      this.logTest(
        'Limpiar archivo temporal descargado',
        true,
        {
          message: 'Archivo temporal eliminado exitosamente',
          details: {
            filePath: filePath
          }
        }
      );
      return true;
    } catch (error) {
      console.error(`❌ Error eliminando archivo temporal: ${error.message}`);
      this.logTest(
        'Limpiar archivo temporal descargado',
        false,
        {
          error: `Error al eliminar archivo: ${error.message}`,
          details: {
            filePath: filePath
          }
        }
      );
      return false;
    }
  }

  // Limpiar archivo de backup local generado durante las pruebas
  async cleanupBackupFile(filePath) {
    try {
      const fs = await import('fs/promises');
      
      // Verificar si el archivo existe
      try {
        await fs.access(filePath);
      } catch (error) {
        // El archivo no existe, considerarlo como éxito
        console.log(`🧹 Archivo de backup ya eliminado: ${filePath}`);
        return true;
      }
      
      // Eliminar el archivo
      await fs.unlink(filePath);
      
      console.log(`🧹 Archivo de backup local eliminado: ${filePath}`);
      this.logTest(
        'Limpiar archivo de backup local',
        true,
        {
          message: 'Archivo de backup local eliminado exitosamente',
          details: {
            filePath: filePath
          }
        }
      );
      return true;
    } catch (error) {
      console.error(`❌ Error eliminando archivo de backup local: ${error.message}`);
      this.logTest(
        'Limpiar archivo de backup local',
        false,
        {
          error: `Error al eliminar archivo de backup: ${error.message}`,
          details: {
            filePath: filePath
          }
        }
      );
      return false;
    }
  }

  // Ejecutar todas las pruebas de backup de carpetas
  async runFoldersBackupTests() {
    console.log('🚀 INICIANDO PRUEBAS DE BACKUP DE CARPETAS');
    console.log('='.repeat(60));
    console.log(`Servidor: ${BASE_URL}`);
    console.log(`Fecha: ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    const startTime = Date.now();
    let backupResult = null;
    let downloadedFilePath = null;
    let backupFilePath = null;

    try {
      // Autenticarse primero
      await this.authenticate();

      // Verificar configuración de carpetas
      await this.verifyFoldersConfiguration();

      // Verificar backups existentes en S3
      await this.verifyFoldersInS3();

      // Ejecutar pruebas de backup de carpetas y capturar la ruta del archivo
      const backupResponse = await this.testFoldersBackup();
      if (backupResponse && backupResponse.data && backupResponse.data.result && backupResponse.data.result.filePath) {
        backupFilePath = backupResponse.data.result.filePath;
        backupResult = backupResponse.data.result;
      }

      // Si el backup fue exitoso, verificar subida a S3
      if (backupResult) {
        await this.verifyBackupUploadedToS3(backupResult);
      }

    } catch (error) {
      console.error('\n❌ Error durante las pruebas:', error.message);
      this.logTest(
        'Error general en pruebas',
        false,
        {
          error: error.message
        }
      );
    } finally {
      // Limpiar archivos descargados
      if (downloadedFilePath) {
        await this.cleanupDownloadedFile(downloadedFilePath);
      }
      
      // Limpiar archivo de backup local
      if (backupFilePath) {
        await this.cleanupBackupFile(backupFilePath);
      }
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    // Generar reporte final
    return this.generateReport(duration);
  }

  // Generar reporte de resultados
  generateReport(duration) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 REPORTE DE RESULTADOS - BACKUP DE CARPETAS');
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
    console.log('✨ PRUEBAS DE BACKUP DE CARPETAS COMPLETADAS');
    console.log('='.repeat(60));

    // Retornar si todas las pruebas pasaron
    return this.results.failed === 0;
  }
}

// Función principal
async function main() {
  const tester = new FoldersBackupTester();

  try {
    const success = await tester.runFoldersBackupTests();
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

  console.log('✅ Servidor detectado, iniciando pruebas de backup de carpetas...');
  main();
}).catch(error => {
  console.error('❌ Error al verificar servidor:', error.message);
  process.exit(1);
});

export default FoldersBackupTester;