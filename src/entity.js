/* ============================================================
   THE BACKROOMS — a entidade ("O Inquilino")
   ------------------------------------------------------------
   Modelo procedural articulado: ~2,6 m, emaciado, pele escura
   e úmida, costelas aparentes, braços longos demais com dedos
   finos, crânio alongado sem nariz, órbitas fundas com brilho
   de retina (reflete a lanterna, como olhos de animal) e uma
   mandíbula que se abre demais.

   Animação 100% procedural:
     * andar curvado (bípede) e corrida de quatro (quadrúpede),
       misturados de forma contínua
     * cabeça que segue o alvo e gira além do natural
     * inclinação de "escuta", espasmos, modo stop-motion
     * poses especiais: alcançar lâmpada, proteger o rosto da
       luz, bote final (jumpscare)
   O mesmo modelo é usado na intro e no jogo.
   ============================================================ */
(function (BR) {
  'use strict';
  const U = BR.U;

  function cyl(r0, r1, len, mat, seg) {
    const g = new THREE.CylinderGeometry(r0, r1, len, seg || 7, 1);
    g.translate(0, -len / 2, 0);
    return new THREE.Mesh(g, mat);
  }
  function ell(sx, sy, sz, mat, seg) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, seg || 12, Math.max(6, (seg || 12) - 2)), mat);
    m.scale.set(sx, sy, sz);
    return m;
  }
  // superfície de revolução a partir de [raio, altura]; sz achata na profundidade
  function lathe(profile, mat, sz) {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 14);
    const m = new THREE.Mesh(g, mat);
    m.scale.z = sz || 1;
    return m;
  }
  function grp(parent, x, y, z) {
    const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g;
  }

  function Entity(mats) {
    this.mats = mats;
    const B = mats.body, root = (this.root = new THREE.Group());

    // ---------- quadril e tronco ----------
    const hips = (this.hips = grp(root, 0, 1.22, 0));
    hips.add(ell(0.14, 0.1, 0.09, B));
    for (const sx of [-1, 1]) { const hb = ell(0.05, 0.06, 0.04, B, 8); hb.position.set(sx * 0.12, 0.03, 0.03); hips.add(hb); }
    const spine = (this.spine = grp(hips, 0, 0.06, 0));
    // tronco por perfil de revolução (cintura fina, costelas largas, ombros caídos)
    const abd = lathe([[0.112, 0], [0.098, 0.12], [0.108, 0.26], [0.13, 0.37]], B, 0.74); spine.add(abd);
    for (let k = 0; k < 5; k++) { const v = ell(0.024, 0.022, 0.028, B, 6); v.position.set(0, 0.04 + k * 0.075, -0.075); spine.add(v); }
    const chest = (this.chest = grp(spine, 0, 0.34, 0));
    const rib = lathe([[0.13, -0.03], [0.158, 0.08], [0.176, 0.2], [0.17, 0.31], [0.152, 0.39], [0.11, 0.455], [0.05, 0.5]], B, 0.72);
    chest.add(rib);
    this.ribcage = rib;
    for (let k = 0; k < 6; k++) { // costelas aparentes (finas, rente à pele)
      const rr = [0.16, 0.172, 0.177, 0.175, 0.168, 0.158][k];
      const r = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.0075, 4, 16, Math.PI * 0.95), B);
      r.rotation.set(Math.PI / 2, 0, Math.PI * 0.025); r.scale.set(1.01, 0.74, 1);
      r.position.set(0, 0.06 + k * 0.05, 0.004); chest.add(r);
    }
    for (let k = 0; k < 6; k++) { const v = ell(0.024, 0.022, 0.03, B, 6); v.position.set(0, 0.02 + k * 0.075, -0.12); chest.add(v); }
    for (const sx of [-1, 1]) { const sb = ell(0.07, 0.09, 0.025, B, 8); sb.position.set(sx * 0.09, 0.33, -0.1); sb.rotation.z = sx * 0.3; chest.add(sb); }
    const clav = cyl(0.018, 0.018, 0.4, B); clav.rotation.z = Math.PI / 2; clav.position.set(-0.2, 0.43, 0.06); chest.add(clav); // vai de -0,2 a +0,2

    // ---------- pescoço e cabeça ----------
    const neck = (this.neck = grp(chest, 0, 0.44, 0.02));
    const nm = cyl(0.04, 0.06, 0.32, B); nm.rotation.x = Math.PI; nm.position.y = 0; neck.add(nm);
    const head = (this.head = grp(neck, 0, 0.3, 0.03));
    const skull = ell(0.12, 0.19, 0.15, B, 16); skull.position.set(0, 0.11, -0.01); head.add(skull);
    const brow = ell(0.12, 0.04, 0.05, B); brow.position.set(0, 0.15, 0.1); head.add(brow);
    const cheekL = ell(0.03, 0.06, 0.05, B); cheekL.position.set(0.075, 0.04, 0.08); head.add(cheekL);
    const cheekR = cheekL.clone(); cheekR.position.x = -0.075; head.add(cheekR);
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const sock = ell(0.035, 0.03, 0.02, mats.inner, 10); sock.position.set(sx * 0.05, 0.12, 0.118); head.add(sock);
      const eye = ell(0.012, 0.012, 0.01, mats.eye, 8); eye.position.set(sx * 0.05, 0.118, 0.13); head.add(eye);
      this.eyes.push(eye);
    }
    const mouthIn = ell(0.075, 0.06, 0.06, mats.inner, 10); mouthIn.position.set(0, -0.02, 0.06); head.add(mouthIn);
    for (let k = -4; k <= 4; k++) { // dentes de cima
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.045, 4), mats.teeth);
      const a = (k / 4) * 1.0;
      t.position.set(Math.sin(a) * 0.08, -0.005, 0.07 + Math.cos(a) * 0.045); t.rotation.x = Math.PI;
      head.add(t);
    }
    const jaw = (this.jaw = grp(head, 0, 0.02, -0.03));
    const jm = ell(0.09, 0.04, 0.11, B); jm.position.set(0, -0.05, 0.08); jaw.add(jm);
    for (let k = -4; k <= 4; k++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.04, 4), mats.teeth);
      const a = (k / 4) * 1.0;
      t.position.set(Math.sin(a) * 0.075, -0.015, 0.1 + Math.cos(a) * 0.04);
      jaw.add(t);
    }

    // ---------- braços ----------
    const self = this;
    function arm(sx) {
      const sh = grp(chest, sx * 0.23, 0.41, 0.0);
      sh.add(ell(0.05, 0.05, 0.05, B, 8));
      sh.add(cyl(0.045, 0.034, 0.6, B));
      const el = grp(sh, 0, -0.6, 0);
      el.add(ell(0.042, 0.042, 0.042, B, 8));
      el.add(cyl(0.034, 0.022, 0.74, B));
      const wr = grp(el, 0, -0.74, 0);
      const palm = ell(0.045, 0.075, 0.022, B, 8); palm.position.y = -0.06; wr.add(palm);
      const fingers = [];
      for (let k = 0; k < 4; k++) {
        const f1 = grp(wr, (k - 1.5) * 0.024, -0.12, 0);
        f1.add(cyl(0.011, 0.009, 0.14, B, 5));
        const f2 = grp(f1, 0, -0.14, 0);
        f2.add(cyl(0.009, 0.004, 0.13, B, 5));
        fingers.push([f1, f2]);
      }
      const th = grp(wr, sx * 0.04, -0.06, 0.01); th.rotation.z = sx * 0.6; th.add(cyl(0.01, 0.005, 0.12, B, 5));
      return { sh, el, wr, fingers };
    }
    this.armL = arm(1); this.armR = arm(-1);

    // ---------- pernas ----------
    function leg(sx) {
      const th = grp(hips, sx * 0.11, -0.03, 0);
      th.add(cyl(0.068, 0.045, 0.6, B));
      const kn = grp(th, 0, -0.6, 0);
      kn.add(ell(0.05, 0.05, 0.05, B, 8));
      kn.add(cyl(0.045, 0.03, 0.58, B));
      const an = grp(kn, 0, -0.58, 0);
      const ft = ell(0.04, 0.026, 0.14, B, 8); ft.position.set(0, -0.02, 0.07); an.add(ft);
      return { th, kn, an };
    }
    this.legL = leg(1); this.legR = leg(-1);

    // ---------- estado de animação ----------
    this.phase = 0; this.crawl = 0; this.t = 0;
    this.lookYaw = 0; this.lookPitch = 0; this.roll = 0;
    this.tw = { yaw: 0, roll: 0, pitch: 0, armL: 0, armR: 0 }; this.twTimer = 1;
    this.jerkTimer = 0; this.reach = 0; this.flinch = 0; this.mouth = 0; this.lunge = 0;
    this._v = new THREE.Vector3(); this._q = new THREE.Quaternion();
    this.root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    void self;
  }

  // p: { speed, crawl, look (Vector3|null), listen, mouth, reach, flinch, lunge, agitation, jerky, eyeGlow }
  Entity.prototype.update = function (dt, p) {
    p = p || {};
    this.t += dt;
    const k = (r) => 1 - Math.exp(-r * dt);
    this.crawl += ((p.crawl || 0) - this.crawl) * k(4);
    this.reach += ((p.reach || 0) - this.reach) * k(5);
    this.flinch += ((p.flinch || 0) - this.flinch) * k(10);
    this.mouth += ((p.mouth || 0) - this.mouth) * k(12);
    this.lunge += ((p.lunge || 0) - this.lunge) * k(14);
    const sp = p.speed || 0, cr = this.crawl, up = 1 - cr;
    const stride = U.lerp(1.55, 1.25, cr);
    this.phase += dt * (sp / stride) * Math.PI * 2;

    // espasmos (mais frequentes quando agitado)
    const ag = p.agitation || 0;
    this.twTimer -= dt;
    if (this.twTimer <= 0) {
      this.twTimer = U.rand(0.25, 2.6) * (1.2 - ag);
      const r = Math.random();
      if (r < 0.35) this.tw.yaw += U.rand(-0.9, 0.9);
      else if (r < 0.6) this.tw.roll += U.rand(-0.8, 0.8);
      else if (r < 0.8) this.tw.armL += U.rand(-1, 1);
      else this.tw.armR += U.rand(-1, 1);
      this.tw.pitch += U.rand(-0.3, 0.3);
    }
    for (const key in this.tw) this.tw[key] *= Math.exp(-dt * (6 + ag * 8));

    // modo stop-motion: a pose só é aplicada em "quadros" irregulares
    if (p.jerky > 0) {
      this.jerkTimer -= dt;
      if (this.jerkTimer > 0) return;
      this.jerkTimer = U.rand(0.03, 0.14) / (0.4 + p.jerky);
    }

    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const amp = U.clamp(sp / 1.4, 0, 1.2);
    const s2 = Math.sin(this.phase + Math.PI);

    // ---- quadril / coluna ----
    this.hips.position.y = U.lerp(1.16 + Math.abs(c) * 0.035 * amp, 1.0 + Math.abs(s) * 0.05 * amp, cr) - this.flinch * 0.1;
    this.hips.rotation.z = s * 0.05 * amp * up;
    this.hips.rotation.y = s * 0.08 * amp;
    const breathe = Math.sin(this.t * (1.1 + ag * 2)) * 0.025;
    this.ribcage.scale.set(1 + breathe * 0.5, 1, 0.72 * (1 + breathe));
    this.spine.rotation.x = U.lerp(0.32 + 0.1 * amp, 1.22, cr) - this.flinch * 0.35 + this.lunge * 0.2;
    this.chest.rotation.x = U.lerp(0.26, 0.12, cr) + breathe;
    this.chest.rotation.z = 0.06 * up; // ombro caído de um lado
    this.chest.rotation.y = -s * 0.1 * amp;

    // ---- olhar ----
    let wantYaw = 0, wantPitch = 0;
    if (p.look) {
      this.head.getWorldPosition(this._v);
      const dx = p.look.x - this._v.x, dy = p.look.y - this._v.y, dz = p.look.z - this._v.z;
      const ry = this.root.rotation.y;
      const lx = dx * Math.cos(-ry) + dz * Math.sin(-ry);
      const lz = -dx * Math.sin(-ry) + dz * Math.cos(-ry);
      wantYaw = U.clamp(Math.atan2(lx, lz), -2.0, 2.0);
      wantPitch = U.clamp(Math.atan2(dy, Math.hypot(lx, lz)), -0.9, 0.9);
    }
    this.lookYaw += U.angDiff(this.lookYaw, wantYaw) * k(p.look ? 9 : 3);
    this.lookPitch += (wantPitch - this.lookPitch) * k(8);
    this.roll += ((p.listen ? 0.55 : 0) - this.roll) * k(3);
    const neckComp = U.lerp(-0.5, -1.25, cr);
    this.neck.rotation.set(neckComp - this.lookPitch * 0.4 + this.flinch * 0.5, this.lookYaw * 0.45, 0);
    this.head.rotation.set(-0.15 - this.lookPitch * 0.5 + this.tw.pitch - this.lunge * 0.3, this.lookYaw * 0.55 + this.tw.yaw, this.roll + this.tw.roll + 0.1 + Math.sin(this.t * 0.7) * 0.04);
    this.jaw.rotation.x = 0.04 + this.mouth * 0.95 + Math.max(0, Math.sin(this.t * 1.3)) * 0.03;

    // ---- braços ----
    // (rotação x negativa leva o braço para a frente; o tronco já está inclinado)
    const armUpX = U.lerp(s * 0.32 * amp - 0.7, -1.5 + s2 * 0.75 * amp, cr);
    const armUpX2 = U.lerp(-s * 0.32 * amp - 0.62, -1.5 - s2 * 0.75 * amp, cr);
    const elb = U.lerp(-0.42 - 0.18 * amp, -0.5 - Math.max(0, -s2) * 0.4, cr);
    const elb2 = U.lerp(-0.36 - 0.18 * amp, -0.5 - Math.max(0, s2) * 0.4, cr);
    const setArm = (A, sx, ax, el, tw, reach) => {
      let rx = ax + tw, rz = sx * U.lerp(0.14, 0.32, cr), e = el;
      if (reach) { rx = U.lerp(rx, -2.95, reach); rz = U.lerp(rz, sx * 0.1, reach); e = U.lerp(e, -0.25, reach); }
      rx = U.lerp(rx, -2.3, this.flinch); e = U.lerp(e, -2.0, this.flinch); rz = U.lerp(rz, -sx * 0.35, this.flinch);
      rx = U.lerp(rx, -2.1, this.lunge); e = U.lerp(e, -0.2, this.lunge); rz = U.lerp(rz, sx * 0.25, this.lunge);
      A.sh.rotation.set(rx, 0, rz);
      A.el.rotation.set(e, 0, 0);
      A.wr.rotation.set(U.lerp(-0.2, 0.6, cr) + tw * 0.3, 0, 0);
      const curl = 0.25 + Math.sin(this.t * 2 + sx) * 0.15 * (1 + ag) - this.lunge * 0.25 + this.reach * 0.2;
      for (const [f1, f2] of A.fingers) { f1.rotation.x = -curl * 0.6; f2.rotation.x = -curl; f1.rotation.z = sx * this.lunge * 0.15; }
    };
    setArm(this.armL, 1, armUpX, elb, this.tw.armL, 0);
    setArm(this.armR, -1, armUpX2, elb2, this.tw.armR, this.reach);

    // ---- pernas ----
    const thU = 0.55 * amp, thighL = U.lerp(-s * thU - 0.12, -0.5 - s * 0.45 * amp, cr), thighR = U.lerp(s * thU - 0.12, -0.5 + s * 0.45 * amp, cr);
    const kneeL = U.lerp(Math.max(0, c) * 0.95 * amp + 0.22, 1.05 + Math.max(0, c) * 0.5 * amp, cr);
    const kneeR = U.lerp(Math.max(0, -c) * 0.95 * amp + 0.22, 1.05 + Math.max(0, -c) * 0.5 * amp, cr);
    this.legL.th.rotation.set(thighL - this.flinch * 0.2, 0, 0.04);
    this.legR.th.rotation.set(thighR - this.flinch * 0.2, 0, -0.04);
    this.legL.kn.rotation.x = kneeL + this.flinch * 0.3;
    this.legR.kn.rotation.x = kneeR + this.flinch * 0.3;
    this.legL.an.rotation.x = -(thighL + kneeL) * 0.9;
    this.legR.an.rotation.x = -(thighR + kneeR) * 0.9;

    if (this.mats.eye.uniforms) this.mats.eye.uniforms.uEmissive.value = p.eyeGlow != null ? p.eyeGlow : 0.4;
  };

  Entity.prototype.dispose = function () {
    const geos = new Set();
    this.root.traverse((o) => { if (o.geometry) geos.add(o.geometry); });
    geos.forEach((g) => g.dispose());
  };

  // materiais padrão do jogo (shader de mundo)
  Entity.gameMaterials = function (skinTex) {
    const S = BR.Shading;
    return {
      body: S.material({ map: skinTex, monster: true, spec: 0.32, shine: 22, dirt: 0.2, tint: 0x8a8080 }),
      eye: S.material({ eye: true, tint: 0xfff0b8, emissive: 0.4, dirt: 0 }),
      teeth: S.material({ tint: 0xb8ad8c, spec: 0.6, shine: 40, dirt: 0.3 }),
      inner: S.material({ tint: 0x050202, dirt: 0 }),
    };
  };

  BR.Entity = Entity;
})(window.BR);
