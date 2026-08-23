let applicationReady = process.env.NODE_ENV !== 'production';

export function setApplicationReady(ready) {
  applicationReady = Boolean(ready);
}

export function isApplicationReady() {
  return applicationReady;
}

export function requireApplicationReady(req, res, next) {
  if (applicationReady || !req.path.startsWith('/api/') || req.path === '/api/health') {
    return next();
  }
  return res.status(503).json({
    error: 'app_initializing',
    message: 'The application is still starting. Please retry shortly.',
  });
}