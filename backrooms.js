/* ============================================================
   THE BACKROOMS — Nível 0  (motor do jogo, Three.js)
   ------------------------------------------------------------
   Labirinto procedural, lanterna, monstro com IA (BFS),
   áudio 100% procedural, jumpscares. Sem arquivos externos
   além do Three.js (CDN) e do áudio da intro.

   Exposto como window.BackroomsGame:
     .init()        -> monta a cena (não inicia o loop)
     .revealMenu()  -> mostra o menu de entrada e inicia o loop
   ============================================================ */
window.BackroomsGame = (function () {
  'use strict';

  // ----------------------------------------------------------------
  //  ÁUDIO PROCEDURAL
  // ----------------------------------------------------------------
  const Snd = {
    ctx: null, master: null, buzz: null, monsterGain: null, monsterPan: null,
    heartGain: null, started: false,

    init() {
      if (this.started) return;
      this.started = true;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.setValueAtTime(0, ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 4);
      this.master.connect(ctx.destination);

      // Drone ambiente grave
      const drone = ctx.createOscillator();
      drone.type = 'sawtooth'; drone.frequency.value = 38;
      const dFilter = ctx.createBiquadFilter();
      dFilter.type = 'lowpass'; dFilter.frequency.value = 120;
      const dGain = ctx.createGain(); dGain.gain.value = 0.25;
      drone.connect(dFilter); dFilter.connect(dGain); dGain.connect(this.master);
      drone.start();

      // Zumbido de lâmpada fluorescente
      const hum = ctx.createOscillator(); hum.type = 'square'; hum.frequency.value = 60;
      const hum2 = ctx.createOscillator(); hum2.type = 'sine'; hum2.frequency.value = 120;
      const humF = ctx.createBiquadFilter(); humF.type = 'bandpass'; humF.frequency.value = 120; humF.Q.value = 4;
      this.buzz = ctx.createGain(); this.buzz.gain.value = 0.04;
      hum.connect(humF); hum2.connect(humF); humF.connect(this.buzz); this.buzz.connect(this.master);
      hum.start(); hum2.start();

      // Canal do monstro (respiração com panning estéreo)
      this.monsterPan = ctx.createStereoPanner();
      this.monsterGain = ctx.createGain(); this.monsterGain.gain.value = 0;
      const mOsc = ctx.createOscillator(); mOsc.type = 'sawtooth'; mOsc.frequency.value = 58;
      const mLfo = ctx.createOscillator(); mLfo.type = 'sine'; mLfo.frequency.value = 0.7;
      const mLfoGain = ctx.createGain(); mLfoGain.gain.value = 14;
      mLfo.connect(mLfoGain); mLfoGain.connect(mOsc.frequency);
      const mFilter = ctx.createBiquadFilter(); mFilter.type = 'lowpass'; mFilter.frequency.value = 400;
      mOsc.connect(mFilter); mFilter.connect(this.monsterGain);
      this.monsterGain.connect(this.monsterPan); this.monsterPan.connect(this.master);
      mOsc.start(); mLfo.start();

      // Batimento cardíaco
      this.heartGain = ctx.createGain(); this.heartGain.gain.value = 0;
      const heart = ctx.createOscillator(); heart.type = 'sine'; heart.frequency.value = 50;
      heart.connect(this.heartGain); this.heartGain.connect(this.master);
      heart.start();
    },

    beat() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.heartGain.gain.cancelScheduledValues(t);
      this.heartGain.gain.setValueAtTime(0, t);
      this.heartGain.gain.linearRampToValueAtTime(0.6, t + 0.05);
      this.heartGain.gain.exponentialRampToValueAtTime(0.4, t + 0.12);
      this.heartGain.gain.linearRampToValueAtTime(0.5, t + 0.2);
      this.heartGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    },

    footstep(running) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.08, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = running ? 900 : 500;
      const g = this.ctx.createGain(); g.gain.value = running ? 0.25 : 0.15;
      src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
    },

    growl(pan) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.6);
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      const p = this.ctx.createStereoPanner(); p.pan.value = pan;
      o.connect(f); f.connect(g); g.connect(p); p.connect(this.master);
      o.start(t); o.stop(t + 0.9);
    },

    scream() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 1.2, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
      const noise = this.ctx.createBufferSource(); noise.buffer = buf;
      const nf = this.ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1500; nf.Q.value = 0.7;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.9, t); ng.gain.exponentialRampToValueAtTime(0.01, t + 1.1);
      noise.connect(nf); nf.connect(ng); ng.connect(this.ctx.destination); noise.start(t);
      [330, 400, 520].forEach((fr, i) => {
        const o = this.ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(fr * 2, t);
        o.frequency.exponentialRampToValueAtTime(fr * 0.5, t + 1);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.4, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1);
        o.detune.value = (i - 1) * 40;
        o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + 1.1);
      });
    },

    whisper() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 1.5, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(i * 0.02);
      const s = this.ctx.createBufferSource(); s.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 3;
      const g = this.ctx.createGain(); g.gain.value = 0.08;
      const p = this.ctx.createStereoPanner(); p.pan.value = Math.random() * 2 - 1;
      s.connect(f); f.connect(g); g.connect(p); p.connect(this.master); s.start(t);
    },

    // -------- MÚSICA AMBIENTE (estilo "caixinha de som velha lá no fundo") --------
    _musicUrl: null, _musicEl: null, _musicNodes: null, _noiseSrc: null,

    makeReverbIR(seconds, decay) {
      const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
      return buf;
    },

    playMusic(url) {
      if (!this.ctx || this._musicUrl === url) return;  // já tocando essa
      this.stopMusic();
      this._musicUrl = url;
      const a = new Audio(url); a.loop = true; a.preload = 'auto';
      this._musicEl = a;
      let src;
      try { src = this.ctx.createMediaElementSource(a); } catch (e) { return; }

      // alto-falante barato: corta graves e agudos, realça os médios
      const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1650;
      const peak = this.ctx.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 950; peak.Q.value = 1.1; peak.gain.value = 7;
      // distância: reverb de corredor (wet) + sinal seco (dry)
      const dry = this.ctx.createGain(); dry.gain.value = 0.42;
      const wet = this.ctx.createGain(); wet.gain.value = 0.30;
      const conv = this.ctx.createConvolver(); conv.buffer = this.makeReverbIR(2.6, 3.0);
      const out = this.ctx.createGain(); out.gain.value = 0.0;

      src.connect(hp); hp.connect(lp); lp.connect(peak);
      peak.connect(dry); dry.connect(out);
      peak.connect(wet); wet.connect(conv); conv.connect(out);
      out.connect(this.master);
      out.gain.linearRampToValueAtTime(0.62, this.ctx.currentTime + 3.5);  // fade-in

      const p = a.play(); if (p && p.catch) p.catch(() => {});
      this._musicNodes = { src, out };
      this._startSpeakerNoise();
    },

    stopMusic() {
      if (this._musicEl) { try { this._musicEl.pause(); } catch (e) {} }
      if (this._musicNodes && this._musicNodes.out) { try { this._musicNodes.out.disconnect(); } catch (e) {} }
      if (this._noiseSrc) { try { this._noiseSrc.stop(); } catch (e) {} this._noiseSrc = null; }
      this._musicEl = null; this._musicNodes = null; this._musicUrl = null;
    },

    _startSpeakerNoise() {
      const ctx = this.ctx;
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.5;
      const g = ctx.createGain(); g.gain.value = 0.014;   // estática bem baixinha
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start(); this._noiseSrc = src;
    },
  };

  // ----------------------------------------------------------------
  //  TEXTURAS PROCEDURAIS
  // ----------------------------------------------------------------
  function texWallpaper() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#cab060'; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = '#b89a48'; x.lineWidth = 4;
    for (let i = 0; i < 256; i += 24) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); }
    for (let i = 0; i < 14; i++) {
      const gx = Math.random() * 256, gy = Math.random() * 256, r = 10 + Math.random() * 40;
      const grd = x.createRadialGradient(gx, gy, 0, gx, gy, r);
      grd.addColorStop(0, 'rgba(70,55,20,0.18)'); grd.addColorStop(1, 'rgba(70,55,20,0)');
      x.fillStyle = grd; x.beginPath(); x.arc(gx, gy, r, 0, 7); x.fill();
    }
    for (let i = 0; i < 2500; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.04)' : 'rgba(120,95,35,0.06)';
      x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1);
    return t;
  }
  function texCarpet() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#564a28'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 6000; i++) {
      x.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(150,130,70,0.07)';
      x.fillRect(Math.random() * 128, Math.random() * 128, 1, 1);
    }
    for (let i = 0; i < 10; i++) {
      const gx = Math.random() * 128, gy = Math.random() * 128, r = 8 + Math.random() * 20;
      const grd = x.createRadialGradient(gx, gy, 0, gx, gy, r);
      grd.addColorStop(0, 'rgba(0,0,0,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = grd; x.beginPath(); x.arc(gx, gy, r, 0, 7); x.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40);
    return t;
  }
  function texCeiling() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#bbae86'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = '#8d8260'; x.lineWidth = 5; x.strokeRect(0, 0, 128, 128);
    for (let i = 0; i < 1500; i++) { x.fillStyle = 'rgba(0,0,0,0.05)'; x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40);
    return t;
  }

  // ----- texturas do NÍVEL 1 (concreto industrial úmido) -----
  function texConcrete() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#5d5e60'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 60; i++) {
      const gx = Math.random() * 256, gy = Math.random() * 256, r = 20 + Math.random() * 60;
      const grd = x.createRadialGradient(gx, gy, 0, gx, gy, r);
      grd.addColorStop(0, Math.random() > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.05)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = grd; x.beginPath(); x.arc(gx, gy, r, 0, 7); x.fill();
    }
    for (let i = 0; i < 8; i++) {
      const gx = Math.random() * 256, gy = Math.random() * 256, r = 15 + Math.random() * 45;
      const grd = x.createRadialGradient(gx, gy, 0, gx, gy, r);
      grd.addColorStop(0, 'rgba(8,12,8,0.28)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = grd; x.beginPath(); x.arc(gx, gy, r, 0, 7); x.fill();
    }
    x.strokeStyle = 'rgba(0,0,0,0.32)'; x.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) { x.beginPath(); let px = Math.random() * 256, py = Math.random() * 256; x.moveTo(px, py); for (let j = 0; j < 5; j++) { px += (Math.random() - 0.5) * 60; py += (Math.random() - 0.5) * 60; x.lineTo(px, py); } x.stroke(); }
    for (let i = 0; i < 3000; i++) { x.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.03)'; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1); return t;
  }
  function texConcreteFloor() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#3e4042'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 4000; i++) { x.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(180,185,195,0.04)'; x.fillRect(Math.random() * 128, Math.random() * 128, 1, 1); }
    for (let i = 0; i < 10; i++) { const gx = Math.random() * 128, gy = Math.random() * 128, r = 8 + Math.random() * 22; const grd = x.createRadialGradient(gx, gy, 0, gx, gy, r); grd.addColorStop(0, 'rgba(0,0,0,0.24)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = grd; x.beginPath(); x.arc(gx, gy, r, 0, 7); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40); return t;
  }
  function texMetalCeil() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#26282c'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(10,12,16,0.7)'; x.lineWidth = 6; x.strokeRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(120,130,145,0.08)'; x.lineWidth = 1;
    for (let i = 0; i < 128; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke(); }
    for (let i = 0; i < 800; i++) { x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40); return t;
  }

  // Rosto procedural ("Smiler") para o jumpscare
  function makeScareFace() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 512, 512);
    const g = x.createRadialGradient(256, 250, 40, 256, 250, 260);
    g.addColorStop(0, '#cac4b4'); g.addColorStop(0.6, '#6b665a'); g.addColorStop(1, '#000');
    x.fillStyle = g; x.beginPath(); x.ellipse(256, 260, 180, 240, 0, 0, 7); x.fill();
    x.fillStyle = '#000';
    x.beginPath(); x.ellipse(185, 220, 55, 75, 0.2, 0, 7); x.fill();
    x.beginPath(); x.ellipse(330, 220, 55, 75, -0.2, 0, 7); x.fill();
    x.shadowColor = '#ffe14d'; x.shadowBlur = 40; x.fillStyle = '#fff4b0';
    x.beginPath(); x.arc(190, 225, 12, 0, 7); x.fill();
    x.beginPath(); x.arc(325, 225, 12, 0, 7); x.fill();
    x.shadowBlur = 0;
    x.strokeStyle = '#1a1208'; x.lineWidth = 6; x.fillStyle = '#1a1208';
    x.beginPath(); x.moveTo(150, 360); x.quadraticCurveTo(256, 470, 372, 360); x.lineTo(372, 360);
    x.quadraticCurveTo(256, 400, 150, 360); x.fill();
    x.fillStyle = '#d8d0b0';
    for (let i = 0; i < 9; i++) {
      const tx = 165 + i * 24;
      x.beginPath(); x.moveTo(tx, 365); x.lineTo(tx + 12, 365);
      x.lineTo(tx + 6, 365 + (i % 2 ? 34 : 24)); x.fill();
    }
    x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      x.beginPath();
      let px = 256 + (Math.random() - 0.5) * 300, py = 260 + (Math.random() - 0.5) * 380;
      x.moveTo(px, py);
      for (let j = 0; j < 4; j++) { px += (Math.random() - 0.5) * 40; py += (Math.random() - 0.5) * 40; x.lineTo(px, py); }
      x.stroke();
    }
    const id = x.getImageData(0, 0, 512, 512); const dd = id.data;
    for (let i = 0; i < dd.length; i += 4) { const n = (Math.random() - 0.5) * 60; dd[i] += n; dd[i + 1] += n; dd[i + 2] += n; }
    x.putImageData(id, 0, 0);
    return c.toDataURL();
  }

  // ----------------------------------------------------------------
  //  GERAÇÃO DO LABIRINTO (recursive backtracker + loops)
  // ----------------------------------------------------------------
  function generateMaze(cols, rows) {
    const W = cols * 2 + 1, H = rows * 2 + 1;
    const g = Array.from({ length: H }, () => Array(W).fill(1));
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const stack = [[0, 0]]; visited[0][0] = true; g[1][1] = 0;
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]].sort(() => Math.random() - 0.5);
      let moved = false;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !visited[ny][nx]) {
          visited[ny][nx] = true;
          g[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = 0;
          g[ny * 2 + 1][nx * 2 + 1] = 0;
          stack.push([nx, ny]); moved = true; break;
        }
      }
      if (!moved) stack.pop();
    }
    for (let i = 0; i < Math.floor(cols * rows * 0.16); i++) {
      const x = 1 + Math.floor(Math.random() * (W - 2));
      const y = 1 + Math.floor(Math.random() * (H - 2));
      if (g[y][x] === 1 && ((g[y - 1][x] === 0 && g[y + 1][x] === 0) || (g[y][x - 1] === 0 && g[y][x + 1] === 0)))
        g[y][x] = 0;
    }
    return { grid: g, W, H };
  }

  // ================================================================
  //  ESTADO DO MÓDULO (preenchido em init)
  // ================================================================
  let scene, camera, renderer;
  let grid, GW, GH;
  const tileSize = 5, wallH = 3.4, eyeH = 1.75;
  let ambient, hemi, flashlight, flashTarget;
  let panelMat, panelDeadMat, flickerPanels = [];
  let startCell, exitCell, exitWorld, frame, exitLight;
  let currentLevel = 0, worldGroup = null, theme = null;

  // ----------------------------------------------------------------
  //  TEMAS DE NÍVEL (cada um é uma Backrooms diferente)
  // ----------------------------------------------------------------
  const LEVELS = [
    {
      name: 'NÍVEL 0', sub: 'ALMOND WATER',
      cols: 11, rows: 11,
      wallTex: texWallpaper, floorTex: texCarpet, ceilTex: texCeiling,
      panelOn: 0xfff6d8, panelOff: 0x32301f, panelChance: 0.4, deadChance: 0.18,
      fog: 0x111006, fogNear: 4, fogFar: 34,
      ambientCol: 0xfff2c0, ambientBase: 0.32,
      hemiSky: 0xfff0c0, hemiGround: 0x201500, hemiI: 0.25,
      flashCol: 0xfff3d0,
      monsterSpeed: 5.0, spawnDelay: 9,
      music: 'Assets/musica-1.mp3',
    },
    {
      name: 'NÍVEL 1', sub: 'HABITABLE ZONE',
      cols: 14, rows: 14,
      wallTex: texConcrete, floorTex: texConcreteFloor, ceilTex: texMetalCeil,
      panelOn: 0xcfe6ff, panelOff: 0x14171c, panelChance: 0.22, deadChance: 0.42,
      fog: 0x05070a, fogNear: 3, fogFar: 26,
      ambientCol: 0xaab4c4, ambientBase: 0.2,
      hemiSky: 0x8fa0b8, hemiGround: 0x0a0c10, hemiI: 0.18,
      flashCol: 0xdfefff,
      monsterSpeed: 6.0, spawnDelay: 6,
      music: 'Assets/musica-2.mp3',
    },
  ];
  let monster, mBodyMat, armL, armR, head, eyeMat;
  let gameState = 'menu';
  let pitch = 0, yaw = 0;
  const keys = {};
  const vel = new THREE.Vector3();
  let stamina = 1, bobTime = 0, lastStepSign = 1, heartRate = 0, heartTimer = 0;
  const SENS = 0.0022;
  let prevT = 0, loopStarted = false;

  // elementos de UI
  let startMenu, crosshair, hud, staminaEl, objectiveEl, msgBox, vignetteEl,
      flashEl, jumpEl, caughtEl, fadeEl, winScreen, compass, compassArrow, compassDist;

  const Monster = {
    active: false, spawnDelay: 7,
    pos: new THREE.Vector3(),
    speed: 5.0, waypoint: null, distMap: null, recalcTimer: 0, growlTimer: 0,
    twitchTimer: 0, lungeTimer: 0, lunging: false,
    jitterX: 0, jitterY: 0, jitterZ: 0,
    reset() {
      const d = bfs(startCell.x, startCell.z);
      let best = null, bestDist = -1;
      for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++) {
        if (grid[z][x] !== 1 && d[z][x] < 9999 && d[z][x] > bestDist) { bestDist = d[z][x]; best = { x, z }; }
      }
      this.pos.set(best.x * tileSize, 0, best.z * tileSize);
      monster.position.copy(this.pos);
      this.active = false; this.spawnDelay = theme ? theme.spawnDelay : 9; this.waypoint = null; this.distMap = null;
      this.twitchTimer = 0; this.lungeTimer = 0; this.lunging = false;
      this.jitterX = this.jitterY = this.jitterZ = 0;
      monster.visible = false;
    },
  };

  // BFS no grid
  function bfs(sx, sz) {
    const d = Array.from({ length: GH }, () => Array(GW).fill(9999));
    if (grid[sz] === undefined || grid[sz][sx] === 1) return d;
    d[sz][sx] = 0; const q = [[sx, sz]];
    while (q.length) {
      const [x, z] = q.shift();
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (grid[nz] && grid[nz][nx] !== 1 && grid[nz][nx] !== undefined && d[nz][nx] === 9999) {
          d[nz][nx] = d[z][x] + 1; q.push([nx, nz]);
        }
      }
    }
    return d;
  }

  function showObjective(txt) {
    objectiveEl.textContent = txt; objectiveEl.style.display = 'block';
    objectiveEl.style.opacity = '1';
    clearTimeout(showObjective._t);
    showObjective._t = setTimeout(() => (objectiveEl.style.opacity = '0'), 4000);
  }

  function updateMonster(dt) {
    if (gameState !== 'playing') return;

    if (!Monster.active) {
      Monster.spawnDelay -= dt;
      if (Monster.spawnDelay <= 0) {
        Monster.active = true; monster.visible = true;
        Snd.growl(0); showObjective('▸ ELE ACORDOU. CORRA.');
      }
      return;
    }
    monster.visible = true;

    // --- caminho até o jogador (BFS periódico) ---
    Monster.recalcTimer -= dt;
    if (Monster.recalcTimer <= 0 || !Monster.distMap) {
      const pcx = Math.round(camera.position.x / tileSize);
      const pcz = Math.round(camera.position.z / tileSize);
      Monster.distMap = bfs(pcx, pcz);
      Monster.recalcTimer = 0.25;
    }
    const mcx = Math.round(Monster.pos.x / tileSize);
    const mcz = Math.round(Monster.pos.z / tileSize);
    let next = null, nd = Monster.distMap[mcz] ? Monster.distMap[mcz][mcx] : 9999;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = mcx + dx, nz = mcz + dz;
      if (grid[nz] && grid[nz][nx] !== 1 && Monster.distMap[nz] && Monster.distMap[nz][nx] < nd) {
        nd = Monster.distMap[nz][nx]; next = { x: nx, z: nz };
      }
    }
    const distToPlayer = Math.hypot(Monster.pos.x - camera.position.x, Monster.pos.z - camera.position.z);
    let tx, tz;
    if (next) { tx = next.x * tileSize; tz = next.z * tileSize; }
    else { tx = camera.position.x; tz = camera.position.z; }
    if (distToPlayer < tileSize * 1.4) { tx = camera.position.x; tz = camera.position.z; }
    const near = distToPlayer < tileSize * 2.2;

    // --- movimento em SURTOS: investe e congela (anda "errado") ---
    Monster.lungeTimer -= dt;
    if (Monster.lungeTimer <= 0) {
      Monster.lunging = !Monster.lunging;
      if (Monster.lunging) {
        Monster.lungeTimer = 0.22 + Math.random() * 0.32;     // investida curta e rápida
        if (distToPlayer < 18) Snd.growl(0);
      } else {
        Monster.lungeTimer = 0.30 + Math.random() * 0.85;     // pausa antes do próximo bote
      }
    }
    const speedMul = Monster.lunging ? (near ? 2.7 : 2.1) : 0.5;
    const dirx = tx - Monster.pos.x, dirz = tz - Monster.pos.z;
    const len = Math.hypot(dirx, dirz) || 1;
    Monster.pos.x += (dirx / len) * Monster.speed * speedMul * dt;
    Monster.pos.z += (dirz / len) * Monster.speed * speedMul * dt;

    // --- ANIMAÇÃO BRUSCA (stop-motion / espasmos) ---
    // a pose só muda em "quadros" irregulares -> movimento entrecortado, nervoso
    Monster.twitchTimer -= dt;
    if (Monster.twitchTimer <= 0) {
      Monster.twitchTimer = (near ? 0.035 : 0.07) + Math.random() * 0.16;
      // encara o jogador em SALTOS, com um erro nervoso na cabeça
      const want = Math.atan2(camera.position.x - Monster.pos.x, camera.position.z - Monster.pos.z);
      monster.rotation.y = want + (Math.random() * 2 - 1) * 0.22;
      // braços espasmódicos
      armL.rotation.set((Math.random() * 2 - 1) * 1.7, 0, 0.2 + (Math.random() * 2 - 1) * 0.7);
      armR.rotation.set((Math.random() * 2 - 1) * 1.7, 0, -0.2 + (Math.random() * 2 - 1) * 0.7);
      // cabeça tremendo / tombando
      head.rotation.z = (Math.random() * 2 - 1) * 0.55;
      head.rotation.x = (Math.random() * 2 - 1) * 0.35;
      head.position.x = (Math.random() * 2 - 1) * 0.15;
      // solavancos do corpo inteiro
      Monster.jitterX = (Math.random() * 2 - 1) * (near ? 0.16 : 0.09);
      Monster.jitterZ = (Math.random() * 2 - 1) * (near ? 0.16 : 0.09);
      Monster.jitterY = Math.random() * (near ? 0.18 : 0.1);
    }
    monster.position.x = Monster.pos.x + Monster.jitterX;
    monster.position.z = Monster.pos.z + Monster.jitterZ;
    monster.position.y = Monster.jitterY;

    // --- som direcional + proximidade ---
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const toM = new THREE.Vector3(Monster.pos.x - camera.position.x, 0, Monster.pos.z - camera.position.z).normalize();
    const pan = Math.max(-1, Math.min(1, toM.dot(right)));
    const prox = Math.max(0, 1 - distToPlayer / 28);
    if (Snd.monsterGain) {
      Snd.monsterGain.gain.setTargetAtTime(prox * 0.55, Snd.ctx.currentTime, 0.2);
      Snd.monsterPan.pan.setTargetAtTime(pan, Snd.ctx.currentTime, 0.2);
    }
    Monster.growlTimer -= dt;
    if (Monster.growlTimer <= 0) { Snd.growl(pan); Monster.growlTimer = 1.2 + Math.random() * 2.4 * (1 - prox); }

    vignetteEl.style.opacity = Math.min(0.92, prox * 1.35);
    heartRate = prox > 0.05 ? (1.15 - prox * 0.85) : 0;

    if (distToPlayer < 1.5) triggerCaught();
  }

  // ----------------------------------------------------------------
  //  COLISÃO
  // ----------------------------------------------------------------
  function isWallAt(x, z) {
    const gx = Math.round(x / tileSize), gz = Math.round(z / tileSize);
    if (!grid[gz] || grid[gz][gx] === undefined) return true;
    return grid[gz][gx] === 1;
  }
  function blocked(x, z) {
    const r = 0.65;
    return isWallAt(x + r, z) || isWallAt(x - r, z) || isWallAt(x, z + r) || isWallAt(x, z - r) ||
      isWallAt(x + r * 0.7, z + r * 0.7) || isWallAt(x - r * 0.7, z - r * 0.7) ||
      isWallAt(x + r * 0.7, z - r * 0.7) || isWallAt(x - r * 0.7, z + r * 0.7);
  }

  function placePlayerAtStart() {
    camera.position.set(startCell.x * tileSize, eyeH, startCell.z * tileSize);
    vel.set(0, 0, 0); pitch = 0; yaw = 0; stamina = 1;
  }

  // ----------------------------------------------------------------
  //  JUMPSCARE / PEGO / VITÓRIA
  // ----------------------------------------------------------------
  function triggerCaught() {
    if (gameState !== 'playing') return;
    gameState = 'caught';
    document.exitPointerLock();
    crosshair.style.display = 'none'; hud.style.display = 'none';
    compass.style.display = 'none'; objectiveEl.style.display = 'none'; msgBox.style.display = 'none';
    Snd.scream();
    if (Snd.monsterGain) Snd.monsterGain.gain.setTargetAtTime(0, Snd.ctx.currentTime, 0.2);

    jumpEl.classList.add('show');
    flashEl.style.transition = 'none'; flashEl.style.opacity = '0.9';
    setTimeout(() => { flashEl.style.transition = 'opacity .4s'; flashEl.style.opacity = '0'; }, 60);

    setTimeout(() => { jumpEl.classList.remove('show'); caughtEl.style.display = 'flex'; }, 1100);

    setTimeout(() => {
      caughtEl.style.display = 'none';
      placePlayerAtStart(); Monster.reset();
      vignetteEl.style.opacity = '0'; heartRate = 0;
      startMenu.style.display = 'block';
      startMenu.querySelector('.blink').textContent = '▶ CLIQUE PARA CONTINUAR';
    }, 3000);
  }

  // atravessou a saída: desce para a próxima Backrooms (ou vence, se for a última)
  function reachExit() {
    if (gameState !== 'playing') return;
    if (currentLevel < LEVELS.length - 1) {
      gameState = 'transition';          // mantém o ponteiro travado durante a descida
      msgBox.style.display = 'none';
      vignetteEl.style.opacity = '0'; heartRate = 0;
      if (Snd.monsterGain) Snd.monsterGain.gain.setTargetAtTime(0, Snd.ctx.currentTime, 0.3);
      fadeEl.style.opacity = '1';
      setTimeout(() => {
        buildLevel(currentLevel + 1);
        gameState = 'playing';
        setTimeout(() => { fadeEl.style.opacity = '0'; }, 300);
      }, 1500);
    } else {
      triggerWin();
    }
  }

  function triggerWin() {
    if (gameState !== 'playing') return;
    gameState = 'won';
    document.exitPointerLock();
    crosshair.style.display = 'none'; hud.style.display = 'none';
    objectiveEl.style.display = 'none'; msgBox.style.display = 'none';
    compass.style.display = 'none';
    vignetteEl.style.opacity = '0';
    if (Snd.master) Snd.master.gain.setTargetAtTime(0, Snd.ctx.currentTime, 1.5);

    fadeEl.style.opacity = '1';
    setTimeout(() => {
      winScreen.style.display = 'flex';
      fadeEl.style.opacity = '0';
      setTimeout(() => winScreen.classList.add('show'), 200);
    }, 1300);
  }

  // ----------------------------------------------------------------
  //  SUSTOS AMBIENTE
  // ----------------------------------------------------------------
  let scareTimer = 8 + Math.random() * 10;
  function ambientScares(dt) {
    scareTimer -= dt;
    if (scareTimer <= 0) {
      scareTimer = 10 + Math.random() * 16;
      if (Math.random() < 0.5) {
        const old = ambient.intensity;
        ambient.intensity = 0.02; hemi.intensity = 0.02;
        Snd.whisper();
        setTimeout(() => { ambient.intensity = old; hemi.intensity = 0.25; }, 200 + Math.random() * 400);
      } else {
        Snd.whisper();
      }
    }
  }

  // ----------------------------------------------------------------
  //  LOOP PRINCIPAL
  // ----------------------------------------------------------------
  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    let dt = (now - prevT) / 1000; prevT = now;
    if (dt > 0.05) dt = 0.05;

    if (gameState === 'playing') {
      const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();

      let ix = 0, iz = 0;
      if (keys['w']) { ix += fwd.x; iz += fwd.z; }
      if (keys['s']) { ix -= fwd.x; iz -= fwd.z; }
      if (keys['d']) { ix += right.x; iz += right.z; }
      if (keys['a']) { ix -= right.x; iz -= right.z; }
      const il = Math.hypot(ix, iz);
      if (il > 0) { ix /= il; iz /= il; }

      const moving = il > 0;
      const wantRun = keys['shift'] && stamina > 0.02 && moving;
      const targetSpeed = wantRun ? 8.0 : 4.4;

      // Fôlego generoso: corre por bastante tempo e recupera rápido
      if (wantRun) stamina = Math.max(0, stamina - dt * 0.12);
      else stamina = Math.min(1, stamina + dt * 0.28);
      staminaEl.style.width = (stamina * 100) + '%';
      staminaEl.style.background = stamina < 0.25 ? '#b03030' : 'linear-gradient(90deg,#caa64a,#e8c873)';

      const accel = moving ? 34 : 24;
      vel.x += (ix * targetSpeed - vel.x) * Math.min(1, accel * dt);
      vel.z += (iz * targetSpeed - vel.z) * Math.min(1, accel * dt);

      const nx = camera.position.x + vel.x * dt;
      const nz = camera.position.z + vel.z * dt;
      if (!blocked(nx, camera.position.z)) camera.position.x = nx; else vel.x = 0;
      if (!blocked(camera.position.x, nz)) camera.position.z = nz; else vel.z = 0;

      const sp = Math.hypot(vel.x, vel.z);
      if (sp > 0.3) {
        bobTime += dt * (wantRun ? 13 : 9);
        const bob = Math.sin(bobTime) * 0.06 * (wantRun ? 1.3 : 1);
        camera.position.y = eyeH + bob;
        const sign = Math.sign(Math.sin(bobTime));
        if (sign !== lastStepSign) { lastStepSign = sign; Snd.footstep(wantRun); }
      } else {
        camera.position.y += (eyeH - camera.position.y) * 0.1;
      }

      camera.rotation.set(pitch, yaw, 0, 'YXZ');

      flashlight.position.copy(camera.position);
      const lookAt = new THREE.Vector3(); camera.getWorldDirection(lookAt);
      flashTarget.position.copy(camera.position).add(lookAt);

      if (Math.random() < 0.04) {
        ambient.intensity = theme.ambientBase * (0.6 + Math.random() * 0.55);
        for (const p of flickerPanels) p.material = Math.random() < 0.5 ? panelDeadMat : panelMat;
      } else {
        ambient.intensity += (theme.ambientBase - ambient.intensity) * 0.2;
      }
      if (Snd.buzz) Snd.buzz.gain.value = 0.03 + Math.random() * 0.03;

      updateMonster(dt);
      ambientScares(dt);

      if (heartRate > 0) { heartTimer -= dt; if (heartTimer <= 0) { Snd.beat(); heartTimer = heartRate; } }

      const dExit = Math.hypot(camera.position.x - exitWorld.x, camera.position.z - exitWorld.z);
      if (dExit < 4.5) {
        msgBox.style.display = 'block';
        if (keys['e'] || dExit < 2.2) reachExit();
      } else {
        msgBox.style.display = 'none';
      }

      // bússola: aponta para a saída (▲ = em frente)
      const ex = exitWorld.x - camera.position.x, ez = exitWorld.z - camera.position.z;
      const cAng = Math.atan2(ex * right.x + ez * right.z, ex * fwd.x + ez * fwd.z);
      compassArrow.style.transform = 'rotate(' + cAng + 'rad)';
      compassDist.textContent = dExit < 5 ? 'SAÍDA' : Math.round(dExit) + ' m';

      frame.material.color.setHSL(0.35, 1, 0.45 + Math.sin(now * 0.004) * 0.15);
      exitLight.intensity = 1.2 + Math.sin(now * 0.004) * 0.5;
    }

    const ep = 0.5 + Math.sin(now * 0.008) * 0.3;
    eyeMat.color.setRGB(1, 0.94 * ep + 0.3, 0.3 * ep);

    renderer.render(scene, camera);
  }

  // ----------------------------------------------------------------
  //  CONSTRUÇÃO DA CENA
  // ----------------------------------------------------------------
  function init() {
    // refs de UI
    startMenu = document.getElementById('start-menu');
    crosshair = document.getElementById('crosshair');
    hud = document.getElementById('hud');
    staminaEl = document.getElementById('stamina');
    objectiveEl = document.getElementById('objective');
    msgBox = document.getElementById('interaction-msg');
    vignetteEl = document.getElementById('vignette');
    flashEl = document.getElementById('flash');
    jumpEl = document.getElementById('jumpscare');
    caughtEl = document.getElementById('caught-screen');
    fadeEl = document.getElementById('fade');
    winScreen = document.getElementById('win-screen');
    compass = document.getElementById('compass');
    compassArrow = document.getElementById('compass-arrow');
    compassDist = document.getElementById('compass-dist');

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x111006, 4, 34);

    camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.domElement.id = 'webgl';
    document.body.appendChild(renderer.domElement);

    // luzes persistentes (cor/intensidade são ajustadas por tema em buildLevel)
    ambient = new THREE.AmbientLight(0xffffff, 0.32); scene.add(ambient);
    hemi = new THREE.HemisphereLight(0xffffff, 0x111111, 0.25); scene.add(hemi);
    flashlight = new THREE.SpotLight(0xfff3d0, 1.4, 30, 0.55, 0.45, 1.1);
    flashTarget = new THREE.Object3D(); scene.add(flashTarget);
    flashlight.target = flashTarget; scene.add(flashlight);

    // ---- monstro: alto, esquelético, pálido-escuro ("Smiler" alongado) ----
    monster = new THREE.Group();
    mBodyMat = new THREE.MeshLambertMaterial({ color: 0x0b0b0c });

    // pernas finas e longas (estáticas)
    const legGeo = new THREE.CylinderGeometry(0.1, 0.06, 1.5, 6); legGeo.translate(0, -0.75, 0);
    const legL = new THREE.Mesh(legGeo, mBodyMat); legL.position.set(0.18, 1.45, 0); legL.rotation.x = 0.06; monster.add(legL);
    const legR = new THREE.Mesh(legGeo, mBodyMat); legR.position.set(-0.18, 1.45, 0); legR.rotation.x = -0.06; monster.add(legR);

    // torso alongado, levemente curvado pra frente
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.4, 1.35, 8), mBodyMat);
    torso.position.set(0, 2.05, 0.05); torso.rotation.x = 0.12; monster.add(torso);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.34, 6), mBodyMat);
    neck.position.set(0, 2.62, 0.06); monster.add(neck);

    // CABEÇA (grupo) — crânio + olhos + sorriso brilham juntos
    head = new THREE.Group(); head.position.set(0, 2.82, 0.05);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), mBodyMat); skull.scale.set(1, 1.12, 1); head.add(skull);
    eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff14d });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), eyeMat); eyeL.position.set(0.16, 0.07, 0.33); head.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), eyeMat); eyeR.position.set(-0.16, 0.07, 0.33); head.add(eyeR);
    const grin = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 8, 18, Math.PI), eyeMat);
    grin.position.set(0, -0.12, 0.33); grin.rotation.z = Math.PI; head.add(grin);
    // "dentes" — pequenos cubos ao longo do sorriso
    for (let k = -3; k <= 3; k++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.02), eyeMat);
      tooth.position.set(k * 0.055, -0.06, 0.35); head.add(tooth);
    }
    const eyeGlow = new THREE.PointLight(0xfff14d, 0.8, 6); eyeGlow.position.set(0, 0, 0.25); head.add(eyeGlow);
    monster.add(head);

    // braços MUITO longos, com pivô no ombro (grupos) — pendem quase até o chão
    const armGeo = new THREE.CylinderGeometry(0.08, 0.05, 1.95, 6); armGeo.translate(0, -0.97, 0);
    function makeArm(sx) {
      const g = new THREE.Group(); g.position.set(sx * 0.32, 2.5, 0.04);
      const upper = new THREE.Mesh(armGeo, mBodyMat); g.add(upper);
      // garra: dedos longos na ponta
      for (let k = -1; k <= 1; k++) {
        const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.01, 0.4, 5), mBodyMat);
        finger.position.set(k * 0.07, -1.9, 0.04); finger.rotation.x = 0.4; g.add(finger);
      }
      return g;
    }
    armL = makeArm(1); monster.add(armL);
    armR = makeArm(-1); monster.add(armR);

    monster.visible = false; scene.add(monster);

    // jumpscare
    jumpEl.style.backgroundImage = 'url(' + makeScareFace() + ')';

    setupControls();
    buildLevel(0);
  }

  // ----------------------------------------------------------------
  //  CONSTRUÇÃO DE UM NÍVEL (chamada a cada Backrooms)
  // ----------------------------------------------------------------
  function disposeGroup(g) {
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
  }

  function buildLevel(index) {
    currentLevel = index;
    theme = LEVELS[index];

    // remove o mundo anterior (libera GPU)
    if (worldGroup) { scene.remove(worldGroup); disposeGroup(worldGroup); }
    worldGroup = new THREE.Group(); scene.add(worldGroup);
    flickerPanels = [];

    // atmosfera do tema
    scene.background = new THREE.Color(theme.fog);
    scene.fog.color.set(theme.fog); scene.fog.near = theme.fogNear; scene.fog.far = theme.fogFar;
    ambient.color.set(theme.ambientCol); ambient.intensity = theme.ambientBase;
    hemi.color.set(theme.hemiSky); hemi.groundColor.set(theme.hemiGround); hemi.intensity = theme.hemiI;
    flashlight.color.set(theme.flashCol);
    Monster.speed = theme.monsterSpeed;

    // materiais do tema
    const wallMat = new THREE.MeshLambertMaterial({ map: theme.wallTex() });
    const floorMat = new THREE.MeshLambertMaterial({ map: theme.floorTex() });
    const ceilMat = new THREE.MeshLambertMaterial({ map: theme.ceilTex() });
    panelMat = new THREE.MeshBasicMaterial({ color: theme.panelOn });
    panelDeadMat = new THREE.MeshBasicMaterial({ color: theme.panelOff });

    // labirinto
    const maze = generateMaze(theme.cols, theme.rows);
    grid = maze.grid; GW = maze.W; GH = maze.H;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(GW * tileSize + 40, GH * tileSize + 40), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(GW * tileSize / 2, 0, GH * tileSize / 2); worldGroup.add(floor);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(GW * tileSize + 40, GH * tileSize + 40), ceilMat);
    ceiling.rotation.x = Math.PI / 2; ceiling.position.set(GW * tileSize / 2, wallH, GH * tileSize / 2); worldGroup.add(ceiling);

    const wallGeo = new THREE.BoxGeometry(tileSize, wallH, tileSize);
    const panelGeo = new THREE.PlaneGeometry(tileSize * 0.6, tileSize * 0.6);

    for (let z = 0; z < GH; z++) {
      for (let x = 0; x < GW; x++) {
        if (grid[z][x] === 1) {
          const w = new THREE.Mesh(wallGeo, wallMat);
          w.position.set(x * tileSize, wallH / 2, z * tileSize); worldGroup.add(w);
        } else if ((x + z) % 2 === 0) {
          const dead = Math.random() < theme.deadChance;
          const p = new THREE.Mesh(panelGeo, dead ? panelDeadMat : panelMat);
          p.rotation.x = Math.PI / 2; p.position.set(x * tileSize, wallH - 0.02, z * tileSize);
          worldGroup.add(p);
          if (!dead && Math.random() < theme.panelChance) flickerPanels.push(p);
        }
      }
    }

    startCell = { x: 1, z: 1 };
    exitCell = { x: GW - 2, z: GH - 2 };
    grid[exitCell.z][exitCell.x] = 0;

    const exitGroup = new THREE.Group();
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.0, 0.3), new THREE.MeshBasicMaterial({ color: 0x0a2a10 }));
    door.position.y = 1.5; exitGroup.add(door);
    frame = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.3, 0.15), new THREE.MeshBasicMaterial({ color: 0x33ff66 }));
    frame.position.y = 1.55; frame.position.z = -0.1; exitGroup.add(frame);
    exitLight = new THREE.PointLight(0x44ff77, 2.4, 28); exitLight.position.y = 2.2; exitGroup.add(exitLight);
    const pillarMat = new THREE.MeshBasicMaterial({ color: 0x4dff8a });
    const pL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.2, 0.16), pillarMat); pL.position.set(-1.3, 1.6, 0); exitGroup.add(pL);
    const pR = pL.clone(); pR.position.x = 1.3; exitGroup.add(pR);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(2.4, 22),
      new THREE.MeshBasicMaterial({ color: 0x1f8a40, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.06; exitGroup.add(halo);
    exitGroup.position.set(exitCell.x * tileSize, 0, exitCell.z * tileSize);
    worldGroup.add(exitGroup);
    exitWorld = { x: exitCell.x * tileSize, z: exitCell.z * tileSize };

    placePlayerAtStart();
    Monster.reset();
    showObjective('▸ ' + theme.name + ' — ENCONTRE A SAÍDA');
    Snd.playMusic(theme.music);   // só toca se o áudio já foi iniciado
  }

  // ----------------------------------------------------------------
  //  CONTROLES & EVENTOS
  // ----------------------------------------------------------------
  function setupControls() {
    startMenu.addEventListener('click', () => {
      document.body.requestPointerLock();
      Snd.init();
      if (Snd.ctx && Snd.ctx.state === 'suspended') Snd.ctx.resume();
      if (theme) Snd.playMusic(theme.music);     // caixinha de som ao fundo
      // garante que o áudio da intro pare
      const ia = document.getElementById('intro-audio');
      if (ia) { try { ia.pause(); } catch (e) {} }
    });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === document.body) {
        if (gameState === 'menu' || gameState === 'caught') {
          startMenu.style.display = 'none';
          crosshair.style.display = 'block';
          hud.style.display = 'block';
          objectiveEl.style.display = 'block';
          compass.style.display = 'flex';
          gameState = 'playing';
        }
      } else {
        if (gameState === 'playing') {
          startMenu.style.display = 'block';
          startMenu.querySelector('.blink').textContent = '▶ CLIQUE PARA CONTINUAR';
          crosshair.style.display = 'none';
          compass.style.display = 'none';
          gameState = 'menu';
        }
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (gameState !== 'playing') return;
      yaw -= e.movementX * SENS;
      pitch -= e.movementY * SENS;
      pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, pitch));
    });

    document.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
    document.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

    addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });

    const winRestart = document.getElementById('win-restart');
    if (winRestart) winRestart.addEventListener('click', () => location.reload());
  }

  // ----------------------------------------------------------------
  //  API PÚBLICA
  // ----------------------------------------------------------------
  function revealMenu() {
    startMenu.style.display = 'block';
    startMenu.querySelector('.blink').textContent = '▶ CLIQUE PARA ACORDAR';
    if (!loopStarted) { loopStarted = true; prevT = performance.now(); animate(); }
  }

  return { init, revealMenu };
})();
