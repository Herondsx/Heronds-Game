/* ============================================================
   THE BACKROOMS — portais (passagem SEM transição)
   ------------------------------------------------------------
   O próximo lugar já existe, construído e escondido. Um vão na
   parede mostra esse outro mundo em 3D de verdade (perspectiva
   e paralaxe corretas): uma câmera virtual posicionada "do outro
   lado" vê a cena de destino, com o plano de corte oblíquo
   (Lengyel) exatamente no vão — então nada entre a câmera
   virtual e a parede de lá aparece.
   Ao atravessar o plano, o jogo troca o mundo ativo no MESMO
   quadro: a imagem continua idêntica. Sem fade, sem carregar.

   Cada lado do vão = { x, z, nx, nz }: centro rente à parede e a
   normal que aponta para dentro da sala daquele lado.
   ============================================================ */
(function (BR) {
  'use strict';
  const YA = new THREE.Vector3(0, 1, 0);

  const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const FRAG = [
    'uniform sampler2D tView; uniform vec2 uRes; uniform vec2 uSize; uniform float uOpen; uniform float uSeed; uniform float uRough; uniform float uTime; uniform float uRound;',
    'varying vec2 vUv;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }',
    'void main(){',
    '  vec2 p = (vUv - 0.5) * uSize;',                  // metros a partir do centro do vão
    '  vec2 hs = 0.5 * uSize * uOpen;',
    '  float r = min(uRound, min(hs.x, hs.y));',
    '  vec2 q = abs(p) - hs + r;',
    '  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;', // < 0 dentro do retângulo arredondado
    // contorno rasgado (papel de parede e gesso arrebentados), que "respira" um pouco
    '  float n = vn(p * 9.0 + uSeed) * 0.6 + vn(p * 27.0 - uSeed + uTime * 0.15) * 0.4;',
    '  d += (n - 0.5) * uRough;',
    '  if (d > 0.0) discard;',
    '  vec3 c = texture2D(tView, gl_FragCoord.xy / uRes).rgb;',
    '  float rim = 1.0 - smoothstep(0.0, 0.012 + uRough * 0.7, -d);', // fuligem na borda
    '  c *= 1.0 - rim * 0.88;',
    '  gl_FragColor = vec4(c, 1.0);',
    '}',
  ].join('\n');

  const tmpColor = new THREE.Color();

  function Portal(renderer) {
    this.renderer = renderer;
    const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false };
    this.rt = renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget
      ? new THREE.WebGLMultisampleRenderTarget(4, 4, opts)
      : new THREE.WebGLRenderTarget(4, 4, opts);
    this.cam = new THREE.PerspectiveCamera();
    this.u = {
      tView: { value: this.rt.texture }, uRes: { value: new THREE.Vector2(4, 4) }, uSize: { value: new THREE.Vector2(1, 2) },
      uOpen: { value: 1 }, uSeed: { value: Math.random() * 50 }, uRough: { value: 0.04 }, uTime: { value: 0 }, uRound: { value: 0.05 },
    };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VERT, fragmentShader: FRAG }));
    this.mesh.frustumCulled = false;
    this.th = 0; this.here = null; this.there = null;
    this.w = 1; this.h = 2; this.y0 = 0; this.off = 0.03;
    this._frustum = new THREE.Frustum(); this._m = new THREE.Matrix4(); this._plane = new THREE.Plane();
    this._q = new THREE.Vector4(); this._clip = new THREE.Vector4(); this._v = new THREE.Vector3(); this._n = new THREE.Vector3();
    this._box = new THREE.Box3(); this._pts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }
  const P = Portal.prototype;

  // liga o vão daqui ao vão de lá (rotação em Y que leva "entrar na parede daqui" a "sair da parede de lá")
  P.link = function (here, there) {
    this.here = here; this.there = there;
    this.th = Math.atan2(there.nx, there.nz) - Math.atan2(-here.nx, -here.nz);
    this.place();
  };
  // retângulo do vão: largura, altura, base (sobre o chão) e afastamento da parede
  P.setRect = function (w, h, y0, off) {
    this.w = w; this.h = h; this.y0 = y0; if (off != null) this.off = off;
    this.place();
  };
  P.place = function () {
    const s = this.here;
    if (!s) return;
    this.mesh.position.set(s.x + s.nx * this.off, this.y0 + this.h / 2, s.z + s.nz * this.off);
    this.mesh.rotation.set(0, Math.atan2(s.nx, s.nz), 0);
    this.mesh.scale.set(this.w, this.h, 1);
    this.u.uSize.value.set(this.w, this.h);
  };
  // ponto / direção daqui -> de lá
  P.map = function (out, p) {
    const a = this.here, b = this.there, c = Math.cos(this.th), s = Math.sin(this.th);
    const dx = p.x - a.x, dz = p.z - a.z, y = p.y;
    return out.set(b.x + dx * c + dz * s, y, b.z - dx * s + dz * c);
  };
  P.mapDir = function (out, d) {
    const c = Math.cos(this.th), s = Math.sin(this.th), x = d.x, z = d.z;
    return out.set(x * c + z * s, d.y, -x * s + z * c);
  };
  // > 0 = do lado da sala; lateral = deslocamento ao longo da parede
  P.front = function (x, z) { const a = this.here; return (x - a.x) * a.nx + (z - a.z) * a.nz; };
  P.lateral = function (x, z) { const a = this.here; return (x - a.x) * a.nz - (z - a.z) * a.nx; };

  P.setSize = function (w, h) { this.rt.setSize(w, h); this.u.uRes.value.set(w, h); };

  // o vão está aberto, na frente da câmera e dentro do campo de visão?
  P.visible = function (camera) {
    if (!this.mesh.parent || !this.mesh.visible || this.u.uOpen.value <= 0.002) return false;
    if (this.front(camera.position.x, camera.position.z) < -0.02) return false;
    this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._m);
    const s = this.here, tx = s.nz, tz = -s.nx, hw = this.w / 2;
    const px = s.x + s.nx * this.off, pz = s.z + s.nz * this.off;
    this._pts[0].set(px - tx * hw, this.y0, pz - tz * hw);
    this._pts[1].set(px + tx * hw, this.y0, pz + tz * hw);
    this._pts[2].set(px - tx * hw, this.y0 + this.h, pz - tz * hw);
    this._pts[3].set(px + tx * hw, this.y0 + this.h, pz + tz * hw);
    this._box.setFromPoints(this._pts);
    return this._frustum.intersectsBox(this._box);
  };

  // desenha o mundo de lá, visto pela câmera virtual, na textura do vão
  P.render = function (scene, camera, clearColor) {
    const r = this.renderer, cam = this.cam, b = this.there;
    cam.projectionMatrix.copy(camera.projectionMatrix);
    this.map(cam.position, camera.position);
    cam.quaternion.setFromAxisAngle(YA, this.th).multiply(camera.quaternion);
    cam.updateMatrixWorld(true);
    // plano de corte oblíquo = a parede de lá (some tudo entre a câmera virtual e o vão).
    // Com a câmera praticamente NO plano (atravessando), o plano próximo comum já resolve.
    if (this.front(camera.position.x, camera.position.z) > 0.035) {
      this._n.set(b.nx, 0, b.nz);
      this._v.set(b.x + b.nx * 0.02, 0, b.z + b.nz * 0.02);
      this._plane.setFromNormalAndCoplanarPoint(this._n, this._v).applyMatrix4(cam.matrixWorldInverse);
      const cp = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
      const e = cam.projectionMatrix.elements, q = this._q;
      q.x = (Math.sign(cp.x) + e[8]) / e[0];
      q.y = (Math.sign(cp.y) + e[9]) / e[5];
      q.z = -1;
      q.w = (1 + e[10]) / e[14];
      cp.multiplyScalar(2 / cp.dot(q));
      e[2] = cp.x; e[6] = cp.y; e[10] = cp.z + 1; e[14] = cp.w;
    }
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    r.getClearColor(tmpColor);
    const alpha = r.getClearAlpha();
    r.setRenderTarget(this.rt);
    r.setClearColor(clearColor, 1);
    r.clear();
    r.render(scene, cam);
    r.setRenderTarget(null);
    r.setClearColor(tmpColor, alpha);
  };

  P.dispose = function () { this.rt.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); };

  BR.Portal = Portal;
})(window.BR);
