import './style.css';
import {
  RailError, searchStations, trainsBetween, trainSchedule, trainCoaches,
  trainRoute, seatAvailability, trainFare, pnrStatus,
} from './api.js';
import { routePoints, routeSvg } from './route.js';
import { passengerCoaches, ordinal } from './coaches.js';
import { buildChairLayout, buildBerthLayout, seatFacts, scoreSeat } from './layout.js';
import { journeySun } from './sun.js';
import { SeatScene } from './scene.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TIMES = [
  { id: 'day', label: '☀ Day' },
  { id: 'golden', label: '🌇 Sunset' },
  { id: 'night', label: '🌙 Night' },
];
const LOOK_LABELS = { window: 'Window', ahead: 'Ahead', aisle: 'Aisle', across: 'Across' };
const POPULAR = [
  ['NDLS', 'New Delhi', 'BPL', 'Bhopal Jn'],
  ['CSMT', 'Mumbai CSMT', 'PUNE', 'Pune Jn'],
  ['MAS', 'Chennai Central', 'SBC', 'Bengaluru'],
  ['HWH', 'Howrah Jn', 'NDLS', 'New Delhi'],
];
const IRCTC_URL = 'https://www.irctc.co.in/nget/train-search';

const tomorrow = () => {
  const d = new Date(Date.now() + 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const niceDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const duration = (min) => (Number.isFinite(min) ? `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m` : '');

const search = { from: null, to: null, date: tomorrow() };
const state = { train: null, coaches: [], coach: 0, seat: null, time: 0, layout: null };
let scene = null;

// ---------- home: search ----------

function renderHome() {
  $('home').innerHTML = `
    <header class="hero">
      <p class="brand">SeatPeek</p>
      <h1>Sit in the seat<br />before you book it.</h1>
      <p class="sub">Find a real Indian Railways train, pick a coach and a seat or berth number, and look around from it in 3D.</p>
    </header>
    <form id="searchForm" class="search" autocomplete="off">
      <div class="field" data-field="from">
        <label for="fromInput">From</label>
        <input id="fromInput" placeholder="Station name or code" />
        <ul class="suggest" hidden></ul>
      </div>
      <button type="button" id="swap" class="swap" aria-label="Swap stations">&#8645;</button>
      <div class="field" data-field="to">
        <label for="toInput">To</label>
        <input id="toInput" placeholder="Station name or code" />
        <ul class="suggest" hidden></ul>
      </div>
      <div class="field">
        <label for="dateInput">Date</label>
        <input id="dateInput" type="date" value="${search.date}" />
      </div>
      <button class="book" type="submit">Find trains</button>
    </form>
    <div class="chips popular">
      ${POPULAR.map((p, i) => `<button class="chip link" data-popular="${i}">${p[1]} → ${p[3]}</button>`).join('')}
    </div>
    <form id="numberForm" class="by-number" autocomplete="off">
      <input id="numberInput" inputmode="numeric" placeholder="Or enter a train number, e.g. 12002" />
      <button class="pill solid" type="submit">Open</button>
    </form>
    <form id="pnrForm" class="by-number" autocomplete="off">
      <input id="pnrInput" inputmode="numeric" maxlength="10" placeholder="Have a ticket? Enter your 10-digit PNR" />
      <button class="pill solid" type="submit">Find my berth</button>
    </form>
    <div id="results" class="results"></div>
    <p class="note">Train, timetable and coach data from RailRadar. SeatPeek is not affiliated with Indian Railways or IRCTC. Seat positions follow the standard layout for each coach type and can differ on the day.</p>`;
}

function setStation(which, station) {
  search[which] = station;
  $(`${which}Input`).value = station ? `${station.name} (${station.code})` : '';
}

// A typed value counts as a station code if the user never picked a suggestion.
function resolveStation(which) {
  const typed = $(`${which}Input`).value.trim();
  const picked = search[which];
  if (picked && typed === `${picked.name} (${picked.code})`) return picked;
  if (/^[A-Za-z]{2,5}$/.test(typed)) return { code: typed.toUpperCase(), name: typed.toUpperCase() };
  return null;
}

let suggestTimer = 0;
function onStationInput(field) {
  const which = field.dataset.field;
  const input = field.querySelector('input');
  const list = field.querySelector('.suggest');
  clearTimeout(suggestTimer);
  const q = input.value.trim();
  if (q.length < 2) return (list.hidden = true);
  suggestTimer = setTimeout(async () => {
    try {
      const stations = await searchStations(q);
      if (input.value.trim() !== q) return;
      list.innerHTML = stations.length
        ? stations.map((s) => `<li><button type="button" data-code="${esc(s.code)}" data-name="${esc(s.name)}">${esc(s.name)} <b>${esc(s.code)}</b></button></li>`).join('')
        : '<li class="none">No stations found</li>';
      list.hidden = false;
      list.dataset.which = which;
    } catch (err) {
      list.innerHTML = `<li class="none">${esc(err.message)}</li>`;
      list.hidden = false;
    }
  }, 220);
}

async function runSearch() {
  const from = resolveStation('from');
  const to = resolveStation('to');
  const box = $('results');
  if (!from || !to) {
    box.innerHTML = '<p class="msg">Choose both stations from the suggestions.</p>';
    return;
  }
  search.date = $('dateInput').value || tomorrow();
  box.innerHTML = '<p class="msg loading">Finding trains…</p>';
  try {
    const data = await trainsBetween(from.code, to.code, search.date);
    renderResults(data);
  } catch (err) {
    box.innerHTML = `<p class="msg error">${esc(err.message)}</p>`;
  }
}

function renderResults(data) {
  const trains = [...(data.trains || [])].sort((a, b) => String(a.from?.departure).localeCompare(String(b.from?.departure)));
  if (!trains.length) {
    $('results').innerHTML = `<p class="msg">No direct trains from ${esc(data.from?.name)} to ${esc(data.to?.name)} on ${niceDate(search.date)}.</p>`;
    return;
  }
  state.results = trains;
  const cards = trains.map((t, i) => `
    <button class="train" data-result="${i}">
      <div class="train-head">
        <strong>${esc(t.train.name)}</strong><span class="num">${esc(t.train.number)}</span>
      </div>
      <div class="times">
        <div><b>${esc(t.from.departure || '--:--')}</b><span>${esc(t.from.code)}</span></div>
        <div class="line"><span>${duration(t.duration)}${t.distance ? ` · ${Math.round(t.distance)} km` : ''}</span></div>
        <div><b>${esc(t.to.arrival || '--:--')}</b><span>${esc(t.to.code)}</span></div>
      </div>
      <div class="chips">
        ${t.train.type ? `<span class="chip">${esc(t.train.type)}</span>` : ''}
        <span class="chip">${(t.train.runDays || []).length === 7 ? 'Daily' : esc((t.train.runDays || []).join(' ').toUpperCase())}</span>
      </div>
      <span class="cta">See the coaches &#8594;</span>
    </button>`).join('');
  $('results').innerHTML = `
    <h2>${trains.length} train${trains.length > 1 ? 's' : ''} · ${esc(data.from?.name)} → ${esc(data.to?.name)} · ${niceDate(search.date)}</h2>
    <div class="trains">${cards}</div>`;
}

$('home').addEventListener('input', (e) => {
  const field = e.target.closest('[data-field]');
  if (field) onStationInput(field);
});
$('home').addEventListener('click', (e) => {
  const pick = e.target.closest('.suggest button');
  if (pick) {
    const list = pick.closest('.suggest');
    setStation(list.dataset.which, { code: pick.dataset.code, name: pick.dataset.name });
    list.hidden = true;
    return;
  }
  document.querySelectorAll('.suggest').forEach((l) => (l.hidden = true));
  if (e.target.closest('#swap')) {
    const [a, b] = [resolveStation('from'), resolveStation('to')];
    setStation('from', b);
    setStation('to', a);
    return;
  }
  const pop = e.target.closest('[data-popular]');
  if (pop) {
    const p = POPULAR[pop.dataset.popular];
    setStation('from', { code: p[0], name: p[1] });
    setStation('to', { code: p[2], name: p[3] });
    return runSearch();
  }
  const card = e.target.closest('[data-result]');
  if (card) {
    const t = state.results[card.dataset.result];
    openTrain(t.train.number, {
      name: t.train.name,
      from: t.from,
      to: t.to,
      minutes: t.duration,
      date: search.date,
    });
  }
});
$('home').addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id === 'searchForm') runSearch();
  if (e.target.id === 'numberForm') {
    const n = $('numberInput').value.trim();
    if (/^[0-9A-Za-z_-]{3,20}$/.test(n)) openTrain(n, { date: search.date });
    else $('results').innerHTML = '<p class="msg">Enter a train number, usually 5 digits.</p>';
  }
  if (e.target.id === 'pnrForm') openPnr($('pnrInput').value.replace(/\D/g, ''));
});

// ---------- PNR: jump straight to the berth on a ticket ----------

async function openPnr(pnr) {
  const box = $('results');
  if (!/^\d{10}$/.test(pnr)) {
    box.innerHTML = '<p class="msg">A PNR has 10 digits.</p>';
    return;
  }
  box.innerHTML = '<p class="msg loading">Looking up your ticket…</p>';
  try {
    const data = await pnrStatus(pnr);
    box.innerHTML = '';
    const stn = (s) => (s?.code ? { code: s.code, name: s.name || s.code } : null);
    openTrain(data.train.number, {
      name: data.train.name,
      from: stn(data.train.boardingPoint) || stn(data.train.source),
      to: stn(data.train.reservationUpto) || stn(data.train.destination),
      date: /^\d{4}-\d{2}-\d{2}/.test(data.journey?.date || '') ? data.journey.date.slice(0, 10) : search.date,
      pnr: { passengers: data.passengers || [], classCode: data.journey?.class, charting: data.charting?.status },
    });
  } catch (err) {
    box.innerHTML = `<p class="msg error">${esc(err.message)}</p>`;
  }
}

// Open the coach and berth of one passenger on the ticket.
function showPassenger(i) {
  const p = state.train.pnr?.passengers?.[i];
  if (!p) return;
  state.train.pnr.active = i;
  const idx = state.coaches.findIndex((c) => String(c.code).toUpperCase() === String(p.coach || '').toUpperCase());
  if (idx < 0) return renderMap(); // waitlisted, or a coach we cannot draw
  openCoach(idx);
  if (p.berthNumber) selectSeat(p.berthNumber);
}

// ---------- train view ----------

function stageMessage(html) {
  $('stageMsg').hidden = !html;
  $('stageMsg').innerHTML = html || '';
}

async function openTrain(number, ctx) {
  $('home').hidden = true;
  $('booking').hidden = false;
  window.scrollTo(0, 0);
  state.train = { number, ...ctx };
  state.avail = {};
  state.berthMode = null;
  $('routeMap').hidden = true;
  $('routeMap').innerHTML = '';
  state.coaches = [];
  state.seat = null;
  $('trainName').textContent = `${ctx.name || 'Train'} · ${number}`;
  $('trainMeta').textContent = 'Loading coaches…';
  $('coaches').innerHTML = '';
  $('map').innerHTML = '';
  $('seatCard').innerHTML = '';
  $('lookBtns').innerHTML = '';
  $('viewLabel').textContent = '';
  stageMessage('<p class="loading">Loading the train…</p>');

  const [coaches, schedule] = await Promise.allSettled([trainCoaches(number), trainSchedule(number)]);
  if (state.train.number !== number || $('booking').hidden) return; // user went back

  if (coaches.status !== 'fulfilled') {
    const err = coaches.reason;
    $('trainMeta').textContent = '';
    stageMessage(`<p class="error">${esc(err instanceof RailError ? err.message : 'Could not load this train.')}</p>`);
    return;
  }
  const comp = coaches.value;
  const sched = schedule.status === 'fulfilled' ? schedule.value : null;
  describeJourney(comp, sched);

  state.blueprints = comp.blueprints || {};
  state.coaches = passengerCoaches(comp.rake);
  if (!state.coaches.length) {
    stageMessage('<p>No reserved coach layouts are available for this train.</p>');
    return;
  }
  stageMessage('');
  if (!scene) {
    scene = new SeatScene($('view'));
    scene.onUserLook = () => $('hint').classList.add('gone');
  }
  scene.resize();
  scene.start();
  setTime(Math.max(0, TIMES.findIndex((t) => t.id === state.train.light)));
  state.berthMode = state.train.light === 'night' ? 'night' : 'day';
  openCoach(0);
  if (state.train.pnr) showPassenger(0);
}

// Fill in route, times and where the sun will be from the timetable.
function describeJourney(comp, sched) {
  const t = state.train;
  t.name = t.name || comp.trainName || sched?.train?.name;
  $('trainName').textContent = `${t.name || 'Train'} · ${t.number}`;
  const stops = sched?.route || [];
  const byCode = (code) => stops.find((s) => s.station?.code === code);
  const first = stops[0];
  const last = stops[stops.length - 1];
  const fromStop = (t.from && byCode(t.from.code)) || first;
  const toStop = (t.to && byCode(t.to.code)) || last;
  const fromName = t.from?.name || fromStop?.station?.name || comp.sourceStation?.name || '';
  const toName = t.to?.name || toStop?.station?.name || comp.destinationStation?.name || '';
  const dep = t.from?.departure || fromStop?.departure || '';
  const arr = t.to?.arrival || toStop?.arrival || '';
  $('trainMeta').textContent = `${fromName} ${dep} → ${toName} ${arr} · ${niceDate(t.date)}`;
  // the stretch being travelled, for fares, availability and the route map
  t.leg = {
    from: { code: t.from?.code || fromStop?.station?.code || comp.sourceStation?.code, ...pick(fromStop?.station) },
    to: { code: t.to?.code || toStop?.station?.code || comp.destinationStation?.code, ...pick(toStop?.station) },
  };

  t.light = 'day';
  t.sun = null;
  if (fromStop && toStop && dep) {
    const minutes = t.minutes ?? minutesBetween(fromStop, toStop);
    // timetable times are IST (UTC+5:30)
    const departUtc = new Date(`${t.date}T${dep}:00+05:30`);
    // One mid-journey sample says little about a trip longer than about 14 hours.
    const sun = minutes <= 840 ? journeySun(fromStop.station, toStop.station, departUtc, minutes) : null;
    if (sun) {
      t.sun = sun;
      t.light = sun.light;
    } else {
      const h = parseInt(dep, 10);
      t.light = h >= 19 || h < 5 ? 'night' : h >= 17 ? 'golden' : 'day';
    }
  }
}

const pick = (s) => (s ? { lat: s.lat, lng: s.lng } : {});

function minutesBetween(a, b) {
  const at = (time, day) => {
    if (!time) return null;
    const [h, m] = time.split(':').map(Number);
    return ((day || 1) - 1) * 1440 + h * 60 + m;
  };
  const d = at(a.departure, a.departureDay);
  const e = at(b.arrival || b.departure, b.arrivalDay || b.departureDay);
  return d != null && e != null && e > d ? e - d : 0;
}

function closeTrain() {
  scene?.stop();
  $('booking').hidden = true;
  $('booking').classList.remove('expanded');
  $('home').hidden = false;
}

function openCoach(i) {
  state.coach = i;
  state.seat = null;
  const coach = state.coaches[i];
  const blueprint = state.blueprints[coach.classType] || state.blueprints[coach.category.toUpperCase()];
  state.layout = coach.type.kind === 'chair'
    ? buildChairLayout(coach.type, coach.total, blueprint)
    : buildBerthLayout(coach.type, coach.total, blueprint, state.berthMode);
  $('modeBtn').hidden = !state.layout.canFold;
  $('modeBtn').textContent = state.layout.mode === 'day' ? 'Berths: day' : 'Berths: night';
  scene.setCoach(state.layout, coach.type, coach.code);
  $('coaches').innerHTML = state.coaches
    .map((c, k) => `
      <button class="coach ${k === i ? 'on' : ''}" data-coach="${k}">
        <b>${esc(c.code)}</b><span>${c.type.short}</span>
      </button>`)
    .join('');
  document.querySelector('.coach.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  $('lookBtns').innerHTML = [...state.layout.looks, 'coach']
    .map((l) => `<button data-look="${l}" class="pill">${l === 'coach' ? 'Coach' : LOOK_LABELS[l]}</button>`)
    .join('');
  renderMap();
  renderSeatCard();
  updateStage();
  $('map').scrollTop = 0;
}

const SUN_TEXT = {
  left: '☀ Sun mostly on the <b>left</b> side of the train, facing the way it moves',
  right: '☀ Sun mostly on the <b>right</b> side of the train, facing the way it moves',
  ahead: '☀ Sun mostly ahead of the train',
  behind: '☀ Sun mostly behind the train',
  night: '🌙 Mostly after dark on this trip',
};

function renderMap() {
  const L = state.layout;
  const coach = state.coaches[state.coach];
  const chair = L.kind === 'chair';
  const btn = (s) => `<button class="seat ${chair ? '' : 'berth'}" data-seat="${s.id}"
    aria-label="${chair ? 'Seat' : 'Berth'} ${s.id}">${s.id}<small>${s.tag}</small></button>`;
  const rows = L.mapRows.map((r) => {
    if (r.type === 'label') return `<div class="facing">${r.text}</div>`;
    if (r.type === 'tables') return '<div class="facing">Middle of coach</div>';
    const win = chair ? `<i class="win ${r.view}"></i>` : '<i class="win clear"></i>';
    return `
      <div class="row">
        ${win}
        <div class="block">${r.left.map(btn).join('')}</div>
        <span class="rn">${r.rn}</span>
        <div class="block">${r.right.map(btn).join('')}</div>
        ${win}
      </div>`;
  });

  const sun = state.train.sun ? `<p class="sun">${SUN_TEXT[state.train.sun.side]}</p>` : '';
  $('map').innerHTML = `
    ${passengersHtml()}
    ${sun}
    <div id="avail" class="avail">${availHtml()}</div>
    <form id="jump" class="jump" autocomplete="off">
      <label for="jumpInput">${chair ? 'Seat' : 'Berth'} number</label>
      <input id="jumpInput" inputmode="numeric" placeholder="1–${coach.total}" />
      <button class="pill solid" type="submit">Go</button>
    </form>
    <div class="legend">
      ${chair
        ? '<span><i class="win clear"></i>Glass</span><span><i class="win partial"></i>Part</span><span><i class="win pillar"></i>Pillar</span><span>W window · A aisle · M middle</span>'
        : '<span>LB lower · MB middle · UB upper · SL/SU side</span>'}
    </div>
    <div class="coach-body">
      <div class="end">Door</div>
      ${rows.join('')}
      <div class="end">Door</div>
    </div>`;
}

// ---------- ticket, fare and availability ----------

function passengersHtml() {
  const pnr = state.train.pnr;
  if (!pnr?.passengers?.length) return '';
  const chips = pnr.passengers.map((p, i) => {
    const where = p.coach && p.berthNumber ? `${esc(p.coach)}-${esc(p.berthNumber)}${p.berthCode ? ` ${esc(p.berthCode)}` : ''}` : 'No berth yet';
    const cls = p.isConfirmed ? 'good' : p.isCancelled ? 'bad' : '';
    return `<button class="chip link ${cls} ${pnr.active === i ? 'sel' : ''}" data-passenger="${i}">P${p.passengerNumber || i + 1} · ${where} · ${esc(p.currentStatus || '')}</button>`;
  }).join('');
  const active = pnr.passengers[pnr.active ?? 0];
  const drawn = active?.coach && state.coaches.some((c) => String(c.code).toUpperCase() === String(active.coach).toUpperCase());
  const note = !active?.coach
    ? '<p class="sun">This passenger has no berth yet (waitlisted or chart not prepared). Browse the coaches meanwhile.</p>'
    : drawn ? '' : `<p class="sun">Coach ${esc(active.coach)} is not in this train's listed rake, so we can't show it.</p>`;
  return `<div class="ticket"><span class="muted">Your ticket${pnr.charting ? ` · ${esc(pnr.charting)}` : ''}</span><div class="chips">${chips}</div>${note}</div>`;
}

const rupees = (n) => '₹' + Number(n).toLocaleString('en-IN');

function availHtml() {
  const coach = state.coaches[state.coach];
  const leg = state.train.leg;
  if (!leg?.from?.code || !leg?.to?.code) return '';
  const a = state.avail[coach.classType];
  if (!a) return `<button class="pill solid" id="checkAvail">Check fare &amp; availability · ${esc(coach.classType)}</button>`;
  if (a.loading) return '<p class="msg loading">Checking…</p>';
  const fare = a.fare?.breakdown?.totalFare;
  const days = (a.seats?.calendar || []).slice(0, 6).map((d) => {
    const cls = d.isAvailable ? 'good' : d.statusCode === 'RAC' ? 'warn' : 'bad';
    const text = d.isAvailable && d.availableSeats != null ? `AVL ${d.availableSeats}`
      : d.statusCode === 'RAC' ? `RAC${d.waitlistNumber != null ? ` ${d.waitlistNumber}` : ''}`
      : d.statusCode === 'WAITLIST' ? `WL${d.waitlistNumber != null ? ` ${d.waitlistNumber}` : ''}`
      : esc(d.statusCode || d.status || '?');
    const date = new Date(`${d.rawDate || d.date}T00:00:00`);
    const label = Number.isNaN(date.getTime()) ? esc(d.date) : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `<span class="day ${cls}"><small>${label}</small><b>${text}</b></span>`;
  }).join('');
  const parts = [];
  if (fare != null) parts.push(`<p class="fare"><b>${rupees(fare)}</b> <span class="muted">${esc(coach.classType)} · general quota · ${esc(leg.from.code)} → ${esc(leg.to.code)}</span></p>`);
  if (days) parts.push(`<div class="days">${days}</div>`);
  if (!parts.length) parts.push(`<p class="msg">${esc(a.error || 'No fare or availability data for this class.')}</p>`);
  else parts.push('<p class="fine">From third-party sources via RailRadar. Confirm on IRCTC before you book.</p>');
  return parts.join('');
}

async function checkAvailability() {
  const coach = state.coaches[state.coach];
  const { number, leg, date } = state.train;
  const classCode = coach.classType;
  state.avail[classCode] = { loading: true };
  $('avail').innerHTML = availHtml();
  const j = { from: leg.from.code, to: leg.to.code, date, classCode };
  const [seats, fare] = await Promise.allSettled([seatAvailability(number, j), trainFare(number, j)]);
  if (state.train.number !== number) return;
  state.avail[classCode] = {
    seats: seats.status === 'fulfilled' ? seats.value : null,
    fare: fare.status === 'fulfilled' ? fare.value : null,
    error: seats.status === 'rejected' ? seats.reason.message : null,
  };
  if (state.coaches[state.coach]?.classType === classCode && $('avail')) $('avail').innerHTML = availHtml();
}

// ---------- route map ----------

async function toggleRouteMap() {
  const box = $('routeMap');
  if (!box.hidden) return (box.hidden = true);
  box.hidden = false;
  if (box.innerHTML) return;
  const { number, leg } = state.train;
  box.innerHTML = '<p class="loading">Loading route…</p>';
  try {
    const svg = routeSvg(routePoints(await trainRoute(number)), leg?.from, leg?.to);
    if (state.train.number !== number) return;
    box.innerHTML = svg || '<p>No route geometry for this train.</p>';
  } catch (err) {
    box.innerHTML = `<p class="error">${esc(err.message)}</p>`;
    setTimeout(() => { if (box.querySelector('.error')) box.innerHTML = ''; box.hidden = true; }, 3500);
  }
}

function renderSeatCard() {
  const seat = state.seat;
  const coach = state.coaches[state.coach];
  const noun = state.layout.kind === 'chair' ? 'Seat' : 'Berth';
  if (!seat) {
    $('seatCard').innerHTML = `
      <div class="empty"><b>Tap a ${noun.toLowerCase()}</b><span>You'll see the view from it above.</span></div>`;
    return;
  }
  const chips = seatFacts(seat)
    .map((f) => `<span class="chip ${f.good ? 'good' : ''} ${f.bad ? 'bad' : ''}">${f.text}</span>`)
    .join('');
  $('seatCard').innerHTML = `
    <div class="card-head">
      <div>
        <b class="seat-id">${noun} ${seat.id}</b>
        <span class="muted">${esc(coach.code)} · ${coach.type.name}</span>
      </div>
      <div class="score" title="Seat score"><b>${scoreSeat(seat)}</b><span>/10</span></div>
    </div>
    <div class="chips">${chips}</div>
    <a class="book" href="${IRCTC_URL}" target="_blank" rel="noopener">Book on IRCTC &#8599;</a>`;
}

function selectSeat(id) {
  const seat = state.layout.seats.find((s) => s.id === String(id));
  if (!seat) return false;
  state.seat = seat;
  document.querySelectorAll('.seat.on').forEach((el) => el.classList.remove('on'));
  const el = document.querySelector(`.seat[data-seat="${seat.id}"]`);
  el?.classList.add('on');
  el?.scrollIntoView({ block: 'nearest' });
  scene.setSeat(seat);
  renderSeatCard();
  updateStage(state.layout.looks[0]);
  return true;
}

function updateStage(look) {
  const seat = state.seat;
  const coach = state.coaches[state.coach];
  const inSeat = seat && look !== 'coach';
  $('viewLabel').textContent = inSeat
    ? `View from ${seat.id} · ${coach.code}`
    : `${coach.code} · ${coach.type.short} · ${ordinal(coach.position)} from engine`;
  document.querySelectorAll('#lookBtns .pill').forEach((b) => {
    b.disabled = !seat && b.dataset.look !== 'coach';
    b.classList.toggle('on', (look || 'coach') === b.dataset.look);
  });
}

function setTime(i) {
  state.time = i % TIMES.length;
  $('timeBtn').textContent = TIMES[state.time].label;
  scene.setTime(TIMES[state.time].id);
}

$('back').addEventListener('click', closeTrain);
$('coaches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-coach]');
  if (b) openCoach(Number(b.dataset.coach));
});
$('map').addEventListener('click', (e) => {
  const b = e.target.closest('[data-seat]');
  if (b) return selectSeat(b.dataset.seat);
  if (e.target.closest('#checkAvail')) return checkAvailability();
  const p = e.target.closest('[data-passenger]');
  if (p) showPassenger(Number(p.dataset.passenger));
});
$('mapBtn').addEventListener('click', toggleRouteMap);
$('routeMap').addEventListener('click', () => ($('routeMap').hidden = true));
$('modeBtn').addEventListener('click', () => {
  state.berthMode = state.layout.mode === 'day' ? 'night' : 'day';
  const keep = state.seat?.id;
  openCoach(state.coach);
  if (keep) selectSeat(keep);
});
$('map').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('jumpInput');
  input.classList.toggle('bad', !selectSeat(input.value.trim()));
});
$('lookBtns').addEventListener('click', (e) => {
  const b = e.target.closest('[data-look]');
  if (!b || b.disabled) return;
  if (b.dataset.look === 'coach') scene.showOverview();
  else scene.look(b.dataset.look);
  updateStage(b.dataset.look);
});
$('timeBtn').addEventListener('click', () => scene && setTime(state.time + 1));
$('expandBtn').addEventListener('click', () => {
  $('booking').classList.toggle('expanded');
  scene?.resize();
});

renderHome();
