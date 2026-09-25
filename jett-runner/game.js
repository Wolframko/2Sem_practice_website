/*
 * Jett Run — анимация-игра в стиле динозаврика из Chrome.
 *
 * Джетт сама бежит по крышам. В демо-режиме ею управляет автопилот:
 * он «проигрывает» ближайшее будущее и выбирает момент для прыжка,
 * подката или рывка. Нажми пробел — и управлять будешь ты.
 */
'use strict';

(() => {
  /* ---------- Сцена ---------- */
  const VW = 360; // ширина сцены в пикселях пиксель-арта
  const VH = 128; // высота сцены
  const GROUND = 110; // строка, на которой стоят персонажи
  const PLAYER_X = 40; // где бежит Джетт
  const SPAWN_X = VW + 8; // где появляются препятствия
  const STEP = 1000 / 60; // физика считается 60 раз в секунду

  /* ---------- Физика Джетт ---------- */
  const GRAVITY = 0.4;
  const JUMP_VELOCITY = 6.6;
  const JUMP_CUT = 3; // отпустил прыжок раньше — Джетт прыгает ниже
  const MIN_JUMP = 10;
  const JUMP_BUFFER = 6; // нажатие чуть раньше приземления тоже засчитывается
  const FAST_FALL = 2.5; // ↓ в воздухе — быстрое падение
  const GLIDE_FALL = 1.3; // парение (пассивка Drift)
  const GLIDE_TICKS = 60;
  const DASH_TICKS = 16; // рывок (Tailwind)
  const DASH_BOOST = 2.6;
  const DASH_COOLDOWN = 300;

  /* ---------- Скорость и очки ---------- */
  const START_SPEED = 3.3;
  const MAX_SPEED = 7.5;
  const ACCELERATION = 0.0006;
  const SCORE_PER_PX = 0.045;

  const RANKS = [
    { name: 'ЖЕЛЕЗО', score: 0, color: '#a4a9b0' },
    { name: 'БРОНЗА', score: 100, color: '#c68a52' },
    { name: 'СЕРЕБРО', score: 200, color: '#dfe5ea' },
    { name: 'ЗОЛОТО', score: 350, color: '#f2c14e' },
    { name: 'ПЛАТИНА', score: 500, color: '#4fd1d9' },
    { name: 'АЛМАЗ', score: 700, color: '#c794ff' },
    { name: 'ВОСХОЖДЕНИЕ', score: 950, color: '#4ee29a' },
    { name: 'БЕССМЕРТИЕ', score: 1250, color: '#ff6b82' },
    { name: 'РАДИАНТ', score: 1600, color: '#fff2a8' },
  ];

  const art = buildArt();
  const scenery = buildScenery(VW, GROUND, VH);

  // Позы Джетт: высота спрайта и хитбоксы [x, y, ширина, высота] от левого верхнего угла.
  const STAND = { h: art.player.h, boxes: [[12, 2, 10, 10], [12, 12, 8, 8], [10, 20, 11, 11]] };
  const SLIDE = { h: art.slide.h, boxes: [[23, 4, 10, 10], [12, 10, 11, 7], [8, 15, 12, 6]] };

  /* ---------- Препятствия ---------- */
  // alts — высоты полёта (для летающих), vx — собственная скорость навстречу Джетт.
  const crates = (n) => Array.from({ length: n }, (_, i) => [art.crate, i * 14, 0]);
  const OBSTACLES = {
    crate: { weight: 4, minSpeed: 0, w: 16, h: 16, parts: crates(1), boxes: [[2, 2, 12, 13]] },
    crate2: { weight: 2, minSpeed: 3.9, w: 30, h: 16, parts: crates(2), boxes: [[2, 2, 26, 13]] },
    crate3: { weight: 1.5, minSpeed: 5.2, w: 44, h: 16, parts: crates(3), boxes: [[2, 2, 40, 13]] },
    stack: {
      weight: 1.5, minSpeed: 4.4, w: 16, h: 30,
      parts: [[art.crate, 0, 0], [art.crate, 0, 14]], boxes: [[2, 2, 12, 27]],
    },
    turret: {
      weight: 3, minSpeed: 0, w: 14, h: 15,
      parts: [[art.turret, 0, 0]], boxes: [[2, 1, 10, 6], [4, 7, 6, 7]],
    },
    wall: { weight: 2, minSpeed: 4.8, w: 14, h: 28, parts: [[art.wall, 0, 0]], boxes: [[2, 3, 10, 24]] },
    bot: { weight: 2.5, minSpeed: 4.2, w: 18, h: 11, frames: art.boombot, boxes: [[2, 1, 14, 9]], vx: 1 },
    drone: {
      weight: 3.5, minSpeed: 3.9, w: 18, h: 12, frames: art.drone, boxes: [[1, 3, 16, 8]],
      alts: [3, 20, 20, 33], bob: 2, vx: 0.5,
    },
    bolt: {
      weight: 2.5, minSpeed: 5.4, w: 23, h: 7, parts: [[art.bolt, 0, 0]], boxes: [[1, 2, 21, 3]],
      alts: [19], vx: 2.4,
    },
  };

  /* ---------- DOM ---------- */
  const root = document.getElementById('game');
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  const view = makeCanvas(VW, VH); // сцена рисуется в маленьком холсте и потом масштабируется
  const g = view.getContext('2d');
  const ui = {
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    rank: document.getElementById('rank'),
    ability: document.getElementById('ability'),
    banner: document.getElementById('banner'),
    finalScore: document.getElementById('final-score'),
    finalBest: document.getElementById('final-best'),
    finalRank: document.getElementById('final-rank'),
    record: document.getElementById('final-record'),
    pause: document.getElementById('btn-pause'),
    sound: document.getElementById('btn-sound'),
  };

  const storage = {
    get(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : JSON.parse(value);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // приватный режим браузера — просто не сохраняем
      }
    },
  };

  /* ---------- Звук (синтезируется на лету через Web Audio) ---------- */
  const sound = {
    ctx: null,
    noise: null,
    on: storage.get('jett-run:sound', true) !== false,
    unlock() {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!this.ctx && AudioCtx) {
        this.ctx = new AudioCtx();
        const length = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    ready() {
      return this.on && this.ctx && mode === 'play';
    },
    tone(from, to, duration, type = 'square', volume = 0.04, delay = 0) {
      if (!this.ready()) return;
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(to, t + duration);
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    },
    whoosh(duration, volume) {
      if (!this.ready()) return;
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      src.buffer = this.noise;
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(500, t);
      filter.frequency.exponentialRampToValueAtTime(3000, t + duration);
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      src.connect(filter).connect(gain).connect(this.ctx.destination);
      src.start(t);
      src.stop(t + duration + 0.05);
    },
    jump() { this.tone(380, 760, 0.1, 'square', 0.03); this.whoosh(0.12, 0.05); },
    dash() { this.whoosh(0.3, 0.14); this.tone(220, 880, 0.16, 'triangle', 0.05); },
    point() { this.tone(988, 988, 0.07); this.tone(1319, 1319, 0.12, 'square', 0.04, 0.08); },
    rank() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.14, 'square', 0.035, i * 0.08)); },
    hit() { this.tone(330, 55, 0.45, 'sawtooth', 0.06); this.whoosh(0.25, 0.1); },
  };

  /* ---------- Состояние ---------- */
  let mode = 'demo'; // demo — автопилот, play — игрок, over — поражение
  let paused = false;
  let tick = 0;
  let player;
  let obstacles;
  let world;
  let particles = [];
  let nextId = 1;
  let score = 0;
  let best = Number(storage.get('jett-run:best', 0)) || 0;
  let rankIndex = 0;
  let deathTick = 0;
  let shake = 0;
  let anim = 0;
  const parallax = { far: 0, near: 0, city: 0, clouds: 0, ground: 0 };
  const keys = { jump: false, jumpTap: false, down: false, downTap: false, dash: false };
  const NO_INPUT = { jump: false, down: false, dash: false };

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  function newPlayer() {
    return {
      y: 0, // высота ног над землёй
      vy: 0,
      ground: true,
      hold: false, // кнопка прыжка всё ещё зажата с момента отрыва
      glideT: 0,
      gliding: false,
      sliding: false,
      dashT: 0,
      dashCD: 0,
      dx: 0, // смещение вперёд во время рывка
      prevJump: false,
      buffer: 0,
      dead: false,
    };
  }

  function reset() {
    player = newPlayer();
    obstacles = [];
    world = { speed: START_SPEED, distance: 0, nextArrival: tick + 100, nextType: null, lastType: null, repeat: 0 };
    ai.plan = null;
    score = 0;
    shake = 0;
    setRank(0);
  }

  /* ---------- Физика ---------- */
  // Один шаг Джетт. Та же функция используется автопилотом для «прогноза будущего».
  function stepPlayer(p, input) {
    const pressed = input.jump && !p.prevJump;
    p.prevJump = input.jump;
    p.buffer = pressed ? JUMP_BUFFER : Math.max(0, p.buffer - 1);
    if (p.dashCD > 0) p.dashCD--;

    if (input.dash && p.dashT === 0 && p.dashCD === 0) {
      p.dashT = DASH_TICKS;
      p.dashCD = DASH_COOLDOWN;
      p.sliding = false;
      p.gliding = false;
      p.hold = false;
    }
    if (p.dashT > 0) {
      p.dashT--;
      p.dx = Math.min(10, p.dx + 2);
      if (!p.ground) p.vy = 0; // во время рывка Джетт зависает в воздухе
      return;
    }
    if (p.dx > 0) p.dx = Math.max(0, p.dx - 0.5);

    if (p.ground) {
      if (p.buffer === 0) {
        p.sliding = input.down;
        return;
      }
      p.ground = false;
      p.vy = JUMP_VELOCITY;
      p.hold = true;
      p.glideT = 0;
      p.buffer = 0;
      p.sliding = false;
    }

    if (p.hold && !input.jump && p.y > MIN_JUMP) {
      p.hold = false;
      if (p.vy > JUMP_CUT) p.vy = JUMP_CUT;
    }
    p.vy -= GRAVITY * (input.down ? FAST_FALL : 1);
    if (p.vy <= 0) p.hold = false;
    p.gliding = input.jump && !input.down && p.vy < 0 && p.glideT < GLIDE_TICKS;
    if (p.gliding) {
      p.glideT++;
      if (p.vy < -GLIDE_FALL) p.vy = -GLIDE_FALL;
    }
    p.y += p.vy;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
      p.ground = true;
      p.gliding = false;
      p.sliding = input.down;
    }
  }

  function moveObstacle(o, scroll) {
    o.x -= scroll + o.vx;
    if (o.bob) {
      o.phase += 0.09;
      o.alt = o.baseAlt + Math.round(Math.sin(o.phase) * o.bob);
    }
  }

  // Общий шаг мира: Джетт + скорость + препятствия. Возвращает, насколько сдвинулся мир.
  function advance(p, obs, w, input) {
    stepPlayer(p, input);
    w.speed = Math.min(MAX_SPEED, w.speed + ACCELERATION);
    const scroll = w.speed * (p.dashT > 0 ? DASH_BOOST : 1);
    for (const o of obs) moveObstacle(o, scroll);
    return scroll;
  }

  function playerLeft(p) {
    return PLAYER_X + Math.round(p.dx);
  }

  // Проверка столкновения прямоугольников Джетт и препятствий.
  function hitTest(p, obs) {
    if (p.dashT > 0) return null; // рывок проходит сквозь препятствия
    const pose = p.ground && p.sliding ? SLIDE : STAND;
    const px = playerLeft(p);
    const py = GROUND - Math.round(p.y) - (pose.h - 1);
    for (const o of obs) {
      const ox = Math.round(o.x);
      if (ox > px + 36 || ox + o.def.w < px) continue;
      const oy = GROUND - o.alt - (o.def.h - 1);
      for (const a of pose.boxes) {
        const ax = px + a[0];
        const ay = py + a[1];
        for (const b of o.def.boxes) {
          const bx = ox + b[0];
          const by = oy + b[1];
          if (ax < bx + b[2] && ax + a[2] > bx && ay < by + b[3] && ay + a[3] > by) return o;
        }
      }
    }
    return null;
  }

  /* ---------- Появление препятствий ---------- */
  function pickType() {
    const pool = Object.entries(OBSTACLES).filter(([name, def]) =>
      world.speed >= def.minSpeed && !(name === world.lastType && world.repeat >= 2));
    let r = Math.random() * pool.reduce((sum, [, def]) => sum + def.weight, 0);
    for (const [name, def] of pool) {
      r -= def.weight;
      if (r <= 0) return name;
    }
    return pool[0][0];
  }

  // Препятствия планируются по времени прибытия к Джетт, чтобы между ними
  // всегда оставалось время на прыжок — даже если препятствие летит быстрее мира.
  function spawnObstacles() {
    // во время рывка мир «перематывается» — новое препятствие сразу оказалось бы под ногами
    if (player.dashT > 0) return;
    if (!world.nextType) world.nextType = pickType();
    const name = world.nextType;
    const def = OBSTACLES[name];
    const closing = world.speed + (def.vx || 0);
    const travel = (SPAWN_X - PLAYER_X) / closing;
    if (tick + travel < world.nextArrival) return;

    const alt = def.alts ? pick(def.alts) : 0;
    obstacles.push({
      id: nextId++, name, def, x: SPAWN_X, alt, baseAlt: alt,
      vx: def.vx || 0, bob: def.bob || 0, phase: Math.random() * Math.PI * 2,
    });
    world.repeat = name === world.lastType ? world.repeat + 1 : 1;
    world.lastType = name;
    world.nextType = null;
    const gap = 36 + Math.random() * (36 - Math.min(20, (world.speed - START_SPEED) * 6));
    world.nextArrival = Math.max(world.nextArrival, tick + travel) + def.w / closing + gap;
  }

  /* ---------- Автопилот ---------- */
  // План — действие (прыжок, подкат, рывок...) и момент его начала.
  const ai = { plan: null };
  const ACTIONS = ['jump', 'hop', 'glide', 'slide', 'dash', 'fastfall'];

  function passed(target, p) {
    return !target || Math.round(target.x) + target.def.w < playerLeft(p) + 8;
  }

  function planInput(plan, t, p, target) {
    if (t < 0) return NO_INPUT;
    switch (plan.action) {
      case 'jump': return { jump: t < 14, down: false, dash: false };
      case 'hop': return { jump: t < 3, down: false, dash: false };
      case 'glide': return { jump: t === 0 || !p.ground, down: false, dash: false };
      case 'slide': return { jump: false, down: !passed(target, p), dash: false };
      case 'dash': return { jump: false, down: false, dash: t === 0 };
      case 'fastfall': return { jump: false, down: !p.ground, dash: false };
      default: return NO_INPUT;
    }
  }

  function planDone(plan, t, p, target) {
    return t >= 0 && p.ground && p.dashT === 0 && passed(target, p);
  }

  function clonePlayer(p) {
    return { ...p };
  }

  function cloneObstacles(list) {
    return list.map((o) => ({ ...o }));
  }

  // «Проигрывает» план в копии мира и проверяет, что Джетт ни во что не врежется.
  function simulatePlan(plan) {
    const p = clonePlayer(player);
    const obs = cloneObstacles(obstacles);
    const w = { speed: world.speed };
    const target = obs.find((o) => o.id === plan.target);
    for (let i = 0; i < 180; i++) {
      const t = tick + i - plan.start;
      advance(p, obs, w, planInput(plan, t, p, target));
      if (hitTest(p, obs)) return false;
      if (planDone(plan, t, p, target)) return canContinue(p, obs, w);
    }
    return false;
  }

  // Что можно сделать сразу после плана: бежать дальше, прыгнуть или пригнуться.
  const FOLLOW_UPS = [
    { ticks: 12, input: () => NO_INPUT },
    { ticks: 60, untilLanded: true, input: (i) => ({ jump: i >= 1 && i < 15, down: false, dash: false }) },
    { ticks: 30, input: () => ({ jump: false, down: true, dash: false }) },
  ];

  // План хорош, только если после него Джетт успеет среагировать на следующее препятствие.
  function canContinue(p, obs, w) {
    return FOLLOW_UPS.some((next) => {
      const q = clonePlayer(p);
      const o = cloneObstacles(obs);
      const ww = { speed: w.speed };
      for (let i = 0; i < next.ticks; i++) {
        advance(q, o, ww, next.input(i));
        if (hitTest(q, o)) return false;
        if (next.untilLanded && i > 1 && q.ground) return true;
      }
      return true;
    });
  }

  // Во что Джетт врежется, если ничего не делать?
  function findThreat(horizon) {
    const p = clonePlayer(player);
    const obs = cloneObstacles(obstacles);
    const w = { speed: world.speed };
    for (let t = 0; t < horizon; t++) {
      advance(p, obs, w, NO_INPUT);
      const hit = hitTest(p, obs);
      if (hit) return { id: hit.id, tick: t };
    }
    return null;
  }

  // Промежутки задержек, при которых действие спасает от столкновения.
  function safeWindows(action, threat) {
    const windows = [];
    let current = null;
    const step = threat.tick > 16 ? 2 : 1; // если столкновение близко — проверяем каждый тик
    for (let d = 0; d <= Math.min(threat.tick, 60); d += step) {
      if (simulatePlan({ action, start: tick + d, target: threat.id })) {
        if (!current) windows.push((current = []));
        current.push(d);
      } else {
        current = null;
      }
    }
    return windows;
  }

  function makePlan(threat) {
    const target = obstacles.find((o) => o.id === threat.id);
    const flying = target.alt > 8;
    const weights = { jump: 6, hop: 2, glide: 1.2, slide: 8, dash: 2, fastfall: 1 };
    // рывок «перематывает» мир, поэтому он безопасен, только если следующее препятствие не на подходе
    const canDash = player.dashCD === 0 && world.nextArrival - tick > 70;
    // действия, которые вообще могут помочь, в случайном порядке с учётом «любимых»
    const pool = ACTIONS.filter((a) =>
      (a !== 'slide' || flying) && (a !== 'dash' || canDash) && (a !== 'fastfall' || !player.ground));
    let fallback = null;
    while (pool.length) {
      let r = Math.random() * pool.reduce((sum, a) => sum + weights[a], 0);
      const index = Math.max(0, pool.findIndex((a) => (r -= weights[a]) <= 0));
      const action = pool.splice(index, 1)[0];
      const windows = safeWindows(action, threat);
      if (!windows.length) continue;
      const widest = windows.reduce((a, b) => (b.length > a.length ? b : a));
      // прыгаем в середине безопасного окна, а подкат начинаем чуть заранее
      const delay = action === 'slide'
        ? widest[Math.max(0, widest.length - 5)]
        : widest[Math.floor(widest.length / 2)];
      const plan = { action, start: tick + delay, target: threat.id, slack: widest.length };
      // впритык не рискуем: ищем вариант с запасом, а этот оставляем на крайний случай
      if (widest.length >= 3) return plan;
      if (!fallback || plan.slack > fallback.slack) fallback = plan;
    }
    return fallback;
  }

  function aiInput() {
    let plan = ai.plan;
    if (plan) {
      const target = obstacles.find((o) => o.id === plan.target);
      if (planDone(plan, tick - plan.start, player, target) || !simulatePlan(plan)) plan = null;
    }
    if (!plan) {
      const threat = findThreat(70);
      plan = threat ? makePlan(threat) : null;
    }
    ai.plan = plan;
    if (!plan) return NO_INPUT;
    const target = obstacles.find((o) => o.id === plan.target);
    return planInput(plan, tick - plan.start, player, target);
  }

  /* ---------- Частицы ---------- */
  function emit(q) {
    particles.push({ vx: 0, vy: 0, size: 1, gravity: 0, world: false, ...q, max: q.life });
  }

  function updateParticles(scroll) {
    for (const q of particles) {
      q.life--;
      q.x += q.vx - (q.world ? scroll : 0);
      q.y += q.vy;
      q.vy += q.gravity;
      if (q.petal) {
        q.x -= scroll * 0.35;
        q.y += Math.sin((tick + q.seed) * 0.06) * 0.2;
      }
    }
    particles = particles.filter((q) => q.life > 0 && q.x > -24 && q.x < VW + 40 && q.y < VH);
  }

  function spawnEffects(before, scroll) {
    const p = player;
    const feetX = playerLeft(p) + 15;
    const feetY = GROUND - Math.round(p.y);

    if (before.ground && !p.ground && p.dashT === 0) {
      // Updraft: вихрь ветра под ногами
      for (let i = 0; i < 12; i++) {
        emit({
          x: feetX + rand(-7, 7), y: GROUND - rand(0, 3), vx: rand(-1.6, 1.6), vy: rand(-0.4, 0.4),
          life: rand(12, 22), color: pick(['#bff1ff', '#62d6ff', '#ffffff']), world: true,
        });
      }
      sound.jump();
    }
    if (!before.ground && p.ground) {
      for (let i = 0; i < 6; i++) {
        emit({
          x: feetX + rand(-7, 5), y: GROUND - 1, vx: rand(-1, 0.4), vy: rand(-0.8, -0.2),
          life: rand(10, 16), color: '#c7b3dd', world: true, gravity: 0.05,
        });
      }
    }
    if (p.ground && p.dashT === 0 && tick % 8 === 0) {
      emit({
        x: feetX - 6, y: GROUND - 1, vx: rand(-0.6, 0), vy: rand(-0.5, -0.1),
        life: 12, color: '#9d86b8', world: true, gravity: 0.04,
      });
    }
    if (p.gliding && tick % 2 === 0) {
      emit({ x: feetX + rand(-6, 6), y: feetY + 1, vx: rand(-1.8, -0.6), vy: rand(0.3, 0.9), life: 16, color: '#bff1ff' });
    }
    if (p.dashT === DASH_TICKS - 1) {
      for (let i = 0; i < 14; i++) {
        emit({
          x: feetX + rand(-10, 4), y: feetY - rand(2, 28), vx: rand(-4, -1), vy: rand(-0.6, 0.6),
          life: rand(10, 18), color: pick(['#ffffff', '#62d6ff']),
        });
      }
      sound.dash();
    }
    // полосы ветра — чем быстрее, тем их больше
    if (p.dashT > 0 || (world.speed > 4.2 && tick % 5 === 0)) {
      emit({
        x: rand(PLAYER_X, VW), y: rand(GROUND - 60, GROUND - 4), vx: -scroll * rand(1.2, 2),
        len: Math.round(rand(5, p.dashT > 0 ? 18 : 10)), life: 14,
        color: p.dashT > 0 ? 'rgba(191, 241, 255, 0.85)' : 'rgba(191, 241, 255, 0.35)',
      });
    }
    // лепестки сакуры — просто для атмосферы
    if (tick % 26 === 0) {
      emit({
        x: VW + 4, y: rand(8, GROUND - 16), vx: -rand(0.3, 0.8), vy: rand(0.05, 0.22),
        life: 900, color: pick(['#ffb3c7', '#ff8fb1', '#ffd1dc']), petal: true, seed: rand(0, 200), size: 2,
      });
    }
  }

  /* ---------- Режимы ---------- */
  function setMode(next) {
    mode = next;
    root.dataset.mode = next;
    document.body.dataset.mode = next;
    ui.pause.disabled = next === 'over';
  }

  function startDemo() {
    reset();
    setMode('demo');
  }

  function startGame() {
    sound.unlock();
    reset();
    setMode('play');
    setPaused(false);
  }

  function crash() {
    const p = player;
    p.dead = true;
    p.ground = false;
    p.vy = 3.4;
    deathTick = tick;
    shake = 8;
    const cx = playerLeft(p) + 18;
    const cy = GROUND - Math.round(p.y) - 16;
    for (let i = 0; i < 22; i++) {
      emit({
        x: cx + rand(-4, 4), y: cy + rand(-8, 8), vx: rand(-2.5, 2.5), vy: rand(-2.8, 0.5),
        life: rand(18, 34), color: pick(['#ff4655', '#ffffff', '#ffb3c7']), gravity: 0.12, size: pick([1, 2]),
      });
    }
    if (mode === 'demo') return; // в демо просто начнём заново
    sound.hit();
    const final = Math.floor(score);
    const isRecord = final > best;
    if (isRecord) {
      best = final;
      storage.set('jett-run:best', best);
    }
    ui.finalScore.textContent = pad(final);
    ui.finalBest.textContent = pad(best);
    ui.finalRank.textContent = RANKS[rankIndex].name;
    ui.finalRank.style.color = RANKS[rankIndex].color;
    ui.record.hidden = !isRecord;
    setMode('over');
    updateHud();
  }

  function updateDeath() {
    const p = player;
    if (!p.ground) {
      p.vy -= GRAVITY;
      p.y += p.vy;
      p.dx -= 0.6;
      if (p.y <= 0) {
        p.y = 0;
        p.ground = true;
      }
    }
    if (mode === 'demo' && tick - deathTick > 70) startDemo();
    if (mode === 'over' && tick - deathTick > 60 * 25) startDemo(); // заскучали — включаем демо
  }

  /* ---------- Главный цикл ---------- */
  function readKeys() {
    const input = { jump: keys.jump || keys.jumpTap, down: keys.down || keys.downTap, dash: keys.dash };
    keys.jumpTap = false;
    keys.downTap = false;
    keys.dash = false;
    return input;
  }

  function update() {
    tick++;
    if (shake > 0) shake -= 0.5;
    if (player.dead) {
      updateDeath();
      updateParticles(0);
      return;
    }
    const input = mode === 'demo' ? aiInput() : readKeys();
    const before = { ground: player.ground };
    const scroll = advance(player, obstacles, world, input);
    world.distance += scroll;
    parallax.far += scroll * 0.05;
    parallax.near += scroll * 0.12;
    parallax.clouds += scroll * 0.2 + 0.05;
    parallax.city += scroll * 0.3;
    parallax.ground += scroll;
    anim += player.ground ? Math.min(world.speed, 5.5) / 14 : 0;

    spawnObstacles();
    obstacles = obstacles.filter((o) => o.x + o.def.w > -16);
    spawnEffects(before, scroll);
    updateParticles(scroll);

    score = world.distance * SCORE_PER_PX;
    const hit = hitTest(player, obstacles);
    if (hit) crash();
    updateHud();
  }

  let lastTime = performance.now();
  let lag = 0;
  function frame(now) {
    const dt = Math.max(0, Math.min(100, now - lastTime));
    lastTime = now;
    if (!paused) {
      lag += dt;
      while (lag >= STEP) {
        update();
        lag -= STEP;
      }
    }
    render();
    requestAnimationFrame(frame);
  }

  /* ---------- Отрисовка ---------- */
  const ghosts = new Map();
  function ghostOf(img) {
    if (!ghosts.has(img)) ghosts.set(img, tint(img, '#62d6ff'));
    return ghosts.get(img);
  }

  function tiled(img, offset, y) {
    const w = img.width;
    for (let x = -(Math.floor(offset) % w); x < VW; x += w) g.drawImage(img, x, y);
  }

  function drawBackground() {
    g.drawImage(scenery.sky, 0, 0);
    for (const s of scenery.stars) {
      const twinkle = Math.sin(tick * 0.04 + s.phase);
      if (twinkle < -0.4) continue;
      g.fillStyle = s.bright && twinkle > 0.5 ? '#ffffff' : 'rgba(255, 255, 255, 0.5)';
      g.fillRect(s.x, s.y, 1, 1);
    }
    g.drawImage(scenery.sun, 266 - (scenery.sun.width >> 1), 62 - (scenery.sun.height >> 1));
    tiled(scenery.far, parallax.far, GROUND - scenery.far.height - 6);
    scenery.clouds.forEach((cloud, i) => {
      const loop = VW + 90;
      const x = Math.floor(((i * 150 + 40 - parallax.clouds) % loop + loop) % loop) - 50;
      g.drawImage(cloud, x, 12 + i * 11);
    });
    tiled(scenery.near, parallax.near, GROUND - scenery.near.height - 2);
    tiled(scenery.city, parallax.city, GROUND - scenery.city.height);
    g.drawImage(scenery.haze, 0, GROUND - scenery.haze.height);
    tiled(scenery.ground, parallax.ground, GROUND);
  }

  function drawObstacle(o) {
    const x = Math.round(o.x);
    const y = GROUND - o.alt - (o.def.h - 1);
    if (o.alt > 0) {
      // тень летающих препятствий помогает понять высоту полёта
      g.fillStyle = 'rgba(20, 12, 40, 0.35)';
      g.fillRect(x + 4, GROUND + 1, o.def.w - 8, 1);
    }
    if (o.name === 'bolt') {
      // светящийся след стрелы Sova
      g.fillStyle = 'rgba(98, 214, 255, 0.6)';
      g.fillRect(x + 22, y + 3, 10, 1);
      g.fillStyle = 'rgba(98, 214, 255, 0.3)';
      g.fillRect(x + 32, y + 3, 12, 1);
      g.fillStyle = 'rgba(98, 214, 255, 0.12)';
      g.fillRect(x + 44, y + 3, 14, 1);
    }
    if (o.def.frames) {
      g.drawImage(o.def.frames[Math.floor(tick / 5) % o.def.frames.length], x, y);
    } else {
      for (const [img, dx, dy] of o.def.parts) g.drawImage(img, x + dx, y + dy);
    }
    if (o.name === 'turret' && tick % 40 < 20) {
      g.fillStyle = '#ffd0d6';
      g.fillRect(x + 6, y + 3, 1, 1);
    }
  }

  function playerSprite(p) {
    if (p.dead) return [art.player.hurt, STAND.h];
    if (p.dashT > 0) return [art.player.run[0], STAND.h];
    if (!p.ground) {
      if (p.gliding) return [art.player.glide, STAND.h];
      return [p.vy > 0 ? art.player.jump : art.player.fall, STAND.h];
    }
    if (p.sliding) return [art.slide.frames[Math.floor(anim / 2) % 2], SLIDE.h];
    return [art.player.run[Math.floor(anim) % 4], STAND.h];
  }

  function drawPlayer() {
    const p = player;
    const [img, h] = playerSprite(p);
    const x = playerLeft(p);
    const y = GROUND - Math.round(p.y) - (h - 1);
    const shadow = Math.max(6, 16 - Math.round(p.y / 5));
    g.fillStyle = 'rgba(20, 12, 40, 0.45)';
    g.fillRect(x + 16 - (shadow >> 1), GROUND + 1, shadow, 1);
    if (p.dashT > 0 || p.dx > 1) {
      // светящийся шлейф рывка
      const ghost = ghostOf(img);
      g.globalCompositeOperation = 'lighter';
      for (let i = 3; i >= 1; i--) {
        g.globalAlpha = (p.dashT > 0 ? 0.45 : 0.2) / i;
        g.drawImage(ghost, x - i * 8, y);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    g.drawImage(img, x, y);
  }

  // Лепестки летят позади персонажей, остальные частицы — впереди.
  function drawParticles(petals) {
    for (const q of particles) {
      if (!q.petal !== !petals) continue;
      g.globalAlpha = Math.min(1, (q.life / q.max) * 1.6);
      g.fillStyle = q.color;
      if (q.len) g.fillRect(Math.round(q.x), Math.round(q.y), q.len, 1);
      else g.fillRect(Math.round(q.x), Math.round(q.y), q.size, q.size);
    }
    g.globalAlpha = 1;
  }

  function render() {
    g.save();
    if (shake > 0) g.translate(Math.round(rand(-1, 1) * shake * 0.4), Math.round(rand(-1, 1) * shake * 0.3));
    drawBackground();
    drawParticles(true);
    for (const o of obstacles) drawObstacle(o);
    drawPlayer();
    drawParticles(false);
    g.restore();
    ctx.drawImage(view, 0, 0, canvas.width, canvas.height);
  }

  /* ---------- Интерфейс ---------- */
  const pad = (n) => String(Math.min(99999, n)).padStart(5, '0');
  const hud = { score: -1, best: -1, cooldown: -1 };
  let bannerTimer = 0;

  function showBanner(text, color) {
    ui.banner.textContent = text;
    ui.banner.style.setProperty('--rank', color);
    ui.banner.classList.remove('is-visible');
    void ui.banner.offsetWidth; // перезапуск CSS-анимации
    ui.banner.classList.add('is-visible');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => ui.banner.classList.remove('is-visible'), 2200);
  }

  function setRank(index) {
    rankIndex = index;
    ui.rank.textContent = RANKS[index].name;
    root.style.setProperty('--rank', RANKS[index].color);
  }

  function updateHud() {
    const s = Math.floor(score);
    let r = 0;
    while (r + 1 < RANKS.length && s >= RANKS[r + 1].score) r++;
    const rankUp = r > rankIndex;
    if (r !== rankIndex) setRank(r);
    if (rankUp) {
      showBanner(`НОВЫЙ РАНГ · ${RANKS[r].name}`, RANKS[r].color);
      sound.rank();
    }
    if (s !== hud.score) {
      // каждые 100 очков счёт мигает, как у динозаврика
      if (hud.score >= 0 && Math.floor(s / 100) > Math.floor(hud.score / 100)) {
        ui.score.classList.remove('is-flash');
        void ui.score.offsetWidth;
        ui.score.classList.add('is-flash');
        if (!rankUp) sound.point();
      }
      hud.score = s;
      ui.score.textContent = pad(s);
    }
    if (best !== hud.best) {
      hud.best = best;
      ui.best.textContent = pad(best);
    }
    const cooldown = Math.ceil((player.dashCD / DASH_COOLDOWN) * 100);
    if (cooldown !== hud.cooldown) {
      hud.cooldown = cooldown;
      ui.ability.style.setProperty('--cooldown', cooldown / 100);
      ui.ability.classList.toggle('is-ready', cooldown === 0);
    }
  }

  function setPaused(value) {
    paused = value;
    root.dataset.paused = String(value);
    ui.pause.textContent = value ? 'Продолжить' : 'Пауза';
    ui.pause.setAttribute('aria-pressed', String(value));
    lastTime = performance.now();
  }

  function setSound(value) {
    sound.on = value;
    storage.set('jett-run:sound', value);
    ui.sound.textContent = value ? 'Звук: вкл' : 'Звук: выкл';
    ui.sound.setAttribute('aria-pressed', String(value));
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.min(stage.clientWidth / VW, Math.max(200, window.innerHeight * 0.75) / VH);
    let scale = fit * dpr; // физических пикселей экрана на один пиксель сцены
    // На обычных экранах целый масштаб даёт одинаковые чёткие пиксели,
    // а на плотных экранах телефонов дробный масштаб незаметен — там заполняем всю ширину.
    const whole = Math.floor(scale);
    if (whole >= 1 && (dpr < 2 || whole / scale > 0.94)) scale = whole;
    canvas.width = Math.round(VW * Math.max(1, scale));
    canvas.height = Math.round(VH * Math.max(1, scale));
    canvas.style.width = `${(VW * scale) / dpr}px`;
    canvas.style.height = `${(VH * scale) / dpr}px`;
    root.style.setProperty('--px', `${scale / dpr}px`);
    ctx.imageSmoothingEnabled = false;
    if (player) render(); // изменение размера очищает холст — сразу рисуем кадр заново
  }

  /* ---------- Управление ---------- */
  const JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW'];
  const DOWN_KEYS = ['ArrowDown', 'KeyS'];
  const DASH_KEYS = ['KeyE', 'ShiftLeft', 'ShiftRight'];

  function pressJump() {
    if (paused) {
      setPaused(false);
      return;
    }
    if (mode === 'demo') {
      startGame();
      return;
    }
    if (mode === 'over') {
      if (tick - deathTick > 30) startGame();
      return;
    }
    keys.jump = true;
    keys.jumpTap = true;
  }

  function releaseAll() {
    keys.jump = false;
    keys.down = false;
  }

  window.addEventListener('keydown', (e) => {
    // на кнопках пробел и Enter работают как обычно
    if (e.target instanceof HTMLButtonElement && (e.code === 'Space' || e.code === 'Enter')) return;
    if (JUMP_KEYS.includes(e.code)) {
      e.preventDefault();
      if (!e.repeat) pressJump();
    } else if (DOWN_KEYS.includes(e.code)) {
      if (mode !== 'play') return; // вне игры стрелка вниз просто листает страницу
      e.preventDefault();
      keys.down = true;
      keys.downTap = true;
    } else if (DASH_KEYS.includes(e.code)) {
      if (!e.repeat && mode === 'play') keys.dash = true;
    } else if (e.code === 'Enter') {
      if (mode !== 'play') startGame();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      if (mode !== 'over') setPaused(!paused);
    } else if (e.code === 'KeyM') {
      setSound(!sound.on);
    }
  });

  window.addEventListener('keyup', (e) => {
    if (JUMP_KEYS.includes(e.code)) keys.jump = false;
    if (DOWN_KEYS.includes(e.code)) keys.down = false;
  });

  window.addEventListener('blur', () => {
    releaseAll();
    if (mode === 'play') setPaused(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mode === 'play') setPaused(true);
  });

  // Во время игры тап по сцене — прыжок (удержание — выше и парение).
  // В демо и после поражения старт по «клику», чтобы свайп по сцене листал страницу.
  let pointerMode = null;
  let jumpPointer = null; // палец, который держит прыжок (второй палец может жать кнопки)
  root.addEventListener('pointerdown', (e) => {
    pointerMode = paused ? 'paused' : mode;
    if (pointerMode !== 'play' || e.target.closest('button')) return;
    e.preventDefault();
    jumpPointer = e.pointerId;
    keys.jump = true;
    keys.jumpTap = true;
  });
  root.addEventListener('click', (e) => {
    if (pointerMode !== 'play' && !e.target.closest('button')) pressJump();
  });
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  const releasePointer = (e) => {
    if (e.pointerId !== jumpPointer) return;
    jumpPointer = null;
    keys.jump = false;
  };
  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);

  // Кнопки для телефонов.
  document.querySelectorAll('[data-touch]').forEach((button) => {
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (mode !== 'play' || paused) {
        pressJump();
        return;
      }
      if (button.dataset.touch === 'down') {
        keys.down = true;
        keys.downTap = true;
      } else {
        keys.dash = true;
      }
    });
    const up = () => { if (button.dataset.touch === 'down') keys.down = false; };
    button.addEventListener('pointerup', up);
    button.addEventListener('pointerleave', up);
  });

  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'play') startGame();
      if (action === 'demo') {
        startDemo();
        setPaused(false);
      }
      if (action === 'pause') setPaused(!paused);
      if (action === 'sound') setSound(!sound.on);
      button.blur(); // чтобы пробел снова управлял Джетт, а не кнопкой
    });
  });

  window.addEventListener('resize', resize);

  /* ---------- Старт ---------- */
  resize();
  startDemo();
  setSound(sound.on);
  // при «уменьшении движения» в системе анимация стартует на паузе
  setPaused(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  updateHud();
  requestAnimationFrame((now) => {
    lastTime = now;
    frame(now);
  });
})();
