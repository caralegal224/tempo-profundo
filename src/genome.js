// Genoma: genes contínuos (0..1), inovações (sinapomorfias) e fenótipo derivado.
import { clamp, lerp, hsl2rgb, fract } from './util.js';

export const GENES = [
  { key: 'size', label: 'Tamanho corporal', hint: 'Maior come o menor, mas precisa de mais energia e se reproduz devagar.' },
  { key: 'multi', label: 'Multicelularidade', hint: 'Permite corpos grandes e tecidos especializados.' },
  { key: 'photo', label: 'Fotossíntese', hint: 'Energia da luz da estrela. Precisa de nutrientes.' },
  { key: 'chemo', label: 'Quimiossíntese', hint: 'Energia de fontes hidrotermais e minerais.' },
  { key: 'pred', label: 'Predação', hint: 'Captura e digere outros organismos.' },
  { key: 'sapro', label: 'Decomposição', hint: 'Absorve matéria orgânica morta.' },
  { key: 'motil', label: 'Locomoção', hint: 'Deslocamento ativo. Custa energia.' },
  { key: 'sense', label: 'Percepção', hint: 'Encontra alimento e foge de predadores.' },
  { key: 'armor', label: 'Couraça', hint: 'Proteção contra predadores. Pesa e custa.' },
  { key: 'topt', label: 'Temperatura ideal', hint: 'Faixa de -40 °C a 80 °C.' },
  { key: 'ttol', label: 'Tolerância térmica', hint: 'Amplitude de temperatura suportada.' },
  { key: 'terra', label: 'Vida terrestre', hint: '0 aquático · 1 terrestre. Zonas de maré facilitam a transição.' },
  { key: 'fecund', label: 'Fecundidade', hint: 'Muitos filhotes frágeis (alto) ou poucos robustos (baixo).' },
  { key: 'mut', label: 'Taxa de mutação', hint: 'Velocidade de variação genética.' },
  { key: 'hue', label: 'Pigmento', hint: 'Cor dominante.' },
  { key: 'pattern', label: 'Padrão', hint: 'Luminosidade e manchas.' },
  { key: 'limbs', label: 'Apêndices', hint: 'Membros, tentáculos, cílios ou raízes.' },
  { key: 'branch', label: 'Ramificação', hint: 'Crescimento ramificado: frondes, hifas, colônias.' },
  { key: 'symm', label: 'Simetria bilateral', hint: '0 radial · 1 bilateral, com cabeça.' },
  { key: 'toxin', label: 'Toxinas', hint: 'Defesa química contra predadores.' },
  { key: 'xeno', label: 'Xenobiologia', hint: 'Bioquímica exótica: litotrofia, formas cristalinas.' },
];
export const NG = GENES.length;
export const G = Object.fromEntries(GENES.map((g, i) => [g.key, i]));

// Sinapomorfias: inovações reconhecidas pelo sistema taxonômico.
export const INNOV = [
  { key: 'multi', gene: G.multi, th: 0.6, name: 'Multicelularidade', root: 'Metacyt' },
  { key: 'photo', gene: G.photo, th: 0.5, name: 'Cloroplastos', root: 'Chlor' },
  { key: 'chemo', gene: G.chemo, th: 0.5, name: 'Quimiossíntese', root: 'Lith' },
  { key: 'pred', gene: G.pred, th: 0.5, name: 'Fagotrofia', root: 'Phag' },
  { key: 'sapro', gene: G.sapro, th: 0.5, name: 'Hifas absortivas', root: 'Hyph' },
  { key: 'motil', gene: G.motil, th: 0.5, name: 'Locomoção ativa', root: 'Kinet' },
  { key: 'sense', gene: G.sense, th: 0.55, name: 'Olhos', root: 'Ophthalm' },
  { key: 'armor', gene: G.armor, th: 0.55, name: 'Carapaça', root: 'Ostrac' },
  { key: 'terra', gene: G.terra, th: 0.5, name: 'Vida terrestre', root: 'Ge' },
  { key: 'limbs', gene: G.limbs, th: 0.55, name: 'Membros articulados', root: 'Arthr' },
  { key: 'branch', gene: G.branch, th: 0.55, name: 'Ramificação', root: 'Clad' },
  { key: 'symm', gene: G.symm, th: 0.62, name: 'Bilateralidade', root: 'Bilater' },
  { key: 'toxin', gene: G.toxin, th: 0.6, name: 'Glândulas de toxina', root: 'Tox' },
  { key: 'giant', gene: G.size, th: 0.74, name: 'Gigantismo', root: 'Megal' },
  { key: 'xtol', gene: G.ttol, th: 0.72, name: 'Extremofilia', root: 'Extrem' },
  { key: 'xeno', gene: G.xeno, th: 0.6, name: 'Bioquímica exótica', root: 'Xen' },
];
export const INNOV_BY_KEY = Object.fromEntries(INNOV.map((d) => [d.key, d]));

export function innovationsOf(g) {
  const out = [];
  for (const d of INNOV) {
    if (g[d.gene] >= d.th) {
      if (d.key === 'limbs' && g[G.multi] < 0.45) continue;
      if (d.key === 'giant' && g[G.multi] < 0.5) continue;
      out.push(d.key);
    }
  }
  return out;
}

export const KINDS = {
  micro: { label: 'Microrganismo', kingdom: 'Protobionta' },
  plant: { label: 'Planta', kingdom: 'Phytobionta' },
  fungus: { label: 'Fungo', kingdom: 'Mycobionta' },
  animal: { label: 'Animal', kingdom: 'Zoobionta' },
  xeno: { label: 'Anômalo', kingdom: 'Xenobionta' },
};

// tipo de corpo derivado (o fenótipo evolui; a origem não)
export function kindOf(g) {
  if (g[G.xeno] > 0.6) return 'xeno';
  if (g[G.multi] < 0.38) return 'micro';
  const photo = g[G.photo], sapro = g[G.sapro], pred = g[G.pred], mot = g[G.motil], chemo = g[G.chemo];
  if (mot > 0.38 || (pred > photo && pred > sapro && pred > chemo)) return 'animal';
  if (photo >= sapro && photo >= chemo) return 'plant';
  if (sapro >= chemo) return 'fungus';
  return 'xeno';
}

export const sizeMeters = (s) => Math.pow(10, -6 + 7.4 * s);
export function fmtSize(m) {
  if (m < 1e-3) return `${(m * 1e6).toFixed(m < 1e-5 ? 1 : 0)} µm`;
  if (m < 1e-2) return `${(m * 1e3).toFixed(1)} mm`;
  if (m < 1) return `${(m * 100).toFixed(1)} cm`;
  return `${m.toFixed(m < 10 ? 2 : 1)} m`;
}
export const tempOpt = (v) => -40 + 120 * v;
export const tempTol = (v) => 3 + 45 * v;

// limite de tamanho imposto pela organização celular
export const sizeCap = (multi) => 0.2 + multi * 0.9;

export function phenotype(g, out = {}) {
  const ph = g[G.photo], ch = g[G.chemo], pr = g[G.pred], sa = g[G.sapro];
  const sum = ph + ch + pr + sa + 0.15;
  // especialistas são mais eficientes que generalistas
  const mb = 1 + g[G.multi] * 0.25; // divisão de trabalho entre tecidos
  out.ePhoto = ph * (0.35 + 0.65 * ph / sum) * mb;
  out.eChemo = ch * (0.35 + 0.65 * ch / sum) * mb;
  out.ePred = pr * (0.35 + 0.65 * pr / sum) * mb;
  out.eSapro = sa * (0.35 + 0.65 * sa / sum) * mb;
  out.size = g[G.size];
  out.tempo = lerp(1.5, 0.32, g[G.size]); // ritmo metabólico por massa (Kleiber)
  const over = Math.max(0, g[G.size] - sizeCap(g[G.multi]));
  out.basal = 0.007 + over * 1.6 + g[G.multi] * 0.008;
  out.moveCost = g[G.motil] * (0.012 + g[G.armor] * 0.02) * (0.6 + g[G.size] * 0.6);
  out.upkeep = g[G.sense] * 0.006 + g[G.armor] * 0.008 + g[G.toxin] * 0.007 + g[G.limbs] * 0.004 + g[G.branch] * 0.002 + g[G.ttol] * 0.006;
  out.speed = g[G.motil] * (0.35 + g[G.limbs] * 0.5 + g[G.symm] * 0.2) * (0.6 + g[G.size] * 0.7);
  out.topt = tempOpt(g[G.topt]);
  out.ttol = tempTol(g[G.ttol]);
  out.terra = g[G.terra];
  out.lifespan = lerp(75, 450, g[G.size]) * (1 - g[G.fecund] * 0.35);
  out.litter = 1 + Math.floor(g[G.fecund] * 3.2);
  out.mut = 0.004 + g[G.mut] * 0.05;
  out.disperse = 0.5 + g[G.motil] * 0.5 + g[G.branch] * 1.6 + g[G.fecund] * 1.5;
  out.defense = g[G.armor] * 0.7 + g[G.toxin] * 0.5;
  out.kind = kindOf(g);
  return out;
}

// Cor da espécie. Fotossintetizantes adaptam pigmento ao espectro da estrela.
export function speciesColor(g, star = 'G') {
  let h = g[G.hue];
  let s = 0.35 + g[G.pattern] * 0.25;
  let l = 0.38 + g[G.pattern] * 0.3;
  const k = kindOf(g);
  if (k === 'plant' || (k === 'micro' && g[G.photo] > 0.5)) {
    const base = { M: 0.83, K: 0.02, G: 0.28, F: 0.16 }[star] ?? 0.28;
    h = base + (h - 0.5) * 0.18;
    if (star === 'M') l *= 0.6;
  }
  if (k === 'fungus') { s *= 0.55; l = 0.5 + g[G.pattern] * 0.3; }
  if (k === 'xeno') { s = 0.55; l = 0.6; }
  return hsl2rgb(fract(h), clamp(s), clamp(l));
}

export function geneDistance(a, b) {
  let d = 0;
  for (let i = 0; i < NG; i++) {
    let x = a[i] - b[i];
    if (i === G.hue) { x = Math.abs(x); x = Math.min(x, 1 - x) * 0.4; }
    else if (i === G.pattern || i === G.mut) x *= 0.5;
    d += x * x;
  }
  return Math.sqrt(d);
}

export function mutate(g, rate, scale, rng) {
  for (let i = 0; i < NG; i++) {
    if (rng.next() < rate * 4) {
      let v = g[i] + rng.gauss() * 0.024 * scale;
      if (i === G.hue) v = fract(v);
      g[i] = clamp(v);
    }
  }
  // macro-mutação rara (duplicação gênica, simbiose)
  if (rng.next() < rate * 0.02 * scale) {
    const i = Math.floor(rng.next() * NG);
    if (i !== G.hue) g[i] = clamp(g[i] + (rng.next() - 0.4) * 0.25);
  }
}

// Organismos-base, propositalmente simples
export function presetGenome(kind, planet) {
  const g = new Float32Array(NG);
  const set = (o) => { for (const k in o) g[G[k]] = o[k]; };
  const t = planet ? clamp((planet.baseTemp + 40) / 120) : 0.45;
  set({ size: 0.06, multi: 0.04, photo: 0.1, chemo: 0.1, pred: 0.05, sapro: 0.2, motil: 0.15, sense: 0.05, armor: 0.05,
    topt: t, ttol: 0.35, terra: 0.03, fecund: 0.6, mut: 0.4, hue: Math.random(), pattern: 0.4, limbs: 0.05, branch: 0.05, symm: 0.1, toxin: 0.02, xeno: 0.02 });
  if (kind === 'micro') set({ sapro: 0.45, chemo: 0.25, photo: 0.15, motil: 0.25, size: 0.04, ttol: 0.45 });
  if (kind === 'plant') set({ photo: 0.55, sapro: 0.05, chemo: 0.02, motil: 0.04, branch: 0.18, multi: 0.16, size: 0.1 });
  if (kind === 'fungus') set({ sapro: 0.62, photo: 0.02, chemo: 0.04, motil: 0.03, branch: 0.3, multi: 0.2, size: 0.09, hue: 0.1 });
  if (kind === 'animal') set({ pred: 0.42, sapro: 0.12, photo: 0.02, chemo: 0.02, motil: 0.5, sense: 0.18, multi: 0.24, size: 0.12, symm: 0.3 });
  if (kind === 'xeno') set({ chemo: 0.55, xeno: 0.5, armor: 0.25, sapro: 0.05, photo: 0.05, motil: 0.12, ttol: 0.6, size: 0.08 });
  return g;
}

export const cloneG = (g) => Float32Array.from(g);
