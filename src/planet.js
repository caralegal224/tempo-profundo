// Geração de planetas: parâmetros físicos, relevo, luas, nomes.
import { RNG, Noise3, clamp, lonLatToXYZ, lerp } from './util.js';

export const HW = 640, HH = 320;   // relevo em alta resolução (render)
export const GW = 160, GH = 80;    // grade da simulação

export const STARS = {
  M: { name: 'Anã vermelha (M)', temp: 3300, lum: 0.045, mass: 0.35, color: [1.0, 0.62, 0.42] },
  K: { name: 'Anã laranja (K)', temp: 4600, lum: 0.32, mass: 0.75, color: [1.0, 0.82, 0.64] },
  G: { name: 'Anã amarela (G)', temp: 5750, lum: 1.0, mass: 1.0, color: [1.0, 0.96, 0.88] },
  F: { name: 'Branco-amarela (F)', temp: 6700, lum: 2.6, mass: 1.35, color: [0.88, 0.93, 1.0] },
};

const SYL = ['ka', 've', 'lo', 'ri', 'thu', 'mar', 'ze', 'on', 'ys', 'tal', 'qu', 'or', 'eth', 'ni', 'sa', 'dra', 'ul', 'vi', 'ko', 'ar', 'el', 'phe', 'ion', 'ny', 'ce', 'bra', 'to', 'mi', 'xe', 'go'];
const ENDS = ['ia', 'on', 'is', 'ara', 'eth', 'os', 'ea', 'ux', 'ane', 'yr', 'ix', 'ume'];
const FLAVOR = {
  frio: ['Kryo', 'Nix', 'Gel', 'Bor', 'Hiem'],
  quente: ['Pyr', 'Ign', 'Ther', 'Sol', 'Caum'],
  oceano: ['Thal', 'Pel', 'Hydr', 'Nere', 'Aqu'],
  seco: ['Psam', 'Xer', 'Ari', 'Dips', 'Sic'],
  luas: ['Selen', 'Lun', 'Men', 'Cyn'],
  neutro: ['Ter', 'Gai', 'Vel', 'Or', 'Ael', 'Myr'],
};
const CATALOG = ['KOI', 'TOI', 'HD', 'Gliese', 'Kepler', 'TRAPPIST', 'LHS', 'Wolf', 'HIP'];

function word(rng, root) {
  let w = root || '';
  const n = root ? rng.int(0, 1) : rng.int(1, 2);
  for (let i = 0; i < n; i++) w += rng.pick(SYL);
  w += rng.pick(ENDS);
  w = w.replace(/(.)\1\1/g, '$1$1');
  return w[0].toUpperCase() + w.slice(1);
}

export function planetName(p, rng) {
  let key = 'neutro';
  if (p.baseTemp < -5) key = 'frio';
  else if (p.baseTemp > 32) key = 'quente';
  else if (p.water > 0.8) key = 'oceano';
  else if (p.water < 0.35) key = 'seco';
  else if (p.moons.length >= 3) key = 'luas';
  const root = rng.chance(0.75) ? rng.pick(FLAVOR[key]).toLowerCase() : '';
  let n = word(rng, root);
  if (n.length > 11) n = n.slice(0, 9) + rng.pick(['a', 'is', 'on']);
  n = n[0].toUpperCase() + n.slice(1);
  const cat = rng.pick(CATALOG);
  const des = `${cat}-${rng.int(100, 9999)} ${'bcdef'[rng.int(0, 3)]}`;
  return { name: n, designation: des };
}

export function moonName(rng) { return word(rng); }

// Calcula grandezas derivadas (temperatura de equilíbrio, maré, ano...)
export function derive(p) {
  const st = STARS[p.star];
  p.gravity = p.radius > 0 ? p.mass / (p.radius * p.radius) : 1;
  const teq = 278 * Math.pow(st.lum, 0.25) / Math.sqrt(p.orbit) * Math.pow(1 - 0.3, 0.25) / Math.pow(0.7, 0.25);
  const greenhouse = 33 * Math.pow(p.atmosphere, 0.6) * (0.6 + 0.4 * p.water);
  p.baseTemp = teq - 273 + greenhouse - 18; // °C médio
  p.yearDays = 365.25 * Math.sqrt(Math.pow(p.orbit, 3) / st.mass);
  p.insolation = st.lum / (p.orbit * p.orbit);
  // maré: soma de M/d³ normalizada à Lua da Terra
  let tide = 0, big = 0;
  for (const m of p.moons) {
    const mass = Math.pow(m.size, 3);
    tide += mass / Math.pow(m.dist / 60, 3) / Math.pow(p.radius, 0.5);
    big = Math.max(big, mass / p.mass);
    m.period = 27.3 * Math.sqrt(Math.pow(m.dist / 60, 3) / Math.max(0.1, p.mass)) * Math.pow(p.radius, 1.5);
  }
  // maré solar
  tide += 0.46 * st.mass / Math.pow(p.orbit, 3);
  p.tide = tide;
  p.tiltStability = clamp(big * 60, 0, 1); // luas grandes estabilizam a inclinação axial
  p.climateChaos = 1 - 0.8 * p.tiltStability;
  return p;
}

export function randomPlanet(seed) {
  const rng = new RNG(seed);
  const star = rng.pick(['M', 'K', 'G', 'G', 'G', 'F', 'K']);
  const st = STARS[star];
  const p = {
    seed, star,
    radius: +rng.range(0.6, 1.7).toFixed(2),
    orbit: +(Math.sqrt(st.lum) * rng.range(0.85, 1.22)).toFixed(3),
    atmosphere: +rng.range(0.4, 2.4).toFixed(2),
    water: +rng.range(0.3, 0.92).toFixed(2),
    tilt: +rng.range(0, 40).toFixed(1),
    dayHours: +rng.range(9, 52).toFixed(1),
    volcanism: +rng.range(0.15, 0.9).toFixed(2),
    roughness: +rng.range(0.35, 0.85).toFixed(2),
    continents: rng.int(2, 7),
    moons: [],
  };
  p.mass = +(Math.pow(p.radius, 3) * rng.range(0.75, 1.15)).toFixed(2);
  const nm = rng.pick([0, 1, 1, 1, 2, 2, 3, 4]);
  for (let i = 0; i < nm; i++) p.moons.push(newMoon(rng, i));
  derive(p);
  Object.assign(p, planetName(p, rng));
  return p;
}

export function newMoon(rng, i = 0) {
  const palette = [[0.75, 0.73, 0.7], [0.82, 0.7, 0.55], [0.6, 0.65, 0.72], [0.85, 0.82, 0.76], [0.66, 0.55, 0.5]];
  return {
    name: moonName(rng),
    size: +rng.range(0.15, 1.4).toFixed(2), // raio relativo à Lua terrestre
    dist: +rng.range(18 + i * 25, 70 + i * 45).toFixed(0), // em raios planetários (Lua = 60)
    phase: rng.next(),
    color: rng.pick(palette),
    seed: rng.int(1, 1e9),
  };
}

// Relevo: gera campo de elevação [-1,1] em alta resolução
export function generateTerrain(p) {
  const n = new Noise3(p.seed);
  const n2 = new Noise3(p.seed * 7 + 13);
  const rng = new RNG(p.seed ^ 0x5bd1e995);
  const elev = new Float32Array(HW * HH);
  // centros de continentes
  const cents = [];
  for (let i = 0; i < p.continents; i++) {
    const u = rng.next(), v = rng.range(0.22, 0.78);
    cents.push({ c: lonLatToXYZ(u, v), r: rng.range(0.55, 1.1) });
  }
  const rough = p.roughness;
  for (let y = 0; y < HH; y++) {
    for (let x = 0; x < HW; x++) {
      const [X, Y, Z] = lonLatToXYZ((x + 0.5) / HW, (y + 0.5) / HH);
      // domínio torcido para formas orgânicas
      const wx = n2.fbm(X * 1.3, Y * 1.3, Z * 1.3, 3) * 0.45;
      const wy = n2.fbm(X * 1.3 + 9, Y * 1.3 + 3, Z * 1.3, 3) * 0.45;
      let cont = 0;
      for (const c of cents) {
        const d = X * c.c[0] + Y * c.c[1] + Z * c.c[2];
        cont = Math.max(cont, (d - (1 - c.r)) / c.r);
      }
      const base = n.fbm(X * 1.6 + wx, Y * 1.6 + wy, Z * 1.6, 6, 2.0, 0.52);
      const ridge = n2.ridged(X * 2.4 + wy, Y * 2.4, Z * 2.4 + wx, 5);
      let e = base * 0.9 + (cont - 0.35) * 0.9 + (ridge - 0.45) * 0.55 * rough;
      e += n.fbm(X * 9, Y * 9, Z * 9, 3) * 0.06 * rough;
      elev[y * HW + x] = e;
    }
  }
  normalize(elev);
  return elev;
}

function normalize(a) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < a.length; i++) { if (a[i] < mn) mn = a[i]; if (a[i] > mx) mx = a[i]; }
  const k = 2 / (mx - mn);
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - mn) * k - 1;
}

// nível do mar a partir da fração de água (quantil da elevação)
export function seaLevelFor(elev, water) {
  const s = Float32Array.from(elev).sort();
  return s[Math.min(s.length - 1, Math.floor(clamp(water, 0, 0.999) * s.length))];
}

// pontos hidrotermais / vulcânicos
export function generateVents(p, elev) {
  const rng = new RNG(p.seed + 4242);
  const vents = [];
  const count = Math.round(4 + p.volcanism * 22);
  let tries = 0;
  while (vents.length < count && tries++ < 4000) {
    const x = rng.next(), y = rng.range(0.08, 0.92);
    const e = elev[Math.floor(y * HH) * HW + Math.floor(x * HW)];
    // preferem dorsais oceânicas e cadeias montanhosas (extremos)
    if (Math.abs(e) > 0.15 || rng.chance(0.12)) vents.push({ x, y, power: rng.range(0.5, 1.2) });
  }
  return vents;
}

// Estampa uma cratera / pincel de relevo (coords normalizadas)
export function stampElevation(elev, u, v, radius, amount, crater = false) {
  const rx = radius * HW, ry = radius * HW;
  const cx = u * HW, cy = v * HH;
  const lat = (0.5 - v) * Math.PI;
  const stretch = 1 / Math.max(0.2, Math.cos(lat));
  for (let dy = -ry; dy <= ry; dy++) {
    const y = Math.round(cy + dy); if (y < 0 || y >= HH) continue;
    for (let dx = -rx * stretch; dx <= rx * stretch; dx++) {
      const x = ((Math.round(cx + dx) % HW) + HW) % HW;
      const d = Math.hypot(dx / stretch, dy) / rx;
      if (d > 1) continue;
      const i = y * HW + x;
      if (crater) {
        const bowl = -Math.cos(Math.min(1, d / 0.8) * Math.PI * 0.5) * 1.0;
        const rim = Math.exp(-Math.pow((d - 0.85) / 0.1, 2)) * 0.5;
        elev[i] = lerp(elev[i], elev[i] + (bowl + rim) * amount, 1 - Math.pow(d, 6));
      } else {
        const f = (1 - d * d); elev[i] = clamp(elev[i] + amount * f * f, -1, 1);
      }
    }
  }
}
