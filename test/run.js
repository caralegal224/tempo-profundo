import { randomPlanet } from '../src/planet.js';
import { World } from '../src/sim.js';
import { presetGenome } from '../src/genome.js';
const seed = +(process.argv[2]||12345);
const p = randomPlanet(seed);
console.log(p.name, p.designation, 'T', p.baseTemp.toFixed(1), 'water', p.water, 'tide', p.tide.toFixed(2), 'moons', p.moons.length, 'star', p.star);
let t=Date.now();
const w = new World(p);
console.log('world built ms', Date.now()-t);
const v = w.vents[0];
w.seed(presetGenome('micro', p), v.x, v.y, 20);
w.seed(presetGenome('plant', p), 0.3, 0.5, 20);
t=Date.now();
for (let s=0;s<6000;s++){ w.step(); if(s%500==0){ const kinds={}; for(const sp of w.species) if(sp.pop>0) kinds[sp.kind]=(kinds[sp.kind]||0)+1; console.log(s, 'n',w.count,'sp',w.living,'tot',w.species.length,'o2',w.o2.toFixed(3), JSON.stringify(kinds)); } }
console.log('ms/step', (Date.now()-t)/6000);
console.log(w.log.slice(-15).map(l=>l.text).join('\n'));
const alive = w.species.filter(s=>s.pop>0).sort((a,b)=>b.pop-a.pop).slice(0,8);
for (const s of alive) console.log(w.binomial(s), '|', s.common, s.pop, s.kind, s.clades.map(c=>w.clades[c].name).join('>'));
