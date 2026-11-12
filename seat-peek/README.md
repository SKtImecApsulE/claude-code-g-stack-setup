# SeatPeek

See your Indian Railways seat or berth before you travel. Search real trains
between two stations (or enter a train number), pick a coach from the train's
real rake, tap a seat or berth number, and look around from it in 3D.

Train, timetable and coach data come from the [RailRadar API](https://railradar.in/docs).
SeatPeek is not affiliated with Indian Railways or IRCTC.

## Run it

```bash
cd seat-peek
npm install
RAILRADAR_API_KEY=your-key npm run dev
```

On a small quota (the free plan is 100 requests a month), add
`RAIL_CACHE_DIR=.rail-cache` to keep successful responses on disk in dev.

No key yet? `RAIL_MOCK=1 npm run dev` serves a couple of stand-in trains
(12002 and 12952) from `dev/mock.js` so you can work on the app.

## Deploy to Vercel

1. Import the repository in Vercel and set **Root Directory** to `seat-peek`.
2. Add the environment variable `RAILRADAR_API_KEY`.
3. Deploy. `vercel.json` builds the Vite site and `api/rail.js` becomes a
   serverless function, so the key stays on the server.

## What is real and what is modelled

| | |
| --- | --- |
| Trains between stations, times, run days | Real (RailRadar) |
| Coach order and class of each coach | Real (RailRadar rake composition) |
| Seat and berth numbering, and which numbers are window / middle / aisle / lower / upper | From RailRadar's class blueprint when present, otherwise the standard pattern |
| Which side the sun is on | Computed from the two stations and the departure time |
| Route map | Real track geometry (RailRadar), with your stretch highlighted |
| Fare and 6-day availability per class | RailRadar, from third-party sources; needs a paid RailRadar plan (Developer or above) |
| PNR lookup, jumping to the coach and berth on a ticket | RailRadar; needs a paid plan. PNR responses are never cached |
| Booking | Not available; the Book button links to IRCTC |
| Scenery outside the window | Generic, generated in code |

Supported coach types: EC, CC, Vistadome and 2S (chair cars); 1A, 2A, 3A, 3E
and Sleeper (berths). Three-tier coaches switch between a night setup (all
berths made up) and a day setup (middle berths folded, passengers seated).

## Layout

| File | Purpose |
| --- | --- |
| `api/rail.js` | Server-side proxy to RailRadar with an allow-list of endpoints |
| `src/api.js` | Browser client for the proxy |
| `src/coaches.js` | Coach types and capacities |
| `src/layout.js` | Seat and berth geometry shared by the map and the 3D scene; seat facts and score |
| `src/route.js` | Polyline decoding and the SVG route map |
| `src/sun.js` | Solar position, for the sunny side of the train |
| `src/scene.js` | three.js coach interior, seats, berths, lighting, camera |
| `src/world.js` | Sky, clouds, ground, fields, trees, hills scrolling past |
| `src/textures.js` | Procedural canvas textures |
| `src/main.js`, `src/style.css` | Search, train view and interaction |
| `dev/mock.js` | Stand-in API responses for development |
