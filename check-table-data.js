import { spawn } from 'child_process';

// Verificar datos en la tabla usando MySQL Shell
function checkTableData() {
  return new Promise((resolve, reject) => {
    const connectionUri = 'mysql://remoto:mocoman@192.168.0.240:3306/prueba';
    
    const args = [
      '--uri', connectionUri,
      '--sql',
      '--execute', 'SELECT COUNT(*) as total_rows FROM new_table; SELECT * FROM new_table LIMIT 5;'
    ];

    console.log('🔍 Verificando datos en la tabla new_table...');
    const mysqlsh = spawn('mysqlsh', args);
    
    let stdout = '';
    let stderr = '';
    
    mysqlsh.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    mysqlsh.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    mysqlsh.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Consulta exitosa');
        console.log('📊 Resultado:');
        console.log(stdout);
        resolve(stdout);
      } else {
        console.log('❌ Error en consulta:', stderr);
        reject(new Error(`MySQL Shell falló: ${stderr}`));
      }
    });

    mysqlsh.on('error', (error) => {
      console.log('❌ Error ejecutando MySQL Shell:', error.message);
      reject(error);
    });
  });
}

// Ejecutar verificación
checkTableData()
  .then(() => {
    console.log('\n✨ Verificación completada');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });