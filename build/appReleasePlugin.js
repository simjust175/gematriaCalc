import { APP_RELEASE } from '../src/config/appRelease.js';
import { validateRelease } from '../src/updates/release.js';

// The running bundle, HTML and public release manifest share the same release config.
export function appReleasePlugin() {
  const release = validateRelease(APP_RELEASE);
  const manifest = JSON.stringify(release);
  return {
    name: 'gematria-app-release',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { name: 'gematria-release', content: release.version }, injectTo: 'head' }];
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/app-release.json') return next();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(manifest);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'app-release.json', source: manifest });
    },
  };
}
