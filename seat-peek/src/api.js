// Browser-side client for our /api/rail proxy (see api/rail.js).

export class RailError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const cache = new Map();

export async function rail(path, params = {}) {
  const qs = new URLSearchParams({ p: path, ...params }).toString();
  if (cache.has(qs)) return cache.get(qs);
  let res;
  try {
    res = await fetch(`/api/rail?${qs}`);
  } catch {
    throw new RailError('NETWORK', 'Could not reach the server. Check your connection.', 0);
  }
  let body = null;
  try {
    body = await res.json();
  } catch { /* handled below */ }
  if (!res.ok || !body?.success) {
    const code = body?.error?.code || `HTTP_${res.status}`;
    throw new RailError(code, friendly(code, body?.error?.message), res.status);
  }
  cache.set(qs, body.data);
  return body.data;
}

function friendly(code, message) {
  if (code === 'UNAUTHORIZED' || code === 'NO_KEY') {
    return "Train data isn't connected: the RailRadar API key is missing or was rejected.";
  }
  if (code === 'STATION_NOT_FOUND') return "We couldn't find that station. Pick one from the suggestions.";
  if (code === 'TRAIN_NOT_FOUND' || code === 'NOT_FOUND') return "We couldn't find that train number.";
  if (code === 'RATE_LIMITED' || code === 'TOO_MANY_REQUESTS') return 'Too many requests right now. Try again in a minute.';
  return message || 'Something went wrong fetching train data.';
}

export const searchStations = (q) => rail('/lookup/search/stations', { q, limit: 7 });
export const trainsBetween = (from, to, date) => rail(`/trains/between/${from}/${to}`, { date });
export const trainSchedule = (number) => rail(`/trains/${number}`, { haltsOnly: 'true' });
export const trainCoaches = (number) => rail(`/trains/${number}/coaches`);
