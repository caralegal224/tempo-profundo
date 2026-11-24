import { randomPlanet } from '../src/planet.js';
import { World, NP, P_ } from '../src/sim.js';
import { presetGenome, G, phenotype } from '../src/genome.js';
const p = randomPlanet(4); const w = new World(p);
let u=0.4,v=0.5;
for(let t=0;t<9000;t++){ const x=Math.floor(Math.random()*160), y=25+Math.floor(Math.random()*30); const i=y*160+x; if(!w.land[i]&&w.depth[i]<0.12){u=(x+.5)/160;v=(y+.5)/80;break;} }
const g=presetGenome('micro',p); console.log(phenotype(g));
w.seed(g, u, v, 4);
for (let s=0;s<12;s++){ w.step(); for(let i=0;i<4200;i++) if(w.alive[i]){const c=w.cellOf(i); console.log(s,i,'E',w.aen[i].toFixed(3),'age',w.aage[i].toFixed(1),'land',w.land[c],'T',w.temp[c].toFixed(1),'nut',w.nutr[c].toFixed(2),'tid',w.tidal[c].toFixed(2)); break;} }
