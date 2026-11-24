// Pintura da superfície planetária (compartilhada entre a vista 2D e a textura 3D)
import { HW, HH, GW, GH, STARS } from './planet.js';
import { Noise3, clamp, lerp, lonLatToXYZ, hsl2rgb, RNG } from './util.js';
import { MAX, NP, P_ } from './sim.js';

export const SW = 1280, SH = 640;

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

export function planetPalette(p) {
  const rng = new RNG(p.seed * 31 + 7);
  const rockH = rng.pick([0.06, 0.08, 0.03, 0.1, 0.58, 0.0]);
  const rockS = rng.range(0.12, 0.32);
  const ocean = {
    G: [[0.04, 0.11, 0.17], [0.13, 0.34, 0.42]],
    K: [[0.03, 0.12, 0.13], [0.15, 0.36, 0.34]],
    M: [[0.07, 0.07, 0.15], [0.26, 0.24, 0.38]],
    F: [[0.03, 0.08, 0.19], [0.14, 0.3, 0.5]],
  }[p.star];
  return {
    deep: ocean[0], shallow: ocean[1],
    lowRock: hsl2rgb(rockH, rockS, 0.3), midRock: hsl2rgb(rockH + 0.02, rockS * 0.8, 0.45), highRock: hsl2rgb(rockH, rockS * 0.4, 0.66),
    wetRock: hsl2rgb(rockH, rockS * 1.1, 0.22),
    ice: [0.86, 0.9, 0.94], star: STARS[p.star].color,
  };
}

export class SurfacePainter {
  constructor(world) {
    this.world = world;
    this.base = document.createElement('canvas'); this.base.width = SW; this.base.height = SH;
    this.surface = document.createElement('canvas'); this.surface.width = SW; this.surface.height = SH;
    this.overlay = document.createElement('canvas'); this.overlay.width = GW; this.overlay.height = GH;
    this.clouds = document.createElement('canvas'); this.clouds.width = 512; this.clouds.height = 256;
    this.cloudsGray = document.createElement('canvas'); this.cloudsGray.width = 1024; this.cloudsGray.height = 512;
    this.bump = null; // altura normalizada para o 3D
    this.version = 0;
    this.baseVersion = -1;
    this.cloudSeed = -1;
  }

  paintBase(rect = null) {
    const w = this.world, p = w.planet, E = w.elevHi;
    const full = !rect || !this.H || !this.baseImg;
    if (full) {
      this.pal = planetPalette(p);
      this.H = new Float32Array(SW * SH);
      this.baseImg = this.base.getContext('2d').createImageData(SW, SH);
      this.tideMask = this.tideMask || document.createElement('canvas');
      this.tideMask.width = SW; this.tideMask.height = SH;
      this.tideImg = this.tideMask.getContext('2d').createImageData(SW, SH);
      this.noise = new Noise3(p.seed + 99); this.dither = null;
      this.region(0, SW, 0, SH);
      this.base.getContext('2d').putImageData(this.baseImg, 0, 0);
      this.tideMask.getContext('2d').putImageData(this.tideImg, 0, 0);
    } else {
      let x0 = Math.floor(rect.u0 * SW) - 3, x1 = Math.ceil(rect.u1 * SW) + 3;
      const y0 = Math.max(0, Math.floor(rect.v0 * SH) - 3), y1 = Math.min(SH, Math.ceil(rect.v1 * SH) + 3);
      if (x1 - x0 >= SW) { x0 = 0; x1 = SW; }
      const spans = [];
      if (x0 < 0) { spans.push([x0 + SW, SW]); spans.push([0, x1]); }
      else if (x1 > SW) { spans.push([x0, SW]); spans.push([0, x1 - SW]); }
      else spans.push([x0, x1]);
      for (const [a, b] of spans) {
        this.region(a, b, y0, y1);
        this.base.getContext('2d').putImageData(this.baseImg, 0, 0, a, y0, b - a, y1 - y0);
        this.tideMask.getContext('2d').putImageData(this.tideImg, 0, 0, a, y0, b - a, y1 - y0);
      }
    }
    this.baseVersion = this.key();
    if (this.cloudSeed !== p.seed) this.paintClouds();
  }

  key() { const w = this.world; return w.elevVersion + ':' + w.planet.water + ':' + w.planet.star + ':' + w.planet.seed; }

  region(xa, xb, ya, yb) {
    const w = this.world, E = w.elevHi, sea = w.sea, pal = this.pal, H = this.H, n = this.noise;
    const d = this.baseImg.data, td = this.tideImg.data;
    const sample = (x, y) => {
      const fx = x * HW / SW - 0.5, fy = clamp(y * HH / SH - 0.5, 0, HH - 1.001);
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const xa = (x0 + HW) % HW, xb = (x0 + 1 + HW) % HW, yb = Math.min(HH - 1, y0 + 1);
      const a = E[y0 * HW + xa], b = E[y0 * HW + xb], c = E[yb * HW + xa], e = E[yb * HW + xb];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
    };
    const yA = Math.max(0, ya - 1), yB = Math.min(SH, yb + 1);
    for (let y = yA; y < yB; y++) for (let x = xa - 1; x < xb + 1; x++) { const xx = (x + SW) % SW; H[y * SW + xx] = sample(xx, y); }
    const contour = 0.07, amp = w.tideAmp;
    for (let y = ya; y < yb; y++) {
      const v = (y + 0.5) / SH;
      for (let x = xa; x < xb; x++) {
        const i = y * SW + x;
        const h = H[i];
        const hl = H[y * SW + (x + SW - 1) % SW], hr = H[y * SW + (x + 1) % SW];
        const hu = H[Math.max(0, y - 1) * SW + x], hd = H[Math.min(SH - 1, y + 1) * SW + x];
        const dx = (hr - hl), dy = (hd - hu);
        let col;
        const [X, Y, Z] = lonLatToXYZ((x + 0.5) / SW, v);
        const grain = n.fbm(X * 22, Y * 22, Z * 22, 3) * 0.5 + n.fbm(X * 70, Y * 70, Z * 70, 2) * 0.25;
        if (h <= sea) {
          const depth = clamp((sea - h) / (sea + 1) * 3.2);
          col = mix(pal.shallow, pal.deep, Math.pow(depth, 0.55));
          const band = ((sea - h) / contour * 1.6) % 1;
          if (band < 0.06 && depth > 0.05) col = mix(col, pal.shallow, 0.18);
          col = mix(col, [col[0] * 1.15, col[1] * 1.15, col[2] * 1.15], grain * 0.25 + 0.1);
        } else {
          const alt = clamp((h - sea) / (1 - sea));
          col = alt < 0.35 ? mix(pal.lowRock, pal.midRock, alt / 0.35) : mix(pal.midRock, pal.highRock, (alt - 0.35) / 0.65);
          col = mix(col, pal.wetRock, clamp(0.3 - alt) * 0.8);
          const shade = clamp(0.5 + (-dx * 0.7 - dy * 0.9) * 15, 0, 1.2);
          col = [col[0] * (0.68 + shade * 0.45), col[1] * (0.68 + shade * 0.45), col[2] * (0.68 + shade * 0.45)];
          col = mix(col, [col[0] * 1.18, col[1] * 1.14, col[2] * 1.08], grain * 0.25);
          const band = ((h - sea) / contour) % 1;
          const slope = Math.abs(dx) + Math.abs(dy);
          if (band < 0.045 + slope * 2) col = [col[0] * 0.82, col[1] * 0.82, col[2] * 0.82];
        }
        if ((h - sea) * (hr - sea) < 0 || (h - sea) * (hd - sea) < 0) col = h > sea ? [col[0] * 0.55, col[1] * 0.55, col[2] * 0.58] : mix(col, [0.8, 0.85, 0.82], 0.35);
        const k = i * 4;
        d[k] = clamp(col[0]) * 255; d[k + 1] = clamp(col[1]) * 255; d[k + 2] = clamp(col[2]) * 255; d[k + 3] = 255;
        const dd = h - sea;
        if (dd > 0 && dd < amp) { td[k] = 150; td[k + 1] = 190; td[k + 2] = 195; td[k + 3] = 255 * (1 - dd / amp) * 0.85; } else td[k + 3] = 0;
      }
    }
  }

  paintClouds() {
    const p = this.world.planet, n = new Noise3(p.seed + 555);
    const c = this.clouds, ctx = c.getContext('2d'), img = ctx.createImageData(c.width, c.height);
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const [X, Y, Z] = lonLatToXYZ((x + 0.5) / c.width, (y + 0.5) / c.height);
      const lat = Math.abs(0.5 - (y + 0.5) / c.height) * 2;
      const band = 0.5 + 0.5 * Math.cos(lat * Math.PI * 3);
      let v = n.fbm(X * 2.4, Y * 5, Z * 2.4, 6) * 0.9 + band * 0.25 - 0.08;
      v = clamp(v * 2.2);
      const k = (y * c.width + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 245; img.data[k + 3] = v * 255;
    }
    ctx.putImageData(img, 0, 0);
    // versão opaca em tons de cinza (alphaMap do 3D), em resolução maior
    const g = this.cloudsGray, gctx = g.getContext('2d'), gimg = gctx.createImageData(g.width, g.height);
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const [X, Y, Z] = lonLatToXYZ((x + 0.5) / g.width, (y + 0.5) / g.height);
      const lat = Math.abs(0.5 - (y + 0.5) / g.height) * 2;
      const band = 0.5 + 0.5 * Math.cos(lat * Math.PI * 3);
      let v = n.fbm(X * 2.4, Y * 5, Z * 2.4, 7) * 0.9 + band * 0.25 - 0.08;
      v = clamp(v * 2.2);
      const k = (y * g.width + x) * 4;
      gimg.data[k] = gimg.data[k + 1] = gimg.data[k + 2] = v * 255; gimg.data[k + 3] = 255;
    }
    gctx.putImageData(gimg, 0, 0);
    this.cloudSeed = p.seed; this.cloudVersion = (this.cloudVersion || 0) + 1;
  }

  // atualiza camada dinâmica (vegetação, gelo, cinzas, calor) em 640x320, interpolada e modulada pelo relevo
  compose(skipBase = false) {
    const w = this.world;
    if (!skipBase && this.key() !== this.baseVersion) this.paintBase();
    const N = GW * GH;
    const R = this._R || (this._R = new Float32Array(N)), Gc = this._G || (this._G = new Float32Array(N)), B = this._B || (this._B = new Float32Array(N)), W = this._W || (this._W = new Float32Array(N));
    R.fill(0); Gc.fill(0); B.fill(0); W.fill(0);
    for (let i = 0; i < MAX; i++) {
      if (!w.alive[i]) continue;
      const sp = w.species[w.asp[i]];
      const o = i * NP;
      const prod = w.P[o + P_.pe] + w.P[o + P_.ce] * 0.5 + w.P[o + P_.se] * 0.4;
      const wt = (0.25 + w.P[o + P_.size] * 1.5) * (0.3 + prod);
      // espalha nas 4 células vizinhas (bilinear) para manchas suaves
      const fx = w.ax[i] - 0.5, fy = Math.max(0, Math.min(GH - 1.001, w.ay[i] - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const xa = (x0 + GW) % GW, xb = (x0 + 1) % GW, yb = Math.min(GH - 1, y0 + 1);
      const cs = [[y0 * GW + xa, (1 - tx) * (1 - ty)], [y0 * GW + xb, tx * (1 - ty)], [yb * GW + xa, (1 - tx) * ty], [yb * GW + xb, tx * ty]];
      for (const [c, f] of cs) { const k = wt * f; R[c] += sp.color[0] * k; Gc[c] += sp.color[1] * k; B[c] += sp.color[2] * k; W[c] += k; }
    }
    const OW = 640, OH = 320;
    if (!this.ov) { this.ov = document.createElement('canvas'); this.ov.width = OW; this.ov.height = OH; this.ovImg = this.ov.getContext('2d').createImageData(OW, OH); }
    const d = this.ovImg.data, H = this.H, sea = w.sea, n = this.noise;
    if (!this.dither) { this.dither = new Float32Array(OW * OH); for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) { const [X, Y, Z] = lonLatToXYZ((x + 0.5) / OW, (y + 0.5) / OH); this.dither[y * OW + x] = n.fbm(X * 14, Y * 14, Z * 14, 4); } }
    const dith = this.dither;
    const bil = (A, fx, fy) => {
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const xa = (x0 + GW) % GW, xb = (x0 + 1 + GW) % GW, ya = Math.max(0, y0), yb = Math.min(GH - 1, y0 + 1);
      return (A[ya * GW + xa] * (1 - tx) + A[ya * GW + xb] * tx) * (1 - ty) + (A[yb * GW + xa] * (1 - tx) + A[yb * GW + xb] * tx) * ty;
    };
    const temp = w.temp, anom = w.anom, elev = w.elev;
    for (let y = 0; y < OH; y++) {
      const fy = (y + 0.5) / OH * GH - 0.5;
      for (let x = 0; x < OW; x++) {
        const fx = (x + 0.5) / OW * GW - 0.5;
        const hp = H[(y * 2) * SW + x * 2];
        const land = hp > sea;
        const dn = dith[y * OW + x];
        // temperatura local corrigida pela altitude do pixel
        let T = bil(temp, fx, fy);
        if (land) T -= (hp - bil(elev, fx, fy)) * 30;
        let r = 0, g = 0, b = 0, a = 0;
        const ww = bil(W, fx, fy);
        if (ww > 0.01) {
          const cov = Math.min(1, ww * (land ? 1.1 : 0.4));
          const edge = Math.min(1, Math.max(0, (cov - 0.15 + dn * 0.35) * 2.2));
          r = bil(R, fx, fy) / ww; g = bil(Gc, fx, fy) / ww; b = bil(B, fx, fy) / ww;
          a = edge * (land ? 0.85 : 0.5);
        }
        const ice = Math.min(1, Math.max(0, (-T - 1 + dn * 6) / 7));
        if (ice > 0) { const t = ice * (land ? 0.97 : 0.88); r = r + (0.9 - r) * t; g = g + (0.93 - g) * t; b = b + (0.96 - b) * t; a = Math.max(a, t); }
        const an = bil(anom, fx, fy);
        if (an > 3) { const t = Math.min(1, (an - 3) / 30); r = r + (1 - r) * t; g = g + (0.4 - g) * t; b = b + (0.15 - b) * t; a = Math.max(a, t * 0.6); }
        const k = (y * OW + x) * 4;
        d[k] = r * 255; d[k + 1] = g * 255; d[k + 2] = b * 255; d[k + 3] = a * 255;
      }
    }
    this.ov.getContext('2d').putImageData(this.ovImg, 0, 0);
    const s = this.surface.getContext('2d');
    s.globalCompositeOperation = 'source-over'; s.globalAlpha = 1;
    s.drawImage(this.base, 0, 0);
    s.imageSmoothingEnabled = true;
    s.drawImage(this.ov, 0, 0, SW, SH);
    // reaplica o relevo por cima (multiply) para a vegetação herdar sombras
    s.globalCompositeOperation = 'soft-light'; s.globalAlpha = 0.55;
    s.drawImage(this.base, 0, 0);
    s.globalCompositeOperation = 'source-over'; s.globalAlpha = 1;
    if (w.ash > 0.02) { s.fillStyle = `rgba(40,32,28,${w.ash * 0.55})`; s.fillRect(0, 0, SW, SH); }
    this.version++;
  }
}
