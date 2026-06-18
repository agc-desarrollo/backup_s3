import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Variables de entorno críticas. No tienen valor por defecto: si falta
// cualquiera (o está vacía), el servicio no debe arrancar.
const REQUIRED_ENV_VARS = [
  'PORT',
  'API_TOKEN',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_REGION',
  'DB_TYPE'
];

// Variables de BD requeridas según el tipo. PostgreSQL usa una única cadena
// de conexión; MySQL usa valores sueltos.
const REQUIRED_DB_ENV_VARS = {
  postgresql: ['DB_CONNECTION_STRING'],
  postgres: ['DB_CONNECTION_STRING'],
  mysql: ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE']
};

const ALLOWED_DB_TYPES = ['postgresql', 'postgres', 'mysql'];

const ROTATION_CONFIG_PATH = path.join(__dirname, '../../config/rotation.json');

/**
 * Valida la configuración mínima para arrancar. Lanza un Error con todos los
 * problemas detectados si algo falta. No aplica ningún valor por defecto.
 */
export function validateStartupConfig() {
  const errors = [];

  // 1. Variables de entorno críticas presentes y no vacías
  for (const name of REQUIRED_ENV_VARS) {
    const value = process.env[name];
    if (value === undefined || value === null || String(value).trim() === '') {
      errors.push(`Falta la variable de entorno requerida: ${name}`);
    }
  }

  // 2. Variables de BD según el tipo (postgresql -> cadena de conexión,
  //    mysql -> valores sueltos).
  const dbType = process.env.DB_TYPE;
  const requiredDbVars = REQUIRED_DB_ENV_VARS[dbType] || [];
  for (const name of requiredDbVars) {
    const value = process.env[name];
    if (value === undefined || value === null || String(value).trim() === '') {
      errors.push(`Falta la variable de entorno requerida: ${name}`);
    }
  }

  // 3. PORT debe ser un número válido. DB_PORT solo aplica a MySQL.
  if (process.env.PORT && Number.isNaN(parseInt(process.env.PORT, 10))) {
    errors.push(`PORT debe ser un número (valor actual: "${process.env.PORT}")`);
  }
  if ((dbType === 'mysql') && process.env.DB_PORT && Number.isNaN(parseInt(process.env.DB_PORT, 10))) {
    errors.push(`DB_PORT debe ser un número (valor actual: "${process.env.DB_PORT}")`);
  }

  // 4. DB_CONNECTION_STRING debe ser una cadena válida para PostgreSQL.
  if ((dbType === 'postgresql' || dbType === 'postgres') && process.env.DB_CONNECTION_STRING) {
    try {
      // eslint-disable-next-line no-new
      new URL(process.env.DB_CONNECTION_STRING);
    } catch (error) {
      errors.push(`DB_CONNECTION_STRING no es una cadena de conexión válida: ${error.message}`);
    }
  }

  // 5. DB_TYPE debe ser un tipo soportado
  if (process.env.DB_TYPE && !ALLOWED_DB_TYPES.includes(process.env.DB_TYPE)) {
    errors.push(
      `DB_TYPE no soportado: "${process.env.DB_TYPE}". Valores válidos: ${ALLOWED_DB_TYPES.join(', ')}`
    );
  }

  // 6. config/rotation.json debe existir y ser un JSON válido
  if (!fs.existsSync(ROTATION_CONFIG_PATH)) {
    errors.push(`No existe el archivo de rotación: ${ROTATION_CONFIG_PATH}`);
  } else {
    try {
      const parsed = JSON.parse(fs.readFileSync(ROTATION_CONFIG_PATH, 'utf-8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        errors.push('config/rotation.json debe ser un objeto JSON con políticas por tipo (database, folder)');
      }
    } catch (error) {
      errors.push(`config/rotation.json no es un JSON válido: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      'Configuración de arranque inválida:\n  - ' + errors.join('\n  - ')
    );
  }
}

export default validateStartupConfig;
