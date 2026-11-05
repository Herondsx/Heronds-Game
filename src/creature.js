/* ============================================================
   THE BACKROOMS — a criatura ("O Inquilino")
   ------------------------------------------------------------
   CORPO — uma única malha contínua, sem emendas, gerada no
   navegador a partir de um CAMPO DE DISTÂNCIA (SDF):
     * ~140 primitivas anatômicas (bacia, costelas, vértebras,
       escápulas, clavículas, tendões do pescoço, crânio longo,
       órbitas fundas, mandíbula, dedos dos pés...) somadas com
       "união suave" — a pele escorre de uma parte para a outra;
     * Surface Nets extrai a superfície; cabeça e mãos usam uma
       grade bem mais fina (para o close do susto);
     * normais pelo gradiente do campo, oclusão de ambiente
       assada nos vértices e pesos de pele calculados pela
       distância de cada vértice às primitivas de cada osso;
     * SkinnedMesh com 50 ossos (dedos inclusive).
   A pele é procedural no shader (manchas, veias, poros) e
   úmida sob a lanterna.

   FÍSICA / ANIMAÇÃO PROCEDURAL
     * marchas por fase: bípede (anda em pé, devagar), de quatro
       (passo lateral) e galope (com fase aérea): ela se joga de
       quatro para correr e se levanta para espreitar;
     * pés e mãos PLANTADOS no mundo; o próximo apoio é previsto
       pela velocidade e pela rotação do corpo (não escorrega);
     * IK analítica de 2 ossos com vetor de polo; o pé rola
       sobre os dedos ao sair do chão; a bacia desce quando uma
       perna não alcança o apoio (o joelho nunca "estala");
     * corpo com mola e amortecedor: inércia, inclina nas curvas
       e nas freadas; a coluna se curva seguindo o rastro;
     * cabeça estabilizada que mira o alvo (gira demais, como uma
       coruja) e inclina para ouvir; braços soltos são pêndulos
       amortecidos; dedos tamborilam; espasmos;
     * anda pelo TETO de cabeça para baixo (a cabeça gira para
       te olhar), salta para lá e despenca de lá;
     * encurva-se sob tetos baixos.
   CRESCIMENTO — escala uniforme por estágio; a transformação
   vem aos trancos (cada tranco = um estalo de osso, onJolt).
   No 2º estágio abrem-se olhos novos; no 3º um segundo par de
   braços rasga as costelas.
   ============================================================ */
(function (BR) {
  'use strict';
  const U = BR.U;
  const clamp = U.clamp, lerp = U.lerp;
  const TAU = Math.PI * 2;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // =========================================================
  //  1) PRIMITIVAS DO CAMPO DE DISTÂNCIA (vetores = [x, y, z])
  // =========================================================
  const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const vmul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const vlen = (a) => Math.sqrt(vdot(a, a));
  const vnorm = (a) => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const vlerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const vorth = (a, n) => vnorm(vsub(a, vmul(n, vdot(a, n)))); // a sem a componente em n
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  // cone arredondado exato (Inigo Quilez)
  function fRoundCone(a, b, r1, r2) {
    const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
    const l2 = bx * bx + by * by + bz * bz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
    const sg = Math.sign(rr), rr2 = rr * rr, ax = a[0], ay = a[1], az = a[2];
    return function (px, py, pz) {
      const pax = px - ax, pay = py - ay, paz = pz - az;
      const y = pax * bx + pay * by + paz * bz, z = y - l2;
      const qx = pax * l2 - bx * y, qy = pay * l2 - by * y, qz = paz * l2 - bz * y;
      const x2 = qx * qx + qy * qy + qz * qz, y2 = y * y * l2, z2 = z * z * l2;
      const k = sg * rr2 * x2;
      if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
    };
  }
  function fSphere(c, r) {
    const cx = c[0], cy = c[1], cz = c[2];
    return (px, py, pz) => Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy) + (pz - cz) * (pz - cz)) - r;
  }
  // elipsoide orientado (aproximação de IQ), base ortonormal ex/ey/ez
  function fEllipsoid(c, r, ex, ey, ez) {
    const cx = c[0], cy = c[1], cz = c[2], rx = r[0], ry = r[1], rz = r[2];
    const mn = Math.min(rx, ry, rz);
    return function (px, py, pz) {
      const dx = px - cx, dy = py - cy, dz = pz - cz;
      const lx = dx * ex[0] + dy * ex[1] + dz * ex[2], ly = dx * ey[0] + dy * ey[1] + dz * ey[2], lz = dx * ez[0] + dy * ez[1] + dz * ez[2];
      const ax = lx / rx, ay = ly / ry, az = lz / rz;
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
      const bx = ax / rx, by = ay / ry, bz = az / rz;
      const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -mn;
    };
  }
  const bbCap = (a, b, r) => [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r];
  function bbEll(c, r, ex, ey, ez) {
    const e = [0, 1, 2].map((i) => Math.sqrt((r[0] * ex[i]) ** 2 + (r[1] * ey[i]) ** 2 + (r[2] * ez[i]) ** 2));
    return [c[0] - e[0], c[1] - e[1], c[2] - e[2], c[0] + e[0], c[1] + e[1], c[2] + e[2]];
  }
  const inBB = (b, x, y, z, m) => x >= b[0] - m && y >= b[1] - m && z >= b[2] - m && x <= b[3] + m && y <= b[4] + m && z <= b[5] + m;
  const bbUnion = (a, b) => (a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3]), Math.max(a[4], b[4]), Math.max(a[5], b[5])] : b.slice());

  // ---------------- quatérnios de base (THREE) ----------------
  const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _M4 = new THREE.Matrix4();
  const XA = new THREE.Vector3(1, 0, 0), YA = new THREE.Vector3(0, 1, 0), ZA = new THREE.Vector3(0, 0, 1);
  // Y = direção do osso, zHint = para onde aponta o eixo Z
  function qFrame(out, y, zHint) {
    _Y.copy(y).normalize();
    _X.crossVectors(_Y, zHint);
    if (_X.lengthSq() < 1e-12) _X.crossVectors(_Y, Math.abs(_Y.x) < 0.9 ? XA : ZA);
    _X.normalize();
    _Z.crossVectors(_X, _Y);
    _M4.makeBasis(_X, _Y, _Z);
    return out.setFromRotationMatrix(_M4);
  }
  // X = eixo da dobradiça (joelho/cotovelo), Y = direção do osso
  function qHinge(out, hinge, y) {
    _Y.copy(y).normalize();
    _X.copy(hinge);
    _X.addScaledVector(_Y, -_X.dot(_Y));
    if (_X.lengthSq() < 1e-12) return qFrame(out, _Y, ZA);
    _X.normalize();
    _Z.crossVectors(_X, _Y);
    _M4.makeBasis(_X, _Y, _Z);
    return out.setFromRotationMatrix(_M4);
  }
  // IK analítica de 2 ossos: S raiz, T alvo, pole = lado para onde a junta do meio aponta
  const _i1 = new THREE.Vector3(), _i2 = new THREE.Vector3();
  function solve2(S, T, L1, L2, pole, J, E, hinge) {
    const dir = _i1.subVectors(T, S);
    let d = dir.length();
    if (d < 1e-6) { dir.set(0, -1, 0); d = 1e-6; } else dir.divideScalar(d);
    d = clamp(d, Math.abs(L1 - L2) + 1e-4, (L1 + L2) * 0.9995);
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pp = _i2.copy(pole).addScaledVector(dir, -pole.dot(dir));
    if (pp.lengthSq() < 1e-10) { pp.set(0, 0, 1).addScaledVector(dir, -dir.z); if (pp.lengthSq() < 1e-10) pp.set(1, 0, 0); }
    pp.normalize();
    J.copy(S).addScaledVector(dir, a).addScaledVector(pp, h);
    E.copy(S).addScaledVector(dir, d);
    hinge.crossVectors(dir, pp).normalize();
    return d;
  }
  const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

  // =========================================================
  //  2) PLANTA DO CORPO (pose de repouso, em metros; +Z = frente)
  // =========================================================
  const ARM = 0.31;                 // ângulo dos braços com a vertical na pose de repouso
  const L_UP = 0.6, L_FO = 0.58;    // braço / antebraço
  const L_TH = 0.56, L_SH = 0.55;   // coxa / canela
  const L_XU = 0.4, L_XF = 0.4;     // braços extras
  const ANKLE_BALL = 0.1609, FOOT_PITCH = Math.atan2(0.062, 0.148);

  function buildPlan() {
    const bones = [], BI = {}, prims = [], tubes = [], rigid = [], feat = { eyes: [], joints: [], mouth: null };
    const q = new THREE.Quaternion();
    const tJ = new THREE.Vector3(), tE = new THREE.Vector3(), tH = new THREE.Vector3();
    function bone(name, parent, head, quat) {
      BI[name] = bones.length;
      bones.push({ name, parent: parent ? BI[parent] : -1, head: head.slice(), q: quat.clone() });
      return BI[name];
    }
    const P = (f, bb, b, k, sub) => prims.push({ f, bb, b: BI[b], k, sub: !!sub });
    function sph(c, r, bn, k, sub) { P(fSphere(c, r), bbCap(c, c, r), bn, k, sub); }
    function cap(a, b, r1, r2, bn, k) {
      if (vlen(vsub(b, a)) <= Math.abs(r1 - r2) + 1e-4) return sph(vlerp(a, b, 0.5), Math.max(r1, r2), bn, k);
      P(fRoundCone(a, b, r1, r2), bbCap(a, b, Math.max(r1, r2)), bn, k);
    }
    function ell(c, r, bn, k, basis, sub) {
      const [ex, ey, ez] = basis || AXES;
      P(fEllipsoid(c, r, ex, ey, ez), bbEll(c, r, ex, ey, ez), bn, k, sub);
    }
    // campo parcial (só na montagem, para assentar detalhes na superfície)
    function fieldAt(x, y, z) {
      let d = 1;
      for (const p of prims) if (!p.sub && inBB(p.bb, x, y, z, 0.05)) d = smin(d, p.f(x, y, z), p.k);
      for (const p of prims) if (p.sub && inBB(p.bb, x, y, z, 0.05)) d = -smin(-d, p.f(x, y, z), p.k);
      return d;
    }
    function backZ(x, y) { // superfície das costas (marcha de trás para frente)
      for (let z = -0.3; z < 0.1; z += 0.0015) if (fieldAt(x, y, z) < 0) return z;
      return -0.08;
    }
    const along = (a, b) => { const ey = vnorm(vsub(b, a)); const ex = vorth(vcross(ey, [0, 0, 1]), ey); return [ex, ey, vcross(ex, ey)]; };
    function finger(name, parent, base, dir, L, frac, dorsal, r0) {
      const zH = vorth(dorsal, dir), mid = vadd(base, vmul(dir, L * frac));
      const a = bone(name + 'a', parent, base, qFrame(q, V3(dir), V3(zH)));
      const b = bone(name + 'b', name + 'a', mid, qFrame(q, V3(dir), V3(zH)));
      tubes.push({ base, dir, L, tj: frac, dorsal: zH, r0, bones: [BI[parent], a, b], name });
    }

    // ---------------- esqueleto: coluna e cabeça ----------------
    const J = {
      hips: [0, 1.22, 0], spine1: [0, 1.3, -0.012], spine2: [0, 1.39, -0.022], chest: [0, 1.48, -0.028],
      neck1: [0, 1.858, -0.012], neck2: [0, 1.99, 0.02], head: [0, 2.1, 0.05], jaw: [0, 2.135, 0.05], chin: [0, 2.056, 0.128],
    };
    const D = (a, b) => V3(vsub(J[b], J[a]));
    bone('hips', null, J.hips, qFrame(q, D('hips', 'spine1'), ZA));
    bone('spine1', 'hips', J.spine1, qFrame(q, D('spine1', 'spine2'), ZA));
    bone('spine2', 'spine1', J.spine2, qFrame(q, D('spine2', 'chest'), ZA));
    bone('chest', 'spine2', J.chest, qFrame(q, D('chest', 'neck1'), ZA));
    bone('neck1', 'chest', J.neck1, qFrame(q, D('neck1', 'neck2'), ZA));
    bone('neck2', 'neck1', J.neck2, qFrame(q, D('neck2', 'head'), ZA));
    bone('head', 'neck2', J.head, q.set(0, 0, 0, 1)); // Y = topo da cabeça, Z = rosto
    bone('jaw', 'head', J.jaw, qFrame(q, D('jaw', 'chin'), YA));

    const ARMS = {}, LEGS = {}, XARMS = {};
    for (const s of [1, -1]) {
      const N = s > 0 ? 'L' : 'R';
      // ---------------- braços ----------------
      const cH = [s * 0.022, 1.845, 0.045], S = [s * 0.2, 1.862, -0.02];
      bone('clav' + N, 'chest', cH, qFrame(q, V3(vsub(S, cH)), ZA));
      const d = [s * Math.sin(ARM), -Math.cos(ARM), 0];
      solve2(V3(S), V3(vadd(S, vmul(d, (L_UP + L_FO) * 0.99))), L_UP, L_FO, new THREE.Vector3(0, 0, -1), tJ, tE, tH);
      const E = tJ.toArray(), W = tE.toArray(), hinge = tH.clone();
      bone('up' + N, 'clav' + N, S, qHinge(q, hinge, V3(vsub(E, S))));
      bone('fore' + N, 'up' + N, E, qHinge(q, hinge, V3(vsub(W, E))));
      const hd = vnorm(vsub(W, E));                            // a mão continua o antebraço
      const wAx = vorth([0, 0, 1], hd);                        // largura da mão (indicador na frente)
      const dorsal = vmul(vnorm(vcross(wAx, hd)), s);          // costas da mão (para fora)
      const palm = vmul(dorsal, -1);
      bone('hand' + N, 'fore' + N, W, qFrame(q, V3(hd), V3(dorsal)));
      const K = vadd(W, vmul(hd, 0.15));
      ARMS[N] = { S, E, W, K, hd, wAx, dorsal };
      // dedos: 4 longos + polegar (tubos com pele, 2 ossos cada)
      const FL = [0.19, 0.215, 0.2, 0.165];
      for (let i = 0; i < 4; i++) {
        const base = vadd(vadd(K, vmul(wAx, 0.025 - i * 0.0167)), vmul(hd, -0.006 * Math.abs(i - 1.3)));
        const a = (1.5 - i) * 0.085;
        const fd = vnorm(vadd(vmul(hd, Math.cos(a)), vmul(wAx, Math.sin(a))));
        finger('f' + N + i, 'hand' + N, base, fd, FL[i], 0.55, dorsal, 0.0115);
      }
      const tb = vadd(vadd(vadd(W, vmul(hd, 0.035)), vmul(wAx, 0.03)), vmul(palm, 0.012));
      finger('f' + N + '4', 'hand' + N, tb, vnorm(vadd(vadd(vmul(hd, 0.55), vmul(wAx, 0.7)), vmul(palm, 0.45))), 0.12, 0.5, dorsal, 0.012);

      // ---------------- pernas ----------------
      const Hj = [s * 0.105, 1.18, 0.005], At = [s * 0.17, 0.088, -0.01];
      solve2(V3(Hj), V3(At), L_TH, L_SH, new THREE.Vector3(0, 0, 1), tJ, tE, tH);
      const Kn = tJ.toArray(), A = tE.toArray(), lh = tH.clone();
      bone('thigh' + N, 'hips', Hj, qHinge(q, lh, V3(vsub(Kn, Hj))));
      bone('shin' + N, 'thigh' + N, Kn, qHinge(q, lh, V3(vsub(A, Kn))));
      const B = vadd(A, [s * 0.012, -0.062, 0.148]);
      bone('foot' + N, 'shin' + N, A, qFrame(q, V3(vsub(B, A)), YA));
      const Tt = vadd(B, [s * 0.004, -0.012, 0.085]);
      bone('toe' + N, 'foot' + N, B, qFrame(q, V3(vsub(Tt, B)), YA));
      LEGS[N] = { Hj, Kn, A, B };

      // ---------------- braços extras (rasgam as costelas no 3º estágio) ----------------
      const R2 = [s * 0.112, 1.545, -0.062], d2 = vnorm([s * Math.sin(ARM), -Math.cos(ARM), -0.12]);
      solve2(V3(R2), V3(vadd(R2, vmul(d2, (L_XU + L_XF) * 0.985))), L_XU, L_XF, new THREE.Vector3(0, 0, -1), tJ, tE, tH);
      const E2 = tJ.toArray(), W2 = tE.toArray(), xh = tH.clone();
      bone('xup' + N, 'chest', R2, qHinge(q, xh, V3(vsub(E2, R2))));
      bone('xfore' + N, 'xup' + N, E2, qHinge(q, xh, V3(vsub(W2, E2))));
      const hd2 = vnorm(vsub(W2, E2)), wAx2 = vorth([0, 0, 1], hd2), dor2 = vmul(vnorm(vcross(wAx2, hd2)), s);
      bone('xhand' + N, 'xfore' + N, W2, qFrame(q, V3(hd2), V3(dor2)));
      XARMS[N] = { R2, E2, W2, hd2, wAx2, dor2 };
      for (let i = 0; i < 3; i++) {
        const base = vadd(vadd(W2, vmul(hd2, 0.045)), vmul(wAx2, (1 - i) * 0.014));
        const fd = vnorm(vadd(hd2, vmul(wAx2, (1 - i) * 0.16)));
        tubes.push({ base, dir: fd, L: 0.14, tj: 0.5, dorsal: vorth(dor2, fd), r0: 0.0105, bones: [BI['xhand' + N], BI['xhand' + N], BI['xhand' + N]] });
      }
    }

    // =========================================================
    //  PRIMITIVAS
    // =========================================================
    // ---- bacia e abdômen ----
    ell([0, 1.19, -0.005], [0.135, 0.085, 0.095], 'hips', 0.04);
    ell([0, 1.2, -0.084], [0.035, 0.05, 0.02], 'hips', 0.02);                       // sacro
    ell([0, 1.345, 0.0], [0.098, 0.11, 0.07], 'spine1', 0.05);                     // cintura chupada
    ell([0, 1.42, -0.006], [0.112, 0.07, 0.08], 'spine2', 0.05);
    for (const s of [1, -1]) {
      sph([s * 0.118, 1.236, 0.028], 0.03, 'hips', 0.03);                           // cristas ilíacas
      ell([s * 0.06, 1.125, -0.058], [0.064, 0.075, 0.055], 'hips', 0.035);        // nádegas magras
      cap([s * 0.031, 1.25, -0.062], [s * 0.034, 1.4, -0.072], 0.027, 0.026, 'spine1', 0.03); // eretores
      cap([s * 0.034, 1.4, -0.072], [s * 0.036, 1.56, -0.088], 0.026, 0.024, 'spine2', 0.03);
    }
    // ---- caixa torácica com costelas implícitas ----
    const RC = [0, 1.64, 0.0], RR = [0.138, 0.19, 0.102];
    {
      const outer = fEllipsoid(RC, RR, AXES[0], AXES[1], AXES[2]);
      const inner = fEllipsoid(RC, [RR[0] * 0.93, RR[1] * 0.985, RR[2] * 0.93], AXES[0], AXES[1], AXES[2]);
      const sp = 0.05, hw = 0.0105, sl = 0.5, g = 1 / Math.sqrt(1 + sl * sl);
      const uLo = RC[1] - 0.17, uHi = RC[1] + 0.135, uMid = (uLo + uHi) / 2, uHalf = (uHi - uLo) / 2;
      const f = (x, y, z) => {
        const di = inner(x, y, z);
        const u = y + sl * (z - RC[2]);
        const t = (u - uLo) / sp;
        let ribs = Math.max(outer(x, y, z), Math.abs(t - Math.round(t)) * sp * g - hw);
        ribs = Math.max(ribs, (Math.abs(u - uMid) - uHalf) * g);                       // só na faixa das costelas
        ribs = Math.max(ribs, 0.03 - Math.abs(x) - Math.max(0, RC[2] + 0.02 - z));    // esterno liso na frente
        return smin(di, ribs, 0.007);
      };
      P(f, bbEll(RC, RR, AXES[0], AXES[1], AXES[2]), 'chest', 0.05);
    }
    cap([0, 1.812, 0.088], [0, 1.56, 0.098], 0.013, 0.011, 'chest', 0.015);         // esterno
    // ---- pescoço ----
    cap([0, 1.85, -0.015], [0, 1.995, 0.018], 0.052, 0.044, 'neck1', 0.04);
    cap([0, 1.995, 0.018], [0, 2.12, 0.05], 0.044, 0.042, 'neck2', 0.035);
    sph([0, 1.985, 0.058], 0.017, 'neck1', 0.02);                                     // pomo de adão
    for (const s of [1, -1]) {
      const N = s > 0 ? 'L' : 'R';
      cap([s * 0.02, 1.845, 0.072], [s * 0.185, 1.872, 0.012], 0.016, 0.018, 'clav' + N, 0.016); // clavícula
      cap([s * 0.03, 1.955, -0.03], [s * 0.17, 1.87, -0.035], 0.026, 0.022, 'chest', 0.045);   // trapézio
      const sa = [s * 0.045, 2.105, 0.03], sb = [s * 0.012, 1.87, 0.072], sm = vlerp(sa, sb, 0.5); // esternocleidomastoide
      cap(sa, sm, 0.0105, 0.0115, 'neck2', 0.022);
      cap(sm, sb, 0.0115, 0.012, 'neck1', 0.022);
    }
    // ---- vértebras à mostra (assentadas na superfície das costas) ----
    for (let y = 1.25; y <= 1.975; y += 0.04) {
      const z = backZ(0, y) + 0.003;
      const bn = y < 1.3 ? 'hips' : y < 1.39 ? 'spine1' : y < 1.48 ? 'spine2' : y < 1.858 ? 'chest' : 'neck1';
      sph([0, y, z], y > 1.84 && y < 1.9 ? 0.018 : 0.0145, bn, 0.012);
    }
    // ---- escápulas (as asas das costas) ----
    for (const s of [1, -1]) {
      const x = s * 0.088, y = 1.712, z = backZ(x, y);
      const e = 0.003, nx = fieldAt(x + e, y, z) - fieldAt(x - e, y, z), nz = fieldAt(x, y, z + e) - fieldAt(x, y, z - e);
      const nS = vnorm([nx, 0, nz]), ey = [0, 1, 0], ex = vnorm(vcross(ey, nS));
      ell(vadd([x, y, z], vmul(nS, 0.006)), [0.058, 0.08, 0.016], 'chest', 0.022, [ex, ey, nS]);
      const top = [s * 0.05, 1.776, backZ(s * 0.05, 1.776) - 0.004];
      cap(top, [s * 0.165, 1.822, backZ(s * 0.15, 1.82) - 0.002], 0.011, 0.012, 'chest', 0.014); // espinha da escápula
      cap([s * 0.042, 1.79, backZ(s * 0.042, 1.79) - 0.003], [s * 0.058, 1.64, backZ(s * 0.058, 1.64) - 0.003], 0.009, 0.008, 'chest', 0.012);
    }

    // ---- CABEÇA: crânio alongado, órbitas fundas, sem nariz, boca larga demais ----
    {
      const rx = (a) => [[1, 0, 0], [0, Math.cos(a), Math.sin(a)], [0, -Math.sin(a), Math.cos(a)]];
      ell([0, 2.246, -0.004], [0.072, 0.097, 0.1], 'head', 0.03, rx(-0.28));       // crânio
      ell([0, 2.256, -0.066], [0.058, 0.068, 0.07], 'head', 0.04, rx(-0.5));       // nuca comprida, para trás
      ell([0, 2.18, 0.072], [0.058, 0.075, 0.066], 'head', 0.035);                 // massa do rosto
      ell([0, 2.128, 0.104], [0.045, 0.026, 0.042], 'head', 0.02);                 // maxila
      cap([0, 2.222, 0.133], [0, 2.184, 0.149], 0.0075, 0.009, 'head', 0.01);       // ponte do nariz
      for (const s of [1, -1]) {
        cap([0, 2.247, 0.113], [s * 0.05, 2.243, 0.095], 0.016, 0.014, 'head', 0.02); // arco das sobrancelhas
        ell([s * 0.055, 2.178, 0.094], [0.018, 0.012, 0.026], 'head', 0.018);       // maçãs do rosto
        cap([s * 0.058, 2.175, 0.085], [s * 0.07, 2.168, 0.03], 0.0095, 0.008, 'head', 0.012); // arco zigomático
        cap([s * 0.056, 2.138, 0.04], [s * 0.042, 2.072, 0.098], 0.017, 0.014, 'jaw', 0.02); // mandíbula
        cap([s * 0.042, 2.072, 0.098], [0, 2.058, 0.128], 0.014, 0.016, 'jaw', 0.018);
      }
      ell([0, 2.087, 0.124], [0.046, 0.016, 0.03], 'jaw', 0.016);                    // lábio inferior
      ell([0, 2.062, 0.125], [0.03, 0.02, 0.022], 'jaw', 0.02);                      // queixo
      // escavações (subtração suave)
      for (const s of [1, -1]) {
        sph([s * 0.08, 2.235, 0.058], 0.024, 'head', 0.02, true);                    // têmporas fundas
        sph([s * 0.062, 2.128, 0.1], 0.02, 'head', 0.02, true);                      // bochechas chupadas
        sph([s * 0.034, 2.212, 0.132], 0.029, 'head', 0.012, true);                  // órbitas
        ell([s * 0.009, 2.172, 0.152], [0.0075, 0.019, 0.022], 'head', 0.006, null, true); // narinas (fendas)
        feat.eyes.push([s * 0.034, 2.209, 0.11]);
      }
      ell([0, 2.104, 0.142], [0.055, 0.0075, 0.055], 'head', 0.007, null, true);     // fenda da boca
      ell([0, 2.103, 0.09], [0.04, 0.026, 0.05], 'head', 0.01, null, true);          // cavidade da boca
      feat.mouth = [[-0.056, 2.104, 0.13], [0.056, 2.104, 0.13]];
    }

    // ---- braços e mãos ----
    for (const s of [1, -1]) {
      const N = s > 0 ? 'L' : 'R', Aa = ARMS[N];
      const { S, E, W, hd, wAx, dorsal } = Aa;
      sph(vadd(S, [s * 0.008, 0.012, 0]), 0.045, 'up' + N, 0.03);                 // ombro
      cap(S, E, 0.045, 0.033, 'up' + N, 0.025);
      ell(vadd(vlerp(S, E, 0.42), vmul(dorsal, -0.006)), [0.04, 0.17, 0.042], 'up' + N, 0.03, along(S, E)); // bíceps/tríceps secos
      sph(E, 0.03, 'up' + N, 0.02);
      sph(vadd(E, [0, 0, -0.016]), 0.026, 'fore' + N, 0.018);                      // ponta do cotovelo
      cap(E, W, 0.034, 0.021, 'fore' + N, 0.02);
      cap(vadd(E, vmul(dorsal, -0.008)), vadd(W, vmul(dorsal, 0.004)), 0.021, 0.015, 'fore' + N, 0.015);
      sph(W, 0.02, 'hand' + N, 0.014);                                              // punho
      ell(vadd(W, vmul(hd, 0.075)), [0.036, 0.075, 0.013], 'hand' + N, 0.014, [wAx, hd, dorsal]); // palma
      for (let i = 0; i < 4; i++) {
        const t = tubes.find((tb) => tb.name === 'f' + N + i);
        sph(t.base, 0.0128, 'hand' + N, 0.008);                                     // nós dos dedos
        cap(vadd(vadd(W, vmul(dorsal, 0.008)), vmul(wAx, (0.025 - i * 0.0167) * 0.5)), vadd(t.base, vmul(dorsal, 0.0085)), 0.0055, 0.006, 'hand' + N, 0.006); // tendões
      }
      feat.joints.push(E, Aa.K);
    }
    // ---- pernas e pés ----
    for (const s of [1, -1]) {
      const N = s > 0 ? 'L' : 'R', { Hj, Kn, A, B } = LEGS[N];
      cap(Hj, Kn, 0.068, 0.045, 'thigh' + N, 0.04);
      ell(vadd(vlerp(Hj, Kn, 0.36), [0, 0, 0.014]), [0.056, 0.18, 0.06], 'thigh' + N, 0.03, along(Hj, Kn));
      sph(Kn, 0.037, 'thigh' + N, 0.02);
      sph(vadd(Kn, [0, -0.01, 0.03]), 0.024, 'shin' + N, 0.012);                  // patela
      cap(Kn, A, 0.04, 0.024, 'shin' + N, 0.02);
      ell(vadd(vlerp(Kn, A, 0.27), [0, 0, -0.024]), [0.044, 0.13, 0.044], 'shin' + N, 0.025, along(Kn, A)); // panturrilha
      cap(vadd(Kn, [0, -0.03, 0.026]), vadd(A, [0, 0.02, 0.014]), 0.012, 0.0095, 'shin' + N, 0.01); // canela
      cap(vadd(A, [0, 0.13, -0.035]), vadd(A, [0, -0.012, -0.042]), 0.011, 0.013, 'shin' + N, 0.014); // tendão de aquiles
      sph(vadd(A, [s * 0.024, 0, 0]), 0.017, 'foot' + N, 0.012);                    // tornozelos
      sph(vadd(A, [-s * 0.022, 0.006, 0]), 0.016, 'foot' + N, 0.012);
      sph(vadd(A, [0, -0.05, -0.036]), 0.03, 'foot' + N, 0.02);                    // calcanhar
      const ff = vnorm([B[0] - A[0], 0, B[2] - A[2]]);
      ell(vadd(vlerp(A, B, 0.45), [0, -0.024, 0]), [0.037, 0.1, 0.022], 'foot' + N, 0.02, [vnorm(vcross(ff, [0, 1, 0])), ff, [0, 1, 0]]);
      const ox = [-0.024, -0.007, 0.009, 0.024], tl = [0.08, 0.075, 0.068, 0.058], tr = [0.015, 0.012, 0.011, 0.0105];
      for (let i = 0; i < 4; i++) {
        const a = vadd(B, [s * ox[i], 0.002, -0.006]);
        cap(a, vadd(a, [s * ox[i] * 0.25, -0.012, tl[i]]), tr[i], tr[i] * 0.68, 'toe' + N, 0.007);
      }
      feat.joints.push(Kn);
    }
    // ---- braços extras ----
    for (const s of [1, -1]) {
      const N = s > 0 ? 'L' : 'R', { R2, E2, W2, hd2 } = XARMS[N];
      sph(R2, 0.032, 'xup' + N, 0.03);
      cap(R2, E2, 0.03, 0.023, 'xup' + N, 0.022);
      sph(E2, 0.024, 'xup' + N, 0.016);
      cap(E2, W2, 0.023, 0.016, 'xfore' + N, 0.016);
      sph(vadd(W2, vmul(hd2, 0.025)), 0.021, 'xhand' + N, 0.012);
    }

    // ---- partes rígidas: olhos, dentes, boca ----
    feat.eyes.forEach((c) => rigid.push({ kind: 'eye', bone: BI.head, c, r: 0.0115, stage: 0 }));
    // olhos novos: brotam da pele (meio afundados), sem simetria
    const faceZ = (x, y) => { for (let z = 0.25; z > -0.1; z -= 0.001) if (fieldAt(x, y, z) < 0) return z; return 0.1; };
    const extra = [[0.024, 2.272, 0.0085, 1], [-0.044, 2.262, 0.0065, 1], [0.068, 2.226, 0.0062, 2], [-0.012, 2.302, 0.0075, 2]];
    for (const [x, y, r, st] of extra) {
      const z = faceZ(x, y), e = 0.002;
      const n = vnorm([fieldAt(x + e, y, z) - fieldAt(x - e, y, z), fieldAt(x, y + e, z) - fieldAt(x, y - e, z), fieldAt(x, y, z + e) - fieldAt(x, y, z - e)]);
      rigid.push({ kind: 'eye', bone: BI.head, c: vsub([x, y, z], vmul(n, r * 0.45)), r, stage: st });
      feat.eyes.push([x, y, z]); // pele escurecida em volta
    }
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 19; i++) {   // dentes de cima: agulhas desencontradas, por dentro do lábio
      const x = -0.046 + (i / 18) * 0.092 + (rnd() - 0.5) * 0.003, z = 0.128 - 9 * x * x;
      const L = 0.008 + 0.012 * (1 - Math.abs(x) / 0.05) + rnd() * 0.009;
      rigid.push({ kind: 'tooth', bone: BI.head, a: [x, 2.113, z], b: [x * 0.95 + (rnd() - 0.5) * 0.005, 2.113 - L, z - 0.003 + rnd() * 0.004], r: 0.0024 + rnd() * 0.0012 });
    }
    for (let i = 0; i < 17; i++) {
      const x = -0.042 + (i / 16) * 0.084 + (rnd() - 0.5) * 0.003, z = 0.124 - 9 * x * x;
      const L = 0.007 + 0.011 * (1 - Math.abs(x) / 0.045) + rnd() * 0.008;
      rigid.push({ kind: 'tooth', bone: BI.jaw, a: [x, 2.094, z], b: [x * 0.95 + (rnd() - 0.5) * 0.005, 2.094 + L, z - 0.002 + rnd() * 0.004], r: 0.0022 + rnd() * 0.0011 });
    }
    rigid.push({ kind: 'inner', bone: BI.head, c: [0, 2.103, 0.088], r: [0.036, 0.02, 0.042] });
    rigid.push({ kind: 'inner', bone: BI.jaw, c: [0, 2.088, 0.09], r: [0.032, 0.011, 0.036] });

    // ---- regiões de detalhe: cabeça e mãos numa grade mais fina ----
    const regions = [{ name: 'head', h: 0.004, p0: [0, 1.995, 0], n: [0, 1, 0], bones: [BI.neck2, BI.head, BI.jaw], clampX: 0.13 }];
    for (const s of [1, -1]) {
      const N = s > 0 ? 'L' : 'R', Aa = ARMS[N];
      regions.push({ name: 'hand' + N, h: 0.0046, p0: vsub(Aa.W, vmul(Aa.hd, 0.03)), n: Aa.hd, bones: [BI['hand' + N]] });
    }
    return { bones, BI, prims, tubes, rigid, feat, regions };
  }

  // =========================================================
  //  3) MALHA: avaliação do campo numa grade + Surface Nets
  // =========================================================
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

  function Grid(bb, h) {
    this.h = h;
    this.ox = bb[0] - 3 * h; this.oy = bb[1] - 3 * h; this.oz = bb[2] - 3 * h;
    this.nx = Math.ceil((bb[3] - bb[0]) / h) + 7; this.ny = Math.ceil((bb[4] - bb[1]) / h) + 7; this.nz = Math.ceil((bb[5] - bb[2]) / h) + 7;
    this.sxy = this.nx * this.ny;
    this.F = new Float32Array(this.nx * this.ny * this.nz).fill(1);
  }
  // soma (ou subtrai) uma primitiva só dentro da caixa dela
  Grid.prototype.splat = function (pr) {
    const h = this.h, m = pr.k + 3 * h, b = pr.bb;
    const i0 = Math.max(0, Math.floor((b[0] - m - this.ox) / h)), i1 = Math.min(this.nx - 1, Math.ceil((b[3] + m - this.ox) / h));
    const j0 = Math.max(0, Math.floor((b[1] - m - this.oy) / h)), j1 = Math.min(this.ny - 1, Math.ceil((b[4] + m - this.oy) / h));
    const k0 = Math.max(0, Math.floor((b[2] - m - this.oz) / h)), k1 = Math.min(this.nz - 1, Math.ceil((b[5] + m - this.oz) / h));
    if (i0 > i1 || j0 > j1 || k0 > k1) return;
    const F = this.F, f = pr.f, k = pr.k, sub = pr.sub, ik = 1 / k;
    for (let kz = k0; kz <= k1; kz++) {
      const z = this.oz + kz * h;
      for (let jy = j0; jy <= j1; jy++) {
        const y = this.oy + jy * h;
        let idx = kz * this.sxy + jy * this.nx + i0;
        for (let ix = i0; ix <= i1; ix++, idx++) {
          const d = f(this.ox + ix * h, y, z);
          const a = sub ? -F[idx] : F[idx];
          const hh = Math.max(k - Math.abs(a - d), 0) * ik;
          const r = Math.min(a, d) - hh * hh * k * 0.25;
          F[idx] = sub ? -r : r; // subtração suave: max(F, -d)
        }
      }
    }
  };
  Grid.prototype.clip = function (fn) {
    const F = this.F, h = this.h;
    for (let kz = 0, idx = 0; kz < this.nz; kz++) {
      const z = this.oz + kz * h;
      for (let jy = 0; jy < this.ny; jy++) {
        const y = this.oy + jy * h;
        for (let ix = 0; ix < this.nx; ix++, idx++) F[idx] = fn(this.ox + ix * h, y, z, F[idx]);
      }
    }
  };
  // amostra trilinear (fora da grade = "longe")
  Grid.prototype.at = function (x, y, z) {
    const h = this.h;
    let fx = (x - this.ox) / h, fy = (y - this.oy) / h, fz = (z - this.oz) / h;
    if (fx < 0 || fy < 0 || fz < 0 || fx >= this.nx - 1 || fy >= this.ny - 1 || fz >= this.nz - 1) return 1;
    const i = fx | 0, j = fy | 0, k = fz | 0;
    fx -= i; fy -= j; fz -= k;
    const F = this.F, nx = this.nx, s = this.sxy, o = k * s + j * nx + i;
    const c00 = F[o] + (F[o + 1] - F[o]) * fx, c10 = F[o + nx] + (F[o + nx + 1] - F[o + nx]) * fx;
    const c01 = F[o + s] + (F[o + s + 1] - F[o + s]) * fx, c11 = F[o + s + nx] + (F[o + s + nx + 1] - F[o + s + nx]) * fx;
    const c0 = c00 + (c10 - c00) * fy, c1 = c01 + (c11 - c01) * fy;
    return c0 + (c1 - c0) * fz;
  };
  Grid.prototype.grad = function (x, y, z, out) {
    const e = this.h * 0.5;
    out[0] = this.at(x + e, y, z) - this.at(x - e, y, z);
    out[1] = this.at(x, y + e, z) - this.at(x, y - e, z);
    out[2] = this.at(x, y, z + e) - this.at(x, y, z - e);
    return out;
  };
  // Surface Nets: um vértice por célula cortada, um quad por aresta cortada
  Grid.prototype.mesh = function () {
    const { nx, ny, nz, sxy, F, h, ox, oy, oz } = this;
    const cellV = new Int32Array(nx * ny * nz).fill(-1);
    const pos = [];
    const off = [0, 1, nx, nx + 1, sxy, sxy + 1, sxy + nx, sxy + nx + 1];
    const cx = [0, 1, 0, 1, 0, 1, 0, 1], cy = [0, 0, 1, 1, 0, 0, 1, 1], cz = [0, 0, 0, 0, 1, 1, 1, 1];
    const v = new Float32Array(8);
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) {
      let idx = k * sxy + j * nx;
      for (let i = 0; i < nx - 1; i++, idx++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) { v[c] = F[idx + off[c]]; if (v[c] < 0) mask |= 1 << c; }
        if (mask === 0 || mask === 255) continue;
        let ax = 0, ay = 0, az = 0, n = 0;
        for (let e = 0; e < 12; e++) {
          const c0 = EDGES[e][0], c1 = EDGES[e][1];
          if ((v[c0] < 0) === (v[c1] < 0)) continue;
          const t = v[c0] / (v[c0] - v[c1]);
          ax += cx[c0] + (cx[c1] - cx[c0]) * t; ay += cy[c0] + (cy[c1] - cy[c0]) * t; az += cz[c0] + (cz[c1] - cz[c0]) * t; n++;
        }
        cellV[idx] = pos.length / 3;
        pos.push(ox + (i + ax / n) * h, oy + (j + ay / n) * h, oz + (k + az / n) * h);
      }
    }
    const tris = [];
    const quad = (a, b, c, d, flip) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      if (flip) { const t = b; b = d; d = t; }
      // divide pela diagonal mais curta
      const dAC = (pos[a * 3] - pos[c * 3]) ** 2 + (pos[a * 3 + 1] - pos[c * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[c * 3 + 2]) ** 2;
      const dBD = (pos[b * 3] - pos[d * 3]) ** 2 + (pos[b * 3 + 1] - pos[d * 3 + 1]) ** 2 + (pos[b * 3 + 2] - pos[d * 3 + 2]) ** 2;
      if (dAC <= dBD) tris.push(a, b, c, a, c, d); else tris.push(a, b, d, b, c, d);
    };
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const idx = k * sxy + j * nx + i, f0 = F[idx] < 0;
      if (j > 0 && k > 0 && f0 !== (F[idx + 1] < 0)) // aresta em X
        quad(cellV[idx - nx - sxy], cellV[idx - sxy], cellV[idx], cellV[idx - nx], !f0);
      if (i > 0 && k > 0 && f0 !== (F[idx + nx] < 0)) // aresta em Y
        quad(cellV[idx - 1], cellV[idx], cellV[idx - sxy], cellV[idx - 1 - sxy], !f0);
      if (i > 0 && j > 0 && f0 !== (F[idx + sxy] < 0)) // aresta em Z
        quad(cellV[idx - nx], cellV[idx], cellV[idx - 1], cellV[idx - 1 - nx], !f0);
    }
    // assenta cada vértice na superfície e tira a normal do gradiente
    const Pp = new Float32Array(pos), N = new Float32Array(pos.length), g = [0, 0, 0];
    for (let i = 0; i < Pp.length; i += 3) {
      let x = Pp[i], y = Pp[i + 1], z = Pp[i + 2];
      for (let it = 0; it < 2; it++) {
        const d = this.at(x, y, z); this.grad(x, y, z, g);
        const gl2 = (g[0] * g[0] + g[1] * g[1] + g[2] * g[2]) / (h * h);
        if (gl2 < 1e-8) break;
        const st = d / gl2 / h;
        x -= g[0] * st; y -= g[1] * st; z -= g[2] * st;
      }
      if (Math.abs(x - Pp[i]) < h && Math.abs(y - Pp[i + 1]) < h && Math.abs(z - Pp[i + 2]) < h) { Pp[i] = x; Pp[i + 1] = y; Pp[i + 2] = z; }
      this.grad(Pp[i], Pp[i + 1], Pp[i + 2], g);
      const l = Math.hypot(g[0], g[1], g[2]) || 1;
      N[i] = g[0] / l; N[i + 1] = g[1] / l; N[i + 2] = g[2] / l;
    }
    // confere a orientação dos triângulos pela normal do campo (vira tudo se precisar)
    let agree = 0;
    for (let t = 0; t < tris.length; t += 3 * 7) {
      const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3;
      const ux = Pp[b] - Pp[a], uy = Pp[b + 1] - Pp[a + 1], uz = Pp[b + 2] - Pp[a + 2];
      const wx = Pp[c] - Pp[a], wy = Pp[c + 1] - Pp[a + 1], wz = Pp[c + 2] - Pp[a + 2];
      const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
      agree += Math.sign(fx * N[a] + fy * N[a + 1] + fz * N[a + 2]);
    }
    if (agree < 0) for (let t = 0; t < tris.length; t += 3) { const x = tris[t + 1]; tris[t + 1] = tris[t + 2]; tris[t + 2] = x; }
    return { P: Pp, N, I: tris };
  };

  // =========================================================
  //  4) MONTAGEM DO MODELO (uma vez por página)
  // =========================================================
  let MODEL = null;
  // Q = passos das grades { body, head, hand } (LOD 0 = detalhado, LOD 1 = leve, para longe)
  function buildGeometry(plan, Q) {
    const { prims, bones, BI, regions } = plan;
    const unions = prims.filter((p) => !p.sub), subs = prims.filter((p) => p.sub);
    const t0 = performance.now();

    // ---------- grades ----------
    const grids = [];
    const OVER = 0.03, ERODE = 0.0025;
    const handB = new Set(regions.filter((r) => r.name !== 'head').map((r) => r.bones[0]));
    // corpo: tudo menos a cabeça e as mãos (que têm grade própria)
    let bbBody = null;
    for (const p of unions) if (!handB.has(p.b) && p.bb[1] < 1.99) bbBody = bbUnion(bbBody, p.bb);
    bbBody[4] = Math.min(bbBody[4], 2.0);
    const body = new Grid(bbBody, Q.body);
    body.region = null;
    grids.push(body);
    for (const R of regions) {
      let bb = null;
      if (R.name === 'head') {
        for (const p of unions) if (p.bb[4] > R.p0[1] - OVER) bb = bbUnion(bb, p.bb);
        bb[1] = R.p0[1] - OVER - 0.01; bb[0] = Math.max(bb[0], -R.clampX); bb[3] = Math.min(bb[3], R.clampX);
      } else {
        for (const p of unions) if (p.b === R.bones[0]) bb = bbUnion(bb, p.bb);
        const c = vsub(R.p0, vmul(R.n, OVER));
        bb = bbUnion(bb, [c[0] - 0.035, c[1] - 0.035, c[2] - 0.035, c[0] + 0.035, c[1] + 0.035, c[2] + 0.035]);
      }
      const g = new Grid(bb, R.name === 'head' ? Q.head : Q.hand);
      g.region = R;
      R.bb = [bb[0] - 0.01, bb[1] - 0.01, bb[2] - 0.01, bb[3] + 0.01, bb[4] + 0.01, bb[5] + 0.01];
      grids.push(g);
    }
    const planeD = (R, x, y, z) => (x - R.p0[0]) * R.n[0] + (y - R.p0[1]) * R.n[1] + (z - R.p0[2]) * R.n[2];
    for (const g of grids) {
      const gb = [g.ox, g.oy, g.oz, g.ox + g.nx * g.h, g.oy + g.ny * g.h, g.oz + g.nz * g.h];
      const hit = (p) => !(p.bb[3] < gb[0] - 0.05 || p.bb[0] > gb[3] + 0.05 || p.bb[4] < gb[1] - 0.05 || p.bb[1] > gb[4] + 0.05 || p.bb[5] < gb[2] - 0.05 || p.bb[2] > gb[5] + 0.05);
      for (const p of unions) if (hit(p)) g.splat(p);
      for (const p of subs) if (hit(p)) g.splat(p);
      if (g.region) {
        const R = g.region;
        g.clip((x, y, z, d) => Math.max(d, -(planeD(R, x, y, z) + OVER)));
      } else {
        // o corpo termina no corte; perto dele encolhe um pouco para ficar por baixo da malha fina
        g.clip((x, y, z, d) => {
          for (const R of regions) {
            if (!inBB(R.bb, x, y, z, 0)) continue; // o corte só vale perto da região (o plano é infinito)
            const pd = planeD(R, x, y, z);
            if (pd > -0.036) { d += ERODE * sstep(-0.035, -0.006, pd); if (pd > 0) d = Math.max(d, pd); }
          }
          return d;
        });
      }
    }
    const tGrid = performance.now();
    const sampleAll = (x, y, z) => { let d = 1; for (const g of grids) { const v = g.at(x, y, z); if (v < d) d = v; } return d; };

    // ---------- malhas das regiões + pesos + oclusão + cor ----------
    const outP = [], outN = [], outC = [], outI = [], outSI = [], outSW = [];
    const nb = bones.length, m = new Float64Array(nb), FALL = 0.032, MARG = 0.07;
    const eyes = plan.feat.eyes, mouth = plan.feat.mouth, joints = plan.feat.joints;
    const boneTint = new Array(nb).fill(null);
    for (const n of ['handL', 'handR', 'xhandL', 'xhandR']) boneTint[BI[n]] = [0.86, 0.8, 0.82];
    for (const n of ['footL', 'footR', 'toeL', 'toeR']) boneTint[BI[n]] = [0.74, 0.68, 0.68];
    const AOS = [0.01, 0.02, 0.035, 0.055, 0.085], AOW = [0.3, 0.25, 0.2, 0.15, 0.1];
    // índice espacial das primitivas (só as próximas entram no cálculo dos pesos)
    let all = null;
    for (const p of unions) all = bbUnion(all, p.bb);
    const CS = 0.1, gx0 = all[0] - MARG, gy0 = all[1] - MARG, gz0 = all[2] - MARG;
    const gnx = Math.ceil((all[3] - all[0] + 2 * MARG) / CS) + 1, gny = Math.ceil((all[4] - all[1] + 2 * MARG) / CS) + 1, gnz = Math.ceil((all[5] - all[2] + 2 * MARG) / CS) + 1;
    const cells = new Array(gnx * gny * gnz);
    for (const p of unions) {
      const b = p.bb;
      const i0 = Math.max(0, Math.floor((b[0] - MARG - gx0) / CS)), i1 = Math.min(gnx - 1, Math.floor((b[3] + MARG - gx0) / CS));
      const j0 = Math.max(0, Math.floor((b[1] - MARG - gy0) / CS)), j1 = Math.min(gny - 1, Math.floor((b[4] + MARG - gy0) / CS));
      const k0 = Math.max(0, Math.floor((b[2] - MARG - gz0) / CS)), k1 = Math.min(gnz - 1, Math.floor((b[5] + MARG - gz0) / CS));
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const c = (k * gny + j) * gnx + i;
        (cells[c] || (cells[c] = [])).push(p);
      }
    }
    const bi = new Int32Array(4), bw = new Float64Array(4);
    const near = (x, y, z, a) => Math.sqrt((x - a[0]) ** 2 + (y - a[1]) ** 2 + (z - a[2]) ** 2);
    const mx0 = mouth[0], mdx = mouth[1][0] - mx0[0];
    for (const g of grids) {
      const { P, N, I } = g.mesh(); // as grades ficam vivas até o fim: a oclusão consulta todas
      const base = outP.length / 3;
      for (let i = 0; i < I.length; i++) outI.push(I[i] + base);
      for (let vi = 0; vi < P.length; vi += 3) {
        const x = P[vi], y = P[vi + 1], z = P[vi + 2], nx = N[vi], ny = N[vi + 1], nz = N[vi + 2];
        outP.push(x, y, z); outN.push(nx, ny, nz);
        // ---- pesos de pele: distância às primitivas de cada osso ----
        m.fill(1e9);
        const ci = clamp(Math.floor((x - gx0) / CS), 0, gnx - 1), cj = clamp(Math.floor((y - gy0) / CS), 0, gny - 1), ck = clamp(Math.floor((z - gz0) / CS), 0, gnz - 1);
        const list = cells[(ck * gny + cj) * gnx + ci] || [];
        for (const p of list) {
          if (!inBB(p.bb, x, y, z, MARG)) continue;
          const d = p.f(x, y, z);
          if (d < m[p.b]) m[p.b] = d;
        }
        let mi = 0;
        for (let b = 1; b < nb; b++) if (m[b] < m[mi]) mi = b;
        bi.fill(0); bw.fill(0);
        for (let b = 0; b < nb; b++) {
          if (m[b] > 1e8) continue;
          const fs = mi === BI.jaw || b === BI.jaw ? 0.4 : 1; // lábios nítidos: a mandíbula quase não divide vértices
          const r = (m[b] - m[mi]) / (FALL * fs);
          if (r >= 1) continue;
          let w = (1 - r) * (1 - r) * (1 - r), id = b;
          for (let k = 0; k < 4; k++) if (w > bw[k]) { const tw = bw[k], ti = bi[k]; bw[k] = w; bi[k] = id; w = tw; id = ti; }
        }
        const ws = bw[0] + bw[1] + bw[2] + bw[3];
        for (let k = 0; k < 4; k++) { outSI.push(bi[k]); outSW.push(bw[k] / ws); }
        // ---- oclusão de ambiente pelo campo ----
        let occ = 0;
        for (let k = 0; k < 5; k++) {
          const dd = AOS[k], sd = sampleAll(x + nx * dd, y + ny * dd, z + nz * dd);
          occ += ((dd - Math.min(dd, Math.max(sd, -dd))) / dd) * AOW[k];
        }
        const ao = clamp(1 - occ * 0.95, 0.12, 1);
        // ---- cor por região ----
        const tb = boneTint[mi];
        let tr = tb ? tb[0] : 1, tg = tb ? tb[1] : 1, tbl = tb ? tb[2] : 1;
        if (y > 1.9) {
          let de = 1;
          for (const e of eyes) de = Math.min(de, near(x, y, z, e));
          const ke = 1 - sstep(0.012, 0.038, de);
          if (ke > 0) { tr = lerp(tr, 0.2, ke); tg = lerp(tg, 0.15, ke); tbl = lerp(tbl, 0.15, ke); }
          const t = clamp((x - mx0[0]) / mdx, 0, 1);
          const km = 1 - sstep(0.004, 0.02, Math.sqrt((x - (mx0[0] + mdx * t)) ** 2 + (y - mx0[1]) ** 2 + (z - mx0[2]) ** 2));
          if (km > 0) { tr = lerp(tr, 0.5, km); tg = lerp(tg, 0.22, km); tbl = lerp(tbl, 0.22, km); }
        }
        let dj = 1;
        for (const j of joints) dj = Math.min(dj, near(x, y, z, j));
        const kj = 1 - sstep(0.02, 0.06, dj);
        tg *= 1 - kj * 0.13; tbl *= 1 - kj * 0.16;
        if (y < 0.035) { const k = 1 - sstep(0.012, 0.035, y); tr *= 1 - k * 0.4; tg *= 1 - k * 0.4; tbl *= 1 - k * 0.4; } // solas sujas
        outC.push(tr * Math.pow(ao, 0.85), tg * Math.pow(ao, 1.1), tbl * Math.pow(ao, 1.12));
      }
    }

    // ---------- dedos e garras: tubos com pele ----------
    for (const T of plan.tubes) buildTube(T, outP, outN, outC, outI, outSI, outSW);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(outP, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(outN, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(outC, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(outSI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(outSW, 4));
    g.setIndex(new THREE.BufferAttribute(outP.length / 3 > 65535 ? new Uint32Array(outI) : new Uint16Array(outI), 1));
    g.computeBoundingSphere();
    g.userData = { verts: outP.length / 3, tris: outI.length / 3, ms: performance.now() - t0, msGrid: tGrid - t0 };
    return g;
  }

  function buildModel() {
    const t0 = performance.now();
    const plan = buildPlan();
    const { bones, BI } = plan;
    const g0 = buildGeometry(plan, { body: 0.0098, head: 0.0042, hand: 0.0048 });
    const g1 = buildGeometry(plan, { body: 0.019, head: 0.0095, hand: 0.011 });
    // ---------- transformações locais de repouso dos ossos ----------
    const qi = new THREE.Quaternion();
    for (const b of bones) {
      if (b.parent < 0) { b.lpos = V3(b.head); b.lq = b.q.clone(); }
      else {
        const pb = bones[b.parent];
        qi.copy(pb.q).invert();
        b.lpos = V3(b.head).sub(V3(pb.head)).applyQuaternion(qi);
        b.lq = qi.clone().multiply(b.q);
      }
    }
    MODEL = { plan, bones, BI, geometry: g0, lod: [g0, g1], verts: g0.userData.verts, tris: g0.userData.tris, ms: performance.now() - t0, msGrid: g0.userData.msGrid };
    return MODEL;
  }

  // tubo com pele (dedo de 2 falanges + garra)
  function buildTube(T, P, N, C, I, SI, SW) {
    const side = vnorm(vcross(T.dir, T.dorsal)), up = T.dorsal;
    const tj = T.tj, L = T.L, base0 = P.length / 3, SEG = 8;
    const ts = [0, 0.05, 0.12, 0.2, 0.3, tj - 0.1, tj - 0.04, tj, tj + 0.04, tj + 0.1, 0.72, 0.8, 0.86, 0.91, 0.95, 0.98].sort((a, b) => a - b);
    const pts = ts.filter((t, i) => i === 0 || t > ts[i - 1] + 0.005);
    const curl = (t) => (t > 0.78 ? ((t - 0.78) / 0.22) ** 2 * L * 0.09 : 0); // a garra curva para a palma
    const [bp, b1, b2] = T.bones;
    for (const t of pts) {
      let r = T.r0 * (1 - 0.32 * t) + T.r0 * 0.12 * Math.exp(-(((t - tj) / 0.05) ** 2));
      if (t > 0.84) r *= Math.pow(1 - (t - 0.84) / 0.16, 0.85);
      const c = vsub(vadd(T.base, vmul(T.dir, t * L - 0.004)), vmul(up, curl(t)));
      // pesos: mão -> falange 1 -> falange 2
      let w = [[bp, 1]];
      if (t > 0.04 && t < 0.14) { const k = (t - 0.04) / 0.1; w = [[bp, 1 - k], [b1, k]]; }
      else if (t >= 0.14 && t < tj - 0.05) w = [[b1, 1]];
      else if (t >= tj - 0.05 && t < tj + 0.05) { const k = (t - (tj - 0.05)) / 0.1; w = [[b1, 1 - k], [b2, k]]; }
      else if (t >= tj + 0.05) w = [[b2, 1]];
      const claw = t > 0.83, knuck = Math.exp(-(((t - tj) / 0.06) ** 2));
      for (let k = 0; k < SEG; k++) {
        const a = (k / SEG) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        const n = vadd(vmul(side, ca), vmul(up, sa));
        P.push(c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r);
        N.push(n[0], n[1], n[2]);
        const sh = 0.82 + 0.18 * (0.5 + 0.5 * sa); // parte de baixo do dedo mais escura
        if (claw) C.push(0.09 * sh, 0.075 * sh, 0.07 * sh);
        else C.push(0.84 * sh * (1 - knuck * 0.12), 0.77 * sh * (1 - knuck * 0.2), 0.77 * sh * (1 - knuck * 0.22));
        for (let j = 0; j < 4; j++) { SI.push(w[j] ? w[j][0] : 0); SW.push(w[j] ? w[j][1] : 0); }
      }
    }
    const tip = vsub(vadd(T.base, vmul(T.dir, L)), vmul(up, curl(1)));
    const ti = P.length / 3;
    P.push(tip[0], tip[1], tip[2]); N.push(T.dir[0], T.dir[1], T.dir[2]); C.push(0.06, 0.05, 0.05);
    SI.push(b2, 0, 0, 0); SW.push(1, 0, 0, 0);
    const rings = pts.length;
    for (let r = 0; r < rings - 1; r++) for (let k = 0; k < SEG; k++) {
      const a = base0 + r * SEG + k, b = base0 + r * SEG + ((k + 1) % SEG), c = a + SEG, d = b + SEG;
      I.push(a, c, b, b, c, d);
    }
    const last = base0 + (rings - 1) * SEG;
    for (let k = 0; k < SEG; k++) I.push(last + k, ti, last + ((k + 1) % SEG));
  }

  function model() { return MODEL || buildModel(); }

  // =========================================================
  //  5) A CRIATURA (instância + rig procedural)
  // =========================================================
  const STAGE_SCALE = [1.0, 1.17, 1.34];
  const NAMES = ['O MAGRO', 'O VIGIA', 'O ABRAÇO'];
  const GAITS = {
    // off = fase de cada membro [pernaE, pernaD, braçoE, braçoD]; duty = fração do ciclo no chão
    biped: { off: [0, 0.5, 0, 0.5], duty: 0.62, s0: 1.0, s1: 0.5, smin: 1.0, smax: 2.2, lift: [0.1, 0.1, 0.1, 0.1] },
    walk: { off: [0, 0.5, 0.25, 0.75], duty: 0.68, s0: 0.9, s1: 0.45, smin: 0.9, smax: 2.0, lift: [0.08, 0.08, 0.13, 0.13] },
    gallop: { off: [0, 0.12, 0.5, 0.62], duty: 0.38, s0: 1.3, s1: 0.28, smin: 1.8, smax: 3.2, lift: [0.13, 0.13, 0.2, 0.2] },
  };
  const EMPTY = {};
  const _e = new THREE.Euler(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3();
  const _J = new THREE.Vector3(), _E = new THREE.Vector3(), _H = new THREE.Vector3(), _T = new THREE.Vector3(), _P = new THREE.Vector3();

  function Creature() {
    const M = model();
    this.M = M;
    const S = BR.Shading;
    this.mats = {
      skin: S.material({ skin: true, spec: 0.42, shine: 30, dirt: 0, bump: 0.35 }),
      eye: S.material({ eye: true, tint: 0xfff0b8, emissive: 0.4, dirt: 0 }),
      teeth: S.material({ tint: 0xc9bb94, spec: 0.8, shine: 60, dirt: 0 }),
      inner: S.material({ tint: 0x030101, dirt: 0 }),
    };
    this.root = new THREE.Group();
    this.root.name = 'criatura';
    const bones = (this.bones = M.bones.map((b) => { const o = new THREE.Bone(); o.name = b.name; o.position.copy(b.lpos); o.quaternion.copy(b.lq); return o; }));
    M.bones.forEach((b, i) => { if (b.parent >= 0) bones[b.parent].add(bones[i]); });
    this.mesh = new THREE.SkinnedMesh(M.lod[0], this.mats.skin);
    this.mesh.frustumCulled = false; // a pose muda o volume o tempo todo
    this.mesh.add(bones[0]);
    this.root.add(this.mesh);
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(bones);
    this.mesh.bind(this.skeleton);
    this.far = false; // de longe troca para a malha leve (mesmo esqueleto, mesmos pesos)
    this.buildRigid();
    // âncora do rosto (o jogo usa no susto final)
    const BI = (this.BI = M.BI);
    this.head = new THREE.Object3D();
    bones[BI.head].add(this.head);
    this.head.position.set(0, 0.05, 0.085); // entre o nariz e a boca, no espaço do osso da cabeça
    const nb = bones.length;
    this.Qm = []; this.Pm = [];
    for (let i = 0; i < nb; i++) { this.Qm.push(new THREE.Quaternion()); this.Pm.push(new THREE.Vector3()); }
    // membros: 0 perna E, 1 perna D, 2 braço E, 3 braço D
    this.limbs = [0, 1, 2, 3].map((i) => ({
      i, arm: i >= 2, side: i % 2 === 0 ? 1 : -1, N: i % 2 === 0 ? 'L' : 'R',
      foot: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), planted: true, st: 0, dur: 0.3, u: 0,
      from: new THREE.Vector3(), to: new THREE.Vector3(), fromFwd: new THREE.Vector3(), toFwd: new THREE.Vector3(),
      wasSwing: false, mode: 'free', gw: 0, idle: false, quiet: false, travel: 0, flex: 0,
      hp: new THREE.Vector3(), hv: new THREE.Vector3(), footDirW: new THREE.Vector3(0, 0, 1), // mão solta (pêndulo, mundo)
      sPrev: new THREE.Vector3(), sv: new THREE.Vector3(), sInit: false, // ombro (para o pêndulo não "arrastar")
    }));
    this.xl = [{ side: 1, N: 'L', t: new THREE.Vector3(), tv: new THREE.Vector3(), init: false }, { side: -1, N: 'R', t: new THREE.Vector3(), tv: new THREE.Vector3(), init: false }];
    this.world = null; this.ceil = 2.8;
    this.stage = 0; this.growth = 0; this.scale = 1; this.scaleV = 0;
    this.xg = 0.001; this.xgV = 0; this.eyes1 = 0; this.eyes2 = 0;
    this.tf = null; this.onJolt = null; this.onPlant = null;
    this.t = 0; this.phase = 0; this.q = 0; this.quad = false; this.gallop = false;
    this.surf = 0; this.surfFrom = 0; this.surfTo = 0; this.surfT = 1; this.surfDur = 0.7;
    this.vel = new THREE.Vector3(); this.velPrev = new THREE.Vector3(); this.acc = new THREE.Vector3(); this.om = 0;
    this.prevPos = new THREE.Vector3(); this.prevPsi = 0; this.first = true;
    this.pel = new THREE.Vector3(0, 1.13, 0); this.pelV = new THREE.Vector3();
    this.A = { pp: 0, ppV: 0, pr: 0, prV: 0, cp: 0, cpV: 0, cr: 0, crV: 0, cy: 0, cyV: 0 };
    this.hunch = 0; this.lookYaw = 0; this.lookS = new THREE.Quaternion(); this.headTop = 0;
    this.tw = { y: 0, p: 0, r: 0, vy: 0, vp: 0, vr: 0 }; this.twT = 1;
    this.jaw = 0; this.jawV = 0; this.jawKick = 0; this.jawSlide = 0; this.breath = 0; this.tiltSide = 1; this.tiltT = 3;
    this.trail = []; this.idleT = 0; this.spasm = 0;
    this.Qs = new THREE.Quaternion(); this.upM = new THREE.Vector3(0, 1, 0); this.upW = new THREE.Vector3(0, 1, 0); this.ys = 0;
    this.setStage(0);
  }
  Creature.STAGE_NAMES = NAMES;
  Creature.model = model;
  const C = Creature.prototype;

  // ---------------- olhos, dentes e boca (presos aos ossos) ----------------
  C.buildRigid = function () {
    const M = this.M, bones = this.bones;
    const qi = new THREE.Quaternion();
    const toLocal = (bi, p) => { const b = M.bones[bi]; qi.copy(b.q).invert(); return V3(vsub(p, b.head)).applyQuaternion(qi); };
    const eyeGeo = new THREE.SphereGeometry(1, 14, 10);
    const innerGeo = new THREE.SphereGeometry(1, 12, 8);
    this.eyeMeshes = [];
    const teeth = {};
    for (const r of M.plan.rigid) {
      if (r.kind === 'eye') {
        const m = new THREE.Mesh(eyeGeo, this.mats.eye);
        m.position.copy(toLocal(r.bone, r.c));
        m.userData.r = r.r; m.userData.stage = r.stage;
        m.scale.setScalar(r.r);
        bones[r.bone].add(m);
        this.eyeMeshes.push(m);
      } else if (r.kind === 'inner') {
        const m = new THREE.Mesh(innerGeo, this.mats.inner);
        m.position.copy(toLocal(r.bone, r.c));
        m.scale.set(r.r[0], r.r[1], r.r[2]);
        bones[r.bone].add(m);
      } else if (r.kind === 'tooth') {
        (teeth[r.bone] = teeth[r.bone] || []).push(r);
      }
    }
    // dentes: cones finos juntados numa geometria por osso
    for (const bi in teeth) {
      const pos = [], idx = [];
      for (const t of teeth[bi]) {
        const a = toLocal(+bi, t.a), b = toLocal(+bi, t.b);
        const ax = new THREE.Vector3().subVectors(b, a).normalize();
        const s1 = new THREE.Vector3().crossVectors(ax, Math.abs(ax.x) < 0.9 ? XA : ZA).normalize();
        const s2 = new THREE.Vector3().crossVectors(ax, s1);
        const o = pos.length / 3;
        for (let k = 0; k < 5; k++) {
          const ang = (k / 5) * TAU, c = Math.cos(ang) * t.r, sn = Math.sin(ang) * t.r;
          pos.push(a.x + s1.x * c + s2.x * sn, a.y + s1.y * c + s2.y * sn, a.z + s1.z * c + s2.z * sn);
        }
        pos.push(b.x, b.y, b.z);
        for (let k = 0; k < 5; k++) idx.push(o + k, o + ((k + 1) % 5), o + 5);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      bones[+bi].add(new THREE.Mesh(g, this.mats.teeth));
    }
  };

  // ---------------- API usada pela IA e pelo jogo ----------------
  C.setWorld = function (world) { this.world = world; this.ceil = world ? world.CEIL : 2.8; this.first = true; this.surf = this.surfFrom = this.surfTo = 0; this.surfT = 1; };
  C.setStage = function (s) {
    this.stage = clamp(s | 0, 0, 2); this.tf = null;
    this.scale = STAGE_SCALE[this.stage] * (1 + 0.04 * this.growth); this.scaleV = 0;
    this.xg = this.stage >= 2 ? 1 : 0.001; this.xgV = 0;
    this.eyes1 = this.stage >= 1 ? 1 : 0; this.eyes2 = this.stage >= 2 ? 1 : 0;
    this.first = true;
  };
  // muda de forma aos trancos; done() no fim
  C.transformTo = function (s, dur, done) {
    s = clamp(s | 0, 0, 2);
    if (s === this.stage) { if (done) done(); return; }
    const n = 7 + ((Math.random() * 3) | 0), jolts = [];
    for (let i = 0; i < n; i++) jolts.push(dur * (0.1 + (0.8 * (i + 0.15 + Math.random() * 0.7)) / n));
    this.tf = { from: this.stage, to: s, t: 0, dur, jolts, ji: 0, k: 0, s0: this.scale, s1: STAGE_SCALE[s], done };
    this.stage = s;
  };
  C.transforming = function () { return !!this.tf; };
  C.speedMul = function () { return [1, 1.05, 1.08][this.stage]; };
  C.reachDist = function () { return (1.1 + 0.2 * this.stage) * this.scale; };
  C.soundSize = function () { return (0.9 + 0.45 * this.stage) * this.scale; };
  C.dispose = function () { for (const k in this.mats) this.mats[k].dispose(); };

  // ---------------- crescimento / transformação ----------------
  C.growthStep = function (dt) {
    const tf = this.tf;
    let target = STAGE_SCALE[this.stage] * (1 + 0.04 * this.growth);
    let k1 = this.stage >= 1 ? 1 : 0, k2 = this.stage >= 2 ? 1 : 0;
    this.spasm = Math.max(0, this.spasm - dt * 1.6);
    if (tf) {
      tf.t += dt;
      while (tf.ji < tf.jolts.length && tf.t >= tf.jolts[tf.ji]) {
        tf.ji++;
        tf.k = tf.ji / tf.jolts.length;
        this.scaleV += 0.5;
        this.jolt();
        if (this.onJolt) this.onJolt(tf.ji, tf.jolts.length);
      }
      target = lerp(tf.s0, tf.s1, tf.k);
      if (tf.to === 1) k1 = tf.k;
      if (tf.to === 2) k2 = tf.k;
      if (tf.t >= tf.dur + 0.6) { const done = tf.done; this.tf = null; if (done) done(); }
    }
    this.scaleV += (90 * (target - this.scale) - 7.5 * this.scaleV) * dt;
    this.scale += this.scaleV * dt;
    this.xgV += (70 * (Math.max(0.001, k2) - this.xg) - 6 * this.xgV) * dt;
    this.xg = Math.max(0.001, this.xg + this.xgV * dt);
    this.eyes1 = U.damp(this.eyes1, k1, 6, dt); this.eyes2 = U.damp(this.eyes2, k2, 6, dt);
  };
  C.jolt = function () {
    this.pelV.y -= 0.9;
    this.A.cpV += U.rand(-7, 7); this.A.crV += U.rand(-8, 8); this.A.ppV += U.rand(-4, 4);
    this.tw.vy += U.rand(-16, 16); this.tw.vp += U.rand(-12, 12); this.tw.vr += U.rand(-14, 14);
    this.jawKick = 1; this.spasm = 1;
    for (const L of this.limbs) if (L.arm) L.hv.set(U.rand(-5, 5), U.rand(-2, 5), U.rand(-5, 5));
  };

  // ---------------- teto <-> chão ----------------
  C.startSurf = function (to) {
    this.surfFrom = this.surf; this.surfTo = to; this.surfT = 0;
    this.surfDur = to === 1 ? 0.75 : 0.5;
  };
  C.surfUpdate = function (dt) {
    if (this.surfT < 1) {
      this.surfT = Math.min(1, this.surfT + dt / this.surfDur);
      this.surf = lerp(this.surfFrom, this.surfTo, sstep(0, 1, this.surfT));
      if (this.surfT >= 1) { this.surf = this.surfTo; for (const L of this.limbs) if (L.mode === 'gait') this.startSwing(L, 0.14, false); }
    }
    const b = this.surf * Math.PI;
    this.Qs.setFromAxisAngle(ZA, b);
    this.ys = (this.surf * this.ceil) / this.scale;
    this.upM.set(-Math.sin(b), Math.cos(b), 0);
    this.upW.set(0, this.surf > 0.5 ? -1 : 1, 0);
  };
  C.startSwing = function (L, dur, quiet) {
    L.planted = false; L.st = 0; L.dur = Math.max(0.08, dur);
    L.from.copy(L.foot); L.fromFwd.copy(L.fwd); L.quiet = !!quiet;
  };

  // ---------------- conversões ----------------
  // ponto no "espaço da superfície" (x lateral, h altura sobre a superfície, z frente) -> malha
  C.surfToMesh = function (out, x, h, z) {
    out.set(x, h, z).applyQuaternion(this.Qs);
    out.y += this.ys;
    return out;
  };
  C.meshToWorld = function (out, v, R, psi, s) {
    const c = Math.cos(psi), sn = Math.sin(psi);
    const x = v.x * s, y = v.y * s, z = v.z * s;
    return out.set(R.x + x * c + z * sn, R.y + y, R.z - x * sn + z * c);
  };
  C.worldToMesh = function (out, w) {
    const R = this.root.position, psi = this.root.rotation.y, s = this.scale;
    const c = Math.cos(psi), sn = Math.sin(psi);
    const x = w.x - R.x, y = w.y - R.y, z = w.z - R.z;
    return out.set((x * c - z * sn) / s, y / s, (x * sn + z * c) / s);
  };
  C.dirToMesh = function (out, w) {
    const psi = this.root.rotation.y, c = Math.cos(psi), sn = Math.sin(psi);
    return out.set(w.x * c - w.z * sn, w.y, w.x * sn + w.z * c);
  };
  C.home = function (L) {
    if (L.arm) return [0.27, 0.56];
    const qS = sstep(0, 1, this.q);
    return [lerp(0.13, 0.19, qS), lerp(0.0, -0.4, qS)];
  };
  // ponto de apoio previsto de um membro (mundo), tau segundos no futuro
  C.predict = function (L, tau, out, outFwd) {
    const R = this.root.position, s = this.scale;
    const px = R.x + this.vel.x * tau, pz = R.z + this.vel.z * tau;
    const ps = this.root.rotation.y + clamp(this.om * tau, -0.8, 0.8);
    const home = this.home(L);
    this.surfToMesh(_P, L.side * home[0], 0, home[1]);
    const c = Math.cos(ps), sn = Math.sin(ps);
    out.set(px + (_P.x * c + _P.z * sn) * s, R.y + _P.y * s, pz + (-_P.x * sn + _P.z * c) * s);
    // não pisa dentro da parede: puxa o apoio para perto do corpo
    const w = this.world;
    if (w && w.solidAt(out.x, out.z)) {
      const ox = out.x, oz = out.z;
      for (let k = 1; k <= 6; k++) {
        const t = k / 6;
        out.x = lerp(ox, px, t * 0.9); out.z = lerp(oz, pz, t * 0.9);
        if (!w.solidAt(out.x, out.z)) break;
      }
    }
    if (outFwd) {
      const a = L.arm ? 0.42 : 0.1; // dedos das mãos apontam para fora (aranha)
      this.surfToMesh(_P, L.side * Math.sin(a), 0, Math.cos(a)); _P.y -= this.ys;
      outFwd.set(_P.x * c + _P.z * sn, _P.y, -_P.x * sn + _P.z * c).normalize();
    }
    return out;
  };

  C.reset = function () {
    this.first = false;
    const R = this.root.position, psi = this.root.rotation.y;
    this.prevPos.copy(R); this.prevPsi = psi;
    this.vel.set(0, 0, 0); this.acc.set(0, 0, 0); this.om = 0;
    this.surfUpdate(0);
    this.trail.length = 0; this.trail.push(R.clone());
    const inv = this.surf > 0.5;
    this.pel.set(0, inv ? this.ys - 0.86 : this.q > 0.5 ? 0.86 : 1.13, this.q > 0.5 ? -0.36 : 0); this.pelV.set(0, 0, 0);
    for (const k in this.A) this.A[k] = 0;
    this.lookS.identity();
    for (const L of this.limbs) {
      L.mode = !L.arm || this.q >= 0.5 ? 'gait' : 'free';
      this.predict(L, 0, L.foot, L.fwd);
      L.planted = true; L.st = 0; L.u = 0; L.gw = L.mode === 'gait' ? 1 : 0;
      L.hp.copy(L.foot); L.hp.y = inv ? this.ceil - 0.9 * this.scale : 0.9 * this.scale; L.hv.set(0, 0, 0); L.sInit = false;
    }
    for (const X of this.xl) X.init = false;
  };

  // =========================================================
  //  ATUALIZAÇÃO POR QUADRO
  // =========================================================
  C.update = function (dt, p) {
    p = p || EMPTY;
    dt = clamp(dt || 0.016, 1e-4, 0.05);
    this.t += dt;
    this.growthStep(dt);
    const s = this.scale;
    this.root.scale.setScalar(s);
    const R = this.root.position, psi = this.root.rotation.y;
    const lunge = clamp(p.lunge || 0, 0, 1), tfK = this.tf ? 1 : 0;
    const ag = clamp(p.agitation || 0, 0, 1), jerky = clamp(p.jerky || 0, 0, 1);
    if (!this.first && !lunge && Math.hypot(R.x - this.prevPos.x, R.z - this.prevPos.z) > 2.5) this.first = true; // teletransportada
    // ---- teto / chão ----
    const wantCeil = p.ceiling && !tfK && !lunge ? 1 : 0;
    if (wantCeil !== this.surfTo) this.startSurf(wantCeil);
    this.surfUpdate(dt);
    if (this.first) this.reset();

    // ---- movimento da raiz (vem do cérebro) ----
    let vx = 0, vz = 0, om = 0;
    if (!lunge) { vx = (R.x - this.prevPos.x) / dt; vz = (R.z - this.prevPos.z) / dt; om = U.angDiff(this.prevPsi, psi) / dt; }
    this.prevPos.copy(R); this.prevPsi = psi;
    this.velPrev.copy(this.vel);
    this.vel.x = U.damp(this.vel.x, vx, 9, dt); this.vel.z = U.damp(this.vel.z, vz, 9, dt);
    this.om = U.damp(this.om, clamp(om, -8, 8), 9, dt);
    this.acc.x = U.damp(this.acc.x, (this.vel.x - this.velPrev.x) / dt, 5, dt);
    this.acc.z = U.damp(this.acc.z, (this.vel.z - this.velPrev.z) / dt, 5, dt);
    const speed = Math.hypot(this.vel.x, this.vel.z), vU = speed / s;
    const lastT = this.trail[this.trail.length - 1];
    if (!lastT || Math.hypot(R.x - lastT.x, R.z - lastT.z) > 0.05) { this.trail.push(R.clone()); if (this.trail.length > 48) this.trail.shift(); }

    // ---- em pé ou de quatro? ----
    const inv = this.surf > 0.5, airborne = this.surfT < 1;
    if (this.surfTo === 1 || airborne) this.quad = true;
    else if (tfK || lunge || p.flinch || p.reach) this.quad = false;
    else if (vU > (this.stage >= 1 ? 1.7 : 2.3)) this.quad = true;
    else if (vU < 1.05) this.quad = false;
    this.q = clamp(this.q + clamp((this.quad ? 1 : 0) - this.q, -dt * 2.4, dt * 2.4), 0, 1);
    const qS = sstep(0, 1, this.q);
    let G;
    if (this.q < 0.5) G = GAITS.biped;
    else { if (vU > 2.9) this.gallop = true; else if (vU < 2.3) this.gallop = false; G = this.gallop ? GAITS.gallop : GAITS.walk; }
    const stride = clamp(G.s0 + G.s1 * vU, G.smin, G.smax);
    const freq = vU / stride;
    const moving = vU > 0.12 && !tfK && !lunge && !airborne;
    if (moving) this.phase = (this.phase + freq * dt) % 1;
    const stanceT = moving ? G.duty / Math.max(freq, 0.25) : 0;

    // ---- passos: membros plantados no mundo ----
    this.idleT -= dt;
    let swinging = 0;
    for (const L of this.limbs) if (!L.planted && L.mode === 'gait') swinging++;
    for (const L of this.limbs) {
      if (L.arm) {
        const inGait = this.q >= 0.5;
        if (!inGait && L.mode === 'gait') { L.mode = 'free'; L.planted = false; L.hp.copy(L.foot); L.hv.set(0, 0, 0); }
        else if (inGait && L.mode === 'free') { L.mode = 'gait'; L.foot.copy(L.hp); L.fwd.set(Math.sin(psi), 0, Math.cos(psi)); this.startSwing(L, 0.24, false); }
        L.gw = clamp(L.gw + (L.mode === 'gait' ? dt : -dt) * 4, 0, 1);
        if (L.mode !== 'gait') continue;
      }
      if (airborne || lunge) { // no ar / segurada pelo jogo: os membros acompanham o corpo
        this.predict(L, 0, L.to, L.toFwd);
        if (airborne) { L.foot.lerp(L.to, 1 - Math.exp(-dt * 7)); L.fwd.lerp(L.toFwd, 0.2).normalize(); }
        else { L.foot.copy(L.to); L.fwd.copy(L.toFwd); }
        L.planted = true; L.u = 0;
        continue;
      }
      const lph = (this.phase + G.off[L.i]) % 1, inSwing = lph >= G.duty;
      if (L.planted) {
        this.predict(L, 0, _a);
        const dHome = L.foot.distanceTo(_a) / s;
        let dur = 0;
        if (moving && inSwing && !L.wasSwing) dur = clamp((1 - G.duty) / Math.max(freq, 0.3), 0.14, 0.62);
        else if (dHome > (this.q > 0.5 ? 0.95 : 0.75)) dur = 0.2; // ficou para trás demais: passo de emergência
        else if (!moving && dHome > 0.16 && swinging === 0 && this.idleT <= 0) { dur = 0.3; this.idleT = 0.12; }
        if (dur) { this.startSwing(L, dur, !moving && dHome < 0.3); L.idle = !moving; swinging++; }
      }
      L.wasSwing = inSwing;
      if (!L.planted) {
        L.st += dt / L.dur;
        const u = Math.min(1, L.st), e = u * u * (3 - 2 * u);
        this.predict(L, Math.max(0, 1 - L.st) * L.dur + stanceT * 0.5, L.to, L.toFwd);
        L.foot.lerpVectors(L.from, L.to, e);
        const lift = (L.idle ? 0.06 : G.lift[L.i] * (1 + 0.45 * ag)) * s * Math.sin(Math.PI * u);
        L.foot.addScaledVector(this.upW, lift);
        L.fwd.lerpVectors(L.fromFwd, L.toFwd, e).normalize();
        L.u = u;
        if (L.st >= 1) {
          L.planted = true; L.u = 0;
          L.travel = L.from.distanceTo(L.to);
          L.foot.copy(L.to); L.fwd.copy(L.toFwd);
          if (this.onPlant && !L.quiet && L.travel > 0.06 * s) this.onPlant(L.foot.x, L.foot.y, L.foot.z, !L.arm, L.arm);
        }
      }
    }

    // ---- postura (molas) ----
    const mv = moving ? clamp(vU / 0.9, 0, 1) : 0;
    const ph = this.phase * TAU;
    const A = this.A;
    const spz = this.spasm, flinch = p.flinch ? 1 : 0, reach = p.reach && p.reachTarget ? 1 : 0;
    const crouch = (tfK ? 0.14 : 0) + (p.listen ? 0.03 : 0) + flinch * 0.04;
    let pH = lerp(1.165, 0.86, qS) - 0.15 * this.hunch * (1 - qS) - crouch;
    if (inv) pH = lerp(pH, 0.72, qS); // no teto fica mais colada
    let pX = 0, pZ = lerp(0, -0.36, qS), yP = 0;
    // a bacia segue o rastro do peito (a coluna faz a curva)
    if (qS > 0.01 && this.trail.length > 3 && !airborne) {
      let need = 0.36 * s, prev = R, pt = null;
      for (let i = this.trail.length - 1; i >= 0 && need > 0; i--) {
        const tp = this.trail[i], d = Math.hypot(tp.x - prev.x, tp.z - prev.z);
        if (d >= need) { const t = need / d; pt = _b.set(lerp(prev.x, tp.x, t), R.y, lerp(prev.z, tp.z, t)); break; }
        need -= d; prev = tp;
      }
      if (pt) {
        this.worldToMesh(_c, pt);
        pX = clamp(_c.x, -0.3, 0.3) * (inv ? -1 : 1) * qS;
        pZ = lerp(0, clamp(_c.z, -0.5, -0.2), qS);
      }
    }
    if (qS > 0.01) yP = clamp(Math.atan2(-pX, 0.36 - pZ), -0.8, 0.8);
    // oscilações da marcha
    let pPitch = lerp(0.1, 1.22, qS), cPitch = lerp(0.36, 1.42, qS), pRoll = 0, cRoll = 0, cYaw = 0;
    if (this.q < 0.5) {
      pH += 0.022 * Math.cos(2 * ph) * mv;
      pRoll += 0.06 * Math.sin(ph) * mv; yP += 0.1 * Math.sin(ph) * mv; cYaw -= 0.12 * Math.sin(ph) * mv;
      pX += 0.03 * Math.sin(ph) * mv;
    } else if (!this.gallop) {
      pH += 0.014 * Math.cos(2 * ph) * mv; cYaw += 0.09 * Math.sin(ph) * mv; yP -= 0.07 * Math.sin(ph) * mv;
    } else {
      pPitch += 0.2 * Math.sin(ph) * mv; cPitch -= 0.14 * Math.sin(ph - 1.4) * mv; pH += 0.055 * Math.sin(ph + 0.6) * mv;
    }
    // inércia: inclina ao acelerar/frear e para dentro das curvas
    const ca = Math.cos(psi), sa = Math.sin(psi);
    const aF = (this.acc.x * sa + this.acc.z * ca) / s, aL = (this.acc.x * ca - this.acc.z * sa) / s;
    cPitch += clamp(aF * 0.035, -0.22, 0.3) + this.hunch * 0.6 * (1 - qS) + (p.listen ? 0.12 : 0) + lunge * 0.55 - flinch * 0.4 - reach * 0.25;
    cPitch += tfK * (0.45 + 0.18 * Math.sin(this.t * 5.3)) + spz * U.rand(-0.3, 0.3);
    cRoll += clamp(vU * this.om * 0.07, -0.3, 0.3) + tfK * 0.15 * Math.sin(this.t * 3.1);
    // respiração
    this.breath += dt * TAU * lerp(0.22, 0.75, Math.max(ag, tfK));
    cPitch += Math.sin(this.breath) * 0.02;
    const sp = (key, target, k, c) => { A[key + 'V'] += (k * (target - A[key]) - c * A[key + 'V']) * dt; A[key] += A[key + 'V'] * dt; };
    sp('pp', pPitch, 70, 13); sp('pr', pRoll, 70, 12); sp('cp', cPitch, 60, 11); sp('cr', cRoll, 60, 10); sp('cy', cYaw, 60, 11);
    // bacia (posição, malha) com mola + inércia
    this.surfToMesh(_T, pX, pH, pZ);
    const K = 75, Cd = 13;
    this.pelV.x += (K * (_T.x - this.pel.x) - Cd * this.pelV.x + aL * 0.3 * (inv ? -1 : 1)) * dt;
    this.pelV.y += (K * (_T.y - this.pel.y) - Cd * this.pelV.y) * dt;
    this.pelV.z += (K * (_T.z - this.pel.z) - Cd * this.pelV.z - aF * 0.3) * dt;
    this.pel.addScaledVector(this.pelV, dt);
    if (lunge || airborne) this.pel.lerp(_T, airborne ? 0.25 : 1);

    // ---- coluna ----
    const M = this.M, BI = this.BI, Qm = this.Qm, Pm = this.Pm, mb = M.bones;
    const qP = _q1.copy(this.Qs).multiply(_q3.setFromEuler(_e.set(A.pp, yP, A.pr, 'YXZ')));
    const qC = _q2.copy(this.Qs).multiply(_q3.setFromEuler(_e.set(A.cp, A.cy, A.cr, 'YXZ')));
    Pm[BI.hips].copy(this.pel);
    Qm[BI.hips].copy(qP).multiply(mb[BI.hips].q);
    // alcance das pernas: se um pé não alcança o apoio, a bacia desce
    if (!airborne) {
      let excess = 0;
      for (const L of this.limbs) {
        if (L.arm) continue;
        const hip = _a.copy(mb[BI['thigh' + L.N]].lpos).applyQuaternion(Qm[BI.hips]).add(Pm[BI.hips]);
        this.ankleTarget(L, _b);
        this.worldToMesh(_c, _b);
        excess = Math.max(excess, hip.distanceTo(_c) - (L_TH + L_SH) * 0.985);
      }
      if (excess > 0) {
        Pm[BI.hips].addScaledVector(this.upM, -excess);
        this.pel.addScaledVector(this.upM, -excess * 0.5);
      }
    }
    this.setQ(BI.spine1, _q3.copy(qP).slerp(qC, 0.3).multiply(mb[BI.spine1].q));
    this.setQ(BI.spine2, _q3.copy(qP).slerp(qC, 0.62).multiply(mb[BI.spine2].q));
    this.setQ(BI.chest, _q3.copy(qC).multiply(mb[BI.chest].q));

    // ---- olhar: a cabeça mira o alvo e fica estável enquanto o corpo balança ----
    const tw = this.tw;
    this.twT -= dt * (1 + 2.5 * jerky + 1.5 * ag + 5 * tfK);
    if (this.twT <= 0) {
      this.twT = U.rand(0.5, 2.8);
      const k = 0.35 + jerky * 0.9 + ag * 0.4;
      tw.vy += U.rand(-9, 9) * k; tw.vp += U.rand(-6, 6) * k; tw.vr += U.rand(-9, 9) * k;
    }
    tw.vy += (-140 * tw.y - 11 * tw.vy) * dt; tw.y += tw.vy * dt;
    tw.vp += (-140 * tw.p - 11 * tw.vp) * dt; tw.p += tw.vp * dt;
    tw.vr += (-140 * tw.r - 11 * tw.vr) * dt; tw.r += tw.vr * dt;
    let yawT = A.cy, pitT = 0.12 * qS + (inv ? 0.3 : 0), tilt = 0;
    if (p.look) {
      this.worldToMesh(_a, p.look).sub(Pm[BI.head]);
      _a.applyQuaternion(_q3.copy(this.Qs).invert());
      const hl = Math.hypot(_a.x, _a.z);
      if (hl > 1e-4 || Math.abs(_a.y) > 1e-4) {
        yawT = A.cy + clamp(U.angDiff(A.cy, Math.atan2(_a.x, _a.z)), -1.9, 1.9);
        pitT = clamp(Math.atan2(-_a.y, hl), inv ? -1.5 : -0.9, 1.05);
      }
    }
    if (p.listen) {
      this.tiltT -= dt;
      if (this.tiltT <= 0) { this.tiltT = U.rand(2.5, 5); this.tiltSide = -this.tiltSide; }
      tilt = 0.45 * this.tiltSide; pitT += 0.1 * Math.sin(this.t * 2.2);
    }
    if (flinch) { yawT += 0.9 * this.tiltSide; pitT -= 0.45; }
    if (tfK) { yawT += Math.sin(this.t * 7.3) * 0.5 * spz + Math.sin(this.t * 2.1) * 0.35; tilt += Math.sin(this.t * 4.4) * 0.5; pitT -= 0.3; }
    _q3.setFromEuler(_e.set(pitT + tw.p, yawT + tw.y, tilt + tw.r, 'YXZ'));
    this.lookS.slerp(_q3, 1 - Math.exp(-dt * (8 + 10 * ag + 14 * jerky)));
    this.lookYaw = (inv ? -1 : 1) * yawT;
    const qH = _q3.copy(this.Qs).multiply(this.lookS);
    this.setQ(BI.neck1, _q1.copy(qC).slerp(qH, 0.34).multiply(mb[BI.neck1].q));
    this.setQ(BI.neck2, _q1.copy(qC).slerp(qH, 0.68).multiply(mb[BI.neck2].q));
    this.setQ(BI.head, _q1.copy(qH).multiply(mb[BI.head].q));
    // boca
    let mouth = clamp(p.mouth || 0, 0, 1);
    if (tfK) mouth = Math.max(mouth, 0.35 + 0.5 * spz);
    this.jawKick = Math.max(0, this.jawKick - dt * 2);
    const jt = mouth * 0.42 + (mouth > 0.85 ? 0.1 : 0) + this.jawKick * 0.3 + (ag > 0.5 ? 0.03 * Math.sin(this.t * 31) : 0);
    this.jawV += (120 * (jt - this.jaw) - 14 * this.jawV) * dt; this.jaw += this.jawV * dt;
    const jo = clamp(this.jaw, -0.04, 0.62);
    this.jawSlide = clamp(jo / 0.52, 0, 1) * 0.45;
    this.setRel(BI.jaw, _q1.setFromAxisAngle(XA, -jo));
    this.Pm[BI.jaw].add(_a.set(0, -0.022, 0.03).multiplyScalar(this.jawSlide).applyQuaternion(Qm[BI.head]));
    // topo da cabeça -> encurvar sob o teto
    _a.set(0, 0.31, -0.02).applyQuaternion(Qm[BI.head]).add(Pm[BI.head]);
    this.headTop = _a.y * s;
    if (!inv && !airborne && !lunge) {
      const excess = (this.headTop - (this.ceil - 0.07)) / s;
      this.hunch = clamp(this.hunch + (excess > 0 ? excess * 7 : -0.35) * dt, 0, 1);
    }

    // ---- membros ----
    for (const L of this.limbs) if (L.arm) this.poseArm(L, dt, p, s, qS, mv, ag, lunge, flinch, reach, tfK, inv);
    for (const L of this.limbs) if (!L.arm) this.poseLeg(L, qS, yP);
    this.poseExtra(dt, p, ag, tfK, lunge);
    this.commit();
    // olhos novos se abrindo
    for (const m of this.eyeMeshes) {
      const st = m.userData.stage, k = st === 0 ? 1 : st === 1 ? this.eyes1 : this.eyes2;
      m.scale.setScalar(m.userData.r * Math.max(0.001, k));
      m.visible = k > 0.02;
    }
    this.mats.eye.uniforms.uEmissive.value = p.eyeGlow != null ? p.eyeGlow : 0.3;
    // nível de detalhe: de longe usa a malha leve (com folga para não ficar trocando)
    if (p.camDist != null) {
      const far = !lunge && p.camDist > (this.far ? 8.5 : 9.5) * s;
      if (far !== this.far) { this.far = far; this.mesh.geometry = far ? M.lod[1] : M.lod[0]; }
    }
  };

  // orientação absoluta (malha) do osso i + posição pela cadeia do pai
  C.setQ = function (i, q) {
    const b = this.M.bones[i];
    this.Qm[i].copy(q);
    if (b.parent >= 0) this.Pm[i].copy(b.lpos).applyQuaternion(this.Qm[b.parent]).add(this.Pm[b.parent]);
  };
  // orientação relativa ao pai (repouso * extra)
  C.setRel = function (i, extra) {
    const b = this.M.bones[i];
    this.Qm[i].copy(this.Qm[b.parent]).multiply(b.lq);
    if (extra) this.Qm[i].multiply(extra);
    this.Pm[i].copy(b.lpos).applyQuaternion(this.Qm[b.parent]).add(this.Pm[b.parent]);
  };
  C.posFromParent = function (i) {
    const b = this.M.bones[i];
    return this.Pm[i].copy(b.lpos).applyQuaternion(this.Qm[b.parent]).add(this.Pm[b.parent]);
  };
  C.commit = function () {
    const mb = this.M.bones, Qm = this.Qm;
    for (let i = 0; i < mb.length; i++) {
      const b = mb[i], bone = this.bones[i];
      if (b.parent < 0) { bone.position.copy(this.Pm[i]); bone.quaternion.copy(Qm[i]); }
      else bone.quaternion.copy(Qm[b.parent]).invert().multiply(Qm[i]);
    }
    this.bones[this.BI.xupL].scale.setScalar(this.xg);
    this.bones[this.BI.xupR].scale.setScalar(this.xg);
    // a mandíbula desliza para a frente quando escancara
    const jb = mb[this.BI.jaw];
    this.bones[this.BI.jaw].position.set(jb.lpos.x, jb.lpos.y - 0.022 * this.jawSlide, jb.lpos.z + 0.03 * this.jawSlide);
  };

  // tornozelo (mundo) a partir do apoio: o pé rola sobre os dedos ao sair do chão
  C.ankleTarget = function (L, out) {
    const s = this.scale, up = this.upW, fw = L.fwd;
    let extra = 0;
    if (!L.planted) extra = 0.55 * (1 - L.u) * (1 - L.u) - 0.22 * Math.sin(Math.PI * L.u);
    else if (this.q < 0.5 && this.vel.lengthSq() > 0.05) {
      const G = GAITS.biped, ph = (this.phase + G.off[L.i]) % 1;
      extra = 0.6 * sstep(G.duty * 0.6, G.duty, ph);
    }
    const a = FOOT_PITCH + extra;
    // a bola do pé fica no lugar; o tornozelo gira em volta dela
    _d.copy(L.foot).addScaledVector(fw, 0.148 * s).addScaledVector(up, 0.026 * s);
    _f.copy(fw).multiplyScalar(Math.cos(a)).addScaledVector(up, -Math.sin(a));
    out.copy(_d).addScaledVector(_f, -ANKLE_BALL * s);
    L.footDirW.copy(_f);
    return out;
  };

  C.poseLeg = function (L, qS, yP) {
    const BI = this.BI, Pm = this.Pm, N = L.N;
    const ti = BI['thigh' + N], si = BI['shin' + N], fi = BI['foot' + N], oi = BI['toe' + N];
    this.posFromParent(ti);
    this.ankleTarget(L, _T);
    this.worldToMesh(_T, _T);
    // joelho para a frente e um pouco para fora (mais aberto de quatro: aranha)
    this.surfToMesh(_P, L.side * (0.2 + 0.45 * qS), 0, 1); _P.y -= this.ys;
    _P.applyAxisAngle(this.upM, yP);
    solve2(Pm[ti], _T, L_TH, L_SH, _P, _J, _E, _H);
    this.setQ(ti, qHinge(_q1, _H, _a.subVectors(_J, Pm[ti])));
    this.setQ(si, qHinge(_q1, _H, _a.subVectors(_E, _J)));
    // pé: direção tornozelo->bola, sola para a superfície
    this.dirToMesh(_a, L.footDirW);
    this.setQ(fi, qFrame(_q1, _a, this.upM));
    // dedos: planos no chão; no ar, se dobram para cima
    this.dirToMesh(_b, L.fwd);
    const tb = L.planted ? 0.14 : 0.14 - 0.5 * Math.sin(Math.PI * L.u);
    _b.multiplyScalar(Math.cos(tb)).addScaledVector(this.upM, -Math.sin(tb));
    this.setQ(oi, qFrame(_q1, _b, this.upM));
  };

  C.poseArm = function (L, dt, p, s, qS, mv, ag, lunge, flinch, reach, tfK, inv) {
    const BI = this.BI, Qm = this.Qm, Pm = this.Pm, N = L.N, side = L.side;
    const ci = BI['clav' + N], ui = BI['up' + N], fo = BI['fore' + N], hi = BI['hand' + N];
    const R = this.root.position, psi = this.root.rotation.y;
    // clavícula: ombros sobem de quatro, ao alcançar e ao respirar
    const reachThis = reach && side < 0;
    const shrug = (0.22 * qS + (reachThis ? 0.35 : 0) + flinch * 0.25 + Math.sin(this.breath) * 0.03) * side;
    this.setRel(ci, _q1.setFromAxisAngle(ZA, shrug));
    this.posFromParent(ui);
    const S = Pm[ui];
    const reachLen = (L_UP + L_FO) * 0.97;
    // ---- mão solta: pêndulo amortecido (mundo) ----
    this.meshToWorld(_a, S, R, psi, s); // ombro no mundo
    if (!L.sInit) { L.sPrev.copy(_a); L.sv.set(0, 0, 0); L.sInit = true; }
    L.sv.subVectors(_a, L.sPrev).divideScalar(dt); L.sPrev.copy(_a);
    // alvo de repouso: pendurada, balançando ao contrário da perna do mesmo lado
    const opp = this.limbs[L.i === 2 ? 1 : 0];
    this.predict(opp, 0, _b);
    const fw = _c.set(Math.sin(psi), 0, Math.cos(psi));
    const swing = clamp(_d.subVectors(opp.foot, _b).dot(fw) / s, -0.45, 0.45) * 0.55 * mv;
    this.surfToMesh(_T, side * 0.07, 0, 0.06 + swing); _T.y -= this.ys; // deslocamento a partir do ombro
    _T.addScaledVector(this.upM, -reachLen * 0.98);
    _T.add(S);
    if (flinch) { this.posFromParent(BI.head); _T.copy(Pm[BI.head]); _T.z += 0.22; _T.x += side * 0.08; _T.y -= 0.02; }
    if (lunge && p.look) { this.worldToMesh(_T, p.look); _T.x += side * 0.4; _T.y -= 0.24; }
    if (reachThis) this.worldToMesh(_T, p.reachTarget);
    if (tfK) { _T.x += Math.sin(this.t * 6.1 + side) * 0.25 * this.spasm; _T.z += Math.cos(this.t * 5.3 + side) * 0.3 * this.spasm; }
    this.meshToWorld(_d, _T, R, psi, s);
    if (L.mode !== 'gait' || L.gw < 1) {
      const firm = flinch || lunge || reachThis;
      const k = firm ? 160 : 34, c = firm ? 22 : 6.5;
      L.hv.addScaledVector(_f.subVectors(_d, L.hp), k * dt);
      // amortece só o movimento RELATIVO ao ombro (senão a mão fica para trás quando ela anda)
      _f.subVectors(L.hv, L.sv); L.hv.addScaledVector(_f, -Math.min(1, c * dt));
      L.hp.addScaledVector(L.hv, dt);
      // o braço não estica além do alcance
      _f.subVectors(L.hp, _a);
      const maxL = reachLen * s;
      if (_f.length() > maxL) { _f.setLength(maxL); L.hp.copy(_a).add(_f); }
      if (!inv && L.hp.y < 0.05 * s) { L.hp.y = 0.05 * s; L.hv.y = Math.max(0, L.hv.y); }
      const w = this.world;
      if (w && w.solidAt(L.hp.x, L.hp.z)) { L.hp.x = lerp(L.hp.x, _a.x, 0.3); L.hp.z = lerp(L.hp.z, _a.z, 0.3); L.hv.multiplyScalar(0.5); }
    }
    // ---- alvo final do punho ----
    const gw = sstep(0, 1, L.gw);
    this.worldToMesh(_T, L.hp);
    L.flex = 0;
    if (gw > 0) {
      // mão plantada: palma no chão, punho logo acima, dedos para frente/fora
      const up = this.upW;
      if (!L.planted) L.flex = 0.9 * Math.sin(Math.PI * L.u);
      _b.copy(L.foot).addScaledVector(L.fwd, -0.07 * s).addScaledVector(up, 0.034 * s);
      this.worldToMesh(_c, _b);
      _T.lerp(_c, gw);
    }
    // cotovelo para trás e para fora (de quatro: para cima, como um inseto)
    this.surfToMesh(_P, side * lerp(0.55, 0.85, qS), lerp(0.2, 0.75, qS), lerp(-1, -0.45, qS)); _P.y -= this.ys;
    _P.applyAxisAngle(this.upM, this.A.cy);
    solve2(S, _T, L_UP, L_FO, _P, _J, _E, _H);
    this.setQ(ui, qHinge(_q1, _H, _a.subVectors(_J, S)));
    this.setQ(fo, qHinge(_q1, _H, _a.subVectors(_E, _J)));
    // mão solta: continua o antebraço, punho levemente dobrado para a palma
    _a.subVectors(_E, _J).normalize();
    _b.set(1, 0, 0).applyQuaternion(Qm[fo]).multiplyScalar(side);  // costas da mão
    _c.crossVectors(_a, _b).normalize();                              // largura da mão
    _a.applyAxisAngle(_c, -(0.25 + 0.3 * ag));
    qFrame(_q1, _a, _b);
    if (gw > 0) { // mão plantada: espalmada na superfície
      this.dirToMesh(_c, L.fwd);
      const fl = 0.08 + L.flex;
      _c.multiplyScalar(Math.cos(fl)).addScaledVector(this.upM, -Math.sin(fl));
      qFrame(_q2, _c, this.upM);
      _q1.slerp(_q2, gw);
    }
    this.setQ(hi, _q1);
    // dedos: tamborilam soltos; espalmados no apoio (pontas cravadas); fechados no ar
    for (let f = 0; f < 5; f++) {
      const a = BI['f' + N + f + 'a'], b = BI['f' + N + f + 'b'];
      const nz = Math.sin(this.t * (2.3 + f * 0.7) + f * 1.9 + side) * 0.5 + Math.sin(this.t * (5.1 + f) + f) * 0.5;
      let c1 = 0.35 + 0.15 * nz * (0.3 + ag), c2 = 0.45 + 0.2 * nz * (0.3 + ag);
      if (gw > 0) {
        const air = L.planted ? 0 : Math.sin(Math.PI * L.u);
        c1 = lerp(c1, 0.2 + 0.6 * air, gw); c2 = lerp(c2, 0.45 + 0.5 * air, gw);
      }
      if (lunge || flinch) { c1 = 0.05 + 0.1 * nz; c2 = 0.25 + 0.15 * nz; }
      if (reachThis) { c1 = 0.05; c2 = 0.1; }
      if (f === 4) { c1 *= 0.5; c2 *= 0.6; }
      this.setRel(a, _q1.setFromAxisAngle(XA, -c1));
      this.setRel(b, _q1.setFromAxisAngle(XA, -c2));
    }
  };

  // braços extras: dobrados junto ao corpo; agitados, se esticam na sua direção tremendo
  C.poseExtra = function (dt, p, ag, tfK, lunge) {
    const BI = this.BI, Pm = this.Pm, Qm = this.Qm, mb = this.M.bones;
    const xg = Math.max(0.001, this.xg);
    _q2.copy(Qm[BI.chest]).multiply(_q3.copy(mb[BI.chest].q).invert()); // rotação do peito desde o repouso
    for (const X of this.xl) {
      const N = X.N, side = X.side;
      const ui = BI['xup' + N], fi = BI['xfore' + N], hi = BI['xhand' + N];
      this.posFromParent(ui);
      const S = Pm[ui];
      const out = clamp(Math.max(ag, lunge, tfK * 0.7) * (this.stage >= 2 ? 1 : 0), 0, 1);
      _T.set(side * lerp(0.1, 0.32, out), lerp(-0.26, -0.05, out), lerp(0.22, 0.62, out));
      _T.x += Math.sin(this.t * 9 + side) * 0.03 * out + Math.sin(this.t * 1.3 + side * 2) * 0.03;
      _T.y += Math.sin(this.t * 7.7 + side) * 0.04 * out;
      if (tfK) { _T.x += Math.sin(this.t * 13 + side) * 0.12; _T.y += Math.cos(this.t * 11 + side) * 0.12; }
      _T.applyQuaternion(_q2);
      if (out > 0.5 && p.look) { this.worldToMesh(_a, p.look); _T.lerp(_a.sub(S).setLength(0.7), (out - 0.5) * 1.2); }
      if (!X.init) { X.t.copy(_T); X.tv.set(0, 0, 0); X.init = true; }
      X.tv.addScaledVector(_a.subVectors(_T, X.t), 90 * dt).multiplyScalar(Math.max(0, 1 - 10 * dt));
      X.t.addScaledVector(X.tv, dt);
      _T.copy(S).addScaledVector(X.t, 1 / xg); // compensa a escala do osso enquanto o braço cresce
      _P.set(side * 0.7, 0.3, -0.6).applyQuaternion(_q2);
      solve2(S, _T, L_XU, L_XF, _P, _J, _E, _H);
      this.setQ(ui, qHinge(_q1, _H, _a.subVectors(_J, S)));
      this.setQ(fi, qHinge(_q1, _H, _a.subVectors(_E, _J)));
      _a.subVectors(_E, _J).normalize();
      _b.set(1, 0, 0).applyQuaternion(Qm[fi]).multiplyScalar(side);
      _c.crossVectors(_a, _b).normalize();
      _a.applyAxisAngle(_c, -0.5);
      this.setQ(hi, qFrame(_q1, _a, _b));
    }
  };

  BR.Creature = Creature;
})(window.BR);
