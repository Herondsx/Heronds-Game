/* ============================================================
   THE BACKROOMS — INTRO CINEMATOGRÁFICA (3D real, Three.js)
   ------------------------------------------------------------
   Uma TORRE de 9 salas 3D empilhadas e detalhadas. A câmera
   DESCE de verdade, atravessando cada andar — cada um mais
   distorcido, mais amarelo e mais "esquecido" — até cair nos
   Fundos (nível 8), por onde ela então AVANÇA.

   Transições (sincronizadas ao áudio), conforme pedido:
       T1  6 -> 9     T5  28 -> 30
       T2 15 -> 17    T6  31 -> 32
       T3 21 -> 22    T7  34 -> 35
       T4 25 -> 26    T8  37 -> 38  (chega nos Fundos)
   ============================================================ */
window.Intro = (function () {
  'use strict';

  const MEM = 8;             // salas "memória" (níveis 0..7)
  const BACK = 8;            // nível 8 = Backrooms
  const MAXLEVEL = 8;
  const RH = 5;              // altura de cada andar
  const HW = 5;              // meia-largura das salas memória
  const DEPTH = 7;           // parede do fundo das salas memória (-Z)
  const ZBACK = 4;           // paredes se estendem até z=+4
  const CAMZ = 3.4;          // Z inicial da câmera
  // Backrooms (nível 8) — salão amplo
  const HW8 = 13, ZFRONT8 = 6, ZFAR8 = 46;
  const DRIFT = 34;          // quanto a câmera avança nos Fundos
  const END_T = 57.0, FADEIN = 5.0;

  // ----- Cronograma profundidade x tempo -----
  const SCHEDULE = [
    [0, 0], [6, 0], [9, 1],     // T1
    [15, 1], [17, 2],           // T2
    [21, 2], [22, 3],           // T3
    [25, 3], [26, 4],           // T4
    [28, 4], [30, 5],           // T5
    [31, 5], [32, 6],           // T6
    [34, 6], [35, 7],           // T7
    [37, 7], [38, 8],           // T8 -> Fundos
    [60, 8],
  ];

  // ----- Linhas de lore -----
  const LORE = [
    [1.6, 5.8, 'Há lugares que a realidade deixou para trás.'],
    [6.6, 8.8, 'Paredes que ninguém mais lembra de ter erguido.'],
    [9.6, 14.4, 'Tudo o que é esquecido... não desaparece.'],
    [15.3, 16.8, 'Apenas afunda.'],
    [17.4, 20.6, 'Para um lugar mais fundo. Mais antigo. Mais vazio.'],
    [21.2, 24.6, 'O cheiro de carpete úmido.'],
    [25.0, 27.6, 'O zumbido que nunca cessa.'],
    [28.2, 30.6, 'Cada andar lembra um pouco menos de ser real.'],
    [31.2, 33.6, 'As formas erram. A luz esquece a cor.'],
    [34.2, 36.6, 'Você não cai mais pelo prédio...'],
    [37.0, 38.6, '...mas pela memória dele.'],
    [39.5, 43.5, 'E então não há mais andares. Só o amarelo.'],
    [44.5, 48.5, 'Corredores que não levam a lugar nenhum.'],
    [49.5, 53.5, 'Se algo te encontrar aqui... continue andando.'],
    [54.0, 56.8, 'Bem-vindo aos Fundos. Nível 0.'],
  ];

  // ---------------------- estado ----------------------
  let renderer, scene, camera, camLight, lampLight, ambient;
  let texWall, texFloor, texCeil, trimMat;
  let audio = null, audioOk = false;
  let running = false, finished = false, built = false;
  let startPerf = 0, onComplete = null;
  let loreEls = [], activeLore = -1, lampMats = [], floorOffX = [];
  let fxVignette, fxGrain, fxBlack, noiseURI;

  // ---------------------- utilidades ----------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function hash(n) { const s = Math.sin(n * 91.137 + 12.93) * 43758.5453; return s - Math.floor(s); }
  function lerpArr(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function shade(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
  function col(a) { return new THREE.Color(a[0] / 255, a[1] / 255, a[2] / 255); }

  // smootherstep: derivada E aceleração chegam a zero nas bordas
  // -> a câmera parte e PARA de forma fluida, sem o "tranco" ao chegar no nível
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

  // ------------------ paleta por nível (0..8) ------------------
  const ANCHORS = [
    { at: 0, wall: [152, 148, 134], floor: [132, 124, 106], ceil: [158, 154, 140], lamp: [255, 246, 220], sky: [150, 200, 238] },
    { at: 3, wall: [172, 158, 110], floor: [140, 126, 84],  ceil: [166, 158, 122], lamp: [255, 238, 182], sky: [122, 150, 152] },
    { at: 6, wall: [196, 176, 108], floor: [146, 126, 74],  ceil: [178, 168, 128], lamp: [255, 236, 160], sky: [98, 102, 84] },
    { at: 8, wall: [202, 176, 96],  floor: [156, 136, 72],  ceil: [190, 178, 138], lamp: [255, 242, 180], sky: [72, 72, 54] },
  ];
  function palAt(level) {
    let a = ANCHORS[0], b = ANCHORS[ANCHORS.length - 1];
    for (let i = 1; i < ANCHORS.length; i++) {
      if (level <= ANCHORS[i].at) { a = ANCHORS[i - 1]; b = ANCHORS[i]; break; }
    }
    const t = clamp((level - a.at) / (b.at - a.at || 1), 0, 1);
    return {
      wall: lerpArr(a.wall, b.wall, t), floor: lerpArr(a.floor, b.floor, t),
      ceil: lerpArr(a.ceil, b.ceil, t), lamp: lerpArr(a.lamp, b.lamp, t), sky: lerpArr(a.sky, b.sky, t),
    };
  }

  // ============================================================
  //  TEXTURAS PROCEDURAIS (claras, tingidas pela cor do material)
  // ============================================================
  function texWallpaper() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#e8e3d6'; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(150,135,90,0.18)'; x.lineWidth = 5;
    for (let i = 0; i < 256; i += 18) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); }
    for (let i = 0; i < 12; i++) {
      const gx = Math.random() * 256, gy = Math.random() * 256, r = 14 + Math.random() * 46;
      const grd = x.createRadialGradient(gx, gy, 0, gx, gy, r);
      grd.addColorStop(0, 'rgba(90,70,30,0.12)'); grd.addColorStop(1, 'rgba(90,70,30,0)');
      x.fillStyle = grd; x.beginPath(); x.arc(gx, gy, r, 0, 7); x.fill();
    }
    for (let i = 0; i < 2600; i++) { x.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.03)' : 'rgba(120,95,35,0.05)'; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.5, 1);
    return t;
  }
  function texCarpet() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#b8af9a'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 7000; i++) { x.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,250,225,0.05)'; x.fillRect(Math.random() * 128, Math.random() * 128, 1, 1); }
    for (let i = 0; i < 10; i++) {
      const gx = Math.random() * 128, gy = Math.random() * 128, r = 8 + Math.random() * 22;
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
    for (let i = 0; i < 1400; i++) { x.fillStyle = 'rgba(0,0,0,0.04)'; x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.5, 2);
    return t;
  }

  // ============================================================
  //  HELPERS DE GEOMETRIA
  // ============================================================
  function box(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
  function lam(colorArr, map) { return new THREE.MeshLambertMaterial({ color: col(colorArr), map: map || null, side: THREE.DoubleSide }); }
  function emis(colorArr) { return new THREE.MeshBasicMaterial({ color: col(colorArr), side: THREE.DoubleSide }); }

  // poltrona detalhada
  function makeChair(fabricArr) {
    const g = new THREE.Group();
    const fab = lam(fabricArr); const fab2 = lam(shade(fabricArr, 1.12));
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

  // ============================================================
  //  SALA "MEMÓRIA" (níveis 0..7) — bem detalhada
  // ============================================================
  function buildMemoryFloor(i) {
    const level = i, f = level / MAXLEVEL, P = palAt(level);
    const g = new THREE.Group(); g.position.y = -i * RH;
    const ZLEN = DEPTH + ZBACK, ZC = (ZBACK - DEPTH) / 2;

    const wallMat = lam(P.wall, texWall);
    const wallMatL = lam(shade(P.wall, 0.86), texWall);
    const wallMatR = lam(shade(P.wall, 0.76), texWall);
    const floorMat = lam(shade(P.floor, 0.95), texFloor);
    const ceilMat = lam(P.ceil, texCeil);

    // superfícies
    const back = box(HW * 2, RH, 0.1, wallMat); back.position.set(0, 0, -DEPTH); g.add(back);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(ZLEN, RH), wallMatL); left.rotation.y = Math.PI / 2; left.position.set(-HW, 0, ZC); g.add(left);
    const right = new THREE.Mesh(new THREE.PlaneGeometry(ZLEN, RH), wallMatR); right.rotation.y = -Math.PI / 2; right.position.set(HW, 0, ZC); g.add(right);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, ZLEN), ceilMat); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, RH / 2, ZC); g.add(ceil);
    const flo = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, ZLEN), floorMat); flo.rotation.x = -Math.PI / 2; flo.position.set(0, -RH / 2, ZC); g.add(flo);

    // rodapé + cimalha
    function trimRun(y) {
      const b = box(HW * 2, 0.26, 0.07, trimMat); b.position.set(0, y, -DEPTH + 0.06); g.add(b);
      for (const sx of [-1, 1]) { const s = box(0.07, 0.26, ZLEN, trimMat); s.position.set(sx * (HW - 0.04), y, ZC); g.add(s); }
    }
    trimRun(-RH / 2 + 0.14); trimRun(RH / 2 - 0.14);

    // ---- janela na parede esquerda ----
    const winLight = clamp(1 - level / 4.5, 0, 1);
    const wz = -2.0, wy = 0.55;
    if (winLight > 0.04) {
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.35), emis(lerpArr([30, 28, 20], P.sky, winLight)));
      glass.rotation.y = Math.PI / 2; glass.position.set(-HW + 0.04, wy, wz); g.add(glass);
      // luz do dia real só nos primeiros andares (economia de luzes)
      if (level < 2) { const wl = new THREE.PointLight(col(P.sky), winLight * 0.8, 9); wl.position.set(-HW + 1.4, wy, wz); g.add(wl); }
    } else {
      const vent = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.35), emis([16, 15, 11])); vent.rotation.y = Math.PI / 2; vent.position.set(-HW + 0.04, wy, wz); g.add(vent);
    }
    // moldura de madeira + caixilhos + peitoril
    for (const [oy, ow, oh] of [[wy + 0.8, 3.2, 0.12], [wy - 0.8, 3.2, 0.12]]) { const b = box(0.12, oh, ow, trimMat); b.position.set(-HW + 0.08, oy, wz); g.add(b); }
    for (const oz of [wz - 1.55, wz + 1.55]) { const b = box(0.12, 1.7, 0.12, trimMat); b.position.set(-HW + 0.08, wy, oz); g.add(b); }
    for (let k = -1; k <= 1; k++) { const bar = box(0.06, 1.3, 0.05, trimMat); bar.position.set(-HW + 0.1, wy, wz + k * 0.72); g.add(bar); }
    const sill = box(0.34, 0.1, 3.4, trimMat); sill.position.set(-HW + 0.18, wy - 0.78, wz); g.add(sill);

    // ---- porta na parede direita ----
    const dz = -3.4;
    const doorHole = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.7), emis([6, 6, 5])); doorHole.rotation.y = -Math.PI / 2; doorHole.position.set(HW - 0.04, -0.15, dz); g.add(doorHole);
    const leaf = box(0.08, 2.6, 1.5, lam(shade(P.wall, 0.5))); leaf.position.set(HW - 0.2, -0.2, dz - 0.7); leaf.rotation.y = 0.5; g.add(leaf); // entreaberta
    for (const [oy, ow, oh] of [[1.25, 2.0, 0.14], [-1.45, 2.0, 0.14]]) { const b = box(0.14, oh, ow, trimMat); b.position.set(HW - 0.08, oy, dz); g.add(b); }
    for (const oz of [dz - 0.95, dz + 0.95]) { const b = box(0.14, 2.85, 0.14, trimMat); b.position.set(HW - 0.08, -0.1, oz); g.add(b); }

    // ---- iluminação do teto ----
    if (level < 6.5) {
      const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 14), lam([60, 56, 44])); canopy.position.set(0, RH / 2 - 0.06, -1.2); g.add(canopy);
      const globeMat = emis(P.lamp); lampMats.push(globeMat);
      const globe = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), globeMat); globe.position.set(0, RH / 2 - 0.36, -1.2); g.add(globe);
    } else {
      for (let k = -1; k <= 1; k++) {
        const dead = hash(level * 7 + k * 3) < 0.18;
        const pm = dead ? emis([42, 40, 26]) : emis([255, 248, 210]); if (!dead) lampMats.push(pm);
        const pan = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.2), pm); pan.rotation.x = Math.PI / 2; pan.position.set(k * 2.2, RH / 2 - 0.04, -1.5); g.add(pan);
      }
    }

    // ---- poltrona ----
    const chairA = clamp(1 - level / 8, 0, 1);
    if (chairA > 0.05) {
      const chair = makeChair(shade([122, 98, 88], 1 - f * 0.45));
      chair.position.set((hash(level * 2.1) - 0.5) * 1.6, -RH / 2, -DEPTH + 1.4);
      chair.rotation.y = (hash(level * 3.3) - 0.5) * f * 0.7;
      chair.rotation.x = f * 0.22; chair.scale.y = 1 - f * 0.28; g.add(chair);
    }

    // ---- estante com livros (parede esquerda, some cedo) ----
    if (level < 6) {
      const sh = new THREE.Group(); sh.position.set(-HW + 0.28, -RH / 2, -4.7);
      const body = box(0.42, 2.3, 1.5, lam([78, 56, 36])); body.position.y = 1.15; sh.add(body);
      const bookCols = [[120, 40, 30], [50, 70, 100], [90, 80, 40], [60, 90, 60]];
      for (let r = 0; r < 3; r++) {
        const shelf = box(0.4, 0.05, 1.4, trimMat); shelf.position.set(0, 0.55 + r * 0.62, 0); sh.add(shelf);
        for (let b2 = 0; b2 < 4; b2++) { const bk = box(0.26, 0.42, 0.12, lam(bookCols[(r + b2) % 4])); bk.position.set(0, 0.8 + r * 0.62, -0.5 + b2 * 0.28); sh.add(bk); }
      }
      sh.rotation.y = Math.PI / 2; g.add(sh);
    }

    // ---- quadro na parede do fundo + tomada ----
    const frameM = box(1.2, 0.9, 0.06, trimMat); frameM.position.set(2.2, 0.6, -DEPTH + 0.07); g.add(frameM);
    const canvasM = box(1.0, 0.7, 0.02, lam(shade([90, 80, 60], 1 - f * 0.4))); canvasM.position.set(2.2, 0.6, -DEPTH + 0.11); g.add(canvasM);
    const outlet = box(0.18, 0.28, 0.04, lam([220, 214, 198])); outlet.position.set(-1.8, -RH / 2 + 0.5, -DEPTH + 0.07); g.add(outlet);

    // distorção determinística crescente
    const offX = (hash(level * 1.7) * 2 - 1) * f * 0.6;
    g.rotation.z = (hash(level * 5.3) * 2 - 1) * f * 0.10;
    g.rotation.x += (hash(level * 3.1) * 2 - 1) * f * 0.05;
    g.position.x = offX; floorOffX[i] = offX;
    scene.add(g);
  }

  // ============================================================
  //  NÍVEL 8 — SALÃO BACKROOMS amplo (com pilares e fluorescentes)
  // ============================================================
  function buildBackrooms() {
    const P = palAt(8);
    const g = new THREE.Group(); g.position.y = -BACK * RH;
    const ZLEN = ZFRONT8 + ZFAR8, ZC = (ZFRONT8 - ZFAR8) / 2;

    const wallMap = texWall.clone(); wallMap.repeat.set(6, 1.2); wallMap.needsUpdate = true;
    const floorMap = texFloor.clone(); floorMap.repeat.set(14, 16); floorMap.needsUpdate = true;
    const ceilMap = texCeil.clone(); ceilMap.repeat.set(10, 16); ceilMap.needsUpdate = true;

    const wallMat = lam(P.wall, wallMap);
    const floorMat = lam(shade(P.floor, 0.96), floorMap);
    const ceilMat = lam(P.ceil, ceilMap);

    const back = box(HW8 * 2, RH, 0.2, wallMat); back.position.set(0, 0, -ZFAR8); g.add(back);
    for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(ZLEN, RH), wallMat); w.rotation.y = -sx * Math.PI / 2; w.position.set(sx * HW8, 0, ZC); g.add(w); }
    const flo = new THREE.Mesh(new THREE.PlaneGeometry(HW8 * 2, ZLEN), floorMat); flo.rotation.x = -Math.PI / 2; flo.position.set(0, -RH / 2, ZC); g.add(flo);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HW8 * 2, ZLEN), ceilMat); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, RH / 2, ZC); g.add(ceil);

    // pilares
    for (const px of [-7.5, 0, 7.5]) {
      for (let pz = -2; pz > -ZFAR8; pz -= 10) {
        const pil = box(1.5, RH, 1.5, wallMat); pil.position.set(px, 0, pz); g.add(pil);
        for (const sx of [-1, 1]) { const tb = box(0.1, 0.12, 1.6, trimMat); tb.position.set(px + sx * 0.78, -RH / 2 + 0.16, pz); g.add(tb); }
      }
    }
    // luminárias fluorescentes no teto
    for (const lx of [-9, -4.5, 0, 4.5, 9]) {
      for (let lz = -2; lz > -ZFAR8; lz -= 7) {
        const dead = hash(lx * 3 + lz) < 0.12;
        const pm = dead ? emis([46, 44, 28]) : emis([255, 250, 220]); if (!dead) lampMats.push(pm);
        const pan = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.4), pm); pan.rotation.x = Math.PI / 2; pan.position.set(lx, RH / 2 - 0.04, lz); g.add(pan);
      }
    }
    // vãos escuros (corredores) nas paredes
    for (const sx of [-1, 1]) for (const dz of [-12, -28, -40]) {
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.4), emis([8, 8, 6])); hole.rotation.y = -sx * Math.PI / 2; hole.position.set(sx * (HW8 - 0.05), -0.5, dz); g.add(hole);
    }
    floorOffX[8] = 0;
    scene.add(g);
  }

  function buildTower() {
    if (built) return; built = true;
    texWall = texWallpaper(); texFloor = texCarpet(); texCeil = texCeiling();
    trimMat = lam([74, 56, 36]);
    for (let i = 0; i < MEM; i++) buildMemoryFloor(i);
    buildBackrooms();
  }

  // ============================================================
  //  EFEITOS DE TELA (overlay sobre o canvas WebGL)
  // ============================================================
  function makeNoiseURI() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const id = x.createImageData(64, 64);
    for (let i = 0; i < id.data.length; i += 4) { const v = (Math.random() * 255) | 0; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    x.putImageData(id, 0, 0); return c.toDataURL();
  }
  function buildFX() {
    const host = document.getElementById('intro'); noiseURI = makeNoiseURI();
    fxVignette = document.createElement('div');
    fxVignette.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none;box-shadow:inset 0 0 220px 70px rgba(0,0,0,0.85);';
    host.appendChild(fxVignette);
    fxGrain = document.createElement('div');
    fxGrain.style.cssText = 'position:absolute;inset:0;z-index:3;pointer-events:none;opacity:0.08;background-image:url(' + noiseURI + ');background-repeat:repeat;mix-blend-mode:overlay;';
    host.appendChild(fxGrain);
    fxBlack = document.createElement('div');
    fxBlack.style.cssText = 'position:absolute;inset:0;z-index:4;pointer-events:none;background:#000;opacity:1;';
    host.appendChild(fxBlack);
  }

  // ============================================================
  //  RENDER POR FRAME
  // ============================================================
  function render(t) {
    const depth = depthAt(t);
    const f = clamp(depth / MAXLEVEL, 0, 1);
    const bk = smooth(7.4, 8, depth);          // 0 nas memórias -> 1 nos Fundos (só na queda final)
    const eps = 0.05;
    const speed = Math.abs(depthAt(t + eps) - depthAt(t - eps)) / (2 * eps);
    const boost = clamp(speed * 0.9, 0, 1.3);

    // câmera: desce pela torre e avança nos Fundos
    const camY = -depth * RH;
    const forward = smooth(38, 56, t) * DRIFT;
    const sway = (1 - bk) * 0.25;
    const camX = Math.sin(t * 0.8) * sway + (hash(Math.floor(depth) * 1.7) * 2 - 1) * f * 0.4 * (1 - bk);
    camera.position.set(camX, camY, CAMZ - forward);
    const basePitch = lerp(-0.05, 0.0, bk);
    const dip = boost * 0.55;
    const roll = Math.sin(t * 1.1) * 0.012 * (1 - bk) + boost * 0.04;
    camera.rotation.set(basePitch - dip, 0, roll, 'YXZ');

    // luzes
    camLight.position.set(camX, camY + 0.5, CAMZ - forward);
    camLight.intensity = lerp(1.05, 0.3, bk);
    const fl = Math.round(clamp(depth, 0, 7));
    lampLight.visible = bk < 0.85;
    lampLight.color = col(palAt(fl).lamp);
    lampLight.position.set(floorOffX[fl] || 0, -fl * RH + RH / 2 - 0.4, -1.2);
    ambient.intensity = lerp(0.5, 1.0, bk);
    ambient.color = col(lerpArr([255, 244, 214], [255, 238, 180], bk));

    // fog/fundo abrem nos Fundos
    const fogCol = col(lerpArr([11, 10, 7], [40, 36, 18], bk));
    scene.fog.color = fogCol; scene.fog.far = lerp(24, 44, bk);
    renderer.setClearColor(fogCol, 1);

    // flicker das lâmpadas
    if (Math.random() < 0.06 && lampMats.length) {
      const m = lampMats[(Math.random() * lampMats.length) | 0];
      m.color.multiplyScalar(0.45); setTimeout(() => m.color.multiplyScalar(1 / 0.45), 55 + Math.random() * 80);
    }

    renderer.render(scene, camera);

    // efeitos de tela
    const fadein = 1 - smooth(0, FADEIN, t);
    const transBlack = clamp((boost - 0.35) * 0.9, 0, 0.7) * (1 - bk * 0.7);
    fxBlack.style.opacity = Math.max(fadein, transBlack).toFixed(3);
    fxGrain.style.opacity = ((0.06 + f * 0.08 + boost * 0.08) * (1 - bk * 0.45)).toFixed(3);
    fxGrain.style.backgroundPosition = ((Math.random() * 64) | 0) + 'px ' + ((Math.random() * 64) | 0) + 'px';
    fxVignette.style.boxShadow = 'inset 0 0 220px ' + (60 + f * 40) + 'px rgba(0,0,0,' + ((0.7 + f * 0.2) * (1 - bk * 0.55)).toFixed(2) + ')';

    updateLore(t);
  }

  function updateLore(t) {
    let idx = -1;
    for (let i = 0; i < LORE.length; i++) if (t >= LORE[i][0] && t <= LORE[i][1]) { idx = i; break; }
    if (idx !== activeLore) {
      if (activeLore >= 0) loreEls[activeLore].classList.remove('show');
      if (idx >= 0) loreEls[idx].classList.add('show');
      activeLore = idx;
    }
  }

  // ============================================================
  //  CICLO DE VIDA
  // ============================================================
  function now() {
    if (audioOk && audio && !audio.paused && audio.currentTime > 0) return audio.currentTime;
    return (performance.now() - startPerf) / 1000;
  }
  function tick() {
    if (!running) return;
    const t = now(); render(t);
    if (t >= END_T || (audioOk && audio && audio.ended)) { finish(); return; }
    requestAnimationFrame(tick);
  }
  function finish() {
    if (finished) return; finished = true; running = false;
    if (activeLore >= 0) { loreEls[activeLore].classList.remove('show'); activeLore = -1; }
    if (typeof onComplete === 'function') onComplete();
    setTimeout(() => { try { renderer.forceContextLoss(); renderer.dispose(); } catch (e) {} }, 1400);
  }
  function buildLore() {
    const hostEl = document.getElementById('lore-text'); hostEl.innerHTML = '';
    loreEls = LORE.map(([, , txt]) => { const p = document.createElement('p'); p.textContent = txt; hostEl.appendChild(p); return p; });
  }
  function resize() {
    if (!renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ---------------------- API pública ----------------------
  function start(audioEl, doneCb) {
    onComplete = doneCb; audio = audioEl;
    finished = false; running = true; activeLore = -1;

    const canvas = document.getElementById('intro-canvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x0b0a07, 1);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b0a07, 4, 24);
    ambient = new THREE.AmbientLight(0xfff4d6, 0.5); scene.add(ambient);
    camLight = new THREE.PointLight(0xffe9c2, 1.05, 20, 1.4); scene.add(camLight);
    lampLight = new THREE.PointLight(0xffe2b0, 0.85, 13, 1.6); scene.add(lampLight);

    camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 220);

    buildTower(); buildFX(); buildLore();
    window.addEventListener('resize', resize);

    const skip = document.getElementById('skip-intro');
    if (skip) skip.addEventListener('click', finish);
    window.addEventListener('keydown', (e) => { if (running && (e.code === 'Escape' || e.code === 'Space')) finish(); });

    startPerf = performance.now();
    if (audio) {
      audio.currentTime = 0;
      const pr = audio.play();
      if (pr && pr.then) pr.then(() => { audioOk = true; }).catch(() => { audioOk = false; });
      audio.addEventListener('error', () => { audioOk = false; }, { once: true });
    }
    requestAnimationFrame(tick);
  }

  return { start };
})();
