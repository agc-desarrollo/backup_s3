import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const BASE_URL = 'http://localhost:3000';
const API_TOKEN = process.env.API_TOKEN || 'AABBCC';

// Configuración de headers
const headers = {
  'Content-Type': 'application/json',
  'api-token': API_TOKEN
};

/**
 * Función auxiliar para realizar peticiones HTTP
 */
async function makeRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const config = {
    headers,
    ...options
  };

  try {
    console.log(`\n🔄 ${config.method || 'GET'} ${endpoint}`);
    const response = await fetch(url, config);
    const data = await response.json();
    
    if (response.ok) {
      console.log(`✅ Éxito (${response.status}):`, JSON.stringify(data, null, 2));
      return { success: true, data, status: response.status };
    } else {
      console.log(`❌ Error (${response.status}):`, JSON.stringify(data, null, 2));
      return { success: false, data, status: response.status };
    }
  } catch (error) {
    console.log(`💥 Error de conexión:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Pruebas del servicio S3
 */
async function testS3Service() {
  console.log('🧪 INICIANDO PRUEBAS DEL SERVICIO S3');
  console.log('=' .repeat(50));

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    tests: []
  };

  // Test 1: Health check
  console.log('\n📋 Test 1: Health Check');
  results.total++;
  const healthCheck = await makeRequest('/api/health');
  if (healthCheck.success) {
    results.passed++;
    results.tests.push({ name: 'Health Check', status: 'PASS' });
  } else {
    results.failed++;
    results.tests.push({ name: 'Health Check', status: 'FAIL', error: healthCheck.error });
  }

  // Test 2: Listar objetos S3
  console.log('\n📋 Test 2: Listar objetos S3');
  results.total++;
  const listObjects = await makeRequest('/api/s3/objects');
  if (listObjects.success) {
    results.passed++;
    results.tests.push({ name: 'Listar objetos S3', status: 'PASS' });
    console.log(`📊 Objetos encontrados: ${listObjects.data.count}`);
  } else {
    results.failed++;
    results.tests.push({ name: 'Listar objetos S3', status: 'FAIL', error: listObjects.data?.message });
  }

  // Test 3: Listar objetos con prefijo
  console.log('\n📋 Test 3: Listar objetos con prefijo "backups/"');
  results.total++;
  const listBackups = await makeRequest('/api/s3/objects?prefix=backups/&maxKeys=10');
  if (listBackups.success) {
    results.passed++;
    results.tests.push({ name: 'Listar objetos con prefijo', status: 'PASS' });
    console.log(`📊 Backups encontrados: ${listBackups.data.count}`);
  } else {
    results.failed++;
    results.tests.push({ name: 'Listar objetos con prefijo', status: 'FAIL', error: listBackups.data?.message });
  }

  // Test 4: Obtener estructura de carpetas
  console.log('\n📋 Test 4: Obtener estructura de carpetas');
  results.total++;
  const getFolders = await makeRequest('/api/s3/folders?prefix=backups/');
  if (getFolders.success) {
    results.passed++;
    results.tests.push({ name: 'Estructura de carpetas', status: 'PASS' });
    console.log(`📁 Carpetas: ${getFolders.data.totalFolders}, Archivos: ${getFolders.data.totalFiles}`);
  } else {
    results.failed++;
    results.tests.push({ name: 'Estructura de carpetas', status: 'FAIL', error: getFolders.data?.message });
  }

  // Test 5: Obtener estadísticas de S3
  console.log('\n📋 Test 5: Obtener estadísticas de S3');
  results.total++;
  const getStats = await makeRequest('/api/s3/stats');
  if (getStats.success) {
    results.passed++;
    results.tests.push({ name: 'Estadísticas de S3', status: 'PASS' });
    const stats = getStats.data.stats;
    console.log(`📊 Total objetos: ${stats.totalObjects}`);
    console.log(`💾 Tamaño total: ${stats.totalSizeFormatted}`);
    console.log(`🪣 Bucket: ${stats.bucketName}`);
  } else {
    results.failed++;
    results.tests.push({ name: 'Estadísticas de S3', status: 'FAIL', error: getStats.data?.message });
  }

  // Test 6: Buscar objetos (solo si hay objetos)
  if (listObjects.success && listObjects.data.count > 0) {
    console.log('\n📋 Test 6: Buscar objetos');
    results.total++;
    const searchObjects = await makeRequest('/api/s3/search?q=backup&limit=5');
    if (searchObjects.success) {
      results.passed++;
      results.tests.push({ name: 'Buscar objetos', status: 'PASS' });
      console.log(`🔍 Resultados encontrados: ${searchObjects.data.totalFound}`);
    } else {
      results.failed++;
      results.tests.push({ name: 'Buscar objetos', status: 'FAIL', error: searchObjects.data?.message });
    }

    // Test 7: Obtener detalles de un objeto específico (si existe)
    if (listObjects.data.objects && listObjects.data.objects.length > 0) {
      const firstObject = listObjects.data.objects[0];
      console.log(`\n📋 Test 7: Obtener detalles del objeto "${firstObject.key}"`);
      results.total++;
      const objectKey = encodeURIComponent(firstObject.key);
      const getDetails = await makeRequest(`/api/s3/objects/${objectKey}/details`);
      if (getDetails.success) {
        results.passed++;
        results.tests.push({ name: 'Detalles de objeto', status: 'PASS' });
        console.log(`📄 Tamaño: ${getDetails.data.object.sizeFormatted}`);
        console.log(`📅 Última modificación: ${getDetails.data.object.lastModified}`);
      } else {
        results.failed++;
        results.tests.push({ name: 'Detalles de objeto', status: 'FAIL', error: getDetails.data?.message });
      }
    }
  }

  // Test 8: Prueba de autenticación (token inválido)
  console.log('\n📋 Test 8: Prueba de autenticación con token inválido');
  results.total++;
  const invalidAuth = await makeRequest('/api/s3/objects', {
    headers: {
      'Content-Type': 'application/json',
      'api-token': 'token-invalido'
    }
  });
  if (!invalidAuth.success && invalidAuth.status === 401) {
    results.passed++;
    results.tests.push({ name: 'Autenticación inválida', status: 'PASS' });
    console.log('✅ Token inválido correctamente rechazado');
  } else {
    results.failed++;
    results.tests.push({ name: 'Autenticación inválida', status: 'FAIL', error: 'Token inválido no fue rechazado' });
  }

  // Test 9: Prueba de parámetros inválidos
  console.log('\n📋 Test 9: Prueba de parámetros inválidos');
  results.total++;
  const invalidParams = await makeRequest('/api/s3/objects?maxKeys=2000'); // Excede el límite
  if (!invalidParams.success && invalidParams.status === 400) {
    results.passed++;
    results.tests.push({ name: 'Parámetros inválidos', status: 'PASS' });
    console.log('✅ Parámetros inválidos correctamente rechazados');
  } else {
    results.failed++;
    results.tests.push({ name: 'Parámetros inválidos', status: 'FAIL', error: 'Parámetros inválidos no fueron rechazados' });
  }

  // Test 10: Búsqueda sin parámetro de consulta
  console.log('\n📋 Test 10: Búsqueda sin parámetro de consulta');
  results.total++;
  const emptySearch = await makeRequest('/api/s3/search');
  if (!emptySearch.success && emptySearch.status === 400) {
    results.passed++;
    results.tests.push({ name: 'Búsqueda vacía', status: 'PASS' });
    console.log('✅ Búsqueda vacía correctamente rechazada');
  } else {
    results.failed++;
    results.tests.push({ name: 'Búsqueda vacía', status: 'FAIL', error: 'Búsqueda vacía no fue rechazada' });
  }

  // Resumen final
  console.log('\n' + '=' .repeat(50));
  console.log('📊 RESUMEN DE PRUEBAS DEL SERVICIO S3');
  console.log('=' .repeat(50));
  console.log(`✅ Pruebas exitosas: ${results.passed}/${results.total}`);
  console.log(`❌ Pruebas fallidas: ${results.failed}/${results.total}`);
  console.log(`📈 Porcentaje de éxito: ${((results.passed / results.total) * 100).toFixed(1)}%`);

  if (results.failed > 0) {
    console.log('\n❌ PRUEBAS FALLIDAS:');
    results.tests
      .filter(test => test.status === 'FAIL')
      .forEach(test => {
        console.log(`  - ${test.name}: ${test.error || 'Error desconocido'}`);
      });
  }

  console.log('\n🏁 Pruebas completadas');
  
  // Código de salida
  process.exit(results.failed > 0 ? 1 : 0);
}

/**
 * Verificar que el servidor esté ejecutándose
 */
async function checkServerStatus() {
  console.log('🔍 Verificando estado del servidor...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    if (response.ok) {
      console.log('✅ Servidor disponible');
      return true;
    } else {
      console.log('❌ Servidor responde pero con error');
      return false;
    }
  } catch (error) {
    console.log('❌ Servidor no disponible:', error.message);
    console.log('💡 Asegúrate de que el servidor esté ejecutándose con: npm start');
    return false;
  }
}

/**
 * Función principal
 */
async function main() {
  console.log('🚀 SCRIPT DE PRUEBAS DEL SERVICIO S3');
  console.log('Servidor:', BASE_URL);
  console.log('Token API:', API_TOKEN ? '***' + API_TOKEN.slice(-4) : 'NO CONFIGURADO');
  console.log('');

  // Verificar servidor
  const serverOk = await checkServerStatus();
  if (!serverOk) {
    process.exit(1);
  }

  // Ejecutar pruebas
  await testS3Service();
}

// Ejecutar si es llamado directamente
if (process.argv[1] && process.argv[1].endsWith('test-s3-service.js')) {
  main().catch(error => {
    console.error('💥 Error fatal:', error);
    process.exit(1);
  });
}

export { testS3Service, checkServerStatus };