import { randomPlanet } from '../src/planet.js';
import { World } from '../src/sim.js';
import { presetGenome, G, GENES } from '../src/genome.js';
const seed=+(process.argv[2]||2), steps=+(process.argv[3]||3000);
const p = randomPlanet(seed); const w = new World(p);
let u=0.4,v=0.5;
for(let t=0;t<9000;t++){ const x=Math.floor(Math.random()*160), y=25+Math.floor(Math.random()*30); const i=y*160+x; if(!w.land[i]&&w.depth[i]<0.12){u=(x+.5)/160;v=(y+.5)/80;break;} }
w.seed(presetGenome('micro',p), u, v, 16);
let orgSum=()=>{let s=0; for(const x of w.org) s+=x; return s.toFixed(0);};
for (let s=0;s<steps;s++){ w.step(); if(s%500==499){
 const m=new Float64Array(GENES.length); let n=0; for (const sp of w.species) if (sp.pop>0){ for(let k=0;k<m.length;k++) m[k]+=sp.mean[k]*sp.pop; n+=sp.pop; }
 console.log(s+1, 'n',w.count,'sp',w.living,'org',orgSum(),'o2',w.o2.toFixed(3), ['size','multi','photo','chemo','pred','sapro','motil','terra'].map(k=>k+':'+(m[G[k]]/n).toFixed(2)).join(' ')); } }
