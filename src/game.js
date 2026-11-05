/* ============================================================
   THE BACKROOMS — jogo (orquestração)
   ------------------------------------------------------------
   Jogador, mecânicas, objetivos, sanidade, alucinações, eventos
   ambientes, interface e o laço principal.

   Exposto como window.BackroomsGame:
     .init()        -> monta renderer/cena e o Nível 0
     .revealMenu()  -> mostra o menu de entrada e inicia o laço
   ============================================================ */
window.BackroomsGame = (function () {
  'use strict';
  const BR = window.BR, U = BR.U, A = BR.Audio, Tex = BR.Tex;
  const TT = (c, o) => Tex.toTexture(c, o);

  // ==========================================================
  //  NÍVEIS
  // ==========================================================
  const LEVELS = [
    {
      id: 0, name: 'NÍVEL 0', sub: 'O SAGUÃO', size: 46, ceil: 2.8,
      gen: { minRoom: 2, stopArea: 110, stopChance: 0.3, extraOpen: 0.45, doorChance: 0.45, maxGap: 4, pillarChance: 0.35, pillarSpacing: [3, 4], stubChance: 0.5, crateChance: 0, loopFrac: 0.012 },
      lamps: { sx: 3, ox: 1, sz: 4, oz: 2, dead: 0.12, flick: 0.08, darkZones: 3, darkR: 7, radius: 7.5, height: 2.78, intensity: 7.2, gi: 0.45, hang: false },
      textures: () => ({ wall: TT(Tex.wallpaper()), floor: TT(Tex.carpet()), ceil: TT(Tex.ceiling()), lamp: TT(Tex.lampDiffuser(), { clamp: true }) }),
      trim: true, trimColor: 0x86704a, ceilingHoles: 0.004, floorSpec: 0.06, floorShine: 10,
      lampColor: [1.0, 0.9, 0.66], ambient: [0.010, 0.0085, 0.005], fog: [0.03, 0.025, 0.012], fogDensity: 0.05,
      surface: 'carpet', ambience: 'office',
      monster: { walk: 1.35, run: 4.5, wake: 24, aggression: 0.1, stalkClose: 5.5, director: 75, lampBudget: 8 },
      objective: 'breakers', count: 3,
      music: 'Assets/musica-1.mp3',
      items: { battery: 4, almond: 4, props: 22 },
      notes: [
        'Se você está lendo isto, você também caiu.\n\nNão corra à toa. ELE OUVE os passos — correndo, de longe.\nAgachado [C] você quase não faz barulho.',
        'A lanterna [F] te salva e te entrega.\nSe ele estiver olhando pro seu lado, a luz é um farol.\n\nNo escuro, parado e agachado, ele passa do seu lado e não te vê.',
        'As luzes piscam quando ele está perto. Sempre.\n\nMenos quando ele está esperando por você.\nAí fica tudo quieto. Quieto demais.',
        'Água de amêndoa. Beba [X] quando as paredes começarem a respirar.\n\nNão é força de expressão.',
        'Joguei uma garrafa vazia [G] e ele foi atrás do barulho.\nNa segunda vez ele veio direto em MIM.\n\nEle aprende.',
        'Três disjuntores religam a porta de manutenção.\nO estalo é alto. Ele vai saber pra onde você está indo — e vai te esperar.',
        'Apontei a lanterna na cara dele. Ele recuou, gritou.\nNa terceira vez ele nem piscou.',
        'Prenda a respiração [Q] quando ele estiver perto.\nMas não por muito tempo. O ar sempre acaba na pior hora.',
      ],
    },
    {
      id: 1, name: 'NÍVEL 1', sub: 'ZONA HABITÁVEL', size: 52, ceil: 4.2,
      gen: { minRoom: 3, stopArea: 260, stopChance: 0.5, extraOpen: 0.5, doorChance: 0.3, maxGap: 5, pillarChance: 0.75, pillarSpacing: [4, 5], stubChance: 0.4, crateChance: 0.7, loopFrac: 0.015 },
      lamps: { sx: 5, ox: 2, sz: 5, oz: 2, dead: 0.28, flick: 0.12, darkZones: 5, darkR: 10, radius: 10, height: 3.4, intensity: 8.5, gi: 0.35, hang: true },
      textures: () => ({ wall: TT(Tex.concreteWall()), floor: TT(Tex.concreteFloor()), ceil: TT(Tex.concreteCeil()), lamp: TT(Tex.lampDiffuser(), { clamp: true }), crate: TT(Tex.wood()) }),
      trim: false, ceilingHoles: 0, floorSpec: 0.35, floorShine: 36, puddles: 16, ducts: 7,
      lampColor: [0.78, 0.88, 1.0], ambient: [0.006, 0.007, 0.009], fog: [0.012, 0.014, 0.017], fogDensity: 0.055,
      surface: 'concrete', ambience: 'industrial',
      monster: { walk: 1.5, run: 4.85, wake: 12, aggression: 0.3, stalkClose: 6, director: 60, lampBudget: 10 },
      objective: 'fuses', count: 3,
      music: 'Assets/musica-2.mp3',
      items: { battery: 5, almond: 4, props: 16 },
      notes: [
        'Zona Habitável. Habitável pra quem?\n\nOs fusíveis estão espalhados. O gerador fica em algum lugar no meio disso tudo.',
        'Poças. Não pise nas poças.\nO barulho da água ecoa por tudo.',
        'Quando o gerador ligar, ele vai ouvir de qualquer lugar.\nCorra pro elevador de carga. Não olhe pra trás.',
        'Ele quebra as lâmpadas de propósito. Gosta do escuro.\nFica mais escuro cada vez que você demora.',
        'O rádio ainda toca aquela música.\nSe você desligar e ligar de novo, ele vem. Use isso.',
      ],
    },
  ];

  // ==========================================================
  //  ESTADO
  // ==========================================================
  let renderer, scene, camera, post, uni;
  let world = null, theme = null, levelIndex = 0;
  let entity, brain, ghost = null, flashModel, flashLens, beam, dust;
  let state = 'menu', loopStarted = false, prevT = 0, time = 0, debug = false;
  const keys = {};
  const objects = [];
  let noises = [];
  let radio = null, hums = [], generatorSnd = null, exitHum = null;
  let distField = null, dfTimer = 0, trail = [], trailSet = new Set(), trailTimer = 0;
  let explored = null, mapOpen = false, mapTimer = 0, revealTimer = 0;
  let power = 1, blackoutT = 0, flickA = 1, flickB = 1, flickT = 0, monFlick = 0;
  let scareT = 0, eventT = 20, halluT = 30, whisperT = 15, hintQueue = [], hintT = 0;
  let playerSeesMonster = false, sawMonsterCool = 0, objectiveDone = 0, exitPowered = false, exitObj = null, generatorObj = null;
  let toastT = 0, readingNote = null, interactTarget = null, levelTitleT = 0;
  let bottles = [], bumpCool = 0, lastSafe = null;
  const stats = { time: 0, deaths: 0, dist: 0, notes: 0, drinks: 0, throws: 0 };

  const P = {
    x: 0, z: 0, y: 1.62, vx: 0, vz: 0, speed: 0, yaw: 0, pitch: 0,
    crouch: false, crouchT: 0, running: false, stamina: 1, exhausted: false,
    breath: 1, holding: false, breathLock: 0, breathT: 0, inhale: true,
    flashOn: true, battery: 1, flashI: 0, flashDir: new THREE.Vector3(0, 0, -1), flashFlick: 1,
    sanity: 1, fear: 0, heartT: 0,
    inv: { battery: 1, almond: 0, empty: 1, fuses: 0 },
    busy: 0, busyKind: null, stepAcc: 0, bobPhase: 0, roll: 0, fov: 72,
  };

  // UI
  const $ = (id) => document.getElementById(id);
  let ui = {};

  // vetores temporários
  const vF = new THREE.Vector3(), vR = new THREE.Vector3(), vT = new THREE.Vector3(), vUp = new THREE.Vector3(0, 1, 0);

  // ==========================================================
  //  MATERIAIS E MODELOS DE OBJETOS
  // ==========================================================
  let PM = null; // materiais de props
  const geoCache = {};
  function geo(key, fn) { return geoCache[key] || (geoCache[key] = fn()); }

  function makePropMaterials() {
    const S = BR.Shading;
    PM = {
      metal: S.material({ tint: 0x777b7c, spec: 0.5, shine: 30, dirt: 0.6 }),
      dark: S.material({ tint: 0x1d1d1f, spec: 0.3, shine: 20, dirt: 0.4 }),
      panel: S.material({ map: TT(Tex.metalPanel('DISJ.')), spec: 0.4, shine: 25 }),
      paper: S.material({ map: TT(Tex.paper()), dirt: 0.3, double: true }),
      bottle: S.material({ tint: 0xd8e4e6, spec: 1.6, shine: 70, dirt: 0 }),
      label: S.material({ tint: 0xd9c38a, spec: 0.2, dirt: 0.2 }),
      cap: S.material({ tint: 0x2a62b0, spec: 0.6, shine: 30, dirt: 0 }),
      battery: S.material({ tint: 0x262626, spec: 0.8, shine: 40, dirt: 0 }),
      batteryBand: S.material({ tint: 0xc9821e, spec: 0.8, shine: 40, dirt: 0 }),
      door: S.material({ map: TT(Tex.door()), spec: 0.4, shine: 25 }),
      exitOn: S.material({ map: TT(Tex.exitSign(true)), emissive: 3.5, dirt: 0 }),
      exitOff: S.material({ map: TT(Tex.exitSign(false)), dirt: 0 }),
      ledRed: S.material({ tint: 0xff2010, emissive: 4, dirt: 0 }),
      ledGreen: S.material({ tint: 0x20ff50, emissive: 4, dirt: 0 }),
      ledOff: S.material({ tint: 0x302020, dirt: 0 }),
      wood: S.material({ map: TT(Tex.wood()) }),
      card: S.material({ map: TT(Tex.cardboard()) }),
      fabric: S.material({ tint: 0x2c2a30, dirt: 0.8 }),
      radio: S.material({ map: TT(Tex.radio()), spec: 0.3, shine: 20 }),
      wet: S.material({ map: TT(Tex.wetSign()), double: true, spec: 0.5, shine: 30 }),
      rust: S.material({ tint: 0x6b4228, spec: 0.3, shine: 15 }),
      gen: S.material({ tint: 0x4f5a4a, spec: 0.5, shine: 25, dirt: 1 }),
      fuse: S.material({ tint: 0xe8e2d0, spec: 0.7, shine: 40, dirt: 0 }),
      black: S.material({ tint: 0x000000, dirt: 0 }),
      flash: S.material({ tint: 0x1b1c1e, spec: 1.2, shine: 50, dirt: 0 }),
      lens: S.material({ tint: 0xfff2d0, emissive: 0, dirt: 0 }),
    };
  }
  function mesh(g, m, x, y, z) { const o = new THREE.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); return o; }
  const box = (w, h, d) => geo('box' + w + h + d, () => new THREE.BoxGeometry(w, h, d));
  const cylG = (r0, r1, h, s) => geo('cyl' + r0 + r1 + h + s, () => new THREE.CylinderGeometry(r0, r1, h, s || 12));

  function modelBattery() {
    const g = new THREE.Group();
    for (const sx of [-0.035, 0.035]) {
      const b = mesh(cylG(0.03, 0.03, 0.1), PM.battery, sx, 0.03, 0); b.rotation.z = Math.PI / 2; g.add(b);
      const band = mesh(cylG(0.031, 0.031, 0.03), PM.batteryBand, sx + 0.035, 0.03, 0); band.rotation.z = Math.PI / 2; g.add(band);
    }
    g.rotation.y = Math.random() * 6.28;
    return g;
  }
  function modelBottle(empty) {
    const g = new THREE.Group();
    g.add(mesh(cylG(0.038, 0.04, 0.2), PM.bottle, 0, 0.1, 0));
    if (!empty) g.add(mesh(cylG(0.041, 0.041, 0.07), PM.label, 0, 0.09, 0));
    g.add(mesh(cylG(0.016, 0.034, 0.05), PM.bottle, 0, 0.225, 0));
    g.add(mesh(cylG(0.017, 0.017, 0.02), PM.cap, 0, 0.26, 0));
    return g;
  }
  function modelNote() {
    const g = new THREE.Group();
    const p = mesh(geo('note', () => new THREE.PlaneGeometry(0.21, 0.28)), PM.paper, 0, 0, 0);
    g.add(p);
    return g;
  }
  function modelBreaker() {
    const g = new THREE.Group();
    const mats = [PM.metal, PM.metal, PM.metal, PM.metal, PM.panel, PM.metal];
    g.add(mesh(box(0.42, 0.6, 0.1), mats, 0, 0, 0.05));
    const lever = new THREE.Group(); lever.position.set(0, -0.08, 0.11);
    lever.add(mesh(box(0.05, 0.16, 0.04), PM.dark, 0, 0.07, 0));
    lever.add(mesh(box(0.09, 0.03, 0.05), PM.ledOff, 0, 0.15, 0));
    lever.rotation.x = 0.8; g.add(lever);
    const led = mesh(geo('led', () => new THREE.SphereGeometry(0.014, 8, 6)), PM.ledRed, 0.14, 0.22, 0.105);
    g.add(led);
    g.add(mesh(cylG(0.02, 0.02, 1.4), PM.dark, -0.16, 0.95, 0.03)); // conduíte até o teto
    g.userData = { lever, led };
    return g;
  }
  function modelDoor() {
    const g = new THREE.Group();
    g.add(mesh(box(1.12, 2.2, 0.02), PM.black, 0, 1.1, 0.005));
    for (const sx of [-0.56, 0.56]) g.add(mesh(box(0.08, 2.24, 0.08), PM.metal, sx, 1.12, 0.04));
    g.add(mesh(box(1.2, 0.08, 0.08), PM.metal, 0, 2.24, 0.04));
    const hinge = new THREE.Group(); hinge.position.set(-0.52, 0, 0.03); g.add(hinge);
    hinge.add(mesh(box(1.04, 2.16, 0.05), [PM.metal, PM.metal, PM.metal, PM.metal, PM.door, PM.metal], 0.52, 1.08, 0));
    const sign = mesh(box(0.5, 0.18, 0.05), [PM.dark, PM.dark, PM.dark, PM.dark, PM.exitOff, PM.dark], 0, 2.5, 0.06);
    g.add(sign);
    g.userData = { hinge, sign };
    return g;
  }
  function modelRadio() {
    const g = new THREE.Group();
    g.add(mesh(box(0.42, 0.24, 0.16), [PM.wood, PM.wood, PM.wood, PM.wood, PM.radio, PM.wood], 0, 0.12, 0));
    const ant = mesh(cylG(0.004, 0.004, 0.5), PM.metal, 0.15, 0.45, -0.04); ant.rotation.z = -0.4; g.add(ant);
    return g;
  }
  function modelFuse() {
    const g = new THREE.Group();
    const b = mesh(cylG(0.022, 0.022, 0.09), PM.fuse, 0, 0.025, 0); b.rotation.z = Math.PI / 2; g.add(b);
    for (const sx of [-0.05, 0.05]) { const c = mesh(cylG(0.025, 0.025, 0.02), PM.metal, sx, 0.025, 0); c.rotation.z = Math.PI / 2; g.add(c); }
    return g;
  }
  function modelGenerator() {
    const g = new THREE.Group();
    g.add(mesh(box(1.6, 1.1, 0.9), PM.gen, 0, 0.6, 0));
    g.add(mesh(box(1.7, 0.1, 1.0), PM.dark, 0, 0.05, 0));
    g.add(mesh(box(0.5, 0.35, 0.05), PM.panel, 0.3, 0.75, 0.47));
    const pipe = mesh(cylG(0.06, 0.06, 1.4), PM.rust, -0.6, 1.6, -0.2); g.add(pipe);
    const lamp = mesh(geo('led', () => new THREE.SphereGeometry(0.014, 8, 6)), PM.ledRed, 0.5, 1.0, 0.47); lamp.scale.setScalar(2);
    g.add(lamp);
    g.userData = { lamp };
    return g;
  }
  function modelChair() {
    const g = new THREE.Group();
    g.add(mesh(box(0.46, 0.08, 0.46), PM.fabric, 0, 0.46, 0));
    g.add(mesh(box(0.44, 0.5, 0.06), PM.fabric, 0, 0.78, -0.21));
    g.add(mesh(cylG(0.025, 0.025, 0.38), PM.metal, 0, 0.25, 0));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const leg = mesh(box(0.04, 0.03, 0.3), PM.dark, Math.sin(a) * 0.15, 0.06, Math.cos(a) * 0.15); leg.rotation.y = a; g.add(leg);
    }
    if (Math.random() < 0.3) { g.rotation.z = Math.PI / 2; g.position.y = 0.23; }
    return g;
  }
  function modelCardboard() {
    const g = new THREE.Group(), s = U.rand(0.38, 0.6);
    g.add(mesh(box(s, s * 0.8, s), PM.card, 0, s * 0.4, 0));
    if (Math.random() < 0.4) { const t = mesh(box(s * 0.8, s * 0.6, s * 0.8), PM.card, U.rand(-0.05, 0.05), s * 0.8 + s * 0.3, 0); t.rotation.y = U.rand(-0.4, 0.4); g.add(t); }
    g.userData.r = s * 0.6;
    return g;
  }
  function modelWetSign() {
    const g = new THREE.Group(), pg = geo('wetp', () => new THREE.PlaneGeometry(0.3, 0.6));
    const a = mesh(pg, PM.wet, 0, 0.29, 0.08); a.rotation.x = -0.25; g.add(a);
    const b = mesh(pg, PM.wet, 0, 0.29, -0.08); b.rotation.x = 0.25; b.rotation.y = Math.PI; g.add(b);
    return g;
  }
  function modelBarrel() {
    const g = new THREE.Group();
    g.add(mesh(cylG(0.3, 0.3, 0.9, 16), PM.rust, 0, 0.45, 0));
    for (const y of [0.15, 0.75]) g.add(mesh(cylG(0.31, 0.31, 0.04, 16), PM.dark, 0, y, 0));
    if (Math.random() < 0.25) { g.rotation.z = Math.PI / 2; g.position.y = 0.3; }
    return g;
  }
  function modelPallet() {
    const g = new THREE.Group();
    for (let k = 0; k < 5; k++) g.add(mesh(box(1.0, 0.03, 0.14), PM.wood, 0, 0.12, -0.4 + k * 0.2));
    for (const z of [-0.4, 0, 0.4]) g.add(mesh(box(1.0, 0.1, 0.1), PM.wood, 0, 0.05, z));
    return g;
  }
  function modelFlashlight() {
    const g = new THREE.Group();
    const body = mesh(cylG(0.017, 0.016, 0.17), PM.flash, 0, 0, 0.06); body.rotation.x = Math.PI / 2; g.add(body);
    const head = mesh(cylG(0.03, 0.019, 0.06), PM.flash, 0, 0, -0.05); head.rotation.x = Math.PI / 2; g.add(head);
    flashLens = mesh(geo('lens', () => new THREE.CircleGeometry(0.026, 16)), PM.lens, 0, 0, -0.081); flashLens.rotation.y = Math.PI; g.add(flashLens);
    const sw = mesh(box(0.012, 0.008, 0.02), PM.dark, 0, 0.018, 0.04); g.add(sw);
    g.traverse((o) => { o.frustumCulled = false; });
    return g;
  }

  // ==========================================================
  //  OBJETOS DO NÍVEL
  // ==========================================================
  function addObject(o) {
    o.mesh.position.set(o.x, o.my != null ? o.my : 0, o.z);
    world.group.add(o.mesh);
    objects.push(o);
    return o;
  }
  function removeObject(o) {
    const i = objects.indexOf(o);
    if (i >= 0) objects.splice(i, 1);
    if (o.mesh && o.mesh.parent) o.mesh.parent.remove(o.mesh);
  }
  function placeOnWall(o, spot, y, out) {
    o.x = spot.x + spot.nx * (out || 0); o.z = spot.z + spot.nz * (out || 0); o.my = y;
    o.nx = spot.nx; o.nz = spot.nz;
    o.mesh.rotation.y = spot.rot;
    o.y = y; o.ix = spot.x + spot.nx * 0.15; o.iz = spot.z + spot.nz * 0.15;
  }

  function populate() {
    const w = world, th = theme, T = w.T;
    const used = [];
    const farEnough = (x, z, d) => used.every((u) => Math.hypot(u.x - x, u.z - z) > d);
    const mark = (x, z) => used.push({ x, z });
    const sc = w.center(w.start);
    mark(sc.x, sc.z);
    const steps = w.stepsFromStart;
    const spotsByDist = w.wallSpots.filter((s) => steps[s.tile] > 4);

    // ---- saída ----
    let maxS = 0;
    for (const s of spotsByDist) maxS = Math.max(maxS, steps[s.tile]);
    const exitCands = spotsByDist.filter((s) => steps[s.tile] > maxS * 0.85);
    const es = U.pick(exitCands.length ? exitCands : spotsByDist);
    exitObj = { kind: 'exit', mesh: modelDoor(), reach: 2.4, mapIcon: 'exit', label: 'a porta de saída', open: 0 };
    placeOnWall(exitObj, es, 0, 0);
    exitObj.y = 1.1;
    exitObj.use = useExit; exitObj.prompt = () => (exitPowered ? '[E] Atravessar a porta' : '[E] Porta trancada — sem energia');
    addObject(exitObj); mark(exitObj.x, exitObj.z);

    // amostragem pelo ponto mais distante (objetivos bem espalhados)
    function farthest(cands, n, minStep) {
      const res = [];
      const pts = [{ x: sc.x, z: sc.z }, { x: exitObj.x, z: exitObj.z }];
      for (let k = 0; k < n; k++) {
        let best = null, bd = -1;
        for (let t = 0; t < 140; t++) {
          const c = U.pick(cands);
          if (!c || steps[c.tile] < minStep) continue;
          const cx = c.x != null ? c.x : w.center(c.tile).x, cz = c.z != null ? c.z : w.center(c.tile).z;
          let md = 1e9;
          for (const p of pts) md = Math.min(md, Math.hypot(p.x - cx, p.z - cz));
          if (md > bd) { bd = md; best = c; }
        }
        if (best) { res.push(best); const c = best.x != null ? best : w.center(best.tile); pts.push({ x: c.x, z: c.z }); }
      }
      return res;
    }

    // ---- objetivos ----
    if (th.objective === 'breakers') {
      const sp = farthest(spotsByDist, th.count, 8);
      sp.forEach((s, i) => {
        const o = { kind: 'breaker', mesh: modelBreaker(), on: false, reach: 2.2, mapIcon: 'breaker', label: 'do disjuntor ' + (i + 1), idx: i + 1 };
        placeOnWall(o, s, 1.35, 0);
        o.prompt = () => (o.on ? 'Disjuntor ' + o.idx + ' — LIGADO' : '[E] Ligar disjuntor ' + o.idx);
        o.use = () => useBreaker(o);
        addObject(o); mark(o.x, o.z);
        o.hum = A.electricHum(o.ix, 1.35, o.iz, 1);
        if (o.hum) { o.hum.setLevel(0.05); hums.push(o.hum); }
      });
    } else {
      // gerador no meio do mapa (célula com 3x3 livre)
      const open3 = w.open.filter((i) => {
        const x = i % w.N, z = (i / w.N) | 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (w.isSolid(x + dx, z + dz)) return false;
        return steps[i] > 10;
      }).map((i) => ({ tile: i }));
      const gt = farthest(open3, 1, 10)[0] || { tile: w.open[(w.open.length / 2) | 0] };
      const gc = w.center(gt.tile);
      generatorObj = { kind: 'generator', mesh: modelGenerator(), x: gc.x, z: gc.z, y: 0.8, r: 1.0, reach: 2.6, mapIcon: 'generator', label: 'do gerador', fuses: 0, running: false };
      generatorObj.mesh.rotation.y = U.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      generatorObj.prompt = () => generatorObj.running ? 'Gerador — FUNCIONANDO' : (P.inv.fuses > 0 ? '[E] Encaixar fusíveis (' + P.inv.fuses + ')' : 'Gerador — faltam ' + (th.count - generatorObj.fuses) + ' fusíveis');
      generatorObj.use = useGenerator;
      addObject(generatorObj); mark(gc.x, gc.z);
      const fs = farthest(w.open.map((i) => ({ tile: i })), th.count, 6);
      fs.forEach((f) => {
        const c = w.center(f.tile);
        const o = { kind: 'fuse', mesh: modelFuse(), x: c.x + U.rand(-0.3, 0.3), z: c.z + U.rand(-0.3, 0.3), y: 0.05, reach: 2, mapIcon: 'fuse', label: 'de um fusível' };
        o.prompt = () => '[E] Pegar fusível';
        o.use = () => { P.inv.fuses++; A.pickup('fuse'); removeObject(o); toast('Fusível (' + (P.inv.fuses + generatorObj.fuses) + '/' + th.count + ')'); updateObjective(); };
        addObject(o); mark(o.x, o.z);
      });
    }

    // ---- rádio ----
    const rcands = w.wallSpots.filter((s) => steps[s.tile] > 12 && steps[s.tile] < 26);
    const rs = U.pick(rcands.length ? rcands : spotsByDist);
    if (rs) {
      const o = { kind: 'radio', mesh: modelRadio(), reach: 2, label: 'do rádio' };
      placeOnWall(o, rs, 0, 0.25);
      o.y = 0.15; o.ix = o.x; o.iz = o.z;
      o.prompt = () => (o.broken ? 'Rádio — destruído' : radio && radio.on ? '[E] Desligar rádio' : '[E] Ligar rádio (faz barulho)');
      o.use = () => toggleRadio(o);
      addObject(o); mark(o.x, o.z);
      radio = A.radio(th.music, o.x, 0.2, o.z);
      if (radio) radio.obj = o;
    }

    // ---- notas ----
    const notes = th.notes.slice();
    // a primeira fica no chão, logo à frente de onde você acorda
    const first = notes.shift();
    const nf = { kind: 'note', mesh: modelNote(), text: first, reach: 2.2 };
    const fdir = startDir();
    nf.x = sc.x + fdir.x * 1.2; nf.z = sc.z + fdir.z * 1.2; nf.y = 0.02; nf.my = 0.012;
    nf.mesh.children[0].rotation.x = -Math.PI / 2; nf.mesh.rotation.y = U.rand(-0.5, 0.5);
    nf.prompt = () => '[E] Ler bilhete'; nf.use = () => readNote(nf);
    addObject(nf);
    const nspots = U.shuffle(w.wallSpots.filter((s) => steps[s.tile] > 6));
    for (const text of notes) {
      const s = nspots.find((sp) => farEnough(sp.x, sp.z, 8));
      if (!s) break;
      const o = { kind: 'note', mesh: modelNote(), text, reach: 2.2 };
      if (Math.random() < 0.6) { placeOnWall(o, s, 1.45, 0.012); }
      else {
        const c = w.center(s.tile); o.x = c.x + s.nx * -0.25; o.z = c.z + s.nz * -0.25; o.y = 0.02; o.my = 0.012;
        o.mesh.children[0].rotation.x = -Math.PI / 2; o.mesh.rotation.y = U.rand(0, 6.28);
      }
      o.prompt = () => '[E] Ler bilhete'; o.use = () => readNote(o);
      addObject(o); mark(o.x, o.z);
    }

    // ---- itens ----
    const itemSpots = U.shuffle(w.wallSpots.slice());
    function placeItem(kind, n) {
      let placed = 0;
      for (const s of itemSpots) {
        if (placed >= n) break;
        const c = w.center(s.tile);
        const x = c.x - s.nx * 0.3 + U.rand(-0.25, 0.25), z = c.z - s.nz * 0.3 + U.rand(-0.25, 0.25);
        if (!farEnough(x, z, 7) || steps[s.tile] < 3) continue;
        spawnPickup(kind, x, z);
        mark(x, z); placed++;
      }
    }
    placeItem('battery', th.items.battery);
    placeItem('almond', th.items.almond);

    // ---- props (cenário com colisão) ----
    const propSpots = U.shuffle(w.wallSpots.slice());
    let np = 0;
    for (const s of propSpots) {
      if (np >= th.items.props) break;
      const c = w.center(s.tile);
      if (Math.hypot(c.x - sc.x, c.z - sc.z) < 3 || !farEnough(c.x, c.z, 1.8)) continue;
      // evita portas (célula com paredes em lados opostos)
      const x = s.tx, z = s.tz;
      if ((w.isSolid(x - 1, z) && w.isSolid(x + 1, z)) || (w.isSolid(x, z - 1) && w.isSolid(x, z + 1))) continue;
      let m, r;
      if (theme.id === 0) {
        const roll = Math.random();
        if (roll < 0.45) { m = modelChair(); r = 0.36; }
        else if (roll < 0.85) { m = modelCardboard(); r = m.userData.r; }
        else { m = modelWetSign(); r = 0.25; }
      } else {
        const roll = Math.random();
        if (roll < 0.45) { m = modelBarrel(); r = 0.36; }
        else if (roll < 0.75) { m = modelPallet(); r = 0.55; }
        else { m = modelCardboard(); r = m.userData.r; }
      }
      const o = { kind: 'prop', mesh: m, x: c.x - s.nx * 0.2 + U.rand(-0.2, 0.2), z: c.z - s.nz * 0.2 + U.rand(-0.2, 0.2), r };
      m.rotation.y = U.rand(0, 6.28);
      addObject(o); mark(o.x, o.z); np++;
    }
  }

  function spawnPickup(kind, x, z) {
    let o;
    if (kind === 'battery') {
      o = { kind, mesh: modelBattery(), x, z, y: 0.05, reach: 2.1 };
      o.prompt = () => '[E] Pegar pilhas';
      o.use = () => { P.inv.battery++; A.pickup('battery'); removeObject(o); toast('Pilhas (' + P.inv.battery + ') — [R] troca'); };
    } else if (kind === 'almond') {
      o = { kind, mesh: modelBottle(false), x, z, y: 0.12, reach: 2.1 };
      o.prompt = () => '[E] Pegar água de amêndoa';
      o.use = () => { P.inv.almond++; A.pickup('almond'); removeObject(o); toast('Água de amêndoa (' + P.inv.almond + ') — [X] bebe'); };
    } else {
      o = { kind: 'bottle', mesh: modelBottle(true), x, z, y: 0.08, reach: 2.1 };
      o.mesh.rotation.z = Math.PI / 2; o.my = 0.04;
      o.prompt = () => '[E] Pegar garrafa vazia';
      o.use = () => { P.inv.empty++; A.pickup('bottle'); removeObject(o); toast('Garrafa vazia (' + P.inv.empty + ') — [G] arremessa'); };
    }
    return addObject(o);
  }

  // direção livre a partir do início (para onde o jogador olha ao acordar)
  function startDir() {
    const w = world, x = w.start % w.N, z = (w.start / w.N) | 0;
    let best = [1, 0], bl = -1;
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      let l = 0; while (!w.isSolid(x + dx * (l + 1), z + dz * (l + 1)) && l < 20) l++;
      if (l > bl) { bl = l; best = [dx, dz]; }
    }
    return { x: best[0], z: best[1] };
  }

  // ==========================================================
  //  AÇÕES DE OBJETIVO
  // ==========================================================
  function useBreaker(o) {
    if (o.on) return;
    o.on = true;
    o.mesh.userData.lever.rotation.x = -0.8;
    o.mesh.userData.led.material = PM.ledGreen;
    A.clunk(o.ix, 1.4, o.iz);
    if (o.hum) o.hum.setLevel(0.18);
    noise(o.ix, o.iz, 42, 'breaker');
    objectiveDone++;
    shake(0.25);
    if (objectiveDone === 2) {
      // pico de energia -> apagão
      setTimeout(() => { if (state === 'playing') { blackoutT = U.rand(4, 6); A.lightPop(P.x + 3, 2.6, P.z + 2); A.glitch(1); toast('...a energia caiu.'); } }, 900);
    }
    if (objectiveDone >= theme.count) powerExit();
    else toast('Disjuntor ' + objectiveDone + '/' + theme.count + ' ligado. Ele ouviu isso.');
    updateObjective();
  }
  function useGenerator() {
    const g = generatorObj;
    if (g.running || P.inv.fuses <= 0) { if (!g.running) toast('Faltam fusíveis.'); return; }
    g.fuses += P.inv.fuses; P.inv.fuses = 0;
    A.clunk(g.x, 0.8, g.z);
    noise(g.x, g.z, 22, 'breaker');
    if (g.fuses >= theme.count) {
      g.running = true;
      g.mesh.userData.lamp.material = PM.ledGreen;
      generatorSnd = A.generator(g.x, 0.8, g.z);
      noise(g.x, g.z, 70, 'breaker');
      shake(0.6);
      power = 1.25;
      setTimeout(powerExit, 1500);
      toast('O gerador ligou. TODO o nível ouviu.');
    } else toast('Fusíveis no gerador: ' + g.fuses + '/' + theme.count);
    updateObjective();
  }
  function powerExit() {
    exitPowered = true;
    exitObj.mesh.userData.sign.material = [PM.dark, PM.dark, PM.dark, PM.dark, PM.exitOn, PM.dark];
    exitObj.discovered = true;
    exitHum = A.electricHum(exitObj.ix, 2.4, exitObj.iz, 2.4);
    if (exitHum) exitHum.setLevel(0.35);
    A.boom();
    toast(theme.id === 0 ? 'A porta de manutenção destravou. Ela aparece no seu mapa [M].' : 'O elevador de carga tem energia. Corra.');
    updateObjective();
  }
  function useExit() {
    if (!exitPowered) { toast('Trancada. Sem energia.'); A.bump(exitObj.ix, 1, exitObj.iz); noise(exitObj.ix, exitObj.iz, 10, 'door'); return; }
    if (state !== 'playing') return;
    exitObj.opening = true;
    A.creak(exitObj.ix, 1.2, exitObj.iz);
    setTimeout(reachExit, 700);
  }
  function toggleRadio(o) {
    if (!radio || o.broken) return;
    const on = !radio.on;
    radio.setOn(on);
    A.flashClick();
    if (on) { noise(o.x, o.z, 46, 'radio', { radio: true }); toast('O rádio chiou alto. Algo deve ter ouvido.'); }
  }
  function smashRadio() {
    if (!radio || radio.obj.broken) return;
    const o = radio.obj;
    o.broken = true;
    radio.destroy();
    A.bump(o.x, 0.3, o.z); A.lightPop(o.x, 0.3, o.z);
    o.mesh.rotation.z = 1.4; o.mesh.position.y = 0.1;
  }
  function readNote(o) {
    readingNote = o;
    ui.noteText.textContent = o.text;
    ui.note.classList.add('show');
    A.paper();
    if (!o.read) { o.read = true; stats.notes++; }
    noise(P.x, P.z, 2, 'paper', { fromPlayer: true });
  }
  function closeNote() {
    readingNote = null;
    ui.note.classList.remove('show');
  }
  function updateObjective() {
    let t;
    if (exitPowered) t = theme.id === 0 ? 'Vá até a porta de SAÍDA' : 'Vá até o elevador de carga (SAÍDA)';
    else if (theme.objective === 'breakers') t = 'Religue os disjuntores  ' + objectiveDone + '/' + theme.count;
    else {
      const have = P.inv.fuses + (generatorObj ? generatorObj.fuses : 0);
      t = have >= theme.count ? 'Leve os fusíveis ao gerador' : 'Encontre os fusíveis  ' + have + '/' + theme.count;
    }
    ui.objective.textContent = '▸ ' + t;
  }
  function pendingObjectives() {
    const res = [];
    for (const o of objects) {
      if (o.kind === 'breaker' && !o.on) res.push({ x: o.ix, z: o.iz, label: o.label });
      if (o.kind === 'fuse') res.push({ x: o.x, z: o.z, label: o.label });
      if (o.kind === 'generator' && !o.running && P.inv.fuses + o.fuses >= theme.count) res.push({ x: o.x, z: o.z, label: o.label });
    }
    if (exitPowered) res.push({ x: exitObj.ix, z: exitObj.iz, label: exitObj.label });
    return res;
  }

  // ==========================================================
  //  RUÍDO (para a IA)
  // ==========================================================
  function noise(x, z, r, kind, extra) {
    const n = Object.assign({ x, z, r, kind, fromPlayer: false }, extra || {});
    noises.push(n);
  }
  function playerNoise(r, kind) { noise(P.x, P.z, r, kind, { fromPlayer: true }); }

  // ==========================================================
  //  CONSTRUÇÃO DE NÍVEL
  // ==========================================================
  function clearLevel() {
    for (const h of hums) h.stop();
    hums = [];
    if (exitHum) { exitHum.stop(); exitHum = null; }
    if (radio) { radio.destroy(); radio = null; }
    if (generatorSnd) { generatorSnd.ch.dispose(); generatorSnd = null; }
    objects.length = 0; bottles = [];
    if (world) { scene.remove(world.group); world.dispose(); world = null; }
  }

  function buildLevel(i) {
    clearLevel();
    levelIndex = i; theme = LEVELS[i];
    world = new BR.World(theme, renderer.capabilities.getMaxAnisotropy());
    scene.add(world.group);
    uni.uLampColor.value.setRGB(theme.lampColor[0], theme.lampColor[1], theme.lampColor[2]);
    uni.uAmbient.value.setRGB(theme.ambient[0], theme.ambient[1], theme.ambient[2]);
    uni.uFogColor.value.setRGB(theme.fog[0], theme.fog[1], theme.fog[2]);
    uni.uFogDensity.value = theme.fogDensity;
    renderer.setClearColor(new THREE.Color(theme.fog[0], theme.fog[1], theme.fog[2]).convertLinearToSRGB(), 1);
    objectiveDone = 0; exitPowered = false; generatorObj = null; power = 1; blackoutT = 0;
    explored = new Uint8Array(world.N * world.N);
    P.inv.fuses = 0;
    populate();
    placePlayerAtStart();
    brain.reset(world, theme.monster);
    distField = world.distField(world.tileOf(P.x, P.z), 70);
    trail = []; trailSet = new Set();
    eventT = U.rand(14, 24); halluT = U.rand(30, 50);
    updateObjective();
    if (A.ctx) { A.setAmbienceKind(theme.ambience); if (radio && state !== 'menu') radio.setOn(true); }
    showLevelTitle();
  }

  function placePlayerAtStart() {
    const c = world.center(world.start), d = startDir();
    P.x = c.x; P.z = c.z; P.vx = P.vz = 0; P.speed = 0;
    P.yaw = Math.atan2(-d.x, -d.z); P.pitch = -0.12;
    P.stamina = 1; P.breath = 1; P.holding = false; P.busy = 0;
    P.crouch = false; P.crouchT = 0;
    lastSafe = { x: P.x, z: P.z };
  }

  function showLevelTitle() {
    ui.ltName.textContent = theme.name;
    ui.ltSub.textContent = '— ' + theme.sub + ' —';
    ui.levelTitle.classList.add('show');
    levelTitleT = 4.5;
  }

  // ==========================================================
  //  INICIALIZAÇÃO
  // ==========================================================
  function init() {
    ui = {
      startMenu: $('start-menu'), hud: $('hud'), crosshair: $('crosshair'), objective: $('objective'),
      prompt: $('prompt'), toast: $('toast'), rec: $('rec'), recTime: $('rec-time'),
      stamina: $('bar-stamina'), breath: $('bar-breath'), breathWrap: $('wrap-breath'), sanity: $('bar-sanity'),
      battery: $('battery-fill'), batteryPct: $('battery-pct'), inv: $('inv'),
      note: $('note-overlay'), noteText: $('note-text'),
      map: $('map-overlay'), mapCanvas: $('map-canvas'),
      debug: $('debug'), pause: $('pause-menu'), settings: $('settings'),
      levelTitle: $('level-title'), ltName: $('lt-name'), ltSub: $('lt-sub'),
      caught: $('caught-screen'), caughtSub: $('caught-sub'), win: $('win-screen'), winStats: $('win-stats'),
      fade: $('fade'), flash: $('flash'),
    };

    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.domElement.id = 'webgl';
    document.body.appendChild(renderer.domElement);
    post = new BR.PostFX(renderer);
    applyQuality();

    uni = BR.Shading.init();
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.03, 140);
    scene.add(camera);

    makePropMaterials();
    flashModel = modelFlashlight();
    flashModel.position.set(0.17, -0.19, -0.3);
    camera.add(flashModel);
    beam = BR.Shading.beam(7, 1.5);
    beam.frustumCulled = false;
    scene.add(beam);
    dust = BR.Shading.dust(500);
    scene.add(dust);

    // entidade + fantasma (alucinação)
    const skin = TT(Tex.skin());
    entity = new BR.Entity(BR.Entity.gameMaterials(skin));
    scene.add(entity.root);
    ghost = new BR.Entity(BR.Entity.gameMaterials(skin));
    ghost.root.visible = false;
    scene.add(ghost.root);
    brain = new BR.Brain(api, entity);

    A.occluder = occlusion;
    setupControls();
    setupSettings();
    buildLevel(0);
    renderer.compile(scene, camera);
  }

  function applyQuality() {
    const pr = Math.min(window.devicePixelRatio || 1, 1.5) * BR.Settings.quality;
    renderer.setPixelRatio(1);
    renderer.setSize(innerWidth, innerHeight);
    post.setSize(innerWidth, innerHeight, pr);
  }

  // ==========================================================
  //  CONTROLES
  // ==========================================================
  function lockPointer() {
    const el = document.body;
    try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ok */ }
  }

  function setupControls() {
    ui.startMenu.addEventListener('click', (e) => {
      if (e.target.closest('.menu-btn')) return;
      startPlaying();
    });
    $('btn-start-settings').addEventListener('click', (e) => { e.stopPropagation(); openSettings(); });
    $('btn-resume').addEventListener('click', () => { lockPointer(); });
    $('btn-settings').addEventListener('click', openSettings);
    $('btn-restart').addEventListener('click', () => { ui.pause.classList.remove('show'); buildLevel(levelIndex); lockPointer(); });
    $('btn-quit').addEventListener('click', () => location.reload());
    $('btn-settings-back').addEventListener('click', closeSettings);
    $('win-restart').addEventListener('click', () => location.reload());
    ui.note.addEventListener('click', closeNote);

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === document.body;
      if (locked) {
        noLock = false;
        if (state === 'menu' || state === 'paused') enterPlaying();
      } else if (state === 'playing') {
        state = 'paused';
        ui.pause.classList.add('show');
        showHUD(false);
        A.suspend();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (state !== 'playing') return;
      if (document.pointerLockElement !== document.body && !(noLock && (e.buttons & 1))) return;
      const s = 0.0021 * BR.Settings.sens;
      P.yaw -= e.movementX * s;
      P.pitch = U.clamp(P.pitch - e.movementY * s, -1.45, 1.45);
    });

    document.addEventListener('keydown', (e) => {
      if (e.code === 'F3') { e.preventDefault(); debug = !debug; ui.debug.style.display = debug ? 'block' : 'none'; return; }
      if (state !== 'playing') return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (keys[e.code]) return;
      keys[e.code] = true;
      switch (e.code) {
        case 'KeyF': toggleFlash(); break;
        case 'KeyC': P.crouch = !P.crouch; break;
        case 'KeyE': if (readingNote) closeNote(); else if (interactTarget) interactTarget.use(); break;
        case 'KeyR': swapBattery(); break;
        case 'KeyX': drinkAlmond(); break;
        case 'KeyG': throwBottle(); break;
        case 'KeyM': mapOpen = !mapOpen; ui.map.classList.toggle('show', mapOpen); if (mapOpen) { drawMap(); A.paper(); } break;
      }
    });
    document.addEventListener('keyup', (e) => { keys[e.code] = false; });
    addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
    addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
      applyQuality();
    });
  }

  function startPlaying() {
    A.init(); A.resume();
    A.startAmbience(theme.ambience);
    if (!brain.voice) brain.voice = A.monsterVoice();
    if (radio && !radio.on && !radio.obj.broken) radio.setOn(true);
    const ia = document.getElementById('intro-audio');
    if (ia) { try { ia.pause(); } catch (e) { /* ok */ } }
    if (!hintQueue.length && stats.time === 0) {
      hintQueue = ['[WASD] mover   ·   [MOUSE] olhar', '[SHIFT] correr — faz MUITO barulho', '[C] agachar — quase silencioso', '[F] lanterna   ·   [E] interagir', '[M] mapa   ·   [Q] prender a respiração'];
      hintT = 2.5;
    }
    lockPointer();
    // navegadores sem Pointer Lock: joga olhando com o mouse arrastando
    setTimeout(() => {
      if (state === 'menu' && document.pointerLockElement !== document.body) {
        noLock = true; enterPlaying();
        toast('Seu navegador não travou o mouse: arraste com o botão esquerdo para olhar.', 5);
      }
    }, 1500);
  }
  let noLock = false;
  function enterPlaying() {
    ui.startMenu.style.display = 'none';
    ui.pause.classList.remove('show'); closeSettings();
    showHUD(true);
    state = 'playing';
    A.resume();
  }

  function showHUD(v) {
    ui.hud.style.display = v ? 'block' : 'none';
    ui.crosshair.style.display = v ? 'block' : 'none';
    ui.objective.style.display = v ? 'block' : 'none';
    ui.rec.style.display = v && BR.Settings.fx > 0 ? 'block' : 'none';
    if (!v) ui.prompt.style.display = 'none';
  }

  // ---------------- configurações ----------------
  function setupSettings() {
    const bind = (id, key, fmt, apply) => {
      const el = $(id), lab = $(id + '-v');
      el.value = BR.Settings[key];
      const upd = () => { BR.Settings[key] = parseFloat(el.value); if (lab) lab.textContent = fmt(BR.Settings[key]); if (apply) apply(); BR.saveSettings(); };
      el.addEventListener('input', upd);
      if (lab) lab.textContent = fmt(BR.Settings[key]);
    };
    bind('set-sens', 'sens', (v) => v.toFixed(2) + 'x');
    bind('set-vol', 'volume', (v) => Math.round(v * 100) + '%', () => A.setVolume(BR.Settings.volume));
    bind('set-bright', 'brightness', (v) => Math.round(v * 100) + '%');
    bind('set-fx', 'fx', (v) => Math.round(v * 100) + '%');
    bind('set-quality', 'quality', (v) => Math.round(v * 100) + '%', applyQuality);
  }
  function openSettings() { ui.settings.classList.add('show'); }
  function closeSettings() { ui.settings.classList.remove('show'); }

  // ==========================================================
  //  AÇÕES DO JOGADOR
  // ==========================================================
  function toggleFlash() {
    if (P.busyKind === 'battery') return;
    P.flashOn = !P.flashOn; A.flashClick();
    playerNoise(2, 'click');
  }
  function swapBattery() {
    if (P.busy > 0 || P.inv.battery <= 0 || P.battery > 0.97) { if (P.inv.battery <= 0) toast('Sem pilhas.'); return; }
    P.busy = 1.4; P.busyKind = 'battery';
    A.pickup('battery'); playerNoise(3, 'click');
  }
  function drinkAlmond() {
    if (P.busy > 0) return;
    if (P.inv.almond <= 0) { toast('Sem água de amêndoa.'); return; }
    P.busy = 1.6; P.busyKind = 'drink';
    A.drink(); playerNoise(3, 'drink');
  }
  function throwBottle() {
    if (P.busy > 0) return;
    if (P.inv.empty <= 0) { toast('Nenhuma garrafa vazia.'); return; }
    P.inv.empty--; stats.throws++;
    camera.getWorldDirection(vF);
    const m = modelBottle(true);
    world.group.add(m);
    bottles.push({ mesh: m, x: camera.position.x + vF.x * 0.4, y: camera.position.y - 0.1, z: camera.position.z + vF.z * 0.4,
      vx: vF.x * 10 + P.vx * 0.5, vy: vF.y * 10 + 2.2, vz: vF.z * 10 + P.vz * 0.5, spin: U.rand(8, 14), hit: false, life: 0, origin: { x: P.x, z: P.z } });
    A.whoosh();
  }

  // ==========================================================
  //  ATUALIZAÇÃO DO JOGADOR
  // ==========================================================
  function updatePlayer(dt) {
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    let ix = 0, iz = 0;
    const kW = keys.KeyW || keys.ArrowUp, kS = keys.KeyS || keys.ArrowDown, kA = keys.KeyA || keys.ArrowLeft, kD = keys.KeyD || keys.ArrowRight;
    if (kW) { ix += fx; iz += fz; }
    if (kS) { ix -= fx; iz -= fz; }
    if (kD) { ix += rx; iz += rz; }
    if (kA) { ix -= rx; iz -= rz; }
    const il = Math.hypot(ix, iz);
    if (il > 0) { ix /= il; iz /= il; }
    const moving = il > 0;

    if (P.stamina <= 0.01) P.exhausted = true;
    if (P.exhausted && P.stamina > 0.35) P.exhausted = false;
    const wantRun = (keys.ShiftLeft || keys.ShiftRight) && moving && !P.exhausted && kW && P.busy <= 0;
    if (wantRun) P.crouch = false;
    P.running = wantRun;
    let target = P.crouch ? 1.25 : wantRun ? 5.0 : 2.5;
    if (P.holding) target *= 0.85;
    if (P.busy > 0) target *= 0.5;
    if (mapOpen) target *= 0.6;
    if (readingNote) target *= 0.5;

    if (wantRun) P.stamina = Math.max(0, P.stamina - dt / 6.5);
    else P.stamina = Math.min(1, P.stamina + (dt / 8) * (P.fear > 0.5 ? 0.6 : 1) * (moving ? 0.8 : 1.2));

    const acc = moving ? 10 : 12;
    P.vx += (ix * target - P.vx) * Math.min(1, acc * dt);
    P.vz += (iz * target - P.vz) * Math.min(1, acc * dt);
    const ox = P.x, oz = P.z;
    const p = { x: P.x + P.vx * dt, z: P.z + P.vz * dt };
    world.collide(p, 0.3);
    // colisão com objetos
    for (const o of objects) {
      if (!o.r) continue;
      const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), rr = o.r + 0.28;
      if (d < rr && d > 1e-4) { p.x = o.x + (dx / d) * rr; p.z = o.z + (dz / d) * rr; }
    }
    world.collide(p, 0.3);
    P.x = p.x; P.z = p.z;
    const moved = Math.hypot(P.x - ox, P.z - oz);
    P.speed = moved / Math.max(dt, 1e-4);
    stats.dist += moved;

    // passos + balanço da câmera
    const stepLen = P.running ? 1.05 : P.crouch ? 0.55 : 0.78;
    if (moved > 0.0005) {
      P.stepAcc += moved;
      P.bobPhase += (moved / stepLen) * Math.PI;
      if (P.stepAcc >= stepLen) {
        P.stepAcc -= stepLen;
        const surf = surfaceAt(P.x, P.z);
        const kind = P.running ? 2 : P.crouch ? 0 : 1;
        A.footstep(surf, kind);
        const wet = surf === 'water' ? 1.7 : 1;
        playerNoise((kind === 2 ? 17 : kind === 1 ? 7 : 2.2) * wet, 'step');
      }
    }
    P.crouchT = U.damp(P.crouchT, P.crouch ? 1 : 0, 8, dt);
    const sp = Math.min(1, P.speed / 5);
    const amp = P.running ? 0.065 : P.crouch ? 0.025 : 0.04;
    const bobY = Math.sin(P.bobPhase * 2) * amp * Math.min(1, P.speed / 1.2);
    const bobX = Math.sin(P.bobPhase) * amp * 0.6 * Math.min(1, P.speed / 1.2);
    const breathe = Math.sin(time * (1.2 + P.fear * 2)) * 0.008 * (1 + P.fear);
    P.y = U.lerp(1.62, 1.02, P.crouchT) + bobY + breathe;
    const strafe = (P.vx * rx + P.vz * rz) / 5;
    P.roll = U.damp(P.roll, -strafe * 0.035 + (P.sanity < 0.35 ? Math.sin(time * 0.6) * (0.35 - P.sanity) * 0.12 : 0), 6, dt);

    camera.position.set(P.x + rx * bobX, P.y, P.z + rz * bobX);
    camera.rotation.set(P.pitch + shakeAmt * U.rand(-0.03, 0.03), P.yaw + shakeAmt * U.rand(-0.03, 0.03), P.roll, 'YXZ');
    P.fov = U.damp(P.fov, 72 + sp * (P.running ? 6 : 0) + P.fear * 3 - (P.holding ? 4 : 0), 5, dt);
    if (Math.abs(camera.fov - P.fov) > 0.01) { camera.fov = P.fov; camera.updateProjectionMatrix(); }

    // respiração presa
    P.breathLock = Math.max(0, P.breathLock - dt);
    const wantHold = keys.KeyQ && P.breathLock <= 0;
    if (wantHold && P.breath > 0) {
      P.holding = true;
      P.breath -= dt / 9;
      if (P.breath <= 0) {
        P.breath = 0; P.holding = false; P.breathLock = 4;
        A.gasp(); playerNoise(14, 'gasp');
        toast('*arfa*');
      }
    } else {
      P.holding = false;
      P.breath = Math.min(1, P.breath + dt / 5);
    }

    // ações em andamento
    if (P.busy > 0) {
      P.busy -= dt;
      if (P.busy <= 0) {
        if (P.busyKind === 'battery') { P.inv.battery--; P.battery = 1; toast('Pilhas trocadas.'); A.flashClick(); }
        if (P.busyKind === 'drink') {
          P.inv.almond--; P.inv.empty++; stats.drinks++;
          P.sanity = Math.min(1, P.sanity + 0.45); P.stamina = 1;
          toast('Água de amêndoa. As paredes param de respirar.');
        }
        P.busyKind = null;
      }
    }

    // respiração audível
    const intensity = U.clamp((1 - P.stamina) * 0.9 + P.fear * 0.5 + (P.exhausted ? 0.3 : 0), 0, 1);
    P.breathT -= dt;
    if (!P.holding && P.breathT <= 0 && intensity > 0.12) {
      A.breath(P.inhale, intensity);
      P.breathT = U.lerp(1.9, 0.45, intensity) * (P.inhale ? 0.9 : 1.1);
      P.inhale = !P.inhale;
      if (intensity > 0.6 && !P.inhale) playerNoise(4.5 * intensity, 'breath');
    }

    // rastro (para o flanqueio da IA)
    trailTimer -= dt;
    if (trailTimer <= 0) {
      trailTimer = 0.25;
      trail.push(world.tileOf(P.x, P.z));
      if (trail.length > 22) trail.shift();
      trailSet = new Set(trail);
    }
  }

  function surfaceAt(x, z) {
    for (const p of world.puddles) if (Math.hypot(p.x - x, p.z - z) < p.r) return 'water';
    return theme.surface;
  }

  // ==========================================================
  //  LANTERNA
  // ==========================================================
  let shakeAmt = 0;
  function shake(v) { shakeAmt = Math.max(shakeAmt, v); }

  function updateFlashlight(dt) {
    camera.getWorldDirection(vF);
    P.flashDir.lerp(vF, 1 - Math.exp(-dt * 13)).normalize();
    if (P.flashOn && P.busyKind !== 'battery') P.battery = Math.max(0, P.battery - dt / 300);
    let target = P.flashOn && P.battery > 0 && P.busyKind !== 'battery' ? (P.battery > 0.25 ? 1 : 0.35 + P.battery * 2.6) : 0;
    // tremula com pilha fraca e perto da entidade (interferência)
    flickT -= dt;
    if (flickT <= 0) {
      flickT = 1 / 15;
      P.flashFlick = 1;
      if (P.battery < 0.15 && Math.random() < 0.1) P.flashFlick = U.rand(0, 0.4);
      const md = brain.dist;
      if (md < 9 && brain.state !== 'dormant' && Math.random() < (1 - md / 9) * 0.35) P.flashFlick = U.rand(0, 0.5);
    }
    target *= P.flashFlick;
    P.flashI = U.damp(P.flashI, target, 25, dt);
    if (P.flashOn && P.battery <= 0 && !updateFlashlight.warned) { updateFlashlight.warned = true; toast('A lanterna apagou. [R] para trocar as pilhas.'); }
    if (P.battery > 0) updateFlashlight.warned = false;

    vR.set(1, 0, 0).applyQuaternion(camera.quaternion);
    vT.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const fp = uni.uFlashPos.value.copy(camera.position).addScaledVector(vR, 0.16).addScaledVector(vT, -0.17).addScaledVector(vF, 0.42); // à frente da lente: o feixe não ilumina o próprio modelo
    uni.uFlashDir.value.copy(P.flashDir);
    uni.uFlashI.value = P.flashI * 2.3;
    // modelo na mão segue o atraso do feixe
    const inv = camera.quaternion.clone().invert();
    const ld = P.flashDir.clone().applyQuaternion(inv);
    flashModel.rotation.set(Math.asin(U.clamp(ld.y, -1, 1)), Math.atan2(-ld.x, -ld.z), 0);
    const reloading = P.busyKind === 'battery' ? Math.sin(Math.min(1, (1.4 - P.busy) / 1.4) * Math.PI) : 0;
    const drinking = P.busyKind === 'drink' ? 1 : 0;
    flashModel.position.set(0.17 + Math.sin(P.bobPhase) * 0.008, -0.19 + Math.sin(P.bobPhase * 2) * 0.006 - reloading * 0.15 - drinking * 0.12, -0.3);
    PM.lens.uniforms.uEmissive.value = 1 + P.flashI * 18;
    // feixe volumétrico
    beam.position.copy(fp);
    beam.quaternion.setFromUnitVectors(vUp, P.flashDir);
    beam.material.uniforms.uI.value = P.flashI * 0.045 * (0.4 + 0.6 * BR.Settings.fx);
    dust.material.uniforms.uCam.value.copy(camera.position);
  }

  // ==========================================================
  //  LUZES, ENERGIA E ATMOSFERA
  // ==========================================================
  let fa = 1, fb = 1, faT = 0, fbT = 0, monT = 0;
  function updateLights(dt) {
    faT -= dt; fbT -= dt;
    if (faT <= 0) { fa = Math.random() < 0.82 ? 1 : U.rand(0, 0.3); faT = fa === 1 ? U.rand(0.05, 1.5) : U.rand(0.03, 0.15); }
    if (fbT <= 0) { fb = Math.random() < 0.75 ? 1 : U.rand(0, 0.25); fbT = fb === 1 ? U.rand(0.05, 2) : U.rand(0.03, 0.2); }
    flickA = U.damp(flickA, fa, 40, dt); flickB = U.damp(flickB, fb, 40, dt);
    let pw = power;
    if (blackoutT > 0) {
      blackoutT -= dt;
      pw = blackoutT > 0.6 ? 0.03 : (Math.random() < 0.5 ? 0.1 : 1);
    }
    uni.uFlick.value.set(pw, pw * flickA, pw * flickB, pw);
    // oscilação em volta da entidade
    monT -= dt;
    if (monT <= 0) {
      monT = 1 / 14;
      const s = brain.flickerStrength();
      monFlick = s * (Math.random() < 0.35 ? U.rand(0.5, 1) : U.rand(0, 0.12));
      if (s > 0.4 && brain.dist < 12 && Math.random() < 0.06) {
        const lp = world.nearestLamp(brain.pos.x, brain.pos.z, 6, true);
        if (lp) A.crackle(lp.x, world.CEIL - 0.1, lp.z);
      }
    }
    uni.uMonster.value.set(brain.pos.x, 0, brain.pos.z, monFlick);
    uni.uGlitch.value = brain.glitch();
    const light = world.lightAt(P.x, P.z);
    A.setHum(Math.min(1.3, light) * pw, 1 - monFlick * 0.6);
  }

  // ==========================================================
  //  PERCEPÇÃO DO JOGADOR / MEDO / SANIDADE
  // ==========================================================
  function checkSeesMonster() {
    const st = brain.state;
    if (st === 'dormant') { playerSeesMonster = false; return; }
    const hx = brain.pos.x, hz = brain.pos.z, hy = st === 'chase' ? 1.4 : 2.1;
    const dx = hx - camera.position.x, dy = hy - camera.position.y, dz = hz - camera.position.z;
    const d = Math.hypot(dx, dy, dz);
    camera.getWorldDirection(vF);
    const dot = (dx * vF.x + dy * vF.y + dz * vF.z) / d;
    const inView = dot > Math.cos(((camera.fov * camera.aspect) / 2) * (Math.PI / 180) * 0.8) || dot > 0.8;
    if (!inView || d > 40 || !brain.hasLOS) { playerSeesMonster = false; return; }
    const lit = world.lightAt(hx, hz) * (1 - monFlick) > 0.15;
    const fdot = (dx * P.flashDir.x + dy * P.flashDir.y + dz * P.flashDir.z) / d;
    const flashed = P.flashI > 0.15 && fdot > 0.9 && d < 18;
    playerSeesMonster = lit || flashed || d < 4;
  }

  function updateFearSanity(dt) {
    const md = brain.dist, st = brain.state;
    let f = 0;
    if (st !== 'dormant') f = Math.max(0, 1 - md / 16) * 0.6;
    if (st === 'chase') f = Math.max(f, 0.55 + Math.max(0, 1 - md / 20) * 0.45);
    if (playerSeesMonster) f = Math.max(f, 0.75);
    P.fear = U.damp(P.fear, f, f > P.fear ? 3 : 0.4, dt);

    sawMonsterCool -= dt;
    if (playerSeesMonster && sawMonsterCool <= 0) {
      sawMonsterCool = 25;
      if (st !== 'chase') A.stinger();
      P.sanity -= 0.06;
      shake(0.2);
    }
    const light = world.lightAt(P.x, P.z);
    const dark = light < 0.12 && P.flashI < 0.1;
    let ds = -0.0016;
    if (dark) ds -= 0.007;
    if (playerSeesMonster) ds -= 0.03;
    if (st === 'chase') ds -= 0.01;
    if (light > 0.5 && !dark) ds += 0.002;
    if (blackoutT > 0) ds -= 0.01;
    P.sanity = U.clamp(P.sanity + ds * dt, 0, 1);

    // coração
    const hr = Math.max(P.fear, P.holding ? 0.45 : 0);
    if (hr > 0.15) {
      P.heartT -= dt;
      if (P.heartT <= 0) { A.heartbeat(Math.min(1, hr * 1.2)); P.heartT = U.lerp(1.1, 0.4, hr); }
    }
  }

  // ==========================================================
  //  ALUCINAÇÕES E EVENTOS AMBIENTES
  // ==========================================================
  let ghostT = 0, ghostSeenT = 0;
  function hallucinations(dt) {
    const s = P.sanity;
    whisperT -= dt;
    if (s < 0.6 && whisperT <= 0) {
      whisperT = U.rand(8, 22) * (0.4 + s);
      const ang = P.yaw + U.rand(2.2, 4.0);
      A.whisper(P.x - Math.sin(ang) * 1.4, P.y, P.z - Math.cos(ang) * 1.4);
      if (s < 0.4 && Math.random() < 0.4) {
        const back = P.yaw + Math.PI;
        setTimeout(() => A.monsterStep(P.x - Math.sin(back) * -3, P.z - Math.cos(back) * -3, 0.5, false), 600);
      }
    }
    // figura falsa no fim do corredor
    if (ghost.root.visible) {
      ghostT += dt;
      ghost.update(dt, { speed: 0, look: camera.position, jerky: 1, agitation: 0.6, eyeGlow: 0.6 });
      const gx = ghost.root.position.x, gz = ghost.root.position.z;
      const d = Math.hypot(gx - P.x, gz - P.z);
      camera.getWorldDirection(vF);
      const dot = ((gx - P.x) * vF.x + (gz - P.z) * vF.z) / d;
      if (dot > 0.6) ghostSeenT += dt;
      const flashed = P.flashI > 0.3 && ((gx - P.x) * P.flashDir.x + (gz - P.z) * P.flashDir.z) / d > 0.93;
      if (d < 7 || ghostT > 5 || flashed || (ghostSeenT > 0.4 && dot < 0.3)) {
        ghost.root.visible = false; A.glitch(0.8); glitchPulse = 0.6;
        P.sanity = Math.max(0, P.sanity - 0.03);
      }
      return;
    }
    halluT -= dt;
    if (s < 0.42 && halluT <= 0) {
      halluT = U.rand(25, 50) * (0.5 + s);
      camera.getWorldDirection(vF);
      const fx = vF.x, fz = vF.z, fl = Math.hypot(fx, fz) || 1;
      for (let dd = 18; dd > 9; dd -= 1.2) {
        const gx = P.x + (fx / fl) * dd, gz = P.z + (fz / fl) * dd;
        if (world.solidAt(gx, gz) || !world.los(P.x, P.z, gx, gz)) continue;
        ghost.root.position.set(gx, 0, gz);
        ghost.root.rotation.y = Math.atan2(P.x - gx, P.z - gz);
        ghost.root.visible = true; ghostT = 0; ghostSeenT = 0;
        break;
      }
    }
  }

  function ambientEvents(dt) {
    eventT -= dt;
    if (eventT > 0) return;
    eventT = U.rand(16, 36);
    const far = (minD, maxD) => {
      for (let k = 0; k < 30; k++) {
        const i = U.pick(world.open);
        const d = distField ? distField[i] : 20;
        if (d > minD && d < maxD) return world.center(i);
      }
      return null;
    };
    const r = Math.random();
    if (r < 0.2) { const c = far(10, 30); if (c) A.knock(c.x, 1.2, c.z, U.randInt(2, 4)); }
    else if (r < 0.32) { const c = far(20, 45); if (c) A.doorSlam(c.x, 1.2, c.z); }
    else if (r < 0.42 && !ambientEvents.phone) { const c = far(18, 40); if (c) { ambientEvents.phone = true; A.phone(c.x, 1, c.z); } }
    else if (r < 0.55) { const a = far(18, 35), b = far(18, 35); if (a && b) A.distantRun(a.x, a.z, b.x, b.z); }
    else if (r < 0.68) { const c = far(8, 25); if (c) A.creak(c.x, 3, c.z); }
    else if (r < 0.8) { power = power * 0.4; setTimeout(() => { power = generatorObj && generatorObj.running ? 1.25 : 1; }, U.rand(200, 700)); A.glitch(0.4); }
    else { const c = far(3, 10); if (c) for (let k = 0; k < 5; k++) setTimeout(() => A.drip(c.x, 2.5, c.z), k * U.rand(500, 900)); }
  }

  // ==========================================================
  //  OBJETOS DINÂMICOS
  // ==========================================================
  function updateObjects(dt) {
    // garrafas arremessadas
    for (let k = bottles.length - 1; k >= 0; k--) {
      const b = bottles[k];
      b.life += dt;
      b.vy -= 9.8 * dt;
      let nx = b.x + b.vx * dt, nz = b.z + b.vz * dt, ny = b.y + b.vy * dt;
      let impact = false;
      if (world.solidAt(nx, b.z)) { b.vx *= -0.35; nx = b.x; impact = true; }
      if (world.solidAt(b.x, nz)) { b.vz *= -0.35; nz = b.z; impact = true; }
      if (ny > world.CEIL - 0.1) { b.vy = -Math.abs(b.vy) * 0.3; ny = world.CEIL - 0.1; impact = true; }
      if (ny < 0.04) {
        ny = 0.04;
        if (Math.abs(b.vy) > 1.2) impact = true;
        b.vy = Math.abs(b.vy) * 0.28; b.vx *= 0.55; b.vz *= 0.55;
      }
      b.x = nx; b.y = ny; b.z = nz;
      if (impact) {
        A.bottleImpact(b.x, b.y, b.z, b.hit ? 0.5 : 1);
        if (!b.hit) { b.hit = true; noise(b.x, b.z, 24, 'bottle', { origin: b.origin }); }
      }
      b.mesh.position.set(b.x, b.y, b.z);
      b.mesh.rotation.x += b.spin * dt; b.mesh.rotation.z += b.spin * 0.7 * dt;
      const sp = Math.hypot(b.vx, b.vy, b.vz);
      if ((ny <= 0.05 && sp < 0.6) || b.life > 6) {
        world.group.remove(b.mesh);
        bottles.splice(k, 1);
        spawnPickup('bottle', b.x, b.z);
      }
    }
    // a entidade esbarra nos objetos
    bumpCool -= dt;
    for (const o of objects) {
      if (o.kind !== 'prop') continue;
      const dx = o.x - brain.pos.x, dz = o.z - brain.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.55 + o.r * 0.5 && d > 1e-3) {
        const p = { x: o.x + (dx / d) * 0.5, z: o.z + (dz / d) * 0.5 };
        world.collide(p, o.r * 0.8);
        o.x = p.x; o.z = p.z;
        o.mesh.position.x = o.x; o.mesh.position.z = o.z;
        o.mesh.rotation.y += U.rand(-0.6, 0.6);
        if (bumpCool <= 0) { bumpCool = 0.6; A.bump(o.x, 0.3, o.z); }
      }
    }
    // porta abrindo / LEDs
    if (exitObj && exitObj.opening) { exitObj.open = Math.min(1, exitObj.open + dt * 1.6); exitObj.mesh.userData.hinge.rotation.y = -exitObj.open * 1.4; }
    if (exitPowered) uni.uPoint.value.set(exitObj.x + exitObj.nx * 0.5, 2.4, exitObj.z + exitObj.nz * 0.5, 1.2 + Math.sin(time * 3) * 0.15);
    else uni.uPoint.value.set(0, -100, 0, 0);
  }

  // ==========================================================
  //  INTERAÇÃO
  // ==========================================================
  function findInteract() {
    camera.getWorldDirection(vF);
    const cp = camera.position;
    let best = null, bs = -1e9;
    for (const o of objects) {
      if (!o.use) continue;
      const ox = o.ix != null ? o.ix : o.x, oz = o.iz != null ? o.iz : o.z, oy = o.y != null ? o.y : 0.5;
      const dx = ox - cp.x, dy = oy - cp.y, dz = oz - cp.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > (o.reach || 2)) continue;
      const dot = (dx * vF.x + dy * vF.y + dz * vF.z) / d;
      if (dot < (d < 1.1 ? 0.55 : 0.84)) continue;
      if (!world.los(P.x, P.z, ox, oz)) continue;
      const s = dot - d * 0.12;
      if (s > bs) { bs = s; best = o; }
    }
    return best;
  }

  // ==========================================================
  //  JUMPSCARE / MORTE / TRANSIÇÃO / VITÓRIA
  // ==========================================================
  let glitchPulse = 0, redPulse = 0;
  function onCaught() {
    if (state !== 'playing') return;
    state = 'caught'; stats.deaths++; scareT = 0;
    brain.frozen = true;
    closeNote(); mapOpen = false; ui.map.classList.remove('show');
    showHUD(false);
    A.jumpscare();
    if (brain.voice) brain.voice.set(brain.pos.x, 2, brain.pos.z, 0, 1, 0);
    // a entidade surge na sua frente, na altura do rosto
    camera.getWorldDirection(vF);
    const fl = Math.hypot(vF.x, vF.z) || 1;
    const fx = vF.x / fl, fz = vF.z / fl;
    entity.root.position.set(P.x + fx * 0.75, 0, P.z + fz * 0.75);
    entity.root.rotation.y = Math.atan2(-fx, -fz);
    P.flashOn = true; P.flashFlick = 1;
    updateCaught(0.001); // já encaixa o rosto no primeiro quadro
  }
  function updateCaught(dt) {
    scareT += dt;
    entity.update(dt, { speed: 0, crawl: 0, look: camera.position, mouth: 1, lunge: 1, agitation: 1, jerky: 0.8, eyeGlow: 2.5 });
    // encaixa o ROSTO no centro da visão (independente da pose): avança de 0,9 m até 0,32 m
    camera.getWorldDirection(vF);
    const reach = U.lerp(0.9, 0.32, Math.min(1, scareT * 3.5));
    vT.copy(camera.position).addScaledVector(vF, reach);
    vT.y -= 0.12;
    entity.root.updateMatrixWorld(true);
    entity.head.getWorldPosition(vR);
    entity.root.position.add(vT.sub(vR));
    shake(1);
    glitchPulse = 1 - Math.min(1, scareT / 1.4); redPulse = 0.5;
    P.flashI = 2.0 * (Math.random() < 0.7 ? 1 : 0.2);
    if (scareT > 1.25 && !updateCaught.shown) {
      updateCaught.shown = true;
      const subs = ['respirando fundo... acordando de novo no mesmo lugar...', 'ela lembra de você agora.', 'o carpete está úmido. sempre esteve.', 'a luz zumbe. você está de volta.'];
      ui.caughtSub.textContent = U.pick(subs);
      ui.caught.classList.add('show');
    }
    if (scareT > 4.2) {
      updateCaught.shown = false;
      ui.caught.classList.remove('show');
      placePlayerAtStart();
      P.sanity = Math.max(P.sanity, 0.6); P.fear = 0;
      brain.respawnFar();
      entity.root.position.y = 0;
      redPulse = 0;
      state = document.pointerLockElement === document.body || noLock ? 'playing' : 'paused';
      if (state === 'paused') ui.pause.classList.add('show'); else showHUD(true);
      toast('Você acordou de novo onde tudo começou.');
    }
  }

  function reachExit() {
    if (state !== 'playing') return;
    if (levelIndex < LEVELS.length - 1) {
      state = 'transition';
      ui.fade.style.opacity = '1';
      A.fall(); A.fadeBus(0.15, 0.4);
      setTimeout(() => {
        buildLevel(levelIndex + 1);
        A.fadeBus(1, 1.5);
        state = document.pointerLockElement === document.body || noLock ? 'playing' : 'paused';
        if (state === 'paused') ui.pause.classList.add('show');
        setTimeout(() => { ui.fade.style.opacity = '0'; }, 400);
      }, 2200);
    } else triggerWin();
  }

  function triggerWin() {
    state = 'won';
    try { document.exitPointerLock(); } catch (e) { /* ok */ }
    showHUD(false);
    A.fadeBus(0, 1.5);
    ui.fade.style.opacity = '1';
    const mm = Math.floor(stats.time / 60), ss = Math.floor(stats.time % 60);
    ui.winStats.innerHTML =
      '<div><b>' + mm + 'min ' + ss + 's</b><span>tempo nos Fundos</span></div>' +
      '<div><b>' + Math.round(stats.dist) + ' m</b><span>caminhados</span></div>' +
      '<div><b>' + stats.deaths + '</b><span>vezes encontrado</span></div>' +
      '<div><b>' + stats.notes + '</b><span>bilhetes lidos</span></div>' +
      '<div><b>' + Math.round(brain.mem.skepticism * 100) + '%</b><span>ceticismo dela com garrafas</span></div>' +
      '<div><b>' + Math.round(brain.mem.flinchTol * 100) + '%</b><span>tolerância dela à lanterna</span></div>';
    setTimeout(() => {
      ui.win.style.display = 'flex';
      ui.fade.style.opacity = '0';
      setTimeout(() => ui.win.classList.add('show'), 200);
    }, 1500);
  }

  // ==========================================================
  //  MAPA (exploração desenhada à mão)
  // ==========================================================
  function revealMap() {
    const w = world, T = w.T, R = 7;
    const tx0 = Math.floor((P.x - R) / T), tx1 = Math.floor((P.x + R) / T);
    const tz0 = Math.floor((P.z - R) / T), tz1 = Math.floor((P.z + R) / T);
    for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
      if (tx < 0 || tz < 0 || tx >= w.N || tz >= w.N) continue;
      const i = w.idx(tx, tz);
      if (explored[i]) continue;
      const cx = (tx + 0.5) * T, cz = (tz + 0.5) * T;
      if (Math.hypot(cx - P.x, cz - P.z) > R) continue;
      if (w.isSolid(tx, tz)) {
        // paredes: revela se algum vizinho livre está visível
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ax = cx + dx * T, az = cz + dz * T;
          if (!w.solidAt(ax, az) && w.los(P.x, P.z, ax, az)) { explored[i] = 1; break; }
        }
      } else if (w.los(P.x, P.z, cx, cz)) explored[i] = 1;
    }
    for (const o of objects) {
      if (!o.mapIcon || o.discovered) continue;
      const ox = o.ix != null ? o.ix : o.x, oz = o.iz != null ? o.iz : o.z;
      if (Math.hypot(ox - P.x, oz - P.z) < 11 && w.los(P.x, P.z, ox, oz)) o.discovered = true;
    }
  }
  function drawMap() {
    const cv = ui.mapCanvas, w = world, N = w.N;
    const S = Math.min(innerWidth, innerHeight) * 0.78;
    if (cv.width !== Math.round(S)) { cv.width = cv.height = Math.round(S); }
    const x = cv.getContext('2d'), cs = S / N;
    x.fillStyle = '#d7cca7'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 250; i++) { x.fillStyle = 'rgba(120,95,40,' + Math.random() * 0.05 + ')'; x.fillRect(Math.random() * S, Math.random() * S, 3, 3); }
    for (let z = 0; z < N; z++) for (let xx = 0; xx < N; xx++) {
      const i = z * N + xx;
      if (!explored[i]) continue;
      if (w.grid[i] === 0) { x.fillStyle = 'rgba(250,245,225,0.75)'; x.fillRect(xx * cs, z * cs, cs + 0.5, cs + 0.5); }
    }
    x.fillStyle = 'rgba(40,32,20,0.85)';
    for (let z = 0; z < N; z++) for (let xx = 0; xx < N; xx++) {
      const i = z * N + xx;
      if (explored[i] && w.grid[i] !== 0) x.fillRect(xx * cs + cs * 0.1, z * cs + cs * 0.1, cs * 0.8, cs * 0.8);
    }
    const icon = (ox, oz, txt, col) => {
      x.fillStyle = col; x.font = 'bold ' + Math.max(11, cs * 1.4) + 'px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(txt, (ox / w.T) * cs, (oz / w.T) * cs);
    };
    for (const o of objects) {
      if (!o.discovered) continue;
      const ox = o.ix != null ? o.ix : o.x, oz = o.iz != null ? o.iz : o.z;
      if (o.kind === 'breaker') icon(ox, oz, o.on ? '✓' : '⚡', o.on ? '#2a6a2a' : '#a02020');
      if (o.kind === 'exit') icon(ox, oz, exitPowered ? '▣ SAÍDA' : '▣', exitPowered ? '#1a7a30' : '#555');
      if (o.kind === 'generator') icon(ox, oz, '⚙', o.running ? '#2a6a2a' : '#a02020');
      if (o.kind === 'fuse') icon(ox, oz, '◆', '#a06010');
    }
    if (debug) { // modo "pensamento": mostra a entidade e o caminho dela
      x.strokeStyle = 'rgba(200,0,0,0.7)'; x.lineWidth = 2;
      if (brain.path) {
        x.beginPath();
        brain.path.forEach((p, k) => { const px = (p.x / w.T) * cs, pz = (p.z / w.T) * cs; k ? x.lineTo(px, pz) : x.moveTo(px, pz); });
        x.stroke();
      }
      icon(brain.pos.x, brain.pos.z, '☻', '#c00');
    }
    // jogador
    const px = (P.x / w.T) * cs, pz = (P.z / w.T) * cs;
    x.save(); x.translate(px, pz); x.rotate(-P.yaw + Math.PI);
    x.fillStyle = '#1b3a8a';
    x.beginPath(); x.moveTo(0, cs * 1.3); x.lineTo(cs * 0.75, -cs * 0.8); x.lineTo(-cs * 0.75, -cs * 0.8); x.closePath(); x.fill();
    x.restore();
    x.strokeStyle = 'rgba(60,45,20,0.6)'; x.lineWidth = 6; x.strokeRect(3, 3, S - 6, S - 6);
  }

  // ==========================================================
  //  HUD
  // ==========================================================
  function toast(t, dur) {
    ui.toast.textContent = t;
    ui.toast.classList.add('show');
    toastT = dur || 3.5;
  }
  function updateHUD(dt) {
    ui.stamina.style.width = (P.stamina * 100).toFixed(1) + '%';
    ui.stamina.classList.toggle('low', P.exhausted || P.stamina < 0.25);
    ui.breathWrap.style.opacity = P.breath < 0.999 ? 1 : 0;
    ui.breath.style.width = (P.breath * 100).toFixed(1) + '%';
    ui.sanity.style.width = (P.sanity * 100).toFixed(1) + '%';
    ui.sanity.classList.toggle('low', P.sanity < 0.3);
    ui.battery.style.width = (P.battery * 100).toFixed(0) + '%';
    ui.battery.classList.toggle('low', P.battery < 0.2);
    ui.batteryPct.textContent = P.busyKind === 'battery' ? 'trocando...' : Math.round(P.battery * 100) + '%' + (P.flashOn ? '' : ' (desl.)');
    const invHTML = '<span>PILHAS <b>' + P.inv.battery + '</b></span><span>ÁGUA <b>' + P.inv.almond + '</b></span><span>GARRAFAS <b>' + P.inv.empty + '</b></span>' +
      (theme.objective === 'fuses' ? '<span>FUSÍVEIS <b>' + P.inv.fuses + '</b></span>' : '');
    if (invHTML !== updateHUD.inv) { updateHUD.inv = invHTML; ui.inv.innerHTML = invHTML; } // evita relayout a cada quadro
    const mm = Math.floor(stats.time / 60), ss = Math.floor(stats.time % 60);
    const rt = '00:' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
    if (rt !== updateHUD.rt) { updateHUD.rt = rt; ui.recTime.textContent = rt; }

    if (toastT > 0) { toastT -= dt; if (toastT <= 0) ui.toast.classList.remove('show'); }
    if (levelTitleT > 0) { levelTitleT -= dt; if (levelTitleT <= 0) ui.levelTitle.classList.remove('show'); }
    if (hintQueue.length) {
      hintT -= dt;
      if (hintT <= 0) { toast(hintQueue.shift(), 3.6); hintT = 4.2; }
    }
    // dica de interação
    interactTarget = findInteract();
    if (interactTarget && !readingNote) {
      ui.prompt.textContent = interactTarget.prompt();
      ui.prompt.style.display = 'block';
    } else ui.prompt.style.display = readingNote ? 'block' : 'none';
    if (readingNote) ui.prompt.textContent = '[E] Fechar bilhete';

    if (debug) {
      const b = brain;
      ui.debug.innerHTML =
        '<b>ENTIDADE — ' + b.label() + '</b>' +
        '<div class="row">consciência <i style="width:' + Math.min(100, b.awareness * 83) + '%"></i></div>' +
        '<div class="row">agressividade <i style="width:' + b.aggression * 100 + '%"></i></div>' +
        '<div class="row">ceticismo (garrafas) <i style="width:' + b.mem.skepticism * 100 + '%"></i></div>' +
        '<div class="row">tolerância à luz <i style="width:' + b.mem.flinchTol * 100 + '%"></i></div>' +
        '<div class="kv">distância ' + b.dist.toFixed(1) + ' m · ' + (b.hasLOS ? 'linha de visão' : 'sem visão') + (b.flanking ? ' · flanqueando' : '') + '</div>' +
        '<div class="kv">esconderijos lembrados: ' + b.mem.hideFound.length + ' · lâmpadas p/ quebrar: ' + b.lampBudget + '</div>' +
        '<div class="th">' + b.thoughts.map((t, k) => '<p style="opacity:' + (1 - k * 0.15) + '">“' + t.txt + '”</p>').join('') + '</div>';
    }
  }

  // ==========================================================
  //  OCLUSÃO SONORA
  // ==========================================================
  function occlusion(x, z) {
    if (!world) return 0;
    if (world.los(P.x, P.z, x, z)) return 0;
    if (!distField) return 0.7;
    const pd = distField[world.tileOf(x, z)];
    if (!(pd < Infinity)) return 1;
    const eu = Math.hypot(x - P.x, z - P.z);
    return U.clamp(0.35 + (pd - eu) / 10, 0.35, 1);
  }

  // ==========================================================
  //  LAÇO PRINCIPAL
  // ==========================================================
  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    let dt = (now - prevT) / 1000; prevT = now;
    if (dt > 0.05) dt = 0.05;
    if (state === 'playing' || state === 'caught' || state === 'transition') time += dt;
    uni.uTime.value = time;

    if (state === 'playing') {
      stats.time += dt;
      updatePlayer(dt);
      updateFlashlight(dt);
      updateLights(dt);
      dfTimer -= dt;
      if (dfTimer <= 0) { dfTimer = 0.25; distField = world.distField(world.tileOf(P.x, P.z), 70); }
      brain.update(dt);
      checkSeesMonster();
      updateFearSanity(dt);
      hallucinations(dt);
      ambientEvents(dt);
      updateObjects(dt);
      revealTimer -= dt;
      if (revealTimer <= 0) { revealTimer = 0.25; revealMap(); if (mapOpen) drawMap(); }
      updateAudio();
      updateHUD(dt);
    } else if (state === 'caught') {
      updateCaught(dt);
      updateFlashlight(dt);
      updateLights(dt);
    } else if (state === 'menu' || state === 'transition' || state === 'paused') {
      // câmera respirando no menu
      if (world) {
        camera.position.set(P.x, P.y + Math.sin(now * 0.0008) * 0.01, P.z);
        camera.rotation.set(P.pitch, P.yaw + Math.sin(now * 0.0003) * 0.02, 0, 'YXZ');
        updateFlashlight(dt);
        updateLights(dt);
        if (state === 'menu') { brain.e.root.position.set(brain.pos.x, 0, brain.pos.z); }
      }
    }

    // pós-processamento
    shakeAmt = Math.max(0, shakeAmt - dt * 1.8);
    glitchPulse = Math.max(0, glitchPulse - dt * 1.5);
    const fx = BR.Settings.fx, pu = post.u, s = P.sanity;
    pu.uTime.value = time;
    pu.uGrain.value = (0.045 + (1 - s) * 0.05 + P.fear * 0.03) * (0.3 + 0.7 * fx);
    pu.uVignette.value = 0.55 + P.fear * 0.3;
    pu.uAberr.value = (0.5 + P.fear * 1.6 + (1 - s) * 1.2) * fx;
    pu.uWave.value = Math.max(0, 0.45 - s) * 2.2 * fx;
    pu.uDouble.value = Math.max(0, 0.25 - s) * 3 * fx;
    const near = brain && brain.state !== 'dormant' ? Math.max(0, 1 - brain.dist / 7) : 0;
    pu.uStatic.value = (near * 0.12 + glitchPulse * 0.25) * fx;
    pu.uGlitch.value = Math.min(1, glitchPulse + near * 0.15 + (state === 'transition' ? 0.6 : 0)) * fx;
    pu.uDesat.value = Math.max(0, 0.6 - s) * 0.9;
    pu.uRed.value = redPulse;
    pu.uScan.value = 0.35 * fx;
    pu.uBright.value = BR.Settings.brightness;
    pu.uTunnel.value = P.holding ? 0.6 * (1 - P.breath * 0.5) : 0;
    pu.uBloom.value = 0.7;
    pu.uLens.value = 1;
    uni.uExposure.value = 1.0;
    uni.uBreath.value = Math.max(0, 0.5 - s) * 2;
    post.render(scene, camera);
  }

  function updateAudio() {
    camera.getWorldDirection(vF);
    A.setListener(camera.position.x, camera.position.y, camera.position.z, vF.x, vF.y, vF.z);
    if (radio && radio.on) radio.update(occlusion(radio.obj.x, radio.obj.z));
    for (const h of hums) h.update(occlusion(h.ch.x, h.ch.z));
    if (exitHum) exitHum.update(occlusion(exitHum.ch.x, exitHum.ch.z));
    if (generatorSnd) generatorSnd.update(occlusion(generatorSnd.ch.x, generatorSnd.ch.z));
  }

  // ==========================================================
  //  API usada pelo cérebro da entidade
  // ==========================================================
  const api = {
    get world() { return world; },
    get player() { return P; },
    get distField() { return distField; },
    get trailSet() { return trailSet; },
    get playerSeesMonster() { return playerSeesMonster; },
    get radio() { return radio; },
    takeNoises() { const n = noises; noises = []; return n; },
    occlusion,
    pendingObjectives,
    smashRadio,
    onCaught,
    onChaseStart() { A.stinger(); shake(0.3); glitchPulse = 0.4; },
    onLampBroken() { shake(0.1); },
    onMonsterShift() { /* reposicionada pelo diretor — invisível para o jogador */ },
  };

  function revealMenu() {
    ui.startMenu.style.display = 'block';
    const b = ui.startMenu.querySelector('.blink');
    if (b) b.textContent = '▶ CLIQUE PARA ACORDAR';
    if (!loopStarted) { loopStarted = true; prevT = performance.now(); animate(); }
  }

  // ganchos de inspeção (úteis para depurar pelo console do navegador)
  const inspect = {
    get state() { return state; }, get player() { return P; }, get brain() { return brain; }, get world() { return world; },
    get objects() { return objects; }, get camera() { return camera; },
    start() { A.init(); A.startAmbience(theme.ambience); if (!brain.voice) brain.voice = A.monsterVoice(); noLock = true; enterPlaying(); },
    level(i) { buildLevel(i); },
    noise(x, z, r, kind, extra) { noise(x, z, r, kind, extra); },
    refreshField() { distField = world.distField(world.tileOf(P.x, P.z), 70); trailSet = new Set(trail); },
  };

  return { init, revealMenu, inspect };
})();
