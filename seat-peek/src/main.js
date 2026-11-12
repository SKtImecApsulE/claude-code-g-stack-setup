import './style.css';
import { CLASSES, ROUTE, TRAINS, isTaken, priceFor, rupees } from './data.js';
import { buildLayout, scoreSeat } from './layout.js';
import { SeatScene } from './scene.js';

const $ = (id) => document.getElementById(id);
const TIMES = [
  { id: 'day', label: '☀ Day' },
  { id: 'golden', label: '🌇 Sunset' },
  { id: 'night', label: '🌙 Night' },
];

const state = { train: null, coach: 0, seat: null, time: 0, layout: null, cls: null };
let scene = null;

const travelDate = new Date(Date.now() + 86400000).toLocaleDateString('en-IN', {
  weekday: 'short', day: 'numeric', month: 'short',
});

// ---------- home ----------

function renderHome() {
  const cards = TRAINS.map((t) => {
    const classes = [...new Set(t.coaches.map((c) => c.cls))];
    const chips = classes
      .map((c) => `<span class="chip">${CLASSES[c].name} <b>${rupees(CLASSES[c].base)}</b></span>`)
      .join('');
    return `
      <button class="train" data-train="${t.id}">
        <div class="train-head">
          <strong>${t.name}</strong><span class="num">${t.number}</span>
        </div>
        <div class="times">
          <div><b>${t.depart}</b><span>${ROUTE.from}</span></div>
          <div class="line"><span>${t.duration}</span></div>
          <div><b>${t.arrive}</b><span>${ROUTE.to}</span></div>
        </div>
        <div class="chips">${chips}</div>
        <span class="cta">Preview seats &#8594;</span>
      </button>`;
  }).join('');

  $('home').innerHTML = `
    <header class="hero">
      <p class="brand">SeatPeek</p>
      <h1>Sit in the seat<br />before you book it.</h1>
      <p class="sub">Pick any seat and look around in 3D: the window, the pillar in the way, which way you face.</p>
    </header>
    <div class="route">
      <div><span>From</span><b>${ROUTE.from}</b></div>
      <div class="arrow">&#8594;</div>
      <div><span>To</span><b>${ROUTE.to}</b></div>
      <div class="date"><span>Date</span><b>${travelDate}</b></div>
    </div>
    <h2>${TRAINS.length} trains</h2>
    <div class="trains">${cards}</div>
    <p class="note">Demo with sample trains, fares and seat availability. Nothing is actually booked.</p>`;
}

$('home').addEventListener('click', (e) => {
  const card = e.target.closest('[data-train]');
  if (card) openTrain(card.dataset.train);
});

// ---------- booking ----------

function openTrain(id) {
  state.train = TRAINS.find((t) => t.id === id);
  $('home').hidden = true;
  $('booking').hidden = false;
  $('trainName').textContent = `${state.train.name} · ${state.train.number}`;
  $('trainMeta').textContent = `${ROUTE.from} ${state.train.depart} → ${ROUTE.to} ${state.train.arrive} · ${travelDate}`;
  if (!scene) {
    scene = new SeatScene($('view'));
    scene.onUserLook = () => $('hint').classList.add('gone');
  }
  scene.resize();
  scene.start();
  // match the light to the departure time
  const hour = parseInt(state.train.depart, 10);
  setTime(hour >= 17 ? 1 : 0);
  openCoach(0);
  window.scrollTo(0, 0);
}

function closeTrain() {
  scene.stop();
  $('booking').hidden = true;
  $('booking').classList.remove('expanded');
  $('home').hidden = false;
}

function openCoach(i) {
  state.coach = i;
  state.seat = null;
  const coach = state.train.coaches[i];
  state.cls = CLASSES[coach.cls];
  state.layout = buildLayout(state.cls);
  scene.setCoach(state.layout, state.cls, coach.id);
  $('coaches').innerHTML = state.train.coaches
    .map((c, k) => `
      <button class="coach ${k === i ? 'on' : ''}" data-coach="${k}">
        <b>${c.id}</b><span>${CLASSES[c.cls].short}</span>
      </button>`)
    .join('');
  renderMap();
  renderSeatCard();
  updateStage();
  $('map').scrollTop = 0;
}

const taken = (seat) => isTaken(state.train.id, state.train.coaches[state.coach].id, seat.id);

function renderMap() {
  const L = state.layout;
  const rows = L.rowInfo.map((r) => {
    const seats = L.seats.filter((s) => s.row === r.row);
    const btn = (s) => {
      const t = taken(s);
      return `<button class="seat ${t ? 'taken' : ''}" data-seat="${s.id}" ${t ? 'disabled' : ''}
        aria-label="Seat ${s.id}${t ? ', taken' : ''}">${s.letter}</button>`;
    };
    const win = `<i class="win ${r.view}" title="${VIEW_TEXT[r.view]}"></i>`;
    const row = `
      <div class="row">
        ${win}
        <div class="block">${seats.slice(0, L.a).map(btn).join('')}</div>
        <span class="rn">${r.row}</span>
        <div class="block">${seats.slice(L.a).map(btn).join('')}</div>
        ${win}
      </div>`;
    const tables = r.row === L.half ? '<div class="tables"><span>table</span><span>table</span></div>' : '';
    return row + tables;
  });

  $('map').innerHTML = `
    <div class="legend">
      <span><i class="sw free"></i>Free</span>
      <span><i class="sw taken"></i>Taken</span>
      <span><i class="win clear"></i>Glass</span>
      <span><i class="win partial"></i>Part</span>
      <span><i class="win pillar"></i>Pillar</span>
    </div>
    <div class="coach-body">
      <div class="end">&#9650; Front of train · door</div>
      <div class="facing">Rows 1&ndash;${L.half} face backward</div>
      ${rows.slice(0, L.half).join('')}
      <div class="facing">Rows ${L.half + 1}&ndash;${L.rows} face forward</div>
      ${rows.slice(L.half).join('')}
      <div class="end">Door · toilet</div>
    </div>`;
}

const VIEW_TEXT = { clear: 'Full window', partial: 'Partial window', pillar: 'Pillar beside you' };
const TYPE_TEXT = { window: 'Window', aisle: 'Aisle', middle: 'Middle', solo: 'Solo window' };

function seatFacts(seat) {
  const facts = [{ text: TYPE_TEXT[seat.type], good: seat.type !== 'middle' }];
  if (seat.type === 'window' || seat.type === 'solo') {
    facts.push({ text: VIEW_TEXT[seat.view], good: seat.view === 'clear', bad: seat.view === 'pillar' });
  }
  facts.push(seat.facing < 0
    ? { text: 'Faces forward', good: true }
    : { text: 'Faces backward' });
  if (seat.table) facts.push({ text: 'Table', good: true });
  // In this demo the sun sits on the right-hand side of the train.
  facts.push(seat.side === 'R' ? { text: 'Sunny side' } : { text: 'Shady side' });
  if (seat.nearDoor) facts.push({ text: 'Near the door', bad: true });
  return facts;
}

function renderSeatCard() {
  const seat = state.seat;
  if (!seat) {
    $('seatCard').innerHTML = `
      <div class="empty"><b>Tap a free seat</b><span>You'll see the view from it above.</span></div>`;
    return;
  }
  const coach = state.train.coaches[state.coach];
  const score = scoreSeat(seat);
  const chips = seatFacts(seat)
    .map((f) => `<span class="chip ${f.good ? 'good' : ''} ${f.bad ? 'bad' : ''}">${f.text}</span>`)
    .join('');
  $('seatCard').innerHTML = `
    <div class="card-head">
      <div>
        <b class="seat-id">Seat ${seat.id}</b>
        <span class="muted">${coach.id} · ${state.cls.name}</span>
      </div>
      <div class="score" title="Seat score"><b>${score}</b><span>/10</span></div>
    </div>
    <div class="chips">${chips}</div>
    <button id="book" class="book">Book seat ${seat.id} · ${rupees(priceFor(state.cls, seat))}</button>`;
}

function selectSeat(id) {
  const seat = state.layout.seats.find((s) => s.id === id);
  if (!seat || taken(seat)) return;
  state.seat = seat;
  document.querySelectorAll('.seat.on').forEach((el) => el.classList.remove('on'));
  document.querySelector(`.seat[data-seat="${id}"]`)?.classList.add('on');
  scene.setSeat(seat);
  renderSeatCard();
  updateStage('window');
}

function updateStage(look) {
  const seat = state.seat;
  const inSeat = seat && look !== 'coach';
  $('viewLabel').textContent = inSeat
    ? `View from ${seat.id}`
    : `Coach ${state.train.coaches[state.coach].id} · ${state.cls.name}`;
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

// ---------- events ----------

$('back').addEventListener('click', closeTrain);
$('coaches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-coach]');
  if (b) openCoach(Number(b.dataset.coach));
});
$('map').addEventListener('click', (e) => {
  const b = e.target.closest('[data-seat]');
  if (b) selectSeat(b.dataset.seat);
});
$('lookBtns').addEventListener('click', (e) => {
  const b = e.target.closest('[data-look]');
  if (!b || b.disabled) return;
  if (b.dataset.look === 'coach') scene.showOverview();
  else scene.look(b.dataset.look);
  updateStage(b.dataset.look);
});
$('timeBtn').addEventListener('click', () => setTime(state.time + 1));
$('expandBtn').addEventListener('click', () => {
  $('booking').classList.toggle('expanded');
  scene.resize();
});

$('seatCard').addEventListener('click', (e) => {
  if (e.target.id !== 'book') return;
  const seat = state.seat;
  const coach = state.train.coaches[state.coach];
  $('confirm').innerHTML = `
    <div class="tick">&#10003;</div>
    <h3>Seat ${seat.id} is yours</h3>
    <p>${state.train.name} · coach ${coach.id} · ${state.cls.name}<br />
       ${ROUTE.from} ${state.train.depart} → ${ROUTE.to} ${state.train.arrive}, ${travelDate}</p>
    <p class="muted">${seatFacts(seat).map((f) => f.text).join(' · ')}</p>
    <p class="note">This is a demo, so no ticket was issued and nothing was charged.</p>
    <button class="book" id="done">Done</button>`;
  $('confirm').showModal();
});
$('confirm').addEventListener('click', (e) => {
  if (e.target.id === 'done' || e.target === $('confirm')) $('confirm').close();
});

renderHome();
