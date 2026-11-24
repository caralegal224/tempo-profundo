// Vista 2D: projeção equiretangular com pan/zoom, organismos como glifos.
import { GW, GH } from './planet.js';
import { SW, SH } from './surface.js';
import { MAX, NP, P_ } from './sim.js';
import { G, NG } from './genome.js';
import { clamp } from './util.js';

export class Map2D {
  constructor(canvas, world, painter) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.world = world; this.painter = painter;
    this.cx = 0.5; this.cy = 0.5; this.zoom = 1; // centro em coords normalizadas
    this.fx = [];
    this.night = document.createElement('canvas'); this.night.width = 128; this.night.height = 64;
    this.hover = null;
    this.selected = -1; this.selSpecies = -1;
    this.brush = null;
    this.t = 0;
  }

  resize(w, h, dpr) { this.W = w; this.H = h; this.dpr = dpr; }

  get scale() { return Math.max(this.H / SH, this.W / SW * 0.5) * this.zoom; }
  // normalizado -> tela
  toScreen(u, v) {
    const s = this.scale;
    let dx = (u - this.cx); dx -= Math.round(dx);
    return [this.W / 2 + dx * SW * s, this.H / 2 + (v - this.cy) * SH * s];
  }
  toWorld(x, y) {
    const s = this.scale;
    let u = this.cx + (x - this.W / 2) / (SW * s);
    u = ((u % 1) + 1) % 1;
    const v = this.cy + (y - this.H / 2) / (SH * s);
    return [u, v];
  }
  clampView() {
    const s = this.scale, halfV = this.H / 2 / (SH * s);
    if (halfV >= 0.5) this.cy = 0.5; else this.cy = clamp(this.cy, halfV, 1 - halfV);
    this.cx = ((this.cx % 1) + 1) % 1;
  }
  zoomAt(x, y, f) {
    const [u0, v0] = this.toWorld(x, y);
    this.zoom = clamp(this.zoom * f, 1, 18);
    this.clampView();
    const [u1, v1] = this.toWorld(x, y);
    let du = u0 - u1; du -= Math.round(du);
    this.cx += du; this.cy += v0 - v1;
    this.clampView();
  }

  draw(dt, opts) {
    this.t += dt;
    const { ctx, W, H, dpr } = this;
    const w = this.world, s = this.scale;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#070a0d'; ctx.fillRect(0, 0, W, H);
    const mapW = SW * s, mapH = SH * s;
    const [x0, y0] = this.toScreen(0, 0);
    let startX = x0 - Math.ceil(x0 / mapW) * mapW;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = this.zoom > 3 ? 'low' : 'high';
    const tiles = [];
    for (let x = startX; x < W; x += mapW) tiles.push(x);
    for (const tx of tiles) ctx.drawImage(this.painter.surface, tx, y0, mapW, mapH);

    // marés: faixa intermarés pulsa com a fase de maré (visível em escalas curtas)
    const tideVis = opts.tideVisible;
    if (tideVis > 0.01 && this.painter.tideMask) {
      const strips = 24;
      const ang = w.moonAngles(opts.displayYears);
      const spin = w.spinAngle(opts.displayYears);
      for (let k = 0; k < strips; k++) {
        const lon = (k + 0.5) / strips * Math.PI * 2;
        let hgt = 0;
        w.planet.moons.forEach((m, j) => { const mass = m.size ** 3; hgt += mass / (m.dist / 60) ** 3 * Math.cos(2 * (lon + spin - ang[j])); });
        const a = clamp(0.5 + hgt * 0.5) * tideVis;
        const sx = k / strips * SW, sw = SW / strips;
        ctx.globalAlpha = a;
        for (const tx of tiles) ctx.drawImage(this.painter.tideMask, sx, 0, sw, SH, tx + sx * s, y0, sw * s + 0.5, mapH);
      }
      ctx.globalAlpha = 1;
    }

    // nuvens
    const cloudA = clamp(w.planet.atmosphere / 2.2, 0.1, 0.75) * (opts.clouds ? 1 : 0);
    if (cloudA > 0) {
      const off = ((opts.displayYears * 365.25 * 0.08) % 1 + 1) % 1;
      ctx.globalAlpha = cloudA * 0.38;
      const cw = mapW;
      for (const tx of tiles) {
        const ox = tx + off * cw;
        ctx.drawImage(this.painter.clouds, ox - cw, y0, cw, mapH);
        ctx.drawImage(this.painter.clouds, ox, y0, cw, mapH);
      }
      ctx.globalAlpha = 1;
    }

    // terminador dia/noite
    if (opts.nightVisible > 0.01) {
      const nc = this.night, nctx = nc.getContext('2d'), img = nctx.createImageData(nc.width, nc.height);
      const spin = w.spinAngle(opts.displayYears);
      const decl = (w.planet.tilt * Math.PI / 180) * Math.sin(w.seasonPhase(opts.displayYears) * Math.PI * 2);
      const sx = Math.cos(decl) * Math.cos(-spin), sy = Math.sin(decl), sz = Math.cos(decl) * Math.sin(-spin);
      for (let y = 0; y < nc.height; y++) {
        const lat = (0.5 - (y + 0.5) / nc.height) * Math.PI;
        for (let x = 0; x < nc.width; x++) {
          const lon = (x + 0.5) / nc.width * Math.PI * 2;
          const px = Math.cos(lat) * Math.cos(lon), py = Math.sin(lat), pz = Math.cos(lat) * Math.sin(lon);
          const dd = px * sx + py * sy + pz * sz;
          const a = clamp(-dd * 4 + 0.15) * 0.72 * opts.nightVisible;
          const k = (y * nc.width + x) * 4;
          img.data[k] = 6; img.data[k + 1] = 10; img.data[k + 2] = 26; img.data[k + 3] = a * 255;
        }
      }
      nctx.putImageData(img, 0, 0);
      for (const tx of tiles) ctx.drawImage(nc, tx, y0, mapW, mapH);
    }

    // retícula de coordenadas
    ctx.strokeStyle = 'rgba(220,225,210,0.07)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let lat = -60; lat <= 60; lat += 30) { const yy = y0 + (0.5 - lat / 180) * mapH; ctx.moveTo(0, yy); ctx.lineTo(W, yy); }
    for (const tx of tiles) for (let lon = 0; lon < 360; lon += 30) { const xx = tx + lon / 360 * mapW; ctx.moveTo(xx, Math.max(0, y0)); ctx.lineTo(xx, Math.min(H, y0 + mapH)); }
    ctx.stroke();

    // fontes hidrotermais
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.2);
    for (const v of w.vents) {
      const [x, y] = this.toScreen(v.x, v.y);
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const r = (2 + v.power * 2) * Math.sqrt(this.zoom);
      ctx.strokeStyle = `rgba(255,170,90,${0.25 + pulse * 0.25})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r * (1 + pulse * 0.6), 0, 6.283); ctx.stroke();
      ctx.fillStyle = 'rgba(255,190,110,0.8)'; ctx.fillRect(x - 1, y - 1, 2, 2);
    }

    // pontos sublunares
    if (opts.showMoons) {
      const ang = w.moonAngles(opts.displayYears), spin = w.spinAngle(opts.displayYears);
      ctx.font = '500 10px "IBM Plex Mono", monospace';
      w.planet.moons.forEach((m, j) => {
        const u = (((ang[j] - spin) / (Math.PI * 2)) % 1 + 1) % 1;
        const [x, y] = this.toScreen(u, 0.5);
        ctx.strokeStyle = 'rgba(230,226,210,0.35)'; ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(230,226,210,0.65)';
        ctx.beginPath(); ctx.arc(x, 18 + j * 14, 3 + m.size * 2, 0, 6.283); ctx.fill();
        ctx.fillText(m.name, x + 9, 21 + j * 14);
      });
    }

    this.drawOrganisms(ctx, opts);

    // efeitos (ondas de choque, marcadores)
    this.fx = this.fx.filter((f) => (f.t += dt) < f.life);
    for (const f of this.fx) {
      const [x, y] = this.toScreen(f.u, f.v);
      const k = f.t / f.life;
      if (f.kind === 'ring') {
        ctx.strokeStyle = `rgba(${f.color},${(1 - k) * 0.9})`; ctx.lineWidth = 2 * (1 - k) + 0.5;
        ctx.beginPath(); ctx.arc(x, y, f.r * s * SW * k + 4, 0, 6.283); ctx.stroke();
      } else if (f.kind === 'flash') {
        const g = ctx.createRadialGradient(x, y, 0, x, y, f.r * s * SW);
        g.addColorStop(0, `rgba(255,240,210,${(1 - k) * 0.9})`); g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, f.r * s * SW, 0, 6.283); ctx.fill();
      }
    }

    if (this.brush) {
      const [x, y] = this.toScreen(this.brush.u, this.brush.v);
      ctx.strokeStyle = this.brush.color || 'rgba(240,236,220,0.8)'; ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.ellipse(x, y, this.brush.r * SW * s, this.brush.r * SW * s, 0, 0, 6.283); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke();
    }
  }

  drawOrganisms(ctx, opts) {
    const w = this.world, s = this.scale;
    const cellPx = SW / GW * s;
    const detail = cellPx > 22 ? 2 : cellPx > 9 ? 1 : 0;
    const P = w.P, GEN = w.GEN;
    const W = this.W, H = this.H;
    const lerpK = opts.interp;
    for (let i = 0; i < MAX; i++) {
      if (!w.alive[i]) continue;
      const sp = w.species[w.asp[i]];
      if (opts.filterSpecies >= 0 && w.asp[i] !== opts.filterSpecies) continue;
      const [x, y] = this.toScreen(w.ax[i] / GW, w.ay[i] / GH);
      if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
      const o = i * NP;
      const size = P[o + P_.size];
      const c = sp.color;
      const col = `rgb(${c[0] * 255 | 0},${c[1] * 255 | 0},${c[2] * 255 | 0})`;
      if (detail === 0) {
        const r = 0.8 + size * 2.2;
        ctx.fillStyle = col; ctx.fillRect(x - r / 2, y - r / 2, r, r);
        continue;
      }
      const r = Math.min(26, (0.1 + size * 0.5) * cellPx * (detail === 2 ? 0.5 : 1.0));
      const g = i * NG;
      drawGlyph(ctx, sp.kind, x, y, r, w.ahead[i], col, GEN, g, detail, this.t + i);
    }
    // seleção
    if (this.selected >= 0 && w.alive[this.selected]) {
      const i = this.selected;
      const [x, y] = this.toScreen(w.ax[i] / GW, w.ay[i] / GH);
      const r = 10 + Math.sin(this.t * 4) * 2;
      ctx.strokeStyle = 'rgba(244,196,120,0.95)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.785; ctx.moveTo(x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3)); ctx.lineTo(x + Math.cos(a) * (r + 9), y + Math.sin(a) * (r + 9)); }
      ctx.stroke();
    }
  }
}

export function drawGlyph(ctx, kind, x, y, r, head, col, GEN, g, detail, t) {
  ctx.fillStyle = col; ctx.strokeStyle = col;
  const limbs = GEN[g + G.limbs], branch = GEN[g + G.branch], armor = GEN[g + G.armor], symm = GEN[g + G.symm];
  if (kind === 'micro') {
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    ctx.globalAlpha = 1;
    if (detail === 2) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
      ctx.fillStyle = 'rgba(10,14,18,0.5)'; ctx.beginPath(); ctx.arc(x + r * 0.2, y - r * 0.15, r * 0.32, 0, 6.283); ctx.fill();
      if (GEN[g + G.motil] > 0.3) { // flagelo
        ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(x - Math.cos(head) * r, y - Math.sin(head) * r);
        const wv = Math.sin(t * 9) * r * 0.5;
        ctx.quadraticCurveTo(x - Math.cos(head) * r * 2 + Math.sin(head) * wv, y - Math.sin(head) * r * 2 - Math.cos(head) * wv, x - Math.cos(head) * r * 2.8, y - Math.sin(head) * r * 2.8);
        ctx.stroke();
      }
    }
  } else if (kind === 'plant') {
    ctx.lineWidth = Math.max(1, r * 0.18); ctx.lineCap = 'round';
    const n = 3 + Math.round(branch * 4);
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (k - (n - 1) / 2) * (0.5 + branch * 0.2) + Math.sin(t * 0.8 + k) * 0.06;
      const len = r * (1.1 + ((k * 37) % 5) * 0.12);
      ctx.moveTo(x, y + r * 0.4);
      ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.4, y + Math.sin(a) * len * 0.6, x + Math.cos(a) * len, y + Math.sin(a) * len + r * 0.4);
    }
    ctx.stroke();
    if (detail === 2) { ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(x, y + r * 0.4, r * 0.3, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1; }
  } else if (kind === 'fungus') {
    const n = 4 + Math.round(branch * 5);
    ctx.globalAlpha = 0.85;
    for (let k = 0; k < n; k++) {
      const a = k * 2.399, d = Math.sqrt(k / n) * r;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.22, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 0.4; ctx.lineWidth = 0.7; ctx.beginPath();
    for (let k = 0; k < n; k++) { const a = k * 2.399; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5); }
    ctx.stroke(); ctx.globalAlpha = 1;
  } else if (kind === 'animal') {
    const len = r * (1 + symm * 0.8), wid = r * (0.75 - symm * 0.3);
    ctx.save(); ctx.translate(x, y); ctx.rotate(head);
    if (detail === 2 && limbs > 0.2) {
      ctx.lineWidth = Math.max(0.8, r * 0.1); ctx.beginPath();
      const nl = 1 + Math.round(limbs * 3);
      for (let k = 0; k < nl; k++) {
        const px = -len * 0.5 + (k + 0.5) / nl * len;
        const sw = Math.sin(t * 10 + k * 1.7) * wid * 0.4;
        ctx.moveTo(px, 0); ctx.lineTo(px + sw, wid * 1.6); ctx.moveTo(px, 0); ctx.lineTo(px - sw, -wid * 1.6);
      }
      ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(0, 0, len, wid, 0, 0, 6.283); ctx.fill();
    if (armor > 0.4 && detail === 2) { ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); for (let k = -1; k <= 1; k++) { ctx.moveTo(k * len * 0.33, -wid); ctx.lineTo(k * len * 0.33, wid); } ctx.stroke(); }
    if (detail === 2 && GEN[g + G.sense] > 0.3) { ctx.fillStyle = 'rgba(250,245,230,0.9)'; ctx.beginPath(); ctx.arc(len * 0.6, -wid * 0.35, Math.max(1, r * 0.13), 0, 6.283); ctx.arc(len * 0.6, wid * 0.35, Math.max(1, r * 0.13), 0, 6.283); ctx.fill(); }
    ctx.restore();
  } else {
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.2);
    ctx.beginPath();
    const n = 5 + Math.round(GEN[g + G.xeno] * 3);
    for (let k = 0; k < n; k++) { const a = k / n * 6.283, rr = k % 2 ? r * 0.5 : r * 1.2; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.globalAlpha = 0.8; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.restore();
  }
}
