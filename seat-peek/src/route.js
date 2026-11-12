// Route map: decode RailRadar's track geometry and draw it as a small SVG.

// Google encoded polyline (precision 5) -> [[lat, lng], ...]
export function decodePolyline(str) {
  const out = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && i < str.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    lat += next();
    lng += next();
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

export function routePoints(data) {
  if (Array.isArray(data?.coordinates) && data.coordinates.length) return data.coordinates;
  if (data?.encodedPolyline) return decodePolyline(data.encodedPolyline);
  const geo = data?.geojson?.geometry?.coordinates;
  return Array.isArray(geo) ? geo.map(([lng, lat]) => [lat, lng]) : [];
}

const nearestIndex = (pts, p) => {
  let best = 0;
  let bestD = Infinity;
  pts.forEach(([lat, lng], i) => {
    const d = (lat - p.lat) ** 2 + (lng - p.lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
};

// `from` / `to` are { code, lat, lng } for the part of the route being travelled.
export function routeSvg(points, from, to) {
  if (points.length < 2) return '';
  const step = Math.max(1, Math.floor(points.length / 500));
  const pts = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  const meanLat = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const k = Math.cos((meanLat * Math.PI) / 180);
  const xy = pts.map(([lat, lng]) => [lng * k, -lat]);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const size = 200;
  const pad = 22;
  const scale = (size - pad * 2) / Math.max(maxX - minX, maxY - minY, 1e-6);
  const ox = (size - (maxX - minX) * scale) / 2;
  const oy = (size - (maxY - minY) * scale) / 2;
  const P = xy.map(([x, y]) => [ox + (x - minX) * scale, oy + (y - minY) * scale]);
  const line = (arr) => arr.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

  let a = 0;
  let b = P.length - 1;
  if (Number.isFinite(from?.lat) && Number.isFinite(to?.lat)) {
    a = nearestIndex(pts, from);
    b = nearestIndex(pts, to);
  }
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const label = (p, text, end) => {
    const left = p[0] > size / 2;
    return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" class="${end}"/>
      <text x="${(p[0] + (left ? -7 : 7)).toFixed(1)}" y="${(p[1] + 4).toFixed(1)}" text-anchor="${left ? 'end' : 'start'}">${text}</text>`;
  };
  return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Route map, north up">
    <polyline class="all" points="${line(P)}"/>
    <polyline class="leg" points="${line(P.slice(lo, hi + 1))}"/>
    ${label(P[a], from?.code || 'Start', 'from')}
    ${label(P[b], to?.code || 'End', 'to')}
    <text x="${size - 8}" y="14" text-anchor="end" class="north">N ↑</text>
  </svg>`;
}
