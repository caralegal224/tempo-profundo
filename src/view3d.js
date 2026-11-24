// Vista 3D: globo com relevo, oceano, atmosfera, nuvens, luas e organismos.
import { HW, HH, GW, GH, STARS } from './planet.js';
import { MAX, NP, P_ } from './sim.js';
import { kindOf } from './genome.js';
import { buildCreature } from './creature.js';
import { planetPalette } from './surface.js';
import { clamp, RNG, Noise3, lonLatToXYZ } from './util.js';
const THREE = window.THREE;

const EXAG = 0.045; // exagero do relevo

export class View3D {
  constructor(canvas, world, painter) {
    this.world = world; this.painter = painter; this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    r.setClearColor(0x05070a);
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.001, 200);
    this.dist = 3.4; this.yaw = 0.6; this.pitch = 0.25; this.vyaw = 0; this.vpitch = 0;
    this.targetDist = 3.4;
    this.planetGroup = new THREE.Group(); this.scene.add(this.planetGroup);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2); this.sun.position.set(5, 1.5, 3); this.scene.add(this.sun);
    this.amb = new THREE.AmbientLight(0x334455, 0.35); this.scene.add(this.amb);
    this.hemi = new THREE.HemisphereLight(0x8899aa, 0x221a14, 0.25); this.scene.add(this.hemi);
    this.buildStars();
    this.tex = new THREE.CanvasTexture(painter.surface); this.tex.encoding = THREE.sRGBEncoding; this.tex.anisotropy = 4;
    this.cloudTex = new THREE.CanvasTexture(painter.cloudsGray);
    this.instances = {};
    this.detailed = new Map(); this.templateCache = new Map();
    this.raycaster = new THREE.Raycaster();
    this.builtFor = null; this.texVersion = -1;
    this.t = 0;
  }

  buildStars() {
    const rng = new RNG(7), n = 2400, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rng.next(), v = rng.next(); const th = u * 6.283, ph = Math.acos(2 * v - 1);
      const R = 80; pos[i * 3] = R * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = R * Math.cos(ph); pos[i * 3 + 2] = R * Math.sin(ph) * Math.sin(th);
      const t = rng.next(), b = 0.35 + rng.next() * 0.65;
      col[i * 3] = b * (t > 0.7 ? 1 : 0.8); col[i * 3 + 1] = b * 0.88; col[i * 3 + 2] = b * (t < 0.3 ? 1 : 0.8);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.4, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85 }));
    this.scene.add(this.stars);
  }

  heightAt(u, v) {
    const w = this.world, E = w.elevHi;
    const x = Math.floor(((u % 1) + 1) % 1 * HW), y = clamp(Math.floor(v * HH), 0, HH - 1);
    const e = E[y * HW + x];
    return 1 + Math.max(e - w.sea, (e - w.sea) * 0.5) * EXAG;
  }

  build() {
    const w = this.world, p = w.planet, pal = planetPalette(p);
    const key = w.gridVersion + ':' + p.seed + ':' + p.water + ':' + p.star + ':' + p.moons.length + ':' + p.atmosphere;
    if (this.builtFor === key) return;
    this.builtFor = key;
    const grp = this.planetGroup;
    for (const c of [...grp.children]) { grp.remove(c); c.geometry?.dispose?.(); }
    // terreno
    const geom = new THREE.SphereGeometry(1, 384, 192);
    const pos = geom.attributes.position, uv = geom.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i), v = 1 - uv.getY(i);
      const h = this.heightAt(u, v);
      pos.setXYZ(i, pos.getX(i) * h, pos.getY(i) * h, pos.getZ(i) * h);
    }
    geom.computeVertexNormals();
    this.terrain = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.92, metalness: 0 }));
    grp.add(this.terrain);
    // oceano
    const seaR = 1.0;
    const oc = new THREE.Color(...pal.shallow), od = new THREE.Color(...pal.deep);
    this.oceanMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) }, uShallow: { value: oc }, uDeep: { value: od }, uStar: { value: new THREE.Color(...STARS[p.star].color) }, uTime: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 uSun; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uStar; uniform float uTime; varying vec3 vN; varying vec3 vW;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
        void main(){ vec3 V = normalize(cameraPosition - vW); vec3 N = normalize(vN);
          vec3 q = vW*90.0 + vec3(uTime*0.6, uTime*0.4, -uTime*0.5);
          N = normalize(N + 0.035*vec3(sin(q.x+sin(q.y)), sin(q.y*1.3+cos(q.z)), sin(q.z*0.8+sin(q.x))));
          float fres = pow(1.0 - max(dot(N,V),0.0), 4.0);
          float diff = max(dot(N,uSun),0.0);
          vec3 H = normalize(uSun+V); float spec = pow(max(dot(N,H),0.0), 160.0)*1.6 + pow(max(dot(N,H),0.0), 18.0)*0.08;
          vec3 col = mix(uDeep, uShallow, 0.25)*(0.18+0.9*diff) + uStar*spec*step(0.0,diff) + vec3(0.35,0.5,0.6)*fres*0.5*(0.2+diff);
          float a = 0.55 + fres*0.4;
          gl_FragColor = vec4(col, a); }`,
    });
    this.ocean = new THREE.Mesh(new THREE.SphereGeometry(seaR, 160, 80), this.oceanMat);
    grp.add(this.ocean);
    // nuvens
    this.cloudTex.needsUpdate = true;
    this.cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(1.03, 96, 48), new THREE.MeshStandardMaterial({ alphaMap: this.cloudTex, transparent: true, color: 0xffffff, opacity: clamp(p.atmosphere / 2.6, 0.15, 0.6), depthWrite: false, roughness: 1 }));
    this.cloudMesh.material.alphaMap.wrapS = THREE.RepeatWrapping;
    grp.add(this.cloudMesh);
    // atmosfera
    const atmCol = { G: [0.35, 0.6, 1.0], K: [0.55, 0.62, 0.9], M: [0.85, 0.55, 0.5], F: [0.3, 0.5, 1.0] }[p.star];
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(1.09, 96, 48), new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { uCol: { value: new THREE.Color(...atmCol) }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uDen: { value: clamp(p.atmosphere / 1.5, 0.15, 1.6) } },
      vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 uCol; uniform vec3 uSun; uniform float uDen; varying vec3 vN; varying vec3 vW;
        void main(){ vec3 V = normalize(cameraPosition - vW); float rim = pow(1.0 - abs(dot(normalize(vN), V)), 2.0);
        float lit = clamp(dot(normalize(vW), uSun)*0.8+0.35, 0.0, 1.0);
        float i = pow(rim, 1.6) * lit * uDen; gl_FragColor = vec4(uCol*i*1.3, i); }`,
    }));
    this.scene.add(this.atmo);
    if (this.oldAtmo) this.scene.remove(this.oldAtmo); this.oldAtmo = this.atmo;
    // luas
    if (this.moonGroup) this.scene.remove(this.moonGroup);
    this.moonGroup = new THREE.Group(); this.scene.add(this.moonGroup);
    this.moonMeshes = p.moons.map((m) => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128;
      const ctx = c.getContext('2d'), img = ctx.createImageData(256, 128), n = new Noise3(m.seed);
      for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) {
        const [X, Y, Z] = lonLatToXYZ(x / 256, y / 128); const v = n.fbm(X * 3, Y * 3, Z * 3, 5) * 0.5 + 0.5; const cr = Math.abs(n.n(X * 9, Y * 9, Z * 9)) < 0.05 ? 0.75 : 1;
        const k = (y * 256 + x) * 4; img.data[k] = m.color[0] * 255 * v * cr * 1.3; img.data[k + 1] = m.color[1] * 255 * v * cr * 1.3; img.data[k + 2] = m.color[2] * 255 * v * cr * 1.3; img.data[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06 + m.size * 0.07, 48, 24), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
      this.moonGroup.add(mesh);
      return mesh;
    });
    // estrela
    const sc = STARS[p.star].color;
    this.sun.color.setRGB(sc[0], sc[1], sc[2]);
    this.sun.intensity = 1.6 + Math.min(1.2, p.insolation * 0.6);
    if (!this.sunSprite) {
      const c = document.createElement('canvas'); c.width = c.height = 128; const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,240,220,0.8)'); g.addColorStop(1, 'rgba(255,200,150,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
      this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false }));
      this.scene.add(this.sunSprite);
    }
    this.sunSprite.material.color.setRGB(sc[0], sc[1], sc[2]);
    const sd = this.sun.position.clone().normalize().multiplyScalar(60);
    this.sunSprite.position.copy(sd); this.sunSprite.scale.setScalar(p.star === 'M' ? 9 : 6);
    this.buildInstances();
    this.templateCache.clear();
    for (const [, o] of this.detailed) grp.remove(o.obj);
    this.detailed.clear();
  }

  buildInstances() {
    const grp = this.planetGroup;
    for (const k in this.instances) grp.remove(this.instances[k]);
    const geos = {
      micro: new THREE.IcosahedronGeometry(1, 1),
      plant: new THREE.ConeGeometry(0.6, 2, 6).translate(0, 1, 0),
      fungus: new THREE.LatheGeometry([new THREE.Vector2(0.15, 0), new THREE.Vector2(0.15, 1), new THREE.Vector2(0.9, 1.1), new THREE.Vector2(0.6, 1.5), new THREE.Vector2(0, 1.6)], 8),
      animal: new THREE.SphereGeometry(1, 10, 6).scale(1.6, 0.8, 0.8).translate(0, 0.8, 0),
      xeno: new THREE.OctahedronGeometry(1, 0).scale(0.6, 1.6, 0.6).translate(0, 1, 0),
    };
    for (const k in geos) {
      const m = new THREE.InstancedMesh(geos[k], new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: k === 'xeno' }), MAX);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0; m.frustumCulled = false;
      grp.add(m); this.instances[k] = m;
    }
  }

  resize(w, h, dpr) { this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  // posição na esfera local do planeta (u,v normalizados)
  surfacePoint(u, v, out, lift = 0) {
    const h = this.heightAt(u, v);
    const r = Math.max(h, 1.0) + lift;
    // mesma parametrização da SphereGeometry do three.js
    const phi = u * Math.PI * 2, theta = v * Math.PI;
    out.set(-Math.cos(phi) * Math.sin(theta) * r, Math.cos(theta) * r, Math.sin(phi) * Math.sin(theta) * r);
    return out;
  }

  pick(clientX, clientY, rect) {
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.terrain);
    if (!hits.length) return null;
    const uv = hits[0].uv;
    return { u: ((uv.x % 1) + 1) % 1, v: 1 - uv.y, point: hits[0].point };
  }

  render(dt, opts) {
    this.t += dt;
    const w = this.world;
    this.build();
    if (this.painter.version !== this.texVersion) { this.tex.needsUpdate = true; this.texVersion = this.painter.version; }
    // controles
    this.yaw += this.vyaw * dt; this.pitch = clamp(this.pitch + this.vpitch * dt, -1.45, 1.45);
    const damp = Math.pow(0.04, dt); this.vyaw *= damp; this.vpitch *= damp;
    this.dist += (this.targetDist - this.dist) * (1 - Math.pow(0.002, dt));
    const d = this.dist;
    const cam = this.camera;
    cam.position.set(Math.cos(this.pitch) * Math.sin(this.yaw) * d, Math.sin(this.pitch) * d, Math.cos(this.pitch) * Math.cos(this.yaw) * d);
    const close = clamp((1.6 - d) / 0.5);
    // perto da superfície: olhar tangente ao horizonte
    const up = cam.position.clone().normalize();
    const look = new THREE.Vector3(0, 0, 0);
    if (close > 0) {
      const fwd = new THREE.Vector3(-Math.sin(this.yaw) * Math.sin(this.pitch) * 0, 1, 0);
      const tangent = new THREE.Vector3().crossVectors(up, new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))).normalize();
      look.copy(up).multiplyScalar(1.0).addScaledVector(tangent, close * 0.35);
      cam.up.copy(close > 0.5 ? up : new THREE.Vector3(0, 1, 0)).lerp(new THREE.Vector3(0, 1, 0), 1 - close);
    } else cam.up.set(0, 1, 0);
    cam.lookAt(look);
    cam.near = Math.max(0.0005, (d - 1.05) * 0.2); cam.updateProjectionMatrix();

    // rotação do planeta
    const spin = opts.nightVisible > 0.01 ? w.spinAngle(opts.displayYears) : (this.idleSpin = (this.idleSpin || 0) + dt * 0.02 * (opts.paused ? 0.3 : 1));
    this.planetGroup.rotation.y = spin;
    this.cloudMesh.rotation.y = this.t * 0.008;
    const sunDir = this.sun.position.clone().normalize();
    this.oceanMat.uniforms.uSun.value.copy(sunDir); this.oceanMat.uniforms.uTime.value = this.t;
    this.atmo.material.uniforms.uSun.value.copy(sunDir);
    // luas
    const ang = w.moonAngles(opts.displayYears);
    w.planet.moons.forEach((m, j) => {
      const r = 1.7 + (m.dist / 60) * 2.2 + j * 0.25;
      const a = ang[j];
      this.moonMeshes[j].position.set(Math.cos(a) * r, Math.sin(a * 0.3) * 0.15 * r, Math.sin(a) * r);
      this.moonMeshes[j].rotation.y = -a;
    });
    this.updateOrganisms(opts, d);
    this.renderer.render(this.scene, cam);
  }

  updateOrganisms(opts, d) {
    const w = this.world;
    const showInst = d < 2.6;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qh = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), upV = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    const counts = { micro: 0, plant: 0, fungus: 0, animal: 0, xeno: 0 };
    const exag = clamp((d - 1.0) * 0.9, 0.04, 1);
    const near = [];
    const camLocal = this.planetGroup.worldToLocal(this.camera.position.clone());
    if (showInst) {
      for (let i = 0; i < MAX; i++) {
        if (!w.alive[i]) continue;
        if (opts.filterSpecies >= 0 && w.asp[i] !== opts.filterSpecies) continue;
        const sp = w.species[w.asp[i]];
        const kind = sp.kind;
        const u = w.ax[i] / GW, v = w.ay[i] / GH;
        const c = w.cellOf(i);
        const aquatic = !w.land[c];
        this.surfacePoint(u, v, pos, aquatic ? -0.0015 : 0);
        const size = w.P[i * NP + P_.size];
        const s = (0.0025 + size * 0.012) * exag * 2.2;
        if (d < 1.35) {
          const dd = pos.distanceToSquared(camLocal);
          if (dd < 0.02) near.push([dd, i]);
        }
        const nrm = pos.clone().normalize();
        q.setFromUnitVectors(upV, nrm);
        qh.setFromAxisAngle(upV, -w.ahead[i]);
        q.multiply(qh);
        sc.set(s, s, s);
        m4.compose(pos, q, sc);
        const inst = this.instances[kind];
        const n = counts[kind]++;
        inst.setMatrixAt(n, m4);
        col.setRGB(sp.color[0], sp.color[1], sp.color[2]);
        inst.setColorAt(n, col);
      }
    }
    for (const k in this.instances) {
      const inst = this.instances[k];
      inst.count = counts[k];
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }
    // modelos detalhados para os organismos mais próximos
    near.sort((a, b) => a[0] - b[0]);
    const keep = new Set(near.slice(0, 40).map((x) => w.aid[x[1]]));
    for (const [aid, o] of this.detailed) if (!keep.has(aid) || !w.alive[o.i] || w.aid[o.i] !== aid) { this.planetGroup.remove(o.obj); this.detailed.delete(aid); }
    for (const [, i] of near.slice(0, 40)) {
      const aid = w.aid[i];
      let o = this.detailed.get(aid);
      const sp = w.species[w.asp[i]];
      if (!o) {
        const tkey = sp.id + ':' + sp.kind;
        let tpl = this.templateCache.get(tkey);
        if (!tpl) { tpl = buildCreature(sp.mean, sp.color, sp.id * 7 + 1); this.templateCache.set(tkey, tpl); }
        const obj = tpl.clone(true);
        obj.userData.animate = makeAnimator(tpl, obj);
        this.planetGroup.add(obj);
        o = { obj, i }; this.detailed.set(aid, o);
      }
      o.i = i;
      const u = w.ax[i] / GW, v = w.ay[i] / GH;
      const aquatic = !w.land[w.cellOf(i)];
      this.surfacePoint(u, v, pos, aquatic ? -0.0012 : 0);
      const nrm = pos.clone().normalize();
      q.setFromUnitVectors(upV, nrm); qh.setFromAxisAngle(upV, -w.ahead[i]); q.multiply(qh);
      const size = w.P[i * NP + P_.size];
      const s = (0.0025 + size * 0.012) * exag * 2.2 * 1.3;
      o.obj.position.copy(pos); o.obj.quaternion.copy(q); o.obj.scale.setScalar(s);
      o.obj.userData.animate?.(this.t + i * 0.37);
    }
    // esconde instâncias que viraram detalhadas: reduzimos escala delas via flag (simples: deixamos, ficam cobertas)
  }
}

// clona animação mapeando nós por índice de travessia
function makeAnimator(tpl, clone) {
  const a = [], b = [];
  tpl.traverse((n) => a.push(n)); clone.traverse((n) => b.push(n));
  const map = new Map(a.slice(1).map((n, k) => [n, b[k + 1]]));
  const fn = tpl.userData.animate;
  if (!fn) return null;
  return (t) => {
    // aplica animação no template e copia transformações
    fn(t);
    for (const [src, dst] of map) { dst.position.copy(src.position); dst.rotation.copy(src.rotation); dst.scale.copy(src.scale); }
  };
}
