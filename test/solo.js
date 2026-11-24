import { randomPlanet } from '../src/planet.js';
import { World, NP, P_ } from '../src/sim.js';
import { presetGenome, G } from '../src/genome.js';
const kind = process.argv[2]||'micro';
for (const seed of [1,2,3,4,5,6]) {
  const p = randomPlanet(seed); const w = new World(p);
  let u=0.4,v=0.5;
  for(let t=0;t<9000;t++){ const x=Math.floor(Math.random()*160), y=25+Math.floor(Math.random()*30); const i=y*160+x; if(!w.land[i]&&w.depth[i]<0.12){u=(x+.5)/160;v=(y+.5)/80;break;} }
  w.seed(presetGenome(kind,p), u, v, 16);
  const line=[];
  for (let s=0;s<1500;s++){ w.step(); if(s%150==0) line.push(w.count); }
  let avgE=0; if (w.count) {} 
  console.log(seed, p.baseTemp.toFixed(0), line.join(' '), 'sp', w.living);
}
