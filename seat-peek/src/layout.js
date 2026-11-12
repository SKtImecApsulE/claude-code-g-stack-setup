// Coach geometry shared by the 2D seat map and the 3D scene.
// Units are metres. The coach runs along Z and travels toward -Z.
// Row 1 is at the front (most negative Z).

export const CAR = {
  halfW: 1.45,
  height: 2.3,
  vestibule: 1.3,
  tableGap: 0.55,
  winPeriod: 1.9,
  winWidth: 1.4,
  winBottom: 0.9,
  winTop: 1.72,
};

const LETTERS = 'ABCDEF';

export function buildLayout(cls) {
  const [a, b] = cls.layout;
  const cols = a + b;
  const { rows, pitch } = cls;
  const half = Math.ceil(rows / 2);
  const seatLen = rows * pitch + CAR.tableGap;
  const length = seatLen + 2 * CAR.vestibule;
  const seatW = Math.min(0.52, (2 * CAR.halfW - 0.16 - 0.56) / cols);

  // Windows are spaced on their own rhythm, not the seat pitch, so some
  // rows line up with glass and some with a pillar - just like real coaches.
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

  const seats = [];
  const rowInfo = [];
  for (let r = 0; r < rows; r++) {
    const rear = r >= half;
    const z = -seatLen / 2 + (r + 0.5) * pitch + (rear ? CAR.tableGap : 0);
    // Front half faces backward (+Z), rear half faces forward (-Z); the two
    // halves meet at tables in the middle of the coach.
    const facing = rear ? -1 : 1;
    const eyeZ = z + facing * 0.15;
    const share = glassShare(eyeZ - 0.45, eyeZ + 0.45);
    const view = share >= 0.8 ? 'clear' : share >= 0.4 ? 'partial' : 'pillar';
    const table = r === half - 1 || r === half;
    const nearDoor = r < 2 || r >= rows - 2;
    rowInfo.push({ row: r + 1, z, facing, view, table, nearDoor });

    for (let c = 0; c < cols; c++) {
      const left = c < a;
      const x = left
        ? -CAR.halfW + 0.08 + (c + 0.5) * seatW
        : CAR.halfW - 0.08 - (cols - 1 - c + 0.5) * seatW;
      const atWindow = c === 0 || c === cols - 1;
      const atAisle = c === a - 1 || c === a;
      const type = atWindow && atAisle ? 'solo' : atWindow ? 'window' : atAisle ? 'aisle' : 'middle';
      seats.push({
        id: `${r + 1}${LETTERS[c]}`,
        index: seats.length,
        row: r + 1,
        col: c,
        letter: LETTERS[c],
        side: left ? 'L' : 'R',
        x,
        z,
        facing,
        type,
        view,
        table,
        nearDoor,
      });
    }
  }

  return { a, b, cols, rows, half, pitch, seatW, seatLen, length, windows, seats, rowInfo };
}

// 1-10 rating of how nice the seat is to sit in.
export function scoreSeat(seat) {
  let s = 5;
  if (seat.type === 'window' || seat.type === 'solo') {
    s += seat.view === 'clear' ? 3 : seat.view === 'partial' ? 1.5 : -1;
  }
  if (seat.type === 'solo') s += 1;
  if (seat.type === 'middle') s -= 1.5;
  if (seat.facing < 0) s += 1;
  if (seat.table) s += 0.5;
  if (seat.nearDoor) s -= 1;
  return Math.max(1, Math.min(10, Math.round(s)));
}
