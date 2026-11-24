// Nomenclatura binomial gerada a partir de traços e sinapomorfias.
import { G, kindOf, innovationsOf, KINDS, sizeMeters } from './genome.js';

const PREFIX = {
  photo: ['Chloro', 'Helio', 'Phyco', 'Photo'],
  chemo: ['Litho', 'Thio', 'Ferro', 'Chemo'],
  pred: ['Phago', 'Sarco', 'Lyco', 'Thero'],
  sapro: ['Sapro', 'Myco', 'Necro', 'Hypho'],
  motil: ['Tachy', 'Kineto', 'Dromo', 'Nauto'],
  sense: ['Ophthalmo', 'Opto', 'Sceno', 'Argo'],
  armor: ['Ostraco', 'Phracto', 'Lorico', 'Aspido'],
  terra: ['Geo', 'Chthono', 'Petro', 'Xero'],
  limbs: ['Polypo', 'Chiro', 'Arthro', 'Scelo'],
  branch: ['Clado', 'Dendro', 'Rhizo', 'Thallo'],
  toxin: ['Toxo', 'Pharmaco', 'Echid', 'Io'],
  big: ['Mega', 'Gigant', 'Macro', 'Titano'],
  small: ['Micro', 'Nano', 'Lepto', 'Pico'],
  cold: ['Cryo', 'Psychro', 'Chiono'],
  hot: ['Thermo', 'Pyro', 'Caumo'],
  xeno: ['Xeno', 'Allo', 'Atopo', 'Crystallo'],
};
const SUFFIX = {
  micro: ['coccus', 'monas', 'bacter', 'cystis', 'ella', 'plasma', 'spira'],
  plant: ['phyton', 'phyllum', 'thallus', 'carpus', 'stachys'],
  alga: ['phycus', 'thrix', 'nema', 'phycus'],
  fungus: ['myces', 'spora', 'porus', 'cybe'],
  animal: ['zoon', 'pus', 'cephalus', 'morpha', 'gnathus', 'soma', 'urus'],
  bigAnimal: ['saurus', 'therium', 'odon', 'ceras'],
  xeno: ['lithos', 'morpha', 'crystis', 'ode', 'gonon'],
};
const CLADE_SUFFIX = { micro: 'bionta', plant: 'phyta', fungus: 'mycota', animal: 'zoa', xeno: 'morpha' };

const ADJ = { // [masc, fem, neutro]
  ruber: ['ruber', 'rubra', 'rubrum'], aurant: ['aurantiacus', 'aurantiaca', 'aurantiacum'],
  flavus: ['flavus', 'flava', 'flavum'], viridis: ['viridis', 'viridis', 'viride'],
  caeruleus: ['caeruleus', 'caerulea', 'caeruleum'], violaceus: ['violaceus', 'violacea', 'violaceum'],
  purpureus: ['purpureus', 'purpurea', 'purpureum'], niger: ['niger', 'nigra', 'nigrum'],
  albus: ['albus', 'alba', 'album'], magnus: ['magnus', 'magna', 'magnum'],
  minimus: ['minimus', 'minima', 'minimum'], velox: ['velox', 'velox', 'velox'],
  marinus: ['marinus', 'marina', 'marinum'], terrestris: ['terrestris', 'terrestris', 'terrestre'],
  thermophilus: ['thermophilus', 'thermophila', 'thermophilum'], cryophilus: ['cryophilus', 'cryophila', 'cryophilum'],
  venenosus: ['venenosus', 'venenosa', 'venenosum'], armatus: ['armatus', 'armata', 'armatum'],
  oculatus: ['oculatus', 'oculata', 'oculatum'], ramosus: ['ramosus', 'ramosa', 'ramosum'],
  vorax: ['vorax', 'vorax', 'vorax'], abyssalis: ['abyssalis', 'abyssalis', 'abyssale'],
  littoralis: ['littoralis', 'littoralis', 'littorale'], hydrothermalis: ['hydrothermalis', 'hydrothermalis', 'hydrothermale'],
  primigenius: ['primigenius', 'primigenia', 'primigenium'], prolifer: ['prolifer', 'prolifera', 'proliferum'],
  mirabilis: ['mirabilis', 'mirabilis', 'mirabile'], gracilis: ['gracilis', 'gracilis', 'gracile'],
};

function gender(genus) {
  if (/(a|is|ella|monas|cystis|spora|thrix|stachys|cybe|ode|morpha|spira)$/.test(genus)) return 1;
  if (/(um|on|zoon|plasma|soma|nema|lithos|gonon|therium)$/.test(genus)) return 2;
  return 0;
}

function hueAdj(g) {
  const l = g[G.pattern];
  if (l < 0.12) return 'niger';
  if (l > 0.9) return 'albus';
  const h = g[G.hue];
  const names = ['ruber', 'aurant', 'flavus', 'viridis', 'viridis', 'caeruleus', 'caeruleus', 'violaceus', 'purpureus', 'ruber'];
  return names[Math.floor(h * 9.999)];
}

function dominantTraits(g) {
  const cand = [
    ['photo', g[G.photo]], ['chemo', g[G.chemo]], ['pred', g[G.pred]], ['sapro', g[G.sapro]],
    ['motil', g[G.motil] * 0.8], ['sense', g[G.sense] * 0.9], ['armor', g[G.armor] * 0.9], ['terra', g[G.terra] * 0.7],
    ['limbs', g[G.limbs] * 0.85], ['branch', g[G.branch] * 0.8], ['toxin', g[G.toxin]], ['xeno', g[G.xeno] * 1.2],
    ['big', (g[G.size] - 0.5) * 1.6], ['small', (0.15 - g[G.size]) * 4],
    ['cold', (0.25 - g[G.topt]) * 3], ['hot', (g[G.topt] - 0.62) * 3],
  ];
  cand.sort((a, b) => b[1] - a[1]);
  return cand;
}

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export function makeGenusName(g, rng, taken) {
  const k = kindOf(g);
  const dom = dominantTraits(g);
  let sufKey = k;
  if (k === 'plant' && g[G.terra] < 0.4) sufKey = 'alga';
  if (k === 'animal' && g[G.size] > 0.62) sufKey = 'bigAnimal';
  for (let tries = 0; tries < 30; tries++) {
    const trait = dom[Math.min(dom.length - 1, Math.floor(rng.next() * (tries < 10 ? 2 : 5)))][0];
    let pre = rng.pick(PREFIX[trait]);
    let suf = rng.pick(SUFFIX[sufKey]);
    // elisão de vogais (Phago + odon -> Phagodon)
    if (/[aeiou]$/.test(pre) && /^[aeiou]/.test(suf)) pre = pre.slice(0, -1);
    const name = pre + suf;
    if (!taken.has(name)) return name;
  }
  const keys = Object.keys(PREFIX);
  for (let tries = 0; tries < 60; tries++) {
    let a = rng.pick(PREFIX[dom[Math.floor(rng.next() * 3)][0]]);
    let b = rng.pick(PREFIX[rng.pick(keys)]).toLowerCase();
    let suf = rng.pick(SUFFIX[sufKey]);
    if (/[aeiou]$/.test(b) && /^[aeiou]/.test(suf)) b = b.slice(0, -1);
    const name = a + b + suf;
    if (a.toLowerCase() !== b && !taken.has(name)) return name;
  }
  return rng.pick(PREFIX.xeno) + rng.pick(SUFFIX[sufKey]) + rng.int(2, 99);
}

export function makeEpithet(genus, g, rng, ctx = {}) {
  const pool = [hueAdj(g)];
  if (g[G.size] > 0.6) pool.push('magnus');
  if (g[G.size] < 0.08) pool.push('minimus');
  if (g[G.motil] > 0.6) pool.push('velox');
  if (g[G.terra] < 0.3) pool.push('marinus');
  if (g[G.terra] > 0.6) pool.push('terrestris');
  if (g[G.topt] > 0.62) pool.push('thermophilus');
  if (g[G.topt] < 0.3) pool.push('cryophilus');
  if (g[G.toxin] > 0.5) pool.push('venenosus');
  if (g[G.armor] > 0.5) pool.push('armatus');
  if (g[G.sense] > 0.5) pool.push('oculatus');
  if (g[G.branch] > 0.5) pool.push('ramosus');
  if (g[G.pred] > 0.6) pool.push('vorax');
  if (g[G.fecund] > 0.75) pool.push('prolifer');
  if (g[G.xeno] > 0.5) pool.push('mirabilis');
  if (g[G.size] < 0.3 && g[G.motil] > 0.3) pool.push('gracilis');
  if (ctx.vent) pool.push('hydrothermalis');
  if (ctx.tidal) pool.push('littoralis');
  if (ctx.deep) pool.push('abyssalis');
  if (ctx.first) pool.push('primigenius', 'primigenius');
  const gen = gender(genus);
  const adj = ADJ[rng.pick(pool)] || ADJ.mirabilis;
  return adj[gen];
}

// --- Nome popular em português ---
const COLOR_PT = ['rubro', 'acobreado', 'dourado', 'esmeralda', 'verde', 'anil', 'azul', 'violáceo', 'púrpura', 'rubro'];
export function makeCommonName(g, rng, ctx = {}) {
  const k = kindOf(g);
  const m = sizeMeters(g[G.size]);
  const terra = g[G.terra] > 0.5;
  let noun;
  if (k === 'micro') {
    if (g[G.photo] > 0.4) noun = g[G.multi] > 0.2 ? 'colônia-verde' : 'microalga';
    else if (g[G.pred] > 0.35) noun = g[G.motil] > 0.4 ? 'flagelado' : 'ameba';
    else if (g[G.chemo] > 0.35) noun = 'arqueia';
    else if (g[G.sapro] > 0.35) noun = g[G.branch] > 0.3 ? 'levedura' : 'bactéria';
    else noun = 'protocélula';
  } else if (k === 'plant') {
    if (!terra) noun = m > 1 ? 'alga-gigante' : 'alga';
    else if (m < 0.02) noun = 'musgo';
    else if (m < 0.5) noun = g[G.branch] > 0.5 ? 'samambaia' : 'erva';
    else if (m < 3) noun = 'arbusto';
    else noun = 'árvore';
  } else if (k === 'fungus') {
    if (g[G.photo] > 0.3) noun = 'líquen';
    else if (m < 0.01) noun = 'bolor';
    else noun = g[G.branch] > 0.6 ? 'fungo-coral' : 'cogumelo';
  } else if (k === 'animal') {
    const limbs = g[G.limbs] > 0.5, armor = g[G.armor] > 0.55, bil = g[G.symm] > 0.5;
    if (!bil) noun = terra ? 'polipóide' : (m > 0.05 ? 'medusa' : 'pólipo');
    else if (!limbs) noun = terra ? 'verme' : (g[G.motil] > 0.55 && m > 0.03 ? 'peixe' : 'verme');
    else if (armor) noun = terra ? (m > 0.1 ? 'tatuzão' : 'besouro') : 'crustáceo';
    else if (terra) noun = m > 1 ? (g[G.pred] > 0.5 ? 'fera' : 'pastador') : (m > 0.08 ? 'lagarto' : 'aracnóide');
    else noun = m > 1 ? 'leviatã' : 'nadador';
  } else noun = rng.pick(['cristalóide', 'litóvoro', 'geodo-vivo', 'filamento-mineral']);

  const parts = [noun];
  const l = g[G.pattern];
  if (rng.chance(0.75)) parts.push(l < 0.12 ? 'negro' : l > 0.9 ? 'pálido' : COLOR_PT[Math.floor(g[G.hue] * 9.999)]);
  const tails = [];
  if (ctx.vent) tails.push('das-fontes');
  if (ctx.tidal) tails.push('das-marés');
  if (ctx.deep) tails.push('abissal');
  if (g[G.size] > 0.72) tails.push('gigante');
  if (g[G.toxin] > 0.6) tails.push('venenoso');
  if (g[G.sense] > 0.6) tails.push('de-muitos-olhos');
  if (g[G.topt] < 0.25) tails.push('do-gelo');
  if (g[G.topt] > 0.7) tails.push('termal');
  if (tails.length && rng.chance(0.7)) parts.push(rng.pick(tails));
  const s = parts.join('-');
  return s[0].toUpperCase() + s.slice(1);
}

export function cladeName(innovKey, kind, rootOverride, taken, rng) {
  const roots = {
    multi: 'Metacyto', photo: 'Chloro', chemo: 'Litho', pred: 'Phago', sapro: 'Hypho', motil: 'Kineto',
    sense: 'Ophthalmo', armor: 'Ostraco', terra: 'Geo', limbs: 'Arthro', branch: 'Clado', symm: 'Bilatero',
    toxin: 'Toxo', giant: 'Megalo', xtol: 'Extremo', xeno: 'Xeno',
  };
  let base = (rootOverride || roots[innovKey] || 'Neo') + CLADE_SUFFIX[kind];
  base = base.replace(/oa(?=bionta|phyta|mycota|zoa|morpha)/, 'o').replace(/([aeiou])([aeiou])(?=zoa)/, '$1');
  if (!taken.has(base)) return base;
  for (const p of ['Neo', 'Pseudo', 'Para', 'Allo', 'Eu', 'Proto', 'Hetero', 'Homo', 'Deutero', 'Trito', 'Meso', 'Pan', 'Hyper', 'Cryptо'.replace('о','o')]) {
    const nm = p + base.toLowerCase();
    if (!taken.has(nm)) return nm;
  }
  return base + rng.int(2, 99);
}

export function higherTaxa(genus, kind) {
  const stem = genus.replace(/(us|um|on|a|es|is|os|ys|x)$/, '').replace(/(ph|th|ch)$/, '$1');
  if (kind === 'animal') return { order: stem + 'iformes', family: stem + 'idae' };
  if (kind === 'plant') return { order: stem + 'ales', family: stem + 'aceae' };
  if (kind === 'fungus') return { order: stem + 'ales', family: stem + 'aceae' };
  return { order: stem + 'ales', family: stem + 'aceae' };
}

export const kingdomOf = (kind) => KINDS[kind].kingdom;
export { hashStr, innovationsOf };
