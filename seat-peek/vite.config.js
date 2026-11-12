import { defineConfig } from 'vite';
import rail from './api/rail.js';
import mock from './dev/mock.js';

// In dev, serve /api/rail with the same handler Vercel runs in production.
// RAIL_MOCK=1 answers from dev/mock.js instead, for working without an API key.
const devApi = {
  name: 'dev-api',
  configureServer(server) {
    server.middlewares.use('/api/rail', (req, res) => {
      req.url = '/api/rail' + (req.url === '/' ? '' : req.url);
      if (!process.env.RAIL_MOCK) return rail(req, res);
      const url = new URL(req.url, 'http://localhost');
      const out = mock(url.searchParams.get('p') || '', url.searchParams);
      res.statusCode = out.status || 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(out.body || out));
    });
  },
};

export default defineConfig({ plugins: [devApi] });
