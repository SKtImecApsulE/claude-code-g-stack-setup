// Small procedural textures drawn on canvases, so the app ships no image files.
import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, repeat, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

// Fill a canvas from a per-pixel grey/colour function.
function pixels(size, fn) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = fn(x, y);
      const i = (y * size + x) * 4;
      if (typeof v === 'number') {
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      } else {
        img.data[i] = v[0];
        img.data[i + 1] = v[1];
        img.data[i + 2] = v[2];
      }
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Woven seat moquette: near-white so the seat colour can tint it.
export function fabricTextures(repeat = [3, 3]) {
  const rand = rng(7);
  const c = pixels(128, (x, y) => {
    let v = 226 + (rand() - 0.5) * 34;
    if ((x + y) % 4 < 2) v -= 9; // twill weave
    const dx = Math.abs((x % 32) - 16);
    const dy = Math.abs((y % 32) - 16);
    if (dx + dy < 5) v -= 60; // small diamond motif
    if ((x + 16) % 32 < 2) v -= 16;
    return v;
  });
  return { map: toTexture(c, repeat), bump: toTexture(c, repeat, false) };
}

export function speckleTexture(base, amp, repeat, seed = 3, size = 128) {
  const rand = rng(seed);
  const c = pixels(size, () => {
    const n = (rand() - 0.5) * amp + (rand() < 0.04 ? amp * 0.9 : 0);
    return [base[0] + n, base[1] + n, base[2] + n];
  });
  return toTexture(c, repeat);
}

// Grass seen from a moving train: mottled greens, tileable.
export function grassTexture(repeat) {
  const size = 512;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(11);
  ctx.fillStyle = '#6f9547';
  ctx.fillRect(0, 0, size, size);
  const tones = ['#5f8a3d', '#7da04f', '#88a653', '#587f39', '#93a85a', '#6a9044'];
  for (let i = 0; i < 900; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 6 + rand() * 46;
    ctx.globalAlpha = 0.1 + rand() * 0.16;
    ctx.fillStyle = tones[Math.floor(rand() * tones.length)];
    // draw wrapped copies so the tile has no seams
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, r, r * (0.5 + rand() * 0.8), rand() * 3, 0, 7);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 26;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n * 0.6;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, repeat);
}

// Crop rows; near-white so each field can be tinted.
export function cropTexture() {
  const rand = rng(23);
  const c = pixels(128, (x) => 205 + Math.sin((x / 128) * Math.PI * 2 * 16) * 30 + (rand() - 0.5) * 30);
  return toTexture(c, [1, 1]);
}

// Ballast streaked along the direction of travel, like motion blur.
export function ballastTexture(repeat) {
  const size = 256;
  const rand = rng(31);
  const cols = Array.from({ length: size }, () => (rand() - 0.5) * 46);
  const c = pixels(size, (x) => {
    const n = cols[x] + (rand() - 0.5) * 10;
    return [140 + n, 133 + n, 124 + n];
  });
  return toTexture(c, repeat);
}

export function cloudTexture(seed) {
  const c = makeCanvas(256, 128);
  const ctx = c.getContext('2d');
  const rand = rng(seed);
  for (let i = 0; i < 46; i++) {
    const x = 48 + rand() * 160;
    const y = 52 + rand() * 34 - Math.abs(x - 128) * 0.08;
    const r = 14 + rand() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function blobShadowTexture() {
  const c = makeCanvas(64);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Amber dot-matrix style passenger display.
export function displayTexture(text) {
  const c = makeCanvas(512, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = '#ffab2e';
  ctx.font = '600 34px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
