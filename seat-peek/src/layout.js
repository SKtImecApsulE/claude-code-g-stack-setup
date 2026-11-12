// Coach geometry shared by the 2D seat map and the 3D scene.
// Units are metres. The coach runs along Z; the front of the map is -Z.
//
// Every seat or berth carries its own eye position and the directions to look
// in, so the scene does not need to know what kind of coach it is drawing.

import { BERTH_NAMES } from './coaches.js';

export const CAR = {
  halfW: 1.45,
  vestibule: 1.3,
  tableGap: 0.55,
  winPeriod: 1.9,
  winWidth: 1.4,
  winBottom: 0.9,
  winTop: 1.72,
};

export const EYE_Y = 1.24;
const BAY = 1.9; // length of one berth bay
const MAIN_X0 = -CAR.halfW; // berths across the coach run from the left wall...
const MAIN_X1 = 0.4; // ...to the aisle
const SIDE_X = 1.2; // centre of the side berths along the right wall

const nearest = (target, current) =>
  target + Math.PI * 2 * Math.round((current - target) / (Math.PI * 2));

// ---------- chair cars ----------

export function buildChairLayout(type, total) {
  const [a, b] = type.layout;
  const cols = a + b;
  const { pitch } = type;
  const rows = Math.ceil(total / cols);
  const half = Math.ceil(rows / 2);
  const seatLen = rows * pitch + CAR.tableGap;
  const length = seatLen + 2 * CAR.vestibule;
  const seatW = Math.min(0.52, (2 * CAR.halfW - 0.16 - 0.56) / cols);

  // Windows are spaced on their own rhythm, not the seat pitch, so some rows
  // line up with glass and some with a pillar.
  const windows = [];
  const n = Math.floor((seatLen + 0.4) / CAR.winPeriod);
  const start = (-n * CAR.winPeriod) / 2;
  for (let i = 0; i < n; i++) {
    const c = start + (i + 0.5) * CAR.winPeriod;
    windows.push([c - CAR.winWidth / 2, c + CAR.winWidth / 2]);
  }
  const glassShare = (z0, z1) => {
    let cover = 0;
    for (const [w0, w1] of windows) cover += Math.max(0, Math.min(z1, w1) - Math.max(z0, w0));
    return cover / (z1 - z0);
  };

  const colX = (c) => (c < a
    ? -CAR.halfW + 0.08 + (c + 0.5) * seatW
    : CAR.halfW - 0.08 - (cols - 1 - c + 0.5) * seatW);

  const seats = [];
  const mapRows = [];
  const rowZ = [];
  for (let r = 0; r < rows; r++) {
    const rear = r >= half;
    const z = -seatLen / 2 + (r + 0.5) * pitch + (rear ? CAR.tableGap : 0);
    rowZ.push(z);
    // The two halves face the middle of the coach.
    const facing = rear ? -1 : 1;
    const eyeZ = z + facing * 0.15;
    const share = glassShare(eyeZ - 0.45, eyeZ + 0.45);
    const view = share >= 0.8 ? 'clear' : share >= 0.4 ? 'partial' : 'pillar';
    const table = r === half - 1 || r === half;
    const nearDoor = r < 2 || r >= rows - 2;
    const rowSeats = [];

    for (let c = 0; c < cols; c++) {
      const num = r * cols + c + 1;
      if (num > total) continue;
      const x = colX(c);
      const atWindow = c === 0 || c === cols - 1;
      const atAisle = c === a - 1 || c === a;
      const kind = atWindow && atAisle ? 'solo' : atWindow ? 'window' : atAisle ? 'aisle' : 'middle';
      const ahead = facing < 0 ? 0 : Math.PI;
      const sideYaw = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      const toward = Math.sign(nearest(ahead, sideYaw) - sideYaw) || 1;
      const seat = {
        id: String(num),
        num,
        tag: { window: 'W', aisle: 'A', middle: 'M', solo: 'W' }[kind],
        index: seats.length,
        mesh: 'fabric',
        inst: seats.length,
        x,
        z,
        facing,
        col: c,
        seatKind: kind,
        view: atWindow ? view : 'far',
        table,
        nearDoor,
        eye: [x, EYE_Y, z - facing * 0.07],
        looks: {
          window: [sideYaw + toward * 0.5, 0],
          ahead: [ahead, -0.08],
          aisle: [-sideYaw - toward * 0.5, -0.14],
        },
      };
      seats.push(seat);
      rowSeats.push(seat);
    }
    mapRows.push({
      type: 'row',
      rn: r + 1,
      view,
      left: rowSeats.filter((s) => s.col < a),
      right: rowSeats.filter((s) => s.col >= a),
    });
    if (r === half - 1) mapRows.push({ type: 'tables' });
  }

  const aisleX = (colX(a - 1) + colX(a)) / 2;
  const aisleW = colX(a) - colX(a - 1) - seatW;
  return {
    kind: 'chair',
    winBottom: CAR.winBottom,
    winTop: CAR.winTop,
    cols,
    seatW,
    seatLen,
    length,
    windows,
    seats,
    mapRows,
    aisleX,
    aisleW,
    tableZ: (rowZ[half - 1] + rowZ[Math.min(half, rows - 1)]) / 2,
    blocks: [
      [colX(0) - seatW / 2, colX(a - 1) + seatW / 2],
      [colX(a) - seatW / 2, colX(cols - 1) + seatW / 2],
    ],
    looks: ['window', 'ahead', 'aisle'],
  };
}

// ---------- sleeper and AC berth coaches ----------

// Berth numbering per bay. Prefer the API's blueprint; fall back to the
// standard pattern for the class.
function berthBays(type, total, blueprint) {
  const fromApi = (blueprint?.cabins || [])
    .map((c) => ({
      main: (c.main || []).filter((b) => Number.isFinite(b.number)),
      side: (c.side || []).filter((b) => Number.isFinite(b.number)),
    }))
    .filter((c) => c.main.length + c.side.length > 0);
  if (fromApi.length) return fromApi;

  const mainTypes = type.tiers === 3 ? ['LB', 'MB', 'UB', 'LB', 'MB', 'UB'] : ['LB', 'UB', 'LB', 'UB'];
  const sideTypes = type.side ? ['SL', 'SU'] : [];
  const per = mainTypes.length + sideTypes.length;
  const bays = [];
  for (let n = 1; n <= total; n += per) {
    const main = mainTypes.map((t, i) => ({ number: n + i, type: t })).filter((b) => b.number <= total);
    const side = sideTypes
      .map((t, i) => ({ number: n + mainTypes.length + i, type: t }))
      .filter((b) => b.number <= total);
    bays.push({ main, side });
  }
  return bays;
}

const LEVEL = (type) => String(type || '').toUpperCase().replace(/[^A-Z]/g, '');

export function buildBerthLayout(type, total, blueprint) {
  const bays = berthBays(type, total, blueprint);
  const seatLen = bays.length * BAY;
  const length = seatLen + 2 * CAR.vestibule;
  const hasSide = bays.some((b) => b.side.length);
  // top surface height of each berth level
  const heights = type.tiers === 3 ? { LB: 0.45, MB: 1.02, UB: 1.58 } : { LB: 0.45, UB: 1.45 };
  const sideHeights = { SL: 0.45, SM: 1.0, SU: 1.5 };
  const order = type.tiers === 3 ? ['LB', 'MB', 'UB'] : ['LB', 'UB'];

  const windows = [];
  const seats = [];
  const mapRows = [];
  const partitions = [];
  const mainSlabs = [];
  const sideSlabs = [];

  bays.forEach((bay, i) => {
    const zc = -seatLen / 2 + (i + 0.5) * BAY;
    windows.push([zc - CAR.winWidth / 2, zc + CAR.winWidth / 2]);
    partitions.push(zc - BAY / 2);
    if (i === bays.length - 1) partitions.push(zc + BAY / 2);
    const nearDoor = i === 0 || i === bays.length - 1;

    // Split the main berths into the two facing benches of the bay.
    const perBench = Math.ceil(bay.main.length / 2);
    const benches = [bay.main.slice(0, perBench), bay.main.slice(perBench)];
    const benchSeats = [[], []];
    benches.forEach((bench, bi) => {
      const dir = bi === 0 ? 1 : -1; // which way the middle of the bay is
      const z = zc - dir * (BAY / 2 - 0.32);
      bench.forEach((b, k) => {
        let level = LEVEL(b.type);
        if (!(level in heights)) level = order[Math.min(k, order.length - 1)];
        const y = heights[level];
        const sitting = level === 'LB' && type.tiers === 2;
        const eyeY = y + (sitting ? 0.7 : level === 'LB' ? 0.4 : 0.3);
        const seat = {
          id: String(b.number),
          num: b.number,
          tag: level,
          index: seats.length,
          mesh: 'main',
          inst: mainSlabs.length,
          berth: level,
          view: level === 'UB' ? 'none' : 'clear',
          nearDoor,
          eye: [MAIN_X0 + 0.36, eyeY, z],
          looks: {
            window: [Math.PI / 2 + dir * 0.55, level === 'LB' && !sitting ? 0.1 : 0.02],
            across: [dir > 0 ? Math.PI : 0, -0.1],
            aisle: [-Math.PI / 2 - dir * 0.3, -0.08],
          },
        };
        mainSlabs.push({ y, z, level });
        seats.push(seat);
        benchSeats[bi].push(seat);
      });
    });

    const sideSeats = bay.side.map((b, k) => {
      let level = LEVEL(b.type);
      if (!(level in sideHeights)) level = k === 0 ? 'SL' : 'SU';
      const y = sideHeights[level];
      const seat = {
        id: String(b.number),
        num: b.number,
        tag: level,
        index: seats.length,
        mesh: 'side',
        inst: sideSlabs.length,
        berth: level,
        view: level === 'SL' ? 'clear' : 'none',
        nearDoor,
        eye: [SIDE_X, y + (level === 'SL' ? 0.7 : 0.3), zc - 0.5],
        looks: {
          window: [-Math.PI / 2 - 0.45, 0.02],
          across: [Math.PI, -0.1],
          aisle: [Math.PI / 2 + 0.5, -0.1],
        },
      };
      sideSlabs.push({ y, z: zc, level });
      seats.push(seat);
      return seat;
    });

    mapRows.push({ type: 'label', text: `Bay ${i + 1}` });
    mapRows.push({ type: 'row', rn: '', view: 'clear', left: benchSeats[0], right: sideSeats.slice(0, 1) });
    mapRows.push({ type: 'row', rn: '', view: 'clear', left: benchSeats[1], right: sideSeats.slice(1) });
  });

  const aisleX = hasSide ? (MAIN_X1 + (SIDE_X - 0.25)) / 2 : (MAIN_X1 + CAR.halfW) / 2;
  const aisleW = hasSide ? SIDE_X - 0.25 - MAIN_X1 : CAR.halfW - MAIN_X1;
  return {
    kind: 'berth',
    // berth coaches have lower windows, level with someone lying down
    winBottom: 0.72,
    winTop: 1.5,
    tiers: type.tiers,
    hasSide,
    ac: type.ac,
    seatLen,
    length,
    windows,
    seats,
    mapRows,
    aisleX,
    aisleW,
    bay: BAY,
    mainX: [MAIN_X0, MAIN_X1],
    sideX: SIDE_X,
    partitions,
    mainSlabs,
    sideSlabs,
    looks: ['window', 'across', 'aisle'],
  };
}

// ---------- describing a seat ----------

const SEAT_KIND = { window: 'Window', aisle: 'Aisle', middle: 'Middle', solo: 'Solo window' };
const VIEW = { clear: 'Full window', partial: 'Partial window', pillar: 'Pillar beside you' };

export function seatFacts(seat) {
  const facts = [];
  if (seat.berth) {
    facts.push({ text: BERTH_NAMES[seat.berth] || seat.berth, good: seat.berth === 'LB' || seat.berth === 'SL' });
    facts.push(seat.view === 'none'
      ? { text: 'No window view', bad: true }
      : { text: 'Window beside you', good: true });
    if (seat.berth === 'LB' || seat.berth === 'SL') facts.push({ text: 'No climbing', good: true });
    else facts.push({ text: 'Climb to reach' });
    if (seat.berth === 'MB') facts.push({ text: 'Folds away by day' });
    if (seat.berth?.startsWith('S')) facts.push({ text: 'Shorter side berth' });
  } else {
    facts.push({ text: SEAT_KIND[seat.seatKind], good: seat.seatKind !== 'middle' });
    if (seat.seatKind === 'window' || seat.seatKind === 'solo') {
      facts.push({ text: VIEW[seat.view], good: seat.view === 'clear', bad: seat.view === 'pillar' });
    }
    if (seat.table) facts.push({ text: 'Middle of coach', good: true });
  }
  if (seat.nearDoor) facts.push({ text: 'Near the door', bad: true });
  return facts;
}

// 1-10 rating of how nice the seat is to sit in.
export function scoreSeat(seat) {
  let s = 5;
  if (seat.berth) {
    s += { LB: 3, SL: 2, MB: 0, SM: -1, UB: 0.5, SU: -0.5 }[seat.berth] ?? 0;
    if (seat.view === 'clear') s += 1;
  } else {
    if (seat.seatKind === 'window' || seat.seatKind === 'solo') {
      s += seat.view === 'clear' ? 3.5 : seat.view === 'partial' ? 2 : -1;
    }
    if (seat.seatKind === 'solo') s += 1;
    if (seat.seatKind === 'aisle') s += 0.5;
    if (seat.seatKind === 'middle') s -= 1.5;
    if (seat.table) s += 0.5;
  }
  if (seat.nearDoor) s -= 1;
  return Math.max(1, Math.min(10, Math.round(s)));
}
