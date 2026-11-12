// Sample data only. Trains, times and fares are invented for the demo.

export const CLASSES = {
  first: {
    name: 'First',
    short: '1st',
    layout: [1, 2],
    rows: 9,
    pitch: 1.15,
    base: 2650,
    seat: 0x2f8572,
    carpet: 0x3a3f4a,
  },
  exec: {
    name: 'Executive',
    short: 'Exec',
    layout: [2, 2],
    rows: 11,
    pitch: 1.02,
    base: 1890,
    seat: 0xa83848,
    carpet: 0x40364a,
  },
  chair: {
    name: 'Chair Car',
    short: 'Chair',
    layout: [3, 2],
    rows: 15,
    pitch: 0.9,
    base: 745,
    seat: 0x3562b8,
    carpet: 0x39424f,
  },
};

export const ROUTE = { from: 'Mumbai', to: 'Pune', km: 192 };

export const TRAINS = [
  {
    id: 'dawn',
    name: 'Deccan Dawn',
    number: '20411',
    depart: '06:10',
    arrive: '09:05',
    duration: '2h 55m',
    coaches: [
      { id: 'E1', cls: 'exec' },
      { id: 'C1', cls: 'chair' },
      { id: 'C2', cls: 'chair' },
      { id: 'C3', cls: 'chair' },
    ],
  },
  {
    id: 'ghat',
    name: 'Ghat Flyer',
    number: '20433',
    depart: '11:40',
    arrive: '14:20',
    duration: '2h 40m',
    coaches: [
      { id: 'F1', cls: 'first' },
      { id: 'E1', cls: 'exec' },
      { id: 'E2', cls: 'exec' },
      { id: 'C1', cls: 'chair' },
    ],
  },
  {
    id: 'dusk',
    name: 'Sahyadri Dusk',
    number: '20457',
    depart: '17:25',
    arrive: '20:30',
    duration: '3h 05m',
    coaches: [
      { id: 'F1', cls: 'first' },
      { id: 'E1', cls: 'exec' },
      { id: 'C1', cls: 'chair' },
      { id: 'C2', cls: 'chair' },
    ],
  },
];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Deterministic "already booked" pattern so the map looks the same on reload.
export function isTaken(trainId, coachId, seatId) {
  return hash(`${trainId}/${coachId}/${seatId}`) < 0.38;
}

export function priceFor(cls, seat) {
  let p = cls.base;
  if (seat.type === 'window' || seat.type === 'solo') p += 60;
  if (seat.view === 'pillar') p -= 40;
  if (seat.table) p += 30;
  return p;
}

export const rupees = (n) => '₹' + n.toLocaleString('en-IN');
