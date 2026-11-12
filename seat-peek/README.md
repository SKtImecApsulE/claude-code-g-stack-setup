# SeatPeek

See your train seat before you book it. Pick a train and a coach, tap a seat on
the map, and you are put in that seat in 3D: look out the window, down the aisle
or straight ahead while the countryside rolls past.

```bash
cd seat-peek
npm install
npm run dev
```

Then open the printed URL (works on a phone on the same network too).
`npm run build` writes a static site to `dist/`.

## What it shows

- **Seat map** for three coach classes (1+2, 2+2 and 3+2 seating), with free and
  taken seats and a strip along each wall showing glass, part-glass or pillar.
- **3D view from the seat**: drag to look around, scroll to zoom, or use the
  Window / Ahead / Aisle / Coach buttons. Day, sunset and night lighting.
- **Seat facts and a score out of 10**: window, aisle or middle; whether a
  pillar blocks the window; facing forward or backward; table; sunny or shady
  side; near the door.

The scene is built in code with no image or model files: textured fabric and
floors, sunlight and shadows through the windows, a physical sky, and scenery
that scrolls past at about 130 km/h.

Windows are spaced on their own rhythm rather than the seat pitch, so some
"window" seats really do sit beside a pillar, and the 3D view shows it.

## Sample data

Trains, times, fares and seat availability are invented (`src/data.js`). The
Book button only shows a confirmation; nothing is booked or charged.

## Layout

| File | Purpose |
| --- | --- |
| `src/data.js` | Sample trains, coach classes, fares, taken-seat pattern |
| `src/layout.js` | Coach geometry shared by the map and the 3D scene; seat scoring |
| `src/scene.js` | three.js coach interior, seats, lighting, camera |
| `src/world.js` | Sky, clouds, ground, fields, trees, hills scrolling past |
| `src/textures.js` | Procedural canvas textures (fabric, floor, grass, display) |
| `src/main.js`, `src/style.css` | Screens and interaction |
