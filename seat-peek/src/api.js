// Browser-side client for our /api/rail proxy (see api/rail.js).

export class RailError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const cache = new Map();

export async function rail(path, params = {}, { remember = true } = {}) {
  const qs = new URLSearchParams({ p: path, ...params }).toString();
  if (remember && cache.has(qs)) return cache.get(qs);
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
    throw new RailError(code, friendly(code, body?.error?.message, res.status), res.status);
  }
  if (remember) cache.set(qs, body.data);
  return body.data;
}

function friendly(code, message, status) {
  if (status === 403 && /subscription|plan/i.test(message || '')) {
    return "Fares, availability and PNR lookup aren't included in this site's train-data plan yet.";
  }
  if (code === 'UNAUTHORIZED' || code === 'NO_KEY') {
    return "Train data isn't connected: the RailRadar API key is missing or was rejected.";
  }
  if (code === 'STATION_NOT_FOUND') return "We couldn't find that station. Pick one from the suggestions.";
  if (code === 'TRAIN_NOT_FOUND' || code === 'NOT_FOUND') return "We couldn't find that train number.";
  if (code === 'PNR_NOT_FOUND' || (code === 'VALIDATION_ERROR' && /pnr/i.test(message || ''))) return "We couldn't find that PNR. Check the 10 digits.";
  if (code === 'RATE_LIMITED' || code === 'TOO_MANY_REQUESTS') return 'Too many requests right now. Try again in a minute.';
  return message || 'Something went wrong fetching train data.';
}

export const searchStations = (q) => rail('/lookup/search/stations', { q, limit: 7 });
export const trainsBetween = (from, to, date) => rail(`/trains/between/${from}/${to}`, { date });
export const trainSchedule = (number) => rail(`/trains/${number}`, { haltsOnly: 'true' });
export const trainCoaches = (number) => rail(`/trains/${number}/coaches`);
export const trainRoute = (number) => rail(`/trains/${number}/route`, { format: 'polyline' });
const journey = (j) => ({ source: j.from, destination: j.to, journeyDate: j.date, classCode: j.classCode, quotaCode: 'GN' });
export const seatAvailability = (number, j) => rail(`/trains/${number}/seats`, journey(j));
export const trainFare = (number, j) => rail(`/trains/${number}/fare`, journey(j));
export const pnrStatus = (pnr) => rail(`/pnr/${pnr}`, {}, { remember: false });
