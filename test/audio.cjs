const { chromium } = require('playwright'); const path=require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('console', m => { if (m.type()==='error') console.log('console', m.text()); });
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.route('**/three.min.js', r => r.fulfill({ path: path.resolve('node_modules/three/build/three.min.js'), contentType: 'application/javascript' }));
  await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await p.goto('file://' + path.resolve('dist/play.html'));
  await p.waitForTimeout(1500);
  await p.click('#g-empty');
  await p.waitForTimeout(500);
  const r = await p.evaluate(async () => {
    const a = app.audio; const res = { state: a.ctx.state };
    const kinds = ['speciation','innovation','extinction','massExtinction','milestone','impact','volcanic','glacial','greenhouse','anoxia','gamma','plague','custom','seed','rewind','pause','resume','scale','select','vault','deny','ui','hover','panel','sculpt'];
    for (const k of kinds) { try { a.lastStinger = {}; a.stinger(k, {}); } catch (e) { res[k] = e.message; } }
    try { a.call({ freq: 800, notes: 3, len: 0.1, gap: 0.05, sweep: 1.2, interval: 0.2, ratio: 1.5, fm: 0.5, wave: 'sine', low: true }, a.ctx.currentTime + 0.1); a.crystal(a.ctx.currentTime); a.grain(a.ctx.currentTime); } catch (e) { res.voices = e.message; }
    a.update({ micro: 2000, animals: 500, animalVoices: [{ freq: 500, notes: 2, len: 0.1, gap: 0.05, sweep: 1, interval: 0.2, ratio: 1, fm: 0.3, wave: 'sine', low: false }] });
    for (let i=0;i<30;i++) a.tick();
    res.tickOk = true;
    return res;
  });
  console.log(JSON.stringify(r));
  // grava 6s de áudio via OfflineAudioContext? Basta checar ausência de erros.
  await p.waitForTimeout(3000);
  await b.close();
})();
