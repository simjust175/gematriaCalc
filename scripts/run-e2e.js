import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const schema = `tanach_reader_e2e_${process.pid}`;
const schemaIdentifier = `"${schema}"`;
if (!/^tanach_reader_e2e_[1-9]\d+$/.test(schema)
    || process.env.NODE_ENV === 'production'
    || process.env.REPLIT_DEPLOYMENT) {
  throw new Error('E2E schema changes are allowed only in a disposable development test schema');
}
const privateTables = [
  'session',
  'tanach_sources',
  'tanach_books',
  'tanach_verses',
  'tanach_parshiot',
  'saved_entries',
  'saved_words',
  'base_words',
  'curated_matches',
  'explicit_milui_interpretations',
  'milui_preferences',
  'milui_mapping_versions',
  'milui_index_state',
  'saved_entry_milui_index',
  'saved_entry_milui_save_modes',
  'saved_entry_milui_form_index',
];
const copiedReferenceTables = [
  'tanach_sources',
  'tanach_books',
  'tanach_verses',
  'tanach_parshiot',
  'milui_preferences',
  'milui_mapping_versions',
  'milui_index_state',
];

function createClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for the Tanach browser suite.');
  }
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
}

async function prepareSchema() {
  const client = createClient();
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DROP SCHEMA IF EXISTS ${schemaIdentifier} CASCADE`);
    await client.query(`CREATE SCHEMA ${schemaIdentifier}`);
    for (const table of privateTables) {
      await client.query(
        `CREATE TABLE ${schemaIdentifier}.${table}
           (LIKE public.${table} INCLUDING ALL)`
      );
    }

    const serialColumns = await client.query(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
         AND column_default LIKE 'nextval(%'
       ORDER BY table_name, ordinal_position`,
      [privateTables]
    );
    for (const { table_name: table, column_name: column } of serialColumns.rows) {
      const sequence = `${table}_${column}_seq`;
      await client.query(`CREATE SEQUENCE ${schemaIdentifier}."${sequence}"`);
      await client.query(
        `ALTER TABLE ${schemaIdentifier}.${table}
         ALTER COLUMN "${column}" SET DEFAULT nextval('${schema}.${sequence}'::regclass)`
      );
      await client.query(
        `ALTER SEQUENCE ${schemaIdentifier}."${sequence}"
         OWNED BY ${schemaIdentifier}.${table}."${column}"`
      );
    }

    for (const table of copiedReferenceTables) {
      await client.query(
        `INSERT INTO ${schemaIdentifier}.${table}
         SELECT * FROM public.${table}`
      );
    }
    const version = await client.query(
      `SELECT MAX(version) AS highest FROM ${schemaIdentifier}.milui_mapping_versions`
    );
    const highest = version.rows[0].highest;
    await client.query(
      'SELECT setval($1::regclass, $2::bigint, $3::boolean)',
      [`${schema}.milui_mapping_versions_version_seq`, highest ?? 1, highest !== null]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

async function removeSchema() {
  const client = createClient();
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${schemaIdentifier} CASCADE`);
  } finally {
    await client.end();
  }
}

await prepareSchema();

const playwrightCli = fileURLToPath(
  new URL('../node_modules/@playwright/test/cli.js', import.meta.url)
);
const requestedTests = process.argv.slice(2);
const child = spawn(process.execPath, [playwrightCli, 'test', ...requestedTests], {
  stdio: 'inherit',
  env: {
    ...process.env,
    E2E_SCHEMA: schema,
  },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => child.kill(signal));
}

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', code => resolve(code ?? 1));
});

try {
  await removeSchema();
} catch (error) {
  console.error(`Failed to remove browser-test schema ${schema}:`, error.message);
  process.exitCode = 1;
}

if (process.exitCode !== 1) {
  process.exitCode = exitCode;
}