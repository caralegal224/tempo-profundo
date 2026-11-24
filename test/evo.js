import { randomPlanet } from '../src/planet.js';
import { World } from '../src/sim.js';
import { presetGenome, G } from '../src/genome.js';
for (const seed of [1,2,3]) {
  const p = randomPlanet(seed); const w = new World(p);
  let u=0.4,v=0.5;
  for(let t=0;t<9000;t++){ const x=Math.floor(Math.random()*160), y=25+Math.floor(Math.random()*30); const i=y*160+x; if(!w.land[i]&&w.depth[i]<0.12){u=(x+.5)/160;v=(y+.5)/80;break;} }
  w.seed(presetGenome('micro',p), u, v, 16);
  const line=[];
  for (let s=0;s<3000;s++){ w.step(); if(s%500==499){ const k={}; for(const sp of w.species) if(sp.pop>0) k[sp.kind]=(k[sp.kind]||0)+1; line.push(`${s+1}:${w.living}/${w.species.length} ${JSON.stringify(k)} o2=${w.o2.toFixed(2)}`);} }
  console.log(seed, '\n '+line.join('\n '));
  console.log(' clades', w.clades.map(c=>c.name).join(', '));
}
