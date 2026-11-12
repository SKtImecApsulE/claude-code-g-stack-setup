// Where the sun is during a journey, so we can say which side of the train it
// will be on. Standard low-precision solar position (good to about a degree).

const rad = Math.PI / 180;

export function sunPosition(date, lat, lng) {
  const d = date.getTime() / 86400000 - 10957.5; // days since J2000
  const L = (280.46 + 0.9856474 * d) % 360;
  const g = ((357.528 + 0.9856003 * d) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * d) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const hourAngle = (gmst * 15 + lng) * rad - ra;
  const phi = lat * rad;
  const elevation = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hourAngle));
  const azimuth = Math.atan2(
    -Math.sin(hourAngle),
    Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(hourAngle),
  );
  return { elevation: elevation / rad, azimuth: ((azimuth / rad) + 360) % 360 };
}

export function bearing(a, b) {
  const p1 = a.lat * rad;
  const p2 = b.lat * rad;
  const dl = (b.lng - a.lng) * rad;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}

// `departUtc` is a Date; `minutes` the journey length. Samples the middle of the trip.
export function journeySun(from, to, departUtc, minutes) {
  if (![from?.lat, from?.lng, to?.lat, to?.lng].every(Number.isFinite)) return null;
  const mid = new Date(departUtc.getTime() + (minutes || 0) * 30000);
  const here = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 };
  const sun = sunPosition(mid, here.lat, here.lng);
  const rel = ((sun.azimuth - bearing(from, to) + 540) % 360) - 180; // + = right of travel
  let side = Math.abs(rel) < 25 ? 'ahead' : Math.abs(rel) > 155 ? 'behind' : rel > 0 ? 'right' : 'left';
  if (sun.elevation < -4) side = 'night';
  const light = sun.elevation < -4 ? 'night' : sun.elevation < 12 ? 'golden' : 'day';
  return { side, light, elevation: sun.elevation };
}
