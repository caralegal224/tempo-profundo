// Motor de áudio procedural. Nenhum arquivo de som: tudo é sintetizado.
import { clamp } from './util.js';

const MODES = {
  pent: [0, 2, 4, 7, 9], aeolian: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], mixo: [0, 2, 4, 5, 7, 9, 10], phryg: [0, 1, 3, 5, 7, 8, 10],
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ready = false; this.muted = false;
    this.levels = { master: 0.8, music: 0.7, amb: 0.8, sfx: 0.85, ui: 0.6 };
    this.state = { water: 0.6, atmosphere: 1, temp: 15, diversity: 0, animals: 0, micro: 0, plants: 0, fungi: 0, xeno: 0, closeness: 0.3, paused: false, speed: 1, tide: 1, star: 'G', seed: 1, animalVoices: [] };
    this.mood = { dark: 0, until: 0 };
    this.lastStinger = {};
  }

  async init() {
    if (this.ready) { if (this.ctx.state !== 'running') await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = ctx.createGain(); this.master.gain.value = this.levels.master;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = 0.006; comp.release.value = 0.3;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -2; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
    this.master.connect(comp).connect(lim).connect(ctx.destination);
    // reverberação de convolução com resposta gerada
    this.reverb = ctx.createConvolver(); this.reverb.buffer = this.makeIR(5.5, 2.2);
    this.revOut = ctx.createGain(); this.revOut.gain.value = 0.9;
    this.reverb.connect(this.revOut).connect(this.master);
    this.shortRev = ctx.createConvolver(); this.shortRev.buffer = this.makeIR(1.2, 3.5);
    this.shortRev.connect(this.master);
    // eco estéreo (ping-pong)
    this.delayIn = ctx.createGain(); this.delayIn.gain.value = 0.32;
    const dl = ctx.createDelay(2), dr = ctx.createDelay(2), fb = ctx.createGain(), dlp = ctx.createBiquadFilter();
    dl.delayTime.value = 0.64; dr.delayTime.value = 0.96; fb.gain.value = 0.38; dlp.type = 'lowpass'; dlp.frequency.value = 2600;
    const merger = ctx.createChannelMerger(2);
    this.delayIn.connect(dl); dl.connect(dlp).connect(dr); dr.connect(fb).connect(dl);
    dl.connect(merger, 0, 0); dr.connect(merger, 0, 1);
    merger.connect(this.master); merger.connect(this.reverb);
    // barramentos
    const bus = (lvl) => { const g = ctx.createGain(); g.gain.value = lvl; g.connect(this.master); return g; };
    this.music = bus(this.levels.music); this.amb = bus(this.levels.amb); this.sfx = bus(this.levels.sfx); this.ui = bus(this.levels.ui);
    this.musicRev = ctx.createGain(); this.musicRev.gain.value = 0.85; this.music.connect(this.musicRev).connect(this.reverb);
    this.ambRev = ctx.createGain(); this.ambRev.gain.value = 0.35; this.amb.connect(this.ambRev).connect(this.reverb);
    this.sfxRev = ctx.createGain(); this.sfxRev.gain.value = 0.5; this.sfx.connect(this.sfxRev).connect(this.reverb);
    this.uiRev = ctx.createGain(); this.uiRev.gain.value = 0.12; this.ui.connect(this.uiRev).connect(this.shortRev);
    // ruídos base
    this.noise = { white: this.makeNoise('white'), pink: this.makeNoise('pink'), brown: this.makeNoise('brown') };
    this.distCurve = this.makeDistCurve(18);
    this.buildDrone(); this.buildOcean(); this.buildWind(); this.buildDeep();
    this.ready = true;
    this.nextNote = ctx.currentTime + 2; this.nextChord = ctx.currentTime + 0.1; this.nextChirp = ctx.currentTime + 1; this.nextGrain = ctx.currentTime; this.nextWave = ctx.currentTime; this.nextGust = ctx.currentTime;
    this.chordIdx = 0; this.melody = 0; this.phraseLeft = 0;
    this.setPlanet(this.state);
    this.timer = setInterval(() => this.tick(), 60);
  }

  makeIR(sec, decay) {
    const ctx = this.ctx, n = Math.floor(sec * ctx.sampleRate), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const k = 0.15 + 0.8 * t; // cauda escurece com o tempo
        lp = lp + (Math.random() * 2 - 1 - lp) * (1 - k);
        const early = i < ctx.sampleRate * 0.08 && Math.random() < 0.004 ? (Math.random() * 2 - 1) * 2 : 0;
        d[i] = (lp + early) * Math.pow(1 - t, decay) * (i < 200 ? i / 200 : 1);
      }
    }
    return b;
  }
  makeNoise(type) {
    const ctx = this.ctx, n = ctx.sampleRate * 4, b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (type === 'white') d[i] = w * 0.5;
        else if (type === 'pink') { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
        else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      }
    }
    return b;
  }
  makeDistCurve(k) { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / n * 2 - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); } return c; }
  noiseSrc(type, loop = true) { const s = this.ctx.createBufferSource(); s.buffer = this.noise[type]; s.loop = loop; s.loopStart = Math.random() * 3; return s; }

  // ---------- Camadas contínuas ----------
  buildDrone() {
    const ctx = this.ctx;
    this.droneOut = ctx.createGain(); this.droneOut.gain.value = 0;
    this.droneLP = ctx.createBiquadFilter(); this.droneLP.type = 'lowpass'; this.droneLP.frequency.value = 600; this.droneLP.Q.value = 0.8;
    this.droneLP.connect(this.droneOut); this.droneOut.connect(this.music);
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.045; lfoG.gain.value = 260; lfo.connect(lfoG).connect(this.droneLP.frequency); lfo.start();
    this.voices = [];
    for (let v = 0; v < 5; v++) {
      const g = ctx.createGain(); g.gain.value = v === 0 ? 0.18 : 0.11; g.connect(this.droneLP);
      const pan = ctx.createStereoPanner(); pan.pan.value = [0, -0.5, 0.5, -0.25, 0.3][v]; pan.connect(g);
      const oscs = [-7, 6].map((det) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = det + (Math.random() - 0.5) * 4; o.connect(pan); o.start(); return o; });
      const sub = ctx.createOscillator(); sub.type = 'sine'; const sg = ctx.createGain(); sg.gain.value = 0.9; sub.connect(sg).connect(pan); sub.start();
      // tremolo lento independente
      const tl = ctx.createOscillator(), tg = ctx.createGain(); tl.frequency.value = 0.07 + v * 0.031; tg.gain.value = 0.035; tl.connect(tg).connect(g.gain); tl.start();
      this.voices.push({ oscs, sub, g });
    }
    // brilho: ruído ressonante "vítreo"
    this.shimmer = ctx.createGain(); this.shimmer.gain.value = 0;
    const sn = this.noiseSrc('white'), bp1 = ctx.createBiquadFilter(), bp2 = ctx.createBiquadFilter();
    bp1.type = 'bandpass'; bp1.Q.value = 40; bp2.type = 'bandpass'; bp2.Q.value = 40;
    this.shimBP = [bp1, bp2];
    sn.connect(bp1).connect(this.shimmer); sn.connect(bp2).connect(this.shimmer); this.shimmer.connect(this.music); sn.start();
  }

  buildOcean() {
    const ctx = this.ctx;
    this.oceanOut = ctx.createGain(); this.oceanOut.gain.value = 0; this.oceanOut.connect(this.amb);
    const s = this.noiseSrc('brown'), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    this.swell = ctx.createGain(); this.swell.gain.value = 0.3;
    s.connect(lp).connect(this.swell).connect(this.oceanOut); s.start();
    const f = this.noiseSrc('pink'), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.6;
    this.foam = ctx.createGain(); this.foam.gain.value = 0;
    f.connect(bp).connect(this.foam).connect(this.oceanOut); f.start();
    this.oceanLP = lp;
  }

  buildWind() {
    const ctx = this.ctx;
    this.windOut = ctx.createGain(); this.windOut.gain.value = 0; this.windOut.connect(this.amb);
    const s = this.noiseSrc('pink');
    this.windBP = ctx.createBiquadFilter(); this.windBP.type = 'bandpass'; this.windBP.frequency.value = 500; this.windBP.Q.value = 1.6;
    this.windBP2 = ctx.createBiquadFilter(); this.windBP2.type = 'bandpass'; this.windBP2.frequency.value = 1300; this.windBP2.Q.value = 6;
    this.gust = ctx.createGain(); this.gust.gain.value = 0.4;
    const pan = ctx.createStereoPanner(); this.windPan = pan;
    s.connect(this.windBP).connect(this.gust); s.connect(this.windBP2).connect(this.gust);
    this.gust.connect(pan).connect(this.windOut); s.start();
    // folhagem
    this.leaves = ctx.createGain(); this.leaves.gain.value = 0;
    const l = this.noiseSrc('white'), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200;
    l.connect(hp).connect(this.leaves).connect(this.windOut); l.start();
  }

  buildDeep() {
    // sub-grave tectônico, quase inaudível; cresce em eventos
    const ctx = this.ctx;
    this.deepOut = ctx.createGain(); this.deepOut.gain.value = 0.0; this.deepOut.connect(this.amb);
    const s = this.noiseSrc('brown'), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 90;
    s.connect(lp).connect(this.deepOut); s.start();
  }

  // ---------- Estado / harmonia ----------
  setPlanet(st) {
    Object.assign(this.state, st);
    const roots = { M: 38, K: 40, G: 45, F: 43 };
    this.root = (roots[this.state.star] ?? 45) + ((this.state.seed || 0) % 3) - 1;
    const T = this.state.temp;
    this.baseMode = T < -2 ? 'dorian' : T > 28 ? 'lydian' : (this.state.seed % 2 ? 'mixo' : 'pent');
    if (this.ready) this.applyChord(true);
  }
  get mode() { return this.ctx && this.ctx.currentTime < this.mood.until ? 'phryg' : (this.state.diversity < 3 ? 'pent' : this.baseMode); }
  scaleNote(deg, oct = 0) {
    const sc = MODES[this.mode]; const n = sc.length;
    const o = Math.floor(deg / n); const d = ((deg % n) + n) % n;
    return this.root + sc[d] + 12 * (o + oct);
  }
  applyChord(immediate) {
    const ctx = this.ctx, t = ctx.currentTime;
    const progs = [[0, 4, 7, 9], [3, 5, 9, 11], [5, 7, 11, 14], [-2, 2, 4, 7], [1, 4, 6, 8]];
    const p = progs[this.chordIdx % progs.length];
    const notes = [this.scaleNote(p[0], 0) - 12, this.scaleNote(p[0], 0), this.scaleNote(p[1], 0), this.scaleNote(p[2], 1) - 12, this.scaleNote(p[3], 1)];
    const tc = immediate ? 0.05 : 2.4;
    this.voices.forEach((v, k) => {
      const f = mtof(notes[k]);
      for (const o of v.oscs) o.frequency.setTargetAtTime(f, t, tc);
      v.sub.frequency.setTargetAtTime(f * (k === 0 ? 0.5 : 1), t, tc);
    });
    this.shimBP[0].frequency.setTargetAtTime(mtof(notes[2] + 36), t, tc);
    this.shimBP[1].frequency.setTargetAtTime(mtof(notes[4] + 24), t, tc);
    this.currentChord = notes;
  }

  update(st) { Object.assign(this.state, st); }

  setLevel(k, v) {
    this.levels[k] = v;
    if (!this.ready) return;
    const node = { master: this.master, music: this.music, amb: this.amb, sfx: this.sfx, ui: this.ui }[k];
    node.gain.setTargetAtTime(k === 'master' && this.muted ? 0 : v, this.ctx.currentTime, 0.05);
  }
  setMuted(m) { this.muted = m; if (this.ready) this.master.gain.setTargetAtTime(m ? 0 : this.levels.master, this.ctx.currentTime, 0.1); }

  // ---------- Agendador ----------
  tick() {
    const ctx = this.ctx, t = ctx.currentTime, s = this.state;
    if (ctx.state !== 'running') return;
    const paused = s.paused;
    const near = clamp(s.closeness);
    const dark = t < this.mood.until ? 1 : 0;
    // drone
    const droneLvl = (0.16 + Math.min(0.12, s.diversity * 0.004)) * (paused ? 0.6 : 1);
    this.droneOut.gain.setTargetAtTime(droneLvl, t, 1.2);
    const bright = 380 + Math.min(1400, s.diversity * 25) + (s.temp > 25 ? 200 : 0) - dark * 300 - (paused ? 200 : 0);
    this.droneLP.frequency.setTargetAtTime(Math.max(160, bright), t, 2);
    this.shimmer.gain.setTargetAtTime((s.xeno > 0 ? 0.05 : 0.012) + (s.temp < 0 ? 0.03 : 0) + (s.events?.glacial ? 0.12 : 0), t, 2);
    if (t > this.nextChord) { this.chordIdx++; this.applyChord(false); this.nextChord = t + 18 + Math.random() * 14; }
    // oceano: ondas com período ligado à maré e gravidade
    const oceanLvl = s.water * (0.12 + near * 0.5) * (s.tide > 0 ? 1 : 0.6);
    this.oceanOut.gain.setTargetAtTime(oceanLvl, t, 0.8);
    if (t > this.nextWave) {
      const period = 5 + Math.random() * 4 - Math.min(2.5, s.tide * 0.15);
      const peak = 0.35 + Math.random() * 0.4 + Math.min(0.4, s.tide * 0.05);
      this.swell.gain.cancelScheduledValues(t); this.swell.gain.setTargetAtTime(peak, t, period * 0.22);
      this.swell.gain.setTargetAtTime(0.15, t + period * 0.5, period * 0.2);
      this.foam.gain.cancelScheduledValues(t); this.foam.gain.setTargetAtTime(0, t, 0.3);
      this.foam.gain.setTargetAtTime(0.05 * peak * near * 2, t + period * 0.4, 0.15); this.foam.gain.setTargetAtTime(0, t + period * 0.6, 0.6);
      this.oceanLP.frequency.setTargetAtTime(300 + peak * 400, t, period * 0.3);
      this.nextWave = t + period;
    }
    // vento
    const windLvl = clamp(s.atmosphere / 2.2, 0.05, 1) * (0.05 + near * 0.28) + (s.events?.glacial ? 0.12 : 0);
    this.windOut.gain.setTargetAtTime(windLvl, t, 1.5);
    this.leaves.gain.setTargetAtTime(Math.min(0.08, s.plants * 0.0001) * near, t, 1);
    if (t > this.nextGust) {
      const d = 2 + Math.random() * 6;
      this.gust.gain.setTargetAtTime(0.15 + Math.random() * 0.7, t, d * 0.3);
      this.windBP.frequency.setTargetAtTime(280 + Math.random() * 700, t, d * 0.4);
      this.windBP2.frequency.setTargetAtTime(900 + Math.random() * 1400, t, d * 0.5);
      this.windPan.pan.setTargetAtTime(Math.random() * 1.4 - 0.7, t, d * 0.5);
      this.nextGust = t + d;
    }
    this.deepOut.gain.setTargetAtTime(dark * 0.25 + (s.events?.volcanic ? 0.35 : 0) + 0.02, t, 1.5);
    // biofonia microbiana: grãos efervescentes
    if (!paused) {
      const microRate = Math.min(28, s.micro * 0.01) * (0.3 + near);
      while (this.nextGrain < t + 0.15 && microRate > 0.2) {
        this.grain(this.nextGrain);
        this.nextGrain += -Math.log(Math.random()) / microRate;
      }
      if (this.nextGrain < t) this.nextGrain = t;
      // cantos de animais
      const anRate = Math.min(3.2, s.animals * 0.003) * (0.25 + near * 1.3) * Math.min(1.6, 0.6 + s.speed * 0.15);
      if (anRate > 0.02 && t > this.nextChirp && s.animalVoices.length) {
        const v = s.animalVoices[Math.floor(Math.random() * s.animalVoices.length)];
        this.call(v, t + 0.05);
        this.nextChirp = t + 0.2 + -Math.log(Math.random()) / anRate;
      }
      if (s.xeno > 0 && Math.random() < 0.012 * (0.4 + near)) this.crystal(t + 0.1);
    }
    // música generativa
    if (t > this.nextNote) {
      const density = paused ? 0.25 : 0.45 + Math.min(0.4, s.diversity * 0.01);
      if (this.phraseLeft <= 0) {
        this.phraseLeft = Math.random() < density ? 3 + Math.floor(Math.random() * 6) : 0;
        this.nextNote = t + (this.phraseLeft ? 0.5 : 6 + Math.random() * 10);
        this.melody = Math.floor(Math.random() * 5);
      } else {
        this.melody += [-2, -1, -1, 1, 1, 2, 0, 3, -3][Math.floor(Math.random() * 9)];
        this.melody = clamp(this.melody, -3, 9);
        const n = this.scaleNote(this.melody, 2);
        this.bell(mtof(n), t + 0.05, 0.12 + Math.random() * 0.05, { pan: Math.random() * 1.2 - 0.6 });
        if (Math.random() < 0.18) this.bell(mtof(n + 12), t + 0.05 + 0.75, 0.04);
        this.phraseLeft--;
        const beat = 60 / (58 + (s.temp > 25 ? 8 : 0));
        this.nextNote = t + beat * [1, 1, 2, 0.5, 1.5, 3][Math.floor(Math.random() * 6)];
      }
    }
  }

  // ---------- Vozes ----------
  env(g, t, a, peak, d, sus = 0) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setTargetAtTime(sus, t + a, d / 4); }

  bell(freq, t, amp = 0.15, o = {}) {
    // FM: portadora 1, moduladora 3.5 (metálico suave tipo marimba de vidro)
    const ctx = this.ctx;
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain(), pan = ctx.createStereoPanner();
    car.frequency.value = freq; mod.frequency.value = freq * (o.ratio || 3.5);
    mg.gain.setValueAtTime(freq * (o.index || 2.2), t); mg.gain.exponentialRampToValueAtTime(freq * 0.05, t + (o.dec || 1.2));
    mod.connect(mg).connect(car.frequency);
    pan.pan.value = o.pan || 0;
    car.connect(g).connect(pan).connect(o.bus || this.music);
    if (!o.dry) pan.connect(this.delayIn);
    const dec = o.long || 3.2;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0008, t + dec);
    car.start(t); mod.start(t); car.stop(t + dec + 0.1); mod.stop(t + dec + 0.1);
  }

  pad(notes, t, dur, amp = 0.08, bus) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(2200, t + dur * 0.4); lp.frequency.linearRampToValueAtTime(500, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + dur * 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g).connect(bus || this.music);
    for (const n of notes) for (const det of [-9, 0, 8]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.1);
    }
  }

  grain(t) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noise.white;
    const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 3000 + Math.random() * 6000; hp.Q.value = 3;
    const g = ctx.createGain(), pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 2 - 1;
    const d = 0.004 + Math.random() * 0.02;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.05, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0005, t + d);
    s.connect(hp).connect(g).connect(pan).connect(this.amb);
    s.start(t, Math.random() * 3, d + 0.02);
  }

  // canto de uma espécie: frequência, padrão e timbre vêm do genoma
  call(v, t) {
    const ctx = this.ctx;
    const n = v.notes, base = v.freq;
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8;
    const g = ctx.createGain(); g.gain.value = 0;
    const out = ctx.createGain(); out.gain.value = 0.35 + Math.random() * 0.4;
    g.connect(pan).connect(out).connect(this.amb);
    const send = ctx.createGain(); send.gain.value = 0.6; out.connect(send).connect(this.reverb);
    const car = ctx.createOscillator(); car.type = v.wave;
    const mod = ctx.createOscillator(), mg = ctx.createGain(); mod.frequency.value = base * v.ratio; mg.gain.value = base * v.fm;
    mod.connect(mg).connect(car.frequency);
    let tt = t;
    for (let k = 0; k < n; k++) {
      const f0 = base * (1 + (k % 2) * v.interval), f1 = f0 * v.sweep;
      car.frequency.setValueAtTime(f0, tt); car.frequency.exponentialRampToValueAtTime(f1, tt + v.len);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.16, tt + Math.min(0.02, v.len * 0.3)); g.gain.exponentialRampToValueAtTime(0.0008, tt + v.len);
      tt += v.len + v.gap;
    }
    if (v.low) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = base * 3; g.disconnect(); g.connect(lp).connect(pan); }
    car.start(t); mod.start(t); car.stop(tt + 0.1); mod.stop(tt + 0.1);
  }

  crystal(t) {
    const base = mtof(this.scaleNote(Math.floor(Math.random() * 7), 3));
    [1, 2.76, 5.4].forEach((r, k) => this.bell(base * r, t + k * 0.01, 0.03 / (k + 1), { ratio: 1.41, index: 0.4, bus: this.amb, long: 2.5, pan: Math.random() - 0.5, dry: true }));
  }

  // ---------- Efeitos de eventos ----------
  noiseBurst({ t, dur, type = 'white', f0 = 1000, f1 = 200, q = 1, amp = 0.4, bus, filt = 'bandpass', attack = 0.01, pan = 0 }) {
    const ctx = this.ctx, s = this.noiseSrc(type, true);
    const f = ctx.createBiquadFilter(); f.type = filt; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    s.connect(f).connect(g).connect(p).connect(bus || this.sfx);
    s.start(t); s.stop(t + dur + 0.05);
    return g;
  }

  boom(t, size = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain(), ws = ctx.createWaveShaper();
    ws.curve = this.distCurve;
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(24, t + 2.2);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9 * size, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 3.5);
    o.connect(ws).connect(g).connect(this.sfx); o.start(t); o.stop(t + 3.6);
    this.noiseBurst({ t, dur: 2.8, type: 'brown', f0: 900, f1: 60, filt: 'lowpass', amp: 0.9 * size, attack: 0.005 });
    this.noiseBurst({ t: t + 0.02, dur: 0.6, type: 'white', f0: 5000, f1: 300, q: 0.5, amp: 0.35 * size });
    // detritos caindo
    for (let k = 0; k < 40; k++) {
      const tt = t + 0.8 + Math.random() * 5;
      this.noiseBurst({ t: tt, dur: 0.05 + Math.random() * 0.15, type: 'white', f0: 600 + Math.random() * 3000, f1: 200, q: 2, amp: 0.05 + Math.random() * 0.08, pan: Math.random() * 2 - 1 });
    }
    this.noiseBurst({ t: t + 0.5, dur: 9, type: 'brown', f0: 140, f1: 40, filt: 'lowpass', amp: 0.45 * size, attack: 1.5 });
  }

  stinger(kind, data = {}) {
    if (!this.ready || this.ctx.state !== 'running') return;
    const ctx = this.ctx, t = ctx.currentTime + 0.03;
    const gap = { speciation: 1.4, extinction: 1.2, ui: 0.03, hover: 0.04 }[kind] ?? 0;
    if (gap && this.lastStinger[kind] && t - this.lastStinger[kind] < gap) return;
    this.lastStinger[kind] = t;
    const N = (d, o = 2) => mtof(this.scaleNote(d, o));
    switch (kind) {
      case 'speciation': {
        const d = Math.floor(Math.random() * 5);
        this.bell(N(d, 3), t, 0.05, { pan: -0.3, bus: this.sfx }); this.bell(N(d + 2, 3), t + 0.16, 0.04, { pan: 0.3, bus: this.sfx });
        break;
      }
      case 'innovation': {
        [0, 2, 4, 7].forEach((d, k) => this.bell(N(d, 2), t + k * 0.13, 0.09, { pan: -0.5 + k * 0.33, bus: this.sfx, index: 1.6 }));
        this.bell(N(9, 3), t + 0.6, 0.05, { bus: this.sfx, long: 5 });
        this.noiseBurst({ t, dur: 2.5, type: 'white', f0: 6000, f1: 9000, q: 8, amp: 0.04, attack: 0.8 });
        break;
      }
      case 'extinction': {
        const f = N(0, 1);
        this.bell(f, t, 0.1, { ratio: 1.0, index: 0.8, bus: this.sfx, long: 4.5, dec: 2 });
        this.bell(f * Math.pow(2, -1 / 12), t + 0.45, 0.07, { ratio: 1.0, index: 0.6, bus: this.sfx, long: 4.5 });
        break;
      }
      case 'massExtinction': {
        this.mood.until = ctx.currentTime + 90;
        this.boom(t, 0.6);
        this.pad([this.root - 12, this.root - 11, this.root - 5, this.root + 1], t + 0.5, 9, 0.12, this.sfx);
        this.applyChord(false);
        break;
      }
      case 'milestone': {
        const r = this.root;
        this.pad([r, r + 7, r + 12, r + 16, r + 19], t, 7, 0.09, this.sfx);
        [0, 4, 7, 11].forEach((d, k) => this.bell(N(d, 3), t + 1 + k * 0.25, 0.05, { bus: this.sfx }));
        break;
      }
      case 'impact': {
        // aproximação
        this.noiseBurst({ t, dur: 1.4, type: 'pink', f0: 4000, f1: 300, q: 2.5, amp: 0.45, attack: 1.2 });
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(80, t + 1.35);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 1.2); g.gain.linearRampToValueAtTime(0, t + 1.4);
        o.connect(lp).connect(g).connect(this.sfx); o.start(t); o.stop(t + 1.5);
        this.boom(t + 1.35, clamp(0.6 + (data.radius || 0.06) * 4, 0.6, 1.2));
        this.mood.until = Math.max(this.mood.until, ctx.currentTime + 40);
        break;
      }
      case 'volcanic': {
        this.noiseBurst({ t, dur: 6, type: 'brown', f0: 200, f1: 50, filt: 'lowpass', amp: 0.7, attack: 0.6 });
        for (let k = 0; k < 60; k++) { const tt = t + Math.random() * 6; this.noiseBurst({ t: tt, dur: 0.03 + Math.random() * 0.1, f0: 1500 + Math.random() * 3000, f1: 400, q: 3, amp: 0.08, pan: Math.random() * 2 - 1 }); }
        this.boom(t + 0.2, 0.5);
        break;
      }
      case 'glacial': {
        const r = this.root + 36;
        this.pad([r, r + 2, r + 7, r + 14], t, 10, 0.05, this.sfx);
        this.noiseBurst({ t, dur: 8, type: 'white', f0: 7000, f1: 2500, q: 12, amp: 0.08, attack: 3 });
        [0, 1, 4, 6].forEach((d, k) => this.bell(N(d, 4), t + 1 + k * 0.7, 0.03, { ratio: 2.01, index: 0.5, bus: this.sfx, long: 6 }));
        break;
      }
      case 'greenhouse': {
        this.pad([this.root - 12, this.root - 6, this.root], t, 10, 0.1, this.sfx);
        this.noiseBurst({ t, dur: 9, type: 'pink', f0: 200, f1: 900, q: 1, amp: 0.12, attack: 4 });
        break;
      }
      case 'anoxia': {
        this.noiseBurst({ t, dur: 7, type: 'brown', f0: 400, f1: 80, filt: 'lowpass', amp: 0.5, attack: 2 });
        for (let k = 0; k < 14; k++) this.bell(80 + Math.random() * 120, t + Math.random() * 6, 0.05, { ratio: 1.0, index: 3, bus: this.sfx, long: 1, dry: true });
        break;
      }
      case 'gamma': {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square';
        o.frequency.setValueAtTime(60, t); o.frequency.exponentialRampToValueAtTime(5200, t + 1.6);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 0.7;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08, t + 1.4); g.gain.exponentialRampToValueAtTime(0.0005, t + 2.2);
        o.connect(bp).connect(g).connect(this.sfx); o.start(t); o.stop(t + 2.3);
        this.noiseBurst({ t: t + 1.5, dur: 3, type: 'white', f0: 8000, f1: 1200, q: 0.3, amp: 0.25, attack: 0.01 });
        this.mood.until = Math.max(this.mood.until, ctx.currentTime + 40);
        break;
      }
      case 'plague': {
        for (let k = 0; k < 6; k++) this.noiseBurst({ t: t + k * 0.5, dur: 1.4, type: 'pink', f0: 700 + k * 120, f1: 1400, q: 14, amp: 0.1, attack: 0.5, pan: k % 2 ? 0.5 : -0.5 });
        this.bell(N(1, 2), t + 0.5, 0.07, { ratio: 1.07, index: 4, bus: this.sfx });
        break;
      }
      case 'custom': this.boom(t, 0.4); this.pad([this.root - 12, this.root - 11], t, 6, 0.08, this.sfx); break;
      case 'seed': {
        for (let k = 0; k < 5; k++) {
          const tt = t + k * 0.07 + Math.random() * 0.05, o = ctx.createOscillator(), g = ctx.createGain();
          const f = 500 + Math.random() * 700; o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * 2.6, tt + 0.07);
          g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.12, tt + 0.004); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.12);
          o.connect(g).connect(this.sfx); o.start(tt); o.stop(tt + 0.15);
        }
        this.bell(N(4, 3), t + 0.35, 0.05, { bus: this.sfx });
        break;
      }
      case 'rewind': {
        this.noiseBurst({ t, dur: 0.9, type: 'pink', f0: 300, f1: 6000, q: 3, amp: 0.2, attack: 0.8 });
        this.voices.forEach((v) => v.oscs.forEach((o) => { o.detune.cancelScheduledValues(t); o.detune.setValueAtTime(o.detune.value, t); o.detune.linearRampToValueAtTime(-700, t + 0.4); o.detune.linearRampToValueAtTime(0, t + 0.9); }));
        break;
      }
      case 'pause': case 'resume': {
        const up = kind === 'resume';
        this.voices.forEach((v) => v.oscs.forEach((o) => { o.detune.cancelScheduledValues(t); o.detune.setValueAtTime(up ? -500 : 0, t); o.detune.setTargetAtTime(up ? 0 : -500, t, up ? 0.15 : 0.25); if (!up) o.detune.setTargetAtTime(0, t + 1.2, 0.5); }));
        this.click(t, up ? 1.2 : 0.8);
        break;
      }
      case 'scale': {
        const k = data.idx ?? 3;
        this.bell(N(k, 2), t, 0.06, { bus: this.ui, index: 1, long: 1.2, dry: true });
        this.bell(N(k + 4, 2), t + 0.07, 0.04, { bus: this.ui, index: 1, long: 1.2, dry: true });
        break;
      }
      case 'select': this.bell(N(4, 3), t, 0.05, { bus: this.ui, ratio: 2.0, index: 0.9, long: 1.4, dry: true }); break;
      case 'vault': [0, 2, 4, 6].forEach((d, k) => this.bell(N(d, 3), t + k * 0.06, 0.05, { bus: this.ui, long: 2 })); break;
      case 'deny': [0, 0.12].forEach((dt) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = 140; g.gain.setValueAtTime(0, t + dt); g.gain.linearRampToValueAtTime(0.12, t + dt + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.1); o.connect(g).connect(this.ui); o.start(t + dt); o.stop(t + dt + 0.12); }); break;
      case 'ui': this.click(t, data.pitch || 1); break;
      case 'hover': this.tick2(t); break;
      case 'panel': this.noiseBurst({ t, dur: 0.28, type: 'pink', f0: data.open ? 400 : 2500, f1: data.open ? 2500 : 400, q: 1.2, amp: 0.06, bus: this.ui, attack: 0.08 }); break;
      case 'sculpt': this.noiseBurst({ t, dur: 0.35, type: 'brown', f0: 260, f1: 90, filt: 'lowpass', amp: 0.18, bus: this.ui, attack: 0.02 }); break;
    }
  }

  click(t, pitch = 1) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(900 * pitch, t); o.frequency.exponentialRampToValueAtTime(320 * pitch, t + 0.05);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.002); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(g).connect(this.ui); o.start(t); o.stop(t + 0.1);
    this.noiseBurst({ t, dur: 0.02, type: 'white', f0: 3500 * pitch, f1: 2000, q: 2, amp: 0.05, bus: this.ui, attack: 0.001 });
  }
  tick2(t) { this.noiseBurst({ t, dur: 0.018, type: 'white', f0: 5200, f1: 4000, q: 6, amp: 0.035, bus: this.ui, attack: 0.001 }); }
}

// Deriva a voz de uma espécie animal a partir do genoma médio
export function voiceFor(sp) {
  const g = sp.mean;
  const size = g[0], hue = g[14], symm = g[18], limbs = g[16], sense = g[7], terra = g[11], armor = g[8];
  const freq = 2600 * Math.pow(0.18, size * 1.5) * (0.85 + hue * 0.4);
  return {
    freq: Math.max(70, freq),
    notes: 1 + Math.floor(sense * 4 + symm * 2),
    len: 0.03 + size * 0.25 + (terra < 0.5 ? 0.08 : 0),
    gap: 0.03 + limbs * 0.08,
    sweep: terra < 0.5 ? 0.6 : 1 + (hue - 0.5) * 0.8,
    interval: 0.12 + (sense > 0.5 ? 0.25 : 0),
    ratio: 1 + Math.round(armor * 3) * 0.5,
    fm: 0.2 + armor * 1.5 + (terra < 0.5 ? 0.1 : 0),
    wave: armor > 0.5 ? 'triangle' : 'sine',
    low: size > 0.55,
  };
}
