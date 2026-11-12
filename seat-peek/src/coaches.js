// Indian Railways coach types, keyed by the RailRadar coach `category`.
// Capacities are the common LHB figures and are only used when the API does
// not report one for the coach.

export const COACH_TYPES = {
  ec: { kind: 'chair', name: 'Executive Chair Car', short: 'EC', layout: [2, 2], total: 56, pitch: 1.02, seat: 0xa83848, carpet: 0x40364a },
  cc: { kind: 'chair', name: 'AC Chair Car', short: 'CC', layout: [3, 2], total: 78, pitch: 0.9, seat: 0x3562b8, carpet: 0x39424f },
  ev: { kind: 'chair', name: 'Vistadome', short: 'EV', layout: [2, 2], total: 44, pitch: 1.1, seat: 0x2f8572, carpet: 0x3a3f4a },
  '2s': { kind: 'chair', name: 'Second Sitting', short: '2S', layout: [3, 3], total: 108, pitch: 0.8, seat: 0x3f7f58, carpet: 0x3b4038 },
  '1a': { kind: 'berth', name: 'AC First Class', short: '1A', tiers: 2, side: false, total: 24, ac: true, seat: 0x8a3b45, carpet: 0x47323a },
  '2a': { kind: 'berth', name: 'AC 2-Tier', short: '2A', tiers: 2, side: true, total: 54, ac: true, seat: 0x44608f, carpet: 0x3a4250 },
  '3a': { kind: 'berth', name: 'AC 3-Tier', short: '3A', tiers: 3, side: true, total: 72, ac: true, seat: 0x44608f, carpet: 0x3a4250 },
  '3e': { kind: 'berth', name: 'AC 3-Tier Economy', short: '3E', tiers: 3, side: true, total: 83, ac: true, seat: 0x4f6a7e, carpet: 0x3a4250 },
  sl: { kind: 'berth', name: 'Sleeper', short: 'SL', tiers: 3, side: true, total: 80, ac: false, seat: 0x3d6fb5, carpet: 0x4a4d52 },
};

export const BERTH_NAMES = {
  LB: 'Lower berth',
  MB: 'Middle berth',
  UB: 'Upper berth',
  SL: 'Side lower',
  SM: 'Side middle',
  SU: 'Side upper',
};

// Turn the API's rake list into the coaches a passenger can pick a seat in.
export function passengerCoaches(rake = []) {
  return rake
    .filter((c) => COACH_TYPES[String(c.category).toLowerCase()])
    .map((c) => {
      const category = String(c.category).toLowerCase();
      return {
        code: c.code,
        position: c.position,
        category,
        classType: c.classType,
        className: c.className || COACH_TYPES[category].name,
        total: Number(c.totalBerths) > 0 ? Number(c.totalBerths) : COACH_TYPES[category].total,
        type: COACH_TYPES[category],
      };
    });
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
