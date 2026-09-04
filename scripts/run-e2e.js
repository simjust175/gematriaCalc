import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const schema = `tanach_reader_e2e_${process.pid}`;
const schemaIdentifier = `"${schema}"`;
const corpusTables = ['tanach_sources', 'tanach_books', 'tanach_verses'];
const baseWordsMigration = readFileSync(
  new URL('../server/migrations/20260307_add_base_words.sql', import.meta.url),
  'utf8'
);

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
    for (const table of corpusTables) {
      await client.query(
        `CREATE TABLE ${schemaIdentifier}.${table}
           (LIKE public.${table} INCLUDING ALL)`
      );
      await client.query(
        `INSERT INTO ${schemaIdentifier}.${table}
         SELECT * FROM public.${table}`
      );
    }
    await client.query(`SET LOCAL search_path TO ${schemaIdentifier}`);
    await client.query(baseWordsMigration);
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