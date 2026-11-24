const { chromium, devices } = require('playwright'); const path=require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 880 } });
  p.on('pageerror', e => console.log('pageerror', e.message, e.stack?.split('\n')[1]));
  p.on('console', m => { if (m.type()==='error') console.log('console', m.text()); });
  await p.route('**/three.min.js', r => r.fulfill({ path: path.resolve('node_modules/three/build/three.min.js'), contentType: 'application/javascript' }));
  await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await p.goto('file://' + path.resolve('dist/play.html'));
  await p.waitForTimeout(1200);
  await p.click('#g-empty');
  await p.evaluate(() => { app.primordialSoup(); const w=app.world; const g=app.creator; app.setSpeed(5); });
  await p.waitForTimeout(6000);
  const out='/tmp/claude-0/shots';
  console.log(await p.evaluate(() => { const w=app.world; const n=w.snapshots.length; const s=w.snapshots[Math.floor(n/2)]; app.restoreSnapshot(s); return 'restored to '+s.step+' now '+w.stepN+' count '+w.count; }));
  await p.waitForTimeout(2500);
  console.log(await p.evaluate(() => 'after '+app.world.stepN+' count '+app.world.count));
  // eventos
  await p.evaluate(() => { app.fireEvent('impact', { u: 0.5, v: 0.5, radius: 0.08 }); app.fireEvent('glacial'); app.fireEvent('plague'); app.fireEvent('gamma'); app.fireEvent('custom', {dT:10, ash:0.3, kill:0.3, target:'aquáticos', duration:100}); });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: out + '/07-impact.png' });
  // escala de dias
  await p.evaluate(() => { app.world.scaleIdx = 0; app.updateScale(); app.setSpeed(1); app.map.zoom = 1.5; app.map.clampView(); });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: out + '/08-days.png' });
  // abrir ferramentas
  for (const t of ['seed','sculpt','events','vault','planet','chronicle']) { await p.evaluate((t) => app.setTool(t), t); await p.waitForTimeout(250); }
  await p.evaluate(() => app.setTool('events'));
  await p.screenshot({ path: out + '/09-events.png' });
  await p.evaluate(() => app.setTool('planet'));
  await p.screenshot({ path: out + '/10-planet.png' });
  // celular
  const m = await b.newPage({ ...devices['iPhone 13'] });
  m.on('pageerror', e => console.log('m pageerror', e.message));
  await m.route('**/three.min.js', r => r.fulfill({ path: path.resolve('node_modules/three/build/three.min.js'), contentType: 'application/javascript' }));
  await m.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await m.goto('file://' + path.resolve('dist/play.html'));
  await m.waitForTimeout(1500);
  await m.screenshot({ path: out + '/11-phone-genesis.png' });
  await m.evaluate(() => { app.start(false); app.primordialSoup(); });
  await m.waitForTimeout(2500);
  await m.screenshot({ path: out + '/12-phone-game.png' });
  await b.close();
})();
