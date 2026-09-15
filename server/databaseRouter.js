import pg from 'pg';

const { Pool } = pg;

export const LEGACY_DATABASE_ROLE = 'legacy';
export const MULTI_USER_DATABASE_ROLE = 'multi-user';

function createPool(connectionString, databaseRole) {
  if (!connectionString) return null;
  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  pool.databaseRole = databaseRole;
  return pool;
}

// The current client remains on the platform-managed database.
export const legacyPool = createPool(process.env.DATABASE_URL, LEGACY_DATABASE_ROLE);
// Deliberately no fallback to DATABASE_URL.
export const multiUserPool = createPool(
  process.env.MULTI_USER_DATABASE_URL,
  MULTI_USER_DATABASE_ROLE
);

export function assertMultiUserPool(db) {
  if (!db || db.databaseRole !== MULTI_USER_DATABASE_ROLE) {
    const error = new Error('Multi-user initialization requires the multi-user database');
    error.code = 'MULTI_USER_DATABASE_REQUIRED';
    throw error;
  }
  return db;
}

export function requireMultiUserPool() {
  if (!multiUserPool) {
    const error = new Error('Multi-user database is not configured');
    error.code = 'MULTI_USER_DATABASE_UNAVAILABLE';
    throw error;
  }
  return multiUserPool;
}
