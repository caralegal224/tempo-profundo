import { randomPlanet, derive, planetName, newMoon, STARS, GW, GH, HW, HH, seaLevelFor, generateTerrain, generateVents } from './planet.js';
import { World, TIME_SCALES, EVENT_TYPES, MAX, NP, P_ } from './sim.js';
import { GENES, G, NG, INNOV, KINDS, presetGenome, phenotype, sizeMeters, fmtSize, tempOpt, kindOf, speciesColor, cloneG, innovationsOf } from './genome.js';
import { makeGenusName, makeEpithet, makeCommonName, higherTaxa } from './taxonomy.js';
import { SurfacePainter, SW, SH } from './surface.js';
import { Map2D, drawGlyph } from './map2d.js';
import { View3D } from './view3d.js';
import { buildCreature } from './creature.js';
import { AudioEngine, voiceFor } from './audio.js';
import { RNG, clamp, fmtYears, fmtInt, hsl2rgb } from './util.js';
const THREE = window.THREE;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (k === 'class') e.className = v; else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
export const VERSION = '1.1', VERSION_NAME = 'Tempo Profundo';
const SPEEDS = { 1: 3, 2: 8, 3: 16, 4: 32, 5: 64 };
const KIND_DESC = {
  micro: 'Uma célula simples que absorve matéria orgânica dissolvida e um pouco de energia química. O ponto de partida mais versátil.',
  plant: 'Uma célula fotossintetizante. Precisa de luz e nutrientes rasos; enche o ar de oxigênio com o tempo.',
  fungus: 'Filamentos que decompõem matéria morta. Prospera onde outros organismos já viveram.',
  animal: 'Um caçador microscópico, móvel, que engole outras células. Sozinho morre de fome: semeie depois que houver presas.',
  xeno: 'Bioquímica que não segue as regras: vive de minerais e calor, tolera extremos e cresce em formas cristalinas. Prospera junto às fontes termais.',
};
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

class Specimen {
  constructor() {
    this.canvas = h('canvas', { id: 'specimen' });
    this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.r.outputEncoding = THREE.sRGBEncoding; this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(32, 1.6, 0.01, 50);
    const key = new THREE.DirectionalLight(0xfff1dc, 2.2); key.position.set(2, 3, 2); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aacc, 1.2); rim.position.set(-2, 1, -2); this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight(0x404850, 0.8));
    const dc = document.createElement('canvas'); dc.width = dc.height = 128; const dctx = dc.getContext('2d'); const grd = dctx.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, 'rgba(34,40,42,0.9)'); grd.addColorStop(0.7, 'rgba(20,24,27,0.6)'); grd.addColorStop(1, 'rgba(20,24,28,0)'); dctx.fillStyle = grd; dctx.fillRect(0, 0, 128, 128);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.25, 48), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(dc), transparent: true, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; this.scene.add(disc); this.disc = disc;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.08, 1.1, 64), new THREE.MeshBasicMaterial({ color: 0xe3a95e, transparent: true, opacity: 0.4 }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.002; this.scene.add(this.ring);
    this.obj = null; this.t = 0; this.yaw = 0.6; this.drag = null;
    this.canvas.addEventListener('pointerdown', (e) => { this.drag = e.clientX; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => { if (this.drag != null) { this.yaw -= (e.clientX - this.drag) * 0.01; this.drag = e.clientX; } });
    this.canvas.addEventListener('pointerup', () => { this.drag = null; });
  }
  show(g, color, seed) {
    if (this.obj) this.scene.remove(this.obj);
    const cr = buildCreature(g, color, seed);
    cr.userData.animate?.(0);
    const box = new THREE.Box3().setFromObject(cr);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const s = 1.6 / Math.max(size.x, size.y * 1.1, size.z, 0.2);
    const center = new THREE.Group(); center.add(cr); center.position.set(-c.x, -box.min.y, -c.z);
    const wrap = new THREE.Group(); wrap.add(center); wrap.scale.setScalar(s);
    this.obj = wrap; this.inner = cr;
    this.scene.add(wrap);
  }
  render(dt) {
    if (!this.obj || !this.canvas.isConnected) return;
    const w = this.canvas.clientWidth, hh = this.canvas.clientHeight;
    if (w && (this.canvas.width !== Math.floor(w * devicePixelRatio))) { this.r.setPixelRatio(devicePixelRatio); this.r.setSize(w, hh, false); this.cam.aspect = w / hh; this.cam.updateProjectionMatrix(); }
    this.t += dt; if (this.drag == null) this.yaw += dt * 0.25;
    this.cam.position.set(Math.sin(this.yaw) * 4.2, 1.7, Math.cos(this.yaw) * 4.2); this.cam.lookAt(0, 0.75, 0);
    this.inner.userData.animate?.(this.t);
    this.r.render(this.scene, this.cam);
  }
}

class App {
  constructor() {
    this.seed = (Math.random() * 1e9) | 0;
    this.planet = randomPlanet(this.seed);
    this.world = new World(this.planet);
    this.painter = new SurfacePainter(this.world);
    this.painter.compose();
    this.map = new Map2D($('#c2d'), this.world, this.painter);
    this.v3 = new View3D($('#c3d'), this.world, this.painter);
    this.audio = new AudioEngine();
    this.view = '3d'; this.started = false; this.paused = false; this.speed = 2; this.acc = 0;
    this.tool = 'observe'; this.pending = null; this.sel = null; this.follow = false;
    this.layers = { clouds: true, night: true, moons: true };
    this.vault = LS.get('tp.vault', []);
    this.kingdomNames = {};
    this.genesisKind = 'micro';
    this.timers = { compose: 0, hud: 0, audio: 0, tl: 0, insp: 0, grain: 0 };
    this.ticks = [];
    this.specimen = null;
    this.bindWorld();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.bindInput(); this.bindUI(); this.makeGrain();
    $$('.app-ver').forEach((e) => e.textContent = VERSION); $$('.app-ver-name').forEach((e) => e.textContent = VERSION_NAME);
    this.showGenesis();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- Infra ----------
  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1), w = innerWidth, hh = innerHeight;
    const c = $('#c2d'); c.width = w * dpr; c.height = hh * dpr;
    this.map.resize(w, hh, dpr); this.map.clampView();
    this.v3.resize(w, hh, dpr);
    this.drawTimeline();
  }
  makeGrain() {
    const c = document.createElement('canvas'); c.width = c.height = 180; const ctx = c.getContext('2d'), img = ctx.createImageData(180, 180);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    const g = $('#grain'); g.style.backgroundImage = `url(${c.toDataURL()})`; g.width = 1; g.height = 1;
  }
  toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(this._toast); this._toast = setTimeout(() => t.classList.remove('show'), 2400); }
  sfx(kind, data) { this.audio.stinger(kind, data); }

  bindWorld() {
    const w = this.world;
    w.on((type, d) => {
      if (type === 'speciation') this.sfx('speciation');
      else if (type === 'innovation') this.sfx('innovation');
      else if (type === 'extinction') { if (d.peak >= 25) this.sfx('extinction'); }
      else if (type === 'massExtinction') this.sfx('massExtinction');
      else if (type === 'milestone') this.sfx('milestone');
      else if (type === 'log') this.pushTick(d);
      else if (type === 'allDead') { this.toast('Toda a vida se extinguiu. Semeie de novo ou volte no tempo.'); }
    });
  }

  pushTick(l) {
    if (!this.started) return;
    if (l.kind === 'extinção' && /extinta\.$/.test(l.text) && this.speed >= 4) return;
    const box = $('#ticker');
    const el = h('div', { class: 'tick ' + l.kind }, h('em', {}, fmtYears(l.years)), l.text);
    box.append(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => { el.style.transition = 'opacity .6s'; el.style.opacity = 0; setTimeout(() => el.remove(), 700); }, 7000);
  }

  // ---------- Gênese ----------
  showGenesis() {
    $('#genesis').hidden = false;
    this.setView('3d', true);
    this.v3.targetDist = this.v3.dist = 2.9;
    this.renderGenesis();
    const box = $('#g-kinds'); box.innerHTML = '';
    for (const k of Object.keys(KINDS)) {
      const cv = h('canvas', { width: 180, height: 88 });
      const b = h('button', { class: 'choice' + (k === this.genesisKind ? ' on' : ''), onclick: () => { this.genesisKind = k; $$('#g-kinds .choice').forEach((x) => x.classList.toggle('on', x === b)); $('#g-kind-desc').textContent = KIND_DESC[k]; this.sfx('ui'); } }, cv, h('b', {}, KINDS[k].label));
      box.append(b);
      this.paintKindIcon(cv, k);
    }
    $('#g-kind-desc').textContent = KIND_DESC[this.genesisKind];
  }
  paintKindIcon(cv, k) {
    const ctx = cv.getContext('2d'), g = presetGenome(k, this.planet);
    if (k === 'animal') { g[G.symm] = 0.6; g[G.limbs] = 0.4; g[G.multi] = 0.5; g[G.sense] = 0.5; }
    if (k === 'plant') { g[G.multi] = 0.5; g[G.branch] = 0.6; }
    if (k === 'fungus') { g[G.multi] = 0.5; }
    const col = speciesColor(g, this.planet.star), cs = `rgb(${col[0] * 255 | 0},${col[1] * 255 | 0},${col[2] * 255 | 0})`;
    ctx.clearRect(0, 0, cv.width, cv.height);
    drawGlyph(ctx, k, cv.width / 2, cv.height / 2 + (k === 'plant' ? -8 : 0), 22, -0.3, cs, g, 0, 2, 1);
  }
  renderGenesis() {
    const p = this.planet;
    $('#g-name').textContent = p.name; $('#g-des').textContent = `${p.designation} · ${STARS[p.star].name}`;
    const f = [
      ['Temperatura média', `${p.baseTemp.toFixed(1)} °C`], ['Oceanos', `${Math.round(p.water * 100)}% da superfície`],
      ['Gravidade', `${p.gravity.toFixed(2)} g`], ['Atmosfera', `${p.atmosphere.toFixed(2)} bar`],
      ['Dia', `${p.dayHours.toFixed(1)} h`], ['Ano', `${Math.round(p.yearDays)} dias`],
      ['Luas', p.moons.length ? p.moons.map((m) => m.name).join(', ') : 'nenhuma'], ['Força de maré', `${p.tide.toFixed(2)}× a da Terra`],
    ];
    $('#g-facts').innerHTML = '';
    for (const [k, v] of f) $('#g-facts').append(h('div', {}, h('span', { class: 'label' }, k), h('b', {}, v)));
  }
  rollPlanet(seed = (Math.random() * 1e9) | 0) {
    this.seed = seed; this.planet = randomPlanet(seed);
    this.world.setPlanet(this.planet); this.world.reset();
    this.painter.compose();
    this.renderGenesis();
    $$('#g-kinds canvas').forEach((cv, k) => this.paintKindIcon(cv, Object.keys(KINDS)[k]));
  }
  async start(withLife) {
    await this.audio.init();
    this.audio.setPlanet({ star: this.planet.star, seed: this.seed, temp: this.planet.baseTemp, water: this.planet.water, atmosphere: this.planet.atmosphere, tide: this.planet.tide });
    $('#genesis').hidden = true; $('#rail').hidden = false; $('#plate').hidden = false; $('#topright').hidden = false; $('#console').hidden = false;
    this.started = true;
    this.world.scaleIdx = 6;
    this.setView('2d');
    this.updateScale();
    this.closeDrawer();
    if (withLife) {
      this.setTool('seed');
      this.openCreator(this.genesisKind);
      this.toast('Escolha onde semear: clique no mapa.');
      this.pendingSeedFromCreator();
    } else {
      this.toast('Planeta estéril. Use Semear vida quando quiser.');
    }
    this.sfx('milestone');
  }

  // ---------- Visões ----------
  setView(v, silent) {
    this.view = v;
    $('#c2d').hidden = v !== '2d'; $('#c3d').hidden = v !== '3d';
    $$('#viewseg button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    if (!silent) this.sfx('panel', { open: v === '3d' });
  }

  // ---------- Entrada ----------
  bindInput() {
    const c2 = $('#c2d'), c3 = $('#c3d');
    const ptrs = new Map();
    let down = null, pinch = null;
    const start = (e, cv) => {
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); down = null; return; }
      down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: 0, button: e.button, t: performance.now() };
      if (this.tool === 'sculpt' && !this.pending && e.button === 0 && cv === c2) { this.sculptAt(e.clientX, e.clientY, true); down.sculpt = true; }
    };
    const move = (e, cv) => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (cv === c2) this.map.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch); else this.v3.targetDist = clamp(this.v3.targetDist * pinch / d, 1.04, 7);
        pinch = d; return;
      }
      this.hoverAt(e.clientX, e.clientY, cv);
      if (!down) return;
      const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
      down.moved += Math.abs(dx) + Math.abs(dy); down.lx = e.clientX; down.ly = e.clientY;
      if (down.sculpt) { this.sculptAt(e.clientX, e.clientY, false); return; }
      if (cv === c2) {
        const s = this.map.scale; this.map.cx -= dx / (SW * s); this.map.cy -= dy / (SH * s); this.map.clampView();
        if (down.moved > 6) this.follow = false;
      } else {
        const k = 0.0042 * clamp(this.v3.dist - 1, 0.03, 2.5);
        this.v3.yaw -= dx * k; this.v3.pitch = clamp(this.v3.pitch + dy * k, -1.45, 1.45);
        this.v3.vyaw = -dx * k / 0.016 * 0.3; this.v3.vpitch = dy * k / 0.016 * 0.3;
        if (down.moved > 6) this.follow = false;
      }
    };
    const end = (e, cv) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (!down) return;
      if (down.sculpt) { this.endSculpt(); down = null; return; }
      if (down.moved < 6) this.clickAt(e.clientX, e.clientY, cv);
      down = null;
    };
    for (const cv of [c2, c3]) {
      cv.addEventListener('pointerdown', (e) => start(e, cv));
      cv.addEventListener('pointermove', (e) => move(e, cv));
      cv.addEventListener('pointerup', (e) => end(e, cv));
      cv.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); down = null; pinch = null; });
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    c2.addEventListener('wheel', (e) => { e.preventDefault(); this.map.zoomAt(e.clientX, e.clientY, Math.pow(1.0018, -e.deltaY)); }, { passive: false });
    c3.addEventListener('wheel', (e) => { e.preventDefault(); const d = this.v3.targetDist; this.v3.targetDist = clamp(1 + (d - 1) * Math.pow(1.0016, e.deltaY), 1.035, 7); }, { passive: false });
    addEventListener('keydown', (e) => {
      if (e.target.closest('input, [contenteditable], select, textarea')) return;
      if (e.code === 'Space') { e.preventDefault(); this.togglePause(); }
      else if (e.key === 'Escape') { if (this.pending) this.cancelPending(); else if (!$('#atlas').hidden) this.closeAtlas(); else if ($('#inspector').classList.contains('open')) this.deselect(); else this.closeDrawer(); }
      else if (e.key === 'Tab' || e.key === 'v') { e.preventDefault(); if (this.started) this.setView(this.view === '2d' ? '3d' : '2d'); }
      else if (e.key === '+' || e.key === '=' || e.key === ']') this.changeScale(1);
      else if (e.key === '-' || e.key === '[') this.changeScale(-1);
      else if (/^[1-5]$/.test(e.key)) this.setSpeed(+e.key);
    });
  }

  screenToUV(x, y, cv) {
    if (cv === $('#c2d')) return this.map.toWorld(x, y);
    const p = this.v3.pick(x, y, cv.getBoundingClientRect());
    return p ? [p.u, p.v] : null;
  }

  hoverAt(x, y, cv) {
    const r = this.pending?.radius ?? (this.tool === 'sculpt' ? this.brush.r : null);
    if (r == null || cv !== $('#c2d')) { this.map.brush = null; return; }
    const [u, v] = this.map.toWorld(x, y);
    this.map.brush = { u, v, r, color: this.pending?.type === 'event' ? 'rgba(232,120,90,0.9)' : null };
  }

  clickAt(x, y, cv) {
    if (!this.started) return;
    const uv = this.screenToUV(x, y, cv);
    if (!uv) return;
    const [u, v] = uv;
    if (this.pending) { this.executePending(u, v); return; }
    // seleção
    const i = this.world.nearestAgent(u * GW, v * GH, cv === $('#c2d') ? Math.max(0.8, 14 / (SW / GW * this.map.scale)) : 2.5);
    if (i >= 0) this.selectAgent(i); else if (this.sel) this.deselect();
  }

  // ---------- Esculpir ----------
  get brush() { return this._brush || (this._brush = { mode: 'raise', r: 0.035, strength: 0.5 }); }
  sculptAt(x, y, first) {
    const [u, v] = this.map.toWorld(x, y);
    const b = this.brush, w = this.world;
    if (b.mode === 'vent') { if (first) { w.addVent(u, v); this.sfx('sculpt'); this.painter.compose(); } return; }
    const now = performance.now();
    if (!first && now - (this._lastStamp || 0) < 30) return;
    this._lastStamp = now;
    w.editTerrain(u, v, b.r, (b.mode === 'raise' ? 1 : -1) * b.strength * 0.045);
    // repinta só a região
    const rx = b.r * 1.3, ry = b.r * 2.6;
    this.painter.paintBase({ u0: u - rx / Math.max(0.25, Math.cos((0.5 - v) * Math.PI)), u1: u + rx / Math.max(0.25, Math.cos((0.5 - v) * Math.PI)), v0: v - ry, v1: v + ry });
    this.painter.compose(true);
    if (first) this.sfx('sculpt');
  }
  endSculpt() { this.world.commitTerrain(); this.painter.compose(); }

  // ---------- Pendências (semear, eventos) ----------
  setPending(p, hint) {
    this.pending = p;
    const mh = $('#modehint'); mh.hidden = false; mh.textContent = hint + ' · Esc cancela';
  }
  cancelPending() { this.pending = null; $('#modehint').hidden = true; this.map.brush = null; }
  executePending(u, v) {
    const p = this.pending, w = this.world;
    if (p.type === 'seed') {
      const c = Math.min(GH - 1, (v * GH) | 0) * GW + ((u * GW) | 0);
      const g = cloneG(p.genome);
      const sid = w.seed(g, u, v, p.count, { genusName: p.genus, epithet: p.epithet, common: p.common, origin: p.origin, speciesId: p.speciesId });
      this.sfx('seed');
      this.map.fx.push({ kind: 'ring', u, v, r: 0.01, t: 0, life: 1.2, color: '163,194,144' });
      const habitatBad = (g[G.terra] < 0.4 && w.land[c]) || (g[G.terra] > 0.6 && !w.land[c]);
      if (habitatBad) this.toast('Atenção: o habitat escolhido não combina com este organismo.');
      if (!p.keep) this.cancelPending();
      this.painter.compose();
      this.refreshDrawer();
    } else if (p.type === 'event') {
      this.fireEvent(p.ev, { ...p.opts, u, v });
      this.cancelPending();
    }
  }

  fireEvent(type, opts = {}) {
    this.sfx(type, opts);
    const delay = type === 'impact' ? 1350 : 120;
    if (type === 'impact' && opts.u != null) this.map.fx.push({ kind: 'ring', u: opts.u, v: opts.v, r: 0.004, t: 0, life: 1.35, color: '255,200,150' });
    setTimeout(() => {
      this.world.triggerEvent(type, opts);
      if (opts.u != null) {
        this.map.fx.push({ kind: 'flash', u: opts.u, v: opts.v, r: (opts.radius || 0.05) * 1.8, t: 0, life: 2.2 });
        this.map.fx.push({ kind: 'ring', u: opts.u, v: opts.v, r: (opts.radius || 0.08) * 3, t: 0, life: 3.5, color: '255,170,110' });
      }
      this.painter.compose();
      this.refreshInspector(true);
    }, delay);
  }

  // ---------- Ferramentas / gaveta ----------
  bindUI() {
    $$('#rail button').forEach((b) => {
      b.addEventListener('click', () => { this.setTool(b.dataset.tool); this.sfx('ui'); });
      b.addEventListener('pointerenter', () => this.sfx('hover'));
    });
    document.addEventListener('pointerover', (e) => { if (e.target.closest?.('.btn, .chip, .seg button, .choice, .item')) this.sfx('hover'); });
    $('#drawer-x').onclick = () => { this.closeDrawer(); this.sfx('panel', { open: false }); };
    $('#insp-x').onclick = () => this.deselect();
    $('#atlas-x').onclick = () => this.closeAtlas();
    $$('#viewseg button').forEach((b) => b.onclick = () => this.setView(b.dataset.view));
    $$('#layerseg button').forEach((b) => b.onclick = () => { const k = b.dataset.layer; this.layers[k] = !this.layers[k]; b.classList.toggle('on', this.layers[k]); this.sfx('ui', { pitch: this.layers[k] ? 1.2 : 0.9 }); });
    $('#sound-btn').onclick = () => { $('#mixer').hidden = !$('#mixer').hidden; this.sfx('panel', { open: !$('#mixer').hidden }); };
    for (const k of ['master', 'music', 'amb', 'sfx', 'ui']) {
      const el = $('#m-' + k);
      el.value = Math.round((LS.get('tp.mix', {})[k] ?? this.audio.levels[k]) * 100);
      this.audio.levels[k] = el.value / 100; $('#mv-' + k).textContent = el.value;
      el.oninput = () => { $('#mv-' + k).textContent = el.value; this.audio.setLevel(k, el.value / 100); const m = LS.get('tp.mix', {}); m[k] = el.value / 100; LS.set('tp.mix', m); };
    }
    $('#mute-btn').onclick = () => { this.audio.setMuted(!this.audio.muted); $('#mute-btn').textContent = this.audio.muted ? 'Ativar som' : 'Silenciar'; };
    $('#t-play').onclick = () => this.togglePause();
    $('#t-step').onclick = () => { if (!this.paused) this.togglePause(); this.world.step(); this.painter.compose(); this.sfx('ui'); };
    $('#t-back').onclick = () => this.rewindStep();
    $$('#speedseg button').forEach((b) => b.onclick = () => this.setSpeed(+b.dataset.s));
    $('#sc-up').onclick = () => this.changeScale(1);
    $('#sc-dn').onclick = () => this.changeScale(-1);
    $('#g-roll').onclick = () => { this.rollPlanet(); this.sfx('ui'); };
    $('#g-edit').onclick = async () => { await this.audio.init(); this.setTool('planet'); };
    $('#g-start').onclick = () => this.start(true);
    $('#g-empty').onclick = () => this.start(false);
    $$('#atlas-filter button').forEach((b) => b.onclick = () => { $$('#atlas-filter button').forEach((x) => x.classList.toggle('on', x === b)); this.atlasFilter = b.dataset.f; this.renderAtlas(); });
    $('#atlas-search').oninput = () => this.renderAtlas();
    this.bindTimeline();
    // edição de nomes no inspetor
    $('#insp-name').addEventListener('blur', () => this.renameFromHeader());
    $('#insp-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
    $('#insp-common').addEventListener('blur', () => { const sp = this.selSpecies(); if (sp) { sp.common = $('#insp-common').textContent.trim() || sp.common; this.toast('Nome popular atualizado.'); } });
    $('#insp-common').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
  }

  setTool(t) {
    if (t === 'atlas') { this.openAtlas(); return; }
    this.tool = t;
    $$('#rail button').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    if (t !== 'seed' && t !== 'events' && this.pending) this.cancelPending();
    if (t === 'observe') { this.closeDrawer(); return; }
    this.openDrawer(t);
  }
  openDrawer(t) {
    const d = $('#drawer'), body = $('#drawer-body');
    const titles = { seed: 'Semear vida', sculpt: 'Esculpir relevo', events: 'Eventos', vault: 'Cofre da Vida', planet: 'Planeta', chronicle: 'Crônica' };
    $('#drawer-title').textContent = titles[t];
    body.innerHTML = '';
    this.drawerTool = t; document.body.classList.add('drawer-open');
    body.append(...this['drawer_' + t]());
    if (!d.classList.contains('open')) this.sfx('panel', { open: true });
    d.classList.add('open');
  }
  refreshDrawer() { if ($('#drawer').classList.contains('open') && ['vault', 'chronicle', 'seed'].includes(this.drawerTool) && !this._creating) this.openDrawer(this.drawerTool); }
  closeDrawer() { $('#drawer').classList.remove('open'); document.body.classList.remove('drawer-open'); this.drawerTool = null; $$('#rail button').forEach((b) => b.classList.toggle('on', b.dataset.tool === 'observe')); if (this.tool !== 'observe') this.tool = 'observe'; this._creating = false; }

  slider(label, min, max, step, val, fmt, oninput, onchange) {
    const out = h('span', {}, fmt(val));
    const inp = h('input', { type: 'range', min, max, step, value: val });
    let lastTick = 0;
    inp.addEventListener('input', () => { out.textContent = fmt(+inp.value); oninput?.(+inp.value); const n = performance.now(); if (n - lastTick > 70) { lastTick = n; this.sfx('hover'); } });
    if (onchange) inp.addEventListener('change', () => onchange(+inp.value));
    return h('div', { class: 'field' }, h('div', { class: 'top' }, h('span', {}, label), out), inp);
  }
  seg(options, value, onpick) {
    const s = h('div', { class: 'seg' });
    for (const [k, label] of options) {
      const b = h('button', { class: k === value ? 'on' : '', onclick: () => { [...s.children].forEach((x) => x.classList.toggle('on', x === b)); onpick(k); this.sfx('ui'); } }, label);
      s.append(b);
    }
    return s;
  }

  // ----- Semear -----
  drawer_seed() {
    const out = [];
    if (this._creating) return this.creatorUI();
    out.push(h('p', { class: 'hint' }, 'Crie um organismo do zero a partir de uma forma-base mínima, reintroduza uma criatura do Cofre ou clone a espécie selecionada.'));
    const choices = h('div', { class: 'choices' });
    for (const k of Object.keys(KINDS)) {
      const cv = h('canvas', { width: 180, height: 88 });
      choices.append(h('button', { class: 'choice', onclick: () => { this.openCreator(k); this.sfx('ui'); } }, cv, h('b', {}, KINDS[k].label)));
      this.paintKindIcon(cv, k);
    }
    out.push(h('div', { class: 'label' }, 'Criar do zero'), choices);
    out.push(h('button', { class: 'btn', onclick: () => this.primordialSoup() }, 'Sopa primordial nas fontes termais'));
    const sp = this.selSpecies();
    if (sp && sp.pop >= 0) {
      out.push(h('div', { class: 'label' }, 'Espécie selecionada'));
      out.push(h('button', { class: 'item', onclick: () => { this.setPending({ type: 'seed', genome: sp.mean, count: 12, speciesId: sp.id, origin: 'reintrodução' }, `Clique para soltar 12 ${sp.common}`); } }, h('span', { class: 't' }, this.world.binomial(sp)), h('span', { class: 's' }, `${sp.common} · soltar 12 indivíduos`)));
    }
    if (this.vault.length) {
      out.push(h('div', { class: 'label' }, 'Do Cofre da Vida'));
      const l = h('div', { class: 'list' });
      for (const v of this.vault.slice(0, 8)) l.append(h('button', { class: 'item', onclick: () => this.seedFromVault(v) }, h('span', { class: 't' }, `${v.genus} ${v.epithet}`), h('span', { class: 's' }, `${v.common} · de ${v.planet}`)));
      out.push(l);
    }
    return out;
  }

  openCreator(kind) {
    this._creating = true;
    const p = this.planet, rng = new RNG((Math.random() * 1e9) | 0);
    const g = presetGenome(kind, p);
    const taken = this.world.genusNames;
    const genus = makeGenusName(g, rng, taken);
    this.creator = { kind, g, genus, epithet: makeEpithet(genus, g, rng, { first: !this.world.species.length }), common: makeCommonName(g, rng, {}), count: 16 };
    if (this.drawerTool !== 'seed') { this.tool = 'seed'; $$('#rail button').forEach((b) => b.classList.toggle('on', b.dataset.tool === 'seed')); }
    this.openDrawer('seed');
  }
  creatorUI() {
    const c = this.creator, g = c.g, out = [];
    const cv = h('canvas', { width: 300, height: 120, style: 'width:100%;height:96px;background:#0b0f12;border:1px solid var(--line)' });
    const repaint = () => { const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, 300, 120); const col = speciesColor(g, this.planet.star); drawGlyph(ctx, kindOf(g), 150, 60, 30, -0.3, `rgb(${col[0] * 255 | 0},${col[1] * 255 | 0},${col[2] * 255 | 0})`, g, 0, 2, performance.now() / 1000); };
    const regen = () => { const rng = new RNG((Math.random() * 1e9) | 0); c.genus = makeGenusName(g, rng, this.world.genusNames); c.epithet = makeEpithet(c.genus, g, rng, {}); c.common = makeCommonName(g, rng, {}); gi.value = c.genus; ei.value = c.epithet; ci.value = c.common; this.sfx('ui'); };
    const gi = h('input', { type: 'text', value: c.genus, oninput: (e) => c.genus = e.target.value.trim() });
    const ei = h('input', { type: 'text', value: c.epithet, oninput: (e) => c.epithet = e.target.value.trim() });
    const ci = h('input', { type: 'text', value: c.common, oninput: (e) => c.common = e.target.value.trim() });
    out.push(h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { class: 'label' }, `Forma-base: ${KINDS[c.kind].label}`), h('button', { class: 'btn small', onclick: () => { this._creating = false; this.openDrawer('seed'); } }, 'Trocar')));
    out.push(cv);
    out.push(h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('span', { class: 'label' }, 'Gênero'), gi), h('div', { class: 'field' }, h('span', { class: 'label' }, 'Epíteto'), ei)));
    out.push(h('div', { class: 'field' }, h('span', { class: 'label' }, 'Nome popular'), ci));
    out.push(h('button', { class: 'btn small', onclick: regen }, 'Gerar outros nomes'));
    out.push(this.slider('Temperatura ideal', 0, 1, 0.01, g[G.topt], (v) => `${tempOpt(v).toFixed(0)} °C`, (v) => { g[G.topt] = v; }));
    out.push(this.slider('Habitat', 0, 1, 0.01, g[G.terra], (v) => v < 0.35 ? 'aquático' : v < 0.6 ? 'anfíbio' : 'terrestre', (v) => { g[G.terra] = v; }));
    out.push(this.slider('Pigmento', 0, 1, 0.01, g[G.hue], (v) => `${Math.round(v * 360)}°`, (v) => { g[G.hue] = v; repaint(); }));
    out.push(this.slider('Tamanho', 0, 0.3, 0.005, g[G.size], (v) => fmtSize(sizeMeters(v)), (v) => { g[G.size] = v; repaint(); }));
    out.push(this.slider('Taxa de mutação', 0, 1, 0.01, g[G.mut], (v) => v < 0.3 ? 'baixa' : v < 0.65 ? 'média' : 'alta', (v) => { g[G.mut] = v; }));
    out.push(this.slider('Indivíduos', 4, 60, 1, c.count, (v) => `${v}`, (v) => { c.count = v; }));
    const adv = h('details', { class: 'genes' }, h('summary', { class: 'label' }, 'Todos os genes'));
    for (let k = 0; k < NG; k++) adv.append(this.geneRow(k, g[k], (v) => { g[k] = v; repaint(); }));
    out.push(adv);
    out.push(h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => this.pendingSeedFromCreator() }, 'Escolher local no mapa'), h('button', { class: 'btn', onclick: () => this.saveToVault({ genus: c.genus, epithet: c.epithet, common: c.common, genome: [...g] }) }, 'Guardar no Cofre')));
    requestAnimationFrame(repaint);
    return out;
  }
  pendingSeedFromCreator() {
    const c = this.creator;
    this.setPending({ type: 'seed', genome: cloneG(c.g), count: c.count, genus: c.genus, epithet: c.epithet, common: c.common, origin: 'criação', keep: false }, `Clique no mapa para soltar ${c.count} ${c.common}`);
  }
  primordialSoup() {
    const w = this.world, vents = [...w.vents].sort(() => Math.random() - 0.5).slice(0, 3);
    const g = presetGenome('micro', this.planet);
    let sid = -1;
    for (const v of vents) {
      if (sid < 0) sid = w.seed(cloneG(g), v.x, v.y, 14, { origin: 'abiogênese' });
      else w.seed(cloneG(g), v.x, v.y, 14, { speciesId: sid });
      this.map.fx.push({ kind: 'ring', u: v.x, v: v.y, r: 0.01, t: 0, life: 1.5, color: '163,194,144' });
    }
    this.sfx('seed'); this.painter.compose(); this.refreshDrawer();
  }

  // ----- Esculpir -----
  drawer_sculpt() {
    const b = this.brush, out = [];
    out.push(h('p', { class: 'hint' }, 'Arraste sobre o mapa 2D para erguer montanhas, abrir bacias ou criar fontes hidrotermais. Na vista 3D, o relevo aparece ao soltar.'));
    out.push(this.seg([['raise', 'Elevar'], ['lower', 'Rebaixar'], ['vent', 'Fonte termal']], b.mode, (m) => b.mode = m));
    out.push(this.slider('Raio do pincel', 0.01, 0.12, 0.002, b.r, (v) => `${Math.round(v * 40000)} km`, (v) => b.r = v));
    out.push(this.slider('Intensidade', 0.1, 1, 0.01, b.strength, (v) => `${Math.round(v * 100)}%`, (v) => b.strength = v));
    out.push(this.slider('Nível dos oceanos', 0.05, 0.97, 0.01, this.planet.water, (v) => `${Math.round(v * 100)}% da superfície`, null, (v) => {
      this.planet.water = v; this.world.sea = seaLevelFor(this.world.elevHi, v); this.world.elevVersion++; this.world.rebuildGrid(); this.world.updateClimate(); this.painter.compose(); this.sfx('sculpt');
    }));
    if (this.view !== '2d') out.push(h('button', { class: 'btn', onclick: () => this.setView('2d') }, 'Ir para o mapa 2D'));
    return out;
  }

  // ----- Eventos -----
  drawer_events() {
    const out = [h('p', { class: 'hint' }, 'Catástrofes moldam a evolução: abrem nichos e eliminam linhagens inteiras. Os eventos com alvo pedem um clique no mapa.')];
    const l = h('div', { class: 'list' });
    let impactR = 0.05;
    for (const [k, ev] of Object.entries(EVENT_TYPES)) {
      if (k === 'custom') continue;
      const extra = k === 'impact' ? this.slider('Diâmetro do asteroide', 0.015, 0.14, 0.005, impactR, (v) => `${Math.round(v * 400)} km`, (v) => impactR = v) : null;
      const item = h('div', { class: 'item' }, h('b', {}, ev.name), h('span', { class: 's' }, ev.desc), extra,
        h('div', { class: 'row', style: 'margin-top:6px' }, h('button', { class: 'btn small danger', onclick: () => {
          if (ev.needsTarget) this.setPending({ type: 'event', ev: k, opts: { radius: impactR }, radius: k === 'impact' ? impactR * 1.6 : 0.12 }, `Clique no alvo: ${ev.name}`);
          else this.fireEvent(k, {});
        } }, ev.needsTarget ? 'Escolher alvo' : 'Desencadear')));
      l.append(item);
    }
    out.push(l);
    // personalizado
    const c = { dT: -8, ash: 0.2, kill: 0.4, target: 'todos', duration: 150, regional: false, radius: 0.15 };
    const tg = h('select', { onchange: (e) => c.target = e.target.value }, ...['todos', 'terrestres', 'aquáticos', 'grandes', 'pequenos', 'produtores', 'consumidores'].map((t) => h('option', { value: t }, t)));
    out.push(h('div', { class: 'label', style: 'margin-top:4px' }, 'Evento personalizado'));
    out.push(this.slider('Variação de temperatura', -35, 35, 1, c.dT, (v) => `${v > 0 ? '+' : ''}${v} °C`, (v) => c.dT = v));
    out.push(this.slider('Escurecimento do céu', 0, 0.9, 0.01, c.ash, (v) => `${Math.round(v * 100)}%`, (v) => c.ash = v));
    out.push(this.slider('Letalidade imediata', 0, 1, 0.01, c.kill, (v) => `${Math.round(v * 100)}%`, (v) => c.kill = v));
    out.push(this.slider('Duração', 20, 500, 10, c.duration, (v) => `${v} passos`, (v) => c.duration = v));
    out.push(h('div', { class: 'field' }, h('span', { class: 'label' }, 'Alvo'), tg));
    out.push(this.seg([['global', 'Global'], ['regional', 'Regional']], 'global', (m) => c.regional = m === 'regional'));
    out.push(h('button', { class: 'btn danger', onclick: () => {
      const opts = { dT: c.dT, ash: c.ash, kill: c.kill, target: c.target, duration: c.duration };
      if (c.regional) this.setPending({ type: 'event', ev: 'custom', opts: { ...opts, radius: c.radius }, radius: c.radius * 3 }, 'Clique na região do evento');
      else this.fireEvent('custom', opts);
    } }, 'Desencadear evento'));
    return out;
  }

  // ----- Cofre -----
  saveToVault(e) {
    const entry = { id: Date.now() + '' + Math.floor(Math.random() * 999), genus: e.genus, epithet: e.epithet, common: e.common, genome: e.genome.map((x) => +x.toFixed(4)), planet: this.planet.name, savedAt: fmtYears(this.world.years) };
    this.vault.unshift(entry); LS.set('tp.vault', this.vault);
    this.sfx('vault'); this.toast(`${e.genus} ${e.epithet} guardada no Cofre da Vida.`);
    this.refreshDrawer();
  }
  seedFromVault(v) {
    const g = Float32Array.from(v.genome);
    this.setPending({ type: 'seed', genome: g, count: 14, genus: v.genus, epithet: v.epithet, common: v.common, origin: 'Cofre da Vida' }, `Clique para soltar ${v.common}`);
    this.sfx('ui');
  }
  drawer_vault() {
    const out = [h('p', { class: 'hint' }, 'Criaturas guardadas ficam disponíveis em qualquer planeta, mesmo depois de recarregar a página. Selecione um organismo e use Guardar no Cofre.')];
    if (!this.vault.length) { out.push(h('p', { class: 'hint', style: 'color:var(--faint)' }, 'O cofre está vazio.')); return out; }
    const l = h('div', { class: 'list' });
    for (const v of this.vault) {
      const g = Float32Array.from(v.genome), col = speciesColor(g, this.planet.star);
      const cv = h('canvas', { width: 80, height: 60, style: 'width:56px;height:42px;float:right' });
      const delBtn = h('button', { class: 'btn small danger' }, 'Excluir');
      delBtn.onclick = () => {
        if (delBtn.dataset.armed) { this.vault = this.vault.filter((x) => x.id !== v.id); LS.set('tp.vault', this.vault); this.openDrawer('vault'); this.sfx('ui', { pitch: 0.7 }); }
        else { delBtn.dataset.armed = 1; delBtn.textContent = 'Confirmar exclusão'; }
      };
      l.append(h('div', { class: 'item' }, cv, h('span', { class: 't' }, `${v.genus} ${v.epithet}`), h('span', { class: 's' }, `${v.common} · ${KINDS[kindOf(g)].label} · guardada em ${v.planet}, ${v.savedAt}`),
        h('div', { class: 'row', style: 'margin-top:6px' }, h('button', { class: 'btn small', onclick: () => this.seedFromVault(v) }, 'Semear'), delBtn)));
      requestAnimationFrame(() => drawGlyph(cv.getContext('2d'), kindOf(g), 40, 30, 14, -0.3, `rgb(${col[0] * 255 | 0},${col[1] * 255 | 0},${col[2] * 255 | 0})`, g, 0, 2, 0));
    }
    out.push(l);
    return out;
  }

  // ----- Planeta -----
  drawer_planet() {
    const p = this.planet, w = this.world, out = [];
    const facts = h('div', { class: 'pfacts' });
    const refreshFacts = () => {
      derive(p);
      facts.innerHTML = '';
      for (const [k, v] of [['Temp. média', `${p.baseTemp.toFixed(1)} °C`], ['Gravidade', `${p.gravity.toFixed(2)} g`], ['Ano', `${Math.round(p.yearDays)} dias`], ['Maré', `${p.tide.toFixed(2)}× Terra`]]) facts.append(h('div', {}, h('span', { class: 'label' }, k), h('b', {}, v)));
      if (!this.started) this.renderGenesis();
      $('#p-name').textContent = p.name;
    };
    const apply = (heavy) => { w.setPlanet(p, true); w.updateClimate(); refreshFacts(); if (heavy) this.painter.compose(); this.audio.setPlanet({ star: p.star, temp: p.baseTemp, water: p.water, atmosphere: p.atmosphere, tide: p.tide }); };
    const nameIn = h('input', { type: 'text', value: p.name, onchange: (e) => { p.name = e.target.value.trim() || p.name; refreshFacts(); } });
    out.push(h('div', { class: 'field' }, h('span', { class: 'label' }, 'Nome'), h('div', { class: 'row', style: 'flex-wrap:nowrap' }, nameIn, h('button', { class: 'btn small', onclick: () => { Object.assign(p, planetName(p, new RNG((Math.random() * 1e9) | 0))); nameIn.value = p.name; refreshFacts(); this.sfx('ui'); } }, 'Sortear'))));
    out.push(facts);
    out.push(h('div', { class: 'label' }, 'Estrela'));
    out.push(this.seg(Object.keys(STARS).map((k) => [k, k]), p.star, (k) => { p.star = k; apply(true); for (const sp of w.species) sp.color = speciesColor(sp.mean, k); }));
    out.push(this.slider('Distância orbital', 0.05, 3, 0.005, p.orbit, (v) => `${v.toFixed(3)} UA`, (v) => { p.orbit = v; refreshFacts(); }, () => apply(false)));
    out.push(this.slider('Atmosfera', 0.05, 5, 0.01, p.atmosphere, (v) => `${v.toFixed(2)} bar`, (v) => { p.atmosphere = v; refreshFacts(); }, () => apply(false)));
    out.push(this.slider('Oceanos', 0.05, 0.97, 0.01, p.water, (v) => `${Math.round(v * 100)}%`, null, (v) => { p.water = v; apply(true); }));
    out.push(this.slider('Inclinação axial', 0, 80, 0.5, p.tilt, (v) => `${v.toFixed(1)}°`, (v) => { p.tilt = v; }, () => apply(false)));
    out.push(this.slider('Duração do dia', 4, 200, 0.5, p.dayHours, (v) => `${v.toFixed(1)} h`, (v) => { p.dayHours = v; }, () => apply(false)));
    out.push(this.slider('Raio', 0.3, 2.5, 0.01, p.radius, (v) => `${v.toFixed(2)} R⊕`, (v) => { p.mass = +(p.mass * Math.pow(v / p.radius, 3)).toFixed(3); p.radius = v; refreshFacts(); }, () => apply(false)));
    out.push(this.slider('Vulcanismo', 0, 1, 0.01, p.volcanism, (v) => `${Math.round(v * 100)}%`, (v) => { p.volcanism = v; }, () => { w.vents = generateVents(p, w.elevHi); w.elevVersion++; apply(true); }));
    // luas
    out.push(h('div', { class: 'label', style: 'margin-top:4px' }, `Luas (${p.moons.length})`));
    const moons = h('div', { class: 'list' });
    p.moons.forEach((m, j) => {
      moons.append(h('div', { class: 'item' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', {}, m.name), h('button', { class: 'btn small danger', onclick: () => { p.moons.splice(j, 1); apply(false); this.openDrawer('planet'); } }, 'Remover')),
        this.slider('Tamanho', 0.05, 3, 0.01, m.size, (v) => `${v.toFixed(2)}× a Lua`, (v) => m.size = v, () => apply(false)),
        this.slider('Distância', 8, 200, 1, m.dist, (v) => `${v} raios`, (v) => m.dist = v, () => apply(false))));
    });
    out.push(moons);
    out.push(h('button', { class: 'btn', onclick: () => { if (p.moons.length >= 6) return this.sfx('deny'); p.moons.push(newMoon(new RNG((Math.random() * 1e9) | 0), p.moons.length)); apply(false); this.openDrawer('planet'); } }, 'Adicionar lua'));
    out.push(h('div', { class: 'label', style: 'margin-top:4px' }, 'Relevo'));
    out.push(this.slider('Continentes', 1, 9, 1, p.continents, (v) => `${v}`, (v) => p.continents = v));
    out.push(this.slider('Rugosidade', 0.1, 1, 0.01, p.roughness, (v) => `${Math.round(v * 100)}%`, (v) => p.roughness = v));
    out.push(h('button', { class: 'btn', onclick: () => { p.seed = (Math.random() * 1e9) | 0; w.elevHi = generateTerrain(p); w.vents = generateVents(p, w.elevHi); w.elevVersion++; apply(true); this.sfx('sculpt'); } }, 'Gerar novo relevo'));
    if (!this.started) out.push(h('button', { class: 'btn primary', onclick: () => { this.closeDrawer(); } }, 'Pronto'));
    refreshFacts();
    return out;
  }

  // ----- Crônica -----
  drawer_chronicle() {
    const out = [];
    const log = this.world.log;
    if (!log.length) return [h('p', { class: 'hint' }, 'Nada aconteceu ainda.')];
    const l = h('div', { class: 'list' });
    for (const e of [...log].reverse().slice(0, 200)) {
      const col = { extinção: 'var(--rust)', clado: 'var(--lichen)', marco: 'var(--ice)', evento: 'var(--amber)' }[e.kind] || 'var(--dim)';
      l.append(h('button', { class: 'item', style: `border-left:2px solid ${col}`, onclick: () => { if (e.ref != null) this.selectSpecies(e.ref); } }, h('span', { class: 'label' }, fmtYears(e.years)), h('span', { style: 'font-size:13px' }, e.text)));
    }
    out.push(l);
    return out;
  }

  // ---------- Seleção / inspetor ----------
  selSpecies() { return this.sel ? this.world.species[this.sel.sp] : null; }
  selectAgent(i) {
    const w = this.world;
    this.sel = { type: 'agent', i, aid: w.aid[i], sp: w.asp[i] };
    this.map.selected = i; this.sfx('select');
    this.openInspector();
  }
  selectSpecies(sid) {
    const w = this.world;
    let i = -1; for (let k = 0; k < MAX; k++) if (w.alive[k] && w.asp[k] === sid) { i = k; break; }
    if (i >= 0) { this.selectAgent(i); this.sel.focusSpecies = true; }
    else { this.sel = { type: 'species', sp: sid }; this.map.selected = -1; this.sfx('select'); this.openInspector(); }
  }
  deselect() { this.sel = null; this.map.selected = -1; this.follow = false; this.filterSpecies = -1; $('#inspector').classList.remove('open'); document.body.classList.remove('insp-open'); this.sfx('panel', { open: false }); }

  openInspector() {
    $('#inspector').classList.add('open'); document.body.classList.add('insp-open');
    this.refreshInspector(true);
  }

  refreshInspector(full) {
    if (!this.sel) return;
    const w = this.world, sel = this.sel;
    if (sel.type === 'agent' && (!w.alive[sel.i] || w.aid[sel.i] !== sel.aid)) {
      const ni = w.findById(sel.aid);
      if (ni >= 0) sel.i = ni; else { this.sel = { type: 'species', sp: sel.sp, died: true }; this.map.selected = -1; full = true; }
    }
    const sp = w.species[this.sel.sp];
    if (!sp) { this.deselect(); return; }
    const isAgent = this.sel.type === 'agent';
    const g = isAgent ? w.genomeOf(this.sel.i) : sp.mean;
    if (!full) { this.updateInspectorLive(sp, g); return; }
    $('#insp-kind').textContent = isAgent ? `Indivíduo nº ${w.aid[this.sel.i]}` : (this.sel.died ? 'Espécie · o indivíduo morreu' : 'Espécie');
    if (document.activeElement !== $('#insp-name')) $('#insp-name').textContent = w.binomial(sp);
    if (document.activeElement !== $('#insp-common')) $('#insp-common').textContent = sp.common;
    const body = $('#insp-body'); body.innerHTML = '';
    if (!this.specimen) this.specimen = new Specimen();
    body.append(this.specimen.canvas);
    this.specimen.show(g, sp.color, sp.id * 7 + 1);
    this.specimenKey = sp.id + ':' + kindOf(g);
    // estado vivo
    this.liveBox = h('div', { class: 'kv' });
    body.append(this.liveBox);
    this.updateInspectorLive(sp, g);
    // ações
    const followB = h('button', { class: 'btn small' + (this.follow ? ' primary' : ''), onclick: () => { this.follow = !this.follow; followB.classList.toggle('primary', this.follow); this.sfx('ui'); } }, 'Seguir');
    const filtB = h('button', { class: 'btn small' + (this.filterSpecies === sp.id ? ' primary' : ''), onclick: () => { this.filterSpecies = this.filterSpecies === sp.id ? -1 : sp.id; filtB.classList.toggle('primary', this.filterSpecies === sp.id); this.sfx('ui'); } }, 'Só esta espécie');
    body.append(h('div', { class: 'row' },
      isAgent ? followB : null, filtB,
      h('button', { class: 'btn small', onclick: () => this.saveToVault({ genus: w.genera[sp.genus].name, epithet: sp.epithet, common: sp.common, genome: [...g] }) }, 'Guardar no Cofre'),
      h('button', { class: 'btn small', onclick: () => { this.openAtlas(sp.id); } }, 'Linhagem'),
      isAgent ? h('button', { class: 'btn small', onclick: () => { const i = this.sel.i; for (let k = 0; k < 6; k++) w.spawn(cloneG(w.genomeOf(i)), w.ax[i] + Math.random() * 2 - 1, w.ay[i] + Math.random() * 2 - 1, w.asp[i], 0.7); this.sfx('seed'); } }, 'Clonar ×6') : null,
      isAgent ? h('button', { class: 'btn small danger', onclick: () => { w.kill(this.sel.i); this.sfx('ui', { pitch: 0.6 }); this.refreshInspector(true); } }, 'Remover') : null,
    ));
    // taxonomia
    const gen = w.genera[sp.genus];
    const ht = higherTaxa(gen.name, sp.kind);
    const dl = h('dl', { class: 'taxa' });
    const editable = (val, onset) => { const dd = h('dd', { contenteditable: 'true', spellcheck: 'false' }, val); dd.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); dd.blur(); } }); dd.addEventListener('blur', () => { const t = dd.textContent.trim(); if (t && t !== val) { onset(t); this.toast('Nome atualizado.'); this.refreshInspector(true); } }); return dd; };
    const kingdom = this.kingdomNames[sp.kind] || KINDS[sp.kind].kingdom;
    dl.append(h('dt', {}, 'Reino'), editable(kingdom, (t) => this.kingdomNames[sp.kind] = t));
    const cls = sp.clades.map((cid) => w.clades[cid]).filter(Boolean);
    if (cls.length) {
      const dd = h('dd', { style: 'line-height:1.5' });
      cls.forEach((cl, k) => {
        const sEl = h('span', { contenteditable: 'true', spellcheck: 'false', title: `${INNOV.find((d) => d.key === cl.innov)?.name} · surgiu em ${fmtYears(cl.born)}` }, cl.name);
        sEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sEl.blur(); } });
        sEl.addEventListener('blur', () => { const t = sEl.textContent.trim(); if (t && t !== cl.name) { cl.name = t; this.toast('Clado renomeado.'); } });
        dd.append(sEl); if (k < cls.length - 1) dd.append(h('span', { style: 'color:var(--faint)' }, ' › '));
      });
      dl.append(h('dt', {}, 'Clados'), dd);
    }
    dl.append(h('dt', {}, 'Ordem'), editable(gen.order || ht.order, (t) => gen.order = t));
    dl.append(h('dt', {}, 'Família'), editable(gen.family || ht.family, (t) => gen.family = t));
    dl.append(h('dt', {}, 'Gênero'), editable(gen.name, (t) => { w.genusNames.delete(gen.name); gen.name = t; w.genusNames.add(t); }));
    dl.append(h('dt', {}, 'Espécie'), editable(sp.epithet, (t) => sp.epithet = t));
    body.append(h('div', { class: 'label' }, 'Classificação'), dl);
    // inovações
    const chips = h('div', { class: 'chips' });
    const inv = innovationsOf(g);
    for (const d of INNOV) {
      const on = inv.includes(d.key);
      chips.append(h('button', { class: 'chip' + (on ? ' on' : ''), title: on ? 'Clique para remover' : 'Clique para adicionar', onclick: () => { const ng = cloneG(g); ng[d.gene] = on ? d.th - 0.12 : Math.min(1, d.th + 0.1); if (!on && d.key === 'limbs') ng[G.multi] = Math.max(ng[G.multi], 0.5); if (!on && d.key === 'giant') ng[G.multi] = Math.max(ng[G.multi], 0.6); this.applyGenome(ng, [d.gene, G.multi]); this.sfx(on ? 'ui' : 'innovation'); this.refreshInspector(true); } }, d.name));
    }
    body.append(h('div', { class: 'label' }, isAgent ? 'Traços (clique para adicionar ou remover)' : 'Traços da espécie'), chips);
    // genes
    const groups = [['Metabolismo', ['photo', 'chemo', 'pred', 'sapro']], ['Corpo', ['size', 'multi', 'motil', 'sense', 'armor', 'limbs', 'branch', 'symm', 'toxin']], ['Ambiente', ['topt', 'ttol', 'terra']], ['Reprodução e aparência', ['fecund', 'mut', 'hue', 'pattern', 'xeno']]];
    for (const [title, keys] of groups) {
      const d = h('details', { class: 'genes' }, h('summary', { class: 'label' }, title));
      for (const k of keys) { const gi = G[k]; d.append(this.geneRow(gi, g[gi], (v) => { const ng = cloneG(g); ng[gi] = v; this.applyGenome(ng, [gi], true); })); }
      body.append(d);
    }
    if (isAgent) body.append(h('button', { class: 'btn small', onclick: () => { const all = [...Array(NG).keys()]; w.applyToSpecies(sp.id, w.genomeOf(this.sel.i), all); this.toast('Genoma aplicado a toda a espécie.'); this.sfx('innovation'); this.refreshInspector(true); } }, 'Aplicar este genoma à espécie inteira'));
    body.append(h('p', { class: 'hint' }, isAgent ? 'Mudanças nos genes valem para este indivíduo e são herdadas pelos descendentes.' : 'Mudanças valem para todos os membros vivos da espécie.'));
  }
  geneRow(k, val, onchange) {
    const out = h('span', {}, (val * 100).toFixed(0));
    const inp = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: val });
    inp.oninput = () => { out.textContent = (inp.value * 100).toFixed(0); };
    inp.onchange = () => { onchange(+inp.value); this.sfx('ui'); };
    return h('div', { class: 'gene', title: GENES[k].hint }, h('span', {}, GENES[k].label), inp, out);
  }
  applyGenome(ng, keys, quiet) {
    const w = this.world, sel = this.sel;
    if (sel.type === 'agent') { w.setGenome(sel.i, ng); const sp = w.species[sel.sp]; w.checkInnovations(sp); }
    else w.applyToSpecies(sel.sp, ng, keys);
    const g = sel.type === 'agent' ? w.genomeOf(sel.i) : w.species[sel.sp].mean;
    const key = sel.sp + ':' + kindOf(g);
    if (quiet && key === this.specimenKey) { this.specimen.show(g, speciesColor(g, this.planet.star), sel.sp * 7 + 1); return; }
    if (quiet) this.refreshInspector(true);
  }
  updateInspectorLive(sp, g) {
    const w = this.world, box = this.liveBox; if (!box) return;
    const ph = phenotype(g);
    const isAgent = this.sel.type === 'agent';
    const i = this.sel.i;
    const c = isAgent ? w.cellOf(i) : -1;
    const diet = [['Luz', ph.ePhoto], ['Química', ph.eChemo], ['Presas', ph.ePred], ['Detritos', ph.eSapro]].sort((a, b) => b[1] - a[1]).filter((x) => x[1] > 0.02).map((x) => x[0]).slice(0, 2).join(' + ') || 'quase nada';
    const rows = [
      ['Tamanho', fmtSize(sizeMeters(g[G.size]))], ['Forma', KINDS[kindOf(g)].label],
      ['Alimenta-se de', diet], ['Temp. ideal', `${ph.topt.toFixed(0)} °C ±${(ph.ttol / 2).toFixed(0)}`],
      ['População', fmtInt(sp.pop)], ['Pico', fmtInt(sp.peak)],
      ['Surgiu em', fmtYears(sp.born)], [sp.extinct != null ? 'Extinta em' : 'Estado', sp.extinct != null ? fmtYears(sp.extinct) : 'viva'],
    ];
    if (isAgent) {
      const lat = (0.5 - w.ay[i] / GH) * 180, lon = w.ax[i] / GW * 360 - 180;
      rows.unshift(['Energia', `${Math.round(clamp(w.aen[i]) * 100)}%`], ['Idade', `${Math.round(w.aage[i] / ph.lifespan * 100)}% da vida`]);
      rows.push(['Local', `${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(0)}°${lon >= 0 ? 'L' : 'O'}`], ['Ambiente', `${w.land[c] ? 'terra' : w.depth[c] > 0.5 ? 'mar profundo' : 'mar raso'} · ${w.temp[c].toFixed(0)} °C`]);
    }
    box.innerHTML = '';
    for (const [k, v] of rows) box.append(h('div', {}, h('span', { class: 'label' }, k), h('b', {}, v)));
  }
  renameFromHeader() {
    const sp = this.selSpecies(); if (!sp) return;
    const t = $('#insp-name').textContent.trim().split(/\s+/);
    if (t.length >= 2) { const gen = this.world.genera[sp.genus]; gen.name = t[0][0].toUpperCase() + t[0].slice(1); sp.epithet = t.slice(1).join(' ').toLowerCase(); this.toast('Nome científico atualizado.'); }
    $('#insp-name').textContent = this.world.binomial(sp);
  }

  // ---------- Atlas filogenético ----------
  openAtlas(focus) {
    $('#atlas').hidden = false; this.sfx('panel', { open: true });
    this.atlasFilter = this.atlasFilter || 'living';
    if (focus != null) this.atlasSel = focus;
    this.renderAtlas();
  }
  closeAtlas() { $('#atlas').hidden = true; this.sfx('panel', { open: false }); }
  atlasRows() {
    const w = this.world, f = this.atlasFilter, q = $('#atlas-search').value.trim().toLowerCase();
    const sp = w.species;
    const keep = new Uint8Array(sp.length);
    const minor = (s) => s.peak < 6;
    for (const s of sp) {
      let ok = f === 'all' ? !minor(s) : f === 'living' ? s.pop > 0 : s.peak >= 40;
      if (q && !(w.binomial(s).toLowerCase().includes(q) || s.common.toLowerCase().includes(q))) ok = false;
      if (ok) { let a = s.id; while (a >= 0 && !keep[a]) { keep[a] = 1; a = sp[a].parent; } }
    }
    const kids = new Map();
    for (const s of sp) if (keep[s.id]) { const p = s.parent; if (!kids.has(p)) kids.set(p, []); kids.get(p).push(s.id); }
    const order = [];
    const walk = (id, depth, prefix, last) => {
      order.push({ id, depth, prefix: depth ? prefix + (last ? '└ ' : '├ ') : '' });
      const ch = kids.get(id) || [];
      ch.forEach((c, k) => walk(c, depth + 1, depth ? prefix + (last ? '  ' : '│ ') : '', k === ch.length - 1));
    };
    (kids.get(-1) || []).forEach((r) => walk(r, 0, '', true));
    return order;
  }
  renderAtlas() {
    const w = this.world, rows = this.atlasRows();
    $('#atlas-count').textContent = `${rows.length} espécies no recorte · ${w.species.length} já existiram`;
    // árvore (tempo × linhagem)
    const wrap = $('#tree-wrap'), cv = $('#tree');
    const W = Math.max(300, wrap.clientWidth - 2), rowH = 14, H = Math.max(wrap.clientHeight - 2, rows.length * rowH + 30);
    const dpr = devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const t1 = Math.max(1e-9, w.years), x = (y) => 14 + (y / t1) * (W - 28);
    const yOf = new Map(); rows.forEach((r, k) => yOf.set(r.id, 20 + k * rowH));
    ctx.font = '10px "IBM Plex Mono", monospace'; ctx.fillStyle = '#5b645c';
    for (let k = 0; k <= 4; k++) { const yy = t1 * k / 4; ctx.fillText(fmtYears(yy), Math.min(W - 70, x(yy)), 11); ctx.fillRect(x(yy), 14, 1, H); }
    for (const r of rows) {
      const s = w.species[r.id], y = yOf.get(r.id);
      const col = `rgb(${s.color[0] * 255 | 0},${s.color[1] * 255 | 0},${s.color[2] * 255 | 0})`;
      const xe = x(s.extinct ?? w.years);
      if (s.parent >= 0 && yOf.has(s.parent)) { ctx.strokeStyle = 'rgba(214,222,204,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x(s.born), yOf.get(s.parent)); ctx.lineTo(x(s.born), y); ctx.stroke(); }
      ctx.strokeStyle = col; ctx.lineWidth = r.id === this.atlasSel ? 4 : s.pop > 0 ? 2.2 : 1.2; ctx.globalAlpha = s.pop > 0 ? 1 : 0.55;
      ctx.beginPath(); ctx.moveTo(x(s.born), y); ctx.lineTo(Math.max(xe, x(s.born) + 1.5), y); ctx.stroke(); ctx.globalAlpha = 1;
      if (s.extinct != null) { ctx.fillStyle = '#cf6a4c'; ctx.fillRect(xe - 1, y - 3, 2, 6); } else { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(xe, y, 3, 0, 6.283); ctx.fill(); }
    }
    cv.onclick = (e) => { const r = cv.getBoundingClientRect(); const k = Math.round((e.clientY - r.top - 20) / rowH); if (rows[k]) { this.atlasSel = rows[k].id; this.renderAtlas(); this.sfx('select'); } };
    // tabela
    const tw = $('#table-wrap'); tw.innerHTML = '';
    if (this.atlasSel != null && w.species[this.atlasSel]) tw.append(this.lineageTable(this.atlasSel));
    const t = h('table', { class: 'sp' });
    t.append(h('tr', {}, ...['Espécie', 'Nome popular', 'Forma', 'Surgiu', 'Estado', 'Pop.', 'Pico', 'Inovações'].map((x) => h('th', {}, x))));
    for (const r of rows.slice(0, 600)) {
      const s = w.species[r.id];
      const col = `rgb(${s.color[0] * 255 | 0},${s.color[1] * 255 | 0},${s.color[2] * 255 | 0})`;
      const tr = h('tr', { class: r.id === this.atlasSel ? 'sel' : '', onclick: () => { this.atlasSel = r.id; this.renderAtlas(); this.sfx('select'); }, ondblclick: () => { this.closeAtlas(); this.selectSpecies(r.id); } },
        h('td', {}, h('span', { class: 'tree' }, r.prefix), h('span', { class: 'dot', style: `background:${col}` }), h('span', { class: 'latin' }, w.binomial(s))),
        h('td', {}, s.common), h('td', {}, KINDS[s.kind].label), h('td', { class: 'num' }, fmtYears(s.born)),
        h('td', { class: s.extinct != null ? 'ext' : 'liv' }, s.extinct != null ? `extinta ${fmtYears(s.extinct)}` : 'viva'),
        h('td', { class: 'num' }, fmtInt(s.pop)), h('td', { class: 'num' }, fmtInt(s.peak)),
        h('td', {}, s.innov.map((k) => INNOV.find((d) => d.key === k)?.name).join(', ')));
      t.append(tr);
    }
    tw.append(t);
  }
  lineageTable(sid) {
    const w = this.world, chain = w.lineage(sid);
    const keys = ['size', 'multi', 'photo', 'pred', 'sapro', 'chemo', 'motil', 'sense', 'armor', 'terra', 'limbs', 'topt'];
    const short = { size: 'Tam.', multi: 'Multic.', photo: 'Fotos.', pred: 'Pred.', sapro: 'Decomp.', chemo: 'Quim.', motil: 'Locom.', sense: 'Percep.', armor: 'Couraça', terra: 'Terra', limbs: 'Apênd.', topt: 'Temp.' };
    const sp = w.species[sid];
    const box = h('div', { style: 'padding:12px 12px 16px;border-bottom:1px solid var(--line-strong)' });
    box.append(h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:8px' }, h('span', { class: 'label' }, `Linhagem de ${w.binomial(sp)} · ${chain.length} gerações de espécies`), h('button', { class: 'btn small', onclick: () => { this.closeAtlas(); this.selectSpecies(sid); } }, 'Inspecionar')));
    const t = h('table', { class: 'sp' });
    t.append(h('tr', {}, h('th', {}, 'Ancestral'), h('th', {}, 'Surgiu'), ...keys.map((k) => h('th', {}, short[k])), h('th', {}, 'Novidades')));
    let prev = null;
    for (const s of chain) {
      const g = s.founder;
      const cells = keys.map((k) => {
        const v = g[G[k]], pv = prev ? prev.founder[G[k]] : v, dd = v - pv;
        const mark = Math.abs(dd) > 0.04 ? h('span', { class: dd > 0 ? 'd-up' : 'd-dn' }, dd > 0 ? ' ▲' : ' ▼') : '';
        return h('td', { class: 'num', title: GENES[G[k]].label }, k === 'topt' ? `${tempOpt(v).toFixed(0)}°` : h('span', { class: 'mini' }, h('i', { style: `width:${v * 100}%` })), mark);
      });
      const newInv = prev ? s.innov.filter((k) => !prev.innov.includes(k)) : s.innov;
      t.append(h('tr', { class: s.id === sid ? 'sel' : '', onclick: () => { this.atlasSel = s.id; this.renderAtlas(); } }, h('td', {}, h('span', { class: 'latin' }, w.binomial(s))), h('td', { class: 'num' }, fmtYears(s.born)), ...cells, h('td', {}, newInv.map((k) => INNOV.find((d) => d.key === k)?.name).join(', '))));
      prev = s;
    }
    box.append(h('div', { style: 'overflow-x:auto' }, t));
    return box;
  }

  // ---------- Tempo ----------
  togglePause() {
    if (!this.started) return;
    this.paused = !this.paused;
    $('#t-play-ic').innerHTML = this.paused ? '<path d="M7 5l12 7-12 7z"/>' : '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>';
    $('#t-play').classList.toggle('on', this.paused);
    this.sfx(this.paused ? 'pause' : 'resume');
  }
  setSpeed(s) {
    this.speed = s; $$('#speedseg button').forEach((b) => b.classList.toggle('on', +b.dataset.s === s));
    if (this.paused) this.togglePause(); else this.sfx('ui', { pitch: 0.8 + s * 0.12 });
  }
  changeScale(d) {
    const w = this.world, n = clamp(w.scaleIdx + d, 0, TIME_SCALES.length - 1);
    if (n === w.scaleIdx) { this.sfx('deny'); return; }
    w.scaleIdx = n; this.updateScale(); this.sfx('scale', { idx: n });
  }
  updateScale() { const sc = TIME_SCALES[this.world.scaleIdx]; $('#sc-val').textContent = matchMedia('(max-width: 820px)').matches ? sc.short : sc.label; }
  rewindStep() {
    const sn = this.world.snapshots;
    if (sn.length < 2) { this.sfx('deny'); this.toast('Ainda não há pontos salvos para voltar.'); return; }
    this.askRewind(sn[sn.length - 2], $('#timeline').getBoundingClientRect().left + 150);
  }
  restoreSnapshot(s) {
    this.closeRewind?.();
    this.world.restore(s);
    this.painter.compose(); this.sfx('rewind');
    this.toast(`De volta a ${fmtYears(s.years)}. Uma nova linha do tempo começa daqui.`);
    if (this.sel) this.refreshInspector(true);
    this.drawTimeline();
  }

  bindTimeline() {
    const cv = $('#tl');
    let drag = false;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width); };
    cv.addEventListener('pointerdown', (e) => { if (!this.world.snapshots.length) return; drag = true; cv.setPointerCapture(e.pointerId); this.scrub = pos(e); this.drawTimeline(); });
    cv.addEventListener('pointermove', (e) => { this.tlHover = pos(e); if (drag) { this.scrub = pos(e); } this.drawTimeline(); });
    cv.addEventListener('pointerleave', () => { this.tlHover = null; this.drawTimeline(); });
    cv.addEventListener('pointerup', (e) => {
      if (!drag) return; drag = false;
      const f = this.scrub; this.scrub = null;
      const s = this.snapshotAt(f);
      if (s && s.step < this.world.stepN) this.askRewind(s, e.clientX);
      this.drawTimeline();
    });
    $('#rw-yes').onclick = () => { const s = this.rewindTarget; this.closeRewind(); if (s && this.world.snapshots.includes(s)) this.restoreSnapshot(s); };
    $('#rw-no').onclick = () => { this.closeRewind(); this.sfx('ui', { pitch: 0.8 }); };
  }
  askRewind(s, clientX) {
    this.rewindTarget = s;
    const box = $('#rewind-ask'), r = $('#timeline').getBoundingClientRect();
    $('#rw-text').textContent = `Voltar para ${fmtYears(s.years)}? Tudo que aconteceu depois será descartado.`;
    box.hidden = false;
    box.style.left = clamp(clientX - r.left - 150, 0, Math.max(0, r.width - 300)) + 'px';
    this.sfx('panel', { open: true });
  }
  closeRewind() { $('#rewind-ask').hidden = true; this.rewindTarget = null; }
  tlRange() { const hs = this.world.history; return [hs.length ? hs[0].y : 0, Math.max((hs.length ? hs[0].y : 0) + 1e-9, this.world.years)]; }
  snapshotAt(f) {
    if (!this.world.history.length) return null;
    const [y0, y1] = this.tlRange(), target = y0 + f * (y1 - y0);
    let best = null;
    for (const s of this.world.snapshots) if (s.years <= target + (y1 - y0) * 0.002) best = s;
    return best || this.world.snapshots[0];
  }
  drawTimeline() {
    const cv = $('#tl'); if (!cv) return;
    const W = cv.clientWidth, H = cv.clientHeight; if (!W) return;
    const dpr = devicePixelRatio || 1;
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const w = this.world, hs = w.history;
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    if (hs.length < 2) { ctx.fillStyle = '#5b645c'; ctx.fillText('A linha do tempo se desenha conforme a vida evolui.', 12, H / 2 + 3); return; }
    const [y0, y1] = this.tlRange(), X = (yy) => 8 + (yy - y0) / (y1 - y0) * (W - 16);
    let maxSp = 4, tmin = Infinity, tmax = -Infinity;
    for (const p of hs) { maxSp = Math.max(maxSp, p.sp); tmin = Math.min(tmin, p.T); tmax = Math.max(tmax, p.T); }
    const top = 14, bot = H - 10;
    // área de diversidade por tipo (empilhada)
    const kinds = ['micro', 'plant', 'fungus', 'animal', 'xeno'];
    const cols = { micro: 'rgba(158,198,210,0.5)', plant: 'rgba(163,194,144,0.55)', fungus: 'rgba(200,170,140,0.5)', animal: 'rgba(227,169,94,0.6)', xeno: 'rgba(190,140,220,0.55)' };
    const base = new Float32Array(hs.length);
    for (const k of kinds) {
      ctx.beginPath();
      hs.forEach((p, j) => { const y = bot - (base[j] + p.k[k]) / maxSp * (bot - top); j ? ctx.lineTo(X(p.y), y) : ctx.moveTo(X(p.y), y); });
      for (let j = hs.length - 1; j >= 0; j--) ctx.lineTo(X(hs[j].y), bot - base[j] / maxSp * (bot - top));
      ctx.closePath(); ctx.fillStyle = cols[k]; ctx.fill();
      hs.forEach((p, j) => base[j] += p.k[k]);
    }
    // temperatura
    ctx.strokeStyle = 'rgba(207,106,76,0.85)'; ctx.lineWidth = 1; ctx.beginPath();
    const tr = Math.max(4, tmax - tmin);
    hs.forEach((p, j) => { const y = bot - (p.T - tmin) / tr * (bot - top); j ? ctx.lineTo(X(p.y), y) : ctx.moveTo(X(p.y), y); });
    ctx.stroke();
    // O2
    ctx.strokeStyle = 'rgba(158,198,210,0.8)'; ctx.setLineDash([2, 3]); ctx.beginPath();
    hs.forEach((p, j) => { const y = bot - p.o2 / 0.4 * (bot - top); j ? ctx.lineTo(X(p.y), y) : ctx.moveTo(X(p.y), y); });
    ctx.stroke(); ctx.setLineDash([]);
    // marcas de snapshot
    ctx.fillStyle = 'rgba(214,222,204,0.35)';
    for (const s of w.snapshots) ctx.fillRect(X(s.years), H - 5, 1, 4);
    ctx.fillStyle = '#5b645c'; const endL = fmtYears(y1); ctx.fillText(endL, W - ctx.measureText(endL).width - 8, 11);
    // legenda
    ctx.fillStyle = '#8e978c'; ctx.fillText('DIVERSIDADE', 10, 11);
    ctx.fillStyle = 'rgba(207,106,76,0.9)'; ctx.fillText('TEMP.', 92, 11);
    ctx.fillStyle = 'rgba(158,198,210,0.9)'; ctx.fillText('O₂', 134, 11);
    const f = this.scrub ?? this.tlHover;
    if (f != null) {
      const s = this.snapshotAt(f), xx = 8 + f * (W - 16);
      ctx.strokeStyle = this.scrub != null ? '#e3a95e' : 'rgba(222,223,207,0.5)'; ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, H); ctx.stroke();
      if (s) { const label = (this.scrub != null ? 'Voltar a ' : '') + fmtYears(s.years); ctx.fillStyle = '#dedfcf'; ctx.fillText(label, Math.min(W - ctx.measureText(label).width - 6, xx + 6), 24); }
    }
  }

  // ---------- Laço ----------
  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    const w = this.world;
    const sc = TIME_SCALES[w.scaleIdx];
    const sps = SPEEDS[this.speed];
    if (this.started && !this.paused) {
      this.acc += dt * sps;
      let n = Math.floor(this.acc); this.acc -= n;
      const t0 = performance.now();
      while (n-- > 0) { w.step(); if (performance.now() - t0 > 14) { this.acc = 0; break; } }
    }
    const interp = this.paused ? 0 : this.acc;
    const displayYears = w.years + interp * sc.years;
    const dayRate = (this.paused ? 0 : sps) * sc.years * 365.25 * 24 / w.planet.dayHours;
    const nightVisible = this.layers.night && sc.years <= 1 / 12 + 1e-9 ? clamp(1 - (dayRate - 0.6) / 2) : 0;
    const tideVisible = this.layers.moons && w.planet.moons.length && sc.years <= 1 / 12 + 1e-9 ? clamp(1 - (dayRate * 2 - 1) / 3) : 0;
    const opts = { displayYears, nightVisible, tideVisible, clouds: this.layers.clouds, showMoons: this.layers.moons && this.started, interp, filterSpecies: this.filterSpecies ?? -1, paused: this.paused };
    const tm = this.timers;
    tm.compose += dt; tm.hud += dt; tm.audio += dt; tm.tl += dt; tm.insp += dt;
    if (tm.compose > (this.paused ? 1 : 0.35)) { tm.compose = 0; this.painter.compose(); }
    if (this.follow && this.sel?.type === 'agent' && w.alive[this.sel.i]) {
      const i = this.sel.i, u = w.ax[i] / GW, v = w.ay[i] / GH;
      if (this.view === '2d') { let du = u - this.map.cx; du -= Math.round(du); this.map.cx += du * Math.min(1, dt * 4); this.map.cy += (v - this.map.cy) * Math.min(1, dt * 4); this.map.clampView(); }
      else {
        const p = this.v3.surfacePoint(u, v, new THREE.Vector3()); p.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.v3.planetGroup.rotation.y);
        const yaw = Math.atan2(p.x, p.z), pitch = Math.asin(clamp(p.y / p.length(), -1, 1));
        let dy = yaw - this.v3.yaw; dy -= Math.round(dy / 6.283) * 6.283;
        this.v3.yaw += dy * Math.min(1, dt * 3); this.v3.pitch += (pitch - this.v3.pitch) * Math.min(1, dt * 3);
      }
    }
    if (this.view === '2d') this.map.draw(dt, opts); else this.v3.render(dt, opts);
    if (this.specimen && $('#inspector').classList.contains('open')) this.specimen.render(dt);
    if (tm.hud > 0.25) { tm.hud = 0; this.updateHUD(displayYears); }
    if (tm.tl > 0.5) { tm.tl = 0; this.drawTimeline(); }
    if (tm.insp > 0.4 && this.sel) { tm.insp = 0; this.refreshInspector(false); }
    if (tm.audio > 0.5 && this.audio.ready) { tm.audio = 0; this.updateAudio(); }
    requestAnimationFrame((t) => this.frame(t));
  }

  updateHUD(displayYears) {
    const w = this.world;
    if (!$('#p-name')) return;
    $('#p-name').textContent = this.planet.name; $('#p-des').textContent = `${this.planet.designation} · ${STARS[this.planet.star].name}`;
    $('#s-temp').textContent = `${w.meanTemp.toFixed(1)} °C`;
    $('#s-o2').textContent = `${(w.o2 * 100).toFixed(1)}%`;
    $('#s-sp').textContent = fmtInt(w.living || 0);
    $('#s-pop').textContent = fmtInt(w.count);
    $('#s-temp').parentElement.classList.toggle('warn', Math.abs(w.tempOffset) > 6);
    $('#clock-val').textContent = fmtYears(displayYears);
  }

  updateAudio() {
    const w = this.world;
    const k = { micro: 0, plant: 0, fungus: 0, animal: 0, xeno: 0 };
    const animals = [];
    for (const sp of w.species) if (sp.pop > 0) { k[sp.kind] += sp.pop; if (sp.kind === 'animal') animals.push(sp); }
    animals.sort((a, b) => b.pop - a.pop);
    if (this.view === '2d') this.closeness = clamp((this.map.zoom - 1) / 8);
    else this.closeness = clamp((2.2 - this.v3.dist) / 1.1);
    const ev = {}; for (const e of w.events) ev[e.type] = 1;
    this.audio.update({
      diversity: w.living || 0, micro: k.micro, plants: k.plant, fungi: k.fungus, animals: k.animal, xeno: k.xeno,
      closeness: this.started ? this.closeness : 0.15, paused: this.paused || !this.started, speed: this.speed, temp: w.meanTemp,
      water: this.planet.water, atmosphere: this.planet.atmosphere, tide: this.planet.tide, events: ev,
      animalVoices: animals.slice(0, 6).map(voiceFor),
    });
  }
}

window.__tp = { buildCreature, Specimen };
window.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
if (document.readyState !== 'loading') window.app = window.app || new App();
