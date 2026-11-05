/* ============================================================
   THE BACKROOMS — pós-processamento
   ------------------------------------------------------------
   cena -> render target (MSAA quando há WebGL2)
        -> bright-pass + blur gaussiano em 1/4 de resolução (bloom)
        -> composição: aberração cromática, distorção de lente,
           ondulação (sanidade), glitch/rasgo de VHS, grão de
           filme, scanlines, vinheta, dessaturação, pulso
           vermelho, visão dupla e fade.
   Os shaders de mundo já entregam a cor em espaço de tela
   (tone mapping ACES + gamma), então aqui só há efeitos.
   ============================================================ */
(function (BR) {
  'use strict';

  const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

  const BRIGHT = [
    'uniform sampler2D tDiffuse; uniform float uThreshold; varying vec2 vUv;',
    'void main(){',
    '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
    '  float l = max(c.r, max(c.g, c.b));',
    '  float k = smoothstep(uThreshold, 1.0, l);',
    '  gl_FragColor = vec4(c * k, 1.0);',
    '}',
  ].join('\n');

  const BLUR = [
    'uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;',
    'void main(){',
    '  vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270270;',
    '  s += texture2D(tDiffuse, vUv + uDir * 1.3846154).rgb * 0.3162162;',
    '  s += texture2D(tDiffuse, vUv - uDir * 1.3846154).rgb * 0.3162162;',
    '  s += texture2D(tDiffuse, vUv + uDir * 3.2307692).rgb * 0.0702703;',
    '  s += texture2D(tDiffuse, vUv - uDir * 3.2307692).rgb * 0.0702703;',
    '  gl_FragColor = vec4(s, 1.0);',
    '}',
  ].join('\n');

  const COMPOSITE = [
    'uniform sampler2D tScene; uniform sampler2D tBloom;',
    'uniform vec2 uRes; uniform float uTime;',
    'uniform float uGrain, uVignette, uAberr, uWave, uGlitch, uBloom, uDesat, uRed, uFade, uScan, uBright, uStatic, uDouble, uTunnel, uLens;',
    'varying vec2 vUv;',
    'float rnd(vec2 co){ return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }',
    'vec3 sampleScene(vec2 uv, vec2 dir){',
    '  vec3 c;',
    '  c.r = texture2D(tScene, uv + dir).r;',
    '  c.g = texture2D(tScene, uv).g;',
    '  c.b = texture2D(tScene, uv - dir).b;',
    '  return c;',
    '}',
    'void main(){',
    '  vec2 uv = vUv;',
    // rasgo horizontal estilo fita VHS
    '  if (uGlitch > 0.001) {',
    '    float band = floor(uv.y * 30.0 + floor(uTime * 13.0) * 3.7);',
    '    float r = rnd(vec2(band, floor(uTime * 24.0)));',
    '    if (r < uGlitch * 0.55) uv.x += (rnd(vec2(band, 7.0)) - 0.5) * 0.16 * uGlitch;',
    '    uv.y += (rnd(vec2(floor(uTime * 30.0), 1.0)) - 0.5) * 0.01 * uGlitch;',
    '  }',
    // ondulação (sanidade baixa)
    '  uv += uWave * 0.007 * vec2(sin(uv.y * 17.0 + uTime * 1.9), cos(uv.x * 13.0 + uTime * 1.4));',
    // distorção de lente leve
    '  vec2 cc = uv - 0.5; float r2 = dot(cc, cc);',
    '  uv = 0.5 + cc * (1.0 - uLens * 0.06 + uLens * 0.12 * r2);',
    '  cc = uv - 0.5; r2 = dot(cc, cc);',
    '  vec2 dir = cc * (uAberr * (0.0025 + r2 * 0.03) + uGlitch * 0.012);',
    '  vec3 col = sampleScene(uv, dir);',
    // visão dupla
    '  if (uDouble > 0.001) {',
    '    vec2 off = vec2(sin(uTime * 0.9), cos(uTime * 0.7)) * 0.012 * uDouble;',
    '    col = mix(col, sampleScene(uv + off, dir), 0.45 * uDouble);',
    '  }',
    '  col += texture2D(tBloom, uv).rgb * uBloom * vec3(1.0, 0.93, 0.82);',
    '  col = pow(max(col, vec3(0.0)), vec3(1.0 / uBright));',
    '  float l = dot(col, vec3(0.299, 0.587, 0.114));',
    '  col = mix(col, vec3(l), uDesat);',
    '  col = mix(col, vec3(l * 1.6, l * 0.25, l * 0.2), uRed);',
    // vinheta + visão de túnel
    '  float vig = smoothstep(0.95, 0.25, length(cc) * (1.25 + uTunnel * 0.9));',
    '  col *= mix(1.0, vig, clamp(uVignette + uTunnel * 0.6, 0.0, 1.0));',
    // scanlines
    '  col *= 1.0 - uScan * 0.12 * (0.5 + 0.5 * sin(gl_FragCoord.y * 3.14159));',
    // estática (interferência quando a entidade está perto)
    '  float n = rnd(vUv * uRes + fract(uTime * 7.13) * 91.7);',
    '  col = mix(col, vec3(n), uStatic * 0.55);',
    '  col += (n - 0.5) * uGrain;',
    '  col *= 1.0 - uFade;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}',
  ].join('\n');

  function PostFX(renderer) {
    this.renderer = renderer;
    this.isGL2 = renderer.capabilities.isWebGL2;
    const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false };
    this.rtScene = this.isGL2 && THREE.WebGLMultisampleRenderTarget
      ? new THREE.WebGLMultisampleRenderTarget(4, 4, opts)
      : new THREE.WebGLRenderTarget(4, 4, opts);
    const small = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false };
    this.rtA = new THREE.WebGLRenderTarget(4, 4, small);
    this.rtB = new THREE.WebGLRenderTarget(4, 4, small);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.matBright = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uThreshold: { value: 0.78 } }, vertexShader: VERT, fragmentShader: BRIGHT, depthTest: false, depthWrite: false });
    this.matBlur = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: VERT, fragmentShader: BLUR, depthTest: false, depthWrite: false });
    this.u = {
      tScene: { value: null }, tBloom: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
      uGrain: { value: 0.06 }, uVignette: { value: 0.75 }, uAberr: { value: 0.6 }, uWave: { value: 0 },
      uGlitch: { value: 0 }, uBloom: { value: 0.65 }, uDesat: { value: 0 }, uRed: { value: 0 }, uFade: { value: 0 },
      uScan: { value: 0.3 }, uBright: { value: 1 }, uStatic: { value: 0 }, uDouble: { value: 0 }, uTunnel: { value: 0 },
      uLens: { value: 1 },
    };
    this.matComp = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VERT, fragmentShader: COMPOSITE, depthTest: false, depthWrite: false });
    this.scale = 1;
  }

  PostFX.prototype.setSize = function (w, h, pixelRatio) {
    const W = Math.max(4, Math.floor(w * pixelRatio)), H = Math.max(4, Math.floor(h * pixelRatio));
    this.rtScene.setSize(W, H);
    const bw = Math.max(4, W >> 2), bh = Math.max(4, H >> 2);
    this.rtA.setSize(bw, bh); this.rtB.setSize(bw, bh);
    this.bw = bw; this.bh = bh;
    this.u.uRes.value.set(W, H);
  };

  PostFX.prototype._pass = function (mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  };

  PostFX.prototype.render = function (scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);

    // bloom
    this.matBright.uniforms.tDiffuse.value = this.rtScene.texture;
    this._pass(this.matBright, this.rtA);
    const bu = this.matBlur.uniforms;
    for (let i = 0; i < 2; i++) {
      bu.tDiffuse.value = this.rtA.texture; bu.uDir.value.set((1 + i) / this.bw, 0); this._pass(this.matBlur, this.rtB);
      bu.tDiffuse.value = this.rtB.texture; bu.uDir.value.set(0, (1 + i) / this.bh); this._pass(this.matBlur, this.rtA);
    }

    this.u.tScene.value = this.rtScene.texture;
    this.u.tBloom.value = this.rtA.texture;
    this._pass(this.matComp, null);
  };

  PostFX.prototype.dispose = function () {
    this.rtScene.dispose(); this.rtA.dispose(); this.rtB.dispose();
    this.matBright.dispose(); this.matBlur.dispose(); this.matComp.dispose();
    this.quad.geometry.dispose();
  };

  BR.PostFX = PostFX;
})(window.BR);
