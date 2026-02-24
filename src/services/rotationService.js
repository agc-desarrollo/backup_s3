import { s3Service } from './s3Service.js';
import { logger } from './logger.js';

/**
 * RotationService - Maneja la política de retención de backups en S3
 */
class RotationService {
  constructor() {
    // Prefijos para cada tipo de backup
    this.prefixes = {
      folder: 'backups/folders/',
      database: 'backups/databases/'
    };
  }

  /**
   * Aplica la política de rotación a un tipo de backup
   * @param {string} type - 'folder' o 'database'
   * @param {object} policy - Política de retención
   */
  async applyRotation(type, policy) {
    try {
      const prefix = this.prefixes[type];
      if (!prefix) {
        throw new Error("Tipo de backup desconocido: " + type);
      }

      logger.info("Aplicando política de rotación para " + type + " backups");

      // Obtener todos los objetos del prefijo
      const objects = await this.listAllObjects(prefix);
      
      if (objects.length === 0) {
        logger.info("No hay objetos para rotar en " + prefix);
        return { deleted: 0, kept: 0 };
      }

      // Determinar qué objetos eliminar
      const toDelete = this.determineObjectsToDelete(objects, policy);
      
      // Eliminar objetos
      let deleted = 0;
      for (const obj of toDelete) {
        try {
          await s3Service.deleteObject(obj.key);
          deleted++;
          logger.info("Eliminado: " + obj.key);
        } catch (error) {
          logger.error("Error al eliminar: " + error.message);
        }
      }

      logger.info("Rotación completada: eliminados " + deleted + ", mantenidos " + (objects.length - deleted));
      return { deleted, kept: objects.length - deleted };
    } catch (error) {
      logger.error('Error en applyRotation:', error);
      throw error;
    }
  }

  /**
   * Lista todos los objetos con un prefijo (maneja paginación)
   */
  async listAllObjects(prefix) {
    const objects = [];
    let continuationToken = null;
    
    do {
      const result = await s3Service.listObjects(prefix, 1000, continuationToken);
      if (result.Contents) {
        objects.push(...result.Contents.map(obj => ({
          key: obj.Key,
          lastModified: obj.LastModified,
          size: obj.Size
        })));
      }
      continuationToken = result.NextContinuationToken;
    } while (continuationToken);

    // Ordenar por fecha de modificación (más reciente primero)
    return objects.sort((a, b) => b.lastModified - a.lastModified);
  }

  /**
   * Determina qué objetos eliminar según la política de retención
   */
  determineObjectsToDelete(objects, policy) {
    const now = new Date();
    const toKeep = new Set();

    // 1. keepLast: Mantener los N backups más recientes
    if (policy.keepLast && policy.keepLast > 0) {
      const lastN = objects.slice(0, policy.keepLast);
      lastN.forEach(obj => toKeep.add(obj.key));
    }

    // 2. keepDays: Eliminar backups mayores a N días
    if (policy.keepDays && policy.keepDays > 0) {
      const cutoffDate = new Date(now.getTime() - policy.keepDays * 24 * 60 * 60 * 1000);
      objects.forEach(obj => {
        if (obj.lastModified < cutoffDate) {
          toKeep.add(obj.key); // Marcar para mantener si está dentro del período
        }
      });
    }

    // 3. keepWeeks: Mantener un backup por semana para las últimas N semanas
    if (policy.keepWeeks && policy.keepWeeks > 0) {
      const weeklyBackups = this.getWeeklyBackups(objects, policy.keepWeeks);
      weeklyBackups.forEach(obj => toKeep.add(obj.key));
    }

    // 4. keepMonths: Mantener un backup por mes para los últimos N meses
    if (policy.keepMonths && policy.keepMonths > 0) {
      const monthlyBackups = this.getMonthlyBackups(objects, policy.keepMonths);
      monthlyBackups.forEach(obj => toKeep.add(obj.key));
    }

    // Retornar objetos que NO están en la lista de mantener
    return objects.filter(obj => !toKeep.has(obj.key));
  }

  /**
   * Obtiene los backups semanales (más reciente de cada semana)
   */
  getWeeklyBackups(objects, weeks) {
    const now = new Date();
    const cutoffTime = now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000;
    const weekly = new Map(); // weekKey -> object

    objects.forEach(obj => {
      if (obj.lastModified.getTime() < cutoffTime) return;
      
      // Calcular clave de semana (año-semana)
      const weekKey = this.getWeekKey(obj.lastModified);
      
      // Solo mantener el más reciente de cada semana
      if (!weekly.has(weekKey) || obj.lastModified > weekly.get(weekKey).lastModified) {
        weekly.set(weekKey, obj);
      }
    });

    return Array.from(weekly.values());
  }

  /**
   * Obtiene los backups mensuales (más reciente de cada mes)
   */
  getMonthlyBackups(objects, months) {
    const now = new Date();
    const cutoffTime = now.getTime() - months * 30 * 24 * 60 * 60 * 1000;
    const monthly = new Map(); // monthKey -> object

    objects.forEach(obj => {
      if (obj.lastModified.getTime() < cutoffTime) return;
      
      // Calcular clave de mes (año-mes)
      const monthKey = `${obj.lastModified.getFullYear()}-${String(obj.lastModified.getMonth() + 1).padStart(2, '0')}`;
      
      // Solo mantener el más reciente de cada mes
      if (!monthly.has(monthKey) || obj.lastModified > monthly.get(monthKey).lastModified) {
        monthly.set(monthKey, obj);
      }
    });

    return Array.from(monthly.values());
  }

  /**
   * Obtiene la clave de semana para una fecha
   */
  getWeekKey(date) {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
    const week = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  /**
   * Obtiene estadísticas de retención para un tipo de backup
   */
  async getRetentionStats(type) {
    try {
      const prefix = this.prefixes[type];
      if (!prefix) {
        throw new Error("Tipo de backup desconocido: " + type);
      }

      const objects = await this.listAllObjects(prefix);
      const now = new Date();

      const stats = {
        total: objects.length,
        byDay: {},
        byWeek: {},
        byMonth: {}
      };

      objects.forEach(obj => {
        // Por día
        const dayKey = obj.lastModified.toISOString().split('T')[0];
        stats.byDay[dayKey] = (stats.byDay[dayKey] || 0) + 1;

        // Por semana
        const weekKey = this.getWeekKey(obj.lastModified);
        stats.byWeek[weekKey] = (stats.byWeek[weekKey] || 0) + 1;

        // Por mes
        const monthKey = `${obj.lastModified.getFullYear()}-${String(obj.lastModified.getMonth() + 1).padStart(2, '0')}`;
        stats.byMonth[monthKey] = (stats.byMonth[monthKey] || 0) + 1;
      });

      return stats;
    } catch (error) {
      logger.error('Error en getRetentionStats:', error);
      throw error;
    }
  }
}

export const rotationService = new RotationService();
