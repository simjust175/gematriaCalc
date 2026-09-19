import { initDb } from '../server/db.js';
import { requireMultiUserPool } from '../server/databaseRouter.js';

async function main() {
  if (!process.argv.includes('--apply')) {
    throw new Error('Refusing schema setup without the explicit --apply flag');
  }

  const pool = requireMultiUserPool();
  try {
    await initDb({
      db: pool,
      initializeMultiUser: true,
      allowSchemaChanges: true,
    });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS session (
        sid VARCHAR NOT NULL PRIMARY KEY,
        sess JSON NOT NULL,
        expire TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session(expire);
    `);
    console.log('Multi-user database schema is ready.');
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error('Multi-user database setup failed:', error.message);
  process.exitCode = 1;
});