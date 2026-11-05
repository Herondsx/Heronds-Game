/* ============================================================
   THE BACKROOMS — a criatura (O Inquilino) — METAMORFOSE
   ------------------------------------------------------------
   Um único corpo cuja anatomia muda de forma CONTÍNUA por um
   parâmetro "form":
     0.0  O Magro   — humanoide alto e esquelético, em pé
     1.0  Aranha    — os braços esticam e viram patas (as mãos
                      se abrem no chão), as pernas dobram ao
                      contrário, o tronco deita, o pescoço cresce
     2.0  Gigante   — duas pernas novas BROTAM das costelas, um
                      abdômen inchado cresce atrás da pélvis, o
                      tronco fica pendurado de cabeça para baixo
                      e um segundo par de braços arrasta no chão
   A transformação é uma cena: o corpo avança na mudança aos
   trancos, a cada estalo de osso (callback onJolt), com
   convulsões, cabeça girando e a boca escancarada.

   Física procedural:
     * IK de 2 ossos + tarso/garra (ou a mão) até o pé
     * pés PLANTADOS no mundo; passadas em arco, grupos alternados
     * pé dentro de uma parede => sobe a parede; modo teto
     * corpo com mola; membros soltos como pêndulos
   ============================================================ */
(function (BR) {
  'use strict';
  const U = BR.U;
  const UP = new THREE.Vector3(0, 1, 0);
  const lerp = U.lerp, sm = U.smooth;

  // ---------------- geometria compartilhada ----------------
  let G = null;
  function latheY(profile, seg) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg || 8); }
  function geos() {
    if (G) return G;
    const spur = new THREE.ConeGeometry(1, 1, 6); spur.translate(0, 0.5, 0);
    G = {
      // perfis em [0,1] ao longo de Y; o raio é escalado por membro
      upper: latheY([[0.001, -0.03], [0.82, 0], [1.0, 0.12], [0.97, 0.38], [0.74, 0.76], [0.6, 1.0], [0.001, 1.03]]),
      lower: latheY([[0.001, -0.03], [0.64, 0], [0.76, 0.1], [0.62, 0.5], [0.44, 0.86], [0.32, 1.0], [0.001, 1.03]]),
      claw: latheY([[0.001, -0.02], [0.4, 0], [0.34, 0.42], [0.15, 0.84], [0.0, 1.0]], 6),
      finger: latheY([[0.001, -0.02], [1, 0], [0.85, 0.55], [0.3, 1.0], [0.0, 1.02]], 5),
      ball: new THREE.SphereGeometry(1, 10, 8),
      spur,
    };
    return G;
  }
  function cyl(r0, r1, len, mat, seg) {
    const g = new THREE.CylinderGeometry(r0, r1, len, seg || 7, 1); g.translate(0, -len / 2, 0);
    return new THREE.Mesh(g, mat);
  }
  function ell(sx, sy, sz, mat, seg) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, seg || 12, Math.max(6, (seg || 12) - 2)), mat);
    m.scale.set(sx, sy, sz); return m;
  }
  function lathe(profile, mat, sz) {
    const m = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 14), mat);
    m.scale.z = sz || 1; return m;
  }
  function grp(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

  // ---------------- tronco humano ----------------
  function buildUpper(mats) {
    const B = mats.body, u = {};
    u.group = new THREE.Group();
    u.group.add(ell(0.14, 0.1, 0.09, B));
    for (const sx of [-1, 1]) { const hb = ell(0.05, 0.06, 0.04, B, 8); hb.position.set(sx * 0.12, 0.03, 0.03); u.group.add(hb); }
    u.hipL = grp(u.group, 0.11, -0.03, 0); u.hipR = grp(u.group, -0.11, -0.03, 0);
    u.spine = grp(u.group, 0, 0.06, 0);
    u.spine.add(lathe([[0.112, 0], [0.098, 0.12], [0.108, 0.26], [0.13, 0.37]], B, 0.74));
    u.backSpikes = [];
    for (let k = 0; k < 5; k++) {
      const v = ell(0.024, 0.022, 0.028, B, 6); v.position.set(0, 0.04 + k * 0.075, -0.075); u.spine.add(v);
      const sp = new THREE.Mesh(geos().spur, B); sp.position.set(0, 0.04 + k * 0.075, -0.09); sp.rotation.x = -1.9; u.spine.add(sp); u.backSpikes.push(sp);
    }
    u.chest = grp(u.spine, 0, 0.34, 0);
    u.ribcage = lathe([[0.13, -0.03], [0.158, 0.08], [0.176, 0.2], [0.17, 0.31], [0.152, 0.39], [0.11, 0.455], [0.05, 0.5]], B, 0.72);
    u.chest.add(u.ribcage);
    u.ribs = [];
    for (let k = 0; k < 6; k++) {
      const rr = [0.16, 0.172, 0.177, 0.175, 0.168, 0.158][k];
      const r = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.0075, 4, 16, Math.PI * 0.95), B);
      r.rotation.set(Math.PI / 2, 0, Math.PI * 0.025); r.scale.set(1.01, 0.74, 1); r.position.set(0, 0.06 + k * 0.05, 0.004);
      u.chest.add(r); u.ribs.push(r);
    }
    for (let k = 0; k < 6; k++) {
      const v = ell(0.024, 0.022, 0.03, B, 6); v.position.set(0, 0.02 + k * 0.075, -0.12); u.chest.add(v);
      const sp = new THREE.Mesh(geos().spur, B); sp.position.set(0, 0.02 + k * 0.075, -0.135); sp.rotation.x = -1.95; u.chest.add(sp); u.backSpikes.push(sp);
    }
    for (const sx of [-1, 1]) { const sb = ell(0.07, 0.09, 0.025, B, 8); sb.position.set(sx * 0.09, 0.33, -0.1); sb.rotation.z = sx * 0.3; u.chest.add(sb); }
    const clav = cyl(0.018, 0.018, 0.4, B); clav.rotation.z = Math.PI / 2; clav.position.set(-0.2, 0.43, 0.06); u.chest.add(clav);
    u.shL = grp(u.chest, 0.23, 0.41, 0); u.shR = grp(u.chest, -0.23, 0.41, 0);
    u.shL.add(ell(0.05, 0.05, 0.05, B, 8)); u.shR.add(ell(0.05, 0.05, 0.05, B, 8));
    u.chL = grp(u.chest, 0.15, 0.16, 0.06); u.chR = grp(u.chest, -0.15, 0.16, 0.06); // braços extras
    // pescoço segmentado (cresce e se curva)
    u.neckSegs = [];
    let parent = grp(u.chest, 0, 0.44, 0.02);
    u.neckBase = parent;
    for (let k = 0; k < 5; k++) {
      const seg = grp(parent, 0, 0, 0);
      const m = cyl(0.045 - k * 0.002, 0.055 - k * 0.002, 1, B, 7); m.rotation.x = Math.PI; seg.add(m);
      const kn = ell(0.05, 0.03, 0.05, B, 7); seg.add(kn);
      u.neckSegs.push({ g: seg, m, kn });
      parent = seg;
    }
    u.neck = u.neckSegs[0].g;
    u.head = grp(parent, 0, 0.06, 0.03);
    const H = u.head;
    const skull = ell(0.12, 0.19, 0.15, B, 16); skull.position.set(0, 0.11, -0.01); H.add(skull);
    const brow = ell(0.12, 0.04, 0.05, B); brow.position.set(0, 0.15, 0.1); H.add(brow);
    for (const sx of [-1, 1]) {
      const ch = ell(0.03, 0.06, 0.05, B); ch.position.set(sx * 0.075, 0.04, 0.08); H.add(ch);
      const sock = ell(0.035, 0.03, 0.02, mats.inner, 10); sock.position.set(sx * 0.05, 0.12, 0.118); H.add(sock);
      const eye = ell(0.012, 0.012, 0.01, mats.eye, 8); eye.position.set(sx * 0.05, 0.118, 0.13); H.add(eye);
    }
    // olhos extras de aranha que abrem na testa conforme ela muda
    u.extraEyes = [];
    for (const [ex, ey, es] of [[0.025, 0.2, 0.009], [-0.025, 0.2, 0.009], [0.075, 0.18, 0.007], [-0.075, 0.18, 0.007], [0.0, 0.235, 0.008], [0.05, 0.245, 0.006], [-0.05, 0.245, 0.006]]) {
      const g = grp(H, ex, ey, 0.115);
      g.add(ell(es * 1.8, es * 1.5, es, mats.inner, 8));
      const e = ell(es, es, es * 0.8, mats.eye, 6); e.position.z = 0.005; g.add(e);
      u.extraEyes.push(g);
    }
    const mouthIn = ell(0.075, 0.06, 0.06, mats.inner, 10); mouthIn.position.set(0, -0.02, 0.06); H.add(mouthIn);
    for (let k = -4; k <= 4; k++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.045, 4), mats.teeth), a = (k / 4) * 1.0;
      t.position.set(Math.sin(a) * 0.08, -0.005, 0.07 + Math.cos(a) * 0.045); t.rotation.x = Math.PI; H.add(t);
    }
    u.jaw = grp(H, 0, 0.02, -0.03);
    const jm = ell(0.09, 0.04, 0.11, B); jm.position.set(0, -0.05, 0.08); u.jaw.add(jm);
    for (let k = -4; k <= 4; k++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.04, 4), mats.teeth), a = (k / 4) * 1.0;
      t.position.set(Math.sin(a) * 0.075, -0.015, 0.1 + Math.cos(a) * 0.04); u.jaw.add(t);
    }
    return u;
  }

  // ---------------- membros ----------------
  // kind: 'leg' (pernas da pélvis), 'arm' (braços -> patas da frente), 'mid' (brotam das costelas), 'extra' (braços extras)
  function Limb(kind, side, mats) {
    const g = geos(), B = mats.body;
    this.kind = kind; this.side = side;
    this.up = new THREE.Mesh(g.upper, B);
    this.lo = new THREE.Mesh(g.lower, B);
    this.kneeM = new THREE.Mesh(g.ball, B);
    this.spur = new THREE.Mesh(g.spur, B);
    this.claw = new THREE.Mesh(g.claw, B);
    this.parts = [this.up, this.lo, this.kneeM, this.spur, this.claw];
    if (kind === 'leg') { this.footM = new THREE.Mesh(g.ball, B); this.parts.push(this.footM); }
    if (kind === 'arm' || kind === 'extra') {
      this.hand = new THREE.Group();
      const palm = new THREE.Mesh(g.ball, B); palm.scale.set(0.3, 0.32, 0.12); palm.position.y = 0.22; this.hand.add(palm);
      this.fingers = [];
      for (let k = 0; k < 4; k++) {
        const f = new THREE.Group(); f.position.set((k - 1.5) * 0.12, 0.42, 0); this.hand.add(f);
        const fm = new THREE.Mesh(g.finger, B); fm.scale.set(0.05, 0.62, 0.05); f.add(fm);
        this.fingers.push(f);
      }
      const th = new THREE.Group(); th.position.set(side * 0.2, 0.2, 0.05); th.rotation.z = -side * 0.7; this.hand.add(th);
      const tm = new THREE.Mesh(g.finger, B); tm.scale.set(0.05, 0.42, 0.05); th.add(tm);
      this.parts.push(this.hand);
    }
    this.hip = new THREE.Vector3(); this.knee = new THREE.Vector3(); this.ankle = new THREE.Vector3(); this.foot = new THREE.Vector3();
    this.from = new THREE.Vector3(); this.to = new THREE.Vector3(); this.desired = new THREE.Vector3();
    this.tv = new THREE.Vector3(); this.tip = new THREE.Vector3(); // ponta simulada do membro solto
    this.stepping = false; this.st = 0; this.dur = 0.3; this.surface = 'floor'; this.planted = null;
    this.p = { L1: 0, L2: 0, L3: 0, r: 0.05, rest: [0, 0], planted: false, vis: 1, group: 0, pole: 'out' };
  }

  // parâmetros de cada membro em função da forma (contínua)
  function limbParams(L, f) {
    const a = U.clamp(f, 0, 1), b = U.clamp(f - 1, 0, 1), s = L.side, p = L.p;
    const ab = (v0, v1, v2) => (f <= 1 ? lerp(v0, v1, a) : lerp(v1, v2, b));
    if (L.kind === 'leg') {
      p.L1 = ab(0.6, 0.95, 1.75); p.L2 = ab(0.62, 1.15, 2.0); p.L3 = ab(0.06, 0.38, 0.6);
      p.r = ab(0.062, 0.092, 0.125);
      p.rest = [s * ab(0.14, 0.85, 1.65), ab(0.05, -0.8, -1.5)];
      p.planted = true; p.vis = 1; p.group = s > 0 ? (f < 0.5 ? 0 : 1) : (f < 0.5 ? 1 : 0);
      p.pole = f < 0.35 ? 'forward' : 'out'; p.poleK = sm(0.15, 0.55, f);
    } else if (L.kind === 'arm') {
      p.L1 = ab(0.62, 1.0, 1.75); p.L2 = ab(0.76, 1.25, 2.0); p.L3 = ab(0.22, 0.34, 0.5);
      p.r = ab(0.042, 0.085, 0.115);
      p.rest = [s * ab(0.6, 0.95, 1.65), ab(0.6, 1.05, 1.5)];
      p.planted = f >= 0.5; p.vis = 1; p.group = s > 0 ? 0 : 1; p.pole = p.planted ? 'out' : 'back'; p.poleK = 1;
    } else if (L.kind === 'mid') {
      const g = sm(1.05, 1.85, f);
      p.L1 = 1.75 * g; p.L2 = 2.0 * g; p.L3 = 0.6 * g; p.r = 0.115 * Math.max(0.35, g);
      p.rest = [s * 2.0 * Math.max(0.2, g), 0];
      p.planted = g > 0.62; p.vis = g; p.group = s > 0 ? 1 : 0; p.pole = 'out'; p.poleK = 1;
    } else {
      const g = sm(1.3, 1.95, f);
      p.L1 = 0.62 * g; p.L2 = 0.7 * g; p.L3 = 0.24 * g; p.r = 0.045 * Math.max(0.4, g);
      p.rest = [0, 0]; p.planted = false; p.vis = g; p.group = 0; p.pole = 'back'; p.poleK = 1;
    }
    return p;
  }

  // IK de dois ossos (mundo). Retorna o joelho em "out".
  const _d = new THREE.Vector3(), _p = new THREE.Vector3();
  function solveIK(H, F, L1, L2, pole, out) {
    _d.subVectors(F, H);
    let dist = _d.length();
    const maxD = (L1 + L2) * 0.998, minD = Math.abs(L1 - L2) + 0.02;
    if (dist < 1e-5) { _d.set(0, -1, 0); dist = 1e-5; }
    _d.divideScalar(dist);
    if (dist > maxD) { F.copy(H).addScaledVector(_d, maxD); dist = maxD; }
    if (dist < minD) dist = minD;
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
    if (_p.lengthSq() < 1e-6) _p.set(0, 1, 0);
    _p.normalize();
    return out.copy(H).addScaledVector(_d, a).addScaledVector(_p, h);
  }

  const _seg = new THREE.Vector3();
  function placeSeg(mesh, A, Bp, r) {
    mesh.position.copy(A);
    _seg.subVectors(Bp, A);
    const len = _seg.length() || 1e-4;
    mesh.quaternion.setFromUnitVectors(UP, _seg.divideScalar(len));
    mesh.scale.set(r, len, r);
  }

  function Creature(mats) {
    this.mats = mats;
    this.root = new THREE.Group();
    this.body = grp(this.root, 0, 1, 0);
    this.u = buildUpper(mats);
    this.body.add(this.u.group);
    this.head = this.u.head;
    const B = mats.body;
    // abdômen inchado (cresce na transformação)
    this.abdomen = grp(this.body, 0, 0.1, -0.2);
    const ab = ell(0.42, 0.36, 0.62, B, 16); ab.position.set(0, 0.06, -0.5); this.abdomen.add(ab);
    for (let k = 0; k < 9; k++) {
      const sp = new THREE.Mesh(geos().spur, B); sp.scale.set(0.035, 0.22 + Math.random() * 0.16, 0.035);
      sp.position.set((Math.random() - 0.5) * 0.45, 0.36, -0.15 - k * 0.1); sp.rotation.set(-0.6 - Math.random() * 0.4, 0, (Math.random() - 0.5) * 0.6);
      this.abdomen.add(sp);
    }
    for (let k = 0; k < 4; k++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4 - Math.abs(k - 1.5) * 0.05, 0.012, 4, 18), B); ring.position.set(0, 0.06, -0.3 - k * 0.14); ring.scale.set(1, 0.88, 1); this.abdomen.add(ring); }
    // âncoras no "cubo" do corpo (usadas quando ela fica gigante)
    this.anch = {
      hubFL: grp(this.body, 0.26, 0.05, 0.3), hubFR: grp(this.body, -0.26, 0.05, 0.3),
      hubML: grp(this.body, 0.36, 0.06, -0.05), hubMR: grp(this.body, -0.36, 0.06, -0.05),
      hubBL: grp(this.body, 0.28, 0.02, -0.35), hubBR: grp(this.body, -0.28, 0.02, -0.35),
    };
    this.limbs = [
      new Limb('leg', 1, mats), new Limb('leg', -1, mats),
      new Limb('arm', 1, mats), new Limb('arm', -1, mats),
      new Limb('mid', 1, mats), new Limb('mid', -1, mats),
      new Limb('extra', 1, mats), new Limb('extra', -1, mats),
    ];
    for (const L of this.limbs) for (const p of L.parts) this.root.add(p);
    this.world = null; this.ceil = 2.8;
    this.form = 0; this.growth = 0; this.scale = 1; this.stage = 0;
    this.tf = null; // transformação em andamento
    this.t = 0; this.phase = 0; this.lookYaw = 0; this.lookPitch = 0; this.roll = 0; this.headYaw = 0;
    this.mouth = 0; this.lunge = 0; this.flinch = 0; this.reach = 0; this.ceilT = 0;
    this.bob = 0; this.bobV = 0; this.lean = 0; this.plantCount = 0;
    this.vel = new THREE.Vector3(); this.prev = new THREE.Vector3(); this.first = true;
    this.tw = { yaw: 0, roll: 0, pitch: 0, a: 0, body: 0 }; this.twTimer = 1; this.jerkTimer = 0;
    this.onPlant = null; this.onJolt = null;
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._q = new THREE.Vector3(); this._pole = new THREE.Vector3(); this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
    this.root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  }
  Creature.STAGE_NAMES = ['O MAGRO', 'ARANHA', 'GIGANTE'];
  const C = Creature.prototype;

  C.setWorld = function (world) { this.world = world; this.ceil = world ? world.CEIL : 2.8; this.first = true; };
  C.setStage = function (s) { this.stage = U.clamp(s, 0, 2); this.form = this.stage; this.tf = null; this.first = true; };

  // metamorfose em espasmos: cada "tranco" avança a forma (e chama onJolt)
  C.transformTo = function (s, dur, done) {
    s = U.clamp(s, 0, 2);
    const n = U.randInt(7, 10), jolts = [];
    for (let i = 0; i < n; i++) jolts.push(U.rand(0.06, 0.86) * dur);
    jolts.sort((a, b) => a - b);
    this.tf = { from: this.form, to: s, t: 0, dur, jolts, ji: 0, prog: 0, progV: 0, done };
    this.stage = s;
  };
  C.transforming = function () { return !!this.tf; };

  const ab3 = (f, v0, v1, v2) => (f <= 1 ? lerp(v0, v1, U.clamp(f, 0, 1)) : lerp(v1, v2, U.clamp(f - 1, 0, 1)));
  C.speedMul = function () { return ab3(this.form, 1.0, 1.04, 0.98); };
  C.reachDist = function () { return ab3(this.form, 1.05, 1.45, 2.1) * this.scale; };
  C.soundSize = function () { return ab3(this.form, 0.85, 1.2, 1.8) * this.scale; };

  C.projectFoot = function (out, x, z, ceilMode) {
    const W = this.world, ceil = this.ceil;
    const yBase = ceilMode ? ceil : 0;
    if (!W || !W.solidAt(x, z)) { out.set(x, yBase, z); return ceilMode ? 'ceil' : 'floor'; }
    const cx = this.root.position.x, cz = this.root.position.z, dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz) || 1;
    if (W.solidAt(cx, cz)) { out.set(cx, yBase, cz); return 'floor'; }
    let lo = 0, hi = 1;
    for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (W.solidAt(cx + dx * m, cz + dz * m)) hi = m; else lo = m; }
    const over = (1 - lo) * d;
    out.set(cx + dx * lo, ceilMode ? Math.max(0.9, ceil - 0.15 - over * 1.1) : Math.min(ceil - 0.18, 0.3 + over * 1.25), cz + dz * lo);
    return 'wall';
  };

  C.restWorld = function (L, out) {
    out.set(L.p.rest[0], 0, L.p.rest[1]).applyMatrix4(this.root.matrixWorld);
    return out;
  };
  // âncora (ombro/quadril) — desliza para o "cubo" do corpo quando ela vira gigante
  C.anchorWorld = function (L, out) {
    const u = this.u, f = this.form, b = U.clamp(f - 1, 0, 1), s = L.side > 0;
    if (L.kind === 'leg') { (s ? u.hipL : u.hipR).getWorldPosition(out); if (b > 0) { (s ? this.anch.hubBL : this.anch.hubBR).getWorldPosition(this._b); out.lerp(this._b, sm(0, 1, b)); } }
    else if (L.kind === 'arm') { (s ? u.shL : u.shR).getWorldPosition(out); if (b > 0) { (s ? this.anch.hubFL : this.anch.hubFR).getWorldPosition(this._b); out.lerp(this._b, sm(0, 1, b)); } }
    else if (L.kind === 'mid') (s ? this.anch.hubML : this.anch.hubMR).getWorldPosition(out);
    else (s ? u.chL : u.chR).getWorldPosition(out);
    return out;
  };

  C.snapFeet = function () {
    for (const L of this.limbs) {
      limbParams(L, this.form);
      this.anchorWorld(L, L.hip);
      if (L.p.planted) { this.restWorld(L, this._v); L.surface = this.projectFoot(L.foot, this._v.x, this._v.z, this.ceilT > 0.5); }
      else { L.foot.copy(L.hip); L.foot.y = Math.max(0.05, L.foot.y - (L.p.L1 + L.p.L2) * this.scale * 0.9); }
      L.tip.copy(L.foot);
      L.planted = L.p.planted; L.stepping = false; L.tv.set(0, 0, 0);
    }
  };

  // p: { speed, look, listen, mouth, reach, reachTarget, flinch, lunge, agitation, jerky, eyeGlow, ceiling }
  C.update = function (dt, p) {
    p = p || {};
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const k = (r) => 1 - Math.exp(-r * dt);
    const u = this.u;

    // ---------- metamorfose ----------
    let tfK = 0; // intensidade da convulsão (0..1)
    if (this.tf) {
      const tf = this.tf;
      tf.t += dt;
      while (tf.ji < tf.jolts.length && tf.t >= tf.jolts[tf.ji]) {
        tf.ji++;
        // tranco: espasmo violento + estalo
        this.tw.yaw += U.rand(-1.6, 1.6); this.tw.roll += U.rand(-1.3, 1.3); this.tw.pitch += U.rand(-0.8, 0.8);
        this.tw.a += U.rand(-1.5, 1.5); this.tw.body += U.rand(-0.5, 0.5); this.bobV -= U.rand(0.6, 1.2);
        this.pulse = 1;
        if (this.onJolt) this.onJolt(tf.ji, tf.jolts.length);
      }
      // a forma "pula" a cada tranco (mola rápida com passagem do ponto)
      const target = tf.ji / tf.jolts.length;
      tf.progV += ((target - tf.prog) * 160 - tf.progV * 14) * dt;
      tf.prog += tf.progV * dt;
      this.form = lerp(tf.from, tf.to, U.clamp(tf.prog, 0, 1.04));
      tfK = 1 - sm(tf.dur - 0.5, tf.dur, tf.t);
      if (tf.t >= tf.dur + 0.4) { this.form = tf.to; const done = tf.done; this.tf = null; if (done) done(); }
    }
    const f = this.form, fa = U.clamp(f, 0, 1), fb = U.clamp(f - 1, 0, 1);

    this.mouth += ((Math.max(p.mouth || 0, tfK * (0.6 + 0.4 * Math.sin(this.t * 9)))) - this.mouth) * k(12);
    this.lunge += ((p.lunge || 0) - this.lunge) * k(14);
    this.flinch += ((p.flinch || 0) - this.flinch) * k(10);
    this.reach += ((p.reach || 0) - this.reach) * k(5);
    const wantCeil = p.ceiling && f >= 0.8 && !this.tf ? 1 : 0;
    this.ceilT += (wantCeil - this.ceilT) * k(2.5);

    this.scale = ab3(f, 0.95, 1.0, 1.0) * (1 + 0.14 * this.growth);
    this.root.scale.setScalar(this.scale);
    const S = this.scale;

    // velocidade real do corpo
    const rp = this.root.position;
    if (this.first) this.prev.copy(rp);
    const jump = this.prev.distanceTo(rp);
    if (dt > 0) { this._v.subVectors(rp, this.prev).divideScalar(dt); if (jump < 2) this.vel.lerp(this._v, k(8)); }
    this.prev.copy(rp);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.phase += dt * speed * 3.2;

    // espasmos (muito mais fortes durante a metamorfose)
    const ag = Math.max(p.agitation || 0, tfK);
    this.twTimer -= dt;
    if (this.twTimer <= 0) {
      this.twTimer = U.rand(0.25, 2.4) * (1.2 - ag) + (tfK ? 0.05 : 0);
      const r = Math.random();
      if (r < 0.4) this.tw.yaw += U.rand(-0.9, 0.9); else if (r < 0.7) this.tw.roll += U.rand(-0.8, 0.8); else this.tw.a += U.rand(-1, 1);
      this.tw.pitch += U.rand(-0.3, 0.3);
    }
    for (const key in this.tw) this.tw[key] *= Math.exp(-dt * (6 + ag * 6));

    if (p.jerky > 0 && !this.first && !this.tf) {
      this.jerkTimer -= dt;
      if (this.jerkTimer > 0) return;
      this.jerkTimer = U.rand(0.03, 0.14) / (0.4 + p.jerky);
    }

    // ---------- corpo ----------
    const ceilL = this.ceil / S;
    this.bobV += (-70 * this.bob - 10 * this.bobV) * dt;
    this.bob += this.bobV * dt;
    let wallLift = 0, nWall = 0;
    for (const L of this.limbs) if (L.planted && L.surface === 'wall') { wallLift += L.foot.y; nWall++; }
    if (nWall) wallLift = (wallLift / nWall / S) * 0.25;
    const bodyH = ab3(f, 1.16, 1.02, 2.0);
    const hangY = ceilL - lerp(0.42, 0.7, fb);
    let bodyY = lerp(bodyH + wallLift, hangY, this.ceilT) + this.bob * 0.6 - this.flinch * 0.12 + this.lunge * (f < 0.5 ? -0.1 : 0.15);
    bodyY = Math.min(bodyY, ceilL - 0.3);
    this.body.position.set(Math.sin(this.t * 31) * 0.03 * tfK, bodyY, 0);
    const leanT = f < 0.5 ? Math.min(0.22, speed * 0.04) : Math.min(0.12, speed * 0.02);
    this.lean += (leanT - this.lean) * k(4);
    // de cabeça para baixo no teto (espelho vertical) — só enquanto o tronco não está pendurado
    const flipAmt = U.smooth(0.35, 0.65, this.ceilT) * (1 - sm(1.3, 1.8, f));
    this.body.scale.set(1, 1 - 2 * flipAmt, 1);
    this.body.rotation.set(this.lean * (f < 0.5 ? 0.3 : 1) + this.tw.body * 0.4, Math.sin(this.t * 23) * 0.05 * tfK, Math.sin(this.phase) * 0.035 + this.tw.body * 0.3);
    // abdômen cresce (e pulsa a cada tranco da metamorfose)
    this.pulse = (this.pulse || 0) * Math.exp(-dt * 5);
    const abK = sm(0.75, 2.0, f);
    this.abdomen.visible = abK > 0.02;
    this.abdomen.scale.setScalar(Math.max(0.001, abK)).multiplyScalar(1 + Math.sin(this.t * (1.3 + ag * 3)) * 0.03 + this.pulse * 0.18);
    this.u.group.scale.setScalar((1 + 0.28 * fb) * (1 + this.pulse * 0.06));

    // ---------- tronco / pescoço / cabeça ----------
    const breathe = Math.sin(this.t * (1.1 + ag * 2)) * 0.025;
    u.ribcage.scale.set(1 + breathe * 0.5 + fa * 0.08 + this.pulse * 0.12, 1, 0.72 * (1 + breathe + this.pulse * 0.15));
    for (const r of u.ribs) r.scale.set(1.01 + fa * 0.12, 0.74 + fa * 0.06, 1 + fa * 0.25);
    for (const sp of u.backSpikes) sp.scale.set(0.018 * sm(0.3, 1.6, f), 0.01 + 0.13 * sm(0.3, 1.6, f), 0.018 * sm(0.3, 1.6, f));
    const spinePitch = ab3(f, 0.32, 1.22, 2.5) + (f < 0.5 ? this.lean : 0) - this.flinch * lerp(0.35, 0.7, fa) + this.lunge * lerp(0.2, -0.3, fb);
    u.spine.rotation.x = spinePitch + Math.sin(this.t * 13) * 0.08 * tfK;
    u.chest.rotation.set(ab3(f, 0.26, 0.12, 0.2) + breathe, (f < 0.5 ? -1 : 1) * Math.sin(this.phase) * 0.07, (f < 0.5 ? 0.06 : 0) + this.tw.body * 0.5);
    // pescoço: cresce e curva até a cabeça olhar para a frente
    const segLen = ab3(f, 0.066, 0.12, 0.17);
    const bendTotal = ab3(f, -0.5, -1.15, -2.35) + this.flinch * 0.5;
    this.root.updateMatrixWorld(true);
    let wantYaw = 0, wantPitch = 0;
    if (p.look) {
      this._v.copy(p.look); u.neckBase.worldToLocal(this._v);
      wantYaw = U.clamp(Math.atan2(this._v.x, this._v.z), -2.1, 2.1);
      this._w.copy(p.look); this.root.worldToLocal(this._w);
      this.lookYaw += U.angDiff(this.lookYaw, Math.atan2(this._w.x, this._w.z)) * k(8);
      wantPitch = U.clamp(Math.atan2(this._v.y, Math.hypot(this._v.x, this._v.z)) * 0.6, -0.9, 0.9);
    } else this.lookYaw *= Math.exp(-dt * 2);
    this.lookPitch += (wantPitch - this.lookPitch) * k(8);
    this.headYaw += U.angDiff(this.headYaw, wantYaw) * k(p.look ? 9 : 3);
    this.roll += ((p.listen ? 0.55 : 0) - this.roll) * k(3);
    const n = u.neckSegs.length;
    for (let i = 0; i < n; i++) {
      const sg = u.neckSegs[i];
      sg.g.position.y = i === 0 ? 0 : segLen;
      sg.m.scale.y = segLen;
      sg.g.rotation.set(bendTotal / n - this.lookPitch * 0.3 / n + Math.sin(this.t * 17 + i) * 0.12 * tfK, (this.headYaw * 0.35) / n, Math.sin(this.t * 0.9 + i) * 0.02 + this.tw.roll * 0.1);
    }
    u.head.position.y = segLen;
    u.head.rotation.set(-0.12 - this.lookPitch * 0.6 + this.tw.pitch - this.lunge * 0.3, this.headYaw * 0.65 + this.tw.yaw, this.roll + this.tw.roll + 0.1);
    u.jaw.rotation.x = 0.04 + this.mouth * lerp(0.95, 1.25, fb) + Math.max(0, Math.sin(this.t * 1.3)) * 0.03;
    u.jaw.scale.set(1, 1, 1 + fb * 0.35);
    const eyesK = sm(0.55, 1.6, f);
    for (const e of u.extraEyes) e.scale.setScalar(Math.max(0.001, eyesK));
    if (this.mats.eye.uniforms) this.mats.eye.uniforms.uEmissive.value = p.eyeGlow != null ? Math.max(p.eyeGlow, tfK * 1.2) : 0.4;
    this.root.updateMatrixWorld(true);

    if (this.first) { this.first = false; this.snapFeet(); }
    if (jump > 2.5) this.snapFeet();

    // ---------- membros ----------
    const ceilMode = this.ceilT > 0.5;
    const fwd = this._q.set(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y)).clone();
    const stepDist = ab3(f, 0.42, 0.6, 0.95), stepTime = ab3(f, 0.34, 0.24, 0.32), stepH = ab3(f, 0.13, 0.32, 0.55), lead = ab3(f, 0.3, 0.36, 0.45);
    const heavyEvery = f < 0.5 ? 1 : 2;
    const durMul = U.clamp(1.6 / (speed + 0.6), 0.42, 1.3);
    const otherStep = [false, false];
    for (const L of this.limbs) if (L.planted && L.stepping) otherStep[L.p.group] = true;
    let armIdx = 0;
    for (const L of this.limbs) {
      const P = limbParams(L, f);
      this.anchorWorld(L, L.hip);
      const L1 = P.L1 * S, L2 = P.L2 * S, L3 = P.L3 * S;
      // troca de solto -> plantado (os braços batem no chão e viram patas)
      if (P.planted !== L.planted) {
        if (P.planted) { L.foot.copy(L.tip); L.foot.y = Math.max(0, Math.min(L.foot.y, 0.05)); L.surface = 'floor'; L.stepping = false; this.bobV -= 0.4; if (this.onPlant) this.onPlant(L.foot.x, L.foot.y, L.foot.z, true, true); }
        if (!P.planted) L.tip.copy(L.foot);
        L.planted = P.planted;
      }
      const vis = P.vis > 0.04;
      for (const part of L.parts) part.visible = vis;
      if (!vis) { L.foot.copy(L.hip); continue; }

      if (L.planted) {
        this.restWorld(L, L.desired);
        L.desired.x += this.vel.x * lead; L.desired.z += this.vel.z * lead;
        if (L.stepping) {
          L.st += dt / L.dur;
          const e = U.smooth(0, 1, Math.min(1, L.st));
          L.foot.lerpVectors(L.from, L.to, e);
          const lift = Math.sin(Math.PI * Math.min(1, L.st)) * stepH * S;
          if (L.surface === 'ceil') L.foot.y -= lift; else L.foot.y += lift;
          if (L.st >= 1) {
            L.stepping = false; L.foot.copy(L.to);
            this.plantCount++;
            const heavy = this.plantCount % heavyEvery === 0;
            this.bobV -= (heavy ? 0.5 : 0.2) * (f < 0.5 ? 0.5 : 1);
            if (this.onPlant) this.onPlant(L.foot.x, L.foot.y, L.foot.z, heavy, f >= 0.5);
          }
        } else {
          const tmp = this._w;
          const surf = this.projectFoot(tmp, L.desired.x, L.desired.z, ceilMode);
          const dist = tmp.distanceTo(L.foot);
          const thresh = stepDist * S * (speed < 0.15 ? 1.6 : 1) * (this.tf ? 0.6 : 1);
          const urgent = dist > thresh * 1.9 || (ceilMode !== (L.surface === 'ceil') && L.surface !== 'wall');
          if ((dist > thresh && !otherStep[1 - P.group]) || urgent) {
            L.stepping = true; L.st = 0; L.dur = stepTime * durMul;
            L.from.copy(L.foot);
            this.projectFoot(L.to, L.desired.x + this.vel.x * L.dur * 0.6, L.desired.z + this.vel.z * L.dur * 0.6, ceilMode);
            L.surface = surf;
            otherStep[P.group] = true;
          }
        }
        if (this.reach > 0.05 && p.reachTarget && L.kind === 'arm' && L.side < 0) L.foot.lerp(p.reachTarget, this.reach);
        // tornozelo acima do pé: o tarso (garra ou mão) fica entre os dois
        const out = this._a.set(L.foot.x - rp.x, 0, L.foot.z - rp.z);
        if (out.lengthSq() < 1e-6) out.copy(fwd);
        out.normalize();
        if (L.surface === 'wall') L.ankle.copy(L.foot).addScaledVector(out, -L3 * 0.75).addScaledVector(UP, L3 * 0.35);
        else if (L.surface === 'ceil') L.ankle.copy(L.foot).addScaledVector(UP, -L3 * 0.82).addScaledVector(out, L3 * 0.45);
        else L.ankle.copy(L.foot).addScaledVector(UP, L3 * 0.82).addScaledVector(out, L3 * (L.kind === 'arm' ? -0.5 : 0.45));
      } else {
        // membro solto: pêndulo com mola (balança quando o corpo acelera)
        const len = (L1 + L2) * 0.92;
        const tgt = this._w.copy(L.hip);
        tgt.y -= len;
        const swing = L.kind === 'arm' ? Math.sin(this.phase + (L.side > 0 ? 0 : Math.PI)) * 0.22 * S * Math.min(1, speed / 1.5) : 0;
        tgt.addScaledVector(fwd, 0.1 * S + swing);
        tgt.x += Math.cos(this.root.rotation.y) * L.side * 0.08 * S; tgt.z -= Math.sin(this.root.rotation.y) * L.side * 0.08 * S;
        if (L.kind === 'mid') { // pernas brotando: se contorcem
          tgt.copy(L.hip).addScaledVector(this._v.set(L.side * Math.cos(this.root.rotation.y), 0, -L.side * Math.sin(this.root.rotation.y)), len * 0.8);
          tgt.y += Math.sin(this.t * 7 + L.side) * 0.35 * S - 0.2 * S;
        }
        if (this.reach > 0.05 && L.kind === 'arm' && L.side < 0) tgt.lerp(p.reachTarget || this._v.copy(L.hip).addScaledVector(UP, len), this.reach);
        if (this.flinch > 0.05 && L.kind === 'arm') { u.head.getWorldPosition(this._v); this._v.addScaledVector(fwd, 0.25 * S); tgt.lerp(this._v, this.flinch); }
        if (this.lunge > 0.05 && L.kind !== 'mid') { u.head.getWorldPosition(this._v); this._v.addScaledVector(fwd, 0.55 * S); this._v.y += (armIdx++ % 2 ? 0.15 : -0.1) * S; tgt.lerp(this._v, this.lunge); }
        tgt.y += this.tw.a * 0.15 * S + Math.sin(this.t * 19 + L.side) * 0.2 * S * tfK;
        L.tv.addScaledVector(this._v.subVectors(tgt, L.tip), 55 * dt);
        L.tv.multiplyScalar(Math.exp(-6.5 * dt));
        L.tip.addScaledVector(L.tv, dt);
        if (L.tip.y < 0.03) { L.tip.y = 0.03; L.tv.y = Math.max(0, L.tv.y); }
        const dd = L.tip.distanceTo(L.hip);
        if (dd > len * 1.08) L.tip.sub(L.hip).multiplyScalar((len * 1.08) / dd).add(L.hip);
        // o pulso é a ponta simulada; a mão continua na direção do antebraço
        L.ankle.copy(L.tip);
      }
      // polo do joelho: humano (para a frente) -> aranha (para cima e para fora)
      const pole = this._pole, outPole = this._b.set(L.ankle.x - L.hip.x, 0, L.ankle.z - L.hip.z);
      if (outPole.lengthSq() < 1e-6) outPole.copy(fwd);
      outPole.normalize().multiplyScalar(0.4); outPole.y = ceilMode ? -1 : 1;
      if (L.kind === 'leg') pole.copy(fwd).addScaledVector(UP, 0.15).lerp(outPole, P.poleK);
      else if (P.pole === 'back') { pole.copy(fwd).multiplyScalar(-1); pole.y = -0.3; }
      else pole.copy(outPole);
      solveIK(L.hip, L.ankle, L1, L2, pole, L.knee);
      if (!ceilMode) L.knee.y = Math.min(L.knee.y, this.ceil - 0.08); else L.knee.y = Math.max(L.knee.y, 0.3);
      if (!L.planted) { // mão no fim do antebraço
        this._v.subVectors(L.ankle, L.knee).normalize();
        L.foot.copy(L.ankle).addScaledVector(this._v, L3);
      }

      // ---------- malhas (espaço local da raiz) ----------
      const hipL = this.root.worldToLocal(this._v.copy(L.hip));
      const kneeL = this.root.worldToLocal(this._w.copy(L.knee));
      const ankL = this.root.worldToLocal(this._a.copy(L.ankle));
      const footL = this.root.worldToLocal(this._b.copy(L.foot));
      placeSeg(L.up, hipL, kneeL, P.r);
      placeSeg(L.lo, kneeL, ankL, P.r * 0.95);
      L.kneeM.position.copy(kneeL); L.kneeM.scale.set(P.r * 1.05, P.r * 1.3, P.r * 1.05);
      // espora de osso saindo do joelho, apontando para fora da dobra
      const spurK = L.kind === 'leg' || L.kind === 'arm' ? sm(0.25, 1.4, f) : L.kind === 'mid' ? 1 : 0;
      L.spur.visible = vis && spurK > 0.05;
      if (L.spur.visible) {
        this._q.copy(hipL).add(ankL).multiplyScalar(0.5);
        this._q.subVectors(kneeL, this._q); if (this._q.lengthSq() < 1e-6) this._q.set(0, 1, 0);
        L.spur.position.copy(kneeL); L.spur.quaternion.setFromUnitVectors(UP, this._q.normalize());
        L.spur.scale.set(P.r * 0.45, 0.32 * spurK, P.r * 0.45);
      }
      const useHand = !!L.hand;
      L.claw.visible = vis && !useHand && P.L3 > 0.1;
      if (L.claw.visible) placeSeg(L.claw, ankL, footL, P.r * 0.85);
      if (L.footM) {
        const hk = 1 - sm(0.15, 0.45, f);
        L.footM.visible = vis && hk > 0.05;
        L.footM.position.copy(footL); L.footM.position.y = Math.max(0.03, footL.y);
        L.footM.rotation.set(0, 0, 0); L.footM.scale.set(0.04 * hk + 0.001, 0.026 * hk + 0.001, 0.14 * hk + 0.001);
        L.footM.position.z += 0.05 * hk;
      }
      if (useHand) {
        L.hand.position.copy(ankL);
        this._q.subVectors(footL, ankL); const hl = this._q.length() || 1e-4;
        L.hand.quaternion.setFromUnitVectors(UP, this._q.divideScalar(hl));
        L.hand.scale.setScalar(hl);
        const splay = L.planted ? 0.35 : 0.06;
        const curl = L.planted ? -0.35 : 0.25 + Math.sin(this.t * 2 + L.side) * 0.15 * (1 + ag) - this.lunge * 0.3;
        L.fingers.forEach((fg, i) => { fg.rotation.set(curl, 0, (i - 1.5) * splay); });
      }
    }
  };

  C.dispose = function () {
    const shared = G ? Object.values(G) : [];
    const geos2 = new Set();
    this.root.traverse((o) => { if (o.geometry && !shared.includes(o.geometry)) geos2.add(o.geometry); });
    geos2.forEach((g) => g.dispose());
  };

  BR.Creature = Creature;
})(window.BR);
