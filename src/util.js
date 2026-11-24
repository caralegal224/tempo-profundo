// Utilidades: RNG com semente, ruído simplex 3D, helpers numéricos.

export function mulberry32(seed) {
  let a = seed >>> 0;
  const f = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.state = () => a;
  f.setState = (s) => { a = s; };
  return f;
}

export class RNG {
  constructor(seed = (Math.random() * 2 ** 32) >>> 0) { this.seed = seed; this.r = mulberry32(seed); }
  next() { return this.r(); }
  range(a, b) { return a + (b - a) * this.r(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  chance(p) { return this.r() < p; }
  gauss() { let u = 0, v = 0; while (!u) u = this.r(); while (!v) v = this.r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  getState() { return this.r.state(); }
  setState(s) { this.r.setState(s); }
}

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const fract = (x) => x - Math.floor(x);

// Simplex 3D (Gustavson), permutação gerada por semente.
const G3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
export class Noise3 {
  constructor(seed) {
    const r = mulberry32(seed ^ 0x9e3779b9);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    this.perm = new Uint8Array(512); this.pm12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { this.perm[i] = p[i & 255]; this.pm12[i] = this.perm[i] % 12; }
  }
  n(xin, yin, zin) {
    const F3 = 1 / 3, G = 1 / 6, perm = this.perm, pm = this.pm12;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G, y1 = y0 - j1 + G, z1 = z0 - k1 + G;
    const x2 = x0 - i2 + 2 * G, y2 = y0 - j2 + 2 * G, z2 = z0 - k2 + 2 * G;
    const x3 = x0 - 1 + 3 * G, y3 = y0 - 1 + 3 * G, z3 = z0 - 1 + 3 * G;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0, tt, g;
    tt = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (tt > 0) { g = G3[pm[ii + perm[jj + perm[kk]]]]; tt *= tt; n += tt * tt * (g[0] * x0 + g[1] * y0 + g[2] * z0); }
    tt = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (tt > 0) { g = G3[pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]]]; tt *= tt; n += tt * tt * (g[0] * x1 + g[1] * y1 + g[2] * z1); }
    tt = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (tt > 0) { g = G3[pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]]]; tt *= tt; n += tt * tt * (g[0] * x2 + g[1] * y2 + g[2] * z2); }
    tt = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (tt > 0) { g = G3[pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]]]; tt *= tt; n += tt * tt * (g[0] * x3 + g[1] * y3 + g[2] * z3); }
    return 32 * n;
  }
  fbm(x, y, z, oct = 5, lac = 2.0, gain = 0.5) {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let o = 0; o < oct; o++) { s += a * this.n(x * f, y * f, z * f); norm += a; a *= gain; f *= lac; }
    return s / norm;
  }
  ridged(x, y, z, oct = 5) {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let o = 0; o < oct; o++) { const v = 1 - Math.abs(this.n(x * f, y * f, z * f)); s += a * v * v; norm += a; a *= 0.5; f *= 2.1; }
    return s / norm;
  }
}

// Coordenadas equiretangulares -> esfera unitária
export function lonLatToXYZ(u, v) {
  const lon = u * Math.PI * 2, lat = (0.5 - v) * Math.PI;
  const c = Math.cos(lat);
  return [c * Math.cos(lon), Math.sin(lat), c * Math.sin(lon)];
}

export function hsl2rgb(h, s, l) {
  h = fract(h);
  const a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)];
}

export const fmtInt = (n) => Math.round(n).toLocaleString('pt-BR');

export function fmtYears(y) {
  const a = Math.abs(y);
  if (a < 1) return `${Math.round(y * 365)} dias`;
  if (a < 1e3) return `${y.toFixed(a < 10 ? 1 : 0)} anos`;
  if (a < 1e6) return `${(y / 1e3).toFixed(a < 1e4 ? 2 : 1)} mil anos`;
  if (a < 1e9) return `${(y / 1e6).toFixed(a < 1e7 ? 2 : 1)} Ma`;
  return `${(y / 1e9).toFixed(3)} Ga`;
}
