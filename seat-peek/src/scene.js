import * as THREE from 'three';
import { CAR } from './layout.js';

const PRESETS = {
  day: {
    top: 0x2f7fd8, horizon: 0xcfe5f4, sun: 0xfff3dc, sunI: 2.6, hemiI: 1.5,
    interior: 0.38, exposure: 1.0, sunDir: [0.7, 0.75, -0.3],
  },
  golden: {
    top: 0x2b4a80, horizon: 0xf7b47a, sun: 0xff9a55, sunI: 2.4, hemiI: 0.9,
    interior: 0.36, exposure: 1.0, sunDir: [0.9, 0.2, -0.35],
  },
  night: {
    top: 0x03050c, horizon: 0x141c33, sun: 0x8ea5d9, sunI: 0.22, hemiI: 0.16,
    interior: 0.6, exposure: 1.05, sunDir: [0.5, 0.6, -0.3],
  },
};

const TILE = 1200; // scenery repeats every TILE metres
const GROUND_Y = -1.2;
const EYE_Y = 1.22;
const SPEED = 36; // m/s, about 130 km/h

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const nearestAngle = (target, current) =>
  target + Math.PI * 2 * Math.round((current - target) / (Math.PI * 2));

export class SeatScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xffffff, 120, 1700);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.06, 4200);
    this.camera.rotation.order = 'YXZ';

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x5b6b4a, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.scene.add(this.hemi, this.sun);

    this.skyUniforms = {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(3800, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying float h; void main(){ float t = pow(clamp(h,0.0,1.0),0.55); gl_FragColor = vec4(mix(horizon, top, t),1.0); }',
      }),
    );
    sky.frustumCulled = false;
    this.scene.add(sky);

    this.interiorMats = [];
    this.buildWorld();

    this.car = null;
    this.layout = null;
    this.seat = null;
    this.mode = 'overview';
    this.pos = new THREE.Vector3(0, 1.95, 4);
    this.tpos = this.pos.clone();
    this.yaw = this.tyaw = 0;
    this.pitch = this.tpitch = -0.38;
    this.baseFov = 68;
    this.zoom = 1;
    this.scroll = 0;
    this.time = 0;
    this.running = false;
    this.onUserLook = null;

    this.setTime('day');
    this.bindInput();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
    this.clock = new THREE.Clock();
    this.frame = this.frame.bind(this);
  }

  // ---------- outside world ----------

  buildWorld() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(7000, 7000),
      new THREE.MeshLambertMaterial({ color: 0x6f9a48 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = GROUND_Y;
    this.scene.add(ground);

    this.tiles = [0, 1, 2].map(() => this.buildTile());
    this.tiles.forEach((t) => this.scene.add(t));
  }

  buildTile() {
    const rand = rng(20411);
    const g = new THREE.Group();
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    const side = () => (rand() < 0.5 ? -1 : 1);
    const make = (geo, mat, n) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.frustumCulled = false;
      g.add(m);
      return m;
    };

    // Ballast bed and the neighbouring track, in short segments: very long
    // thin boxes cause depth artefacts on some GPUs.
    const ballast = new THREE.Mesh(
      new THREE.BoxGeometry(11, 0.3, TILE),
      new THREE.MeshLambertMaterial({ color: 0x8d8780 }),
    );
    ballast.position.set(1.6, GROUND_Y + 0.15, TILE / 2);
    g.add(ballast);
    const SEG = 40;
    const rails = make(
      new THREE.BoxGeometry(0.09, 0.14, SEG),
      new THREE.MeshLambertMaterial({ color: 0x4a4744 }),
      (TILE / SEG) * 2,
    );
    for (let i = 0; i < TILE / SEG; i++) {
      [4.0, 5.5].forEach((x, j) => {
        d.position.set(x, GROUND_Y + 0.37, (i + 0.5) * SEG);
        d.rotation.set(0, 0, 0);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        rails.setMatrixAt(i * 2 + j, d.matrix);
      });
    }

    // fields
    const nFields = 46;
    const fieldGeo = new THREE.PlaneGeometry(1, 1);
    fieldGeo.rotateX(-Math.PI / 2);
    const fields = make(fieldGeo, new THREE.MeshLambertMaterial(), nFields);
    const fieldColors = [0x89a84c, 0xb9b458, 0x5d8c40, 0xa1894f, 0x7fae5a, 0xc9bf6a];
    for (let i = 0; i < nFields; i++) {
      const w = 40 + rand() * 120;
      const len = 50 + rand() * 160;
      d.position.set(side() * (14 + w / 2 + rand() * 420), GROUND_Y + 0.03 + i * 0.002, rand() * TILE);
      d.rotation.set(0, 0, 0);
      d.scale.set(w, 1, len);
      d.updateMatrix();
      fields.setMatrixAt(i, d.matrix);
      fields.setColorAt(i, col.setHex(fieldColors[Math.floor(rand() * fieldColors.length)]));
    }

    // trees
    const nTrees = 170;
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.25, 1, 5);
    trunkGeo.translate(0, 0.5, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1, 0);
    const trunks = make(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x5a4632 }), nTrees);
    const crowns = make(crownGeo, new THREE.MeshLambertMaterial({ flatShading: true }), nTrees);
    for (let i = 0; i < nTrees; i++) {
      const x = side() * (11 + Math.pow(rand(), 1.8) * 330);
      const z = rand() * TILE;
      const h = 3.5 + rand() * 5;
      const r = 1.6 + rand() * 2;
      d.rotation.set(0, rand() * 6, 0);
      d.position.set(x, GROUND_Y, z);
      d.scale.set(1, h * 0.55, 1);
      d.updateMatrix();
      trunks.setMatrixAt(i, d.matrix);
      d.position.set(x, GROUND_Y + h * 0.55 + r * 0.55, z);
      d.scale.set(r, r * (0.9 + rand() * 0.5), r);
      d.updateMatrix();
      crowns.setMatrixAt(i, d.matrix);
      crowns.setColorAt(i, col.setHSL(0.26 + rand() * 0.1, 0.45 + rand() * 0.2, 0.22 + rand() * 0.14));
    }

    // houses
    const nHouses = 16;
    const wallGeo = new THREE.BoxGeometry(1, 1, 1);
    wallGeo.translate(0, 0.5, 0);
    const roofGeo = new THREE.ConeGeometry(0.78, 1, 4);
    roofGeo.rotateY(Math.PI / 4);
    roofGeo.translate(0, 0.5, 0);
    const walls = make(wallGeo, new THREE.MeshLambertMaterial(), nHouses);
    const roofs = make(roofGeo, new THREE.MeshLambertMaterial(), nHouses);
    const wallColors = [0xf0e3c8, 0xe6d2b0, 0xd9e2e8, 0xf2c9a0, 0xfaf3e6];
    const roofColors = [0xa3523a, 0x7a4636, 0x54606b];
    for (let i = 0; i < nHouses; i++) {
      const x = side() * (28 + rand() * 220);
      const z = rand() * TILE;
      const w = 6 + rand() * 5;
      const h = 3 + rand() * 2.5;
      d.rotation.set(0, rand() * 0.6 - 0.3, 0);
      d.position.set(x, GROUND_Y, z);
      d.scale.set(w, h, w * 0.8);
      d.updateMatrix();
      walls.setMatrixAt(i, d.matrix);
      walls.setColorAt(i, col.setHex(wallColors[Math.floor(rand() * wallColors.length)]));
      d.position.y = GROUND_Y + h;
      d.scale.set(w * 1.05, 2 + rand(), w * 0.85);
      d.updateMatrix();
      roofs.setMatrixAt(i, d.matrix);
      roofs.setColorAt(i, col.setHex(roofColors[Math.floor(rand() * roofColors.length)]));
    }

    // overhead-line masts right beside the track
    const nMasts = TILE / 60;
    const mastGeo = new THREE.BoxGeometry(0.22, 7.2, 0.22);
    mastGeo.translate(0, 3.6, 0);
    const armGeo = new THREE.BoxGeometry(2.6, 0.1, 0.1);
    const mastMat = new THREE.MeshLambertMaterial({ color: 0x6b7178 });
    const masts = make(mastGeo, mastMat, nMasts * 2);
    const arms = make(armGeo, mastMat, nMasts * 2);
    let k = 0;
    for (let i = 0; i < nMasts; i++) {
      for (const [x, dir] of [[-3.5, 1], [7.4, -1]]) {
        d.rotation.set(0, 0, 0);
        d.scale.set(1, 1, 1);
        d.position.set(x, GROUND_Y, i * 60 + 12);
        d.updateMatrix();
        masts.setMatrixAt(k, d.matrix);
        d.position.set(x + dir * 1.3, GROUND_Y + 6.6, i * 60 + 12);
        d.updateMatrix();
        arms.setMatrixAt(k, d.matrix);
        k++;
      }
    }

    // distant hills
    const nHills = 9;
    const hillGeo = new THREE.ConeGeometry(1, 1, 7);
    hillGeo.translate(0, 0.5, 0);
    const hills = make(hillGeo, new THREE.MeshLambertMaterial({ flatShading: true }), nHills);
    for (let i = 0; i < nHills; i++) {
      const r = 180 + rand() * 260;
      d.rotation.set(0, rand() * 6, 0);
      d.position.set(side() * (620 + rand() * 500), GROUND_Y - 4, (i + rand() * 0.6) * (TILE / nHills));
      d.scale.set(r, 60 + rand() * 170, r * (1 + rand() * 0.8));
      d.updateMatrix();
      hills.setMatrixAt(i, d.matrix);
      hills.setColorAt(i, col.setHSL(0.3 + rand() * 0.06, 0.25, 0.3 + rand() * 0.1));
    }

    return g;
  }

  // ---------- coach interior ----------

  setCoach(layout, cls) {
    if (this.car) {
      this.scene.remove(this.car);
      this.car.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    this.interiorMats = [];
    this.layout = layout;
    this.seat = null;
    this.seatColor = new THREE.Color(cls.seat);
    this.car = this.buildCar(layout, cls);
    this.scene.add(this.car);
    this.applyInterior();
    this.showOverview(true);
  }

  mat(color) {
    const m = new THREE.MeshLambertMaterial({ color, emissive: color });
    this.interiorMats.push(m);
    return m;
  }

  buildCar(L, cls) {
    const g = new THREE.Group();
    const { halfW, height, winBottom, winTop } = CAR;
    const len = L.length;
    const box = (w, h, dz, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dz), mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };

    const wallMat = this.mat(0xe9e6df);
    const trimMat = this.mat(0xc9c5bd);
    const floorMat = this.mat(0x5d6068);
    const carpetMat = this.mat(cls.carpet);
    const darkMat = this.mat(0x2b2e35);
    const ceilMat = this.mat(0xf3f1ec);

    box(halfW * 2, 0.1, len, floorMat, 0, -0.05, 0);
    const aisleX = (L.seats[L.a - 1].x + L.seats[L.a].x) / 2;
    const aisleW = L.seats[L.a].x - L.seats[L.a - 1].x - L.seatW;
    box(aisleW, 0.012, len - 0.2, carpetMat, aisleX, 0.006, 0);
    box(halfW * 2 + 0.2, 0.1, len, ceilMat, 0, height + 0.05, 0);

    // Side walls with window openings
    const glassMat = new THREE.MeshBasicMaterial({
      color: 0x9fc4d6, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false,
    });
    const frameMat = this.mat(0x9a9892);
    for (const sx of [-1, 1]) {
      const x = sx * (halfW + 0.05);
      box(0.1, winBottom, len, wallMat, x, winBottom / 2, 0);
      box(0.1, height - winTop, len, wallMat, x, (height + winTop) / 2, 0);
      let cursor = -len / 2;
      const midY = (winBottom + winTop) / 2;
      const midH = winTop - winBottom;
      for (const [w0, w1] of [...L.windows, [len / 2, len / 2]]) {
        if (w0 > cursor) box(0.1, midH, w0 - cursor, wallMat, x, midY, (w0 + cursor) / 2);
        cursor = w1;
        if (w1 > w0) {
          const glass = new THREE.Mesh(new THREE.PlaneGeometry(w1 - w0, midH), glassMat);
          glass.rotation.y = Math.PI / 2;
          glass.position.set(x, midY, (w0 + w1) / 2);
          g.add(glass);
          // sill and window shade housing
          box(0.16, 0.03, w1 - w0 + 0.06, frameMat, sx * (halfW - 0.02), winBottom, (w0 + w1) / 2);
          box(0.14, 0.05, w1 - w0 + 0.06, frameMat, sx * (halfW - 0.01), winTop, (w0 + w1) / 2);
        }
      }
      // luggage rack
      box(0.42, 0.03, L.seatLen + 0.6, trimMat, sx * (halfW - 0.21), 1.86, 0);
      box(0.03, 0.06, L.seatLen + 0.6, frameMat, sx * (halfW - 0.42), 1.89, 0);
    }

    // End walls with a door and a small info display
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6e2 });
    const signMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
    for (const sz of [-1, 1]) {
      const z = sz * (len / 2 + 0.05);
      box(halfW * 2 + 0.2, height, 0.1, wallMat, 0, height / 2, z);
      box(0.95, 2.0, 0.04, darkMat, aisleX, 1.0, sz * (len / 2 - 0.01));
      box(0.6, 0.11, 0.03, signMat, aisleX, 2.12, sz * (len / 2 - 0.02));
      // partition between vestibule and seating
      const pz = sz * (L.seatLen / 2 + 0.25);
      const leftW = aisleX - aisleW / 2 + halfW;
      const rightW = halfW - (aisleX + aisleW / 2);
      box(leftW, 1.95, 0.05, trimMat, -halfW + leftW / 2, 0.975, pz);
      box(rightW, 1.95, 0.05, trimMat, halfW - rightW / 2, 0.975, pz);
    }

    // Ceiling light strips
    for (const x of [aisleX - 0.42, aisleX + 0.42]) {
      box(0.09, 0.02, len - 1, lightMat, x, height - 0.01, 0);
    }

    // Tables between the two facing halves
    const tableZ = (L.rowInfo[L.half - 1].z + L.rowInfo[L.half].z) / 2;
    const tableMat = this.mat(0xb48a5a);
    const blocks = [
      [L.seats[0].x - L.seatW / 2, L.seats[L.a - 1].x + L.seatW / 2],
      [L.seats[L.a].x - L.seatW / 2, L.seats[L.cols - 1].x + L.seatW / 2],
    ];
    for (const [x0, x1] of blocks) {
      box(x1 - x0 - 0.04, 0.035, 0.5, tableMat, (x0 + x1) / 2, 0.72, tableZ);
      box(0.07, 0.7, 0.07, darkMat, (x0 + x1) / 2, 0.35, tableZ);
    }

    this.buildSeats(g, L);
    return g;
  }

  buildSeats(g, L) {
    const n = L.seats.length;
    const w = L.seatW;
    const fabric = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x000000 });
    const cover = this.mat(0xf2f0ea);
    const dark = this.mat(0x2b2e35);
    this.fabricMat = fabric;

    const parts = [
      { key: 'cushion', geo: new THREE.BoxGeometry(w * 0.9, 0.13, 0.48), mat: fabric, pos: [0, 0.43, -0.03], rot: 0 },
      { key: 'back', geo: new THREE.BoxGeometry(w * 0.9, 0.74, 0.11), mat: fabric, pos: [0, 0.83, 0.25], rot: 0.13 },
      { key: 'head', geo: new THREE.BoxGeometry(w * 0.78, 0.25, 0.125), mat: cover, pos: [0, 1.085, 0.283], rot: 0.13 },
      { key: 'base', geo: new THREE.BoxGeometry(w * 0.5, 0.36, 0.3), mat: dark, pos: [0, 0.18, 0], rot: 0 },
      { key: 'armL', geo: new THREE.BoxGeometry(0.045, 0.05, 0.4), mat: dark, pos: [-w / 2 + 0.01, 0.64, 0], rot: 0 },
      { key: 'armR', geo: new THREE.BoxGeometry(0.045, 0.05, 0.4), mat: dark, pos: [w / 2 - 0.01, 0.64, 0], rot: 0 },
    ];
    const seatObj = new THREE.Object3D();
    const partObj = new THREE.Object3D();
    const m4 = new THREE.Matrix4();
    this.seatMeshes = {};
    for (const p of parts) {
      const mesh = new THREE.InstancedMesh(p.geo, p.mat, n);
      mesh.frustumCulled = false;
      partObj.position.set(...p.pos);
      partObj.rotation.set(p.rot, 0, 0);
      partObj.updateMatrix();
      for (const s of L.seats) {
        seatObj.position.set(s.x, 0, s.z);
        seatObj.rotation.set(0, s.facing > 0 ? Math.PI : 0, 0);
        seatObj.updateMatrix();
        mesh.setMatrixAt(s.index, m4.multiplyMatrices(seatObj.matrix, partObj.matrix));
        if (p.mat === fabric) mesh.setColorAt(s.index, this.seatColor);
      }
      this.seatMeshes[p.key] = mesh;
      g.add(mesh);
    }
  }

  paintSeat(seat, color) {
    for (const key of ['cushion', 'back']) {
      const mesh = this.seatMeshes[key];
      mesh.setColorAt(seat.index, color);
      mesh.instanceColor.needsUpdate = true;
    }
  }

  // ---------- camera ----------

  setSeat(seat) {
    if (this.seat) this.paintSeat(this.seat, this.seatColor);
    this.seat = seat;
    if (!seat) return this.showOverview();
    this.paintSeat(seat, new THREE.Color(0xff8a1f));
    this.mode = 'seat';
    this.zoom = 1;
    this.tpos.set(seat.x, EYE_Y, seat.z - seat.facing * 0.08);
    this.look('window');
  }

  showOverview(snap = false) {
    this.mode = 'overview';
    this.zoom = 1;
    this.tyaw = nearestAngle(0, this.yaw);
    this.tpitch = -0.4;
    if (snap) {
      this.pos.set(0, 1.95, this.layout.length / 2 - 1.5);
      this.yaw = this.tyaw = 0;
      this.pitch = this.tpitch;
    }
  }

  look(where) {
    const s = this.seat;
    if (!s) return;
    if (this.mode !== 'seat') {
      this.mode = 'seat';
      this.tpos.set(s.x, EYE_Y, s.z - s.facing * 0.08);
    }
    const ahead = s.facing < 0 ? 0 : Math.PI;
    const windowSide = s.side === 'L' ? Math.PI / 2 : -Math.PI / 2;
    let yaw = ahead;
    let pitch = -0.06;
    if (where === 'window' || where === 'aisle') {
      const sideYaw = where === 'window' ? windowSide : -windowSide;
      // turn most of the way, keeping a little of the direction you face
      const toward = Math.sign(nearestAngle(ahead, sideYaw) - sideYaw) || 1;
      yaw = sideYaw + toward * (where === 'window' ? 0.5 : 0.5);
      pitch = where === 'window' ? 0.02 : -0.12;
    }
    this.tyaw = nearestAngle(yaw, this.yaw);
    this.tpitch = pitch;
  }

  bindInput() {
    const el = this.canvas;
    let last = null;
    el.addEventListener('pointerdown', (e) => {
      last = [e.clientX, e.clientY];
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!last) return;
      const k = (0.0045 * this.camera.fov) / 70;
      this.tyaw += (e.clientX - last[0]) * k;
      this.tpitch = Math.max(-1.1, Math.min(1.0, this.tpitch + (e.clientY - last[1]) * k));
      last = [e.clientX, e.clientY];
      if (this.onUserLook) this.onUserLook();
    });
    const end = () => (last = null);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = Math.max(0.55, Math.min(1.25, this.zoom * (e.deltaY > 0 ? 1.06 : 0.94)));
    }, { passive: false });
  }

  // ---------- look and feel ----------

  setTime(name) {
    const p = (this.preset = PRESETS[name]);
    this.skyUniforms.top.value.setHex(p.top);
    this.skyUniforms.horizon.value.setHex(p.horizon);
    this.scene.fog.color.setHex(p.horizon);
    this.sun.color.setHex(p.sun);
    this.sun.intensity = p.sunI;
    this.sun.position.set(...p.sunDir).multiplyScalar(100);
    this.hemi.intensity = p.hemiI;
    this.hemi.color.setHex(p.horizon);
    this.renderer.toneMappingExposure = p.exposure;
    this.applyInterior();
  }

  applyInterior() {
    for (const m of this.interiorMats) m.emissiveIntensity = this.preset.interior;
    if (this.fabricMat) {
      // per-instance colours can't drive emissive, so glow in the class colour
      this.fabricMat.emissive.copy(this.seatColor);
      this.fabricMat.emissiveIntensity = this.preset.interior;
    }
  }

  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    const w = Math.max(1, Math.floor(box.width));
    const h = Math.max(1, Math.floor(box.height));
    this.renderer.setSize(w, h, false);
    this.aspect = w / h;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
  }

  frame() {
    if (!this.running) return;
    requestAnimationFrame(this.frame);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;

    // scenery slides past; three identical tiles keep the horizon filled
    this.scroll = (this.scroll + SPEED * dt) % TILE;
    this.tiles.forEach((t, i) => (t.position.z = this.scroll + (i - 2) * TILE));

    if (this.mode === 'overview' && this.layout) {
      const drift = (0.5 + 0.5 * Math.sin(this.time * 0.25)) * 1.6;
      this.tpos.set(0, 1.95, this.layout.length / 2 - 1.5 - drift);
    }
    const k = 1 - Math.exp(-dt * 4.5);
    this.pos.lerp(this.tpos, k);
    this.yaw += (this.tyaw - this.yaw) * k;
    this.pitch += (this.tpitch - this.pitch) * k;

    const sway = Math.sin(this.time * 8.3) * 0.003 + Math.sin(this.time * 2.1) * 0.004;
    this.camera.position.set(this.pos.x + sway * 0.6, this.pos.y + sway, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    // keep a comfortable horizontal field of view on tall phone screens
    const hfov = THREE.MathUtils.degToRad(this.aspect < 1 ? 70 : 88);
    const vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / this.aspect));
    const fov = Math.min(92, Math.max(48, vfov)) * this.zoom;
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.renderer.render(this.scene, this.camera);
  }
}
