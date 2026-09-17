import { app } from './app.js';
import { initDb, needsTanachRepresentationImport, needsTefillotImport } from './db.js';
import { legacyPool, multiUserPool } from './databaseRouter.js';
import { initializeDatabaseRoles } from './databaseStartup.js';
import { setApplicationReady } from './readiness.js';
import { execFile } from 'node:child_process';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const PORT = process.env.PORT || process.env.API_PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exec = promisify(execFile);

async function initializeApplication() {
  const status = await initializeDatabaseRoles({
    legacyDb: legacyPool,
    multiUserDb: multiUserPool,
    initializeDb: initDb,
  });

  if (await needsTanachRepresentationImport(legacyPool)) {
    console.log('Upgrading the imported UXLC text representation...');
    const importer = path.join(projectRoot, 'scripts', 'import-tanach.js');
    const { stdout, stderr } = await exec(process.execPath, [importer], {
      cwd: projectRoot,
      env: process.env,
      maxBuffer: 1024 * 1024,
    });
    if (stdout.trim()) console.log(stdout.trim());
    if (stderr.trim()) console.error(stderr.trim());
  }

  if (status.multiUserReady && await needsTanachRepresentationImport(multiUserPool)) {
    console.log('Upgrading the multi-user UXLC text representation...');
    const importer = path.join(projectRoot, 'scripts', 'import-tanach.js');
    const { stdout, stderr } = await exec(process.execPath, [importer], {
      cwd: projectRoot,
      env: {
        ...process.env,
        DATABASE_URL: process.env.MULTI_USER_DATABASE_URL,
        LEGACY_DATABASE_URL: undefined,
      },
      maxBuffer: 1024 * 1024,
    });
    if (stdout.trim()) console.log(stdout.trim());
    if (stderr.trim()) console.error(stderr.trim());
  }

  if (await needsTefillotImport(legacyPool)) {
    console.log('Importing the licensed Nusach Sefard prayer corpus...');
    const importer = path.join(projectRoot, 'scripts', 'import-tefillot.js');
    const { stdout, stderr } = await exec(process.execPath, [importer], {
      cwd: projectRoot,
      env: process.env,
      maxBuffer: 1024 * 1024,
    });
    if (stdout.trim()) console.log(stdout.trim());
    if (stderr.trim()) console.error(stderr.trim());
  }

  if (status.multiUserReady && await needsTefillotImport(multiUserPool)) {
    console.log('Importing the multi-user licensed Nusach Sefard prayer corpus...');
    const importer = path.join(projectRoot, 'scripts', 'import-tefillot.js');
    const { stdout, stderr } = await exec(process.execPath, [importer], {
      cwd: projectRoot,
      env: {
        ...process.env,
        DATABASE_URL: process.env.MULTI_USER_DATABASE_URL,
        LEGACY_DATABASE_URL: undefined,
      },
      maxBuffer: 1024 * 1024,
    });
    if (stdout.trim()) console.log(stdout.trim());
    if (stderr.trim()) console.error(stderr.trim());
  }

  if (!status.multiUserReady) {
    console.warn('Multi-user database is not configured; multi-user startup is disabled.');
  }
}

if (isProduction) {
  const distDirectory = path.join(projectRoot, 'dist');
  app.use(express.static(distDirectory));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distDirectory, 'index.html'));
  });
}

function listen() {
  return app.listen(PORT, '0.0.0.0', () => {
    console.log(`API server running on port ${PORT}`);
  });
}

if (isProduction) {
  // The deployment health probe can receive a 200 from the static app shell as
  // soon as the port is open, while API traffic stays explicitly gated until
  // the database and any one-time corpus upgrade are ready.
  setApplicationReady(false);
  const server = listen();
  try {
    await initializeApplication();
    setApplicationReady(true);
    console.log('Application initialization complete');
  } catch (error) {
    console.error('Application initialization failed:', error);
    await new Promise(resolve => server.close(resolve));
    throw error;
  }
} else {
  await initializeApplication();
  setApplicationReady(true);
  listen();
}
