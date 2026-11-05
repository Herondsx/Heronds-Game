/* ============================================================
   THE BACKROOMS — a criatura (O Inquilino, versão que CRESCE)
   ------------------------------------------------------------
   Estágios (inspirados no conceito do jogo):
     0 "O Magro"  — humanoide alto e esquelético, anda em pé
     1 "Aranha"   — os braços viraram pernas: anda de quatro,
                     joelhos acima do corpo, pescoço comprido
     2 "Gigante"  — seis pernas longuíssimas, corpo no alto e um
                     tronco humano pendurado de cabeça para baixo,
                     braços arrastando no chão

   Física procedural:
     * IK de 2 articulações em cada membro
     * pés PLANTADOS no mundo: só saem do lugar quando o corpo se
       afasta demais (passada em arco, grupos alternados)
     * se o pé cairia dentro de uma parede, ele SOBE a parede;
       no modo teto, os pés vão para o forro (anda de cabeça para
       baixo)
     * corpo com mola (afunda a cada passo), inclinação com a
       velocidade, braços pendurados como pêndulos
   Mesma interface da Entity antiga (update/root/head/lookYaw),
   então a IA e o jumpscare continuam funcionando.
   ============================================================ */
(function (BR) {
  'use strict';
  const U = BR.U;
  const UP = new THREE.Vector3(0, 1, 0);

  // ---------------- geometria compartilhada ----------------
  let G = null;
  function geos() {
    if (G) return G;
    const up = new THREE.CylinderGeometry(0.72, 1, 1, 7, 1); up.translate(0, 0.5, 0);
    const needle = new THREE.CylinderGeometry(0.07, 0.8, 1, 6, 1); needle.translate(0, 0.5, 0);
    const shin = new THREE.CylinderGeometry(0.66, 0.85, 1, 7, 1); shin.translate(0, 0.5, 0);
    const ball = new THREE.SphereGeometry(1, 8, 6);
    const finger = new THREE.CylinderGeometry(0.35, 1, 1, 5, 1); finger.translate(0, 0.5, 0);
    const spur = new THREE.ConeGeometry(1, 1, 5); spur.translate(0, 0.5, 0);
    G = { up, needle, shin, ball, finger, spur };
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

  // ---------------- tronco humano (cabeça, mandíbula, costelas) ----------------
  function buildUpper(mats) {
    const B = mats.body, u = {};
    u.group = new THREE.Group();
    u.group.add(ell(0.14, 0.1, 0.09, B));
    for (const sx of [-1, 1]) { const hb = ell(0.05, 0.06, 0.04, B, 8); hb.position.set(sx * 0.12, 0.03, 0.03); u.group.add(hb); }
    u.hipL = grp(u.group, 0.11, -0.03, 0); u.hipR = grp(u.group, -0.11, -0.03, 0);
    u.spine = grp(u.group, 0, 0.06, 0);
    u.spine.add(lathe([[0.112, 0], [0.098, 0.12], [0.108, 0.26], [0.13, 0.37]], B, 0.74));
    for (let k = 0; k < 5; k++) { const v = ell(0.024, 0.022, 0.028, B, 6); v.position.set(0, 0.04 + k * 0.075, -0.075); u.spine.add(v); }
    u.chest = grp(u.spine, 0, 0.34, 0);
    u.ribcage = lathe([[0.13, -0.03], [0.158, 0.08], [0.176, 0.2], [0.17, 0.31], [0.152, 0.39], [0.11, 0.455], [0.05, 0.5]], B, 0.72);
    u.chest.add(u.ribcage);
    for (let k = 0; k < 6; k++) {
      const rr = [0.16, 0.172, 0.177, 0.175, 0.168, 0.158][k];
      const r = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.0075, 4, 16, Math.PI * 0.95), B);
      r.rotation.set(Math.PI / 2, 0, Math.PI * 0.025); r.scale.set(1.01, 0.74, 1); r.position.set(0, 0.06 + k * 0.05, 0.004);
      u.chest.add(r);
    }
    for (let k = 0; k < 6; k++) { const v = ell(0.024, 0.022, 0.03, B, 6); v.position.set(0, 0.02 + k * 0.075, -0.12); u.chest.add(v); }
    for (const sx of [-1, 1]) { const sb = ell(0.07, 0.09, 0.025, B, 8); sb.position.set(sx * 0.09, 0.33, -0.1); sb.rotation.z = sx * 0.3; u.chest.add(sb); }
    const clav = cyl(0.018, 0.018, 0.4, B); clav.rotation.z = Math.PI / 2; clav.position.set(-0.2, 0.43, 0.06); u.chest.add(clav);
    u.shL = grp(u.chest, 0.23, 0.41, 0); u.shR = grp(u.chest, -0.23, 0.41, 0);
    u.shL.add(ell(0.05, 0.05, 0.05, B, 8)); u.shR.add(ell(0.05, 0.05, 0.05, B, 8));
    u.neck = grp(u.chest, 0, 0.44, 0.02);
    u.neckMesh = cyl(0.04, 0.06, 0.32, B); u.neckMesh.rotation.x = Math.PI; u.neck.add(u.neckMesh);
    u.head = grp(u.neck, 0, 0.3, 0.03);
    const H = u.head;
    const skull = ell(0.12, 0.19, 0.15, B, 16); skull.position.set(0, 0.11, -0.01); H.add(skull);
    const brow = ell(0.12, 0.04, 0.05, B); brow.position.set(0, 0.15, 0.1); H.add(brow);
    for (const sx of [-1, 1]) {
      const ch = ell(0.03, 0.06, 0.05, B); ch.position.set(sx * 0.075, 0.04, 0.08); H.add(ch);
      const sock = ell(0.035, 0.03, 0.02, mats.inner, 10); sock.position.set(sx * 0.05, 0.12, 0.118); H.add(sock);
      const eye = ell(0.012, 0.012, 0.01, mats.eye, 8); eye.position.set(sx * 0.05, 0.118, 0.13); H.add(eye);
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
  function Limb(c, anchor, mats) {
    const g = geos();
    this.c = c; this.anchor = anchor;
    this.up = new THREE.Mesh(g.up, mats.body);
    this.lo = new THREE.Mesh(c.style === 'human' ? g.shin : g.needle, mats.body);
    this.kneeM = new THREE.Mesh(g.ball, mats.body);
    this.parts = [this.up, this.lo, this.kneeM];
    if (c.spur) { this.spur = new THREE.Mesh(g.spur, mats.body); this.parts.push(this.spur); }
    if (c.foot) { this.footM = new THREE.Mesh(g.ball, mats.body); this.parts.push(this.footM); }
    if (c.hand) {
      this.hand = new THREE.Group();
      const palm = new THREE.Mesh(g.ball, mats.body); palm.scale.set(0.045, 0.07, 0.022); palm.position.y = 0.06; this.hand.add(palm);
      this.fingers = [];
      for (let k = 0; k < 4; k++) {
        const f = new THREE.Mesh(g.finger, mats.body); f.scale.set(0.011, 0.27, 0.011);
        f.position.set((k - 1.5) * 0.024, 0.11, 0); this.hand.add(f); this.fingers.push(f);
      }
      this.parts.push(this.hand);
    }
    this.hip = new THREE.Vector3(); this.knee = new THREE.Vector3(); this.foot = new THREE.Vector3();
    this.from = new THREE.Vector3(); this.to = new THREE.Vector3(); this.desired = new THREE.Vector3();
    this.tv = new THREE.Vector3(); // velocidade da ponta (membros pendurados)
    this.stepping = false; this.st = 0; this.dur = 0.3; this.surface = 'floor'; this.init = false;
  }

  // ---------------- estágios ----------------
  const STAGES = [
    {
      name: 'O Magro', size: 0.95, bodyH: 1.16, upper: 'upright', speedMul: 1.0, reach: 1.05, sound: 0.85,
      stepDist: 0.42, stepTime: 0.34, stepH: 0.13, lead: 0.3, heavyEvery: 1,
      legs: [
        { anchor: 'hipL', L1: 0.6, L2: 0.62, r: 0.062, rest: [0.14, 0.05], group: 0, pole: 'forward', style: 'human', foot: true },
        { anchor: 'hipR', L1: 0.6, L2: 0.62, r: 0.062, rest: [-0.14, 0.05], group: 1, pole: 'forward', style: 'human', foot: true },
      ],
      arms: [
        { anchor: 'shL', L1: 0.62, L2: 0.76, r: 0.042, side: 1, hand: true },
        { anchor: 'shR', L1: 0.62, L2: 0.76, r: 0.042, side: -1, hand: true },
      ],
    },
    {
      name: 'Aranha', size: 1.0, bodyH: 1.02, upper: 'prone', speedMul: 1.04, reach: 1.45, sound: 1.2,
      stepDist: 0.6, stepTime: 0.24, stepH: 0.32, lead: 0.36, heavyEvery: 2,
      legs: [
        { anchor: 'shL', L1: 1.02, L2: 1.32, r: 0.065, rest: [0.95, 1.05], group: 0, pole: 'out', spur: true },
        { anchor: 'shR', L1: 1.02, L2: 1.32, r: 0.065, rest: [-0.95, 1.05], group: 1, pole: 'out', spur: true },
        { anchor: 'hipL', L1: 1.0, L2: 1.26, r: 0.056, rest: [0.85, -0.82], group: 1, pole: 'out' },
        { anchor: 'hipR', L1: 1.0, L2: 1.26, r: 0.056, rest: [-0.85, -0.82], group: 0, pole: 'out' },
      ],
      arms: [],
    },
    {
      name: 'Gigante', size: 1.0, bodyH: 2.05, upper: 'hanging', speedMul: 0.98, reach: 2.1, sound: 1.8,
      stepDist: 0.95, stepTime: 0.32, stepH: 0.55, lead: 0.45, heavyEvery: 2,
      legs: [
        { anchor: 'tFL', L1: 1.8, L2: 2.3, r: 0.07, rest: [1.65, 1.5], group: 0, pole: 'out', spur: true },
        { anchor: 'tFR', L1: 1.8, L2: 2.3, r: 0.07, rest: [-1.65, 1.5], group: 1, pole: 'out', spur: true },
        { anchor: 'tML', L1: 1.8, L2: 2.3, r: 0.07, rest: [2.0, 0.0], group: 1, pole: 'out' },
        { anchor: 'tMR', L1: 1.8, L2: 2.3, r: 0.07, rest: [-2.0, 0.0], group: 0, pole: 'out' },
        { anchor: 'tBL', L1: 1.8, L2: 2.3, r: 0.07, rest: [1.65, -1.5], group: 0, pole: 'out', spur: true },
        { anchor: 'tBR', L1: 1.8, L2: 2.3, r: 0.07, rest: [-1.65, -1.5], group: 1, pole: 'out', spur: true },
      ],
      arms: [
        { anchor: 'shL', L1: 0.72, L2: 0.88, r: 0.045, side: 1, hand: true },
        { anchor: 'shR', L1: 0.72, L2: 0.88, r: 0.045, side: -1, hand: true },
      ],
    },
  ];

  // IK de duas articulações (espaço do mundo). Retorna o joelho em "out".
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

  function Creature(mats) {
    this.mats = mats;
    this.root = new THREE.Group();
    this.body = grp(this.root, 0, 1, 0);
    this.u = buildUpper(mats);
    this.body.add(this.u.group);
    this.head = this.u.head;
    const B = mats.body;
    // tórax/abdômen do estágio gigante
    this.thorax = new THREE.Group(); this.body.add(this.thorax);
    const th = ell(0.42, 0.3, 0.55, B, 14); this.thorax.add(th);
    const ab = ell(0.36, 0.3, 0.5, B, 12); ab.position.set(0, 0.12, -0.65); this.thorax.add(ab);
    for (let k = 0; k < 7; k++) { const sp = new THREE.Mesh(geos().spur, B); sp.scale.set(0.03, 0.18 + Math.random() * 0.12, 0.03); sp.position.set((Math.random() - 0.5) * 0.4, 0.25, -0.5 + k * 0.15); sp.rotation.x = -0.5; this.thorax.add(sp); }
    this.anchors = {
      hipL: this.u.hipL, hipR: this.u.hipR, shL: this.u.shL, shR: this.u.shR,
      tFL: grp(this.thorax, 0.33, 0.02, 0.38), tFR: grp(this.thorax, -0.33, 0.02, 0.38),
      tML: grp(this.thorax, 0.42, 0.02, 0.0), tMR: grp(this.thorax, -0.42, 0.02, 0.0),
      tBL: grp(this.thorax, 0.33, 0.02, -0.38), tBR: grp(this.thorax, -0.33, 0.02, -0.38),
    };
    this.limbs = []; this.legs = []; this.arms = [];
    this.world = null; this.ceil = 2.8;
    this.growth = 0; this.scale = 1;
    this.t = 0; this.phase = 0; this.lookYaw = 0; this.lookPitch = 0; this.roll = 0;
    this.mouth = 0; this.lunge = 0; this.flinch = 0; this.reach = 0; this.ceilT = 0;
    this.bob = 0; this.bobV = 0; this.lean = 0; this.plantCount = 0;
    this.vel = new THREE.Vector3(); this.prev = new THREE.Vector3(); this.first = true;
    this.tw = { yaw: 0, roll: 0, pitch: 0, a: 0 }; this.twTimer = 1; this.jerkTimer = 0;
    this.onPlant = null; // (x, y, z, pesado:boolean, ponta:boolean)
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._q = new THREE.Vector3(); this._pole = new THREE.Vector3();
    this.stage = -1;
    this.setStage(0);
    this.root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  }
  Creature.STAGES = STAGES;
  const C = Creature.prototype;

  C.setWorld = function (world) { this.world = world; this.ceil = world ? world.CEIL : 2.8; this.first = true; };

  C.setStage = function (s) {
    s = U.clamp(s, 0, STAGES.length - 1);
    if (s === this.stage) return;
    for (const L of this.limbs) for (const p of L.parts) this.root.remove(p);
    this.stage = s; this.cfg = STAGES[s];
    const cfg = this.cfg, u = this.u;
    this.limbs = []; this.legs = []; this.arms = [];
    for (const c of cfg.legs) { const L = new Limb(c, this.anchors[c.anchor], this.mats); L.leg = true; this.legs.push(L); this.limbs.push(L); }
    for (const c of cfg.arms) { const L = new Limb(c, this.anchors[c.anchor], this.mats); L.leg = false; this.arms.push(L); this.limbs.push(L); }
    for (const L of this.limbs) for (const p of L.parts) { p.frustumCulled = false; this.root.add(p); }
    // forma do tronco em cada estágio
    this.thorax.visible = cfg.upper === 'hanging';
    u.group.position.set(0, 0, 0); u.group.rotation.set(0, 0, 0);
    u.neckMesh.scale.y = cfg.upper === 'prone' ? 1.9 : 1;
    u.head.position.y = cfg.upper === 'prone' ? 0.6 : 0.3;
    if (cfg.upper === 'hanging') { u.group.position.set(0, -0.22, 0.32); u.group.rotation.set(0, 0, Math.PI); }
    this.first = true;
    this.root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  };

  // tamanho efetivo para sons/alcance
  C.soundSize = function () { return this.cfg.sound * this.scale; };
  C.reachDist = function () { return this.cfg.reach * this.scale; };

  // projeta o ponto desejado do pé no ambiente (chão/teto, ou sobe a parede)
  C.projectFoot = function (out, x, z, ceilMode) {
    const W = this.world, ceil = this.ceil;
    const yBase = ceilMode ? ceil : 0;
    if (!W || !W.solidAt(x, z)) { out.set(x, yBase, z); return ceilMode ? 'ceil' : 'floor'; }
    const cx = this.root.position.x, cz = this.root.position.z, dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz) || 1;
    let lo = 0, hi = 1;
    if (W.solidAt(cx, cz)) { out.set(cx, yBase, cz); return 'floor'; }
    for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (W.solidAt(cx + dx * m, cz + dz * m)) hi = m; else lo = m; }
    const over = (1 - lo) * d;
    const wx = cx + dx * lo, wz = cz + dz * lo;
    const y = ceilMode ? Math.max(0.9, ceil - 0.15 - over * 1.1) : Math.min(ceil - 0.18, 0.3 + over * 1.25);
    out.set(wx, y, wz);
    return 'wall';
  };

  C.snapFeet = function () {
    for (const L of this.legs) {
      this.restWorld(L, this._v);
      L.surface = this.projectFoot(L.foot, this._v.x, this._v.z, this.ceilT > 0.5);
      L.stepping = false; L.init = true;
    }
    for (const L of this.arms) { L.anchor.getWorldPosition(L.foot); L.foot.y = Math.max(0.05, L.foot.y - (L.c.L1 + L.c.L2) * this.scale * 0.9); L.tv.set(0, 0, 0); }
  };
  C.restWorld = function (L, out) {
    out.set(L.c.rest[0], 0, L.c.rest[1]);
    out.applyMatrix4(this.root.matrixWorld);
    return out;
  };

  // p: { speed, look, listen, mouth, reach, reachTarget, flinch, lunge, agitation, jerky, eyeGlow, ceiling, stepVol }
  C.update = function (dt, p) {
    p = p || {};
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const k = (r) => 1 - Math.exp(-r * dt);
    const cfg = this.cfg, u = this.u;
    this.mouth += ((p.mouth || 0) - this.mouth) * k(12);
    this.lunge += ((p.lunge || 0) - this.lunge) * k(14);
    this.flinch += ((p.flinch || 0) - this.flinch) * k(10);
    this.reach += ((p.reach || 0) - this.reach) * k(5);
    const wantCeil = p.ceiling && cfg.upper !== 'upright' ? 1 : 0;
    this.ceilT += (wantCeil - this.ceilT) * k(2.5);

    // escala (cresce aos poucos dentro do estágio)
    this.scale = cfg.size * (1 + 0.14 * this.growth);
    this.root.scale.setScalar(this.scale);
    const S = this.scale;

    // velocidade real do corpo (para inclinar e antecipar passos)
    const rp = this.root.position;
    if (this.first) { this.prev.copy(rp); }
    const jump = this.prev.distanceTo(rp);
    if (dt > 0) { this._v.subVectors(rp, this.prev).divideScalar(dt); if (jump < 2) this.vel.lerp(this._v, k(8)); }
    this.prev.copy(rp);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.phase += dt * speed * 3.2;

    // espasmos
    const ag = p.agitation || 0;
    this.twTimer -= dt;
    if (this.twTimer <= 0) {
      this.twTimer = U.rand(0.25, 2.4) * (1.2 - ag);
      const r = Math.random();
      if (r < 0.4) this.tw.yaw += U.rand(-0.9, 0.9); else if (r < 0.7) this.tw.roll += U.rand(-0.8, 0.8); else this.tw.a += U.rand(-1, 1);
      this.tw.pitch += U.rand(-0.3, 0.3);
    }
    for (const key in this.tw) this.tw[key] *= Math.exp(-dt * (6 + ag * 8));

    // stop-motion
    if (p.jerky > 0 && !this.first) {
      this.jerkTimer -= dt;
      if (this.jerkTimer > 0) return;
      this.jerkTimer = U.rand(0.03, 0.14) / (0.4 + p.jerky);
    }

    // ---------- corpo ----------
    const ceilL = this.ceil / S;
    // mola vertical (afunda quando um pé pesado toca o chão)
    this.bobV += (-70 * this.bob - 10 * this.bobV) * dt;
    this.bob += this.bobV * dt;
    let wallLift = 0, nWall = 0;
    for (const L of this.legs) if (L.surface === 'wall') { wallLift += L.foot.y; nWall++; }
    if (nWall) wallLift = (wallLift / nWall / S) * 0.25;
    const hangY = ceilL - (cfg.upper === 'prone' ? 0.42 : 0.65);
    let bodyY = U.lerp(cfg.bodyH + wallLift, hangY, this.ceilT) + this.bob - this.flinch * 0.12 + this.lunge * (cfg.upper === 'upright' ? -0.1 : 0.15);
    bodyY = Math.min(bodyY, ceilL - 0.3);
    this.body.position.set(0, bodyY, 0);
    this.lean += ((cfg.upper === 'upright' ? Math.min(0.22, speed * 0.04) : Math.min(0.12, speed * 0.02)) - this.lean) * k(4);
    // corpo de cabeça para baixo no teto (espelho vertical: esquerda continua esquerda)
    const flip = cfg.upper === 'prone' ? U.lerp(1, -1, U.smooth(0.35, 0.65, this.ceilT)) : 1;
    this.body.scale.set(1, flip, 1);
    this.body.rotation.set(this.lean * (cfg.upper === 'upright' ? 0.3 : 1), 0, Math.sin(this.phase) * 0.035);

    // ---------- tronco / cabeça ----------
    const breathe = Math.sin(this.t * (1.1 + ag * 2)) * 0.025;
    u.ribcage.scale.set(1 + breathe * 0.5, 1, 0.72 * (1 + breathe));
    if (cfg.upper === 'upright') {
      u.spine.rotation.x = 0.32 + this.lean - this.flinch * 0.35 + this.lunge * 0.2;
      u.chest.rotation.set(0.26 + breathe, -Math.sin(this.phase) * 0.08, 0.06);
    } else if (cfg.upper === 'prone') {
      u.spine.rotation.x = 1.22 - this.flinch * 0.7 - this.lunge * 0.15;
      u.chest.rotation.set(0.12 + breathe, Math.sin(this.phase) * 0.05, 0);
    } else {
      u.spine.rotation.x = 0.15 + Math.sin(this.t * 0.6) * 0.06 - this.lunge * 0.35;
      u.chest.rotation.set(0.1 + breathe, Math.sin(this.t * 0.4) * 0.1, 0);
    }
    const neckBase = cfg.upper === 'upright' ? -0.5 : cfg.upper === 'prone' ? -1.15 : -0.1;
    this.root.updateMatrixWorld(true);

    // olhar: calculado no espaço do pescoço (funciona até de cabeça para baixo)
    let wantYaw = 0, wantPitch = 0;
    if (p.look) {
      this._v.copy(p.look); u.neck.worldToLocal(this._v); this._v.sub(u.head.position);
      wantYaw = U.clamp(Math.atan2(this._v.x, this._v.z), -2.1, 2.1);
      wantPitch = U.clamp(Math.atan2(this._v.y, Math.hypot(this._v.x, this._v.z)), -1.0, 1.0);
      this._w.copy(p.look); this.root.worldToLocal(this._w);
      this.lookYaw += U.angDiff(this.lookYaw, Math.atan2(this._w.x, this._w.z)) * k(8);
    } else this.lookYaw *= Math.exp(-dt * 2);
    this.lookPitch += (wantPitch - this.lookPitch) * k(8);
    this.headYaw = (this.headYaw || 0) + U.angDiff(this.headYaw || 0, wantYaw) * k(p.look ? 9 : 3);
    this.roll += ((p.listen ? 0.55 : 0) - this.roll) * k(3);
    u.neck.rotation.set(neckBase + this.flinch * 0.5 - this.lookPitch * 0.25, this.headYaw * 0.3, 0);
    u.head.rotation.set(-0.12 - this.lookPitch * 0.6 + this.tw.pitch - this.lunge * 0.3, this.headYaw * 0.7 + this.tw.yaw, this.roll + this.tw.roll + 0.1);
    u.jaw.rotation.x = 0.04 + this.mouth * 0.95 + Math.max(0, Math.sin(this.t * 1.3)) * 0.03;
    if (this.mats.eye.uniforms) this.mats.eye.uniforms.uEmissive.value = p.eyeGlow != null ? p.eyeGlow : 0.4;
    this.root.updateMatrixWorld(true);

    if (this.first) { this.first = false; this.snapFeet(); }
    if (jump > 2.5) this.snapFeet();

    // ---------- pernas plantadas ----------
    const ceilMode = this.ceilT > 0.5;
    const fwd = this._q.set(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y));
    const sp = Math.max(0.2, speed);
    const durMul = U.clamp(1.6 / (speed + 0.6), 0.42, 1.3);
    let otherStep = [false, false];
    for (const L of this.legs) if (L.stepping) otherStep[L.c.group] = true;
    for (const L of this.legs) {
      L.anchor.getWorldPosition(L.hip);
      this.restWorld(L, L.desired);
      L.desired.x += this.vel.x * cfg.lead; L.desired.z += this.vel.z * cfg.lead;
      if (L.stepping) {
        L.st += dt / L.dur;
        const e = U.smooth(0, 1, Math.min(1, L.st));
        L.foot.lerpVectors(L.from, L.to, e);
        const lift = Math.sin(Math.PI * Math.min(1, L.st)) * cfg.stepH * S;
        if (L.surface === 'ceil') L.foot.y -= lift; else L.foot.y += lift;
        if (L.st >= 1) {
          L.stepping = false; L.foot.copy(L.to);
          this.plantCount++;
          const heavy = this.plantCount % cfg.heavyEvery === 0;
          this.bobV -= (heavy ? 0.5 : 0.2) * (cfg.upper === 'upright' ? 0.5 : 1);
          if (this.onPlant) this.onPlant(L.foot.x, L.foot.y, L.foot.z, heavy, cfg.upper !== 'upright');
        }
      } else {
        const tmp = this._w;
        const surf = this.projectFoot(tmp, L.desired.x, L.desired.z, ceilMode);
        const dist = tmp.distanceTo(L.foot);
        const thresh = cfg.stepDist * S * (speed < 0.15 ? 1.6 : 1);
        const urgent = dist > thresh * 1.9 || (ceilMode !== (L.surface === 'ceil') && L.surface !== 'wall');
        if ((dist > thresh && !otherStep[1 - L.c.group]) || urgent) {
          L.stepping = true; L.st = 0; L.dur = cfg.stepTime * durMul;
          L.from.copy(L.foot);
          // aterrissa um pouco à frente do alvo (o corpo continua andando)
          this.projectFoot(L.to, L.desired.x + this.vel.x * L.dur * 0.6, L.desired.z + this.vel.z * L.dur * 0.6, ceilMode);
          L.surface = surf;
          otherStep[L.c.group] = true;
        }
      }
      // estender a perna para pegar uma lâmpada (estágios com braços-perna)
      if (this.reach > 0.05 && p.reachTarget && L === this.legs[1] && cfg.upper !== 'upright') {
        L.foot.lerp(p.reachTarget, this.reach);
      }
      // polo do joelho: humano -> joelho para a frente; aranha -> para cima e para fora
      const pole = this._pole;
      if (L.c.pole === 'forward') pole.copy(fwd).addScaledVector(UP, 0.15);
      else {
        pole.set(L.foot.x - L.hip.x, 0, L.foot.z - L.hip.z).normalize().multiplyScalar(0.4);
        pole.y = ceilMode ? -1 : 1;
      }
      solveIK(L.hip, L.foot, L.c.L1 * S, L.c.L2 * S, pole, L.knee);
      if (!ceilMode) L.knee.y = Math.min(L.knee.y, this.ceil - 0.08);
      else L.knee.y = Math.max(L.knee.y, 0.3);
    }

    // ---------- braços pendurados (pêndulo com mola) ----------
    let armIdx = 0;
    for (const L of this.arms) {
      L.anchor.getWorldPosition(L.hip);
      const len = (L.c.L1 + L.c.L2) * S;
      const tgt = this._w.copy(L.hip);
      tgt.y -= len * 0.92;
      tgt.addScaledVector(fwd, (cfg.upper === 'upright' ? 0.12 : 0.05) * S + Math.sin(this.phase + (armIdx ? Math.PI : 0)) * 0.22 * S * Math.min(1, speed / 1.5));
      tgt.x += Math.cos(this.root.rotation.y) * L.c.side * 0.08 * S; tgt.z -= Math.sin(this.root.rotation.y) * L.c.side * 0.08 * S;
      // poses: lâmpada, ofuscada (protege o rosto), bote (garras para a frente)
      if (this.reach > 0.05 && armIdx === 1) {
        const r = p.reachTarget || this._v.copy(L.hip).addScaledVector(UP, len);
        tgt.lerp(r, this.reach);
      }
      if (this.flinch > 0.05) { u.head.getWorldPosition(this._v); this._v.addScaledVector(fwd, 0.25 * S); tgt.lerp(this._v, this.flinch); }
      if (this.lunge > 0.05) { u.head.getWorldPosition(this._v); this._v.addScaledVector(fwd, 0.55 * S); this._v.y += (armIdx ? 0.15 : -0.1) * S; tgt.lerp(this._v, this.lunge); }
      tgt.y += this.tw.a * 0.15 * S;
      // integra a ponta com mola + amortecimento (balança quando o corpo acelera)
      L.tv.addScaledVector(this._v.subVectors(tgt, L.foot), 55 * dt);
      L.tv.multiplyScalar(Math.exp(-6.5 * dt));
      L.foot.addScaledVector(L.tv, dt);
      if (L.foot.y < 0.03) { L.foot.y = 0.03; L.tv.y = Math.max(0, L.tv.y); }
      const dd = L.foot.distanceTo(L.hip);
      if (dd > len * 0.995) L.foot.sub(L.hip).multiplyScalar((len * 0.995) / dd).add(L.hip);
      const pole = this._pole.copy(fwd).multiplyScalar(-1); pole.y = -0.3;
      solveIK(L.hip, L.foot, L.c.L1 * S, L.c.L2 * S, pole, L.knee);
      armIdx++;
    }

    // ---------- malhas dos membros (espaço local da raiz) ----------
    const inv = 1 / S;
    for (const L of this.limbs) {
      const hipL = this.root.worldToLocal(this._v.copy(L.hip));
      const kneeL = this.root.worldToLocal(this._w.copy(L.knee));
      placeSeg(L.up, hipL, kneeL, L.c.r * (L.c.style === 'human' ? 1 : 1));
      const footL = this.root.worldToLocal(this._q.copy(L.foot));
      placeSeg(L.lo, kneeL, footL, L.c.r * 0.8);
      L.kneeM.position.copy(kneeL); L.kneeM.scale.setScalar(L.c.r * 1.05);
      if (L.spur) { L.spur.position.copy(kneeL); L.spur.quaternion.copy(L.up.quaternion); L.spur.scale.set(L.c.r * 0.5, 0.35 * inv * S, L.c.r * 0.5); }
      if (L.footM) {
        L.footM.position.copy(footL); L.footM.position.y = Math.max(0.025 * inv, footL.y);
        L.footM.rotation.set(0, 0, 0); L.footM.scale.set(0.04, 0.026, 0.14);
        L.footM.position.z += 0.06;
      }
      if (L.hand) {
        L.hand.position.copy(footL);
        L.hand.quaternion.copy(L.lo.quaternion);
        const curl = 0.25 + Math.sin(this.t * 2 + L.c.side) * 0.15 * (1 + ag) - this.lunge * 0.3;
        for (const f of L.fingers) f.rotation.x = curl;
      }
    }
    // fecha o laço de rotação do fwd (o vetor _q foi reutilizado acima)
  };

  const _seg = new THREE.Vector3();
  function placeSeg(mesh, A, Bp, r) {
    mesh.position.copy(A);
    _seg.subVectors(Bp, A);
    const len = _seg.length() || 1e-4;
    mesh.quaternion.setFromUnitVectors(UP, _seg.divideScalar(len));
    mesh.scale.set(r, len, r);
  }

  C.dispose = function () {
    const geos2 = new Set();
    this.root.traverse((o) => { if (o.geometry && G && !Object.values(G).includes(o.geometry)) geos2.add(o.geometry); });
    geos2.forEach((g) => g.dispose());
  };

  BR.Creature = Creature;
})(window.BR);
