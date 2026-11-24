const { chromium } = require('playwright'); const path=require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 880 } });
  const errs = new Set();
  p.on('pageerror', e => errs.add('pageerror ' + e.message + ' ' + (e.stack||'').split('\n')[1]));
  p.on('console', m => { if (m.type()==='error') errs.add('console ' + m.text()); });
  await p.route('**/three.min.js', r => r.fulfill({ path: path.resolve('node_modules/three/build/three.min.js'), contentType: 'application/javascript' }));
  await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await p.goto('file://' + path.resolve('dist/play.html'));
  await p.waitForTimeout(1000);
  await p.click('#g-roll'); await p.waitForTimeout(300);
  await p.click('#g-edit'); await p.waitForTimeout(300);
  await p.screenshot({ path: '/tmp/claude-0/shots/15-genesis-edit.png' });
  await p.click('#g-start'); await p.waitForTimeout(300);
  await p.evaluate(() => { app.cancelPending(); app.primordialSoup(); app.setSpeed(5); });
  const t0 = Date.now(); let k = 0;
  while (Date.now() - t0 < 50000) {
    await p.waitForTimeout(2500);
    await p.evaluate((k) => {
      const w = app.world;
      const acts = [
        () => app.setView(app.view === '2d' ? '3d' : '2d'),
        () => { let i = -1; for (let j = 0; j < 4200; j++) if (w.alive[j]) { i = j; break; } if (i >= 0) app.selectAgent(i); },
        () => app.openAtlas(), () => app.closeAtlas(),
        () => app.setTool('chronicle'), () => app.setTool('vault'),
        () => { if (app.sel) app.saveToVault({ genus: 'Testus', epithet: 'probus', common: 'Teste', genome: [...w.species[app.sel.sp].mean] }); },
        () => app.changeScale(k % 2 ? 1 : -1),
        () => app.fireEvent(['volcanic','anoxia','greenhouse','plague'][k % 4], { u: Math.random(), v: 0.3 + Math.random() * 0.4 }),
        () => { if (w.snapshots.length > 3) app.restoreSnapshot(w.snapshots[w.snapshots.length - 3]); },
        () => { app.map.zoomAt(700, 400, 3); },
        () => { app.v3.targetDist = 1.1 + Math.random(); },
        () => { app.togglePause(); app.togglePause(); },
        () => app.deselect(),
      ];
      acts[k % acts.length]();
    }, k++);
  }
  console.log(await p.evaluate(() => JSON.stringify({ n: app.world.count, living: app.world.living, total: app.world.species.length, steps: app.world.stepN, snaps: app.world.snapshots.length, clades: app.world.clades.map(c => c.name).join(',') })));
  const mem = await p.evaluate(() => performance.memory ? (performance.memory.usedJSHeapSize/1e6).toFixed(0)+'MB' : 'n/a'); console.log('heap', mem);
  console.log([...errs].join('\n') || 'sem erros');
  await b.close();
})();
