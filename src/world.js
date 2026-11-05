/* ============================================================
   THE BACKROOMS — mundo
   ------------------------------------------------------------
   * Geração do layout em grade (cada célula = 1,2 m):
       divisão recursiva com vãos/portas -> salas irregulares,
       corredores, salões com pilares e paredes soltas — muito
       mais "Nível 0" do que um labirinto perfeito.
   * Luminárias em grade regular (como num prédio de verdade),
     com zonas apagadas, lâmpadas mortas e piscando.
   * Lightmap assado com oclusão (DDA na grade) + GI borrada.
   * Geometria mesclada (poucas draw calls), AO por vértice,
     rodapés, buracos no forro, caixotes, poças.
   * Navegação: colisão círculo x grade, linha de visão (DDA),
     A* 8 direções, suavização de caminho, campo de distâncias.
   ============================================================ */
(function (BR) {
  'use strict';
  const U = BR.U;
  const T = 1.2;               // tamanho da célula (m)
  const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const DIRS8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];

  // ==========================================================
  //  GERAÇÃO DO LAYOUT
  // ==========================================================
  function generateLayout(N, o) {
    const g = new Uint8Array(N * N);
    const at = (x, z) => (x < 0 || z < 0 || x >= N || z >= N ? 1 : g[z * N + x]);
    const set = (x, z, v) => { g[z * N + x] = v; };
    for (let i = 0; i < N; i++) { set(i, 0, 1); set(i, N - 1, 1); set(0, i, 1); set(N - 1, i, 1); }
    const leaves = [];
    const minS = o.minRoom;

    function divide(x0, z0, x1, z1, depth) {
      const w = x1 - x0 + 1, h = z1 - z0 + 1;
      const canH = h >= minS * 2 + 1, canV = w >= minS * 2 + 1;
      if (!canH && !canV) { leaves.push([x0, z0, x1, z1]); return; }
      if (depth >= 2 && w * h <= o.stopArea && Math.random() < o.stopChance) { leaves.push([x0, z0, x1, z1]); return; }
      let horiz = canH && (!canV || h > w || (h === w && Math.random() < 0.5));
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt === 1) horiz = !horiz;
        if ((horiz && !canH) || (!horiz && !canV)) continue;
        const cands = [];
        if (horiz) { for (let c = z0 + minS; c <= z1 - minS; c++) if (at(x0 - 1, c) !== 0 && at(x1 + 1, c) !== 0) cands.push(c); }
        else { for (let c = x0 + minS; c <= x1 - minS; c++) if (at(c, z0 - 1) !== 0 && at(c, z1 + 1) !== 0) cands.push(c); }
        if (!cands.length) continue;
        const c = U.pick(cands);
        const len = horiz ? w : h;
        for (let i = 0; i < len; i++) horiz ? set(x0 + i, c, 1) : set(c, z0 + i, 1);
        const nOpen = 1 + (len > 12 ? 1 : 0) + (len > 22 ? 1 : 0) + (Math.random() < o.extraOpen ? 1 : 0);
        for (let k = 0; k < nOpen; k++) {
          const gw = Math.random() < o.doorChance ? 1 : U.randInt(2, Math.min(o.maxGap, len - 1));
          const s = U.randInt(0, len - gw);
          for (let i = 0; i < gw; i++) horiz ? set(x0 + s + i, c, 0) : set(c, z0 + s + i, 0);
        }
        if (horiz) { divide(x0, z0, x1, c - 1, depth + 1); divide(x0, c + 1, x1, z1, depth + 1); }
        else { divide(x0, z0, c - 1, z1, depth + 1); divide(c + 1, z0, x1, z1, depth + 1); }
        return;
      }
      leaves.push([x0, z0, x1, z1]);
    }
    divide(1, 1, N - 2, N - 2, 0);

    const free8 = (x, z) => {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, z + dz) !== 0) return false;
      return true;
    };
    // pilares, paredes soltas e caixotes nas salas grandes
    for (const [x0, z0, x1, z1] of leaves) {
      const w = x1 - x0 + 1, h = z1 - z0 + 1;
      if (w >= 7 && h >= 7 && Math.random() < o.pillarChance) {
        const sp = U.randInt(o.pillarSpacing[0], o.pillarSpacing[1]);
        for (let z = z0 + 2; z <= z1 - 2; z += sp) for (let x = x0 + 2; x <= x1 - 2; x += sp) if (free8(x, z)) set(x, z, 1);
      }
      if (w >= 6 && h >= 6 && Math.random() < o.stubChance) {
        const horiz = Math.random() < 0.5, len = U.randInt(2, 4);
        const sx = U.randInt(x0 + 2, x1 - 2 - (horiz ? len : 0)), sz = U.randInt(z0 + 2, z1 - 2 - (horiz ? 0 : len));
        let ok = true;
        for (let i = 0; i < len && ok; i++) if (!free8(horiz ? sx + i : sx, horiz ? sz : sz + i)) ok = false;
        if (ok) for (let i = 0; i < len; i++) set(horiz ? sx + i : sx, horiz ? sz : sz + i, 1);
      }
      if (o.crateChance && w >= 6 && h >= 6) {
        const n = Math.random() < o.crateChance ? U.randInt(1, 3) : 0;
        for (let k = 0; k < n; k++) {
          const cw = U.randInt(1, 2), ch = U.randInt(1, 3);
          const cx = U.randInt(x0 + 1, Math.max(x0 + 1, x1 - cw)), cz = U.randInt(z0 + 1, Math.max(z0 + 1, z1 - ch));
          let ok = true;
          for (let dz = -1; dz <= ch && ok; dz++) for (let dx = -1; dx <= cw && ok; dx++) if (at(cx + dx, cz + dz) !== 0) ok = false;
          if (ok) for (let dz = 0; dz < ch; dz++) for (let dx = 0; dx < cw; dx++) set(cx + dx, cz + dz, 2);
        }
      }
    }
    // mais laços (rotas de fuga e de flanqueio)
    for (let i = 0; i < N * N * o.loopFrac; i++) {
      const x = U.randInt(2, N - 3), z = U.randInt(2, N - 3);
      if (at(x, z) !== 1) continue;
      if ((at(x - 1, z) === 0 && at(x + 1, z) === 0 && at(x, z - 1) === 1 && at(x, z + 1) === 1) ||
          (at(x, z - 1) === 0 && at(x, z + 1) === 0 && at(x - 1, z) === 1 && at(x + 1, z) === 1)) set(x, z, 0);
    }
    return g;
  }

  // ==========================================================
  //  Construtor de geometria mesclada
  // ==========================================================
  function GB() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.extra = null; }
  GB.prototype.vert = function (x, y, z, nx, ny, nz, u, v, c) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.u.push(u, v);
    if (typeof c === 'number') this.c.push(c, c, c); else this.c.push(c[0], c[1], c[2]);
    return this.p.length / 3 - 1;
  };
  // a,b,c,d em ordem anti-horária vista pelo lado da normal
  GB.prototype.quad = function (a, b, c, d, n, uv, col) {
    uv = uv || [0, 0, 1, 0, 1, 1, 0, 1];
    col = col || [1, 1, 1, 1];
    const s = this.vert(a[0], a[1], a[2], n[0], n[1], n[2], uv[0], uv[1], col[0]);
    this.vert(b[0], b[1], b[2], n[0], n[1], n[2], uv[2], uv[3], col[1]);
    this.vert(c[0], c[1], c[2], n[0], n[1], n[2], uv[4], uv[5], col[2]);
    this.vert(d[0], d[1], d[2], n[0], n[1], n[2], uv[6], uv[7], col[3]);
    this.i.push(s, s + 1, s + 2, s, s + 2, s + 3);
    return s;
  };
  // caixa alinhada aos eixos (min/max), com UV por face escalada em metros/uvm
  GB.prototype.box = function (x0, y0, z0, x1, y1, z1, col, uvm, skipBottom) {
    const m = uvm || 1, c = col == null ? 1 : col, C = [c, c, c, c];
    const ux = (x1 - x0) / m, uy = (y1 - y0) / m, uz = (z1 - z0) / m;
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [0, 0, uz, 0, uz, uy, 0, uy], C);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [0, 0, uz, 0, uz, uy, 0, uy], C);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [0, 0, ux, 0, ux, uy, 0, uy], C);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [0, 0, ux, 0, ux, uy, 0, uy], C);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [0, 0, ux, 0, ux, uz, 0, uz], C);
    if (!skipBottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [0, 0, ux, 0, ux, uz, 0, uz], C);
  };
  // leque (poças) — pts em sentido anti-horário visto de cima
  GB.prototype.fan = function (cx, y, cz, pts, col) {
    const s = this.vert(cx, y, cz, 0, 1, 0, 0.5, 0.5, col);
    for (const [x, z] of pts) this.vert(x, y, z, 0, 1, 0, 0.5 + (x - cx) * 0.3, 0.5 + (z - cz) * 0.3, col);
    for (let k = 0; k < pts.length; k++) this.i.push(s, s + 1 + ((k + 1) % pts.length), s + 1 + k);
  };
  GB.prototype.geometry = function () {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.extra) for (const k in this.extra) g.setAttribute(k, new THREE.Float32BufferAttribute(this.extra[k].data, this.extra[k].size));
    const n = this.p.length / 3;
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i), 1));
    g.computeBoundingSphere();
    return g;
  };
  GB.prototype.mesh = function (mat) {
    const m = new THREE.Mesh(this.geometry(), mat);
    m.matrixAutoUpdate = false;
    return m;
  };
  BR.GB = GB;

  // ==========================================================
  //  Heap binário (A* / Dijkstra)
  // ==========================================================
  function Heap() { this.idx = []; this.key = []; }
  Heap.prototype.push = function (i, k) {
    const a = this.idx, b = this.key;
    let n = a.length; a.push(i); b.push(k);
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (b[p] <= k) break;
      a[n] = a[p]; b[n] = b[p]; n = p;
    }
    a[n] = i; b[n] = k;
  };
  Heap.prototype.pop = function () {
    const a = this.idx, b = this.key;
    const top = a[0];
    const li = a.pop(), lk = b.pop();
    const len = a.length;
    if (len > 0) {
      let n = 0;
      for (;;) {
        let c = 2 * n + 1;
        if (c >= len) break;
        if (c + 1 < len && b[c + 1] < b[c]) c++;
        if (b[c] >= lk) break;
        a[n] = a[c]; b[n] = b[c]; n = c;
      }
      a[n] = li; b[n] = lk;
    }
    return top;
  };
  Heap.prototype.size = function () { return this.idx.length; };

  // ==========================================================
  //  WORLD
  // ==========================================================
  function World(theme, aniso) {
    this.theme = theme;
    this.T = T;
    this.CEIL = theme.ceil;
    this.N = theme.size;
    const N = this.N;
    // layout fixo (escritório, abertura) ou gerado
    const fixed = theme.layout ? theme.layout(N) : null;
    this.grid = fixed ? fixed.grid : generateLayout(N, theme.gen);
    this.zones = fixed ? fixed.zones : {};
    this.group = new THREE.Group();
    this.lamps = [];
    this.puddles = [];
    if (fixed && fixed.start != null) this.start = fixed.start; else this._pickStart();
    this._connect();
    this._planLamps();
    this._bake();
    this._spots();
    this._build(aniso || 1);
    const u = BR.Shading.uniforms;
    u.uLightMap.value = this.lmTex;
    u.uMapSize.value.set(N * T, N * T);
    u.uCeil.value = this.CEIL;
  }
  const W = World.prototype;

  // ---------------- consultas básicas ----------------
  W.idx = function (tx, tz) { return tz * this.N + tx; };
  W.tx = function (x) { return Math.floor(x / T); };
  W.isSolid = function (tx, tz) {
    if (tx < 0 || tz < 0 || tx >= this.N || tz >= this.N) return true;
    return this.grid[tz * this.N + tx] !== 0;
  };
  W.solidAt = function (x, z) { return this.isSolid(Math.floor(x / T), Math.floor(z / T)); };
  W.tileOf = function (x, z) { return this.idx(U.clamp(Math.floor(x / T), 0, this.N - 1), U.clamp(Math.floor(z / T), 0, this.N - 1)); };
  W.center = function (i) { const N = this.N; return { x: ((i % N) + 0.5) * T, z: (Math.floor(i / N) + 0.5) * T }; };

  // ---------------- início e conectividade ----------------
  W._pickStart = function () {
    const N = this.N;
    let best = -1, bestS = 1e9;
    for (let z = 2; z < N - 2; z++) for (let x = 2; x < N - 2; x++) {
      let ok = true;
      for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1 && ok; dx++) if (this.isSolid(x + dx, z + dz)) ok = false;
      if (ok && x + z < bestS) { bestS = x + z; best = this.idx(x, z); }
    }
    if (best < 0) { for (let i = 0; i < N * N; i++) if (this.grid[i] === 0) { best = i; break; } }
    this.start = best;
  };
  W._connect = function () {
    const steps = this.bfsSteps(this.start);
    for (let i = 0; i < this.grid.length; i++) if (this.grid[i] === 0 && steps[i] < 0) this.grid[i] = 1;
    this.stepsFromStart = steps;
  };
  W.bfsSteps = function (s) {
    const N = this.N, d = new Int32Array(N * N).fill(-1);
    const q = new Int32Array(N * N); let h = 0, t = 0;
    d[s] = 0; q[t++] = s;
    while (h < t) {
      const i = q[h++], x = i % N, z = (i / N) | 0;
      for (const [dx, dz] of DIRS4) {
        const nx = x + dx, nz = z + dz;
        if (this.isSolid(nx, nz)) continue;
        const j = nz * N + nx;
        if (d[j] < 0) { d[j] = d[i] + 1; q[t++] = j; }
      }
    }
    return d;
  };

  // ---------------- luminárias ----------------
  W._planLamps = function () {
    const L = this.theme.lamps, N = this.N;
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
      if (x % L.sx !== L.ox || z % L.sz !== L.oz || this.isSolid(x, z)) continue;
      this.lamps.push({ tx: x, tz: z, x: (x + 0.5) * T, z: (z + 0.5) * T, group: 0, v: -1 });
    }
    const sc = this.center(this.start);
    const zones = [];
    for (let k = 0; k < L.darkZones; k++) {
      for (let tries = 0; tries < 40; tries++) {
        const i = U.randInt(0, N * N - 1);
        if (this.grid[i] !== 0) continue;
        const c = this.center(i);
        if (Math.hypot(c.x - sc.x, c.z - sc.z) < 14) continue;
        zones.push({ x: c.x, z: c.z, r: U.rand(L.darkR * 0.7, L.darkR * 1.2) });
        break;
      }
    }
    for (const lp of this.lamps) {
      const r = Math.random();
      if (r < L.dead) lp.group = 3;
      else if (r < L.dead + L.flick) lp.group = Math.random() < 0.5 ? 1 : 2;
      for (const zn of zones) if (Math.hypot(lp.x - zn.x, lp.z - zn.z) < zn.r) lp.group = Math.random() < 0.12 ? 1 + U.randInt(0, 1) : 3;
      if (Math.hypot(lp.x - sc.x, lp.z - sc.z) < 6) lp.group = 0;
      if (this.theme.lampGroup) lp.group = this.theme.lampGroup(lp, lp.group, this);
    }
  };

  // ---------------- lightmap ----------------
  W._lampContrib = function (lp, arr, sign) {
    const L = this.theme.lamps, PPT = this.PPT, LW = this.LW, ps = T / PPT;
    const R = L.radius, h = L.height, I = L.intensity;
    const cx = lp.x / ps, cz = lp.z / ps, Rp = Math.ceil(R / ps);
    const x0 = Math.max(0, Math.floor(cx - Rp)), x1 = Math.min(LW - 1, Math.ceil(cx + Rp));
    const z0 = Math.max(0, Math.floor(cz - Rp)), z1 = Math.min(LW - 1, Math.ceil(cz + Rp));
    for (let iz = z0; iz <= z1; iz++) {
      const wz = (iz + 0.5) * ps, dz = wz - lp.z;
      for (let ix = x0; ix <= x1; ix++) {
        const wx = (ix + 0.5) * ps, dx = wx - lp.x;
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R) continue;
        if (this.isSolid(Math.floor(wx / T), Math.floor(wz / T))) continue;
        if (!this.los(lp.x, lp.z, wx, wz)) continue;
        const r2 = d2 + h * h, r = Math.sqrt(r2);
        const E = (I * h) / (r2 * r) * (1 - U.smooth(R * 0.6, R, Math.sqrt(d2)));
        arr[iz * LW + ix] += sign * E;
      }
    }
  };
  W._bake = function () {
    const N = this.N;
    this.PPT = 3; this.LW = N * this.PPT;
    const n = this.LW * this.LW;
    this.acc = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    this.gi = new Float32Array(n);
    for (const lp of this.lamps) if (lp.group < 3) this._lampContrib(lp, this.acc[lp.group], 1);
    this.lmData = new Uint8Array(n * 4);
    this.lmTex = new THREE.DataTexture(this.lmData, this.LW, this.LW, THREE.RGBAFormat);
    this.lmTex.magFilter = THREE.LinearFilter; this.lmTex.minFilter = THREE.LinearFilter;
    this.lmTex.wrapS = this.lmTex.wrapT = THREE.ClampToEdgeWrapping;
    this._encode();
  };
  function boxBlur(src, W, r) {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let y = 0; y < W; y++) {
      let s = 0;
      for (let x = -r; x <= r; x++) s += src[y * W + U.clamp(x, 0, W - 1)];
      for (let x = 0; x < W; x++) {
        tmp[y * W + x] = s / (2 * r + 1);
        s += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[U.clamp(y, 0, W - 1) * W + x];
      for (let y = 0; y < W; y++) {
        out[y * W + x] = s / (2 * r + 1);
        s += tmp[Math.min(W - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
      }
    }
    return out;
  }
  W._encode = function () {
    const LW = this.LW, n = LW * LW, [S, A, B] = this.acc, d = this.lmData;
    const tot = new Float32Array(n);
    for (let i = 0; i < n; i++) tot[i] = Math.max(0, S[i]) + Math.max(0, A[i]) + Math.max(0, B[i]);
    this.gi = boxBlur(boxBlur(tot, LW, 4), LW, 4);
    const giS = this.theme.lamps.gi;
    const enc = (v) => (v <= 0 ? 0 : v >= 2 ? 255 : (v * 127.5) | 0);
    for (let i = 0; i < n; i++) {
      d[i * 4] = enc(S[i]); d[i * 4 + 1] = enc(A[i]); d[i * 4 + 2] = enc(B[i]); d[i * 4 + 3] = enc(this.gi[i] * giS);
    }
    // dilata para dentro das paredes (evita bordas escuras na interpolação)
    const ps = T / this.PPT, src = d.slice();
    for (let iz = 0; iz < LW; iz++) for (let ix = 0; ix < LW; ix++) {
      if (!this.isSolid(Math.floor(((ix + 0.5) * ps) / T), Math.floor(((iz + 0.5) * ps) / T))) continue;
      const i = iz * LW + ix;
      for (let c = 0; c < 4; c++) {
        let m = 0;
        if (ix > 0) m = Math.max(m, src[(i - 1) * 4 + c]);
        if (ix < LW - 1) m = Math.max(m, src[(i + 1) * 4 + c]);
        if (iz > 0) m = Math.max(m, src[(i - LW) * 4 + c]);
        if (iz < LW - 1) m = Math.max(m, src[(i + LW) * 4 + c]);
        d[i * 4 + c] = m;
      }
    }
    this.lmTex.needsUpdate = true;
  };
  // luz percebida em um ponto (para IA, sanidade e zumbido)
  W.lightAt = function (x, z) {
    const ps = T / this.PPT, LW = this.LW;
    const ix = U.clamp(Math.floor(x / ps), 0, LW - 1), iz = U.clamp(Math.floor(z / ps), 0, LW - 1);
    const i = iz * LW + ix, f = BR.Shading.uniforms.uFlick.value;
    return Math.max(0, this.acc[0][i]) * f.x + Math.max(0, this.acc[1][i]) * f.y + Math.max(0, this.acc[2][i]) * f.z + this.gi[i] * this.theme.lamps.gi * f.w;
  };
  W.killLamp = function (lp) {
    if (!lp || lp.group >= 3) return false;
    this._lampContrib(lp, this.acc[lp.group], -1);
    lp.group = 3;
    if (this.lampGeo && lp.v >= 0) {
      const a = this.lampGeo.attributes.aGroup;
      for (let k = 0; k < 4; k++) a.array[lp.v + k] = 3;
      a.needsUpdate = true;
    }
    this._encode();
    return true;
  };
  W.nearestLamp = function (x, z, maxD, aliveOnly) {
    let best = null, bd = maxD * maxD;
    for (const lp of this.lamps) {
      if (aliveOnly && lp.group >= 3) continue;
      const d = (lp.x - x) ** 2 + (lp.z - z) ** 2;
      if (d < bd) { bd = d; best = lp; }
    }
    return best;
  };

  // ---------------- pontos de interesse ----------------
  W._spots = function () {
    const N = this.N;
    this.open = []; this.wallSpots = []; this.hideSpots = [];
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
      if (this.isSolid(x, z)) continue;
      const i = this.idx(x, z);
      this.open.push(i);
      let walls = 0;
      for (const [dx, dz] of DIRS4) {
        const v = this.grid[this.idx(x + dx, z + dz)];
        if (v !== 0) walls++;
        if (v === 1) {
          this.wallSpots.push({
            tile: i, tx: x, tz: z, nx: -dx, nz: -dz,
            x: (x + 0.5) * T + dx * T * 0.5, z: (z + 0.5) * T + dz * T * 0.5,
            rot: Math.atan2(-dx, -dz),
          });
        }
      }
      const c = this.center(i);
      if (walls >= 2 && this.lightAt(c.x, c.z) < 0.35) this.hideSpots.push(i);
    }
  };

  // ==========================================================
  //  CONSTRUÇÃO DA GEOMETRIA
  // ==========================================================
  W._build = function (aniso) {
    const th = this.theme, S = BR.Shading, N = this.N, H = this.CEIL;
    const tex = th.textures();
    for (const k in tex) if (tex[k]) tex[k].anisotropy = aniso;
    this.textures = tex;
    const mats = (this.mats = {
      wall: S.material({ map: tex.wall, breath: true, tint: th.wallTint || 0xffffff, dirt: th.wallDirt != null ? th.wallDirt : 1, bump: th.wallBump != null ? th.wallBump : 0.55 }),
      floor: S.material({ map: tex.floor, worldUV: true, uvScale: [1 / 4.8, 1 / 4.8], spec: th.floorSpec || 0, shine: th.floorShine || 12, dirt: th.floorDirt != null ? th.floorDirt : 1, bump: th.floorBump != null ? th.floorBump : 0.9, wet: th.floorWet != null ? th.floorWet : 1 }),
      ceil: S.material({ map: tex.ceil, worldUV: true, uvScale: [1 / 2.4, 1 / 2.4], dirt: th.ceilDirt != null ? th.ceilDirt : 0.5, tint: th.ceilTint || 0xffffff, bump: 0.5 }),
      trim: S.material({ tint: th.trimColor || 0x6b5a3a, dirt: 0.6, spec: 0.15, shine: 20 }),
      hole: S.material({ tint: 0x030303, dirt: 0 }),
      fixture: S.material({ tint: 0x3a3a36, spec: 0.4, shine: 30, dirt: 0.3 }),
      lamp: S.lampMaterial(tex.lamp),
    });
    if (tex.crate) mats.crate = S.material({ map: tex.crate, bump: 0.6 });
    if (th.puddles) mats.puddle = S.material({ tint: 0x1a1c1c, spec: 2.4, shine: 140, dirt: 0.2 });

    // ---- paredes ----
    const wall = new GB(), trim = new GB();
    const ys = [0, 0.32, H - 0.22, H], aos = [0.48, 0.9, 0.93, 0.68];
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      if (this.grid[this.idx(x, z)] !== 1) continue;
      for (const [dx, dz] of DIRS4) {
        const ox = x + dx, oz = z + dz;
        if (this.isSolid(ox, oz)) continue;
        const rx = dz, rz = -dx;                         // "direita" de quem olha a face
        const cx = (x + 0.5) * T + dx * T * 0.5, cz = (z + 0.5) * T + dz * T * 0.5;
        const blx = cx - rx * T * 0.5, blz = cz - rz * T * 0.5, brx = cx + rx * T * 0.5, brz = cz + rz * T * 0.5;
        const u0 = (blx * rx + blz * rz) / 2.4, u1 = u0 + T / 2.4;
        const lc = this.isSolid(ox - rx, oz - rz) ? 0.66 : 1, rc = this.isSolid(ox + rx, oz + rz) ? 0.66 : 1;
        for (let k = 0; k < 3; k++) {
          const y0 = ys[k], y1 = ys[k + 1];
          wall.quad([blx, y0, blz], [brx, y0, brz], [brx, y1, brz], [blx, y1, blz], [dx, 0, dz],
            [u0, y0 / H, u1, y0 / H, u1, y1 / H, u0, y1 / H],
            [aos[k] * lc, aos[k] * rc, aos[k + 1] * rc, aos[k + 1] * lc]);
        }
        if (th.trim) { // rodapé
          const o = 0.018, hb = 0.11;
          trim.quad([blx + dx * o, 0, blz + dz * o], [brx + dx * o, 0, brz + dz * o], [brx + dx * o, hb, brz + dz * o], [blx + dx * o, hb, blz + dz * o], [dx, 0, dz], null, [0.6, 0.6, 1, 1]);
          trim.quad([blx + dx * o, hb, blz + dz * o], [brx + dx * o, hb, brz + dz * o], [brx, hb, brz], [blx, hb, blz], [0, 1, 0], null, [1, 1, 1, 1]);
        }
      }
    }
    this.group.add(wall.mesh(mats.wall));
    if (th.trim) this.group.add(trim.mesh(mats.trim));

    // ---- chão e forro com AO na retícula de meia célula ----
    const L = 2 * N + 1, ao = new Float32Array(L * L);
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      const xs = i % 2 === 0 ? [i / 2 - 1, i / 2] : [(i - 1) / 2];
      const zs = j % 2 === 0 ? [j / 2 - 1, j / 2] : [(j - 1) / 2];
      let cnt = 0, sol = 0;
      for (const a of xs) for (const b of zs) { cnt++; if (this.isSolid(a, b)) sol++; }
      ao[j * L + i] = 1 - 0.55 * (sol / cnt);
    }
    const holes = new Set();
    if (th.ceilingHoles) {
      const lampTiles = new Set(this.lamps.map((lp) => this.idx(lp.tx, lp.tz)));
      for (let k = 0; k < N * N * th.ceilingHoles; k++) {
        const i = U.pick(this.open);
        if (i == null) break;
        if (!lampTiles.has(i)) holes.add(i * 4 + U.randInt(0, 3));
      }
    }
    const floor = new GB(), ceil = new GB(), hole = new GB(), h2 = T / 2;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      if (this.isSolid(x, z)) continue;
      const ti = this.idx(x, z);
      for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
        const i0 = 2 * x + a, j0 = 2 * z + b;
        const x0 = i0 * h2, x1 = x0 + h2, z0 = j0 * h2, z1 = z0 + h2;
        const c00 = ao[j0 * L + i0], c10 = ao[j0 * L + i0 + 1], c01 = ao[(j0 + 1) * L + i0], c11 = ao[(j0 + 1) * L + i0 + 1];
        floor.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], [0, 1, 0], null, [c01, c11, c10, c00]);
        if (holes.has(ti * 4 + b * 2 + a)) {
          const hy = H + 0.7, cc = [1, 1, 1, 1];
          hole.quad([x0, H, z0], [x1, H, z0], [x1, hy, z0], [x0, hy, z0], [0, 0, 1], null, cc);
          hole.quad([x1, H, z1], [x0, H, z1], [x0, hy, z1], [x1, hy, z1], [0, 0, -1], null, cc);
          hole.quad([x0, H, z1], [x0, H, z0], [x0, hy, z0], [x0, hy, z1], [1, 0, 0], null, cc);
          hole.quad([x1, H, z0], [x1, H, z1], [x1, hy, z1], [x1, hy, z0], [-1, 0, 0], null, cc);
          hole.quad([x0, hy, z0], [x1, hy, z0], [x1, hy, z1], [x0, hy, z1], [0, -1, 0], null, cc);
          continue;
        }
        ceil.quad([x0, H, z0], [x1, H, z0], [x1, H, z1], [x0, H, z1], [0, -1, 0], null, [c00, c10, c11, c01]);
      }
    }
    this.group.add(floor.mesh(mats.floor));
    this.group.add(ceil.mesh(mats.ceil));
    if (holes.size) this.group.add(hole.mesh(mats.hole));

    // ---- luminárias ----
    const lamp = new GB(), fix = new GB(), groups = [];
    const lh = th.lamps.hang ? th.lamps.height : H - 0.012;
    for (const lp of this.lamps) {
      const x0 = lp.x - 0.3, x1 = lp.x + 0.3, z0 = lp.z - 0.6, z1 = lp.z + 0.6;
      lp.v = lamp.quad([x0, lh, z0], [x1, lh, z0], [x1, lh, z1], [x0, lh, z1], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1]);
      groups.push(lp.group, lp.group, lp.group, lp.group);
      if (th.lamps.hang) {
        fix.box(x0 - 0.04, lh + 0.002, z0 - 0.04, x1 + 0.04, lh + 0.16, z1 + 0.04, 0.8, 1, true);
        fix.box(lp.x - 0.012, lh + 0.16, lp.z - 0.012, lp.x + 0.012, H, lp.z + 0.012, 0.6, 1, true);
      } else {
        // moldura embutida
        const y = H - 0.006, e = 0.035;
        fix.quad([x0 - e, y, z0 - e], [x1 + e, y, z0 - e], [x1 + e, y, z0], [x0 - e, y, z0], [0, -1, 0]);
        fix.quad([x0 - e, y, z1], [x1 + e, y, z1], [x1 + e, y, z1 + e], [x0 - e, y, z1 + e], [0, -1, 0]);
        fix.quad([x0 - e, y, z0], [x0, y, z0], [x0, y, z1], [x0 - e, y, z1], [0, -1, 0]);
        fix.quad([x1, y, z0], [x1 + e, y, z0], [x1 + e, y, z1], [x1, y, z1], [0, -1, 0]);
      }
    }
    lamp.extra = { aGroup: { data: groups, size: 1 } };
    const lampMesh = lamp.mesh(mats.lamp);
    this.lampGeo = lampMesh.geometry;
    this.group.add(lampMesh);
    if (fix.p.length) this.group.add(fix.mesh(mats.fixture));

    // ---- caixotes (nível 1) ----
    if (mats.crate) {
      const cr = new GB();
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
        if (this.grid[this.idx(x, z)] !== 2) continue;
        const x0 = x * T + 0.03, x1 = (x + 1) * T - 0.03, z0 = z * T + 0.03, z1 = (z + 1) * T - 0.03;
        const stack = U.randInt(1, 2);
        let y = 0;
        for (let s = 0; s < stack; s++) {
          const sh = U.rand(0.9, 1.2), j = s ? U.rand(-0.06, 0.06) : 0;
          cr.box(x0 + j, y, z0 - j, x1 + j, y + sh, z1 - j, s ? 0.95 : 0.8, 1.2);
          y += sh;
        }
      }
      this.group.add(cr.mesh(mats.crate));
    }

    // ---- poças (nível 1) ----
    if (mats.puddle) {
      const pd = new GB();
      for (let k = 0; k < th.puddles; k++) {
        const i = U.pick(this.open);
        const c = this.center(i), r = U.rand(0.5, 1.4), pts = [];
        for (let a = 0; a < 18; a++) {
          const ang = (a / 18) * Math.PI * 2, rr = r * U.rand(0.7, 1.15);
          pts.push([c.x + Math.cos(ang) * rr, c.z + Math.sin(ang) * rr]);
        }
        pd.fan(c.x, 0.004, c.z, pts, 1);
        this.puddles.push({ x: c.x, z: c.z, r: r * 0.95 });
      }
      this.group.add(pd.mesh(mats.puddle));
    }

    // ---- dutos no teto (nível 1) ----
    if (th.ducts) {
      const du = new GB();
      for (let k = 0; k < th.ducts; k++) {
        const along = Math.random() < 0.5, p = U.randInt(3, N - 4) * T + T / 2, len = U.rand(15, 40), s = U.rand(2, N * T - len - 2);
        const y0 = H - 0.75, y1 = H - 0.3;
        if (along) du.box(s, y0, p - 0.3, s + len, y1, p + 0.3, 0.75, 1.2);
        else du.box(p - 0.3, y0, s, p + 0.3, y1, s + len, 0.75, 1.2);
      }
      this.group.add(du.mesh(mats.fixture));
    }
  };

  // ==========================================================
  //  NAVEGAÇÃO
  // ==========================================================
  // colisão de um círculo (p = {x, z}) contra células sólidas
  W.collide = function (p, r) {
    for (let it = 0; it < 2; it++) {
      const tx0 = Math.floor((p.x - r) / T), tx1 = Math.floor((p.x + r) / T);
      const tz0 = Math.floor((p.z - r) / T), tz1 = Math.floor((p.z + r) / T);
      for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
        if (!this.isSolid(tx, tz)) continue;
        const cx = U.clamp(p.x, tx * T, (tx + 1) * T), cz = U.clamp(p.z, tz * T, (tz + 1) * T);
        const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          p.x += (dx / d) * (r - d); p.z += (dz / d) * (r - d);
        } else {
          const l = p.x - tx * T, rr = (tx + 1) * T - p.x, t = p.z - tz * T, b = (tz + 1) * T - p.z;
          const m = Math.min(l, rr, t, b);
          if (m === l) p.x = tx * T - r; else if (m === rr) p.x = (tx + 1) * T + r;
          else if (m === t) p.z = tz * T - r; else p.z = (tz + 1) * T + r;
        }
      }
    }
    return p;
  };

  // linha de visão (DDA de Amanatides–Woo pela grade)
  W.los = function (x0, z0, x1, z1) {
    let tx = Math.floor(x0 / T), tz = Math.floor(z0 / T);
    const ex = Math.floor(x1 / T), ez = Math.floor(z1 / T);
    const dx = x1 - x0, dz = z1 - z0;
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const adx = Math.abs(dx), adz = Math.abs(dz);
    const tdx = adx > 1e-9 ? T / adx : Infinity, tdz = adz > 1e-9 ? T / adz : Infinity;
    let tmx = adx > 1e-9 ? (sx > 0 ? (tx + 1) * T - x0 : x0 - tx * T) / adx : Infinity;
    let tmz = adz > 1e-9 ? (sz > 0 ? (tz + 1) * T - z0 : z0 - tz * T) / adz : Infinity;
    let guard = 512;
    for (;;) {
      if (this.isSolid(tx, tz)) return false;
      if ((tx === ex && tz === ez) || --guard < 0) return true;
      if (tmx < tmz) { tmx += tdx; tx += sx; } else { tmz += tdz; tz += sz; }
    }
  };
  // linha "larga" (para o corpo da entidade passar sem raspar)
  W.walkable = function (x0, z0, x1, z1, r) {
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
    const px = (-dz / l) * r, pz = (dx / l) * r;
    return this.los(x0, z0, x1, z1) && this.los(x0 + px, z0 + pz, x1 + px, z1 + pz) && this.los(x0 - px, z0 - pz, x1 - px, z1 - pz);
  };

  // A* em 8 direções (sem cortar quinas). extra(i) -> custo adicional opcional
  W.astar = function (s, gIdx, extra, maxIter) {
    const N = this.N, n = N * N;
    if (s === gIdx) return [s];
    if (this.grid[gIdx] !== 0 || this.grid[s] !== 0) return null;
    if (!this._g) {
      this._g = new Float64Array(n); this._came = new Int32Array(n);
      this._seen = new Uint32Array(n); this._closed = new Uint32Array(n); this._stamp = 0;
    }
    const st = ++this._stamp, g = this._g, came = this._came, seen = this._seen, closed = this._closed;
    const gx = gIdx % N, gz = (gIdx / N) | 0;
    const hfun = (i) => { const dx = Math.abs((i % N) - gx), dz = Math.abs(((i / N) | 0) - gz); return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz); };
    const heap = new Heap();
    g[s] = 0; seen[s] = st; came[s] = -1; heap.push(s, hfun(s));
    let iter = 0; const lim = maxIter || 20000;
    while (heap.size()) {
      const i = heap.pop();
      if (closed[i] === st) continue;
      closed[i] = st;
      if (i === gIdx) break;
      if (++iter > lim) return null;
      const x = i % N, z = (i / N) | 0;
      for (const [dx, dz, c] of DIRS8) {
        const nx = x + dx, nz = z + dz;
        if (this.isSolid(nx, nz)) continue;
        if (dx && dz && (this.isSolid(x + dx, z) || this.isSolid(x, z + dz))) continue;
        const j = nz * N + nx;
        if (closed[j] === st) continue;
        const ng = g[i] + c + (extra ? extra(j) : 0);
        if (seen[j] !== st || ng < g[j]) {
          seen[j] = st; g[j] = ng; came[j] = i;
          heap.push(j, ng + hfun(j));
        }
      }
    }
    if (closed[gIdx] !== st) return null;
    const path = [];
    for (let i = gIdx; i !== -1; i = came[i]) path.push(i);
    path.reverse();
    return path;
  };
  W.pathLength = function (path) {
    if (!path || path.length < 2) return 0;
    let L = 0;
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1], b = path[k];
      L += (a % this.N !== b % this.N && ((a / this.N) | 0) !== ((b / this.N) | 0)) ? 1.4142 * T : T;
    }
    return L;
  };
  // caminho em pontos do mundo, com "string pulling"
  W.smoothPath = function (path, sx, sz, r) {
    const pts = path.map((i) => this.center(i));
    if (pts.length) { pts[0] = { x: sx, z: sz }; }
    const out = [pts[0]];
    let k = 0;
    while (k < pts.length - 1) {
      let j = pts.length - 1;
      while (j > k + 1 && !this.walkable(pts[k].x, pts[k].z, pts[j].x, pts[j].z, r)) j--;
      out.push(pts[j]); k = j;
    }
    return out;
  };
  // Dijkstra completo (distância de caminho em metros a partir de s)
  W.distField = function (s, maxD) {
    // Float64 de propósito: com Float32 o arredondamento faz "nd < d[j]" continuar
    // verdadeiro para o mesmo valor e os nós são reexpandidos sem fim.
    const N = this.N, n = N * N, d = new Float64Array(n).fill(Infinity);
    if (s < 0 || this.grid[s] !== 0) return d;
    const heap = new Heap(); d[s] = 0; heap.push(s, 0);
    const lim = maxD || Infinity;
    while (heap.size()) {
      const k = heap.key[0], i = heap.pop(), di = d[i];
      if (k > di + 1e-9) continue; // entrada obsoleta
      if (di > lim) break;
      const x = i % N, z = (i / N) | 0;
      for (const [dx, dz, c] of DIRS8) {
        const nx = x + dx, nz = z + dz;
        if (this.isSolid(nx, nz)) continue;
        if (dx && dz && (this.isSolid(x + dx, z) || this.isSolid(x, z + dz))) continue;
        const j = nz * N + nx, nd = di + c * T;
        if (nd < d[j]) { d[j] = nd; heap.push(j, nd); }
      }
    }
    return d;
  };
  W.nearestOpen = function (x, z) {
    const tx = Math.floor(x / T), tz = Math.floor(z / T);
    if (!this.isSolid(tx, tz)) return this.idx(tx, tz);
    for (let r = 1; r < 6; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (!this.isSolid(tx + dx, tz + dz)) return this.idx(tx + dx, tz + dz);
    }
    return this.start;
  };

  W.dispose = function () {
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const k in this.mats) this.mats[k].dispose();
    for (const k in this.textures) if (this.textures[k]) this.textures[k].dispose();
    this.lmTex.dispose();
  };

  BR.World = World;
  BR.World.T = T;
})(window.BR);
