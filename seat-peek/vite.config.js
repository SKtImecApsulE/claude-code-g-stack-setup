import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import { railRequest } from './api/rail.js';
import mock from './dev/mock.js';

// In dev, serve /api/rail with the same code Vercel runs in production.
//   RAIL_MOCK=1        answer from dev/mock.js (no API key needed)
//   RAIL_CACHE_DIR=dir keep successful responses on disk, to spare a small API quota
const devApi = {
  name: 'dev-api',
  configureServer(server) {
    server.middlewares.use('/api/rail', async (req, res) => {
      const reqUrl = '/api/rail' + (req.url === '/' ? '' : req.url);
      const url = new URL(reqUrl, 'http://localhost');
      const reply = (status, body) => {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(body);
      };
      if (process.env.RAIL_MOCK) {
        const out = mock(url.searchParams.get('p') || '', url.searchParams);
        return reply(out.status || 200, JSON.stringify(out.body || out));
      }
      const dir = process.env.RAIL_CACHE_DIR;
      url.searchParams.sort();
      const file = dir && path.join(dir, url.searchParams.toString().replace(/[^A-Za-z0-9=&-]/g, '_') + '.json');
      if (file && fs.existsSync(file)) return reply(200, fs.readFileSync(file, 'utf8'));
      const out = await railRequest(reqUrl);
      if (file && out.status === 200) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, out.body);
      }
      reply(out.status, out.body);
    });
  },
};

export default defineConfig({ plugins: [devApi] });
