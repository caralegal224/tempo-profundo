const { chromium } = require('playwright'); const path=require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 640 } });
  p.on('pageerror', e => console.log('pageerror', e.message, e.stack?.split('\n')[1]));
  await p.route('**/three.min.js', r => r.fulfill({ path: path.resolve('node_modules/three/build/three.min.js'), contentType: 'application/javascript' }));
  await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await p.goto('file://' + path.resolve('dist/play.html'));
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    document.body.innerHTML = '<div id="gal" style="display:grid;grid-template-columns:repeat(5,300px);gap:0;background:#0b0f12"></div>';
    const G = { size:0, multi:1, photo:2, chemo:3, pred:4, sapro:5, motil:6, sense:7, armor:8, topt:9, ttol:10, terra:11, fecund:12, mut:13, hue:14, pattern:15, limbs:16, branch:17, symm:18, toxin:19, xeno:20 };
    const mk = (f) => { const g = new Float32Array(21).fill(0.1); g[15]=0.5; for (const k in f) g[G[k]]=f[k]; return g; };
    const specs = [
      mk({ sapro:0.5, motil:0.5, hue:0.3 }),
      mk({ photo:0.6, multi:0.3, hue:0.33 }),
      mk({ photo:0.8, multi:0.8, terra:0.9, branch:0.9, size:0.7, hue:0.3 }),
      mk({ photo:0.8, multi:0.7, terra:0.1, branch:0.5, size:0.4, hue:0.2 }),
      mk({ sapro:0.8, multi:0.7, size:0.3, hue:0.05, pattern:0.6 }),
      mk({ sapro:0.8, multi:0.7, size:0.3, branch:0.8, hue:0.9 }),
      mk({ pred:0.6, multi:0.7, motil:0.5, symm:0.1, limbs:0.6, hue:0.6, pattern:0.7 }),
      mk({ pred:0.7, multi:0.85, size:0.5, terra:0.9, motil:0.7, limbs:0.75, sense:0.8, symm:0.9, armor:0.3, hue:0.08 }),
      mk({ pred:0.5, multi:0.8, size:0.6, terra:0.1, motil:0.8, limbs:0.1, sense:0.6, symm:0.9, hue:0.55 }),
      mk({ pred:0.3, sapro:0.3, multi:0.8, size:0.3, terra:0.8, motil:0.5, limbs:0.9, sense:0.4, symm:0.8, armor:0.8, toxin:0.7, hue:0.75 }),
    ];
    const gal = document.getElementById('gal');
    for (const g of specs) {
      const sp = new window.__tp.Specimen();
      sp.canvas.style.cssText = 'width:300px;height:300px;border:0';
      gal.append(sp.canvas);
      const k = g[14]; const col = [0.5+0.4*Math.cos(k*6.28), 0.5+0.4*Math.cos(k*6.28-2.1), 0.5+0.4*Math.cos(k*6.28+2.1)];
      sp.show(g, col, 7);
      sp.render(0.5); sp.render(0.3);
    }
  });
  await p.waitForTimeout(800);
  await p.screenshot({ path: '/tmp/claude-0/shots/14-gallery.png' });
  await b.close();
})();
