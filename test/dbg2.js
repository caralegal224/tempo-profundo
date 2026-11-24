import { randomPlanet } from '../src/planet.js';
import { World, NP, P_ } from '../src/sim.js';
import { presetGenome, G } from '../src/genome.js';
const p = randomPlanet(777);
const w = new World(p);
let u=0.4,v=0.5;
for(let t=0;t<5000;t++){ const x=Math.floor(Math.random()*160), y=20+Math.floor(Math.random()*40); const i=y*160+x; if(!w.land[i]&&w.depth[i]<0.15){u=(x+.5)/160;v=(y+.5)/80;break;} }
w.seed(presetGenome('plant',p), u, v, 25);
for (let s=0;s<250;s++) w.step();
const a = w.seed(presetGenome('animal',p), u, v, 10);
for (let s=0;s<40;s++){ w.step(); let line=[];
 for(let i=0;i<4200;i++) if(w.alive[i]&&w.asp[i]===a){ const c=w.cellOf(i); line.push(w.aen[i].toFixed(2)+'('+w.dens[c]+')'); }
 console.log(s, line.join(' ')); }
const i0=[...Array(4200).keys()].find(i=>w.alive[i]&&w.asp[i]===a);
if(i0!==undefined){ const o=i0*NP; console.log('re',w.P[o+P_.re],'basal',w.P[o+P_.basal],'up',w.P[o+P_.upkeep],'mv',w.P[o+P_.move],'speed',w.P[o+P_.speed],'size',w.P[o+P_.size]); }
console.log('plant size', w.species[0].mean[G.size], 'def armor', w.species[0].mean[G.armor], 'toxin', w.species[0].mean[G.toxin]);
