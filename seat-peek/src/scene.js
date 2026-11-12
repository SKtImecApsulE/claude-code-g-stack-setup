import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR } from './layout.js';
import { World } from './world.js';
import { fabricTextures, speckleTexture, displayTexture, rng } from './textures.js';

const PRESETS = {
  day: {
    sunDir: [0.74, 0.6, -0.3], sun: 0xfff1dc, sunI: 5.2, hemiI: 0.9, envI: 1.25,
    lamps: 3.2, panel: 1.6, exposure: 0.62, fog: 0xc6d6e4, turbidity: 4.5, rayleigh: 1.3,
    top: 0x3f7fd0, horizon: 0xd4e3ef, envGround: 0x8f8d86, cloud: 0xffffff, cloudOpacity: 0.95,
  },
  golden: {
    sunDir: [0.93, 0.13, -0.34], sun: 0xffa45e, sunI: 5.6, hemiI: 0.5, envI: 0.9,
    lamps: 3.6, panel: 1.8, exposure: 0.62, fog: 0xdfae8a, turbidity: 9, rayleigh: 3.2,
    top: 0x3d5f9c, horizon: 0xf2b383, envGround: 0x86705f, cloud: 0xffc9a3, cloudOpacity: 0.9,
  },
  night: {
    night: true,
    sunDir: [0.5, 0.62, -0.3], sun: 0x9db3e3, sunI: 0.35, hemiI: 0.1, envI: 0.12,
    lamps: 5.5, panel: 3.2, exposure: 0.8, fog: 0x0c1222,
    top: 0x02040a, horizon: 0x131b31, envGround: 0x05070c, cloud: 0x26304a, cloudOpacity: 0.5,
  },
};

const SPEED = 36; // m/s, about 130 km/h
const WALL_TOP = 1.95; // where the side wall meets the curved ceiling
const CEIL_RISE = 0.36;

const nearestAngle = (target, current) =>
  target + Math.PI * 2 * Math.round((current - target) / (Math.PI * 2));

// Move a geometry into place so several can be merged into one mesh.
function put(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1),
  );
  return geo.applyMatrix4(m);
}
// RoundedBoxGeometry is non-indexed; make everything match before merging.
const merge = (geos) => mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, r);
const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export class SeatScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xffffff, 150, 2600);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.06, 4200);
    this.camera.rotation.order = 'YXZ';

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8d8a82, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.world = new World(this.scene);
    this.envCache = {};

    this.tex = {
      fabric: fabricTextures([3, 3]),
      carpet: fabricTextures([2, 40]),
      floor: speckleTexture([96, 100, 108], 30, [6, 36], 3),
      wall: speckleTexture([236, 233, 226], 7, [1, 8], 5),
    };

    this.car = null;
    this.layout = null;
    this.seat = null;
    this.lamps = [];
    this.mode = 'overview';
    this.pos = new THREE.Vector3(0, 1.9, 4);
    this.tpos = this.pos.clone();
    this.yaw = this.tyaw = 0;
    this.pitch = this.tpitch = -0.38;
    this.zoom = 1;
    this.time = 0;
    this.running = false;
    this.onUserLook = null;
    this.presetName = 'day';
    this.preset = PRESETS.day;

    this.bindInput();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
    this.clock = new THREE.Clock();
    this.frame = this.frame.bind(this);
  }

  // ---------- coach interior ----------

  setCoach(layout, cls, label = '') {
    if (this.car) {
      this.scene.remove(this.car);
      this.car.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      this.displayTex?.dispose();
    }
    this.layout = layout;
    this.seat = null;
    this.seatColor = new THREE.Color(cls.seat);
    this.car = this.buildCar(layout, cls, label);
    this.scene.add(this.car);

    // fit the sun's shadow box to this coach
    const cam = this.sun.shadow.camera;
    cam.left = -layout.length / 2 - 2;
    cam.right = layout.length / 2 + 2;
    cam.top = 4.5;
    cam.bottom = -3.5;
    cam.near = 1;
    cam.far = 80;
    cam.updateProjectionMatrix();

    this.setTime(this.presetName);
    this.showOverview(true);
  }

  buildCar(L, cls, label) {
    const g = new THREE.Group();
    const { halfW } = CAR;
    const { winBottom, winTop } = L;
    const len = L.length;
    const std = (o) => new THREE.MeshStandardMaterial(o);
    const add = (geo, mat, x = 0, y = 0, z = 0, shadow = 'both') => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = shadow === 'both' || shadow === 'cast';
      m.receiveShadow = shadow === 'both' || shadow === 'receive';
      g.add(m);
      return m;
    };

    const wallMat = std({ color: 0xffffff, map: this.tex.wall, roughness: 0.72 });
    const lowerMat = std({ color: 0xb9c0c9, roughness: 0.65 });
    const trimMat = std({ color: 0xd6d3cc, roughness: 0.55 });
    const darkMat = std({ color: 0x25282e, roughness: 0.5 });
    const metalMat = std({ color: 0xc3c7cc, metalness: 0.9, roughness: 0.32 });
    const floorMat = std({ color: 0xffffff, map: this.tex.floor, roughness: 0.55 });
    const carpetMat = std({
      color: cls.carpet, map: this.tex.carpet.map, bumpMap: this.tex.carpet.bump, bumpScale: 0.6, roughness: 0.95,
    });
    const ceilMat = std({ color: 0xf2f0eb, roughness: 0.85, side: THREE.DoubleSide });
    const glassMat = std({
      color: 0xbfd6df, transparent: true, opacity: 0.1, roughness: 0.03, metalness: 0, depthWrite: false,
      side: THREE.DoubleSide, envMapIntensity: 1.6,
    });
    this.panelMat = std({ color: 0xffffff, emissive: 0xfff4de, emissiveIntensity: 1 });

    const { aisleX, aisleW } = L;

    // Floor
    add(bx(halfW * 2, 0.1, len), floorMat, 0, -0.05, 0, 'receive');
    add(bx(aisleW + 0.04, 0.012, L.seatLen + 0.5), carpetMat, aisleX, 0.006, 0, 'receive');

    // Curved ceiling, with an outer roof slab that keeps the sun out
    const R = (halfW * halfW + CEIL_RISE * CEIL_RISE) / (2 * CEIL_RISE);
    const halfAngle = Math.asin(halfW / R);
    const cove = new THREE.CylinderGeometry(R, R, len, 28, 1, true, Math.PI - halfAngle, halfAngle * 2);
    cove.rotateX(Math.PI / 2);
    const arcY = WALL_TOP + CEIL_RISE - R;
    add(cove, ceilMat, 0, arcY, 0, 'receive');
    add(bx(halfW * 2 + 0.4, 0.08, len + 0.3), darkMat, 0, WALL_TOP + CEIL_RISE + 0.12, 0, 'cast');
    const ceilAt = (x) => arcY + Math.sqrt(R * R - x * x);
    add(bx(0.46, 0.02, L.seatLen + 0.8), this.panelMat, aisleX, ceilAt(Math.abs(aisleX) + 0.23) - 0.012, 0, 'none');
    for (const dx of [-0.4, 0.4]) {
      add(bx(0.07, 0.015, L.seatLen + 0.8), darkMat, aisleX + dx, ceilAt(aisleX + dx) - 0.016, 0, 'none');
    }

    // Side walls with window openings
    const ww = CAR.winWidth;
    const wh = winTop - winBottom;
    const frameShape = new THREE.Shape();
    frameShape.moveTo(-ww / 2 - 0.07, -wh / 2 - 0.07);
    frameShape.lineTo(ww / 2 + 0.07, -wh / 2 - 0.07);
    frameShape.lineTo(ww / 2 + 0.07, wh / 2 + 0.07);
    frameShape.lineTo(-ww / 2 - 0.07, wh / 2 + 0.07);
    frameShape.closePath();
    const hole = new THREE.Path();
    const hw = ww / 2 - 0.035;
    const hh = wh / 2 - 0.035;
    const hr = 0.13;
    hole.moveTo(-hw + hr, -hh);
    hole.lineTo(hw - hr, -hh);
    hole.quadraticCurveTo(hw, -hh, hw, -hh + hr);
    hole.lineTo(hw, hh - hr);
    hole.quadraticCurveTo(hw, hh, hw - hr, hh);
    hole.lineTo(-hw + hr, hh);
    hole.quadraticCurveTo(-hw, hh, -hw, hh - hr);
    hole.lineTo(-hw, -hh + hr);
    hole.quadraticCurveTo(-hw, -hh, -hw + hr, -hh);
    frameShape.holes.push(hole);
    const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
      depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 8,
    });
    const blindMat = std({ color: 0xcfc6b4, roughness: 0.9, side: THREE.DoubleSide });
    const rand = rng(L.seats.length * 31 + 7);
    const midY = (winBottom + winTop) / 2;

    for (const sx of [-1, 1]) {
      const x = sx * (halfW + 0.05);
      add(bx(0.1, winBottom, len), lowerMat, x, winBottom / 2, 0);
      add(bx(0.1, WALL_TOP - winTop + 0.02, len), wallMat, x, (WALL_TOP + winTop) / 2 + 0.01, 0);
      let cursor = -len / 2;
      for (const [w0, w1] of [...L.windows, [len / 2, len / 2]]) {
        if (w0 > cursor) add(bx(0.1, wh, w0 - cursor), wallMat, x, midY, (w0 + cursor) / 2);
        // rack bracket on each pillar between windows
        if (w0 > cursor && cursor > -len / 2 && w0 < len / 2) {
          add(bx(0.36, 0.035, 0.03), darkMat, sx * (halfW - 0.19), 1.8, (w0 + cursor) / 2, 'cast');
        }
        cursor = w1;
        if (w1 <= w0) continue;
        const zc = (w0 + w1) / 2;
        const glass = add(new THREE.PlaneGeometry(ww, wh), glassMat, sx * (halfW + 0.085), midY, zc, 'none');
        glass.rotation.y = Math.PI / 2;
        const frame = add(frameGeo, trimMat, sx * halfW, midY, zc, 'receive');
        frame.rotation.y = -sx * Math.PI / 2;
        const drop = 0.05 + rand() * (rand() < 0.25 ? 0.3 : 0.1);
        const blind = add(new THREE.PlaneGeometry(ww - 0.06, drop), blindMat, sx * (halfW + 0.03), winTop - drop / 2, zc);
        blind.rotation.y = Math.PI / 2;
        add(bx(0.03, 0.025, ww - 0.06), trimMat, sx * (halfW + 0.03), winTop - drop, zc);
      }
      // heater duct along the floor, and the luggage rack
      add(bx(0.07, 0.16, L.seatLen + 0.4), trimMat, sx * (halfW - 0.035), 0.08, 0);
      add(bx(0.4, 0.012, L.seatLen + 0.5), glassMat, sx * (halfW - 0.2), 1.82, 0, 'none');
      const rail = new THREE.CylinderGeometry(0.016, 0.016, L.seatLen + 0.5, 10);
      rail.rotateX(Math.PI / 2);
      add(rail, metalMat, sx * (halfW - 0.41), 1.845, 0);
    }

    // End walls: door with a window, passenger display, glazed partitions
    this.displayTex = displayTexture(`${label}  ${cls.name.toUpperCase()}  ·  ${Math.round(SPEED * 3.6)} km/h`);
    const displayMat = new THREE.MeshBasicMaterial({ map: this.displayTex, toneMapped: false });
    for (const sz of [-1, 1]) {
      add(bx(halfW * 2 + 0.2, WALL_TOP + CEIL_RISE, 0.1), wallMat, 0, (WALL_TOP + CEIL_RISE) / 2, sz * (len / 2 + 0.05));
      const dz = sz * (len / 2 - 0.02);
      add(bx(1.0, 2.02, 0.03), trimMat, aisleX, 1.01, dz, 'receive');
      add(bx(0.88, 1.94, 0.04), lowerMat, aisleX, 0.98, dz - sz * 0.01, 'receive');
      add(bx(0.5, 0.75, 0.05), darkMat, aisleX, 1.4, dz - sz * 0.012, 'none');
      add(bx(0.03, 0.22, 0.05), metalMat, aisleX + 0.36, 1.02, dz - sz * 0.04, 'none');
      const disp = add(new THREE.PlaneGeometry(0.8, 0.1), displayMat, aisleX, 2.1, dz - sz * 0.03, 'none');
      disp.rotation.y = sz > 0 ? Math.PI : 0;

      const pz = sz * (L.seatLen / 2 + 0.27);
      const spans = [
        [-halfW, aisleX - aisleW / 2 - 0.02],
        [aisleX + aisleW / 2 + 0.02, halfW],
      ];
      for (const [x0, x1] of spans) {
        const cx = (x0 + x1) / 2;
        add(bx(x1 - x0, 1.15, 0.045), trimMat, cx, 0.575, pz);
        add(bx(x1 - x0, 0.7, 0.012), glassMat, cx, 1.5, pz, 'none');
        add(bx(x1 - x0, 0.03, 0.03), metalMat, cx, 1.86, pz);
        const edgeX = x0 === -halfW ? x1 : x0;
        add(bx(0.03, 1.87, 0.05), metalMat, edgeX, 0.935, pz);
      }
    }

    // Tables between the two facing halves of a chair car
    if (L.kind === 'chair') {
      const tableMat = std({ color: 0xd9d4c8, roughness: 0.4 });
      for (const [x0, x1] of L.blocks) {
        const cx = (x0 + x1) / 2;
        add(rbox(x1 - x0 - 0.04, 0.03, 0.5, 0.012), tableMat, cx, 0.73, L.tableZ);
        add(bx(x1 - x0 - 0.02, 0.012, 0.52), darkMat, cx, 0.716, L.tableZ);
        add(new THREE.CylinderGeometry(0.035, 0.05, 0.71, 12), metalMat, cx, 0.355, L.tableZ);
      }
    }

    // Warm ceiling lamps down the aisle
    this.lamps = [];
    const nLamps = Math.max(3, Math.round(L.seatLen / 4));
    for (let i = 0; i < nLamps; i++) {
      const lamp = new THREE.PointLight(0xfff0d8, 1, 9, 1.6);
      lamp.position.set(aisleX, 2.05, -L.seatLen / 2 + ((i + 0.5) * L.seatLen) / nLamps);
      g.add(lamp);
      this.lamps.push(lamp);
    }

    if (L.kind === 'chair') this.buildSeats(g, L);
    else this.buildBerths(g, L, { add, trimMat, darkMat, metalMat, wallMat });
    return g;
  }

  // One seat is modelled once, facing -Z with its origin on the floor, then instanced.
  buildSeats(g, L) {
    const w = L.seatW;
    const tilt = 0.14;
    const fabricGeo = merge([
      put(rbox(w * 0.9, 0.13, 0.5, 0.05), 0, 0.44, -0.04, 0.05),
      put(rbox(w * 0.88, 0.64, 0.12, 0.05), 0, 0.79, 0.25, tilt),
      put(rbox(w * 0.2, 0.5, 0.09, 0.04), -w * 0.36, 0.76, 0.215, tilt),
      put(rbox(w * 0.2, 0.5, 0.09, 0.04), w * 0.36, 0.76, 0.215, tilt),
      put(rbox(w * 0.74, 0.25, 0.13, 0.055), 0, 1.09, 0.27, tilt),
    ]);
    const clothGeo = put(rbox(w * 0.6, 0.17, 0.142, 0.06), 0, 1.14, 0.278, tilt);
    const shellGeo = merge([
      put(rbox(w * 0.9, 0.7, 0.04, 0.018), 0, 0.82, 0.325, tilt),
      put(rbox(0.05, 0.045, 0.36, 0.02), -w / 2 + 0.012, 0.665, 0.02),
      put(rbox(0.05, 0.045, 0.36, 0.02), w / 2 - 0.012, 0.665, 0.02),
      put(bx(0.035, 0.2, 0.05), -w / 2 + 0.012, 0.56, 0.16),
      put(bx(0.035, 0.2, 0.05), w / 2 - 0.012, 0.56, 0.16),
      put(bx(w * 0.66, 0.15, 0.03), 0, 0.6, 0.325, tilt), // seat pocket
      put(bx(0.05, 0.022, 0.02), 0, 1.03, 0.41, tilt), // tray latch
      put(bx(w * 0.62, 0.05, 0.42), 0, 0.36, 0.02),
    ]);
    const trayGeo = put(rbox(w * 0.7, 0.3, 0.02, 0.008), 0, 0.87, 0.36, tilt);
    const bar = new THREE.CylinderGeometry(0.012, 0.012, w * 0.7, 8);
    const metalGeo = merge([
      put(bx(0.06, 0.34, 0.28), 0, 0.17, 0.04),
      put(bx(w * 0.5, 0.03, 0.34), 0, 0.015, 0.04),
      put(bar, 0, 0.15, 0.4, 0, 0, Math.PI / 2),
    ]);

    const fabricMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, map: this.tex.fabric.map, bumpMap: this.tex.fabric.bump, bumpScale: 0.8, roughness: 0.96,
    });
    const parts = [
      ['fabric', fabricGeo, fabricMat],
      ['cloth', clothGeo, new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.9 })],
      ['shell', shellGeo, new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.55 })],
      ['tray', trayGeo, new THREE.MeshStandardMaterial({ color: 0x8d9198, roughness: 0.45 })],
      ['metal', metalGeo, new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.85, roughness: 0.4 })],
    ];

    const d = new THREE.Object3D();
    this.seatMeshes = {};
    for (const [key, geo, mat] of parts) {
      const mesh = new THREE.InstancedMesh(geo, mat, L.seats.length);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      for (const s of L.seats) {
        d.position.set(s.x, 0, s.z);
        d.rotation.set(0, s.facing > 0 ? Math.PI : 0, 0);
        d.updateMatrix();
        mesh.setMatrixAt(s.index, d.matrix);
        if (key === 'fabric') mesh.setColorAt(s.index, this.seatColor);
      }
      this.seatMeshes[key] = mesh;
      g.add(mesh);
    }
  }

  // Sleeper and AC coaches: bays of berths across the coach, side berths along the wall.
  buildBerths(g, L, { add, trimMat, darkMat, metalMat, wallMat }) {
    const [x0, x1] = L.mainX;
    const mainLen = x1 - x0 - 0.04;
    const mainX = (x0 + x1) / 2;
    const vinyl = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62 });
    const linen = new THREE.MeshStandardMaterial({ color: 0xf3f1ea, roughness: 0.9 });
    const d = new THREE.Object3D();
    const instanced = (geo, mat, items, place) => {
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
      mesh.count = items.length;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      items.forEach((it, i) => {
        d.position.set(...place(it));
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
        if (mat === vinyl) mesh.setColorAt(i, this.seatColor);
      });
      g.add(mesh);
      return mesh;
    };

    this.seatMeshes = {
      main: instanced(rbox(mainLen, 0.09, 0.6, 0.03), vinyl, L.mainSlabs, (b) => [mainX, b.y - 0.045, b.z]),
      side: instanced(rbox(0.5, 0.09, L.bay - 0.12, 0.03), vinyl, L.sideSlabs, (b) => [L.sideX, b.y - 0.045, b.z]),
    };
    if (L.ac) {
      instanced(rbox(0.36, 0.09, 0.3, 0.04), linen, L.mainSlabs, (b) => [x0 + 0.24, b.y + 0.04, b.z]);
      instanced(rbox(0.3, 0.09, 0.36, 0.04), linen, L.sideSlabs, (b) => [L.sideX, b.y + 0.04, b.z - L.bay / 2 + 0.3]);
    }

    // Bay partitions, with a small fold-down table under each window
    const partMat = new THREE.MeshStandardMaterial({ color: 0xe6dfd0, roughness: 0.7 });
    for (const z of L.partitions) {
      add(bx(mainLen + 0.04, 1.95, 0.04), partMat, mainX, 0.975, z);
      if (L.hasSide) {
        add(bx(0.5, 0.42, 0.03), partMat, L.sideX, 0.68, z);
        add(bx(0.5, 0.3, 0.03), partMat, L.sideX, 1.68, z);
      }
    }
    for (let i = 0; i < L.partitions.length - 1; i++) {
      const zc = (L.partitions[i] + L.partitions[i + 1]) / 2;
      add(rbox(0.3, 0.025, 0.42, 0.01), trimMat, x0 + 0.17, 0.74, zc);
      // ladder rungs up to the upper berths
      for (const y of [0.75, 1.25]) add(bx(0.03, 0.03, 0.26), metalMat, x1 - 0.02, y, L.partitions[i] + 0.2, 'none');
      if (!L.hasSide) {
        // first class: a corridor wall with a doorway closes each cabin
        const solid = (L.bay - 0.75) / 2;
        for (const dz of [-1, 1]) {
          add(bx(0.04, 1.95, solid), wallMat, x1 + 0.02, 0.975, zc + dz * (0.375 + solid / 2));
        }
        add(bx(0.05, 0.12, 0.75), darkMat, x1 + 0.02, 1.9, zc);
      }
    }
  }

  paintSeat(seat, color) {
    const mesh = this.seatMeshes[seat.mesh];
    mesh.setColorAt(seat.inst, color);
    mesh.instanceColor.needsUpdate = true;
  }

  // ---------- camera ----------

  seatEye(s) {
    return this.tpos.set(...s.eye);
  }

  setSeat(seat) {
    if (this.seat) this.paintSeat(this.seat, this.seatColor);
    this.seat = seat;
    if (!seat) return this.showOverview();
    this.paintSeat(seat, new THREE.Color(0xff8a1f));
    this.mode = 'seat';
    this.zoom = 1;
    this.seatEye(seat);
    this.look(Object.keys(seat.looks)[0]);
  }

  // Berth coaches fill the middle of the car, so stand in the aisle instead.
  overviewX() {
    return this.layout.kind === 'berth' ? this.layout.aisleX : 0;
  }

  showOverview(snap = false) {
    this.mode = 'overview';
    this.zoom = 1;
    this.tyaw = nearestAngle(0, this.yaw);
    this.tpitch = -0.36;
    if (snap) {
      this.pos.set(this.overviewX(), 1.86, this.layout.length / 2 - 1.5);
      this.yaw = this.tyaw = 0;
      this.pitch = this.tpitch;
    }
  }

  look(where) {
    const s = this.seat;
    if (!s) return;
    if (this.mode !== 'seat') {
      this.mode = 'seat';
      this.seatEye(s);
    }
    const [yaw, pitch] = s.looks[where] || Object.values(s.looks)[0];
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

  // ---------- light ----------

  setTime(name) {
    this.presetName = name;
    const p = (this.preset = PRESETS[name]);
    this.world.applyPreset(p);
    this.scene.fog.color.setHex(p.fog);
    this.sun.color.setHex(p.sun);
    this.sun.intensity = p.sunI;
    this.sun.position.set(...p.sunDir).normalize().multiplyScalar(40);
    this.sun.target.position.set(0, 1, 0);
    this.hemi.intensity = p.hemiI;
    this.hemi.color.setHex(p.horizon);
    this.renderer.toneMappingExposure = p.exposure;
    this.envCache[name] ||= this.world.environment(this.renderer, p);
    this.scene.environment = this.envCache[name];
    this.scene.environmentIntensity = p.envI;
    for (const lamp of this.lamps) lamp.intensity = p.lamps;
    if (this.panelMat) this.panelMat.emissiveIntensity = p.panel;
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
    this.world.update(SPEED * dt);

    if (this.mode === 'overview' && this.layout) {
      const drift = (0.5 + 0.5 * Math.sin(this.time * 0.25)) * 1.6;
      this.tpos.set(this.overviewX(), 1.86, this.layout.length / 2 - 1.5 - drift);
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
