/* ============================================================
   THE BACKROOMS — núcleo compartilhado
   ------------------------------------------------------------
   Namespace global BR, utilitários matemáticos, ruído
   procedural "tileável", configurações persistentes e trechos
   GLSL usados por todos os shaders (intro + jogo).
   ============================================================ */
window.BR = window.BR || {};

(function (BR) {
  'use strict';

  // ----------------------------------------------------------
  //  Utilitários
  // ----------------------------------------------------------
  const U = (BR.U = {});
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smooth = (a, b, x) => {
    const t = U.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.chance = (p) => Math.random() < p;
  U.hash = (n) => {
    const s = Math.sin(n * 91.137 + 12.93) * 43758.5453;
    return s - Math.floor(s);
  };
  U.hash2 = (x, y, seed) => {
    let h = (x * 374761393 + y * 668265263 + (seed | 0) * 982451653) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  };
  U.angDiff = (a, b) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  U.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  U.damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

  // Ruído de valor periódico (para texturas que repetem sem emenda)
  U.tileNoise = (x, y, period, seed) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const p = period;
    const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p;
    const x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
    const a = U.hash2(x0, y0, seed), b = U.hash2(x1, y0, seed);
    const c = U.hash2(x0, y1, seed), d = U.hash2(x1, y1, seed);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  // fbm tileável: (u,v) em [0,1)
  U.fbm = (u, v, basePeriod, octaves, seed) => {
    let amp = 0.5, sum = 0, norm = 0, per = basePeriod;
    for (let o = 0; o < octaves; o++) {
      sum += amp * U.tileNoise(u * per, v * per, per, seed + o * 17);
      norm += amp; amp *= 0.5; per *= 2;
    }
    return sum / norm;
  };

  // ----------------------------------------------------------
  //  Configurações (persistem no navegador; falham em silêncio)
  // ----------------------------------------------------------
  // volume = geral · music = músicas do rádio + áudio da intro · sfx = efeitos e ambiente
  const DEFAULTS = { sens: 1.0, volume: 0.8, music: 0.45, sfx: 1.0, brightness: 1.0, fx: 1.0, quality: 1.0, hud: 1 };
  BR.Settings = Object.assign({}, DEFAULTS);
  BR.loadSettings = function () {
    try {
      const raw = localStorage.getItem('br_settings_v2');
      if (raw) Object.assign(BR.Settings, JSON.parse(raw));
    } catch (e) { /* armazenamento indisponível */ }
    return BR.Settings;
  };
  BR.saveSettings = function () {
    try { localStorage.setItem('br_settings_v2', JSON.stringify(BR.Settings)); } catch (e) { /* ok */ }
  };
  BR.loadSettings();

  // ----------------------------------------------------------
  //  Controles de ajuste ligados por atributo
  //    <input type="range" data-setting="music">
  //    <span data-setting-label="music"></span>
  //  Todos os controles da mesma chave ficam sincronizados
  //  (tela de título, intro e menu de ajustes).
  // ----------------------------------------------------------
  const pct = (v) => Math.round(v * 100) + '%';
  const FMT = { sens: (v) => v.toFixed(2) + 'x', volume: pct, music: pct, sfx: pct, brightness: pct, fx: pct, quality: pct };
  const listeners = [];
  BR.onSetting = function (fn) { listeners.push(fn); };
  function syncUI(key) {
    const v = BR.Settings[key];
    document.querySelectorAll('input[data-setting="' + key + '"]').forEach((el) => { if (parseFloat(el.value) !== v) el.value = v; });
    document.querySelectorAll('[data-setting-label="' + key + '"]').forEach((el) => { el.textContent = (FMT[key] || String)(v); });
  }
  BR.setSetting = function (key, v) {
    BR.Settings[key] = v;
    BR.saveSettings();
    syncUI(key);
    for (const fn of listeners) { try { fn(key, v); } catch (e) { /* um ouvinte com erro não trava os outros */ } }
  };
  BR.bindSettingsUI = function () {
    document.querySelectorAll('input[data-setting]').forEach((el) => {
      if (el.dataset.bound) return;
      el.dataset.bound = '1';
      const key = el.dataset.setting;
      el.value = BR.Settings[key];
      el.addEventListener('input', () => BR.setSetting(key, parseFloat(el.value)));
      // mexer no controle não pode "clicar" na tela que está atrás dele
      for (const ev of ['click', 'pointerdown', 'mousedown']) el.addEventListener(ev, (e) => e.stopPropagation());
    });
    for (const key in FMT) syncUI(key);
  };
  // volume efetivo do <audio> da intro (geral x música)
  BR.introVolume = function () { return Math.max(0, Math.min(1, BR.Settings.volume * BR.Settings.music)); };

  // ----------------------------------------------------------
  //  GLSL compartilhado
  // ----------------------------------------------------------
  BR.GLSL = {
    common: [
      'vec3 toLinear(vec3 c){ return pow(max(c, vec3(0.0)), vec3(2.2)); }',
      'vec3 aces(vec3 x){ const float a=2.51; const float b=0.03; const float c=2.43; const float d=0.59; const float e=0.14;',
      '  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }',
      'vec3 toDisplay(vec3 c, float exposure){ return pow(aces(c*exposure), vec3(1.0/2.2)); }',
      'float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
      'float hash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }',
    ].join('\n'),
  };
})(window.BR);
