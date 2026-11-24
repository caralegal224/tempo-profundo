import { randomPlanet } from '../src/planet.js';
import { World } from '../src/sim.js';
import { presetGenome, G, GENES } from '../src/genome.js';
const p = randomPlanet(+(process.argv[2]||777));
const w = new World(p);
for (const k of ['micro','plant','fungus','animal','xeno']) { const v=w.vents[Math.floor(Math.random()*w.vents.length)]; w.seed(presetGenome(k,p), k==='plant'?0.4:v.x, k==='plant'?0.5:v.y, 25); }
const steps=+(process.argv[3]||6000);
for (let s=0;s<steps;s++){ w.step(); if(s%1000==0){ const kinds={}; for(const sp of w.species) if(sp.pop>0) kinds[sp.kind]=(kinds[sp.kind]||0)+sp.pop; console.log(s,'n',w.count,'sp',w.living,'tot',w.species.length,'o2',w.o2.toFixed(3),JSON.stringify(kinds)); } }
// mean genome
const m=new Float64Array(GENES.length); let n=0;
for (const sp of w.species) if (sp.pop>0){ for(let k=0;k<m.length;k++) m[k]+=sp.mean[k]*sp.pop; n+=sp.pop; }
console.log(GENES.map((g,k)=>g.key+':'+(m[k]/n).toFixed(2)).join(' '));
const alive = w.species.filter(s=>s.pop>0).sort((a,b)=>b.pop-a.pop).slice(0,12);
for (const s of alive) console.log(w.binomial(s), '|', s.common, s.pop, s.kind, 'size',s.mean[G.size].toFixed(2),'pred',s.mean[G.pred].toFixed(2),'terra',s.mean[G.terra].toFixed(2), s.clades.map(c=>w.clades[c].name).join('>'));
console.log(w.clades.map(c=>c.name).join(', '));
