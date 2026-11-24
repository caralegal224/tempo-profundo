const { chromium } = require('playwright'); const path=require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('console', m => console.log(m.type(), m.text()));
  p.on('pageerror', e => console.log('pageerror', e.message, e.stack));
  await p.route('**/three.min.js', r => r.fulfill({ path: path.resolve('node_modules/three/build/three.min.js'), contentType: 'application/javascript' }));
  await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await p.goto('file://' + path.resolve('dist/play.html'));
  await p.waitForTimeout(3000);
  await b.close();
})();
