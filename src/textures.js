/* ============================================================
   THE BACKROOMS — texturas procedurais
   ------------------------------------------------------------
   Tudo é desenhado em <canvas> na hora (sem imagens externas).
   As texturas de superfície são "tileáveis" (repetem sem
   emenda) e foram pensadas em escala real:
     papel de parede / carpete / forro -> 512 px = 2,4 m
   ============================================================ */
(function (BR) {
  'use strict';
  const U = BR.U;
  const Tex = (BR.Tex = {});

  // ----------------------------------------------------------
  //  Ruído rápido (tabela de retícula + interpolação)
  // ----------------------------------------------------------
  function lattice(per, seed) {
    const a = new Float32Array(per * per);
    for (let y = 0; y < per; y++) for (let x = 0; x < per; x++) a[y * per + x] = U.hash2(x, y, seed);
    return a;
  }
  // campo fbm size x size, valores 0..1, periódico
  function fbmField(size, basePer, octaves, seed) {
    const out = new Float32Array(size * size);
    let amp = 0.5, norm = 0, per = basePer;
    for (let o = 0; o < octaves; o++) {
      const lat = lattice(per, seed + o * 31);
      const scale = per / size;
      for (let y = 0; y < size; y++) {
        const fy = y * scale, yi = Math.floor(fy), yf = fy - yi;
        const v = yf * yf * (3 - 2 * yf);
        const y0 = yi % per, y1 = (yi + 1) % per;
        for (let x = 0; x < size; x++) {
          const fx = x * scale, xi = Math.floor(fx), xf = fx - xi;
          const u = xf * xf * (3 - 2 * xf);
          const x0 = xi % per, x1 = (xi + 1) % per;
          const a = lat[y0 * per + x0], b = lat[y0 * per + x1];
          const c = lat[y1 * per + x0], d = lat[y1 * per + x1];
          out[y * size + x] += amp * (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v);
        }
      }
      norm += amp; amp *= 0.5; per *= 2;
    }
    for (let i = 0; i < out.length; i++) out[i] /= norm;
    return out;
  }
  Tex.fbmField = fbmField;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h || w;
    return c;
  }

  // pinta um campo base: cor * (variação de brilho por ruídos)
  function paintBase(c, rgb, layers, grain) {
    const x = c.getContext('2d');
    const W = c.width, H = c.height;
    const img = x.createImageData(W, H);
    const d = img.data;
    for (let i = 0, p = 0; i < W * H; i++, p += 4) {
      let k = 1;
      for (const L of layers) k *= 1 + (L.f[i] - 0.5) * L.amt;
      if (grain) k *= 1 + (Math.random() - 0.5) * grain;
      d[p] = rgb[0] * k; d[p + 1] = rgb[1] * k; d[p + 2] = rgb[2] * k; d[p + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return x;
  }

  // mancha irregular (água, umidade) — usa composição "multiply"
  function stain(x, cx, cy, r, rgba, rings, k) {
    k = k == null ? 1 : k;
    x.save();
    x.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 9; i++) {
      const ox = cx + (Math.random() - 0.5) * r * 0.9, oy = cy + (Math.random() - 0.5) * r * 0.9;
      const rr = r * (0.35 + Math.random() * 0.55);
      const g = x.createRadialGradient(ox, oy, rr * 0.1, ox, oy, rr);
      g.addColorStop(0, rgba(0.22 * k));
      g.addColorStop(rings ? 0.85 : 0.7, rgba((rings ? 0.30 : 0.12) * k));
      g.addColorStop(1, rgba(0));
      x.fillStyle = g;
      x.beginPath(); x.arc(ox, oy, rr, 0, Math.PI * 2); x.fill();
    }
    x.restore();
  }
  // desenha uma forma "dando a volta" nas bordas (para manter a textura tileável)
  function wrapDraw(c, fn, cx, cy, r) {
    const W = c.width, H = c.height;
    for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) {
      if (cx + ox + r < 0 || cx + ox - r > W || cy + oy + r < 0 || cy + oy - r > H) continue;
      fn(cx + ox, cy + oy);
    }
  }

  // ----------------------------------------------------------
  //  NÍVEL 0 — papel de parede amarelo-mostarda
  // ----------------------------------------------------------
  Tex.wallpaper = function () {
    const S = 512, c = canvas(S);
    const big = fbmField(S, 4, 5, 11), fine = fbmField(S, 48, 2, 12);
    const x = paintBase(c, [201, 182, 108], [{ f: big, amt: 0.22 }, { f: fine, amt: 0.07 }], 0.05);

    // listras verticais finas + ornamento discreto (padrão clássico do Nível 0)
    for (let i = 0; i < S; i += 32) {
      x.fillStyle = 'rgba(255,240,190,0.07)'; x.fillRect(i + 2, 0, 12, S);
      x.fillStyle = 'rgba(90,70,20,0.10)'; x.fillRect(i + 15, 0, 1, S);
      x.fillStyle = 'rgba(90,70,20,0.06)'; x.fillRect(i + 29, 0, 1, S);
      for (let y = 10; y < S; y += 24) {
        x.fillStyle = 'rgba(110,88,30,0.11)';
        x.beginPath();
        x.moveTo(i + 22, y); x.lineTo(i + 25, y + 4); x.lineTo(i + 22, y + 8); x.lineTo(i + 19, y + 4);
        x.closePath(); x.fill();
      }
    }
    // emendas entre as faixas de papel
    for (const sx of [0, 256]) {
      x.fillStyle = 'rgba(60,45,10,0.25)'; x.fillRect(sx, 0, 1, S);
      x.fillStyle = 'rgba(255,245,200,0.12)'; x.fillRect(sx + 1, 0, 1, S);
    }
    // escorridos de infiltração vindos do teto
    x.save(); x.globalCompositeOperation = 'multiply';
    for (let k = 0; k < 3; k++) {
      let px = Math.random() * S, py = -10;
      const len = 90 + Math.random() * 260;
      let w = 18 + Math.random() * 30;
      for (let s = 0; s < len; s += 4) {
        px += (Math.random() - 0.5) * 3;
        const a = 0.03 * (1 - s / len);
        const g = x.createRadialGradient(px, py + s, 1, px, py + s, w);
        g.addColorStop(0, 'rgba(120,85,30,' + a + ')');
        g.addColorStop(0.8, 'rgba(105,70,20,' + a * 1.3 + ')');
        g.addColorStop(1, 'rgba(105,70,20,0)');
        x.fillStyle = g; x.beginPath(); x.arc(px, py + s, w, 0, 7); x.fill();
        w *= 0.985;
      }
    }
    x.restore();
    // sujeira junto ao rodapé (parte de baixo do canvas = chão)
    const gb = x.createLinearGradient(0, S - 70, 0, S);
    gb.addColorStop(0, 'rgba(40,30,5,0)'); gb.addColorStop(1, 'rgba(40,30,5,0.30)');
    x.fillStyle = gb; x.fillRect(0, S - 70, S, 70);
    // bolor
    for (let k = 0; k < 3; k++) {
      const cx = Math.random() * S, cy = S - 10 - Math.random() * 90;
      for (let i = 0; i < 60; i++) {
        x.fillStyle = 'rgba(40,45,25,' + (0.08 + Math.random() * 0.2) + ')';
        const r = Math.random() * 2.2;
        x.beginPath(); x.arc(cx + (Math.random() - 0.5) * 40, cy + (Math.random() - 0.5) * 30, r, 0, 7); x.fill();
      }
    }
    return c;
  };

  // ----------------------------------------------------------
  //  NÍVEL 0 — carpete úmido
  // ----------------------------------------------------------
  Tex.carpet = function () {
    const S = 512, c = canvas(S);
    const big = fbmField(S, 3, 5, 21), mid = fbmField(S, 24, 3, 22);
    const x = paintBase(c, [134, 116, 64], [{ f: big, amt: 0.30 }, { f: mid, amt: 0.14 }], 0.22);
    // manchas de umidade (escuras, com borda)
    for (let k = 0; k < 4; k++) {
      const cx = Math.random() * S, cy = Math.random() * S, r = 30 + Math.random() * 70;
      wrapDraw(c, (X, Y) => stain(x, X, Y, r, (a) => 'rgba(80,60,25,' + a + ')', true, 0.35), cx, cy, r);
    }
    // fibras: riscos curtos
    x.save(); x.globalAlpha = 0.06;
    for (let i = 0; i < 9000; i++) {
      const px = Math.random() * S, py = Math.random() * S, a = Math.random() * 6.28;
      x.strokeStyle = Math.random() < 0.5 ? '#000' : '#e8d9a0';
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * 2.5, py + Math.sin(a) * 2.5); x.stroke();
    }
    x.restore();
    return c;
  };

  // ----------------------------------------------------------
  //  NÍVEL 0 — forro de placas acústicas (4x4 placas de 60 cm)
  // ----------------------------------------------------------
  Tex.ceiling = function () {
    const S = 512, c = canvas(S), T = 128;
    const big = fbmField(S, 4, 4, 31);
    const x = paintBase(c, [218, 210, 186], [{ f: big, amt: 0.10 }], 0.04);
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
      const ox = tx * T, oy = ty * T;
      const tone = (Math.random() - 0.5) * 0.08;
      x.fillStyle = tone > 0 ? 'rgba(255,255,240,' + tone + ')' : 'rgba(60,50,20,' + -tone + ')';
      x.fillRect(ox, oy, T, T);
      // furinhos e fissuras (placa acústica)
      for (let i = 0; i < 260; i++) {
        x.fillStyle = 'rgba(70,62,40,' + (0.15 + Math.random() * 0.3) + ')';
        x.fillRect(ox + Math.random() * T, oy + Math.random() * T, 1 + Math.random(), 1 + Math.random());
      }
      x.strokeStyle = 'rgba(80,70,45,0.22)'; x.lineWidth = 1;
      for (let i = 0; i < 14; i++) {
        let px = ox + Math.random() * T, py = oy + Math.random() * T;
        x.beginPath(); x.moveTo(px, py);
        for (let j = 0; j < 3; j++) { px += (Math.random() - 0.5) * 8; py += (Math.random() - 0.5) * 8; x.lineTo(px, py); }
        x.stroke();
      }
      // placas com infiltração
      if (Math.random() < 0.07) {
        stain(x, ox + T / 2 + (Math.random() - 0.5) * 40, oy + T / 2 + (Math.random() - 0.5) * 40, 25 + Math.random() * 35,
          (a) => 'rgba(160,120,60,' + a + ')', true, 0.5);
      }
    }
    // perfis "T" da grade
    for (let i = 0; i <= S; i += T) {
      x.fillStyle = '#b9b29c'; x.fillRect(i - 3, 0, 6, S); x.fillRect(0, i - 3, S, 6);
      x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(i + 3, 0, 1, S); x.fillRect(0, i + 3, S, 1);
    }
    return c;
  };

  // difusor das luminárias fluorescentes
  Tex.lampDiffuser = function () {
    const c = canvas(64, 128), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 64, 128);
    for (let y = 0; y < 128; y += 4) for (let i = 0; i < 64; i += 4) {
      x.fillStyle = 'rgba(200,200,190,' + (0.12 + ((i + y) % 8 === 0 ? 0.08 : 0)) + ')';
      x.fillRect(i, y, 1, 4); x.fillRect(i, y, 4, 1);
    }
    // entre os tubos fluorescentes o difusor fica um pouco mais escuro
    for (const tx of [0, 32, 64]) {
      const g = x.createLinearGradient(tx - 10, 0, tx + 10, 0);
      g.addColorStop(0, 'rgba(150,145,130,0)'); g.addColorStop(0.5, 'rgba(150,145,130,0.22)'); g.addColorStop(1, 'rgba(150,145,130,0)');
      x.fillStyle = g; x.fillRect(tx - 10, 0, 20, 128);
    }
    const e = x.createLinearGradient(0, 0, 64, 0);
    e.addColorStop(0, 'rgba(120,115,100,0.5)'); e.addColorStop(0.12, 'rgba(0,0,0,0)');
    e.addColorStop(0.88, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(120,115,100,0.5)');
    x.fillStyle = e; x.fillRect(0, 0, 64, 128);
    return c;
  };

  // ruído grande em escala de cinza (quebra a repetição no shader)
  Tex.dirt = function () {
    const S = 256, c = canvas(S);
    const f = fbmField(S, 4, 6, 41);
    const x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data;
    for (let i = 0, p = 0; i < S * S; i++, p += 4) {
      const v = U.clamp((f[i] - 0.5) * 1.8 + 0.5, 0, 1) * 255;
      d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  };

  // ----------------------------------------------------------
  //  NÍVEL 1 — concreto
  // ----------------------------------------------------------
  Tex.concreteWall = function () {
    const S = 512, c = canvas(S);
    const big = fbmField(S, 4, 6, 51), mid = fbmField(S, 32, 3, 52);
    const x = paintBase(c, [126, 126, 122], [{ f: big, amt: 0.35 }, { f: mid, amt: 0.15 }], 0.10);
    // juntas de fôrma e furos de tirante
    x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(0, 255, S, 2); x.fillRect(255, 0, 2, S);
    x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(0, 257, S, 1); x.fillRect(257, 0, 1, S);
    for (const py of [64, 192, 320, 448]) for (const px of [64, 192, 320, 448]) {
      const g = x.createRadialGradient(px, py, 0, px, py, 7);
      g.addColorStop(0, 'rgba(10,10,10,0.8)'); g.addColorStop(0.6, 'rgba(30,30,30,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, 7, 0, 7); x.fill();
      // escorrido de ferrugem saindo do furo
      if (Math.random() < 0.5) {
        const gr = x.createLinearGradient(0, py, 0, py + 60 + Math.random() * 80);
        gr.addColorStop(0, 'rgba(110,60,20,0.30)'); gr.addColorStop(1, 'rgba(110,60,20,0)');
        x.fillStyle = gr; x.fillRect(px - 2, py, 4, 140);
      }
    }
    // escorridos de água a partir da junta horizontal
    for (let k = 0; k < 18; k++) {
      const px = Math.random() * S, top = Math.random() < 0.5 ? 0 : 257, len = 40 + Math.random() * 200;
      const g = x.createLinearGradient(0, top, 0, top + len);
      g.addColorStop(0, 'rgba(20,25,20,0.28)'); g.addColorStop(1, 'rgba(20,25,20,0)');
      x.fillStyle = g; x.fillRect(px, top, 2 + Math.random() * 5, len);
    }
    // rachaduras
    x.strokeStyle = 'rgba(15,15,15,0.45)'; x.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      let px = Math.random() * S, py = Math.random() * S;
      x.beginPath(); x.moveTo(px, py);
      for (let j = 0; j < 7; j++) { px += (Math.random() - 0.5) * 40; py += Math.random() * 30; x.lineTo(px, py); }
      x.stroke();
    }
    return c;
  };
  Tex.concreteFloor = function () {
    const S = 512, c = canvas(S);
    const big = fbmField(S, 3, 6, 61), mid = fbmField(S, 40, 3, 62);
    const x = paintBase(c, [92, 92, 90], [{ f: big, amt: 0.42 }, { f: mid, amt: 0.16 }], 0.12);
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, 0, S, 2); x.fillRect(0, 0, 2, S); // juntas de dilatação
    for (let k = 0; k < 5; k++) {
      const cx = Math.random() * S, cy = Math.random() * S, r = 20 + Math.random() * 60;
      wrapDraw(c, (X, Y) => stain(x, X, Y, r, (a) => 'rgba(30,28,24,' + a + ')', false), cx, cy, r);
    }
    x.strokeStyle = 'rgba(10,10,10,0.5)'; x.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      let px = Math.random() * S, py = Math.random() * S;
      x.beginPath(); x.moveTo(px, py);
      for (let j = 0; j < 8; j++) { px += (Math.random() - 0.5) * 50; py += (Math.random() - 0.5) * 50; x.lineTo(px, py); }
      x.stroke();
    }
    return c;
  };
  Tex.concreteCeil = function () {
    const S = 256, c = canvas(S);
    const big = fbmField(S, 4, 5, 71);
    const x = paintBase(c, [80, 80, 78], [{ f: big, amt: 0.4 }], 0.12);
    x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(0, 0, S, 3);
    return c;
  };

  // ----------------------------------------------------------
  //  Objetos
  // ----------------------------------------------------------
  Tex.paper = function (lines) {
    const c = canvas(128, 160), x = c.getContext('2d');
    x.fillStyle = '#d9d2b6'; x.fillRect(0, 0, 128, 160);
    const g = x.createRadialGradient(64, 80, 20, 64, 80, 110);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(90,70,20,0.35)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 160);
    x.strokeStyle = 'rgba(40,40,60,0.6)'; x.lineWidth = 1.2;
    for (let i = 0; i < (lines || 9); i++) {
      const y = 22 + i * 14; let px = 12;
      x.beginPath(); x.moveTo(px, y);
      while (px < 110 - Math.random() * 30) { px += 3 + Math.random() * 5; x.lineTo(px, y + (Math.random() - 0.5) * 3); }
      x.stroke();
    }
    return c;
  };
  Tex.metalPanel = function (label) {
    const c = canvas(128, 192), x = c.getContext('2d');
    const f = fbmField(64, 8, 3, 81);
    x.fillStyle = '#8c9092'; x.fillRect(0, 0, 128, 192);
    for (let i = 0; i < 64; i++) for (let j = 0; j < 96; j++) {
      x.fillStyle = 'rgba(0,0,0,' + (f[(j % 64) * 64 + i] * 0.25) + ')'; x.fillRect(i * 2, j * 2, 2, 2);
    }
    x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 3; x.strokeRect(6, 6, 116, 180);
    x.fillStyle = '#e8d24a'; x.fillRect(16, 16, 96, 26);
    for (let i = 0; i < 6; i++) { x.fillStyle = '#111'; x.beginPath(); x.moveTo(16 + i * 18, 16); x.lineTo(26 + i * 18, 16); x.lineTo(16 + i * 18 + 6, 42); x.lineTo(16 + i * 18 - 4, 42); x.fill(); }
    x.fillStyle = '#ddd'; x.fillRect(20, 150, 88, 22);
    x.fillStyle = '#222'; x.font = 'bold 14px monospace'; x.textAlign = 'center';
    x.fillText(label || 'DISJ.', 64, 166);
    // ferrugem
    for (let i = 0; i < 6; i++) stain(x, Math.random() * 128, Math.random() * 192, 10 + Math.random() * 20, (a) => 'rgba(120,60,20,' + a + ')', false);
    return c;
  };
  Tex.exitSign = function (on) {
    const c = canvas(256, 96), x = c.getContext('2d');
    x.fillStyle = on ? '#062a10' : '#101410'; x.fillRect(0, 0, 256, 96);
    x.fillStyle = on ? '#5dff8e' : '#253a2a';
    x.font = 'bold 54px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('SAÍDA', 128, 50);
    x.strokeStyle = on ? '#3fd06a' : '#1c2a1e'; x.lineWidth = 4; x.strokeRect(4, 4, 248, 88);
    return c;
  };
  Tex.door = function () {
    const c = canvas(256, 512), x = c.getContext('2d');
    const f = fbmField(128, 6, 4, 91);
    x.fillStyle = '#5f6a62'; x.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 128; i++) for (let j = 0; j < 256; j++) {
      x.fillStyle = 'rgba(0,0,0,' + (f[(j % 128) * 128 + i] * 0.3) + ')'; x.fillRect(i * 2, j * 2, 2, 2);
    }
    x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 4; x.strokeRect(20, 20, 216, 472);
    x.fillStyle = '#2b2f2c'; x.fillRect(20, 250, 216, 22);   // barra antipânico
    x.fillStyle = '#9aa29c'; x.fillRect(24, 254, 208, 6);
    for (let i = 0; i < 8; i++) stain(x, Math.random() * 256, 300 + Math.random() * 212, 15 + Math.random() * 30, (a) => 'rgba(100,55,20,' + a + ')', false);
    return c;
  };
  Tex.wood = function () {
    const c = canvas(256), x = c.getContext('2d');
    for (let p = 0; p < 4; p++) {
      const base = 120 + Math.random() * 25;
      x.fillStyle = 'rgb(' + base + ',' + (base * 0.78) + ',' + (base * 0.5) + ')';
      x.fillRect(0, p * 64, 256, 62);
      for (let i = 0; i < 40; i++) {
        x.strokeStyle = 'rgba(60,35,10,' + (0.08 + Math.random() * 0.15) + ')';
        const y = p * 64 + Math.random() * 62;
        x.beginPath(); x.moveTo(0, y);
        for (let k = 0; k <= 256; k += 32) x.lineTo(k, y + (Math.random() - 0.5) * 4);
        x.stroke();
      }
      x.fillStyle = 'rgba(20,10,0,0.7)'; x.fillRect(0, p * 64 + 62, 256, 2);
      x.fillStyle = '#333'; for (const nx of [12, 244]) { x.beginPath(); x.arc(nx, p * 64 + 31, 3, 0, 7); x.fill(); }
    }
    return c;
  };
  Tex.cardboard = function () {
    const c = canvas(256), x = c.getContext('2d');
    const f = fbmField(128, 8, 3, 101);
    x.fillStyle = '#a07c4c'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 128; i++) for (let j = 0; j < 128; j++) { x.fillStyle = 'rgba(60,35,10,' + f[j * 128 + i] * 0.25 + ')'; x.fillRect(i * 2, j * 2, 2, 2); }
    x.fillStyle = 'rgba(200,170,110,0.6)'; x.fillRect(0, 118, 256, 20); // fita
    x.fillStyle = 'rgba(30,20,10,0.6)'; x.font = 'bold 20px monospace'; x.fillText('FRÁGIL ↑', 60, 200);
    stain(x, 180, 60, 40, (a) => 'rgba(70,45,15,' + a + ')', true);
    return c;
  };
  Tex.radio = function () {
    const c = canvas(256, 128), x = c.getContext('2d');
    x.fillStyle = '#5a3a1e'; x.fillRect(0, 0, 256, 128);
    x.fillStyle = '#2a2016'; x.fillRect(14, 14, 120, 100);
    for (let i = 18; i < 132; i += 6) for (let j = 18; j < 112; j += 6) { x.fillStyle = '#0d0a07'; x.beginPath(); x.arc(i, j, 1.8, 0, 7); x.fill(); }
    x.fillStyle = '#d8c79a'; x.fillRect(146, 20, 96, 34);
    x.strokeStyle = '#333'; for (let i = 150; i < 240; i += 8) { x.beginPath(); x.moveTo(i, 40); x.lineTo(i, 52); x.stroke(); }
    x.fillStyle = '#b00'; x.fillRect(190, 22, 2, 30);
    x.fillStyle = '#1b1b1b'; for (const kx of [170, 222]) { x.beginPath(); x.arc(kx, 88, 14, 0, 7); x.fill(); }
    return c;
  };
  Tex.wetSign = function () {
    const c = canvas(128, 192), x = c.getContext('2d');
    x.fillStyle = '#e6c21a'; x.fillRect(0, 0, 128, 192);
    x.fillStyle = '#111'; x.font = 'bold 15px Arial'; x.textAlign = 'center';
    x.fillText('CUIDADO', 64, 40); x.fillText('PISO', 64, 150); x.fillText('MOLHADO', 64, 168);
    x.beginPath(); x.moveTo(64, 56); x.lineTo(100, 124); x.lineTo(28, 124); x.closePath(); x.lineWidth = 5; x.stroke();
    x.beginPath(); x.arc(64, 84, 8, 0, 7); x.fill(); x.fillRect(58, 92, 12, 18);
    return c;
  };
  // pele da entidade: quase preta, manchada, com veias
  Tex.skin = function () {
    const S = 256, c = canvas(S);
    const f = fbmField(S, 6, 5, 111), g = fbmField(S, 30, 2, 112);
    const x = paintBase(c, [34, 31, 30], [{ f, amt: 0.9 }, { f: g, amt: 0.3 }], 0.15);
    x.strokeStyle = 'rgba(70,20,25,0.35)'; x.lineWidth = 1.3;
    for (let i = 0; i < 26; i++) {
      let px = Math.random() * S, py = Math.random() * S;
      x.beginPath(); x.moveTo(px, py);
      for (let j = 0; j < 6; j++) { px += (Math.random() - 0.5) * 30; py += (Math.random() - 0.5) * 30; x.lineTo(px, py); }
      x.stroke();
    }
    return c;
  };
  Tex.white = function () {
    const c = canvas(4), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 4, 4);
    return c;
  };

  // ----------------------------------------------------------
  //  Conversão para THREE.Texture
  // ----------------------------------------------------------
  Tex.toTexture = function (c, opts) {
    opts = opts || {};
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    if (opts.aniso) t.anisotropy = opts.aniso;
    t.needsUpdate = true;
    return t;
  };
})(window.BR);
