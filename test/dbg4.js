import { randomPlanet } from '../src/planet.js';
import { World, NP, P_ } from '../src/sim.js';
import { presetGenome, G, phenotype } from '../src/genome.js';
const kind=process.argv[2]||'micro';
const p = randomPlanet(+(process.argv[3]||1)); const w = new World(p);
let u=0.4,v=0.5;
for(let t=0;t<9000;t++){ const x=Math.floor(Math.random()*160), y=25+Math.floor(Math.random()*30); const i=y*160+x; if(!w.land[i]&&w.depth[i]<0.12&&w.tidal[i]<0.1){u=(x+.5)/160;v=(y+.5)/80;break;} }
const g=presetGenome(kind,p); const ph=phenotype(g); console.log('basal',ph.basal,'up',ph.upkeep,'mv',ph.moveCost,'se',ph.eSapro,'ce',ph.eChemo,'topt',ph.topt,'ttol',ph.ttol,'life',ph.lifespan);
w.seed(g, u, v, 1);
for (let s=0;s<30;s+=1){ w.step(); for(let i=0;i<4200;i++) if(w.alive[i]){const c=w.cellOf(i); if(s%3==0) console.log(s,'E',w.aen[i].toFixed(3),'land',w.land[c],'T',w.temp[c].toFixed(1),'nut',w.nutr[c].toFixed(2),'detr',w.detr[c].toFixed(2),'depth',w.depth[c].toFixed(2),'n',w.count); break;} }
