import { app } from './app.js';
import { initDb } from './db.js';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || process.env.API_PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await initDb();

if (isProduction) {
  const distDirectory = path.join(projectRoot, 'dist');
  app.use(express.static(distDirectory));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distDirectory, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server running on port ${PORT}`);
});
