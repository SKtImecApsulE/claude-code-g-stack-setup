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
  [/^\/trains\/[0-9A-Za-z_-]{1,20}\/fare$/, 21600],
  [/^\/trains\/[0-9A-Za-z_-]{1,20}\/seats$/, 900],
  // PNR lookups are personal: never cached
  [/^\/pnr\/\d{10}$/, 0],
];
const PARAMS = ['q', 'limit', 'date', 'type', 'haltsOnly', 'format', 'stops', 'byCity', 'source', 'destination', 'journeyDate', 'classCode', 'quotaCode'];

function send(res, status, body, cache = 0) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache ? `public, s-maxage=${cache}, max-age=300` : 'no-store');
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

// Coach responses repeat the whole rake for every stop (up to ~1 MB); the app
// only needs the rake and the class blueprints.
function slim(path, text) {
  if (!path.endsWith('/coaches')) return text;
  try {
    const body = JSON.parse(text);
    if (body?.data) {
      delete body.data.stationVariations;
      delete body.data.legs;
    }
    return JSON.stringify(body);
  } catch {
    return text;
  }
}

// Validate a request to our proxy and fetch it upstream.
// Returns { status, body, cache } where body is a JSON string.
export async function railRequest(reqUrl) {
  const fail = (status, code, message) => ({ status, cache: 0, body: JSON.stringify({ success: false, error: { code, message } }) });
  const url = new URL(reqUrl, 'http://localhost');
  const path = url.searchParams.get('p') || '';
  const rule = ALLOWED.find(([re]) => re.test(path));
  if (!rule) return fail(400, 'BAD_PATH', 'Unsupported path');

  const upstream = new URL(BASE + path);
  for (const name of PARAMS) {
    const v = url.searchParams.get(name);
    if (v !== null && v.length <= 100) upstream.searchParams.set(name, v);
  }
  const key = process.env.RAILRADAR_API_KEY;
  if (!key && process.env.VERCEL) return fail(500, 'NO_KEY', 'RAILRADAR_API_KEY is not set on the server');
  try {
    const r = await fetch(upstream, {
      // Without a key (local sandboxes that inject one at the network layer) send a placeholder.
      headers: { Authorization: `Bearer ${key || 'proxy-injected'}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(25000),
    });
    const text = await r.text();
    return { status: r.status, cache: r.ok ? rule[1] : 0, body: r.ok ? slim(path, text) : text, key: upstream.pathname + upstream.search };
  } catch {
    return fail(502, 'UPSTREAM_ERROR', 'Could not reach the train data service');
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'GET only' } });
  const out = await railRequest(req.url);
  send(res, out.status, out.body, out.cache);
}
