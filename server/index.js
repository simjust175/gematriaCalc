import { app } from './app.js';
import { initDb, needsTanachRepresentationImport } from './db.js';
import { execFile } from 'node:child_process';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const PORT = process.env.PORT || process.env.API_PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exec = promisify(execFile);

await initDb();
if (await needsTanachRepresentationImport()) {
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
