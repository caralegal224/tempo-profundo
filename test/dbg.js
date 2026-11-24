import { randomPlanet, GW, GH } from '../src/planet.js';
import { World, NP, P_ } from '../src/sim.js';
import { presetGenome } from '../src/genome.js';
const p = randomPlanet(12345);
const w = new World(p);
const v = w.vents[0];
w.seed(presetGenome('micro', p), v.x, v.y, 5);
w.seed(presetGenome('plant', p), 0.3, 0.5, 5);
for (let s=0;s<30;s++){ w.step(); }
for (let i=0;i<4200;i++) if (w.alive[i]) { const c=w.cellOf(i); const o=i*NP; console.log(i, w.asp[i], 'E',w.aen[i].toFixed(3),'land',w.land[c],'T',w.temp[c].toFixed(1),'topt',w.P[o+P_.topt].toFixed(1),'L',w.light[c].toFixed(2),'nut',w.nutr[c].toFixed(2),'vent',w.vent[c].toFixed(2),'pe',w.P[o].toFixed(3),'ce',w.P[o+1].toFixed(3),'se',w.P[o+3].toFixed(3),'basal',w.P[o+P_.basal].toFixed(3),'up',w.P[o+P_.upkeep].toFixed(3),'mv',w.P[o+P_.move].toFixed(3),'tempo',w.P[o+P_.tempo].toFixed(2)); }
