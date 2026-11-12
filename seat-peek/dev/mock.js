// Canned responses in the shape of the RailRadar API, for developing without
// a key: RAIL_MOCK=1 npm run dev. Station and train details here are rough
// stand-ins, not authoritative data.

const ok = (data) => ({ success: true, data, meta: { source: 'mock' } });
const stations = [
  { code: 'NDLS', name: 'New Delhi', lat: 28.6417, lng: 77.2203 },
  { code: 'BPL', name: 'Bhopal Jn', lat: 23.2687, lng: 77.4126 },
  { code: 'CSMT', name: 'Mumbai CSMT', lat: 18.9398, lng: 72.8355 },
  { code: 'MMCT', name: 'Mumbai Central', lat: 18.9696, lng: 72.8194 },
  { code: 'PUNE', name: 'Pune Jn', lat: 18.5289, lng: 73.8744 },
];
const st = (code) => stations.find((s) => s.code === code) || { code, name: code, lat: 22, lng: 78 };
const coach = (position, code, category, classType, className, totalBerths) =>
  ({ position, code, category, classType, className, totalBerths, hasSeats: category !== 'loco' && category !== 'pc' });

const trains = {
  12002: {
    name: 'Bhopal Shatabdi', type: 'Shatabdi', from: 'NDLS', to: 'BPL', dep: '06:00', arr: '14:30', minutes: 510,
    rake: [coach(1, 'ENG', 'loco', 'LOCO', 'Locomotive', 0), coach(2, 'E1', 'ec', 'EC', 'Executive Chair Car (EC)', 56),
      ...Array.from({ length: 6 }, (_, i) => coach(3 + i, `C${i + 1}`, 'cc', 'CC', 'AC Chair Car (CC)', 78)),
      coach(9, 'E2', 'ec', 'EC', 'Executive Chair Car (EC)', 56)],
  },
  12952: {
    name: 'Mumbai Rajdhani Express', type: 'Rajdhani', from: 'NDLS', to: 'MMCT', dep: '16:55', arr: '08:35', minutes: 940,
    rake: [coach(1, 'ENG', 'loco', 'LOCO', 'Locomotive', 0), coach(2, 'H1', '1a', '1A', 'AC First Class (1A)', 24),
      coach(3, 'A1', '2a', '2A', 'AC 2-Tier (2A)', 54), coach(4, 'A2', '2a', '2A', 'AC 2-Tier (2A)', 54),
      coach(5, 'PC', 'pc', 'PC', 'Pantry Car', 0),
      ...Array.from({ length: 5 }, (_, i) => coach(6 + i, `B${i + 1}`, '3a', '3A', 'AC 3-Tier (3A)', 72)),
      coach(11, 'S1', 'sl', 'SL', 'Sleeper (SL)', 80)],
  },
};

function blueprint3A() {
  const types = ['LB', 'MB', 'UB', 'LB', 'MB', 'UB'];
  return {
    classCode: '3A', className: 'AC 3 Tier', totalBerths: 72, hasSeats: true,
    cabins: Array.from({ length: 9 }, (_, c) => ({
      cabinNumber: c + 1,
      main: types.map((type, i) => ({ number: c * 8 + i + 1, type })),
      side: [{ number: c * 8 + 7, type: 'SL' }, { number: c * 8 + 8, type: 'SU' }],
    })),
  };
}

export default function mock(path, params) {
  let m;
  if (path === '/lookup/search/stations') {
    const q = String(params.get('q') || '').toLowerCase();
    return ok(stations.filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().startsWith(q))
      .map((s) => ({ ...s, city: null, popularity: 100, isActive: true })));
  }
  if ((m = path.match(/^\/trains\/between\/(\w+)\/(\w+)$/))) {
    const [from, to] = [m[1].toUpperCase(), m[2].toUpperCase()];
    const list = Object.entries(trains).filter(([, t]) => t.from === from && t.to === to).map(([number, t]) => ({
      train: { number, name: t.name, type: t.type, runDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
      from: { ...st(from), departure: t.dep, day: 1, sequence: 1 },
      to: { ...st(to), arrival: t.arr, day: 1, sequence: 9 },
      distance: 705, duration: t.minutes, totalHaltsBetween: 7,
    }));
    return ok({ from: st(from), to: st(to), count: list.length, trains: list });
  }
  if ((m = path.match(/^\/trains\/(\w+)\/coaches$/))) {
    const t = trains[m[1]];
    if (!t) return { status: 404, body: { success: false, error: { code: 'TRAIN_NOT_FOUND', message: 'Train not found' } } };
    return ok({
      trainNumber: m[1], trainName: t.name, sourceStation: st(t.from), destinationStation: st(t.to),
      coachPosition: t.rake.map((c) => c.code).join('-'), totalCoaches: t.rake.length, rake: t.rake,
      blueprints: { '3A': blueprint3A() }, summary: {}, stationVariations: { reversals: [], stops: {} },
    });
  }
  if ((m = path.match(/^\/trains\/(\w+)$/))) {
    const t = trains[m[1]];
    if (!t) return { status: 404, body: { success: false, error: { code: 'TRAIN_NOT_FOUND', message: 'Train not found' } } };
    return ok({
      train: { number: m[1], name: t.name, type: t.type, source: st(t.from), destination: st(t.to), runDays: [] },
      route: [
        { sequence: 1, station: st(t.from), arrival: null, departure: t.dep, departureDay: 1, isHalt: true },
        { sequence: 2, station: st(t.to), arrival: t.arr, arrivalDay: t.arr < t.dep ? 2 : 1, departure: null, isHalt: true },
      ],
    });
  }
  if ((m = path.match(/^\/trains\/(\w+)\/fare$/))) {
    return ok({ trainNumber: m[1], trainName: 'MOCK', distance: 705, breakdown: { baseFare: 1750, reservationCharge: 40, superfastCharge: 45, goodsServiceTax: 95, cateringCharge: 215, totalFare: 2145 } });
  }
  if ((m = path.match(/^\/trains\/(\w+)\/seats$/))) {
    const day = (i) => new Date(Date.parse(params.get('journeyDate')) + i * 86400000).toISOString().slice(0, 10);
    return ok({ trainNumber: m[1], classCode: params.get('classCode'), quotaCode: 'GN', calendar: [
      { date: day(0), rawDate: day(0), status: 'AVAILABLE-0042', statusCode: 'AVAILABLE', isAvailable: true, availableSeats: 42 },
      { date: day(1), rawDate: day(1), status: 'RAC 24/RAC 12', statusCode: 'RAC', isAvailable: false, waitlistNumber: 12 },
      { date: day(2), rawDate: day(2), status: 'GNWL24/WL11', statusCode: 'WAITLIST', isAvailable: false, waitlistNumber: 11, waitlistType: 'GNWL' },
    ] });
  }
  if ((m = path.match(/^\/trains\/(\w+)\/route$/))) {
    const t = trains[m[1]] || trains[12002];
    const [a, b] = [st(t.from), st(t.to)];
    return ok({ trainNumber: m[1], format: 'coordinates', coordinates: Array.from({ length: 40 }, (_, i) => [
      a.lat + ((b.lat - a.lat) * i) / 39 + Math.sin(i / 4) * 0.25, a.lng + ((b.lng - a.lng) * i) / 39 + Math.cos(i / 5) * 0.2]) });
  }
  if ((m = path.match(/^\/pnr\/(\d{10})$/))) {
    if (m[1] !== '1234567890') return { status: 404, body: { success: false, error: { code: 'PNR_NOT_FOUND', message: 'PNR not found' } } };
    return ok({
      pnrNumber: m[1],
      train: { number: '12952', name: 'MUMBAI RAJDHANI', source: st('NDLS'), destination: st('MMCT'), boardingPoint: st('NDLS'), reservationUpto: st('MMCT') },
      journey: { date: '2026-11-20', class: '3A', quota: 'GN', bookingFare: '2145' },
      charting: { isPrepared: false, status: 'Chart Not Prepared' },
      passengers: [
        { passengerNumber: 1, bookingStatus: 'WL/14/GN', currentStatus: 'CNF', coach: 'B4', berthNumber: 58, berthCode: 'LB', isConfirmed: true },
        { passengerNumber: 2, bookingStatus: 'WL/15/GN', currentStatus: 'CNF', coach: 'B4', berthNumber: 59, berthCode: 'MB', isConfirmed: true },
      ],
    });
  }
  return { status: 404, body: { success: false, error: { code: 'NOT_FOUND', message: 'No mock for this path' } } };
}
