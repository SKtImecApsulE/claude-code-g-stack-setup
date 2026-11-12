// Server-side proxy to the RailRadar API (https://railradar.in/docs).
// Runs as a Vercel function in production and as Vite middleware in dev, so
// the API key never reaches the browser. Only the read-only endpoints the app
// uses are allowed through.
//
//   GET /api/rail?p=/trains/12002/coaches
//   GET /api/rail?p=/trains/between/NDLS/BPL&date=2026-11-20

const BASE = 'https://api.railradar.in/v1';

// path pattern -> seconds the response may be cached
const ALLOWED = [
  [/^\/lookup\/search\/stations$/, 86400],
  [/^\/lookup\/search\/trains$/, 86400],
  [/^\/trains\/between\/[A-Za-z0-9]{1,10}\/[A-Za-z0-9]{1,10}$/, 3600],
  [/^\/trains\/[0-9A-Za-z_-]{1,20}$/, 21600],
  [/^\/trains\/[0-9A-Za-z_-]{1,20}\/coaches$/, 21600],
  [/^\/trains\/[0-9A-Za-z_-]{1,20}\/route$/, 604800],
];
const PARAMS = ['q', 'limit', 'date', 'type', 'haltsOnly', 'format', 'stops', 'byCity'];

function send(res, status, body, cache = 0) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache ? `public, s-maxage=${cache}, max-age=300` : 'no-store');
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'GET only' } });
  const url = new URL(req.url, 'http://localhost');
  const path = url.searchParams.get('p') || '';
  const rule = ALLOWED.find(([re]) => re.test(path));
  if (!rule) return send(res, 400, { success: false, error: { code: 'BAD_PATH', message: 'Unsupported path' } });

  const upstream = new URL(BASE + path);
  for (const name of PARAMS) {
    const v = url.searchParams.get(name);
    if (v !== null && v.length <= 100) upstream.searchParams.set(name, v);
  }

  const key = process.env.RAILRADAR_API_KEY;
  if (!key && process.env.VERCEL) {
    return send(res, 500, { success: false, error: { code: 'NO_KEY', message: 'RAILRADAR_API_KEY is not set on the server' } });
  }
  try {
    const r = await fetch(upstream, {
      // Without a key (local sandboxes that inject one at the network layer) send a placeholder.
      headers: { Authorization: `Bearer ${key || 'proxy-injected'}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    const text = await r.text();
    send(res, r.status, text, r.ok ? rule[1] : 0);
  } catch (err) {
    send(res, 502, { success: false, error: { code: 'UPSTREAM_ERROR', message: 'Could not reach the train data service' } });
  }
}
