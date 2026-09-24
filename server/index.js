import { app } from './app.js';
import { pool } from './db.js';
import { validatePrivateDatabase } from './databaseStartup.js';
import { setApplicationReady } from './readiness.js';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || process.env.API_PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function initializeApplication() {
  await validatePrivateDatabase(pool);
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
