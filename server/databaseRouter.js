import pg from 'pg';

const { Pool } = pg;

export const LEGACY_DATABASE_ROLE = 'legacy';
export const MULTI_USER_DATABASE_ROLE = 'multi-user';

function createRolePool(connectionString, role) {
  if (!connectionString) return null;
  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  pool.databaseRole = role;
  return pool;
}

// DATABASE_URL is the platform-managed connection for the existing client.
// The multi-user connection is deliberately a separate, explicit setting.
export const legacyPool = createRolePool(
  process.env.LEGACY_DATABASE_URL || process.env.DATABASE_URL,
  LEGACY_DATABASE_ROLE
);
export const multiUserPool = createRolePool(
  process.env.MULTI_USER_DATABASE_URL,
  MULTI_USER_DATABASE_ROLE
);

export function poolForRole(role) {
  if (role === LEGACY_DATABASE_ROLE) return legacyPool;
  if (role === MULTI_USER_DATABASE_ROLE) return multiUserPool;
  return null;
}

export function requirePoolForRole(role) {
  const pool = poolForRole(role);
  if (!pool) {
    const error = new Error(`${role} database is not configured`);
    error.code = role === MULTI_USER_DATABASE_ROLE
      ? 'MULTI_USER_DATABASE_UNAVAILABLE'
      : 'LEGACY_DATABASE_UNAVAILABLE';
    throw error;
  }
  return pool;
}

export function assertMultiUserPool(db) {
  if (!db || db.databaseRole !== MULTI_USER_DATABASE_ROLE) {
    const error = new Error('Multi-user initialization requires the multi-user database');
    error.code = 'MULTI_USER_DATABASE_REQUIRED';
    throw error;
  }
  return db;
}

export function databaseRoleForPool(db) {
  return db?.databaseRole || null;
}
