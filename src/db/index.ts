import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 4,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 30000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 5000,
      allowExitOnIdle: true,
    });

    // Cloud SQL Developer instances periodically close idle sockets;
    // pg.Pool automatically evicts the closed idle client and reconnects on next query.
    global._postgresPool.on('error', () => {
      // Handled gracefully by pg.Pool eviction
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });

/**
 * Inspects an error and its nested `.cause` chain (e.g., DrizzleQueryError -> pg Error)
 * to determine whether the failure is a transient database connection/timeout issue.
 */
export function isTransientDbError(err: unknown): boolean {
  const transientPatterns = [
    'connection terminated',
    'connection timeout',
    'econnreset',
    'etimedout',
    'epipe',
    'econnrefused',
    'connection ended',
    'client has encountered a connection error',
    'terminating connection',
    'the database system is starting up',
    'cannot connect now',
    'sorry, too many clients already',
  ];
  const transientCodes = new Set([
    '57P01',
    '57P02',
    '57P03',
    '08000',
    '08003',
    '08006',
    '08001',
    '08004',
    'ECONNRESET',
    'ETIMEDOUT',
    'EPIPE',
  ]);

  let current: any = err;
  let depth = 0;
  while (current && depth < 6) {
    const msg = String(current.message || '').toLowerCase();
    const code = String(current.code || '').toUpperCase();
    if (transientCodes.has(code)) {
      return true;
    }
    if (transientPatterns.some((pattern) => msg.includes(pattern))) {
      return true;
    }
    current = current.cause;
    depth++;
  }
  return false;
}

export async function withDbRetry<T>(
  operation: () => Promise<T>,
  retries = 3
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      if (!isTransientDbError(err) || attempt === retries) {
        throw err;
      }
      const backoffMs = 300 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastError;
}
