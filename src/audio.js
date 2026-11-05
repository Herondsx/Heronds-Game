/* ============================================================
   THE BACKROOMS — motor de áudio (Web Audio, 100% procedural)
   ------------------------------------------------------------
   * Áudio 3D com HRTF (PannerNode) — use fones de ouvido.
   * Oclusão: sons atrás de paredes passam por um passa-baixa
     calculado a partir do caminho real pelo labirinto.
   * Reverb de "sala vazia" gerado por convolução (IR sintética).
   * Todos os efeitos são sintetizados: passos no carpete úmido,
     respiração, coração, cliques e grito da entidade, estouro
     de lâmpada, batidas na parede, telefone antigo tocando...
   * O rádio toca as músicas da pasta Assets de forma posicional
     (um alto-falante velho em algum lugar do nível).
   ============================================================ */
(function (BR) {
  'use strict';
  const U = BR.U;

  const A = (BR.Audio = {
    ctx: null,
    listener: { x: 0, y: 0, z: 0 },
    occluder: null, // função (x, z) -> 0..1 definida pelo jogo
  });

  // ----------------------------------------------------------
  //  Inicialização
  // ----------------------------------------------------------
  A.init = function () {
    if (A.ctx) { A.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (A.ctx = new AC());

    A.master = ctx.createGain();
    A.master.gain.value = BR.Settings.volume;
    A.comp = ctx.createDynamicsCompressor();
    A.comp.threshold.value = -16; A.comp.knee.value = 18; A.comp.ratio.value = 5;
    A.comp.attack.value = 0.004; A.comp.release.value = 0.3;
    A.master.connect(A.comp); A.comp.connect(ctx.destination);

    // bus do jogo (pode ser silenciado em transições)
    A.bus = ctx.createGain(); A.bus.connect(A.master);

    // reverb
    A.reverb = ctx.createConvolver();
    A.reverb.buffer = makeIR(ctx, 2.6, 2.4);
    A.reverbIn = ctx.createGain();
    const revOut = ctx.createGain(); revOut.gain.value = 0.55;
    A.reverbIn.connect(A.reverb); A.reverb.connect(revOut); revOut.connect(A.bus);

    // buffers de ruído
    const len = ctx.sampleRate * 3;
    A.white = ctx.createBuffer(1, len, ctx.sampleRate);
    A.pink = ctx.createBuffer(1, len, ctx.sampleRate);
    A.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = A.white.getChannelData(0), p = A.pink.getChannelData(0), b = A.brown.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const wh = Math.random() * 2 - 1;
      w[i] = wh;
      b0 = 0.99886 * b0 + wh * 0.0555179; b1 = 0.99332 * b1 + wh * 0.0750759; b2 = 0.969 * b2 + wh * 0.153852;
      b3 = 0.8665 * b3 + wh * 0.3104856; b4 = 0.55 * b4 + wh * 0.5329522; b5 = -0.7616 * b5 - wh * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + wh * 0.5362) * 0.11; b6 = wh * 0.115926;
      last = (last + 0.02 * wh) / 1.02; b[i] = last * 3.5;
    }
  };
  A.resume = function () { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); };
  A.suspend = function () { if (A.ctx && A.ctx.state === 'running') A.ctx.suspend(); };
  A.setVolume = function (v) { if (A.master) A.master.gain.setTargetAtTime(v, A.ctx.currentTime, 0.05); };
  A.fadeBus = function (v, time) { if (A.bus) A.bus.gain.setTargetAtTime(v, A.ctx.currentTime, time || 0.3); };
  A.now = function () { return A.ctx ? A.ctx.currentTime : 0; };

  function makeIR(ctx, seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // primeiras reflexões esparsas + cauda difusa
        const early = i < ctx.sampleRate * 0.08 && Math.random() < 0.01 ? (Math.random() * 2 - 1) * 1.5 : 0;
        d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, decay) + early) * 0.6;
      }
    }
    return buf;
  }

  // ----------------------------------------------------------
  //  Ouvinte e saídas espaciais
  // ----------------------------------------------------------
  A.setListener = function (x, y, z, fx, fy, fz) {
    if (!A.ctx) return;
    A.listener.x = x; A.listener.y = y; A.listener.z = z;
    const L = A.ctx.listener;
    if (L.positionX) {
      L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z;
      L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(x, y, z);
      L.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  };
  function setPannerPos(p, x, y, z) {
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
    else p.setPosition(x, y, z);
  }
  const occFreq = (o) => 19000 * Math.pow(0.03, U.clamp(o, 0, 1));

  // Cria uma cadeia espacial: entrada -> passa-baixa (oclusão) -> panner HRTF -> bus
  //                                         \-> envio de reverb (atenuado pela distância)
  A.spatial = function (x, y, z, o) {
    o = o || {};
    const ctx = A.ctx;
    const p = ctx.createPanner();
    p.panningModel = o.hrtf === false ? 'equalpower' : 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = o.ref || 1.6;
    p.rolloffFactor = o.roll || 1.15;
    p.maxDistance = 200;
    setPannerPos(p, x, y, z);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
    const inG = ctx.createGain();
    const send = ctx.createGain();
    inG.connect(lp); lp.connect(p); p.connect(A.bus);
    lp.connect(send); send.connect(A.reverbIn);
    const ch = {
      input: inG, panner: p, lp, send, rev: o.rev != null ? o.rev : 0.35, ref: p.refDistance, x, y, z,
      setPos(nx, ny, nz) { ch.x = nx; ch.y = ny; ch.z = nz; setPannerPos(p, nx, ny, nz); },
      setOcc(occ) {
        lp.frequency.setTargetAtTime(occFreq(occ), ctx.currentTime, 0.08);
        const dx = ch.x - A.listener.x, dz = ch.z - A.listener.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const att = ch.ref / (ch.ref + 0.9 * Math.max(0, dist - ch.ref));
        send.gain.setTargetAtTime(ch.rev * (0.35 + occ * 0.9) * Math.sqrt(att), ctx.currentTime, 0.1);
      },
      dispose() { try { inG.disconnect(); lp.disconnect(); p.disconnect(); send.disconnect(); } catch (e) { /* ok */ } },
    };
    const occ = o.occ != null ? o.occ : (A.occluder ? A.occluder(x, z) : 0);
    lp.frequency.value = occFreq(occ);
    ch.setOcc(occ);
    return ch;
  };

  // saída de um "disparo" único: espacial (se pos) ou direto no bus
  function out(pos, life, o) {
    if (pos) {
      const ch = A.spatial(pos[0], pos[1], pos[2], o);
      setTimeout(() => ch.dispose(), (life + 0.8) * 1000);
      return ch.input;
    }
    const g = A.ctx.createGain();
    g.connect(A.bus);
    if (o && o.rev) { const s = A.ctx.createGain(); s.gain.value = o.rev; g.connect(s); s.connect(A.reverbIn); }
    setTimeout(() => { try { g.disconnect(); } catch (e) { /* ok */ } }, (life + 0.8) * 1000);
    return g;
  }

  // ----------------------------------------------------------
  //  Blocos de construção
  // ----------------------------------------------------------
  function noise(buf, t, dur, loop) {
    const s = A.ctx.createBufferSource();
    s.buffer = buf || A.white; s.loop = !!loop;
    const off = Math.random() * (s.buffer.duration - (dur || 0) - 0.05);
    s.start(t, Math.max(0, off));
    if (dur) s.stop(t + dur + 0.05);
    return s;
  }
  function osc(type, f, t, dur) {
    const o = A.ctx.createOscillator(); o.type = type; o.frequency.value = f;
    o.start(t); if (dur) o.stop(t + dur + 0.05);
    return o;
  }
  function filt(type, f, q) {
    const b = A.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q;
    return b;
  }
  function env(t, a, peak, d, hold) {
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (hold) g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + (hold || 0) + d);
    return g;
  }
  function chain() {
    for (let i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]);
    return arguments[arguments.length - 1];
  }
  function distCurve(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    const ws = A.ctx.createWaveShaper(); ws.curve = c; ws.oversample = '2x';
    return ws;
  }

  // ----------------------------------------------------------
  //  JOGADOR
  // ----------------------------------------------------------
  // surface: 'carpet' | 'concrete' | 'water' ; kind: 0 agachado, 1 andando, 2 correndo
  A.footstep = function (surface, kind) {
    if (!A.ctx) return;
    const t = A.now(), vol = [0.22, 0.45, 0.8][kind] * U.rand(0.85, 1.12);
    const o = out(null, 0.5);
    const th = osc('sine', U.rand(80, 95), t, 0.2);
    th.frequency.exponentialRampToValueAtTime(42, t + 0.1);
    chain(th, env(t, 0.004, vol * 0.7, 0.13), filt('lowpass', 260), o);
    const n = noise(surface === 'concrete' ? A.white : A.pink, t, 0.3);
    if (surface === 'concrete') {
      chain(n, filt('bandpass', U.rand(1800, 2600), 0.9), env(t, 0.002, vol * 0.45, 0.07), o);
    } else if (surface === 'water') {
      chain(n, filt('bandpass', U.rand(900, 1400), 1.4), env(t, 0.01, vol * 0.7, 0.28), o);
      for (let i = 0; i < 3; i++) {
        const tt = t + 0.03 + Math.random() * 0.15;
        const dr = osc('sine', U.rand(1400, 2600), tt, 0.06);
        dr.frequency.exponentialRampToValueAtTime(700, tt + 0.05);
        chain(dr, env(tt, 0.002, vol * 0.08, 0.05), o);
      }
    } else {
      chain(n, filt('lowpass', U.rand(650, 1000), 0.7), env(t, 0.006, vol * 0.55, 0.16), o);
      if (Math.random() < 0.35) chain(noise(A.white, t + 0.03, 0.08), filt('bandpass', 1700, 7), env(t + 0.03, 0.005, vol * 0.12, 0.05), o);
    }
  };

  A.breath = function (inhale, intensity) {
    if (!A.ctx || intensity <= 0.01) return;
    const t = A.now();
    const dur = inhale ? U.rand(0.35, 0.55) : U.rand(0.45, 0.7);
    const o = out(null, dur + 0.2);
    const bp = filt('bandpass', inhale ? 1300 : 1050, 1.1);
    bp.frequency.linearRampToValueAtTime(inhale ? 1900 : 700, t + dur);
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.11 * intensity, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    chain(noise(A.pink, t, dur + 0.1), bp, g, filt('lowpass', 3200), o);
  };

  A.heartbeat = function (intensity) {
    if (!A.ctx) return;
    const t = A.now(), o = out(null, 0.6);
    [[0, 1], [0.17, 0.7]].forEach(([dt, v]) => {
      const s = osc('sine', 64, t + dt, 0.25);
      s.frequency.exponentialRampToValueAtTime(36, t + dt + 0.13);
      chain(s, env(t + dt, 0.008, 0.55 * v * intensity, 0.2), filt('lowpass', 150), o);
    });
  };

  A.gasp = function () {
    if (!A.ctx) return;
    const t = A.now(), o = out(null, 1.6);
    const bp = filt('bandpass', 1200, 1.4);
    bp.frequency.linearRampToValueAtTime(2300, t + 0.35);
    chain(noise(A.pink, t, 0.6), bp, env(t, 0.03, 0.4, 0.45), o);
    const bp2 = filt('bandpass', 900, 1.1);
    chain(noise(A.pink, t + 0.65, 0.9), bp2, env(t + 0.65, 0.05, 0.2, 0.8), o);
  };

  A.flashClick = function () {
    if (!A.ctx) return;
    const t = A.now(), o = out(null, 0.2);
    chain(osc('square', 3200, t, 0.01), env(t, 0.001, 0.06, 0.008), o);
    chain(osc('square', 1700, t + 0.035, 0.01), env(t + 0.035, 0.001, 0.05, 0.01), o);
  };

  A.pickup = function (kind) {
    if (!A.ctx) return;
    const t = A.now(), o = out(null, 0.8);
    if (kind === 'almond' || kind === 'bottle') {
      const lp = filt('lowpass', 700, 2);
      lp.frequency.linearRampToValueAtTime(300, t + 0.4);
      chain(noise(A.brown, t, 0.5), lp, env(t, 0.05, 0.3, 0.4), o);
    } else if (kind === 'note') {
      A.paper();
    } else {
      for (let i = 0; i < 3; i++) chain(osc('square', U.rand(1800, 2600), t + i * 0.05, 0.01), env(t + i * 0.05, 0.001, 0.05, 0.015), o);
      chain(noise(A.white, t, 0.1), filt('bandpass', 4000, 3), env(t, 0.002, 0.08, 0.06), o);
    }
  };

  A.paper = function () {
    if (!A.ctx) return;
    const t = A.now(), o = out(null, 0.7);
    const g = A.ctx.createGain(); g.gain.value = 0;
    for (let i = 0; i < 14; i++) g.gain.setValueAtTime(Math.random() * 0.16, t + i * 0.03);
    g.gain.setValueAtTime(0, t + 0.45);
    chain(noise(A.white, t, 0.5), filt('highpass', 2500), g, o);
  };

  A.drink = function () {
    if (!A.ctx) return;
    const t = A.now(), o = out(null, 1.6);
    for (let i = 0; i < 3; i++) {
      const tt = t + 0.15 + i * 0.38;
      const s = osc('sine', 150, tt, 0.15);
      s.frequency.exponentialRampToValueAtTime(85, tt + 0.12);
      chain(s, env(tt, 0.01, 0.3, 0.13), o);
      chain(noise(A.brown, tt, 0.2), filt('lowpass', 500), env(tt, 0.02, 0.15, 0.15), o);
    }
  };

  A.whoosh = function () {
    if (!A.ctx) return;
    const t = A.now(), o = out(null, 0.4);
    const bp = filt('bandpass', 400, 1.5);
    bp.frequency.exponentialRampToValueAtTime(1600, t + 0.22);
    chain(noise(A.white, t, 0.3), bp, env(t, 0.06, 0.16, 0.18), o);
  };

  A.ui = function () {
    if (!A.ctx) return;
    const t = A.now(), o = out(null, 0.2);
    chain(osc('sine', 880, t, 0.06), env(t, 0.002, 0.05, 0.05), o);
  };

  A.whisper = function (x, y, z) {
    if (!A.ctx) return;
    const t = A.now(), dur = U.rand(1.0, 1.8);
    const o = out([x, y, z], dur + 0.4, { ref: 1, roll: 1, rev: 0.25, occ: 0 });
    const f1 = filt('bandpass', 700, 6), f2 = filt('bandpass', 2000, 8);
    for (let i = 0; i < dur / 0.09; i++) {
      f1.frequency.setValueAtTime(U.rand(400, 900), t + i * 0.09);
      f2.frequency.setValueAtTime(U.rand(1300, 2900), t + i * 0.09);
    }
    const g = A.ctx.createGain(); g.gain.value = 0;
    let tt = t;
    while (tt < t + dur) { // sílabas
      const syl = U.rand(0.08, 0.2);
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(U.rand(0.12, 0.32), tt + syl * 0.3);
      g.gain.linearRampToValueAtTime(0.0001, tt + syl);
      tt += syl + U.rand(0.02, 0.12);
    }
    const n = noise(A.white, t, dur + 0.1);
    n.connect(f1); n.connect(f2); f1.connect(g); f2.connect(g); g.connect(o);
  };

  A.glitch = function (vol) {
    if (!A.ctx) return;
    const t = A.now(), sr = A.ctx.sampleRate, len = Math.floor(sr * U.rand(0.15, 0.35));
    const buf = A.ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    let hold = 0, v = 0;
    for (let i = 0; i < len; i++) {
      if (hold-- <= 0) { hold = Math.floor(U.rand(8, 300)); v = Math.random() < 0.25 ? 0 : Math.random() * 2 - 1; }
      d[i] = v * (Math.random() < 0.97 ? 1 : 0);
    }
    const s = A.ctx.createBufferSource(); s.buffer = buf; s.start(t);
    const o = out(null, len / sr + 0.1);
    chain(s, filt('bandpass', 2500, 0.4), env(t, 0.003, 0.12 * (vol || 1), len / sr), o);
  };

  A.stinger = function () {
    if (!A.ctx) return;
    const t = A.now(), o = out(null, 2.6, { rev: 0.5 });
    [1180, 1255, 1630, 1720, 2210].forEach((f, i) => {
      const s = osc('sawtooth', f, t, 2.2);
      const vib = osc('sine', 6 + i * 0.7, t, 2.2), vg = A.ctx.createGain(); vg.gain.value = f * 0.012;
      vib.connect(vg); vg.connect(s.frequency);
      s.frequency.linearRampToValueAtTime(f * 1.04, t + 1.8);
      chain(s, filt('bandpass', 2000, 0.8), env(t, 0.06, 0.06, 1.8, 0.2), o);
    });
    const b = osc('sine', 48, t, 1.6); b.frequency.exponentialRampToValueAtTime(28, t + 1.4);
    chain(b, env(t, 0.01, 0.6, 1.4), o);
  };

  A.boom = function () {
    if (!A.ctx) return;
    const t = A.now(), o = out(null, 3, { rev: 0.8 });
    const b = osc('sine', 55, t, 2.5); b.frequency.exponentialRampToValueAtTime(24, t + 2.2);
    chain(b, env(t, 0.01, 0.8, 2.3), o);
    chain(noise(A.brown, t, 1.5), filt('lowpass', 300), env(t, 0.01, 0.6, 1.3), o);
  };

  A.fall = function () {
    if (!A.ctx) return;
    const t = A.now(), o = out(null, 3.2, { rev: 0.6 });
    const bp = filt('bandpass', 3000, 0.7);
    bp.frequency.exponentialRampToValueAtTime(120, t + 2.8);
    chain(noise(A.white, t, 3), bp, env(t, 0.4, 0.35, 2.4), o);
    A.glitch(1.5);
  };

  // ----------------------------------------------------------
  //  ENTIDADE
  // ----------------------------------------------------------
  A.monsterStep = function (x, z, heavy, crawl) {
    if (!A.ctx) return;
    const t = A.now(), o = out([x, 0.2, z], 0.8, { ref: 2.2, roll: 1.05, rev: 0.45 });
    const v = (heavy || 0.8) * U.rand(0.8, 1.1);
    const th = osc('sine', U.rand(55, 70), t, 0.3);
    th.frequency.exponentialRampToValueAtTime(30, t + 0.18);
    chain(th, env(t, 0.004, 0.9 * v, 0.24), o);
    chain(noise(A.brown, t, 0.3), filt('lowpass', 420), env(t, 0.004, 0.6 * v, 0.2), o);
    if (crawl) chain(noise(A.white, t + 0.05, 0.1), filt('bandpass', 1400, 2), env(t + 0.05, 0.002, 0.18 * v, 0.06), o);
    if (Math.random() < 0.3) chain(noise(A.white, t + 0.02, 0.05), filt('highpass', 3000), env(t + 0.02, 0.001, 0.22 * v, 0.02), o);
  };

  // cliques guturais (o som característico da entidade)
  A.clicks = function (x, y, z, n, vol) {
    if (!A.ctx) return;
    const sr = A.ctx.sampleRate, count = n || U.randInt(6, 14);
    let tp = 0.01; const marks = [];
    for (let i = 0; i < count; i++) { marks.push(tp); tp += U.rand(0.03, 0.085) * (1 + i * 0.04); }
    const len = Math.floor(sr * (tp + 0.05));
    const buf = A.ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (const m of marks) {
      const st = Math.floor(m * sr), f = U.rand(1500, 3400), amp = U.rand(0.5, 1);
      for (let j = 0; j < sr * 0.014 && st + j < len; j++) {
        const e = Math.exp(-j / (sr * 0.0022));
        d[st + j] += (Math.sin((2 * Math.PI * f * j) / sr) * 0.7 + (Math.random() - 0.5) * 0.7) * e * amp;
      }
    }
    const t = A.now(), s = A.ctx.createBufferSource(); s.buffer = buf; s.start(t);
    const o = out([x, y, z], tp + 0.2, { ref: 1.6, roll: 1.1, rev: 0.5 });
    const g = A.ctx.createGain(); g.gain.value = 0.55 * (vol || 1);
    chain(s, filt('bandpass', 2300, 0.9), g, o);
  };

  A.screech = function (x, y, z, vol) {
    if (!A.ctx) return;
    const t = A.now(), dur = 1.9;
    const o = out([x, y, z], dur + 0.3, { ref: 3, roll: 0.85, rev: 0.6 });
    const mix = A.ctx.createGain(); mix.gain.value = 0.32 * (vol || 1);
    const ws = distCurve(30);
    const f1 = filt('bandpass', 950, 4), f2 = filt('bandpass', 2500, 5), f3 = filt('bandpass', 3600, 6);
    ws.connect(f1); ws.connect(f2); ws.connect(f3);
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.06);
    g.gain.setValueAtTime(1, t + 1.1); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f1.connect(g); f2.connect(g); f3.connect(g); g.connect(mix); mix.connect(o);
    const base = U.rand(360, 520);
    for (let i = 0; i < 3; i++) {
      const s = osc('sawtooth', base * 0.7, t, dur);
      s.detune.value = (i - 1) * 35;
      s.frequency.linearRampToValueAtTime(base * 1.3, t + 0.22);
      s.frequency.linearRampToValueAtTime(base * 1.05, t + 0.9);
      s.frequency.exponentialRampToValueAtTime(base * 0.45, t + dur);
      s.connect(ws);
    }
    chain(noise(A.white, t, dur), filt('bandpass', 3000, 0.9), env(t, 0.03, 0.5, 1.6), mix);
    const sub = osc('sawtooth', 68, t, dur), am = osc('square', 26, t, dur), amg = A.ctx.createGain();
    amg.gain.value = 0.5; am.connect(amg);
    const subg = A.ctx.createGain(); subg.gain.value = 0.5; amg.connect(subg.gain);
    chain(sub, filt('lowpass', 300), subg, env(t, 0.05, 0.9, 1.6), mix);
  };

  A.growl = function (x, y, z, vol) {
    if (!A.ctx) return;
    const t = A.now(), dur = U.rand(0.9, 1.5);
    const o = out([x, y, z], dur + 0.3, { ref: 2, roll: 1, rev: 0.45 });
    const g = A.ctx.createGain(); g.gain.value = 0.5;
    const am = osc('sine', U.rand(20, 28), t, dur), amg = A.ctx.createGain(); amg.gain.value = 0.5;
    am.connect(amg); amg.connect(g.gain);
    const s1 = osc('sawtooth', U.rand(50, 60), t, dur), s2 = osc('sawtooth', U.rand(61, 70), t, dur);
    const lp = filt('lowpass', 380, 3);
    s1.connect(lp); s2.connect(lp);
    chain(lp, g, env(t, 0.12, 0.8 * (vol || 1), dur - 0.12), o);
  };

  A.sniff = function (x, y, z) {
    if (!A.ctx) return;
    const t = A.now(), o = out([x, y, z], 1.0, { ref: 1.5, roll: 1.2, rev: 0.3 });
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.2;
      chain(noise(A.pink, tt, 0.15), filt('bandpass', 2200, 1.8), env(tt, 0.03, 0.3, 0.1), o);
    }
  };

  // voz contínua da entidade: respiração úmida + ronco grave
  A.monsterVoice = function () {
    if (!A.ctx) return null;
    const ctx = A.ctx, t = A.now();
    const ch = A.spatial(0, 2, 0, { ref: 1.6, roll: 1.25, rev: 0.4 });
    const level = ctx.createGain(); level.gain.value = 0; level.connect(ch.input);
    const amp = ctx.createGain(); amp.gain.value = 0.5; amp.connect(level);
    const lfo = osc('sine', 0.4, t), lfoG = ctx.createGain(); lfoG.gain.value = 0.5;
    lfo.connect(lfoG); lfoG.connect(amp.gain);
    chain(noise(A.pink, t, 0, true), filt('bandpass', 650, 0.9), amp);
    const rat = osc('sawtooth', 70, t), ratG = ctx.createGain(); ratG.gain.value = 0.18;
    chain(rat, filt('lowpass', 240), ratG, amp);
    return {
      ch,
      set(x, y, z, lvl, rate, occ) {
        ch.setPos(x, y, z); ch.setOcc(occ);
        level.gain.setTargetAtTime(lvl, ctx.currentTime, 0.25);
        lfo.frequency.setTargetAtTime(rate, ctx.currentTime, 0.5);
      },
    };
  };

  // ----------------------------------------------------------
  //  AMBIENTE
  // ----------------------------------------------------------
  A.startAmbience = function (kind) {
    if (!A.ctx || A.amb) return;
    const ctx = A.ctx, t = A.now();
    const amb = (A.amb = {});
    // zumbido fluorescente (120 Hz + harmônicos)
    amb.hum = ctx.createGain(); amb.hum.gain.value = 0; amb.hum.connect(A.bus);
    const hb = filt('bandpass', 360, 1.4);
    const h1 = osc('sawtooth', 120, t), h2 = osc('sawtooth', 240.6, t), h3 = osc('square', 60, t);
    const h3g = ctx.createGain(); h3g.gain.value = 0.25;
    h1.connect(hb); h2.connect(hb); h3.connect(h3g); h3g.connect(hb); hb.connect(amb.hum);
    amb.buzz = ctx.createGain(); amb.buzz.gain.value = 0;
    chain(noise(A.white, t, 0, true), filt('bandpass', 7200, 5), amb.buzz, A.bus);
    // tom de sala / ventilação / prédio
    amb.room = ctx.createGain(); amb.room.gain.value = 0.0;
    chain(noise(A.brown, t, 0, true), filt('lowpass', 170), amb.room, A.bus);
    const rumble = osc('sine', 41, t), rg = ctx.createGain(); rg.gain.value = 0.25;
    chain(rumble, rg, amb.room);
    amb.room.gain.linearRampToValueAtTime(kind === 'industrial' ? 0.12 : 0.07, t + 3);
    // maquinário distante (nível 1)
    amb.machine = ctx.createGain(); amb.machine.gain.value = 0;
    const m1 = osc('sawtooth', 47, t), mam = osc('sine', 0.15, t), mamg = ctx.createGain(); mamg.gain.value = 0.5;
    const mg = ctx.createGain(); mg.gain.value = 0.5; mam.connect(mamg); mamg.connect(mg.gain);
    chain(m1, filt('lowpass', 160), mg, amb.machine, A.bus);
    amb.kind = kind;
    A.setAmbienceKind(kind);
  };
  A.setAmbienceKind = function (kind) {
    if (!A.amb) return;
    const t = A.now();
    A.amb.kind = kind;
    A.amb.machine.gain.setTargetAtTime(kind === 'industrial' ? 0.05 : 0, t, 1);
    A.amb.room.gain.setTargetAtTime(kind === 'industrial' ? 0.11 : 0.07, t, 1);
  };
  // nível de luz próximo -> volume do zumbido
  A.setHum = function (level, flicker) {
    if (!A.amb) return;
    const t = A.now();
    A.amb.hum.gain.setTargetAtTime(0.004 + level * 0.022 * (flicker || 1), t, 0.12);
    A.amb.buzz.gain.setTargetAtTime(0.0005 + level * 0.0025 * (flicker || 1), t, 0.12);
  };

  A.crackle = function (x, y, z) {
    if (!A.ctx) return;
    const t = A.now(), o = out([x, y, z], 0.5, { ref: 1.2, roll: 1.3, rev: 0.2 });
    for (let i = 0; i < U.randInt(3, 7); i++) {
      const tt = t + Math.random() * 0.3;
      chain(noise(A.white, tt, 0.03), filt('bandpass', U.rand(3000, 6000), 2), env(tt, 0.001, 0.12, 0.015), o);
    }
  };

  A.lightPop = function (x, y, z) {
    if (!A.ctx) return;
    const t = A.now(), o = out([x, y, z], 1.4, { ref: 2, roll: 1, rev: 0.6 });
    chain(noise(A.white, t, 0.08), filt('highpass', 1400), env(t, 0.001, 0.9, 0.05), o);
    for (let i = 0; i < 7; i++) {
      const tt = t + 0.02 + Math.random() * 0.35;
      chain(osc('sine', U.rand(3000, 7500), tt, 0.2), env(tt, 0.001, U.rand(0.04, 0.12), U.rand(0.05, 0.18)), o);
    }
    chain(noise(A.white, t + 0.05, 0.7), filt('bandpass', 5200, 3), env(t + 0.05, 0.01, 0.12, 0.6), o);
  };

  A.clunk = function (x, y, z) {
    if (!A.ctx) return;
    const t = A.now(), o = out([x, y, z], 2.2, { ref: 2.5, roll: 0.9, rev: 0.7 });
    const th = osc('sine', 95, t, 0.3); th.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    chain(th, env(t, 0.002, 1, 0.25), o);
    chain(noise(A.white, t, 0.8), filt('bandpass', 1450, 25), env(t, 0.001, 0.9, 0.6), o);
    chain(noise(A.white, t, 0.8), filt('bandpass', 2330, 30), env(t, 0.001, 0.7, 0.5), o);
    const sg = osc('sawtooth', 60, t + 0.1, 1.6);
    chain(sg, filt('bandpass', 180, 2), env(t + 0.1, 0.3, 0.35, 1.2), o);
  };

  A.bottleImpact = function (x, y, z, hard) {
    if (!A.ctx) return;
    const t = A.now(), o = out([x, y, z], 0.8, { ref: 2, roll: 1, rev: 0.55 });
    const b = osc('sine', U.rand(480, 560), t, 0.15); b.frequency.exponentialRampToValueAtTime(330, t + 0.1);
    chain(b, env(t, 0.002, 0.4 * (hard || 1), 0.1), o);
    chain(noise(A.white, t, 0.1), filt('bandpass', 1300, 2), env(t, 0.001, 0.35 * (hard || 1), 0.06), o);
    chain(noise(A.brown, t + 0.03, 0.4), filt('lowpass', 600), env(t + 0.03, 0.03, 0.2, 0.3), o);
  };

  A.bump = function (x, y, z) {
    if (!A.ctx) return;
    const t = A.now(), o = out([x, y, z], 0.8, { ref: 2, roll: 1, rev: 0.4 });
    const b = osc('sine', 120, t, 0.2); b.frequency.exponentialRampToValueAtTime(60, t + 0.15);
    chain(b, env(t, 0.003, 0.5, 0.18), o);
    chain(noise(A.pink, t, 0.4), filt('lowpass', 900), env(t, 0.01, 0.3, 0.35), o);
  };

  A.knock = function (x, y, z, n) {
    if (!A.ctx) return;
    const t0 = A.now(), count = n || 3, o = out([x, y, z], count * 0.5 + 1, { ref: 2.5, roll: 0.9, rev: 0.8 });
    for (let i = 0; i < count; i++) {
      const t = t0 + i * U.rand(0.3, 0.45);
      const k = osc('sine', 115, t, 0.12); k.frequency.exponentialRampToValueAtTime(70, t + 0.07);
      chain(k, env(t, 0.002, 0.9, 0.09), o);
      chain(noise(A.pink, t, 0.08), filt('bandpass', 380, 1.3), env(t, 0.002, 0.7, 0.06), o);
    }
  };

  A.doorSlam = function (x, y, z) {
    if (!A.ctx) return;
    const t = A.now(), o = out([x, y, z], 2.5, { ref: 3, roll: 0.8, rev: 1 });
    const b = osc('sine', 70, t, 0.6); b.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    chain(b, env(t, 0.002, 1, 0.5), o);
    chain(noise(A.pink, t, 0.6), filt('lowpass', 900), env(t, 0.002, 0.8, 0.5), o);
    chain(noise(A.white, t, 1.2), filt('bandpass', 720, 18), env(t, 0.002, 0.3, 1), o);
  };

  A.creak = function (x, y, z) {
    if (!A.ctx) return;
    const t = A.now(), dur = U.rand(0.9, 1.6), o = out([x, y, z], dur + 0.4, { ref: 2.5, roll: 0.9, rev: 0.8 });
    const s = osc('sawtooth', 85, t, dur);
    for (let i = 0; i < 12; i++) s.frequency.linearRampToValueAtTime(U.rand(70, 130), t + (i / 12) * dur);
    chain(s, filt('bandpass', 650, 9), env(t, 0.1, 0.35, dur - 0.1), o);
  };

  A.drip = function (x, y, z) {
    if (!A.ctx) return;
    const t = A.now(), o = out([x, y, z], 0.6, { ref: 1, roll: 1.4, rev: 0.7 });
    const s = osc('sine', U.rand(1500, 2200), t, 0.06);
    s.frequency.exponentialRampToValueAtTime(800, t + 0.04);
    chain(s, env(t, 0.001, 0.25, 0.05), o);
  };

  // telefone antigo tocando em algum lugar
  A.phone = function (x, y, z) {
    if (!A.ctx) return;
    const t0 = A.now(), o = out([x, y, z], 6, { ref: 2, roll: 0.9, rev: 0.7 });
    for (let r = 0; r < 2; r++) {
      const t = t0 + r * 3;
      const g = A.ctx.createGain(); g.gain.value = 0;
      for (let i = 0; i < 40; i++) g.gain.setValueAtTime(i % 2 ? 0 : 0.12, t + i * 0.025);
      g.gain.setValueAtTime(0, t + 1.0);
      const a = osc('triangle', 440, t, 1.05), b = osc('triangle', 480, t, 1.05);
      a.connect(g); b.connect(g);
      chain(g, filt('bandpass', 1200, 1.5), o);
    }
  };

  A.distantRun = function (x0, z0, x1, z1) {
    if (!A.ctx) return;
    const n = 14;
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const k = i / (n - 1);
        A.monsterStep(U.lerp(x0, x1, k), U.lerp(z0, z1, k), 0.45, false);
      }, i * 210);
    }
  };

  // zumbido elétrico posicional (disjuntores, porta energizada)
  A.electricHum = function (x, y, z, pitch) {
    if (!A.ctx) return null;
    const ctx = A.ctx, t = A.now();
    const ch = A.spatial(x, y, z, { ref: 0.8, roll: 1.6, rev: 0.15 });
    const g = ctx.createGain(); g.gain.value = 0; g.connect(ch.input);
    const s = osc('sawtooth', 50 * (pitch || 1), t);
    chain(s, filt('bandpass', 100 * (pitch || 1), 3), g);
    const bz = ctx.createGain(); bz.gain.value = 0.25;
    chain(noise(A.white, t, 0, true), filt('bandpass', 6000, 8), bz, g);
    return {
      ch,
      setLevel(v) { g.gain.setTargetAtTime(v, ctx.currentTime, 0.3); },
      update(occ) { ch.setOcc(occ); },
      stop() { g.gain.setTargetAtTime(0, ctx.currentTime, 0.2); setTimeout(() => { try { s.stop(); } catch (e) { /* ok */ } ch.dispose(); }, 1500); },
    };
  };

  // gerador (nível 1)
  A.generator = function (x, y, z) {
    if (!A.ctx) return null;
    const ctx = A.ctx, t = A.now();
    const ch = A.spatial(x, y, z, { ref: 3, roll: 0.8, rev: 0.6 });
    const g = ctx.createGain(); g.gain.value = 0; g.connect(ch.input);
    const trem = ctx.createGain(); trem.gain.value = 0.6; trem.connect(g);
    const lfo = osc('sine', 24, t), lg = ctx.createGain(); lg.gain.value = 0.35; lfo.connect(lg); lg.connect(trem.gain);
    const a = osc('sawtooth', 46, t), b = osc('sawtooth', 92.5, t);
    const lp = filt('lowpass', 420, 1.5); a.connect(lp); b.connect(lp); lp.connect(trem);
    chain(noise(A.brown, t, 0, true), filt('lowpass', 700), trem);
    g.gain.setTargetAtTime(0.7, t + 0.5, 1.2);
    return { ch, update(occ) { ch.setOcc(occ); } };
  };

  // ----------------------------------------------------------
  //  RÁDIO (música da pasta Assets saindo de um alto-falante velho)
  // ----------------------------------------------------------
  A.radio = function (url, x, y, z) {
    if (!A.ctx) return null;
    const ctx = A.ctx;
    const el = new Audio(url); el.loop = true; el.preload = 'auto';
    let src;
    try { src = ctx.createMediaElementSource(el); } catch (e) { return null; }
    const ch = A.spatial(x, y, z, { ref: 1.4, roll: 1.05, rev: 0.55 });
    const g = ctx.createGain(); g.gain.value = 0;
    chain(src, filt('highpass', 300, 0.7), filt('lowpass', 3300, 0.8), (function () {
      const pk = filt('peaking', 1100); pk.gain.value = 7; pk.Q.value = 1; return pk;
    })(), distCurve(3), g, ch.input);
    const crack = ctx.createGain(); crack.gain.value = 0;
    chain(noise(A.white, A.now(), 0, true), filt('bandpass', 2600, 0.8), crack, ch.input);
    const r = {
      ch, on: false, el,
      setOn(v) {
        r.on = v;
        const t = ctx.currentTime;
        if (v) { const p = el.play(); if (p && p.catch) p.catch(() => { /* ok */ }); g.gain.setTargetAtTime(0.85, t, 0.4); crack.gain.setTargetAtTime(0.02, t, 0.3); }
        else { g.gain.setTargetAtTime(0, t, 0.05); crack.gain.setTargetAtTime(0, t, 0.05); setTimeout(() => { if (!r.on) el.pause(); }, 400); }
      },
      update(occ) { ch.setOcc(occ); },
      destroy() { r.setOn(false); setTimeout(() => { try { el.pause(); el.src = ''; } catch (e) { /* ok */ } ch.dispose(); }, 600); },
    };
    return r;
  };

  // ----------------------------------------------------------
  //  SUSTO FINAL
  // ----------------------------------------------------------
  A.jumpscare = function () {
    if (!A.ctx) return;
    const t = A.now(), o = out(null, 2.5, { rev: 0.3 });
    const mix = A.ctx.createGain(); mix.gain.value = 0.55; mix.connect(o);
    const ws = distCurve(60);
    const bp1 = filt('bandpass', 1100, 2), bp2 = filt('bandpass', 2900, 3);
    ws.connect(bp1); ws.connect(bp2);
    const g = env(t, 0.01, 1, 1.5, 0.2); bp1.connect(g); bp2.connect(g); g.connect(mix);
    [340, 455, 610, 760].forEach((f, i) => {
      const s = osc('sawtooth', f * 1.6, t, 1.8);
      s.frequency.exponentialRampToValueAtTime(f * 0.5, t + 1.6);
      s.detune.value = (i - 1.5) * 30;
      s.connect(ws);
    });
    chain(noise(A.white, t, 1.2), filt('bandpass', 1600, 0.6), env(t, 0.005, 0.9, 1.0), mix);
    const b = osc('sine', 60, t, 1.4); b.frequency.exponentialRampToValueAtTime(25, t + 1.2);
    chain(b, env(t, 0.005, 1, 1.2), mix);
  };
})(window.BR);
