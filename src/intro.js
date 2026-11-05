/* ============================================================
   THE BACKROOMS — INTRO CINEMATOGRÁFICA (3D, Three.js)
   ------------------------------------------------------------
   Uma TORRE de 8 andares empilhados. A câmera desce RETA, como
   um elevador, passando pela laje de concreto entre os andares
   e mostrando cada sala — cada uma mais distorcida, mais
   amarela e mais "esquecida" — até atravessar o último piso e
   chegar ao Nível 0 de verdade (o mesmo gerador e a mesma
   iluminação do jogo). Lá, as luzes se apagam fileira por
   fileira, vindo na sua direção.

   Sem legendas e sem mostrar a entidade: a curiosidade fica.
   Transições sincronizadas ao áudio (mesmos tempos de sempre):
       T1  6 -> 9     T5  28 -> 30
       T2 15 -> 17    T6  31 -> 32
       T3 21 -> 22    T7  34 -> 35
       T4 25 -> 26    T8  37 -> 38  (chega nos Fundos)
   ============================================================ */
window.Intro = (function () {
  'use strict';
  const BR = window.BR;

  const MEM = 8, MAXLEVEL = 8;
  const RH = 5, RIN = 4.2, HW = 5, DEPTH = 7, ZBACK = 4, CAMZ = 3.4;
  const BACK_CEIL = 2.8;                       // forro do Nível 0
  const Y7 = BACK_CEIL + 0.8 + RIN / 2;        // centro do último andar da torre
  const TOP = Y7 + 7 * RH;                     // centro do primeiro andar
  const EYE = 1.62;
  const DRIFT = 26;
  const END_T = 57.0, FADEIN = 5.0;

  const SCHEDULE = [
    [0, 0], [6, 0], [9, 1],
    [15, 1], [17, 2],
    [21, 2], [22, 3],
    [25, 3], [26, 4],
    [28, 4], [30, 5],
    [31, 5], [32, 6],
    [34, 6], [35, 7],
    [37, 7], [38, 8],
    [60, 8],
  ];
  const FALL_STARTS = [6, 15, 21, 25, 28, 31, 34, 37];

  // ---------------------- estado ----------------------
  let renderer, scene, camera, camLight, lampLight, ambient, post, tower, hall = null, hallLamps = [], killIdx = 0, hallFlick = { a: 1, b: 1, ta: 0, tb: 0 };
  let texWall, texFloor, texCeil, trimMat, tvTex, tvCanvas, tvCtx;
  let audio = null, audioOk = false;
  let running = false, finished = false, built = false;
  let startPerf = 0, onComplete = null;
  let lampMats = [], floorOffX = [];
  let clocks = [], tvScreens = [], dust, osdTc, osd;
  let lastFall = -1;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function hash(n) { const s = Math.sin(n * 91.137 + 12.93) * 43758.5453; return s - Math.floor(s); }
  function lerpArr(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function shade(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
  function col(a) { return new THREE.Color(a[0] / 255, a[1] / 255, a[2] / 255); }
  function smoother(p) { return p * p * p * (p * (p * 6 - 15) + 10); }
  function depthAt(t) {
    if (t <= SCHEDULE[0][0]) return SCHEDULE[0][1];
    for (let i = 1; i < SCHEDULE.length; i++) {
      if (t <= SCHEDULE[i][0]) {
        const [t0, d0] = SCHEDULE[i - 1], [t1, d1] = SCHEDULE[i];
        const p = clamp((t - t0) / (t1 - t0 || 1), 0, 1);
        return lerp(d0, d1, smoother(p));
      }
    }
    return SCHEDULE[SCHEDULE.length - 1][1];
  }

  const ANCHORS = [
    { at: 0, wall: [152, 148, 134], floor: [132, 124, 106], ceil: [158, 154, 140], lamp: [255, 246, 220], sky: [150, 200, 238] },
    { at: 3, wall: [172, 158, 110], floor: [140, 126, 84], ceil: [166, 158, 122], lamp: [255, 238, 182], sky: [122, 150, 152] },
    { at: 6, wall: [196, 176, 108], floor: [146, 126, 74], ceil: [178, 168, 128], lamp: [255, 236, 160], sky: [98, 102, 84] },
    { at: 8, wall: [202, 176, 96], floor: [156, 136, 72], ceil: [190, 178, 138], lamp: [255, 242, 180], sky: [72, 72, 54] },
  ];
  function palAt(level) {
    let a = ANCHORS[0], b = ANCHORS[ANCHORS.length - 1];
    for (let i = 1; i < ANCHORS.length; i++) if (level <= ANCHORS[i].at) { a = ANCHORS[i - 1]; b = ANCHORS[i]; break; }
    const t = clamp((level - a.at) / (b.at - a.at || 1), 0, 1);
    return { wall: lerpArr(a.wall, b.wall, t), floor: lerpArr(a.floor, b.floor, t), ceil: lerpArr(a.ceil, b.ceil, t), lamp: lerpArr(a.lamp, b.lamp, t), sky: lerpArr(a.sky, b.sky, t) };
  }

  // ============================================================
  //  TEXTURAS (claras, tingidas pela cor do material)
  // ============================================================
  function texWallpaper() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#e8e3d6'; x.fillRect(0, 0, 512, 512);
    const f = BR.Tex.fbmField(512, 4, 4, 7);
    const img = x.getImageData(0, 0, 512, 512), d = img.data;
    for (let i = 0; i < 512 * 512; i++) { const k = 0.9 + f[i] * 0.2; d[i * 4] *= k; d[i * 4 + 1] *= k; d[i * 4 + 2] *= k; }
    x.putImageData(img, 0, 0);
    for (let i = 0; i < 512; i += 32) { x.fillStyle = 'rgba(150,135,90,0.10)'; x.fillRect(i + 14, 0, 2, 512); x.fillStyle = 'rgba(255,255,240,0.06)'; x.fillRect(i + 2, 0, 10, 512); }
    for (let i = 0; i < 16; i++) {
      const gx = Math.random() * 512, gy = Math.random() * 512, r = 20 + Math.random() * 80;
      const grd = x.createRadialGradient(gx, gy, 0, gx, gy, r);
      grd.addColorStop(0, 'rgba(90,70,30,0.12)'); grd.addColorStop(1, 'rgba(90,70,30,0)');
      x.fillStyle = grd; x.beginPath(); x.arc(gx, gy, r, 0, 7); x.fill();
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.5, 1);
    return t;
  }
  function texCarpet() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#b8af9a'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 26000; i++) { x.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,250,225,0.05)'; x.fillRect(Math.random() * 256, Math.random() * 256, 1, 1); }
    for (let i = 0; i < 14; i++) {
      const gx = Math.random() * 256, gy = Math.random() * 256, r = 10 + Math.random() * 40;
      const grd = x.createRadialGradient(gx, gy, 0, gx, gy, r);
      grd.addColorStop(0, 'rgba(0,0,0,0.18)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = grd; x.beginPath(); x.arc(gx, gy, r, 0, 7); x.fill();
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 5);
    return t;
  }
  function texCeiling() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#e4dfd1'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(120,112,88,0.4)'; x.lineWidth = 4; x.strokeRect(0, 0, 128, 128);
    for (let i = 0; i < 1400; i++) { x.fillStyle = 'rgba(0,0,0,0.05)'; x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.5, 2);
    return t;
  }

  // ============================================================
  //  HELPERS
  // ============================================================
  function box(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
  function lam(colorArr, map) { return new THREE.MeshStandardMaterial({ color: col(colorArr), map: map || null, side: THREE.DoubleSide, roughness: 0.92, metalness: 0 }); }
  function emis(colorArr) { return new THREE.MeshBasicMaterial({ color: col(colorArr), side: THREE.DoubleSide }); }
  function lampMat(colorArr) { const m = emis(colorArr); m.userData.base = m.color.clone(); lampMats.push(m); return m; }

  function makeChair(fabricArr) {
    const g = new THREE.Group();
    const fab = lam(fabricArr), fab2 = lam(shade(fabricArr, 1.12));
    const seat = box(1.5, 0.4, 1.4, fab); seat.position.y = 0.52; g.add(seat);
    const cush = box(1.42, 0.24, 1.3, fab2); cush.position.y = 0.82; g.add(cush);
    const back = box(1.5, 1.25, 0.26, fab); back.position.set(0, 1.15, -0.56); g.add(back);
    const backC = box(1.34, 1.02, 0.16, fab2); backC.position.set(0, 1.12, -0.42); g.add(backC);
    for (const sx of [-1, 1]) {
      const arm = box(0.26, 0.6, 1.42, fab); arm.position.set(sx * 0.86, 0.8, 0); g.add(arm);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.42, 10), fab2);
      top.rotation.x = Math.PI / 2; top.position.set(sx * 0.86, 1.1, 0); g.add(top);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.5, 8), trimMat);
      leg.position.set(sx * 0.6, 0.22, sz * 0.55); g.add(leg);
    }
    return g;
  }

  // TV de tubo com estática (tela compartilhada, atualizada por quadro)
  function makeTV(level) {
    const g = new THREE.Group();
    const body = box(1.0, 0.78, 0.8, lam([40, 38, 34])); body.position.y = 0.39; g.add(body);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.58), new THREE.MeshBasicMaterial({ map: tvTex, color: 0xffffff }));
    scr.position.set(0, 0.42, 0.405); g.add(scr);
    tvScreens.push({ mat: scr.material, level });
    const stand = box(1.2, 0.6, 0.7, lam([70, 52, 34])); stand.position.y = -0.3; g.add(stand);
    const ant1 = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.7, 4), trimMat); ant1.position.set(-0.15, 1.05, 0); ant1.rotation.z = 0.5; g.add(ant1);
    const ant2 = ant1.clone(); ant2.position.x = 0.15; ant2.rotation.z = -0.5; g.add(ant2);
    return g;
  }
  function makeClock(level) {
    const g = new THREE.Group();
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.34, 24), lam([235, 228, 210]));
    g.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 6, 24), trimMat); g.add(rim);
    const handMat = lam([20, 18, 14]);
    const h = new THREE.Group(), hm = box(0.03, 0.18, 0.01, handMat); hm.position.y = 0.09; h.add(hm); h.position.z = 0.01; g.add(h);
    const m = new THREE.Group(), mm = box(0.02, 0.27, 0.01, handMat); mm.position.y = 0.135; m.add(mm); m.position.z = 0.015; g.add(m);
    for (let k = 0; k < 12; k++) { const tk = box(0.02, 0.05, 0.01, handMat); const a = (k / 12) * Math.PI * 2; tk.position.set(Math.sin(a) * 0.29, Math.cos(a) * 0.29, 0.005); tk.rotation.z = -a; g.add(tk); }
    clocks.push({ h, m, level });
    return g;
  }

  // ============================================================
  //  SALAS "MEMÓRIA" (níveis 0..7)
  // ============================================================
  function buildMemoryFloor(i) {
    const level = i, f = level / MAXLEVEL, P = palAt(level);
    const g = new THREE.Group(); g.position.y = TOP - i * RH;
    const ZLEN = DEPTH + ZBACK, ZC = (ZBACK - DEPTH) / 2;

    const wallMat = lam(P.wall, texWall), wallMatL = lam(shade(P.wall, 0.86), texWall), wallMatR = lam(shade(P.wall, 0.76), texWall);
    const floorMat = lam(shade(P.floor, 0.95), texFloor), ceilMat = lam(P.ceil, texCeil);

    const back = box(HW * 2, RIN, 0.1, wallMat); back.position.set(0, 0, -DEPTH); g.add(back);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(ZLEN, RIN), wallMatL); left.rotation.y = Math.PI / 2; left.position.set(-HW, 0, ZC); g.add(left);
    const right = new THREE.Mesh(new THREE.PlaneGeometry(ZLEN, RIN), wallMatR); right.rotation.y = -Math.PI / 2; right.position.set(HW, 0, ZC); g.add(right);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, ZLEN), ceilMat); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, RIN / 2, ZC); g.add(ceil);
    const flo = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, ZLEN), floorMat); flo.rotation.x = -Math.PI / 2; flo.position.set(0, -RIN / 2, ZC); g.add(flo);

    function trimRun(y) {
      const b = box(HW * 2, 0.26, 0.07, trimMat); b.position.set(0, y, -DEPTH + 0.06); g.add(b);
      for (const sx of [-1, 1]) { const s = box(0.07, 0.26, ZLEN, trimMat); s.position.set(sx * (HW - 0.04), y, ZC); g.add(s); }
    }
    trimRun(-RIN / 2 + 0.14); trimRun(RIN / 2 - 0.14);

    // janela
    const winLight = clamp(1 - level / 4.5, 0, 1);
    const wz = -2.0, wy = 0.55;
    if (winLight > 0.04) {
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.35), emis(lerpArr([30, 28, 20], P.sky, winLight)));
      glass.rotation.y = Math.PI / 2; glass.position.set(-HW + 0.04, wy, wz); g.add(glass);
      if (level < 2) { const wl = new THREE.PointLight(col(P.sky), winLight * 0.8, 9); wl.position.set(-HW + 1.4, wy, wz); g.add(wl); }
    } else {
      const vent = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.35), emis([16, 15, 11])); vent.rotation.y = Math.PI / 2; vent.position.set(-HW + 0.04, wy, wz); g.add(vent);
    }
    for (const [oy, ow, oh] of [[wy + 0.8, 3.2, 0.12], [wy - 0.8, 3.2, 0.12]]) { const b = box(0.12, oh, ow, trimMat); b.position.set(-HW + 0.08, oy, wz); g.add(b); }
    for (const oz of [wz - 1.55, wz + 1.55]) { const b = box(0.12, 1.7, 0.12, trimMat); b.position.set(-HW + 0.08, wy, oz); g.add(b); }
    for (let k = -1; k <= 1; k++) { const bar = box(0.06, 1.3, 0.05, trimMat); bar.position.set(-HW + 0.1, wy, wz + k * 0.72); g.add(bar); }
    const sill = box(0.34, 0.1, 3.4, trimMat); sill.position.set(-HW + 0.18, wy - 0.78, wz); g.add(sill);

    // porta entreaberta
    const dz = -3.4;
    const doorHole = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.7), emis([6, 6, 5])); doorHole.rotation.y = -Math.PI / 2; doorHole.position.set(HW - 0.04, -0.15, dz); g.add(doorHole);
    const leaf = box(0.08, 2.6, 1.5, lam(shade(P.wall, 0.5))); leaf.position.set(HW - 0.2, -0.2, dz - 0.7); leaf.rotation.y = 0.5; g.add(leaf);
    for (const [oy, ow, oh] of [[1.25, 2.0, 0.14], [-1.45, 2.0, 0.14]]) { const b = box(0.14, oh, ow, trimMat); b.position.set(HW - 0.08, oy, dz); g.add(b); }
    for (const oz of [dz - 0.95, dz + 0.95]) { const b = box(0.14, 2.85, 0.14, trimMat); b.position.set(HW - 0.08, -0.1, oz); g.add(b); }

    // iluminação do teto
    if (level < 6.5) {
      const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 14), lam([60, 56, 44])); canopy.position.set(0, RIN / 2 - 0.06, -1.2); g.add(canopy);
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), lampMat(P.lamp)); globe.position.set(0, RIN / 2 - 0.36, -1.2); g.add(globe);
    } else {
      for (let k = -1; k <= 1; k++) {
        const dead = hash(level * 7 + k * 3) < 0.18;
        const pm = dead ? emis([42, 40, 26]) : lampMat([255, 248, 210]);
        const pan = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.2), pm); pan.rotation.x = Math.PI / 2; pan.position.set(k * 2.2, RIN / 2 - 0.04, -1.5); g.add(pan);
      }
    }

    // poltrona
    const chairA = clamp(1 - level / 8, 0, 1);
    if (chairA > 0.05) {
      const chair = makeChair(shade([122, 98, 88], 1 - f * 0.45));
      chair.position.set((hash(level * 2.1) - 0.5) * 1.6, -RIN / 2, -DEPTH + 1.4);
      chair.rotation.y = (hash(level * 3.3) - 0.5) * f * 0.7;
      chair.rotation.x = f * 0.22; chair.scale.y = 1 - f * 0.28; g.add(chair);
    }
    // estante
    if (level < 6) {
      const sh = new THREE.Group(); sh.position.set(-HW + 0.28, -RIN / 2, -4.7);
      const body = box(0.42, 2.3, 1.5, lam([78, 56, 36])); body.position.y = 1.15; sh.add(body);
      const bookCols = [[120, 40, 30], [50, 70, 100], [90, 80, 40], [60, 90, 60]];
      for (let r = 0; r < 3; r++) {
        const shelf = box(0.4, 0.05, 1.4, trimMat); shelf.position.set(0, 0.55 + r * 0.62, 0); sh.add(shelf);
        for (let b2 = 0; b2 < 4; b2++) { if (hash(level * 13 + r * 4 + b2) < f * 0.9) continue; const bk = box(0.26, 0.42, 0.12, lam(bookCols[(r + b2) % 4])); bk.position.set(0, 0.8 + r * 0.62, -0.5 + b2 * 0.28); sh.add(bk); }
      }
      sh.rotation.y = Math.PI / 2; g.add(sh);
    }
    // TV com estática (some nos andares mais fundos)
    if (level < 6) {
      const tv = makeTV(level);
      tv.position.set(HW - 1.3, -RIN / 2 + 0.6, -DEPTH + 1.1);
      tv.rotation.y = -0.6 + f * 0.4; tv.rotation.z = f * 0.12;
      g.add(tv);
    }
    // relógio de parede
    if (level < 7) { const ck = makeClock(level); ck.position.set(-2.6, 1.25, -DEPTH + 0.08); ck.rotation.z = f * 0.3; g.add(ck); }

    // quadro + tomada
    const frameM = box(1.2, 0.9, 0.06, trimMat); frameM.position.set(2.2, 0.6, -DEPTH + 0.07); g.add(frameM);
    const canvasM = box(1.0, 0.7, 0.02, lam(shade([90, 80, 60], 1 - f * 0.4))); canvasM.position.set(2.2, 0.6, -DEPTH + 0.11); g.add(canvasM);
    const outlet = box(0.18, 0.28, 0.04, lam([220, 214, 198])); outlet.position.set(-1.8, -RIN / 2 + 0.5, -DEPTH + 0.07); g.add(outlet);

    const offX = (hash(level * 1.7) * 2 - 1) * f * 0.6;
    g.rotation.z = (hash(level * 5.3) * 2 - 1) * f * 0.10;
    g.rotation.x += (hash(level * 3.1) * 2 - 1) * f * 0.05;
    g.position.x = offX; floorOffX[i] = offX;
    tower.add(g);
    // laje de concreto entre este andar e o de baixo (o "elevador" passa por ela)
    const slab = box(HW * 2 + 0.8, 0.74, ZLEN + 0.8, slabMat);
    slab.position.set(offX, TOP - i * RH - RIN / 2 - 0.4, ZC);
    tower.add(slab);
    return g;
  }

  // ============================================================
  //  NÍVEL 0 — gerado pelo mesmo mundo do jogo (lightmap, rodapé,
  //  forro, luminárias), num salão desenhado para a câmera
  // ============================================================
  function buildHall() {
    const T = BR.Tex, TT = (c, o) => T.toTexture(c, o);
    BR.Shading.init();
    hall = new BR.World({
      size: 40, ceil: BACK_CEIL, layout: (N) => BR.Layouts.introHall(N),
      lamps: { sx: 3, ox: 1, sz: 4, oz: 2, dead: 0.05, flick: 0.06, darkZones: 0, darkR: 0, radius: 7.5, height: 2.78, intensity: 7.2, gi: 0.45, hang: false },
      textures: () => ({ wall: TT(T.wallpaper()), floor: TT(T.carpet()), ceil: TT(T.ceiling()), lamp: TT(T.lampDiffuser(), { clamp: true }) }),
      trim: true, trimColor: 0x86704a, ceilingHoles: 0.003, floorSpec: 0.06, floorShine: 10,
    }, renderer.capabilities.getMaxAnisotropy());
    scene.add(hall.group);
    const u = BR.Shading.uniforms;
    u.uLampColor.value.setRGB(1.0, 0.9, 0.66); u.uAmbient.value.setRGB(0.01, 0.0085, 0.005);
    u.uFogColor.value.setRGB(0.03, 0.025, 0.012); u.uFogDensity.value = 0.045;
    u.uFlashI.value = 0; u.uMonster.value.set(9999, 0, 9999, 0); u.uBreath.value = 0; u.uGlitch.value = 0; u.uExposure.value = 1;
    const sc = hall.center(hall.start);
    // ordem do apagão: do fundo do salão para perto da câmera
    hallLamps = hall.lamps.filter((l) => l.group < 3).sort((a, b) => a.z - b.z);
    return sc;
  }

  let slabMat, startPt = { x: 0, z: 0 };
  function buildTower() {
    if (built) return; built = true;
    texWall = texWallpaper(); texFloor = texCarpet(); texCeil = texCeiling();
    tvCanvas = document.createElement('canvas'); tvCanvas.width = 96; tvCanvas.height = 72;
    tvCtx = tvCanvas.getContext('2d');
    tvTex = new THREE.CanvasTexture(tvCanvas); tvTex.minFilter = THREE.LinearFilter;
    trimMat = lam([74, 56, 36]);
    slabMat = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 1, side: THREE.DoubleSide });
    startPt = buildHall();
    // a torre fica exatamente em cima do ponto onde a câmera chega no Nível 0
    tower = new THREE.Group(); tower.position.set(startPt.x, 0, startPt.z - CAMZ); scene.add(tower);
    for (let i = 0; i < MEM; i++) buildMemoryFloor(i);

    // poeira no ar
    const N = 1000, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 10; pos[i * 3 + 1] = Y7 - RIN / 2 + Math.random() * (RH * 8); pos[i * 3 + 2] = (Math.random() - 0.5) * 11 - 1.5; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xfff2c8, size: 0.018, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
    tower.add(dust);
  }

  // ============================================================
  //  POR QUADRO
  // ============================================================
  function updateTV(t, depth) {
    const W = 96, H = 72, img = tvCtx.createImageData(W, H), d = img.data;
    const roll = (t * 40) % H;
    for (let y = 0; y < H; y++) {
      const band = Math.abs(y - roll) < 6 ? 60 : 0;
      for (let x = 0; x < W; x++) {
        const v = (Math.random() * 200 + band) | 0, p = (y * W + x) * 4;
        d[p] = v; d[p + 1] = v; d[p + 2] = v * 1.05; d[p + 3] = 255;
      }
    }
    tvCtx.putImageData(img, 0, 0);
    // de vez em quando, um rosto borrado aparece na estática
    if ((Math.floor(t * 3) % 17) === 0 && depth > 2) {
      tvCtx.fillStyle = 'rgba(0,0,0,0.55)';
      tvCtx.beginPath(); tvCtx.ellipse(48, 36, 13, 18, 0, 0, 7); tvCtx.fill();
      tvCtx.fillStyle = 'rgba(255,255,230,0.8)';
      tvCtx.fillRect(43, 32, 2, 2); tvCtx.fillRect(52, 32, 2, 2);
    }
    tvTex.needsUpdate = true;
  }

  function render(t, dt) {
    const depth = depthAt(t);
    const f = clamp(depth / MAXLEVEL, 0, 1);
    const bk = smooth(7.3, 8, depth);
    const eps = 0.05;
    const speed = Math.abs(depthAt(t + eps) - depthAt(t - eps)) / (2 * eps);
    const boost = clamp(speed * 0.9, 0, 1.3);

    for (let k = 0; k < FALL_STARTS.length; k++) if (t >= FALL_STARTS[k] && lastFall < k) { lastFall = k; if (BR.Audio.ctx) BR.Audio.glitch(0.25); }

    // câmera: elevador — reta, sem inclinar, só desce
    const camY = depth <= 7 ? TOP - depth * RH : lerp(Y7, EYE, depth - 7);
    const forward = smooth(39, 56.5, t) * DRIFT;
    const camX = startPt.x, camZ = startPt.z - forward;
    camera.position.set(camX, camY, camZ);
    camera.rotation.set(0, 0, 0, 'YXZ');

    // luzes da torre (não afetam o Nível 0, que tem iluminação própria)
    camLight.position.set(camX, camY + 0.5, camZ);
    camLight.intensity = 1.05;
    const fl = Math.round(clamp(depth, 0, 7));
    lampLight.visible = bk < 0.9;
    lampLight.color = col(palAt(fl).lamp);
    lampLight.position.set(startPt.x + (floorOffX[fl] || 0), TOP - fl * RH + RIN / 2 - 0.4, startPt.z - CAMZ - 1.2);
    ambient.intensity = 0.5;
    const fogCol = col([11, 10, 7]);
    scene.fog.color = fogCol; scene.fog.far = 24;
    renderer.setClearColor(col(lerpArr([11, 10, 7], [8, 7, 3], bk)), 1);

    const flickChance = 0.05 + f * 0.05;
    for (const m of lampMats) {
      let k = 1;
      if (Math.random() < flickChance * 0.15) m.userData.off = Math.random() * 0.12;
      if (m.userData.off > 0) { m.userData.off -= dt; k *= 0.35; }
      m.color.copy(m.userData.base).multiplyScalar(k);
    }
    for (const c of clocks) {
      const sp = c.level < 2 ? 1 : c.level < 4 ? 6 : -40 * (c.level - 3);
      c.m.rotation.z = -t * 0.1 * sp; c.h.rotation.z = -t * 0.008 * sp - 1.2;
    }
    if (depth < 6.5) updateTV(t, depth);
    if (dust) { dust.rotation.y = Math.sin(t * 0.05) * 0.05; dust.position.y = Math.sin(t * 0.2) * 0.2; }

    // Nível 0: lâmpadas piscando + o apagão final vindo na sua direção
    const u = BR.Shading.uniforms, H = hallFlick;
    H.ta -= dt; H.tb -= dt;
    if (H.ta <= 0) { H.a = Math.random() < 0.82 ? 1 : 0.1; H.ta = H.a === 1 ? 0.2 + Math.random() * 1.4 : 0.04 + Math.random() * 0.1; }
    if (H.tb <= 0) { H.b = Math.random() < 0.75 ? 1 : 0.08; H.tb = H.b === 1 ? 0.2 + Math.random() * 1.8 : 0.04 + Math.random() * 0.12; }
    u.uFlick.value.set(1, H.a, H.b, 1);
    u.uTime.value = t;
    const OFF0 = 50.8, OFF1 = 55.6;
    if (t > OFF0 && killIdx < hallLamps.length) {
      const want = Math.floor(Math.pow(clamp((t - OFF0) / (OFF1 - OFF0), 0, 1), 0.75) * hallLamps.length);
      while (killIdx < want) {
        const lp = hallLamps[killIdx++];
        hall.killLamp(lp);
        if (BR.Audio.ctx && killIdx % 4 === 0) BR.Audio.lightPop(lp.x, BACK_CEIL, lp.z);
      }
      if (killIdx >= hallLamps.length && BR.Audio.ctx) BR.Audio.boom();
    }

    // pós-processamento
    const fx = BR.Settings.fx;
    const fadein = 1 - smooth(0, FADEIN, t);
    const pu = post.u;
    pu.uTime.value = t;
    pu.uFade.value = Math.max(fadein, t > END_T - 1.0 ? smooth(END_T - 1.0, END_T, t) : 0);
    pu.uGrain.value = (0.05 + f * 0.04 + boost * 0.03) * (0.3 + 0.7 * fx);
    pu.uVignette.value = 0.85 - bk * 0.3;
    pu.uAberr.value = (0.5 + boost * 0.8) * fx;
    pu.uGlitch.value = clamp(boost * 0.12 + (Math.random() < 0.008 ? 0.4 : 0), 0, 1) * fx;
    pu.uStatic.value = boost * 0.04 * fx;
    pu.uScan.value = 0.5 * fx;
    pu.uBloom.value = 0.65;
    pu.uBright.value = BR.Settings.brightness;
    pu.uDesat.value = f * 0.12 * (1 - bk);
    pu.uWave.value = 0;
    post.render(scene, camera);

    if (osdTc) {
      const s = Math.floor(t), mm = String(Math.floor(s / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
      osdTc.textContent = 'SP 00:' + mm + ':' + ss;
      osd.style.opacity = t > END_T - 2 ? 0 : (0.8 * (1 - fadein * 0.7)).toFixed(2);
    }
  }

  // ============================================================
  //  CICLO DE VIDA
  // ============================================================
  let lastT = 0;
  function now() {
    if (audioOk && audio && !audio.paused && audio.currentTime > 0) return audio.currentTime;
    return (performance.now() - startPerf) / 1000;
  }
  function tick() {
    if (!running) return;
    const t = now(); const dt = clamp(t - lastT, 0, 0.1); lastT = t;
    render(t, dt);
    if (t >= END_T || (audioOk && audio && audio.ended)) { finish(); return; }
    requestAnimationFrame(tick);
  }
  function finish() {
    if (finished) return; finished = true; running = false;
    if (typeof onComplete === 'function') onComplete();
    setTimeout(() => { try { if (hall) hall.dispose(); post.dispose(); renderer.forceContextLoss(); renderer.dispose(); } catch (e) { /* ok */ } }, 1400);
  }
  function resize() {
    if (!renderer || finished) return;
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    post.setSize(window.innerWidth, window.innerHeight, Math.min(devicePixelRatio, 1.5) * BR.Settings.quality);
  }

  function start(audioEl, doneCb) {
    onComplete = doneCb; audio = audioEl;
    finished = false; running = true;

    const canvas = document.getElementById('intro-canvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
    renderer.setPixelRatio(1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x0b0a07, 1);
    post = new BR.PostFX(renderer);
    post.setSize(window.innerWidth, window.innerHeight, Math.min(devicePixelRatio, 1.5) * BR.Settings.quality);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b0a07, 4, 24);
    ambient = new THREE.AmbientLight(0xfff4d6, 0.5); scene.add(ambient);
    camLight = new THREE.PointLight(0xffe9c2, 1.05, 20, 1.4); scene.add(camLight);
    lampLight = new THREE.PointLight(0xffe2b0, 0.85, 13, 1.6); scene.add(lampLight);
    camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 220);

    osd = document.getElementById('vhs-osd'); osdTc = document.getElementById('vhs-tc');
    buildTower();
    window.addEventListener('resize', resize);

    const skip = document.getElementById('skip-intro');
    if (skip) skip.addEventListener('click', finish);
    window.addEventListener('keydown', (e) => { if (running && (e.code === 'Escape' || e.code === 'Space') && !(e.target && e.target.matches && e.target.matches('input'))) finish(); });

    startPerf = performance.now(); lastT = 0;
    if (audio) {
      audio.volume = BR.introVolume();
      audio.currentTime = 0;
      const pr = audio.play();
      if (pr && pr.then) pr.then(() => { audioOk = true; }).catch(() => { audioOk = false; });
      audio.addEventListener('error', () => { audioOk = false; }, { once: true });
    }
    requestAnimationFrame(tick);
  }

  return { start };
})();
