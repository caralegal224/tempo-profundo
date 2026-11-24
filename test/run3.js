import { randomPlanet } from '../src/planet.js';
import { World, NP, P_ } from '../src/sim.js';
import { presetGenome, G } from '../src/genome.js';
const p = randomPlanet(+(process.argv[2]||777));
const w = new World(p);
const ks=['plant','micro','fungus','animal','xeno'];
let u=0.4,v=0.5; // find shallow water
for(let t=0;t<5000;t++){ const x=Math.floor(Math.random()*160), y=20+Math.floor(Math.random()*40); const i=y*160+x; if(!w.land[i]&&w.depth[i]<0.15){u=(x+.5)/160;v=(y+.5)/80;break;} }
w.seed(presetGenome('plant',p), u, v, 25);
for (let s=0;s<1600;s++){ if(s===300) for (const k of ks.slice(1)) w.seed(presetGenome(k,p), u, v, 25);
 w.step(); if(s%100==0){ const kp={}; const en={};
 for(let i=0;i<4200;i++) if(w.alive[i]){ let r=w.asp[i]; while(w.species[r].parent>=0) r=w.species[r].parent; kp[ks[r]]=(kp[ks[r]]||0)+1; en[ks[r]]=(en[ks[r]]||0)+w.aen[i]; }
 console.log(s, w.count, 'sp', w.living, Object.entries(kp).map(([k,v])=>k+':'+v+'/'+(en[k]/v).toFixed(2)).join(' ')); } }
