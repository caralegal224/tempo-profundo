// Gerador procedural de criaturas 3D a partir do genoma.
import { G, kindOf } from './genome.js';
import { RNG } from './util.js';
const THREE = window.THREE;

const geoCache = {};
function geo(key, make) { return geoCache[key] || (geoCache[key] = make()); }

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color[0], color[1], color[2]), roughness: opts.rough ?? 0.65, metalness: opts.metal ?? 0.0, transparent: !!opts.opacity, opacity: opts.opacity ?? 1, emissive: opts.emissive ? new THREE.Color(...opts.emissive) : new THREE.Color(0, 0, 0), flatShading: !!opts.flat, side: opts.side ?? THREE.FrontSide });
}
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// Retorna um Group com altura ~1 unidade (escala aplicada por quem usa)
export function buildCreature(g, color, seed = 1) {
  const rng = new RNG(seed);
  const kind = kindOf(g);
  const root = new THREE.Group();
  const anim = [];
  const sph = geo('sph', () => new THREE.SphereGeometry(1, 20, 14));
  const sphLo = geo('sphLo', () => new THREE.SphereGeometry(1, 10, 8));
  const cyl = geo('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 8, 1));
  const cone = geo('cone', () => new THREE.ConeGeometry(1, 1, 8, 1));
  const body = mat(color);
  const dark = mat(shade(color, 0.55));
  const light = mat([Math.min(1, color[0] * 1.3 + 0.15), Math.min(1, color[1] * 1.3 + 0.15), Math.min(1, color[2] * 1.3 + 0.15)]);

  if (kind === 'micro') {
    const colonial = g[G.multi] > 0.18;
    const n = colonial ? 3 + Math.round(g[G.multi] * 14) : 1;
    const mem = mat(color, { opacity: 0.55, rough: 0.25 });
    for (let k = 0; k < n; k++) {
      const cell = new THREE.Group();
      const m = new THREE.Mesh(sph, mem); cell.add(m);
      const nuc = new THREE.Mesh(sphLo, dark); nuc.scale.setScalar(0.35); nuc.position.set(0.2, 0.1, 0.1); cell.add(nuc);
      if (g[G.photo] > 0.3) for (let c = 0; c < 6; c++) { const ch = new THREE.Mesh(sphLo, light); ch.scale.set(0.16, 0.1, 0.1); ch.position.set(rng.range(-0.5, 0.5), rng.range(-0.5, 0.5), rng.range(-0.5, 0.5)); cell.add(ch); }
      if (g[G.motil] > 0.3) {
        const pts = []; for (let s = 0; s <= 12; s++) pts.push(new THREE.Vector3(-1 - s * 0.18, Math.sin(s * 0.9) * 0.15, 0));
        const fl = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.04, 5), body);
        cell.add(fl); anim.push((t) => { fl.rotation.x = t * 6; fl.rotation.y = Math.sin(t * 8) * 0.25; });
      }
      if (g[G.limbs] > 0.3) for (let c = 0; c < 14; c++) { const ci = new THREE.Mesh(cyl, body); const a = c / 14 * 6.283; ci.scale.set(0.02, 0.35, 0.02); ci.position.set(Math.cos(a) * 1.05, Math.sin(a) * 1.05, 0); ci.rotation.z = a - Math.PI / 2; cell.add(ci); }
      if (colonial) { const a = k * 2.399, r = Math.sqrt(k) * 1.15; cell.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.6, Math.sin(a * 1.3) * 0.5); cell.scale.setScalar(0.8); }
      root.add(cell);
    }
    const s = colonial ? 0.28 : 0.5; root.scale.setScalar(s); root.position.y = 0.5;
    const holder = new THREE.Group(); holder.add(root);
    anim.push((t) => { root.rotation.y = t * 0.4; root.position.y = 0.5 + Math.sin(t * 1.3) * 0.06; });
    holder.userData.animate = (t) => anim.forEach((f) => f(t));
    return holder;
  }

  if (kind === 'plant') {
    const terra = g[G.terra] > 0.5;
    const depth = 1 + Math.round(g[G.branch] * 3);
    const leafM = mat(color, { side: THREE.DoubleSide });
    const stemM = mat(terra ? [0.32, 0.25, 0.18] : shade(color, 0.6));
    const leafG = geo('leaf', () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.35, 0.4, 0, 1); s.quadraticCurveTo(-0.35, 0.4, 0, 0); return new THREE.ShapeGeometry(s, 6); });
    const sway = [];
    const branch = (parent, len, rad, d) => {
      const seg = new THREE.Group(); parent.add(seg);
      const st = new THREE.Mesh(cyl, stemM); st.scale.set(rad, len, rad); st.position.y = len / 2; seg.add(st);
      const tip = new THREE.Group(); tip.position.y = len; seg.add(tip);
      sway.push(seg);
      if (d <= 0) {
        const nL = terra ? 5 : 3;
        for (let k = 0; k < nL; k++) { const lf = new THREE.Mesh(leafG, leafM); const s = terra ? 0.35 : 0.6; lf.scale.set(s, s * (terra ? 1 : 1.8), s); lf.rotation.set(rng.range(-1, 1), k / nL * 6.283, rng.range(-0.8, 0.8)); tip.add(lf); }
        return;
      }
      const nb = 2 + (rng.chance(g[G.branch]) ? 1 : 0);
      for (let k = 0; k < nb; k++) {
        const ch = new THREE.Group(); tip.add(ch);
        ch.rotation.set(rng.range(0.3, 0.8) * (terra ? 1 : 0.6), k / nb * 6.283 + rng.range(0, 1), 0);
        branch(ch, len * 0.72, rad * 0.68, d - 1);
      }
    };
    const trunk = new THREE.Group(); root.add(trunk);
    branch(trunk, 0.42, 0.05, depth);
    root.scale.setScalar(terra ? 1 : 0.9);
    anim.push((t) => sway.forEach((s, k) => { s.rotation.z = Math.sin(t * (terra ? 0.9 : 0.6) + k * 0.7) * (terra ? 0.03 : 0.12); }));
    root.userData.animate = (t) => anim.forEach((f) => f(t));
    return root;
  }

  if (kind === 'fungus') {
    if (g[G.branch] > 0.6) {
      const m = mat(color, { rough: 0.9 });
      const coral = (parent, len, d) => {
        const c = new THREE.Mesh(cyl, m); c.scale.set(0.05 * (d + 1) * 0.6, len, 0.05 * (d + 1) * 0.6); c.position.y = len / 2; parent.add(c);
        if (d <= 0) return;
        const tip = new THREE.Group(); tip.position.y = len; parent.add(tip);
        for (let k = 0; k < 2; k++) { const ch = new THREE.Group(); ch.rotation.set(rng.range(0.3, 0.7), k * 3.14 + rng.next(), 0); tip.add(ch); coral(ch, len * 0.75, d - 1); }
      };
      for (let k = 0; k < 3; k++) { const b = new THREE.Group(); b.position.set(rng.range(-0.2, 0.2), 0, rng.range(-0.2, 0.2)); root.add(b); coral(b, 0.3, 3); }
    } else {
      const n = 1 + Math.round(g[G.fecund] * 4);
      const capM = mat(color, { rough: 0.8 }), stemM = mat([0.86, 0.83, 0.76]), gillM = mat(shade(color, 0.4), { side: THREE.DoubleSide });
      const capG = geo('cap', () => { const p = []; for (let k = 0; k <= 10; k++) { const a = k / 10 * Math.PI / 2; p.push(new THREE.Vector2(Math.sin(a), Math.cos(a) * 0.6)); } return new THREE.LatheGeometry(p, 18); });
      const gillG = geo('gill', () => new THREE.CircleGeometry(1, 18));
      for (let k = 0; k < n; k++) {
        const h = rng.range(0.35, 0.8) * (k ? 0.7 : 1);
        const m = new THREE.Group(); m.position.set(k ? rng.range(-0.45, 0.45) : 0, 0, k ? rng.range(-0.45, 0.45) : 0);
        const st = new THREE.Mesh(cyl, stemM); st.scale.set(0.06, h, 0.06); st.position.y = h / 2; m.add(st);
        const cap = new THREE.Mesh(capG, capM); cap.scale.setScalar(0.22 + h * 0.2); cap.position.y = h; m.add(cap);
        const gl = new THREE.Mesh(gillG, gillM); gl.rotation.x = Math.PI / 2; gl.scale.setScalar(0.2 + h * 0.2); gl.position.y = h + 0.005; m.add(gl);
        if (g[G.photo] > 0.3) { cap.material = mat([0.6, 0.7, 0.4]); }
        root.add(m);
      }
    }
    root.userData.animate = () => {};
    return root;
  }

  if (kind === 'animal') {
    const bilateral = g[G.symm] > 0.45;
    const terra = g[G.terra] > 0.5;
    if (!bilateral) {
      // medusa / pólipo radial
      const bellM = mat(color, { opacity: 0.7, rough: 0.2, emissive: shade(color, 0.15) });
      const bellG = geo('bell', () => { const p = []; for (let k = 0; k <= 12; k++) { const a = k / 12 * Math.PI / 2; p.push(new THREE.Vector2(Math.sin(a) * (1 - k / 40), Math.cos(a) * 0.8)); } return new THREE.LatheGeometry(p, 20); });
      const bell = new THREE.Mesh(bellG, bellM); bell.position.y = 0.6; bell.scale.setScalar(0.4); root.add(bell);
      const nt = 6 + Math.round(g[G.limbs] * 10);
      const tents = [];
      for (let k = 0; k < nt; k++) {
        const a = k / nt * 6.283;
        const pts = []; for (let s = 0; s <= 8; s++) pts.push(new THREE.Vector3(Math.cos(a) * 0.3, -s * 0.07, Math.sin(a) * 0.3));
        const tm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.012, 4), bellM);
        tm.position.y = 0.6; root.add(tm); tents.push(tm);
      }
      anim.push((t) => { const p = Math.sin(t * 2.4); bell.scale.set(0.4 + p * 0.04, 0.4 - p * 0.05, 0.4 + p * 0.04); root.position.y = Math.sin(t * 1.2) * 0.08; tents.forEach((m, k) => { m.rotation.x = Math.sin(t * 2 + k) * 0.12; }); });
      root.userData.animate = (t) => anim.forEach((f) => f(t));
      return root;
    }
    const plan = !terra && g[G.limbs] < 0.4 && g[G.motil] > 0.4 ? 'fish' : (g[G.size] > 0.42 && g[G.armor] < 0.5 && g[G.multi] > 0.5 ? 'vert' : 'seg');
    if (plan !== 'seg') {
      const eyeM = mat([0.95, 0.94, 0.88], { rough: 0.15 }), pupM = mat([0.03, 0.03, 0.04], { rough: 0.1 });
      const bellyM = mat([Math.min(1, color[0] * 0.5 + 0.45), Math.min(1, color[1] * 0.5 + 0.43), Math.min(1, color[2] * 0.5 + 0.38)]);
      const body2 = new THREE.Group(); root.add(body2);
      const addEyes = (parent, x, y, z, r) => { for (const side of [-1, 1]) { const e = new THREE.Mesh(sphLo, eyeM); e.scale.setScalar(r); e.position.set(x, y, side * z); parent.add(e); const pp = new THREE.Mesh(sphLo, pupM); pp.scale.setScalar(r * 0.55); pp.position.set(x + r * 0.5, y, side * (z + r * 0.45)); parent.add(pp); } };
      if (plan === 'fish') {
        const torso = new THREE.Mesh(sph, body); torso.scale.set(0.5, 0.2 + g[G.size] * 0.05, 0.14); body2.add(torso);
        const belly = new THREE.Mesh(sph, bellyM); belly.scale.set(0.42, 0.14, 0.12); belly.position.y = -0.07; body2.add(belly);
        addEyes(body2, 0.33, 0.05, 0.09, 0.04 + g[G.sense] * 0.02);
        const tail = new THREE.Group(); tail.position.x = -0.45; body2.add(tail);
        const tf = new THREE.Mesh(cone, body); tf.scale.set(0.2, 0.26, 0.03); tf.rotation.z = Math.PI / 2; tf.position.x = -0.1; tail.add(tf);
        const df = new THREE.Mesh(cone, dark); df.scale.set(0.1, 0.16, 0.02); df.position.set(0, 0.24, 0); body2.add(df);
        for (const side of [-1, 1]) { const pf = new THREE.Mesh(cone, dark); pf.scale.set(0.06, 0.14, 0.02); pf.rotation.set(side * 1.2, 0, -0.8); pf.position.set(0.12, -0.08, side * 0.13); body2.add(pf); }
        if (g[G.pred] > 0.45) { const jaw = new THREE.Mesh(cone, light); jaw.scale.set(0.05, 0.1, 0.05); jaw.rotation.z = -Math.PI / 2; jaw.position.set(0.5, -0.04, 0); body2.add(jaw); }
        if (g[G.toxin] > 0.5) for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(cone, mat([0.95, 0.75, 0.15], { emissive: [0.2, 0.12, 0] })); sp.scale.set(0.02, 0.1, 0.02); sp.position.set(0.2 - k * 0.12, 0.2, 0); body2.add(sp); }
        body2.position.y = 0.4;
        anim.push((t) => { const sp = 4 + g[G.motil] * 6; body2.rotation.y = Math.sin(t * sp) * 0.08; tail.rotation.y = Math.sin(t * sp - 1) * 0.5; body2.position.y = 0.4 + Math.sin(t * 1.3) * 0.04; });
      } else {
        const legLen = 0.3 + g[G.size] * 0.12;
        const torso = new THREE.Mesh(sph, body); torso.scale.set(0.36, 0.17 + g[G.armor] * 0.04, 0.16); body2.add(torso);
        const belly = new THREE.Mesh(sph, bellyM); belly.scale.set(0.3, 0.12, 0.13); belly.position.y = -0.07; body2.add(belly);
        const neck = new THREE.Group(); neck.position.set(0.3, 0.06, 0); body2.add(neck);
        const nk = new THREE.Mesh(cyl, body); nk.scale.set(0.06, 0.18, 0.06); nk.rotation.z = -0.9; nk.position.set(0.06, 0.05, 0); neck.add(nk);
        const head = new THREE.Group(); head.position.set(0.15, 0.13, 0); neck.add(head);
        const hm = new THREE.Mesh(sph, body); hm.scale.set(0.13, 0.09, 0.08); head.add(hm);
        const snout = new THREE.Mesh(sph, bellyM); snout.scale.set(0.08, 0.05, 0.055); snout.position.set(0.1, -0.02, 0); head.add(snout);
        if (g[G.sense] > 0.2) addEyes(head, 0.06, 0.04, 0.055, 0.026 + g[G.sense] * 0.015);
        if (g[G.pred] > 0.5) for (const side of [-1, 1]) { const tooth = new THREE.Mesh(cone, light); tooth.scale.set(0.012, 0.04, 0.012); tooth.rotation.x = Math.PI; tooth.position.set(0.15, -0.06, side * 0.025); head.add(tooth); }
        const tail = new THREE.Group(); tail.position.x = -0.32; body2.add(tail);
        const tl = new THREE.Mesh(cone, body); tl.scale.set(0.07, 0.42, 0.07); tl.rotation.z = Math.PI / 2 + 0.25; tl.position.x = -0.18; tail.add(tl);
        if (g[G.armor] > 0.3) for (let k = 0; k < 4; k++) { const pl = new THREE.Mesh(cone, mat(shade(color, 0.6))); pl.scale.set(0.04, 0.09, 0.02); pl.position.set(0.2 - k * 0.14, 0.17, 0); body2.add(pl); }
        if (g[G.toxin] > 0.5) for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(cone, mat([0.95, 0.75, 0.15], { emissive: [0.2, 0.12, 0] })); sp.scale.set(0.015, 0.08, 0.015); sp.position.set(0.22 - k * 0.11, 0.17, 0.05 * (k % 2 ? 1 : -1)); body2.add(sp); }
        const legs2 = [];
        const pairs = g[G.limbs] > 0.8 ? 3 : 2;
        for (let k = 0; k < pairs; k++) for (const side of [-1, 1]) {
          const hip = new THREE.Group(); hip.position.set(0.2 - k * (0.4 / (pairs - 1)), -0.05, side * 0.11); body2.add(hip);
          const up = new THREE.Mesh(cyl, body); up.scale.set(0.035, legLen * 0.55, 0.035); up.position.y = -legLen * 0.27; hip.add(up);
          const knee = new THREE.Group(); knee.position.y = -legLen * 0.55; hip.add(knee);
          const lo = new THREE.Mesh(cyl, dark); lo.scale.set(0.025, legLen * 0.5, 0.025); lo.position.y = -legLen * 0.25; knee.add(lo);
          knee.rotation.z = k === 0 ? 0.3 : -0.3;
          legs2.push({ hip, ph: k * Math.PI + (side > 0 ? Math.PI : 0) });
        }
        body2.position.y = legLen * 1.02 + 0.03;
        anim.push((t) => { const sp = 3 + g[G.motil] * 5; legs2.forEach((l) => { l.hip.rotation.z = Math.sin(t * sp + l.ph) * 0.4; }); tail.rotation.y = Math.sin(t * 1.5) * 0.25; neck.rotation.z = Math.sin(t * 0.7) * 0.08; body2.position.y = legLen * 1.02 + 0.03 + Math.abs(Math.sin(t * sp)) * 0.01; });
      }
      root.userData.animate = (t) => anim.forEach((f) => f(t));
      return root;
    }
    const nSeg = 2 + Math.round(g[G.multi] * 3 + (1 - g[G.limbs]) * 3);
    const bodyLen = 1.0, w0 = 0.16 + (1 - g[G.motil]) * 0.06 + g[G.armor] * 0.05;
    const spine = new THREE.Group(); root.add(spine);
    const segs = [];
    const armorM = mat(shade(color, 0.7), { rough: 0.35, metal: 0.25 });
    const bellyM = mat([Math.min(1, color[0] * 0.6 + 0.4), Math.min(1, color[1] * 0.6 + 0.38), Math.min(1, color[2] * 0.6 + 0.32)]);
    for (let k = 0; k < nSeg; k++) {
      const f = k / (nSeg - 1);
      const r = w0 * (k === 0 ? 1.05 : 1 - f * 0.55);
      const s = new THREE.Group(); s.position.x = bodyLen * 0.5 - f * bodyLen; spine.add(s); segs.push(s);
      const m = new THREE.Mesh(sph, body); m.scale.set(bodyLen / nSeg * 0.85, r, r * 1.05); s.add(m);
      const bm = new THREE.Mesh(sphLo, bellyM); bm.scale.set(bodyLen / nSeg * 0.7, r * 0.7, r * 0.95); bm.position.y = -r * 0.3; s.add(bm);
      if (g[G.armor] > 0.4) { const pl = new THREE.Mesh(sph, armorM); pl.scale.set(bodyLen / nSeg * 0.62, r * 0.75, r * 1.12); pl.position.y = r * 0.35; s.add(pl); }
      if (g[G.toxin] > 0.5 && k > 0) { const sp = new THREE.Mesh(cone, mat([0.95, 0.75, 0.15], { emissive: [0.2, 0.12, 0] })); sp.scale.set(0.035, 0.16, 0.035); sp.position.y = r * 1.05; s.add(sp); }
    }
    // cabeça
    const head = segs[0];
    if (g[G.sense] > 0.25) {
      const ne = g[G.sense] > 0.7 ? 4 : 2;
      const eyeM = mat([0.95, 0.94, 0.88], { rough: 0.15 }), pupM = mat([0.03, 0.03, 0.04], { rough: 0.1 });
      for (let k = 0; k < ne; k++) {
        const side = k % 2 ? 1 : -1, row = Math.floor(k / 2);
        const e = new THREE.Mesh(sphLo, eyeM); e.scale.setScalar(0.045 + g[G.sense] * 0.03);
        e.position.set(0.12 - row * 0.06, w0 * 0.55 + row * 0.04, side * w0 * 0.55); head.add(e);
        const pp = new THREE.Mesh(sphLo, pupM); pp.scale.setScalar(0.028 + g[G.sense] * 0.015); pp.position.set(0.16 - row * 0.06, w0 * 0.57 + row * 0.04, side * w0 * 0.62); head.add(pp);
      }
    }
    if (g[G.pred] > 0.45) { for (const side of [-1, 1]) { const j = new THREE.Mesh(cone, light); j.scale.set(0.03, 0.14, 0.03); j.rotation.z = -Math.PI / 2; j.position.set(0.24, -0.02, side * 0.06); head.add(j); } }
    // membros
    const legs = [];
    const nLegs = g[G.limbs] > 0.2 ? (g[G.limbs] > 0.7 ? 3 : g[G.limbs] > 0.45 ? 2 : 1) : 0;
    const legLen = terra ? 0.22 + g[G.size] * 0.1 : 0.14;
    for (let k = 0; k < nLegs; k++) {
      const seg = segs[Math.min(segs.length - 1, Math.round((k + 0.5) / nLegs * (segs.length - 1)))];
      for (const side of [-1, 1]) {
        const hip = new THREE.Group(); hip.position.set(0, -w0 * 0.2, side * w0 * 0.8); seg.add(hip);
        const up = new THREE.Mesh(cyl, dark); up.scale.set(0.022, legLen, 0.022); up.position.y = -legLen / 2; hip.add(up);
        const knee = new THREE.Group(); knee.position.y = -legLen; hip.add(knee);
        const lo = new THREE.Mesh(cyl, dark); lo.scale.set(0.018, legLen * 0.9, 0.018); lo.position.y = -legLen * 0.45; knee.add(lo);
        hip.rotation.x = side * (terra ? 0.5 : 1.1); knee.rotation.x = -side * (terra ? 0.6 : 0.3);
        legs.push({ hip, side, ph: k * 1.7 + (side > 0 ? Math.PI : 0) });
      }
    }
    if (!terra && g[G.motil] > 0.4) { // barbatana caudal
      const fin = new THREE.Mesh(cone, body); fin.scale.set(0.12, 0.22, 0.02); fin.rotation.z = Math.PI / 2; fin.position.x = -bodyLen * 0.55; spine.add(fin);
      segs.push(fin);
    }
    spine.position.y = terra && nLegs ? legLen * 1.4 : 0.35;
    spine.scale.setScalar(0.9);
    anim.push((t) => {
      const spd = 3 + g[G.motil] * 6;
      segs.forEach((s, k) => { s.rotation.y = Math.sin(t * spd * 0.5 - k * 0.8) * (terra ? 0.05 : 0.18); });
      legs.forEach((l) => { l.hip.rotation.z = Math.sin(t * spd + l.ph) * 0.45; });
      if (!terra) spine.position.y = 0.35 + Math.sin(t * 1.4) * 0.04;
    });
    root.userData.animate = (t) => anim.forEach((f) => f(t));
    return root;
  }

  // xeno: cristais vivos
  const n = 4 + Math.round(g[G.xeno] * 8);
  const cm = mat(color, { rough: 0.1, metal: 0.4, emissive: shade(color, 0.35), flat: true });
  const oct = geo('oct', () => new THREE.OctahedronGeometry(1, 0));
  const parts = [];
  for (let k = 0; k < n; k++) {
    const c = new THREE.Mesh(oct, cm);
    const h = rng.range(0.2, 0.7);
    c.scale.set(0.08 + rng.next() * 0.06, h, 0.08 + rng.next() * 0.06);
    c.position.set(rng.range(-0.25, 0.25), h * 0.8, rng.range(-0.25, 0.25));
    c.rotation.set(rng.range(-0.4, 0.4), rng.next() * 3, rng.range(-0.4, 0.4));
    root.add(c); parts.push(c);
  }
  anim.push((t) => { parts.forEach((p, k) => { p.material.emissiveIntensity = 0.7 + Math.sin(t * 2 + k) * 0.3; }); root.rotation.y = t * 0.15; });
  root.userData.animate = (t) => anim.forEach((f) => f(t));
  return root;
}
