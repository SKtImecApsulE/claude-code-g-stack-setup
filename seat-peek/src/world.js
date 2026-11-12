// Everything outside the windows: sky, clouds, ground, fields, trees, hills.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  rng, grassTexture, cropTexture, ballastTexture, cloudTexture, blobShadowTexture,
} from './textures.js';

export const TILE = 1200; // scenery repeats every TILE metres
export const GROUND_Y = -1.2;
const GRASS_TILE = 42;

const GRADIENT_VERT = `
  varying float h;
  void main() {
    h = normalize(position).y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const GRADIENT_FRAG = `
  uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform float gain;
  varying float h;
  void main() {
    vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.5)) : mix(horizon, ground, min(1.0, -h * 5.0));
    gl_FragColor = vec4(c * gain, 1.0);
  }`;

function gradientMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      ground: { value: new THREE.Color() },
      gain: { value: 1 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: GRADIENT_VERT,
    fragmentShader: GRADIENT_FRAG,
  });
}

// A lumpy canopy: a few jittered spheres, darker underneath.
function crownGeometry() {
  const rand = rng(5);
  const blobs = [
    [0, 0, 0, 1],
    [0.55, -0.15, 0.2, 0.72],
    [-0.5, -0.1, -0.3, 0.76],
    [0.1, 0.45, -0.1, 0.66],
    [-0.15, -0.2, 0.55, 0.62],
  ].map(([x, y, z, s]) => {
    const g = new THREE.SphereGeometry(s, 9, 7);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + (rand() - 0.5) * 0.22;
      p.setXYZ(i, p.getX(i) * k + x, p.getY(i) * k + y, p.getZ(i) * k + z);
    }
    return g;
  });
  const geo = mergeGeometries(blobs);
  geo.computeVertexNormals();
  const p = geo.attributes.position;
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const shade = 0.5 + 0.5 * THREE.MathUtils.smoothstep(p.getY(i), -0.9, 0.9);
    colors.set([shade, shade, shade], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// A ridge line running parallel to the track, tileable over TILE.
function ridgeGeometry(x, base, amp, seed) {
  const rand = rng(seed);
  const N = 120;
  const waves = [1, 2, 3, 5, 8, 13, 21].map((k) => ({ k, a: (0.4 + rand()) / Math.sqrt(k), p: rand() * 6.283 }));
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    let h = 0;
    for (const w of waves) h += w.a * Math.sin((i / N) * Math.PI * 2 * w.k + w.p);
    h = Math.max(base * 0.3, base + amp * h * 0.55);
    const z = (i / N) * TILE;
    pos.push(x, GROUND_Y - 3, z, x * 1.08, GROUND_Y + h, z);
    nor.push(0, 1, 0, 0, 1, 0);
    col.push(0.78, 0.78, 0.78, 1, 1, 1);
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.scroll = 0;

    // Sky: physical sky by day, a simple gradient plus stars at night.
    this.sky = new Sky();
    this.sky.scale.setScalar(4600);
    this.sky.frustumCulled = false;
    this.nightSky = new THREE.Mesh(new THREE.SphereGeometry(2250, 24, 12), gradientMaterial());
    this.nightSky.frustumCulled = false;
    scene.add(this.sky, this.nightSky);

    const rand = rng(99);
    const starPos = [];
    for (let i = 0; i < 700; i++) {
      const az = rand() * Math.PI * 2;
      const el = Math.asin(0.04 + rand() * 0.96);
      starPos.push(Math.cos(az) * Math.cos(el) * 2100, Math.sin(el) * 2100, Math.sin(az) * Math.cos(el) * 2100);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    this.cloudMats = [1, 2, 3].map((s) => new THREE.SpriteMaterial({
      map: cloudTexture(s * 17), transparent: true, depthWrite: false, fog: false,
    }));
    for (let i = 0; i < 22; i++) {
      const sp = new THREE.Sprite(this.cloudMats[i % 3]);
      const az = rand() * Math.PI * 2;
      const dist = 1500 + rand() * 600;
      const w = 700 + rand() * 900;
      sp.position.set(Math.cos(az) * dist, 260 + rand() * 520, Math.sin(az) * dist);
      sp.scale.set(w, w * 0.42, 1);
      scene.add(sp);
    }

    this.grass = grassTexture([7000 / GRASS_TILE, 7000 / GRASS_TILE]);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(7000, 7000),
      new THREE.MeshLambertMaterial({ map: this.grass }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = GROUND_Y;
    scene.add(ground);

    this.tiles = [0, 1, 2].map(() => this.buildTile());
    this.ridges = [0, 1, 2, 3, 4, 5].map(() => this.buildRidges());
    [...this.tiles, ...this.ridges].forEach((t) => scene.add(t));
  }

  buildRidges() {
    const g = new THREE.Group();
    const layers = [
      [430, 20, 16, 0x3f6a38],
      [-520, 24, 18, 0x44703c],
      [900, 70, 55, 0x5d7f62],
      [-1050, 85, 60, 0x587a66],
      [1700, 190, 130, 0x7d95a6],
      [-1800, 170, 150, 0x8298aa],
    ];
    layers.forEach(([x, base, amp, color], i) => {
      const m = new THREE.Mesh(
        ridgeGeometry(x, base, amp, 100 + i * 7),
        new THREE.MeshLambertMaterial({ color, vertexColors: true, side: THREE.DoubleSide }),
      );
      m.frustumCulled = false;
      g.add(m);
    });
    return g;
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
    const place = (mesh, i, x, y, z, sx, sy, sz, ry = 0) => {
      d.position.set(x, y, z);
      d.rotation.set(0, ry, 0);
      d.scale.set(sx, sy, sz);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    };

    // Track bed, in tile-length pieces (very long thin boxes cause depth artefacts).
    const ballast = new THREE.Mesh(
      new THREE.BoxGeometry(11, 0.3, TILE),
      new THREE.MeshLambertMaterial({ map: ballastTexture([3, 1]) }),
    );
    ballast.position.set(1.6, GROUND_Y + 0.15, TILE / 2);
    g.add(ballast);
    const SEG = 40;
    const nSeg = TILE / SEG;
    const rails = make(
      new THREE.BoxGeometry(0.08, 0.14, SEG),
      new THREE.MeshStandardMaterial({ color: 0x6c6a68, metalness: 0.8, roughness: 0.35 }),
      nSeg * 2,
    );
    const wires = make(
      new THREE.BoxGeometry(0.025, 0.025, SEG),
      new THREE.MeshBasicMaterial({ color: 0x2a2c30 }),
      nSeg * 2,
    );
    for (let i = 0; i < nSeg; i++) {
      const z = (i + 0.5) * SEG;
      place(rails, i * 2, 4.0, GROUND_Y + 0.37, z, 1, 1, 1);
      place(rails, i * 2 + 1, 5.5, GROUND_Y + 0.37, z, 1, 1, 1);
      place(wires, i * 2, 4.75, GROUND_Y + 5.6, z, 1, 1, 1);
      place(wires, i * 2 + 1, 4.75, GROUND_Y + 6.5, z, 1, 1, 1);
    }

    // Fields
    const nFields = 60;
    const fieldGeo = new THREE.PlaneGeometry(1, 1);
    fieldGeo.rotateX(-Math.PI / 2);
    const fields = make(fieldGeo, new THREE.MeshLambertMaterial({ map: cropTexture() }), nFields);
    const fieldColors = [0x8fae4e, 0xc9c067, 0x5f9040, 0xb59a58, 0x7fb25c, 0xd8cd7c, 0x8a7350, 0x4f8a45];
    for (let i = 0; i < nFields; i++) {
      const w = 50 + rand() * 140;
      const len = 60 + rand() * 180;
      place(fields, i, side() * (16 + w / 2 + rand() * 520), GROUND_Y + 0.04 + i * 0.003, rand() * TILE,
        w, 1, len, rand() < 0.5 ? 0 : Math.PI / 2);
      fields.setColorAt(i, col.setHex(fieldColors[Math.floor(rand() * fieldColors.length)]));
    }

    // Trees and trackside bushes
    const nTrees = 230;
    const nBush = 70;
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const trunks = make(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x4d3b2a }), nTrees);
    const crowns = make(crownGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), nTrees + nBush);
    const blobGeo = new THREE.PlaneGeometry(1, 1);
    blobGeo.rotateX(-Math.PI / 2);
    const blobs = make(blobGeo, new THREE.MeshBasicMaterial({
      map: blobShadowTexture(), transparent: true, depthWrite: false, opacity: 0.8,
    }), nTrees + nBush);
    this.blobMats = this.blobMats || [];
    this.blobMats.push(blobs.material);
    for (let i = 0; i < nTrees + nBush; i++) {
      const bush = i >= nTrees;
      const x = bush ? side() * (7.5 + rand() * 5) + 1.6 : side() * (13 + Math.pow(rand(), 1.7) * 420);
      const z = rand() * TILE;
      const tall = !bush && rand() < 0.22;
      const h = bush ? 0 : 3 + rand() * 5;
      const r = bush ? 0.7 + rand() * 0.9 : tall ? 1.3 + rand() * 0.7 : 2 + rand() * 2.4;
      const ry = rand() * 6.283;
      const stretch = tall ? 2.6 + rand() : 0.85 + rand() * 0.4;
      if (!bush) place(trunks, i, x, GROUND_Y, z, 1 + r * 0.25, h + r * 0.4, 1 + r * 0.25, ry);
      place(crowns, i, x, GROUND_Y + h + r * stretch * 0.55, z, r, r * stretch, r, ry);
      crowns.setColorAt(i, col.setHSL(0.24 + rand() * 0.1, 0.42 + rand() * 0.22, 0.26 + rand() * 0.14));
      place(blobs, i, x - r * 0.5, GROUND_Y + 0.25 + (i % 7) * 0.004, z, r * 3, 1, r * 2.6);
    }

    // Houses
    const nHouses = 22;
    const wallGeo = new THREE.BoxGeometry(1, 1, 1);
    wallGeo.translate(0, 0.5, 0);
    const roofGeo = new THREE.CylinderGeometry(0.72, 0.72, 1, 3, 1);
    roofGeo.rotateZ(Math.PI / 2);
    roofGeo.scale(1, 0.6, 1);
    roofGeo.translate(0, 0.2, 0);
    const walls = make(wallGeo, new THREE.MeshLambertMaterial(), nHouses);
    const roofs = make(roofGeo, new THREE.MeshLambertMaterial(), nHouses);
    const wallColors = [0xf0e3c8, 0xe6d2b0, 0xdfe6ea, 0xf2c9a0, 0xfaf3e6, 0xcfdcc6];
    const roofColors = [0xa3523a, 0x8a4a38, 0x59636d, 0x9c6a45];
    for (let i = 0; i < nHouses; i++) {
      const x = side() * (35 + rand() * 300);
      const z = rand() * TILE;
      const w = 6 + rand() * 6;
      const h = 2.8 + rand() * 3;
      const ry = rand() * 0.7 - 0.35;
      place(walls, i, x, GROUND_Y, z, w, h, w * 0.75, ry);
      walls.setColorAt(i, col.setHex(wallColors[Math.floor(rand() * wallColors.length)]));
      place(roofs, i, x, GROUND_Y + h, z, w * 1.08, w * 0.55, w * 0.62, ry);
      roofs.setColorAt(i, col.setHex(roofColors[Math.floor(rand() * roofColors.length)]));
    }

    // Overhead-line masts beside the track
    const nMasts = TILE / 60;
    const mastGeo = new THREE.BoxGeometry(0.2, 7.6, 0.2);
    mastGeo.translate(0, 3.8, 0);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x80868c, metalness: 0.6, roughness: 0.5 });
    const masts = make(mastGeo, mastMat, nMasts * 2);
    const arms = make(new THREE.BoxGeometry(3.0, 0.09, 0.09), mastMat, nMasts * 2);
    for (let i = 0; i < nMasts; i++) {
      [[-3.6, 1], [7.6, -1]].forEach(([x, dir], j) => {
        place(masts, i * 2 + j, x, GROUND_Y, i * 60 + 12, 1, 1, 1);
        place(arms, i * 2 + j, x + dir * 1.5, GROUND_Y + 6.6, i * 60 + 12, 1, 1, 1);
      });
    }
    return g;
  }

  applyPreset(p) {
    const day = !p.night;
    this.sky.visible = day;
    this.nightSky.visible = !day;
    this.stars.visible = !day;
    if (day) {
      const u = this.sky.material.uniforms;
      u.turbidity.value = p.turbidity;
      u.rayleigh.value = p.rayleigh;
      u.mieCoefficient.value = 0.004;
      u.mieDirectionalG.value = 0.82;
      u.sunPosition.value.set(...p.sunDir);
    } else {
      const u = this.nightSky.material.uniforms;
      u.top.value.setHex(p.top);
      u.horizon.value.setHex(p.horizon);
      u.ground.value.setHex(p.horizon);
    }
    for (const m of this.cloudMats) {
      m.color.setHex(p.cloud);
      m.opacity = p.cloudOpacity;
    }
    for (const m of this.blobMats) m.opacity = p.night ? 0.25 : 0.8;
  }

  // Gradient environment used for reflections and soft fill light.
  environment(renderer, p) {
    const scene = new THREE.Scene();
    const mat = gradientMaterial();
    mat.uniforms.top.value.setHex(p.top);
    mat.uniforms.horizon.value.setHex(p.horizon);
    mat.uniforms.ground.value.setHex(p.envGround);
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), mat));
    const pmrem = new THREE.PMREMGenerator(renderer);
    const tex = pmrem.fromScene(scene, 0.03).texture;
    pmrem.dispose();
    return tex;
  }

  update(distance) {
    this.scroll = (this.scroll + distance) % TILE;
    this.tiles.forEach((t, i) => (t.position.z = this.scroll + (i - 2) * TILE));
    this.ridges.forEach((t, i) => (t.position.z = this.scroll + (i - 4) * TILE));
    this.grass.offset.y = (this.grass.offset.y + distance / GRASS_TILE) % 1;
  }
}
