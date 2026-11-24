// Motor de simulação: ambiente planetário + agentes + filogenia + eventos + máquina do tempo.
import { RNG, clamp, lerp, fmtYears } from './util.js';
import { HW, HH, GW, GH, derive, seaLevelFor, generateTerrain, generateVents, stampElevation, STARS } from './planet.js';
import { NG, G, phenotype, geneDistance, mutate, innovationsOf, INNOV_BY_KEY, kindOf, cloneG, speciesColor } from './genome.js';
import { makeGenusName, makeEpithet, makeCommonName, cladeName } from './taxonomy.js';

export const MAX = 4200;
const NP = 22;
const P_ = { pe: 0, ce: 1, re: 2, se: 3, size: 4, tempo: 5, basal: 6, move: 7, upkeep: 8, speed: 9, topt: 10, ttol: 11, terra: 12, life: 13, litter: 14, mut: 15, disp: 16, def: 17, sense: 18, motil: 19, toxin: 20, fec: 21 };

// Cada passo pode conter subpassos internos; a evolução acompanha o tempo geológico de cada subpasso.
export const TIME_SCALES = [
  { label: '1 hora', short: 'hora', years: 1 / 8766, sub: 1 },
  { label: '1 dia', short: 'dia', years: 1 / 365.25, sub: 1 },
  { label: '1 mês', short: 'mês', years: 1 / 12, sub: 1 },
  { label: '1 ano', short: 'ano', years: 1, sub: 1 },
  { label: '1 século', short: 'séc.', years: 100, sub: 1 },
  { label: '10 mil anos', short: '10 ka', years: 1e4, sub: 1 },
  { label: '1 milhão de anos', short: '1 Ma', years: 1e6, sub: 1 },
  { label: '10 milhões de anos', short: '10 Ma', years: 1e7, sub: 5 },
  { label: '100 milhões de anos', short: '100 Ma', years: 1e8, sub: 25 },
];
// magnitude de mutação acumulada num intervalo (passeio aleatório: cresce com a raiz do tempo)
export const evoRate = (dy) => Math.min(4.2, 2.6 * Math.sqrt(dy / 1e6));

export const EVENT_TYPES = {
  impact: { name: 'Impacto de asteroide', needsTarget: true, desc: 'Cratera, onda de choque e inverno de impacto.' },
  volcanic: { name: 'Armadilhas vulcânicas', needsTarget: true, desc: 'Derrames basálticos, cinzas e estufa prolongada.' },
  glacial: { name: 'Glaciação global', desc: 'O planeta congela das calotas ao equador.' },
  greenhouse: { name: 'Estufa descontrolada', desc: 'Aquecimento intenso por gases do efeito estufa.' },
  anoxia: { name: 'Anoxia oceânica', desc: 'Oceanos perdem oxigênio. Grandes aquáticos sofrem.' },
  gamma: { name: 'Surto de raios gama', desc: 'Radiação esteriliza a superfície. As profundezas resistem.' },
  plague: { name: 'Pandemia', desc: 'Um patógeno devasta a espécie mais numerosa.' },
  custom: { name: 'Evento personalizado', needsTarget: 'optional', desc: 'Defina temperatura, luz, alvo e letalidade.' },
};

export class World {
  constructor(planet) {
    this.rng = new RNG(planet.seed ^ 0xabcdef);
    this.listeners = [];
    // agentes (estrutura de arrays)
    this.ax = new Float32Array(MAX); this.ay = new Float32Array(MAX);
    this.aen = new Float32Array(MAX); this.aage = new Float32Array(MAX);
    this.asp = new Int32Array(MAX); this.ahead = new Float32Array(MAX);
    this.alive = new Uint8Array(MAX); this.aid = new Uint32Array(MAX);
    this.P = new Float32Array(MAX * NP); this.GEN = new Float32Array(MAX * NG);
    this.free = []; for (let i = MAX - 1; i >= 0; i--) this.free.push(i);
    this.count = 0; this.nextAid = 1;
    // grade
    const N = GW * GH;
    this.elev = new Float32Array(N); this.land = new Uint8Array(N); this.depth = new Float32Array(N);
    this.baseT = new Float32Array(N); this.temp = new Float32Array(N); this.light = new Float32Array(N);
    this.nutr = new Float32Array(N); this.org = new Float32Array(N); this.nutCap = new Float32Array(N); this.detr = new Float32Array(N);
    this.vent = new Float32Array(N); this.tidal = new Float32Array(N); this.anom = new Float32Array(N);
    this.moist = new Float32Array(N); this.ice = new Float32Array(N);
    this.head = new Int32Array(N); this.next = new Int32Array(MAX);
    this.dens = new Uint16Array(N); this.loadW = new Float32Array(N); this.chemoN = new Uint16Array(N);
    this.bioR = new Float32Array(N); this.bioG = new Float32Array(N); this.bioB = new Float32Array(N); this.bioW = new Float32Array(N);
    this.ph = {};
    this.setPlanet(planet);
    this.reset();
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data) { for (const f of this.listeners) f(type, data); }

  setPlanet(planet, keepTerrain = false) {
    this.planet = derive(planet);
    if (!keepTerrain || !this.elevHi) {
      this.elevHi = generateTerrain(planet);
      this.vents = generateVents(planet, this.elevHi);
    }
    this.sea = seaLevelFor(this.elevHi, planet.water);
    this.elevVersion = (this.elevVersion || 0) + 1;
    this.rebuildGrid();
  }

  reset() {
    this.alive.fill(0); this.free = []; for (let i = MAX - 1; i >= 0; i--) this.free.push(i);
    this.count = 0;
    this.species = []; this.genera = []; this.clades = [];
    this.genusNames = new Set(); this.cladeNames = new Set(); this.binomials = new Set();
    this.years = 0; this.stepN = 0; this.scaleIdx = 6;
    this.o2 = 0.002; this.tempDrift = 0; this.tempOffset = 0; this.ash = 0; this.uv = 0;
    this.events = [];
    this.history = []; this.snapshots = []; this.log = [];
    this.detr.fill(0); this.anom.fill(0);
    for (let i = 0; i < this.nutr.length; i++) { this.nutr[i] = this.nutCap[i]; this.org[i] = this.land[i] ? 0.1 : 0.7 + 1.6 * Math.exp(-this.depth[i] * 4) + this.vent[i] * 1.5; }
    this.flags = {};
    this.popWindow = [];
    this.lastSnapElev = null;
    this.updateClimate();
  }

  // ---------- Ambiente ----------
  rebuildGrid() {
    const p = this.planet, sea = this.sea, s = HW / GW;
    const tideAmp = clamp(p.tide * 0.022, 0.003, 0.09);
    this.tideAmp = tideAmp;
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        let sum = 0, inter = 0, landN = 0;
        for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) {
          const e = this.elevHi[(y * s + yy) * HW + x * s + xx];
          sum += e; if (Math.abs(e - sea) < tideAmp) inter++; if (e > sea) landN++;
        }
        const i = y * GW + x, e = sum / (s * s);
        this.elev[i] = e;
        this.land[i] = landN > s * s / 2 ? 1 : 0;
        this.depth[i] = this.land[i] ? 0 : clamp((sea - e) / (sea + 1));
        this.tidal[i] = clamp(inter / (s * s) * 2.2);
      }
    }
    // distância ao oceano -> umidade (BFS)
    const N = GW * GH, dist = new Int32Array(N).fill(1e6), q = [];
    for (let i = 0; i < N; i++) if (!this.land[i]) { dist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % GW, y = (i / GW) | 0;
      const nb = [y * GW + (x + 1) % GW, y * GW + (x + GW - 1) % GW, y > 0 ? i - GW : -1, y < GH - 1 ? i + GW : -1];
      for (const j of nb) if (j >= 0 && dist[j] > dist[i] + 1) { dist[j] = dist[i] + 1; q.push(j); }
    }
    const coastTide = clamp(p.tide * 0.35, 0, 0.9);
    for (let y = 0; y < GH; y++) {
      const lat = (0.5 - (y + 0.5) / GH) * Math.PI;
      const cl = Math.cos(lat);
      for (let x = 0; x < GW; x++) {
        const i = y * GW + x;
        const hadley = 1 - 0.55 * Math.exp(-Math.pow((Math.abs(lat) - 0.5) / 0.14, 2)); // desertos subtropicais
        this.moist[i] = this.land[i] ? clamp((Math.exp(-dist[i] / 7) * 0.7 + 0.3) * hadley * (0.4 + 0.6 * p.water / 0.7)) : 1;
        if (this.land[i] && dist[i] === 1) this.tidal[i] = Math.max(this.tidal[i], coastTide);
        if (!this.land[i] && dist[i] === 0) {
          // água vizinha a terra
          const xR = (x + 1) % GW, xL = (x + GW - 1) % GW;
          if (this.land[y * GW + xR] || this.land[y * GW + xL] || (y > 0 && this.land[i - GW]) || (y < GH - 1 && this.land[i + GW])) this.tidal[i] = Math.max(this.tidal[i], coastTide * 0.8);
        }
        let T = p.baseTemp + 50 * (cl - 0.785);
        if (this.land[i]) T -= clamp((this.elev[i] - this.sea) / (1 - this.sea)) * 38;
        else T = Math.max(-2, lerp(T, p.baseTemp + 4, 0.25)) - this.depth[i] * 3;
        this.baseT[i] = T;
        // nutrientes: plataformas costeiras e ressurgências ricas; oceano profundo pobre
        let cap;
        if (this.land[i]) cap = 0.04 + 0.3 * this.moist[i];
        else cap = 0.06 + 0.8 * Math.exp(-this.depth[i] * 6) + (Math.abs(lat) > 0.9 ? 0.12 : 0);
        this.nutCap[i] = cap;
        this.vent[i] = 0;
      }
    }
    for (const v of this.vents) {
      const cx = Math.floor(v.x * GW), cy = Math.floor(v.y * GH);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const yy = cy + dy; if (yy < 0 || yy >= GH) continue;
        const i = yy * GW + ((cx + dx + GW) % GW);
        const f = Math.exp(-(dx * dx + dy * dy) / 2.2) * v.power;
        this.vent[i] = Math.max(this.vent[i], f);
        this.nutCap[i] += f * 0.5;
      }
    }
    this.gridVersion = (this.gridVersion || 0) + 1;
  }

  get scale() { return TIME_SCALES[this.scaleIdx]; }

  seasonPhase(years = this.years) { return (years * 365.25 / this.planet.yearDays) % 1; }

  updateClimate() {
    const p = this.planet;
    const sc = this.scale;
    // eventos ativos
    let dT = 0, ash = 0, uv = 0;
    for (const e of this.events) {
      const t = 1 - e.left / e.total;
      const env = t < 0.08 ? t / 0.08 : Math.pow(1 - (t - 0.08) / 0.92, 1.4);
      dT += e.dT * env; ash += e.ash * env; uv += (e.uv || 0) * env;
    }
    const st = STARS[p.star];
    const bright = this.years / 1e9 * 0.08; // estrela clareia com a idade
    this.tempOffset = dT + this.tempDrift + bright * 11;
    this.ash = clamp(ash, 0, 0.95); this.uv = uv;
    const seasonAmp = sc.years <= 1 ? p.tilt / 23.4 * 13 : 0;
    const sph = Math.sin(this.seasonPhase() * Math.PI * 2);
    const insol = clamp(Math.sqrt(p.insolation) * (st.lum < 0.1 ? 0.8 : 1), 0.3, 1.5);
    const trans = 1 / (1 + 0.12 * p.atmosphere);
    let tsum = 0;
    for (let y = 0; y < GH; y++) {
      const lat = (0.5 - (y + 0.5) / GH) * Math.PI;
      const cl = Math.max(0, Math.cos(lat));
      const season = seasonAmp * Math.sin(lat) * sph;
      const lightLat = Math.pow(cl, 0.8) * (1 + season * 0.02);
      for (let x = 0; x < GW; x++) {
        const i = y * GW + x;
        const T = this.baseT[i] + this.tempOffset * (this.land[i] ? 1 : 0.7) + season * (this.land[i] ? 1 : 0.35) + this.anom[i];
        this.temp[i] = T; tsum += T;
        this.ice[i] = clamp((-T - 2) / 12);
        let L = insol * lightLat * trans * (1 - this.ash) * (1 - this.ice[i] * 0.5);
        if (!this.land[i]) L *= Math.exp(-this.depth[i] * 2.2);
        this.light[i] = L;
      }
    }
    this.meanTemp = tsum / (GW * GH);
  }

  // ---------- Agentes ----------
  spawn(g, x, y, sp, energy) {
    if (!this.free.length) return -1;
    const i = this.free.pop();
    this.alive[i] = 1; this.count++;
    this.ax[i] = ((x % GW) + GW) % GW; this.ay[i] = clamp(y, 0.3, GH - 0.3);
    this.aen[i] = energy; this.aage[i] = 0; this.asp[i] = sp; this.ahead[i] = this.rng.next() * 6.283;
    this.aid[i] = this.nextAid++;
    this.GEN.set(g, i * NG);
    this.refreshPheno(i);
    return i;
  }

  refreshPheno(i) {
    const g = this.GEN.subarray(i * NG, i * NG + NG);
    const ph = phenotype(g, this.ph), o = i * NP, P = this.P;
    P[o + P_.pe] = ph.ePhoto; P[o + P_.ce] = ph.eChemo; P[o + P_.re] = ph.ePred; P[o + P_.se] = ph.eSapro;
    P[o + P_.size] = ph.size; P[o + P_.tempo] = ph.tempo; P[o + P_.basal] = ph.basal; P[o + P_.move] = ph.moveCost;
    P[o + P_.upkeep] = ph.upkeep; P[o + P_.speed] = ph.speed; P[o + P_.topt] = ph.topt; P[o + P_.ttol] = ph.ttol;
    P[o + P_.terra] = ph.terra; P[o + P_.life] = ph.lifespan; P[o + P_.litter] = ph.litter; P[o + P_.mut] = ph.mut;
    P[o + P_.disp] = ph.disperse; P[o + P_.def] = ph.defense; P[o + P_.sense] = g[G.sense]; P[o + P_.motil] = g[G.motil];
    P[o + P_.toxin] = g[G.toxin]; P[o + P_.fec] = g[G.fecund];
  }

  kill(i, toDetritus = 1) {
    if (!this.alive[i]) return;
    const c = this.cellOf(i);
    this.detr[c] += (0.15 + this.P[i * NP + P_.size] * 0.6 + Math.max(0, this.aen[i]) * 0.3) * toDetritus;
    this.alive[i] = 0; this.count--; this.free.push(i);
  }

  cellOf(i) { return Math.min(GH - 1, this.ay[i] | 0) * GW + (Math.min(GW - 1, this.ax[i] | 0)); }
  genomeOf(i) { return this.GEN.subarray(i * NG, i * NG + NG); }

  // ---------- Espécies ----------
  newSpecies(g, parentId, x, y, opts = {}) {
    const parent = parentId >= 0 ? this.species[parentId] : null;
    const c = Math.min(GH - 1, y | 0) * GW + Math.min(GW - 1, x | 0);
    const ctx = { vent: this.vent[c] > 0.35, tidal: this.tidal[c] > 0.4, deep: this.depth[c] > 0.55, first: !this.species.length };
    let genus = parent ? parent.genus : -1;
    if (genus < 0 || geneDistance(g, this.genera[genus].ref) > 0.62 || kindOf(g) !== this.genera[genus].kind) {
      const name = opts.genusName || makeGenusName(g, this.rng, this.genusNames);
      this.genusNames.add(name);
      genus = this.genera.length;
      this.genera.push({ id: genus, name, ref: cloneG(g), kind: kindOf(g), born: this.years });
    }
    const gname = this.genera[genus].name;
    const sp = {
      id: this.species.length, parent: parentId, genus,
      epithet: opts.epithet || this.uniqueEpithet(gname, g, ctx),
      common: opts.common || makeCommonName(g, this.rng, ctx),
      ref: cloneG(g), mean: cloneG(g), founder: cloneG(g),
      born: this.years, bornStep: this.stepN, extinct: null,
      pop: 0, peak: 0, kind: kindOf(g),
      innov: parent ? parent.innov.slice() : [],
      clades: parent ? parent.clades.slice() : [],
      color: speciesColor(g, this.planet.star),
      hist: [], origin: opts.origin || (parent ? 'evolução' : 'semeadura'),
      depth: parent ? parent.depth + 1 : 0,
    };
    this.species.push(sp);
    this.checkInnovations(sp);
    if (parent) this.emit('speciation', sp);
    return sp.id;
  }

  uniqueEpithet(gname, g, ctx) {
    this.binomials = this.binomials || new Set();
    let e;
    for (let t = 0; t < 14; t++) { e = makeEpithet(gname, g, this.rng, ctx); if (!this.binomials.has(gname + ' ' + e)) break; }
    if (this.binomials.has(gname + ' ' + e)) {
      const syl = ['ka', 'vel', 'or', 'ti', 'mar', 'zu', 'len', 'dra', 'si', 'bo', 'ne', 'rha', 'qu', 'ul'];
      for (let t = 0; t < 40; t++) {
        let w = this.rng.pick(syl) + this.rng.pick(syl) + (this.rng.chance(0.5) ? this.rng.pick(syl) : '');
        e = w + this.rng.pick(['i', 'ae', 'orum', 'ensis']);
        if (!this.binomials.has(gname + ' ' + e)) break;
      }
    }
    this.binomials.add(gname + ' ' + e);
    return e;
  }

  ancestors(id, depth = 8) {
    const out = new Set(); let a = id, k = 0;
    while (a >= 0 && k++ <= depth) { out.add(a); a = this.species[a].parent; }
    return out;
  }

  checkInnovations(sp) {
    const now = innovationsOf(sp.mean);
    for (const k of now) {
      if (sp.innov.includes(k)) continue;
      const d = INNOV_BY_KEY[k];
      if (sp.mean[d.gene] < d.th + 0.03 && this.species.length > 1) continue; // histerese
      if (this.species.length > 1 && sp.peak < 8 && sp.depth > 0) continue;
      sp.innov.push(k);
      if (sp.clades.some((id) => this.clades[id] && this.clades[id].innov === k)) continue;
      // parente próximo já fundou um clado com esta inovação? junta-se a ele
      const mine = this.ancestors(sp.id);
      let join = null;
      for (const cl of this.clades) {
        if (cl.innov !== k) continue;
        for (const a of this.ancestors(cl.founder)) if (mine.has(a)) { join = cl; break; }
        if (join) break;
      }
      if (join) { sp.clades.push(join.id); continue; }
      const name = cladeName(k, kindOf(sp.mean), null, this.cladeNames, this.rng);
      this.cladeNames.add(name);
      const cl = { id: this.clades.length, name, innov: k, founder: sp.id, born: this.years };
      this.clades.push(cl);
      sp.clades.push(cl.id);
      if (sp.depth > 0 || this.species.length > 1) {
        this.addLog('clado', `${d.name} em ${this.binomial(sp)}. Nasce o clado ${name}.`, sp.id);
        this.emit('innovation', { sp, clade: cl });
      }
    }
  }

  binomial(sp) { return `${this.genera[sp.genus].name} ${sp.epithet}`; }

  addLog(kind, text, ref) {
    this.log.push({ years: this.years, step: this.stepN, kind, text, ref });
    if (this.log.length > 400) this.log.shift();
    this.emit('log', this.log[this.log.length - 1]);
  }

  seed(g, u, v, n = 12, opts = {}) {
    const x = u * GW, y = v * GH;
    const sid = opts.speciesId ?? this.newSpecies(g, -1, x, y, opts);
    for (let k = 0; k < n; k++) {
      const gg = cloneG(g);
      this.spawn(gg, x + this.rng.gauss() * 1.5, y + this.rng.gauss() * 1.5, sid, 0.7);
    }
    this.species[sid].extinct = null;
    this.addLog('semeadura', `${this.binomial(this.species[sid])} introduzida no planeta.`, sid);
    this.emit('seed', this.species[sid]);
    return sid;
  }

  // ---------- Passo ----------
  step() {
    const sc = this.scale;
    for (let k = 0; k < sc.sub; k++) this.tick(sc.years / sc.sub);
  }

  tick(dy) {
    this.years += dy; this.stepN++;
    const geo = dy / 1e6; // fração de milhão de anos
    const evo = evoRate(dy);
    this.evo = evo;
    // deriva climática (ciclos orbitais caóticos sem lua estabilizadora)
    this.tempDrift += this.rng.gauss() * 0.25 * Math.sqrt(geo) * this.planet.climateChaos - this.tempDrift * Math.min(0.3, 0.004 * geo);
    for (const e of this.events) e.left--;
    this.events = this.events.filter((e) => e.left > 0);
    this.updateClimate();
    const N = GW * GH;
    for (let i = 0; i < N; i++) {
      const dd = this.detr[i];
      const dec = dd * 0.02;
      this.detr[i] = dd - dec;
      this.nutr[i] = Math.min(this.nutCap[i] + 0.8, this.nutr[i] + Math.max(0, this.nutCap[i] - this.nutr[i]) * 0.03 + dec * 0.4);
      this.org[i] = Math.min(4, this.org[i] + dec * 0.2 + this.vent[i] * 0.002);
      this.anom[i] *= 0.985;
    }
    // listas por célula
    this.head.fill(-1); this.dens.fill(0); this.loadW.fill(0); this.chemoN.fill(0);
    const P = this.P, ax = this.ax, ay = this.ay;
    for (let i = 0; i < MAX; i++) {
      if (!this.alive[i]) continue;
      const c = this.cellOf(i);
      this.next[i] = this.head[c]; this.head[c] = i; this.dens[c]++;
      const o = i * NP;
      if (P[o + P_.pe] > 0.02) { const w = 0.3 + P[o + P_.size]; this.loadW[c] += w * w; }
      if (P[o + P_.ce] > 0.02) this.chemoN[c]++;
    }
    const o2f = clamp(0.62 + this.o2 * 2.6, 0.62, 1.25);
    const oxyCap = 0.3 + this.o2 * 2.4;
    const rng = this.rng;
    let photoProd = 0;
    const uvKill = this.uv;
    
    for (let i = 0; i < MAX; i++) {
      if (!this.alive[i]) continue;
      const o = i * NP;
      const c = this.cellOf(i);
      const land = this.land[c], tid = this.tidal[c];
      const size = P[o + P_.size], tempo = P[o + P_.tempo];
      // habitat
      let mis = land ? 1 - P[o + P_.terra] : Math.max(0, P[o + P_.terra] - 0.35) * 1.3;
      if (tid > 0.1) mis *= 1 - tid * 0.85;
      const habCost = mis * mis * 0.16;
      // temperatura
      const T = this.temp[c], dT = Math.abs(T - P[o + P_.topt]), tol = P[o + P_.ttol];
      const ts = Math.max(0, dT - tol * 0.5) / (tol * 0.5 + 4);
      const thermCost = ts * ts * 0.06;
      let gain = 0;
      // fotossíntese (competição por luz: os maiores sombreiam)
      const pe = P[o + P_.pe];
      if (pe > 0.01) {
        const w = (0.3 + size) * (0.3 + size);
        const share = Math.min(1, 1.8 * w / (this.loadW[c] + 0.05));
        const nf = this.nutr[c] / (this.nutr[c] + 0.25);
        const gp = pe * this.light[c] * 0.34 * nf * share;
        gain += gp; this.nutr[c] = Math.max(0, this.nutr[c] - gp * 0.3);
        photoProd += gp;
      }
      const ce = P[o + P_.ce];
      if (ce > 0.01) {
        const xeno = this.GEN[i * NG + G.xeno];
        gain += ce * (this.vent[c] * 0.95 + xeno * 0.12 * (land ? 1 : 0.4) + 0.07) * 0.42 / (1 + this.chemoN[c] * 0.18);
      }
      const se = P[o + P_.se];
      if (se > 0.01) {
        const take = Math.min(this.detr[c], se * 0.06);
        this.detr[c] -= take;
        const osm = se * Math.min(1.5, this.org[c]) * 0.2 * (1.2 - size);
        gain += take * 1.3 * o2f + osm; this.org[c] = Math.max(0, this.org[c] - osm * 0.3);
      }
      // predação
      const re = P[o + P_.re];
      if (re > 0.04 && this.aen[i] < 0.8 && rng.next() < 0.5 + P[o + P_.sense] * 0.5) {
        let j = this.head[c], tries = 0, best = -1, bestV = 0;
        while (j >= 0 && tries < 7) {
          if (j !== i && this.alive[j]) {
            const oj = j * NP;
            const sj = P[oj + P_.size];
            if (sj <= size + 0.16 && (this.asp[j] !== this.asp[i] || rng.next() < 0.05)) {
              const v = 0.3 + this.aen[j] + sj - P[oj + P_.def] * 0.8;
              if (v > bestV) { bestV = v; best = j; }
            }
            tries++;
          }
          j = this.next[j];
        }
        if (best >= 0) {
          const ob = best * NP;
          const sizeAdv = clamp(1 + (size - P[ob + P_.size]) * 3, 0.25, 1.6);
          const evade = P[ob + P_.motil] * P[ob + P_.sense] * 0.5;
          const pS = re * 2.6 * (0.45 + P[o + P_.sense] * 0.55) * (1 - P[ob + P_.def]) * (1 - evade) * sizeAdv;
          if (rng.next() < pS) {
            gain += (Math.max(0, this.aen[best]) * 0.7 + 0.32 + P[ob + P_.size] * 0.5) * (0.5 + re * 1.4) * o2f;
            const tox = P[ob + P_.toxin];
            if (tox > 0.25) this.aen[i] -= (tox - 0.2) * 0.6 * (1 - P[o + P_.toxin] * 0.6);
            this.kill(best, 0.35);
          }
        }
      }
      // custos
      const moving = P[o + P_.speed] > 0.02;
      let cost = P[o + P_.basal] + P[o + P_.upkeep] + (moving ? P[o + P_.move] : 0) + habCost + thermCost;
      if (P[o + P_.motil] > 0.25 || re > 0.2) cost += Math.max(0, size - oxyCap) * 0.5;
      const crowd = this.dens[c] - 7; if (crowd > 0) cost += crowd * 0.0035;
      this.aen[i] += (gain - cost) * tempo;
      this.aage[i] += tempo;
      if (this.aen[i] <= 0 || this.aage[i] > P[o + P_.life] * (0.75 + 0.5 * rng.next()) || (ts > 1.6 && rng.next() < 0.1) || (uvKill > 0 && !(!land && this.depth[c] > 0.25) && rng.next() < uvKill * 0.08)) {
        this.kill(i); continue;
      }
      // movimento
      if (moving) {
        let h = this.ahead[i];
        const spd = P[o + P_.speed] * 0.55;
        if (rng.next() < 0.3 + P[o + P_.sense] * 0.7) {
          let bestS = -1e9, bh = h;
          for (let k = -1; k <= 1; k++) {
            const hh = h + k * 0.9;
            const nx = ((ax[i] + Math.cos(hh) * 1.5) % GW + GW) % GW, ny = clamp(ay[i] + Math.sin(hh) * 1.5, 0, GH - 1);
            const cc = (ny | 0) * GW + (nx | 0);
            const l2 = this.land[cc];
            let m2 = l2 ? 1 - P[o + P_.terra] : Math.max(0, P[o + P_.terra] - 0.35) * 1.3;
            if (this.tidal[cc] > 0.1) m2 *= 1 - this.tidal[cc] * 0.85;
            const dT2 = Math.max(0, Math.abs(this.temp[cc] - P[o + P_.topt]) - tol * 0.5);
            const sc2 = pe * this.light[cc] + ce * this.vent[cc] + se * this.detr[cc] * 2 + re * this.dens[cc] * 0.3 - m2 * 2 - dT2 * 0.05 - this.dens[cc] * 0.02 + rng.next() * 0.1;
            if (sc2 > bestS) { bestS = sc2; bh = hh; }
          }
          h = bh;
        } else h += rng.gauss() * 0.7;
        this.ahead[i] = h;
        let nx = ax[i] + Math.cos(h) * spd, ny = ay[i] + Math.sin(h) * spd;
        if (ny < 0.3 || ny > GH - 0.3) { this.ahead[i] = -h; ny = clamp(ny, 0.3, GH - 0.3); }
        // evita trocar de meio se for muito inadequado
        const nc = (ny | 0) * GW + (((nx % GW) + GW) % GW | 0);
        if (this.land[nc] !== land) {
          const pass = this.land[nc] ? P[o + P_.terra] * 1.2 + this.tidal[nc] * 0.15 : 1 - P[o + P_.terra] * 0.8 + this.tidal[nc] * 0.15;
          if (rng.next() > pass) { this.ahead[i] = h + Math.PI * (0.5 + rng.next()); nx = ax[i]; ny = ay[i]; }
        }
        ax[i] = ((nx % GW) + GW) % GW; ay[i] = ny;
      }
      // reprodução
      if (this.aen[i] >= 1 && rng.next() > (this.count / MAX - 0.8) * 5) {
        const n = P[o + P_.litter] | 0;
        const fec = P[o + P_.fec];
        const childE = this.aen[i] * 0.55 / n * (1.15 - fec * 0.35);
        this.aen[i] *= 0.4;
        const disp = P[o + P_.disp];
        const mutRate = P[o + P_.mut] * (1 + this.uv * 6);
        for (let k = 0; k < n; k++) {
          if (!this.free.length) break;
          const g = this.GEN.slice(i * NG, i * NG + NG);
          mutate(g, mutRate, evo, rng);
          const cx = ax[i] + rng.gauss() * disp, cy = ay[i] + rng.gauss() * disp;
          this.spawn(g, cx, cy, this.asp[i], childE);
        }
      }
    }
    // oxigênio atmosférico
    this.o2 = clamp(this.o2 + (photoProd * 0.000001 - this.o2 * 0.0008) * Math.min(60, geo * 1.25), 0, 0.4);
    if (!this.flags.goe && this.o2 > 0.02) { this.flags.goe = 1; this.addLog('marco', 'Grande Oxigenação: o oxigênio livre se acumula na atmosfera.'); this.emit('milestone', 'goe'); }
    if (!this.flags.o2high && this.o2 > 0.12) { this.flags.o2high = 1; this.addLog('marco', 'O oxigênio passa de 12%. Corpos grandes e ativos tornam-se viáveis.'); this.emit('milestone', 'o2'); }
    if (this.stepN % 4 === 0) this.housekeeping();
    if (this.stepN % 5 === 0) this.sampleHistory();
    if (this.stepN % 12 === 0) this.snapshot();
  }

  housekeeping(noSpec = false) {
    const ns = this.species.length;
    const pop = new Int32Array(ns);
    const sums = new Map();
    for (let i = 0; i < MAX; i++) {
      if (!this.alive[i]) continue;
      const s = this.asp[i];
      pop[s]++;
      let a = sums.get(s); if (!a) { a = new Float64Array(NG + 2); sums.set(s, a); }
      const o = i * NG;
      for (let k = 0; k < NG; k++) a[k] += this.GEN[o + k];
      const h = this.GEN[o + G.hue] * 6.283; a[NG] += Math.cos(h); a[NG + 1] += Math.sin(h);
    }
    if (!noSpec && this.speciate(pop, sums)) return this.housekeeping(true);
    let living = 0;
    for (let s = 0; s < ns; s++) {
      const sp = this.species[s];
      sp.pop = pop[s];
      if (pop[s] > sp.peak) sp.peak = pop[s];
      if (pop[s] > 0) {
        living++;
        const a = sums.get(s);
        for (let k = 0; k < NG; k++) sp.mean[k] = a[k] / pop[s];
        sp.mean[G.hue] = ((Math.atan2(a[NG + 1], a[NG]) / 6.283) + 1) % 1;
        sp.kind = kindOf(sp.mean);
        sp.color = speciesColor(sp.mean, this.planet.star);
        if (this.stepN % 20 === 0) { sp.hist.push([this.years, pop[s]]); if (sp.hist.length > 240) sp.hist = sp.hist.filter((_, k) => k % 2 === 0); }
        this.checkInnovations(sp);
        if (!this.flags.land && sp.mean[G.terra] > 0.55 && pop[s] > 8) { this.flags.land = 1; this.addLog('marco', `Conquista da terra firme: ${this.binomial(sp)} vive fora d'água.`, s); this.emit('milestone', 'land'); }
        if (!this.flags.multi && sp.mean[G.multi] > 0.6 && pop[s] > 8) { this.flags.multi = 1; this.addLog('marco', `Primeiros multicelulares: ${this.binomial(sp)}.`, s); this.emit('milestone', 'multi'); }
      } else if (sp.extinct === null) {
        sp.extinct = this.years;
        if (sp.peak >= 6) { this.emit('extinction', sp); if (sp.peak >= 25) this.addLog('extinção', `${this.binomial(sp)} (${sp.common}) extinta.`, s); }
      }
    }
    this.living = living;
    // detecção de extinção em massa
    this.popWindow.push(living);
    if (this.popWindow.length > 12) this.popWindow.shift();
    const maxW = Math.max(...this.popWindow);
    if (maxW >= 8 && living < maxW * 0.45 && (!this.lastMass || this.stepN - this.lastMass > 80)) {
      this.lastMass = this.stepN;
      this.addLog('extinção', `Extinção em massa: ${Math.round((1 - living / maxW) * 100)}% das espécies desapareceram.`);
      this.emit('massExtinction', { frac: 1 - living / maxW });
    }
    if (this.count === 0 && ns > 0 && !this.flags.dead) { this.flags.dead = 1; this.addLog('extinção', 'A vida se extinguiu neste planeta.'); this.emit('allDead'); }
    if (this.count > 0) this.flags.dead = 0;
  }

  // Especiação populacional: um grupo de membros que divergiu da média vira espécie-filha
  speciate(pop, sums) {
    const T = 0.27;
    const members = new Map();
    for (let i = 0; i < MAX; i++) if (this.alive[i]) { const s = this.asp[i]; if (pop[s] >= 10) { let a = members.get(s); if (!a) members.set(s, a = []); a.push(i); } }
    let made = 0;
    for (const [s, idx] of members) {
      if (made >= 4) break;
      const a = sums.get(s), n = pop[s], mean = new Float32Array(NG);
      for (let k = 0; k < NG; k++) mean[k] = a[k] / n;
      mean[G.hue] = this.species[s].mean[G.hue];
      let far = -1, fd = 0;
      for (const i of idx) { const d = geneDistance(this.GEN.subarray(i * NG, i * NG + NG), mean); if (d > fd) { fd = d; far = i; } }
      if (fd < T) continue;
      const fg = this.GEN.slice(far * NG, far * NG + NG);
      const group = idx.filter((i) => { const g = this.GEN.subarray(i * NG, i * NG + NG); return geneDistance(g, fg) < geneDistance(g, mean); });
      if (group.length < 4 || group.length > n - 4) continue;
      const cm = new Float32Array(NG);
      for (const i of group) for (let k = 0; k < NG; k++) cm[k] += this.GEN[i * NG + k] / group.length;
      cm[G.hue] = fg[G.hue];
      if (geneDistance(cm, mean) < T * 0.75) continue;
      const nid = this.newSpecies(cm, s, this.ax[far], this.ay[far]);
      for (const i of group) this.asp[i] = nid;
      pop[s] -= group.length;
      made++;
    }
    return made;
  }

  sampleHistory() {
    const kinds = { micro: 0, plant: 0, fungus: 0, animal: 0, xeno: 0 };
    for (const sp of this.species) if (sp.pop > 0) kinds[sp.kind]++;
    this.history.push({ y: this.years, s: this.stepN, sp: this.living || 0, pop: this.count, T: this.meanTemp, o2: this.o2, k: kinds });
    if (this.history.length > 3000) this.history = this.history.filter((_, k) => k % 2 === 0 || k > this.history.length - 50);
  }

  // ---------- Máquina do tempo ----------
  snapshot() {
    const idx = [];
    for (let i = 0; i < MAX; i++) if (this.alive[i]) idx.push(i);
    const n = idx.length;
    const f = new Float32Array(n * 6), sp = new Int32Array(n), gen = new Uint16Array(n * NG);
    for (let k = 0; k < n; k++) {
      const i = idx[k];
      f[k * 6] = this.ax[i]; f[k * 6 + 1] = this.ay[i]; f[k * 6 + 2] = this.aen[i]; f[k * 6 + 3] = this.aage[i]; f[k * 6 + 4] = this.ahead[i]; f[k * 6 + 5] = this.aid[i];
      sp[k] = this.asp[i];
      for (let j = 0; j < NG; j++) gen[k * NG + j] = Math.round(this.GEN[i * NG + j] * 65535);
    }
    let elev = this.lastSnapElev;
    if (!elev || elev.version !== this.elevVersion) {
      elev = { version: this.elevVersion, data: Float32Array.from(this.elevHi), vents: this.vents.map((v) => ({ ...v })), water: this.planet.water };
      this.lastSnapElev = elev;
    }
    const s = {
      step: this.stepN, years: this.years, n, f, sp, gen,
      nutr: Float32Array.from(this.nutr), org: Float32Array.from(this.org), detr: Float32Array.from(this.detr), anom: Float32Array.from(this.anom),
      o2: this.o2, tempDrift: this.tempDrift, events: JSON.parse(JSON.stringify(this.events)), rng: this.rng.getState(),
      nSpecies: this.species.length, nGenera: this.genera.length, nClades: this.clades.length,
      spExt: Float64Array.from(this.species, (x) => x.extinct ?? NaN), spInt: (() => { const a = new Int32Array(this.species.length * 4); this.species.forEach((x, k) => { a[k * 4] = x.pop; a[k * 4 + 1] = x.peak; a[k * 4 + 2] = x.innov.length; a[k * 4 + 3] = x.clades.length; }); return a; })(),
      flags: { ...this.flags }, elev, nextAid: this.nextAid, logLen: this.log.length,
    };
    this.snapshots.push(s);
    if (this.snapshots.length > 110) {
      // afina mantendo os recentes densos
      this.snapshots = this.snapshots.filter((_, k) => k % 2 === 0 || k > 80);
    }
  }

  restore(s) {
    this.alive.fill(0); this.free = []; for (let i = MAX - 1; i >= 0; i--) this.free.push(i); this.count = 0;
    this.species.length = s.nSpecies; this.genera.length = s.nGenera; this.clades.length = s.nClades;
    this.genusNames = new Set(this.genera.map((g) => g.name)); this.binomials = new Set(this.species.map((x) => this.genera[x.genus].name + ' ' + x.epithet)); this.cladeNames = new Set(this.clades.map((c) => c.name));
    this.species.forEach((sp, k) => {
      const e = s.spExt[k]; sp.extinct = Number.isNaN(e) ? null : e; sp.pop = s.spInt[k * 4]; sp.peak = s.spInt[k * 4 + 1];
      sp.innov.length = Math.min(sp.innov.length, s.spInt[k * 4 + 2]); sp.clades.length = Math.min(sp.clades.length, s.spInt[k * 4 + 3]);
      sp.hist = sp.hist.filter((h) => h[0] <= s.years);
    });
    if (s.elev.version !== this.elevVersion) {
      this.elevHi.set(s.elev.data); this.vents = s.elev.vents.map((v) => ({ ...v }));
      this.planet.water = s.elev.water; this.sea = seaLevelFor(this.elevHi, this.planet.water);
      this.elevVersion = s.elev.version; this.rebuildGrid();
    }
    this.lastSnapElev = s.elev;
    const g = new Float32Array(NG);
    for (let k = 0; k < s.n; k++) {
      for (let j = 0; j < NG; j++) g[j] = s.gen[k * NG + j] / 65535;
      const i = this.spawn(g, s.f[k * 6], s.f[k * 6 + 1], s.sp[k], s.f[k * 6 + 2]);
      this.aage[i] = s.f[k * 6 + 3]; this.ahead[i] = s.f[k * 6 + 4]; this.aid[i] = s.f[k * 6 + 5];
    }
    this.nextAid = s.nextAid;
    this.nutr.set(s.nutr); this.org.set(s.org); this.detr.set(s.detr); this.anom.set(s.anom);
    this.o2 = s.o2; this.tempDrift = s.tempDrift; this.events = JSON.parse(JSON.stringify(s.events)); this.rng.setState(s.rng);
    this.years = s.years; this.stepN = s.step; this.flags = { ...s.flags };
    this.history = this.history.filter((h) => h.s <= s.step);
    this.log.length = Math.min(this.log.length, s.logLen);
    const k = this.snapshots.indexOf(s);
    if (k >= 0) this.snapshots.length = k + 1;
    this.popWindow = [];
    this.updateClimate();
    this.housekeeping();
    this.emit('restored', s);
  }

  // ---------- Eventos ----------
  triggerEvent(type, opt = {}) {
    const rng = this.rng;
    const name = EVENT_TYPES[type].name;
    let killed = 0;
    const killWhere = (pred) => {
      for (let i = 0; i < MAX; i++) if (this.alive[i] && pred(i)) { this.kill(i); killed++; }
    };
    const angDist = (i, u, v) => {
      const lo1 = this.ax[i] / GW * 6.283, la1 = (0.5 - this.ay[i] / GH) * Math.PI;
      const lo2 = u * 6.283, la2 = (0.5 - v) * Math.PI;
      return Math.acos(clamp(Math.sin(la1) * Math.sin(la2) + Math.cos(la1) * Math.cos(la2) * Math.cos(lo1 - lo2), -1, 1));
    };
    if (type === 'impact') {
      const r = opt.radius ?? 0.06, u = opt.u, v = opt.v;
      stampElevation(this.elevHi, u, v, r * 0.55, 0.35 + r * 2, true);
      this.elevVersion++; this.rebuildGrid();
      killWhere((i) => { const d = angDist(i, u, v) / (r * 6.283 * 1.6); return d < 1 || (d < 3 && rng.next() < 0.6 / d); });
      this.paintAnom(u, v, r * 1.1, 30);
      this.events.push({ type, total: 70 + r * 300, left: 70 + r * 300, dT: -6 - r * 90, ash: clamp(0.25 + r * 6, 0, 0.9) });
      killWhere(() => rng.next() < r * 1.5);
    } else if (type === 'volcanic') {
      const u = opt.u, v = opt.v;
      stampElevation(this.elevHi, u, v, 0.05, 0.12);
      this.vents.push({ x: u, y: v, power: 1.3 });
      this.elevVersion++; this.rebuildGrid();
      killWhere((i) => angDist(i, u, v) < 0.35 && rng.next() < 0.7);
      this.paintAnom(u, v, 0.08, 22);
      this.events.push({ type, total: 200, left: 200, dT: 9, ash: 0.35 });
    } else if (type === 'glacial') {
      this.events.push({ type, total: 260, left: 260, dT: -26, ash: 0 });
    } else if (type === 'greenhouse') {
      this.events.push({ type, total: 240, left: 240, dT: 22, ash: 0 });
    } else if (type === 'anoxia') {
      killWhere((i) => { const c = this.cellOf(i); return !this.land[c] && this.P[i * NP + P_.size] > 0.12 && rng.next() < 0.85; });
      for (let i = 0; i < this.nutr.length; i++) if (!this.land[i]) this.nutr[i] *= 0.3;
      this.o2 *= 0.6;
      this.events.push({ type, total: 120, left: 120, dT: 4, ash: 0 });
    } else if (type === 'gamma') {
      killWhere((i) => { const c = this.cellOf(i); return (this.land[c] || this.depth[c] < 0.25) && rng.next() < 0.88; });
      this.events.push({ type, total: 150, left: 150, dT: -3, ash: 0.1, uv: 1 });
    } else if (type === 'plague') {
      let best = -1, bp = 0;
      for (const sp of this.species) if (sp.pop > bp) { bp = sp.pop; best = sp.id; }
      if (best >= 0) killWhere((i) => this.asp[i] === best && rng.next() < 0.93);
    } else if (type === 'custom') {
      const tgt = opt.target || 'todos';
      const frac = opt.kill ?? 0.5;
      const reg = opt.u != null ? { u: opt.u, v: opt.v, r: opt.radius ?? 0.3 } : null;
      killWhere((i) => {
        if (reg && angDist(i, reg.u, reg.v) > reg.r * 3) return false;
        const c = this.cellOf(i), o = i * NP;
        const ok = tgt === 'todos' || (tgt === 'terrestres' && this.land[c]) || (tgt === 'aquáticos' && !this.land[c]) ||
          (tgt === 'grandes' && this.P[o + P_.size] > 0.35) || (tgt === 'pequenos' && this.P[o + P_.size] <= 0.35) ||
          (tgt === 'produtores' && (this.P[o + P_.pe] > 0.1 || this.P[o + P_.ce] > 0.1)) || (tgt === 'consumidores' && (this.P[o + P_.re] > 0.1 || this.P[o + P_.se] > 0.1));
        return ok && rng.next() < frac;
      });
      if (reg) this.paintAnom(reg.u, reg.v, reg.r, (opt.dT || 0) * 0.5);
      const dur = opt.duration ?? 150;
      this.events.push({ type, total: dur, left: dur, dT: opt.dT || 0, ash: opt.ash || 0 });
    }
    this.updateClimate();
    this.addLog('evento', `${name}. ${killed.toLocaleString('pt-BR')} organismos mortos no impacto inicial.`);
    this.emit('event', { type, opt, killed });
    return killed;
  }

  paintAnom(u, v, r, amount) {
    const cx = u * GW, cy = v * GH, R = r * GW;
    for (let y = Math.max(0, Math.floor(cy - R)); y < Math.min(GH, cy + R); y++) {
      for (let dx = -R; dx <= R; dx++) {
        const x = ((Math.floor(cx + dx)) % GW + GW) % GW;
        const d = Math.hypot(dx, y - cy) / R;
        if (d < 1) this.anom[y * GW + x] += amount * (1 - d * d);
      }
    }
  }

  // ---------- Consultas e edição ----------
  nearestAgent(gx, gy, maxD = 3) {
    let best = -1, bd = maxD * maxD;
    for (let i = 0; i < MAX; i++) {
      if (!this.alive[i]) continue;
      let dx = Math.abs(this.ax[i] - gx); if (dx > GW / 2) dx = GW - dx;
      const dy = this.ay[i] - gy, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  findById(aid) { for (let i = 0; i < MAX; i++) if (this.alive[i] && this.aid[i] === aid) return i; return -1; }

  setGenome(i, g) { this.GEN.set(g, i * NG); this.refreshPheno(i); }
  applyToSpecies(sid, g, keys) {
    for (let i = 0; i < MAX; i++) {
      if (!this.alive[i] || this.asp[i] !== sid) continue;
      for (const k of keys) this.GEN[i * NG + k] = g[k];
      this.refreshPheno(i);
    }
    const sp = this.species[sid];
    for (const k of keys) sp.mean[k] = g[k];
    sp.kind = kindOf(sp.mean); sp.color = speciesColor(sp.mean, this.planet.star);
    this.checkInnovations(sp);
  }

  editTerrain(u, v, r, amount) {
    stampElevation(this.elevHi, u, v, r, amount);
    this.elevVersion++;
  }
  commitTerrain() { this.sea = seaLevelFor(this.elevHi, this.planet.water); this.rebuildGrid(); this.updateClimate(); }
  addVent(u, v) { this.vents.push({ x: u, y: v, power: 1 }); this.elevVersion++; this.rebuildGrid(); }

  lineage(sid) {
    const out = []; let s = sid;
    while (s >= 0) { out.unshift(this.species[s]); s = this.species[s].parent; }
    return out;
  }

  // posição das luas (radianos) e altura de maré em um ponto (para render)
  moonAngles(years = this.years) {
    return this.planet.moons.map((m) => (m.phase + years * 365.25 / Math.max(0.5, m.period)) * Math.PI * 2);
  }
  spinAngle(years = this.years) { return ((years * 365.25 * 24 / this.planet.dayHours) % 1) * Math.PI * 2; }
}

export { P_, NP, fmtYears };
