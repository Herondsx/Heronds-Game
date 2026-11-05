/* ============================================================
   THE BACKROOMS — iluminação (shaders customizados)
   ------------------------------------------------------------
   Em vez de dezenas de PointLights (caro), cada nível tem um
   LIGHTMAP assado na CPU com oclusão pelas paredes:
     R = lâmpadas estáveis   G = grupo que pisca A
     B = grupo que pisca B   A = luz rebatida (GI borrada)
   O shader combina isso com:
     * lanterna (cone com hotspot, anéis do refletor, especular)
     * oscilação das luzes ao redor da entidade
     * uma luz pontual dinâmica (saída verde, faíscas)
     * neblina exponencial e tone mapping ACES
   Todos os materiais compartilham o MESMO objeto de uniforms,
   então atualizar a lanterna uma vez atualiza o mundo inteiro.
   ============================================================ */
(function (BR) {
  'use strict';

  const S = (BR.Shading = {});

  const VERT = [
    BR.GLSL.common,
    'uniform float uTime; uniform float uBreath; uniform float uGlitch;',
    'varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUv; varying vec3 vColor;',
    'void main(){',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vec3 n = normalize(mat3(modelMatrix) * normal);',
    '#ifdef BREATH',
    '  float b = sin(uTime * 1.3 + wp.x * 0.9 + wp.z * 0.6) * sin(uTime * 0.71 + wp.y * 2.3 + wp.x * 0.3);',
    '  wp.xyz += n * b * uBreath * 0.07;',
    '#endif',
    '#ifdef MONSTER',
    '  float band = floor(wp.y * 7.0 + floor(uTime * 17.0) * 1.3);',
    '  float gr = hash12(vec2(band, floor(uTime * 26.0)));',
    '  float on = step(0.82, gr) * uGlitch;',
    '  wp.x += (hash12(vec2(band, 1.7)) - 0.5) * on * 0.7;',
    '  wp.z += (hash12(vec2(band, 5.3)) - 0.5) * on * 0.7;',
    '  wp.xyz += n * sin(uTime * 6.0 + wp.y * 13.0) * 0.006;',
    '#endif',
    '  vWorld = wp.xyz; vNormal = n; vUv = uv;',
    '#ifdef USE_COLOR',
    '  vColor = color;',
    '#else',
    '  vColor = vec3(1.0);',
    '#endif',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}',
  ].join('\n');

  const FRAG = [
    BR.GLSL.common,
    'uniform sampler2D uMap; uniform sampler2D uLightMap; uniform sampler2D uDirt;',
    'uniform vec2 uMapSize; uniform vec2 uUvScale;',
    'uniform vec3 uTint; uniform vec3 uLampColor; uniform vec3 uAmbient; uniform vec3 uFogColor;',
    'uniform vec3 uFlashPos; uniform vec3 uFlashDir; uniform vec3 uFlashColor; uniform vec2 uFlashCone; uniform float uFlashI;',
    'uniform vec4 uFlick; uniform vec4 uMonster; uniform vec4 uPoint; uniform vec3 uPointColor;',
    'uniform float uSpec; uniform float uShine; uniform float uCeil; uniform float uFogDensity; uniform float uExposure;',
    'uniform float uDirtAmt; uniform float uEmissive; uniform float uTime; uniform float uBump; uniform float uWet;',
    'varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUv; varying vec3 vColor;',
    'void main(){',
    '  vec3 Ng = normalize(vNormal);',
    '#ifdef DOUBLE',
    '  if (!gl_FrontFacing) Ng = -Ng;',
    '#endif',
    '  float fd = length(cameraPosition - vWorld);',
    '  float dirt = texture2D(uDirt, vWorld.xz * 0.043 + vec2(vWorld.y * 0.061, vWorld.y * 0.027)).r;',
    '#ifdef WORLD_UV',
    // anti-repetição: 2 amostras (escala/ângulo diferentes) misturadas por um ruído grande
    '  vec2 uv = vWorld.xz * uUvScale;',
    '  vec2 uv2 = mat2(0.799, -0.602, 0.602, 0.799) * uv * 0.71 + vec2(0.37, 0.13);',
    '  float mixK = smoothstep(0.38, 0.62, texture2D(uDirt, vWorld.xz * 0.021 + 0.5).r);',
    '  vec3 tex = mix(texture2D(uMap, uv).rgb, texture2D(uMap, uv2).rgb, mixK);',
    '#else',
    '  vec2 uv = vUv * uUvScale;',
    '  vec3 tex = texture2D(uMap, uv).rgb;',
    '#endif',
    '  vec3 alb = toLinear(tex) * uTint * vColor;',
    '  alb *= mix(1.0, mix(0.66, 1.16, dirt), uDirtAmt);',
    '  vec3 N = Ng;',
    '#ifdef BUMP',
    // relevo a partir da própria textura (derivadas de tela — sem precisar de tangentes)
    '  float hC = dot(tex, vec3(0.333));',
    '  vec3 dpdx = dFdx(vWorld), dpdy = dFdy(vWorld);',
    '  float dhdx = dFdx(hC), dhdy = dFdy(hC);',
    '  vec3 r1 = cross(dpdy, Ng), r2 = cross(Ng, dpdx);',
    '  float det = dot(dpdx, r1);',
    '  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);',
    '  float bf = uBump * (1.0 - smoothstep(3.5, 12.0, fd));',
    '  N = normalize(abs(det) * Ng - bf * grad);',
    '#endif',
    // luz assada (usa a normal geométrica para não "chiar" no lightmap)
    '  vec2 luv = (vWorld.xz + Ng.xz * 0.34) / uMapSize;',
    '  vec4 lm = texture2D(uLightMap, luv) * 2.0;',
    '  float md = distance(vWorld.xz, uMonster.xz);',
    '  float mfl = 1.0 - uMonster.w * (1.0 - smoothstep(3.0, 11.0, md));',
    '  float direct = (lm.r * uFlick.x + lm.g * uFlick.y + lm.b * uFlick.z) * mfl;',
    '  float gi = lm.a * uFlick.w * mfl;',
    '  float hgt = clamp(vWorld.y / uCeil, 0.0, 1.0);',
    // forro: halo mais claro perto das luminárias acesas
    '  float vf = Ng.y > 0.6 ? 1.0 : (Ng.y < -0.6 ? 0.22 + 0.32 * clamp(direct - 0.55, 0.0, 1.2) : mix(0.42, 0.9, hgt));',
    // relevo das paredes sob luz de cima
    '  if (abs(Ng.y) < 0.6) vf *= 0.86 + 0.28 * clamp(N.y * 4.0 + 0.5, 0.0, 1.0);',
    '  vec3 light = uLampColor * (direct * vf + gi) + uAmbient;',
    // lanterna
    '  vec3 Lv = uFlashPos - vWorld; float d = max(length(Lv), 0.001); vec3 L = Lv / d;',
    '  float cosA = dot(-L, uFlashDir);',
    '  float spot = smoothstep(uFlashCone.y, uFlashCone.x, cosA);',
    '  float hot = smoothstep(uFlashCone.x, 0.997, cosA);',
    '  float ang = acos(clamp(cosA, -1.0, 1.0));',
    '  float rings = 0.9 + 0.1 * sin(ang * 150.0) + 0.06 * sin(ang * 61.0);',
    '  float cookie = (0.32 * spot + 1.15 * hot) * rings;',
    '  float att = 1.0 / (1.0 + 0.055 * d * d);',
    '  float fl = uFlashI * cookie * att;',
    '  float ndl = max(dot(N, L), 0.0);',
    '  vec3 col = alb * (light + uFlashColor * fl * ndl);',
    // luz pontual dinâmica
    '  vec3 Pv = uPoint.xyz - vWorld; float pd = max(length(Pv), 0.001);',
    '  col += alb * uPointColor * uPoint.w * max(dot(N, Pv / pd), 0.0) / (1.0 + pd * pd * 0.7);',
    // especular (pele molhada, chão úmido nas manchas)
    '  float spec = uSpec * (1.0 + uWet * 3.0 * (1.0 - smoothstep(0.25, 0.45, dirt)));',
    '  vec3 V = normalize(cameraPosition - vWorld);',
    '  vec3 H = normalize(L + V);',
    '  col += uFlashColor * pow(max(dot(N, H), 0.0), uShine) * spec * fl;',
    '  col += uLampColor * pow(max(dot(N, normalize(vec3(0.0, 1.0, 0.0) + V)), 0.0), uShine) * spec * direct * 0.2;',
    '  col += alb * uEmissive;',
    '#ifdef EYE',
    '  float facing = pow(max(dot(N, V), 0.0), 2.0);',
    '  col = uTint * (uEmissive + 14.0 * fl * facing);',
    '#endif',
    // neblina
    '  float fog = 1.0 - exp(-fd * fd * uFogDensity * uFogDensity);',
    '  col = mix(col, uFogColor, fog);',
    '  gl_FragColor = vec4(toDisplay(col, uExposure), 1.0);',
    '}',
  ].join('\n');

  const LAMP_VERT = [
    'attribute float aGroup;',
    'varying float vGroup; varying vec2 vUv; varying vec3 vWorld;',
    'void main(){',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vGroup = aGroup; vUv = uv; vWorld = wp.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}',
  ].join('\n');
  const LAMP_FRAG = [
    BR.GLSL.common,
    'uniform sampler2D uMap; uniform vec3 uLampColor; uniform vec3 uFogColor;',
    'uniform vec4 uFlick; uniform vec4 uMonster; uniform float uFogDensity; uniform float uExposure; uniform float uLampBright;',
    'varying float vGroup; varying vec2 vUv; varying vec3 vWorld;',
    'void main(){',
    '  float s = vGroup < 0.5 ? uFlick.x : (vGroup < 1.5 ? uFlick.y : (vGroup < 2.5 ? uFlick.z : 0.0));',
    '  float md = distance(vWorld.xz, uMonster.xz);',
    '  float mfl = 1.0 - uMonster.w * (1.0 - smoothstep(3.0, 11.0, md));',
    '  vec3 c = uLampColor * texture2D(uMap, vUv).rgb * (s * mfl * uLampBright + 0.025);',
    '  float fd = length(cameraPosition - vWorld);',
    '  float fog = 1.0 - exp(-fd * fd * uFogDensity * uFogDensity);',
    '  c = mix(c, uFogColor, fog * 0.85);',
    '  gl_FragColor = vec4(toDisplay(c, uExposure), 1.0);',
    '}',
  ].join('\n');

  // partículas de poeira — só aparecem dentro do feixe da lanterna
  const DUST_VERT = [
    'uniform float uTime; uniform vec3 uCam; uniform float uSize;',
    'varying vec3 vWorld;',
    'void main(){',
    '  vec3 p = position;',
    '  p += vec3(sin(uTime * 0.21 + position.y * 3.0), sin(uTime * 0.13 + position.x * 2.0) * 0.4, cos(uTime * 0.17 + position.z * 2.5)) * 0.25;',
    '  vec3 w = mod(p - uCam + 4.0, 8.0) - 4.0 + uCam;',
    '  w.y = mod(p.y, 3.0);',
    '  vWorld = w;',
    '  vec4 mv = viewMatrix * vec4(w, 1.0);',
    '  gl_PointSize = uSize / max(-mv.z, 0.2);',
    '  gl_Position = projectionMatrix * mv;',
    '}',
  ].join('\n');
  const DUST_FRAG = [
    'uniform vec3 uFlashPos; uniform vec3 uFlashDir; uniform vec2 uFlashCone; uniform float uFlashI; uniform vec3 uFlashColor;',
    'varying vec3 vWorld;',
    'void main(){',
    '  vec2 c = gl_PointCoord - 0.5; float r = dot(c, c); if (r > 0.25) discard;',
    '  vec3 Lv = vWorld - uFlashPos; float d = length(Lv);',
    '  float cosA = dot(Lv / d, uFlashDir);',
    '  float spot = smoothstep(uFlashCone.y, uFlashCone.x, cosA) / (1.0 + d * d * 0.12);',
    '  float a = spot * uFlashI * (1.0 - r * 4.0) * 0.35;',
    '  gl_FragColor = vec4(uFlashColor * a, 1.0);',
    '}',
  ].join('\n');

  // feixe volumétrico falso (cone aditivo)
  const BEAM_VERT = [
    'varying float vAlong; varying vec3 vN; varying vec3 vView;',
    'void main(){',
    '  vAlong = position.y;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  vN = normalize(normalMatrix * normal); vView = normalize(-mv.xyz);',
    '  gl_Position = projectionMatrix * mv;',
    '}',
  ].join('\n');
  const BEAM_FRAG = [
    'uniform float uI; uniform vec3 uColor; uniform float uLen;',
    'varying float vAlong; varying vec3 vN; varying vec3 vView;',
    'void main(){',
    '  float t = clamp(vAlong / uLen, 0.0, 1.0);',
    '  float edge = mix(0.45, 1.0, pow(abs(dot(normalize(vN), normalize(vView))), 1.4));',
    '  float a = (1.0 - t) * (1.0 - t) * smoothstep(0.0, 0.1, t) * edge * uI;',
    '  gl_FragColor = vec4(uColor * a, 1.0);',
    '}',
  ].join('\n');

  S.init = function () {
    if (S.uniforms) return S.uniforms;
    const lm = new THREE.DataTexture(new Uint8Array([60, 0, 0, 30]), 1, 1, THREE.RGBAFormat);
    lm.needsUpdate = true;
    const dirt = BR.Tex.toTexture(BR.Tex.dirt());
    S.white = BR.Tex.toTexture(BR.Tex.white());
    S.uniforms = {
      uLightMap: { value: lm }, uDirt: { value: dirt },
      uMapSize: { value: new THREE.Vector2(1, 1) },
      uLampColor: { value: new THREE.Color(1, 0.93, 0.74) },
      uAmbient: { value: new THREE.Color(0.01, 0.009, 0.006) },
      uFogColor: { value: new THREE.Color(0.02, 0.018, 0.01) },
      uFogDensity: { value: 0.045 },
      uFlashPos: { value: new THREE.Vector3() }, uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
      uFlashColor: { value: new THREE.Color(1, 0.95, 0.85) }, uFlashCone: { value: new THREE.Vector2(0.97, 0.86) },
      uFlashI: { value: 0 },
      uFlick: { value: new THREE.Vector4(1, 1, 1, 1) },
      uMonster: { value: new THREE.Vector4(9999, 0, 9999, 0) },
      uPoint: { value: new THREE.Vector4(0, -100, 0, 0) }, uPointColor: { value: new THREE.Color(0.2, 1, 0.4) },
      uCeil: { value: 2.8 }, uExposure: { value: 1.0 },
      uTime: { value: 0 }, uBreath: { value: 0 }, uGlitch: { value: 0 },
      uLampBright: { value: 6 },
    };
    return S.uniforms;
  };

  // opts: map, tint (hex/Color), uvScale [u,v], worldUV, breath, monster, eye, spec, shine, dirt, emissive, double
  S.material = function (opts) {
    opts = opts || {};
    const u = S.init();
    const own = {
      uMap: { value: opts.map || S.white },
      uTint: { value: opts.tint instanceof THREE.Color ? opts.tint : new THREE.Color(opts.tint != null ? opts.tint : 0xffffff) },
      uUvScale: { value: new THREE.Vector2(opts.uvScale ? opts.uvScale[0] : 1, opts.uvScale ? opts.uvScale[1] : 1) },
      uSpec: { value: opts.spec || 0 }, uShine: { value: opts.shine || 16 },
      uDirtAmt: { value: opts.dirt != null ? opts.dirt : 1 },
      uEmissive: { value: opts.emissive || 0 },
      uBump: { value: opts.bump || 0 },
      uWet: { value: opts.wet || 0 },
    };
    const defines = {};
    if (opts.worldUV) defines.WORLD_UV = 1;
    if (opts.breath) defines.BREATH = 1;
    if (opts.monster) defines.MONSTER = 1;
    if (opts.eye) defines.EYE = 1;
    if (opts.double) defines.DOUBLE = 1;
    if (opts.bump) defines.BUMP = 1;
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, u, own),
      vertexShader: VERT, fragmentShader: FRAG, defines,
      vertexColors: opts.vertexColors !== false,
      side: opts.double ? THREE.DoubleSide : THREE.FrontSide,
      extensions: { derivatives: true },
    });
    return m;
  };

  S.lampMaterial = function (map) {
    const u = S.init();
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({}, u, { uMap: { value: map } }),
      vertexShader: LAMP_VERT, fragmentShader: LAMP_FRAG,
    });
  };

  S.dust = function (count) {
    const u = S.init();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { pos[i * 3] = Math.random() * 8; pos[i * 3 + 1] = Math.random() * 3; pos[i * 3 + 2] = Math.random() * 8; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: u.uTime, uFlashPos: u.uFlashPos, uFlashDir: u.uFlashDir, uFlashCone: u.uFlashCone, uFlashI: u.uFlashI, uFlashColor: u.uFlashColor,
        uCam: { value: new THREE.Vector3() }, uSize: { value: 3.2 * Math.min(window.devicePixelRatio || 1, 1.5) } },
      vertexShader: DUST_VERT, fragmentShader: DUST_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    return p;
  };

  S.beam = function (len, radius) {
    // cone com a ponta estreita na origem e o eixo em +Y
    const g = new THREE.CylinderGeometry(radius, 0.04, len, 24, 1, true);
    g.translate(0, len / 2, 0);
    const m = new THREE.ShaderMaterial({
      uniforms: { uI: { value: 0 }, uColor: { value: new THREE.Color(1, 0.95, 0.82) }, uLen: { value: len } },
      vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    return new THREE.Mesh(g, m);
  };
})(window.BR);
