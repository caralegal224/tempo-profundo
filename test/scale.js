import { randomPlanet } from '../src/planet.js';
import { World } from '../src/sim.js';
import { presetGenome } from '../src/genome.js';
// mesma janela de 4,8 Ga em escalas diferentes; e muitos passos em escala de dias
const run = (seed, scaleIdx, steps, label) => {
  const p = randomPlanet(seed); const w = new World(p);
  let u=0.4,v=0.5; const r=Math.random;
  for(let t=0;t<9000;t++){ const x=Math.floor(r()*160), y=25+Math.floor(r()*30); const i=y*160+x; if(!w.land[i]&&w.depth[i]<0.12){u=(x+.5)/160;v=(y+.5)/80;break;} }
  w.seed(presetGenome('micro',p), u, v, 12); w.scaleIdx = scaleIdx;
  const out=[]; const t0=Date.now();
  for (let s=0;s<steps;s++){ w.step(); if ((s+1)%Math.floor(steps/6)==0){ const k={}; let est=0; for(const sp of w.species) if(sp.pop>0){k[sp.kind]=(k[sp.kind]||0)+1; if(sp.pop>=5) est++;} out.push(`${(w.years/1e9).toFixed(2)}Ga vivas=${w.living} est=${est} total=${w.species.length} o2=${(w.o2*100).toFixed(1)}% ${JSON.stringify(k)}`);} }
  console.log(label, 'seed', seed, `(${((Date.now()-t0)/1000).toFixed(0)}s)\n  ` + out.join('\n  '));
};
const seed = +(process.argv[2]||2);
run(seed, 6, 4800, '1 Ma × 4800');
run(seed, 8, 48, '100 Ma × 48');
run(seed, 1, 4800, '1 dia × 4800');
