const { chromium } = require('playwright'); const path=require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 880 } });
  p.on('pageerror', e => console.log('pageerror', e.message, e.stack?.split('\n')[1]));
  await p.route('**/three.min.js', r => r.fulfill({ path: path.resolve('node_modules/three/build/three.min.js'), contentType: 'application/javascript' }));
  await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await p.goto('file://' + path.resolve('dist/play.html'));
  await p.waitForTimeout(1500);
  await p.screenshot({ path: '/tmp/claude-0/shots/01-genesis.png' });
  await p.click('#g-empty');
  await p.evaluate(() => {
    const w = app.world; const G = { size:0, multi:1, photo:2, pred:4, motil:6, sense:7, armor:8, terra:11, limbs:16, branch:17, symm:18 };
    let u=0.5,v=0.5; for(let t=0;t<9000;t++){ const x=Math.floor(Math.random()*160), y=25+Math.floor(Math.random()*30); const i=y*160+x; if(w.land[i]&&w.tidal[i]>0.2){u=(x+.5)/160;v=(y+.5)/80;break;} }
    const mk = (f) => { const g = new Float32Array(21).fill(0.1); g[9]=Math.min(1,Math.max(0,(w.meanTemp+40)/120)); g[10]=0.7; g[12]=0.4; g[13]=0.3; g[14]=Math.random(); g[15]=0.5; for (const k in f) g[G[k]]=f[k]; return g; };
    w.seed(mk({ photo:0.8, multi:0.8, size:0.55, terra:0.9, branch:0.8, motil:0 }), u, v, 30);
    w.seed(mk({ pred:0.7, multi:0.85, size:0.5, terra:0.9, motil:0.7, limbs:0.75, sense:0.8, symm:0.9, armor:0.3 }), u, v, 14);
    w.seed(mk({ sapro:0.8, multi:0.7, size:0.4, terra:0.9, motil:0, branch:0.3 }), u, v, 14);
    app.setView('3d'); window.__uv=[u,v];
    let i=-1; for(let k=0;k<4200;k++) if(w.alive[k] && w.asp[k]===1){i=k;break;}
    app.selectAgent(i); app.follow = true; app.v3.targetDist = 1.06; app.paused=false; app.setSpeed(1);
  });
  await p.waitForTimeout(7000);
  await p.screenshot({ path: '/tmp/claude-0/shots/13-closeup.png' });
  console.log(await p.evaluate(() => 'detailed ' + app.v3.detailed.size + ' dist ' + app.v3.dist.toFixed(3)));
  await b.close();
})();
