/* ============================================================
   THE BACKROOMS — o cérebro da entidade
   ------------------------------------------------------------
   PERCEPÇÃO
     * Visão: cone de ~140°, linha de visão real pela grade, e o
       alcance depende da LUZ onde você está, da sua lanterna,
       de estar agachado e de quão rápido se move. A detecção
       não é instantânea: um medidor de "consciência" sobe aos
       poucos (dá tempo de você sumir).
     * Brilho: lanterna apontada para ela = ela te vê de longe.
     * Audição: cada ruído tem um raio; a distância usada é a do
       CAMINHO pelos corredores (não em linha reta). O ponto
       ouvido é impreciso proporcionalmente à distância.
   MEMÓRIA
     * Última posição/velocidade vistas, último som ouvido.
     * Mapa de calor de onde você costuma estar (patrulha lá).
     * Esconderijos onde já te achou (verifica primeiro).
   APRENDIZADO
     * Garrafas arremessadas: depois de ser enganada, fica
       cética e passa a ir até de ONDE a garrafa veio.
     * Lanterna no rosto: ofusca, mas ela ganha tolerância.
     * Depois que um disjuntor é ligado, ela entende seu
       objetivo e faz emboscadas perto dos próximos.
   COMPORTAMENTOS (máquina de estados)
     dormente -> patrulha -> investigar -> espreitar/recuar
     -> caçar (com previsão de rota e flanqueio) -> procurar
     -> emboscar / apagar lâmpadas
   DIRETOR DE IA
     * Se você fica tempo demais sem encontro, ela "fareja" e
       se reposiciona fora da sua vista; após uma caçada longa,
       dá um respiro.
   ============================================================ */
(function (BR) {
  'use strict';
  const U = BR.U;
  const A = BR.Audio;

  const LABEL = {
    dormant: 'DORMENTE', patrol: 'PATRULHA', investigate: 'INVESTIGANDO', stalk: 'ESPREITANDO', retreat: 'RECUANDO',
    chase: 'CAÇANDO', search: 'PROCURANDO', ambush: 'EMBOSCADA', flinch: 'OFUSCADA', breakLamp: 'APAGANDO LUZ',
  };

  function Brain(game, entity) {
    this.g = game;
    this.e = entity;
    this.pos = { x: 0, z: 0 };
    this.heading = 0;
    this.thoughts = [];
    this.mem = { skepticism: 0, flinchTol: 0, hideFound: [], decoys: 0, objectiveKnown: false, timesSeen: 0 };
    this.aggression = 0;
  }
  const B = Brain.prototype;

  // ----------------------------------------------------------
  //  Ciclo de vida
  // ----------------------------------------------------------
  B.reset = function (world, cfg) {
    this.w = world; this.cfg = cfg; this.frozen = false;
    const n = world.N * world.N;
    this.heat = new Float32Array(n);
    this.visited = new Float32Array(n).fill(-999);
    this.time = 0;
    this.aggression = cfg.aggression;
    this.mem.objectiveKnown = false; this.mem.hideFound = [];
    // mantém o aprendizado sobre garrafas/lanterna entre níveis (ela lembra de você)
    this.mem.skepticism *= 0.6; this.mem.flinchTol *= 0.6;
    this.cool = { screech: 0, flinch: 0, stalk: 0, lamp: 20, clicks: 4, growl: 6, lunge: 0, retreat: 0, think: 0 };
    this.lampBudget = cfg.lampBudget;
    const far = this.farTile(world.start, 0.85);
    this.place(far);
    this.set('dormant', 'Dormindo... em algum lugar longe de você.');
    this.awareness = 0; this.interest = null; this.lastSeen = null; this.lastHeard = null;
    this.path = null; this.arrived = true; this.waitT = 0; this.lostT = 0; this.calm = 0;
    this.curSpeed = 0; this.stepAcc = 0; this.lunging = 0; this.vis = 0; this.hasLOS = false; this.losT = 0;
    this.searchPlan = []; this.ambush = null; this.lampTarget = null; this.repathT = 0;
    this.heatT = 0; this.flanking = false; this.flinchT = 0; this.reachT = 0;
    this.lookAt = null;
  };
  B.place = function (tile) {
    const c = this.w.center(tile);
    this.pos.x = c.x; this.pos.z = c.z;
    this.path = null; this.arrived = true;
  };
  // célula mais distante a partir de "from" (fração do máximo, com aleatoriedade)
  B.farTile = function (from, frac) {
    const d = this.w.distField(from);
    let max = 0;
    for (let i = 0; i < d.length; i++) if (d[i] < Infinity && d[i] > max) max = d[i];
    const cands = [];
    for (let i = 0; i < d.length; i++) if (d[i] < Infinity && d[i] >= max * frac) cands.push(i);
    return cands.length ? U.pick(cands) : from;
  };
  B.respawnFar = function () {
    this.frozen = false;
    this.place(this.farTile(this.w.tileOf(this.g.player.x, this.g.player.z), 0.7));
    this.awareness = 0; this.interest = null; this.lastSeen = null;
    this.aggression = Math.max(this.cfg.aggression, this.aggression - 0.15);
    this.set('patrol', 'Te deixei ir. Por enquanto.');
    this.calm = -20;
  };

  B.set = function (s, thought) {
    if (this.state !== s) { this.state = s; this.stateT = 0; }
    if (thought) this.think(thought);
  };
  B.think = function (txt) {
    if (this.thoughts.length && this.thoughts[0].txt === txt) return;
    this.thoughts.unshift({ txt, t: this.time });
    if (this.thoughts.length > 6) this.thoughts.pop();
  };
  B.label = function () { return LABEL[this.state] || this.state; };

  // ----------------------------------------------------------
  //  Atualização
  // ----------------------------------------------------------
  B.update = function (dt) {
    if (this.frozen) return;
    this.time += dt; this.stateT += dt;
    for (const k in this.cool) this.cool[k] -= dt;
    this.perceive(dt);
    this.decide(dt);
    if (this.frozen) return; // pegou o jogador: o jogo assume a entidade (jumpscare)
    this.director(dt);
    this.move(dt);
    this.sounds(dt);
    this.animate(dt);
    this.heatT -= dt;
    if (this.heatT <= 0) { this.heatT = 1; for (let i = 0; i < this.heat.length; i++) this.heat[i] *= 0.993; }
  };

  // ----------------------------------------------------------
  //  PERCEPÇÃO
  // ----------------------------------------------------------
  B.perceive = function (dt) {
    const P = this.g.player, w = this.w;
    const dx = P.x - this.pos.x, dz = P.z - this.pos.z;
    const dist = (this.dist = Math.hypot(dx, dz));
    this.losT -= dt;
    if (this.losT <= 0) { this.losT = 0.1; this.hasLOS = w.los(this.pos.x, this.pos.z, P.x, P.z); }

    let vis = 0;
    if (this.state !== 'dormant' && this.state !== 'flinch' && this.hasLOS) {
      const headYaw = this.heading + this.e.lookYaw;
      const ang = Math.abs(U.angDiff(headYaw, Math.atan2(dx, dz)));
      const fov = this.state === 'chase' ? Math.PI : 1.22;
      if (ang < fov || dist < 2.4) {
        const lightF = U.clamp(w.lightAt(P.x, P.z) * 1.1, 0.06, 1);
        const flashF = P.flashOn ? P.flashI : 0;
        let range = 5 + 24 * Math.max(lightF, flashF * 0.85);
        if (P.crouch) range *= 0.6;
        if (dist < range) {
          vis = Math.pow(1 - dist / range, 0.6) * Math.max(lightF, flashF);
          vis *= P.speed > 3.5 ? 1.4 : P.speed > 0.4 ? 1 : 0.6;
          if (dist < 3) vis = Math.max(vis, P.crouch && !P.flashOn && P.speed < 0.4 ? 0.35 : 0.85);
        }
      }
      // a lanterna apontada para ela denuncia de longe
      if (P.flashOn && P.flashI > 0.2 && dist < 28) {
        const dot = (P.flashDir.x * -dx + P.flashDir.z * -dz) / (Math.hypot(P.flashDir.x, P.flashDir.z) * dist + 1e-6);
        if (dot > 0.9) vis = Math.max(vis, 0.9 * P.flashI * (1 - dist / 30));
      }
    }
    this.vis = vis;
    if (vis > 0.02) {
      const gain = { patrol: 1.3, investigate: 2.1, search: 2.7, ambush: 2.6, stalk: 1.5, retreat: 1.5, chase: 3, breakLamp: 1.2 }[this.state] || 1;
      const before = this.awareness;
      this.awareness = Math.min(1.25, this.awareness + vis * gain * dt * (1 + this.aggression * 0.5));
      if (this.awareness > 0.55) this.see(P);
      if (before < 0.3 && this.awareness >= 0.3 && this.state !== 'chase') this.think('Hm? Algo se mexeu ali...');
    } else if (this.state !== 'chase') {
      this.awareness = Math.max(0, this.awareness - dt * 0.05);
    }

    const noises = this.g.takeNoises();
    for (const n of noises) this.hear(n);

    // sanidade quebrada: ela sente o seu medo
    if (P.sanity < 0.15 && this.state === 'patrol' && Math.random() < dt * 0.12) {
      this.setInterest(P.x + U.rand(-5, 5), P.z + U.rand(-5, 5), 0.7, 'medo');
      this.think('Sinto o seu medo daqui.');
    }
  };

  B.see = function (P) {
    const t = this.w.tileOf(P.x, P.z);
    if (this.state === 'search' || this.state === 'investigate') {
      // achou você durante a busca — se for num canto, lembra do esconderijo
      let walls = 0;
      const N = this.w.N;
      for (const o of [1, -1, N, -N]) if (this.w.grid[t + o] !== 0) walls++;
      if (walls >= 2 && !this.mem.hideFound.includes(t)) {
        this.mem.hideFound.push(t);
        if (this.mem.hideFound.length > 6) this.mem.hideFound.shift();
        this.think('Achei você no seu esconderijo. Vou lembrar dele.');
      }
    }
    this.lastSeen = { x: P.x, z: P.z, vx: P.vx, vz: P.vz, t: this.time };
    this.heat[t] += 1.2;
  };

  // n = { x, z, r, kind, fromPlayer, origin }
  B.hear = function (n) {
    if (this.state === 'dormant' && n.r < 25) return;
    const w = this.w;
    const eu = Math.hypot(n.x - this.pos.x, n.z - this.pos.z);
    const mul = (1 + this.aggression * 0.3) * (this.g.player.sanity < 0.3 ? 1.3 : 1);
    const R = n.r * mul;
    if (eu > R) return;
    let pd;
    const df = this.g.distField;
    if (n.fromPlayer && df) pd = df[w.tileOf(this.pos.x, this.pos.z)];
    else {
      const p = w.astar(w.tileOf(this.pos.x, this.pos.z), w.nearestOpen(n.x, n.z), null, 4000);
      pd = p ? w.pathLength(p) : Infinity;
    }
    if (!(pd < R)) return;
    const strength = 1 - pd / R;
    let tx = n.x, tz = n.z, kind = n.kind;

    if (kind === 'bottle') {
      if (Math.random() < this.mem.skepticism && n.origin) {
        tx = n.origin.x; tz = n.origin.z; kind = 'origem';
        this.think('Outra garrafa? Não. Vou até de ONDE ela veio.');
      } else this.think('Um barulho de vidro... vou ver.');
    } else if (kind === 'breaker') {
      this.mem.objectiveKnown = true;
      this.think('Os disjuntores... você quer sair. Sei pra onde vai.');
    } else if (kind === 'radio') this.think('Música? Aqui? Vou calar isso.');
    else if (kind === 'gasp') this.think('Ouvi você respirar.');
    else if (kind === 'step' && this.state !== 'chase') this.think('Passos. ' + (strength > 0.5 ? 'Perto.' : 'Longe, mas ouvi.'));

    if (this.state === 'chase' && n.fromPlayer) {
      // na caçada, seguir o som mantém o rastro
      this.lastSeen = { x: n.x, z: n.z, vx: this.g.player.vx, vz: this.g.player.vz, t: this.time };
      this.lostT = Math.max(0, this.lostT - 0.8 * strength);
      return;
    }
    const fuzz = (pd / R) * 3.5;
    tx += U.rand(-fuzz, fuzz); tz += U.rand(-fuzz, fuzz);
    this.awareness = Math.min(1.1, this.awareness + strength * (kind === 'breaker' || kind === 'gasp' ? 0.65 : kind === 'step' ? 0.3 : 0.45));
    this.setInterest(tx, tz, strength + (kind === 'breaker' ? 1 : 0), kind, n);
    this.lastHeard = { x: tx, z: tz, t: this.time, vx: 0, vz: 0 };
    if (n.fromPlayer) this.heat[w.tileOf(n.x, n.z)] += 0.6;
  };

  B.setInterest = function (x, z, pri, kind, n) {
    const cur = this.interest;
    if (!cur || pri >= cur.pri * 0.7 || this.time - cur.t > 4) {
      this.interest = { x, z, pri, kind, t: this.time, decoy: kind === 'bottle', radio: n && n.radio };
    }
  };

  // ----------------------------------------------------------
  //  DECISÃO
  // ----------------------------------------------------------
  B.decide = function (dt) {
    const P = this.g.player, cfg = this.cfg;
    switch (this.state) {
      case 'dormant':
        if (this.stateT > cfg.wake || this.awareness > 0.8) { this.set('patrol', 'Acordei. Tem alguém aqui.'); A.growl(this.pos.x, 2, this.pos.z, 1); }
        break;

      case 'patrol':
        if (this.awareness >= 1) { this.engage(); break; }
        if (this.interest && this.awareness > 0.2) {
          this.set('investigate'); this.looked = false; this.waitT = 0;
          this.stateT0Interest = this.interest.t;
          this.goTo(this.interest.x, this.interest.z);
          break;
        }
        if (this.arrived) {
          if (this.waitT > 0) { this.waitT -= dt; break; }
          if (this.tryBreakLamp()) break;
          this.choosePatrol();
        }
        break;

      case 'investigate':
        if (this.awareness >= 1) { this.engage(); break; }
        if (this.interest && this.interest.t > this.stateT0Interest) { this.stateT0Interest = this.interest.t; this.goTo(this.interest.x, this.interest.z); }
        if (this.arrived) {
          if (this.waitT <= 0 && !this.looked) { this.waitT = U.rand(1.8, 3.2); this.looked = true; A.sniff(this.pos.x, 2.3, this.pos.z); this.think('Estava aqui... olhando em volta.'); }
          this.waitT -= dt;
          if (this.waitT <= 0) {
            const it = this.interest;
            if (it && it.decoy) {
              this.mem.decoys++;
              this.mem.skepticism = Math.min(0.85, this.mem.skepticism + 0.3);
              this.think('Só uma garrafa. Você está brincando comigo. Não vai funcionar de novo.');
            }
            if (it && it.radio && this.g.radio && this.g.radio.on) { this.g.smashRadio(); this.think('Silêncio.'); }
            this.interest = null; this.looked = false;
            if (this.awareness > 0.55) { this.startSearch(this.lastHeard || this.lastSeen); }
            else { this.set('patrol', 'Nada. Voltando a patrulhar.'); this.waitT = U.rand(0.5, 1.5); }
          }
        }
        break;

      case 'stalk': {
        if (this.dist < cfg.stalkClose || this.stateT > 24 || (P.running && this.dist < 15) || this.aggression > 0.85) {
          this.startChase(this.dist < cfg.stalkClose ? 'Perto o bastante.' : 'Chega de esperar.'); break;
        }
        if (this.hasLOS) this.lostT = 0; else this.lostT += dt;
        if (this.lostT > 6) { this.startSearch(this.lastSeen); break; }
        if (this.g.playerSeesMonster && this.cool.retreat <= 0) {
          this.mem.timesSeen++;
          if (this.mem.timesSeen > 2 && Math.random() < 0.5) { this.startChase('Você me viu de novo. Acabou o jogo.'); break; }
          this.cool.retreat = 6;
          const spot = this.hideFrom(P);
          if (spot != null) { this.set('retreat', 'Você me viu. Volto para a sombra.'); const c = this.w.center(spot); this.goTo(c.x, c.z); break; }
        }
        this.repathT -= dt;
        if (this.repathT <= 0) {
          this.repathT = 0.6;
          if (this.dist > 9) this.goTo(this.lastSeen ? this.lastSeen.x : P.x, this.lastSeen ? this.lastSeen.z : P.z);
          else { this.path = null; this.arrived = true; }
        }
        break;
      }

      case 'retreat':
        if (this.arrived) {
          if (this.waitT <= 0 && !this.looked) { this.waitT = U.rand(2, 4); this.looked = true; }
          this.waitT -= dt;
          if (this.waitT <= 0) { this.looked = false; if (this.awareness > 0.7) this.set('stalk', 'Continuo te seguindo.'); else this.startSearch(this.lastSeen); }
        }
        if (this.dist < 3.5) this.startChase('Perto demais.');
        break;

      case 'chase': {
        if (this.vis > 0.05 && this.hasLOS) { this.lostT = 0; this.see(P); }
        else this.lostT += dt;
        if (this.lostT > 2.6 + this.aggression * 2) { this.startSearch(this.lastSeen); break; }
        // ofuscamento pela lanterna (ela aprende a tolerar)
        if (P.flashOn && P.flashI > 0.55 && this.dist < 7 && this.hasLOS && this.cool.flinch <= 0) {
          const dx = this.pos.x - P.x, dz = this.pos.z - P.z;
          const dot = (P.flashDir.x * dx + P.flashDir.z * dz) / (Math.hypot(P.flashDir.x, P.flashDir.z) * this.dist + 1e-6);
          if (dot > 0.94) {
            this.cool.flinch = 3.5;
            if (Math.random() > this.mem.flinchTol) {
              this.mem.flinchTol = Math.min(0.9, this.mem.flinchTol + 0.3);
              this.set('flinch', this.mem.flinchTol < 0.5 ? 'A LUZ! ...' : 'A luz ainda me incomoda. Por pouco tempo.');
              A.screech(this.pos.x, 2.3, this.pos.z, 0.6);
              break;
            } else this.think('A luz não me para mais.');
          }
        }
        if (this.dist < 3.6 && this.cool.lunge <= 0 && this.hasLOS) { this.lunging = 0.45; this.cool.lunge = 2.2; A.growl(this.pos.x, 2, this.pos.z, 1); }
        this.repathT -= dt;
        if (this.repathT <= 0) { this.repathT = 0.25; this.chasePath(); }
        if (this.dist < 1.05) this.g.onCaught();
        break;
      }

      case 'flinch':
        if (this.stateT > 1.2) this.set('chase');
        break;

      case 'search': {
        if (this.awareness >= 1 && this.vis > 0.1) { this.startChase('Achei você.'); break; }
        if (this.interest && this.time - this.interest.t < 0.5 && this.interest.pri > 0.3) { this.searchPlan.unshift({ x: this.interest.x, z: this.interest.z, look: 1.5 }); this.interest = null; this.arrived = true; }
        if (this.arrived) {
          if (this.waitT > 0) { this.waitT -= dt; break; }
          const nxt = this.searchPlan.shift();
          if (nxt) { this.goTo(nxt.x, nxt.z); this.waitT = nxt.look || U.rand(1, 2); if (nxt.why) this.think(nxt.why); }
          else this.endSearch();
        }
        if (this.stateT > 35) this.endSearch();
        break;
      }

      case 'ambush':
        if (this.awareness >= 0.85 && this.vis > 0.05) { this.startChase('Eu sabia que você viria até aqui.'); break; }
        if (this.arrived) {
          this.waitT -= dt;
          if (this.waitT <= 0) { this.ambush = null; this.set('patrol', 'Você não veio. Ainda.'); }
        }
        break;

      case 'breakLamp':
        if (this.awareness >= 1) { this.engage(); break; }
        if (this.arrived) {
          this.reachT += dt;
          if (this.reachT > 1.0 && this.lampTarget) {
            if (this.w.killLamp(this.lampTarget)) {
              A.lightPop(this.lampTarget.x, this.w.CEIL, this.lampTarget.z);
              this.g.onLampBroken(this.lampTarget);
            }
            this.lampTarget = null; this.lampBudget--;
          }
          if (this.reachT > 1.6) { this.reachT = 0; this.set('patrol'); this.waitT = 1; }
        }
        break;
    }
  };

  B.engage = function () {
    const P = this.g.player;
    if (this.dist > 11 && !this.g.playerSeesMonster && this.aggression < 0.65 && this.cool.stalk <= 0 && Math.random() < 0.65) {
      this.cool.stalk = 40;
      this.set('stalk', 'Te vi. Mas ainda não... vou te seguir de longe.');
      this.goTo(P.x, P.z);
    } else this.startChase('Te vi.');
  };

  B.startChase = function (why) {
    const first = this.state !== 'chase' && this.state !== 'flinch';
    this.set('chase', why || 'CAÇANDO.');
    this.awareness = 1.2; this.lostT = 0; this.repathT = 0;
    if (first) {
      if (this.cool.screech <= 0) { A.screech(this.pos.x, 2.3, this.pos.z, 1); this.cool.screech = 14; }
      this.g.onChaseStart();
    }
  };

  B.startSearch = function (from) {
    const w = this.w, L = from || { x: this.pos.x, z: this.pos.z, vx: 0, vz: 0 };
    const plan = [{ x: L.x, z: L.z, look: U.rand(0.8, 1.5), why: 'Você estava aqui. Para onde foi?' }];
    const v = Math.hypot(L.vx || 0, L.vz || 0);
    if (v > 0.5) {
      let px = L.x, pz = L.z;
      for (let i = 0; i < 14; i++) {
        const nx = px + (L.vx / v) * 0.8, nz = pz + (L.vz / v) * 0.8;
        if (w.solidAt(nx, nz)) break;
        px = nx; pz = nz;
      }
      const dir = Math.abs(L.vx) > Math.abs(L.vz) ? (L.vx > 0 ? 'leste' : 'oeste') : (L.vz > 0 ? 'sul' : 'norte');
      plan.push({ x: px, z: pz, look: 1.2, why: 'Você corria para o ' + dir + '. Vou por ali.' });
    }
    const near = [];
    for (const t of this.mem.hideFound) { const c = w.center(t); if (Math.hypot(c.x - L.x, c.z - L.z) < 16) near.push({ x: c.x, z: c.z, look: 1.6, why: 'Da última vez você se escondeu aqui.' }); }
    const hs = U.shuffle(w.hideSpots.filter((t) => { const c = w.center(t); const d = Math.hypot(c.x - L.x, c.z - L.z); return d < 11 && d > 2; })).slice(0, 3);
    for (const t of hs) { const c = w.center(t); near.push({ x: c.x, z: c.z, look: U.rand(1, 2), why: 'Cantos escuros. Gente adora cantos escuros.' }); }
    this.searchPlan = plan.concat(near.slice(0, 4));
    this.path = null; this.arrived = true; this.waitT = 0;
    this.set('search', 'Te perdi. Procurando.');
  };

  B.endSearch = function () {
    this.aggression = Math.min(1, this.aggression + 0.08);
    this.calm = -22; // respiro para o jogador
    if (this.mem.objectiveKnown && Math.random() < 0.45 + this.aggression * 0.3 && this.startAmbush()) return;
    this.set('patrol', 'Você é bom em se esconder. Eu sou paciente.');
    this.waitT = U.rand(1, 2);
  };

  B.startAmbush = function () {
    const objs = this.g.pendingObjectives();
    if (!objs.length) return false;
    const L = this.lastSeen || this.lastHeard || this.pos;
    objs.sort((a, b) => Math.hypot(a.x - L.x, a.z - L.z) - Math.hypot(b.x - L.x, b.z - L.z));
    const o = Math.random() < 0.7 ? objs[0] : U.pick(objs);
    const w = this.w;
    let best = null, bs = -1e9;
    for (let k = 0; k < 60; k++) {
      const t = U.pick(w.open), c = w.center(t);
      const d = Math.hypot(c.x - o.x, c.z - o.z);
      if (d < 2.5 || d > 8) continue;
      const s = (1 - Math.min(1, w.lightAt(c.x, c.z))) * 2 + (w.los(c.x, c.z, o.x, o.z) ? 1 : -4) - Math.abs(d - 5) * 0.2;
      if (s > bs) { bs = s; best = c; }
    }
    if (!best) return false;
    this.ambush = o;
    this.goTo(best.x, best.z);
    this.waitT = U.rand(18, 30);
    this.set('ambush', 'Você precisa ' + (o.label || 'daquilo') + '. Vou te esperar lá, no escuro.');
    return true;
  };

  B.chasePath = function () {
    const P = this.g.player, w = this.w;
    let tx = P.x, tz = P.z;
    if (!(this.hasLOS && this.dist < 6)) {
      const L = this.hasLOS ? { x: P.x, z: P.z, vx: P.vx, vz: P.vz } : this.lastSeen || { x: P.x, z: P.z, vx: 0, vz: 0 };
      tx = L.x; tz = L.z;
      const v = Math.hypot(L.vx, L.vz);
      if (v > 0.6) { // intercepta: prevê onde você vai estar
        const t = U.clamp(this.dist / this.cfg.run, 0.3, 1.6);
        for (let i = 1; i <= 8; i++) {
          const nx = L.x + L.vx * t * (i / 8), nz = L.z + L.vz * t * (i / 8);
          if (w.solidAt(nx, nz)) break;
          tx = nx; tz = nz;
        }
      }
    }
    const s = w.tileOf(this.pos.x, this.pos.z), gT = w.nearestOpen(tx, tz);
    let path = w.astar(s, gT, null, 6000);
    this.flanking = false;
    // flanqueio: tenta uma rota que evite o seu rastro (dar a volta no quarteirão)
    if (path && !this.hasLOS && this.aggression > 0.35 && this.g.trailSet && this.g.trailSet.size > 3 && this.cool.think <= 0) {
      this.cool.think = 1.5;
      const trail = this.g.trailSet;
      const alt = w.astar(s, gT, (j) => (trail.has(j) ? 5 : 0), 6000);
      const L1 = w.pathLength(path), L2 = w.pathLength(alt);
      if (alt && L2 < L1 * 1.8 && L2 > L1 * 1.15 && Math.random() < 0.5 + this.aggression * 0.3) {
        path = alt; this.flanking = true; this.think('Vou pelo outro lado e te corto.');
      }
    }
    if (path) this.setPath(path, tx, tz);
  };

  B.choosePatrol = function () {
    const w = this.w;
    let best = null, bs = -1e9, why = '';
    const objs = this.mem.objectiveKnown ? this.g.pendingObjectives() : [];
    for (let k = 0; k < 30; k++) {
      const i = U.pick(w.open), c = w.center(i);
      const d = Math.hypot(c.x - this.pos.x, c.z - this.pos.z);
      if (d < 7) continue;
      const heat = this.heat[i] + (this.heat[i + 1] || 0) + (this.heat[i - 1] || 0) + (this.heat[i + w.N] || 0) + (this.heat[i - w.N] || 0);
      const since = Math.min(120, this.time - this.visited[i]) / 120;
      const dark = 1 - Math.min(1, w.lightAt(c.x, c.z));
      let ob = 0;
      for (const o of objs) if (Math.hypot(o.x - c.x, o.z - c.z) < 10) ob = 0.7;
      const s = Math.min(3, heat) * 0.9 + since + dark * 0.55 + ob - d * 0.01 + Math.random() * 0.6;
      if (s > bs) { bs = s; best = c; why = heat > 1 ? 'Voltando aonde já senti você antes.' : ob ? 'Rondando o que você procura.' : dark > 0.6 ? 'Prefiro o escuro.' : 'Vagando. Escutando.'; }
    }
    if (best) { this.goTo(best.x, best.z); this.think(why); }
    this.waitT = U.rand(0.8, 3);
  };

  B.tryBreakLamp = function () {
    if (this.lampBudget <= 0 || this.cool.lamp > 0 || Math.random() > 0.4) return false;
    const lp = this.w.nearestLamp(this.pos.x, this.pos.z, 7, true);
    if (!lp) return false;
    // não quebra a lâmpada se você está olhando (prefere que pareça "acidente")
    if (this.g.playerSeesMonster) return false;
    this.cool.lamp = U.rand(25, 45);
    this.lampTarget = lp; this.reachT = 0;
    this.goTo(lp.x, lp.z + 0.3);
    this.set('breakLamp', 'Luz demais aqui. Quanto mais escuro, melhor pra mim.');
    return true;
  };

  // célula próxima fora da sua linha de visão, de preferência escura
  B.hideFrom = function (P) {
    const w = this.w, me = w.tileOf(this.pos.x, this.pos.z);
    const d = w.distField(me, 10);
    let best = null, bs = -1e9;
    for (let i = 0; i < d.length; i++) {
      if (!(d[i] < 10) || d[i] < 1.5) continue;
      const c = w.center(i);
      if (w.los(P.x, P.z, c.x, c.z)) continue;
      const s = -d[i] * 0.3 + (1 - Math.min(1, w.lightAt(c.x, c.z))) * 2 + Math.hypot(c.x - P.x, c.z - P.z) * 0.05;
      if (s > bs) { bs = s; best = i; }
    }
    return best;
  };

  // ----------------------------------------------------------
  //  DIRETOR (ritmo da tensão)
  // ----------------------------------------------------------
  B.director = function (dt) {
    const quiet = (this.state === 'patrol' || this.state === 'dormant') && this.dist > 16;
    this.calm = quiet ? this.calm + dt : Math.min(this.calm, 0);
    const limit = this.cfg.director * (1.2 - this.aggression * 0.5);
    if (this.calm < limit || this.g.playerSeesMonster || this.state === 'dormant') return;
    this.calm = -U.rand(10, 25);
    const df = this.g.distField, w = this.w;
    if (!df) return;
    const me = w.tileOf(this.pos.x, this.pos.z);
    if (df[me] > 32) {
      const P = this.g.player, cands = [];
      for (let i = 0; i < df.length; i++) {
        if (!(df[i] > 16 && df[i] < 26)) continue;
        const c = w.center(i);
        if (w.los(P.x, P.z, c.x, c.z)) continue;
        cands.push(i);
      }
      if (cands.length) { this.place(U.pick(cands)); this.g.onMonsterShift(); }
    }
    const P = this.g.player;
    this.setInterest(P.x + U.rand(-7, 7), P.z + U.rand(-7, 7), 0.6, 'instinto');
    this.awareness = Math.max(this.awareness, 0.3);
    this.think('Silêncio demais. Eu sei mais ou menos onde você está.');
  };

  // ----------------------------------------------------------
  //  MOVIMENTO
  // ----------------------------------------------------------
  B.goTo = function (x, z) {
    const w = this.w;
    const s = w.tileOf(this.pos.x, this.pos.z), g = w.nearestOpen(x, z);
    const path = w.astar(s, g, null, 8000);
    if (!path) { this.path = null; this.arrived = true; return false; }
    this.setPath(path, x, z);
    return true;
  };
  B.setPath = function (path, x, z) {
    const w = this.w;
    const pts = w.smoothPath(path, this.pos.x, this.pos.z, 0.34);
    const last = pts[pts.length - 1];
    if (!w.solidAt(x, z) && w.walkable(last.x, last.z, x, z, 0.3)) pts.push({ x, z });
    this.path = pts; this.pathI = 1; this.arrived = pts.length <= 1;
  };

  B.speedFor = function () {
    const c = this.cfg, s = this.state;
    if (s === 'dormant' || s === 'flinch' || (s === 'breakLamp' && this.arrived)) return 0;
    if (this.arrived) return 0;
    if (s === 'chase') return c.run * (1 + this.aggression * 0.12) * (this.lunging > 0 ? 1.45 : 1);
    if (s === 'stalk') return this.dist > 14 ? c.walk * 1.8 : c.walk * 1.05;
    if (s === 'retreat') return c.run * 0.75;
    if (s === 'investigate') return c.walk * 1.4;
    if (s === 'search') return c.walk * 1.65;
    if (s === 'ambush') return c.walk * 1.8;
    return c.walk;
  };

  B.move = function (dt) {
    const w = this.w;
    if (w.solidAt(this.pos.x, this.pos.z)) { const c = w.center(w.nearestOpen(this.pos.x, this.pos.z)); this.pos.x = c.x; this.pos.z = c.z; }
    this.lunging = Math.max(0, this.lunging - dt);
    const sp = this.speedFor();
    let moved = 0;
    if (sp > 0 && this.path && !this.arrived) {
      let budget = sp * dt;
      while (budget > 0 && this.pathI < this.path.length) {
        const t = this.path[this.pathI];
        const dx = t.x - this.pos.x, dz = t.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d < 1e-3) { this.pathI++; continue; }
        const want = Math.atan2(dx, dz);
        this.heading += U.angDiff(this.heading, want) * (1 - Math.exp(-dt * (this.state === 'chase' ? 12 : 6)));
        const step = Math.min(budget, d);
        this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step;
        budget -= step; moved += step;
        if (step >= d - 1e-4) this.pathI++;
      }
      if (this.pathI >= this.path.length) this.arrived = true;
      w.collide(this.pos, 0.28);
      const ti = w.tileOf(this.pos.x, this.pos.z);
      this.visited[ti] = this.time;
    } else if (this.arrived) {
      // parada: vira para o que está olhando
      const L = this.lookTarget();
      if (L) this.heading += U.angDiff(this.heading, Math.atan2(L.x - this.pos.x, L.z - this.pos.z)) * (1 - Math.exp(-dt * 3));
    }
    this.curSpeed = U.damp(this.curSpeed, moved / Math.max(dt, 1e-4), 10, dt);
    this.moved = moved;
  };

  B.lookTarget = function () {
    const P = this.g.player;
    if (this.state === 'chase' || this.state === 'stalk' || this.state === 'retreat' || this.state === 'flinch') return { x: P.x, y: P.y, z: P.z };
    if ((this.state === 'investigate' || this.state === 'search') && this.awareness > 0.75 && this.hasLOS) return { x: P.x, y: P.y, z: P.z };
    if (this.state === 'ambush' && this.ambush) return { x: this.ambush.x, y: 1.5, z: this.ambush.z };
    if (this.state === 'breakLamp' && this.lampTarget) return { x: this.lampTarget.x, y: this.w.CEIL, z: this.lampTarget.z };
    if (this.interest && this.state === 'investigate') return { x: this.interest.x, y: 1.5, z: this.interest.z };
    return null;
  };

  // ----------------------------------------------------------
  //  SONS
  // ----------------------------------------------------------
  B.sounds = function (dt) {
    const s = this.state, crawl = s === 'chase' || s === 'retreat';
    this.stepAcc += this.moved || 0;
    const stepLen = crawl ? 0.6 : 0.95;
    if (this.stepAcc > stepLen) {
      this.stepAcc = 0;
      const heavy = s === 'stalk' ? 0.22 : s === 'ambush' ? 0.3 : s === 'chase' ? 1 : 0.65;
      A.monsterStep(this.pos.x, this.pos.z, heavy, crawl);
    }
    if (this.voice) {
      const lvl = { dormant: 0.08, patrol: 0.32, investigate: 0.38, stalk: 0.03, retreat: 0.1, chase: 0.75, search: 0.5, ambush: 0.02, flinch: 0.6, breakLamp: 0.3 }[s] || 0.2;
      const rate = s === 'chase' ? 1.5 : s === 'search' ? 0.8 : 0.38;
      this.voice.set(this.pos.x, 2.3, this.pos.z, lvl, rate, this.g.occlusion(this.pos.x, this.pos.z));
    }
    if (this.cool.clicks <= 0) {
      const silent = s === 'stalk' || s === 'ambush' || s === 'dormant' || s === 'retreat';
      if (!silent) A.clicks(this.pos.x, 2.3, this.pos.z, null, s === 'chase' ? 1.2 : 0.9);
      this.cool.clicks = s === 'chase' ? U.rand(2, 4) : s === 'search' ? U.rand(3, 6) : s === 'investigate' ? U.rand(4, 7) : U.rand(7, 14);
    }
    if (this.cool.growl <= 0 && (s === 'chase' || s === 'search')) {
      A.growl(this.pos.x, 2.2, this.pos.z, 0.8);
      this.cool.growl = U.rand(3, 7);
    }
  };

  // ----------------------------------------------------------
  //  ANIMAÇÃO / EFEITOS VISUAIS
  // ----------------------------------------------------------
  B.animate = function (dt) {
    const s = this.state, e = this.e;
    e.root.position.set(this.pos.x, 0, this.pos.z);
    e.root.rotation.y = this.heading;
    const L = this.lookTarget();
    const seen = this.g.playerSeesMonster;
    e.update(dt, {
      speed: this.curSpeed,
      crawl: s === 'chase' || s === 'retreat' ? 1 : 0,
      look: L ? new THREE.Vector3(L.x, L.y, L.z) : null,
      listen: (this.arrived && (s === 'patrol' || s === 'investigate' || s === 'search')) || s === 'ambush',
      mouth: s === 'flinch' ? 1 : s === 'chase' ? (this.lunging > 0 ? 0.9 : 0.3) : 0,
      reach: s === 'breakLamp' && this.arrived ? 1 : 0,
      flinch: s === 'flinch' ? 1 : 0,
      agitation: s === 'chase' ? 1 : s === 'search' ? 0.6 : s === 'flinch' ? 1 : 0.25,
      jerky: seen && this.dist < 12 ? 1 : s === 'chase' ? 0.35 : 0,
      eyeGlow: s === 'chase' ? 1.4 : s === 'stalk' || s === 'ambush' ? 0.02 : 0.3,
    });
    if (seen && this.dist < 12 && Math.random() < 0.15) {
      e.root.position.x += U.rand(-0.06, 0.06); e.root.position.z += U.rand(-0.06, 0.06);
    }
  };

  // intensidade da oscilação das lâmpadas causada por ela
  B.flickerStrength = function () {
    return { dormant: 0, patrol: 0.5, investigate: 0.6, stalk: 0.12, retreat: 0.25, chase: 0.95, search: 0.65, ambush: 0, flinch: 1, breakLamp: 0.8 }[this.state] || 0.3;
  };
  B.glitch = function () {
    return this.state === 'chase' ? 0.45 : this.state === 'flinch' ? 1 : 0.06;
  };

  BR.Brain = Brain;
})(window.BR);
