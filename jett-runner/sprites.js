/*
 * Jett Run — пиксельная графика.
 *
 * Каждая часть спрайта описана текстом: один символ = один пиксель,
 * '.' — прозрачный пиксель, остальные символы — цвета из PALETTE.
 * Части рисуются без контура: buildLayers() сам обводит каждый слой
 * тёмной линией в 1 пиксель — так получается классический пиксель-арт.
 */
'use strict';

const PALETTE = {
  K: '#14172b', // контур
  // Джетт
  W: '#f7f9fc', // волосы
  w: '#c3cce0', // тень на волосах
  v: '#8894b4', // глубокая тень на волосах
  S: '#f6d2b8', // кожа
  s: '#d9a58a', // тень на коже
  E: '#1f1a2e', // глаза
  M: '#252a44', // маска
  m: '#3b4370', // блик на маске
  J: '#eef3f9', // куртка
  j: '#aeb9d0', // тень на куртке
  C: '#62d6ff', // фирменный голубой Джетт
  c: '#2d7fe0', // синий
  N: '#303a60', // штаны
  n: '#1f2540', // дальняя нога
  G: '#2a2e42', // перчатки
  H: '#e9eef5', // кроссовки
  h: '#7c88a6', // подошва
  // Ящики
  L: '#f2c983',
  T: '#d69d52',
  t: '#9c6232',
  // Турель Killjoy
  Y: '#ffd84a',
  y: '#d4a21d',
  R: '#ff4655',
  r: '#9c1f2e',
  g: '#5c6480',
  q: '#8a93b0',
  // Бум-бот Raze
  O: '#ff8a3d',
  o: '#c95a1e',
  d: '#3a3f55',
  // Дрон Sova
  B: '#79a7e8',
  b: '#44649e',
  P: '#dff6ff',
  // Стена Sage
  I: '#e8fdff',
  i: '#9fe7f5',
  U: '#4fb9d6',
  u: '#2f86a8',
};

/* ---------- Пиксельная сетка ---------- */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function makeGrid(w, h) {
  return { w, h, px: new Array(w * h).fill('') };
}

function put(g, x, y, ch) {
  if (!ch || ch === '.' || x < 0 || y < 0 || x >= g.w || y >= g.h) return;
  g.px[y * g.w + x] = ch;
}

function stamp(g, rows, ox, oy) {
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) put(g, ox + x, oy + y, rows[y][x]);
  }
}

// Толстая линия (Брезенхем + квадратная «кисть»).
function thickLine(g, x0, y0, x1, y1, ch, size = 2) {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    for (let by = 0; by < size; by++) {
      for (let bx = 0; bx < size; bx++) put(g, x0 + bx, y0 + by, ch);
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// Обводка: каждый пустой пиксель рядом с закрашенным становится контуром.
function outline(g, ch = 'K') {
  const src = g.px.slice();
  const filled = (x, y) => x >= 0 && y >= 0 && x < g.w && y < g.h && src[y * g.w + x] !== '';
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (src[y * g.w + x]) continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
        g.px[y * g.w + x] = ch;
      }
    }
  }
}

// Чем затемнять цвет, если контур слоя ложится на уже нарисованную часть.
const SHADE = {
  W: 'w', w: 'v', S: 's', J: 'j', j: 'v', C: 'c', c: 'n', N: 'n', H: 'h', m: 'M',
};

// Слои рисуются по очереди, каждый со своим контуром поверх предыдущих.
// Снаружи контур чёрный, а внутри силуэта — просто более тёмный оттенок.
function buildLayers(w, h, layers) {
  const out = makeGrid(w, h);
  for (const draw of layers) {
    const layer = makeGrid(w, h);
    draw(layer);
    outline(layer, '#');
    layer.px.forEach((ch, i) => {
      if (!ch) return;
      if (ch !== '#') out.px[i] = ch;
      else out.px[i] = out.px[i] ? (SHADE[out.px[i]] || 'K') : 'K';
    });
  }
  return out;
}

function gridToCanvas(g) {
  const canvas = makeCanvas(g.w, g.h);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(g.w, g.h);
  g.px.forEach((ch, i) => {
    if (!ch) return;
    const hex = PALETTE[ch];
    img.data[i * 4] = parseInt(hex.slice(1, 3), 16);
    img.data[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
    img.data[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
    img.data[i * 4 + 3] = 255;
  });
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function spriteFromRows(rows) {
  const w = Math.max(...rows.map((r) => r.length)) + 2;
  const g = makeGrid(w, rows.length + 2);
  stamp(g, rows, 1, 1);
  outline(g);
  return gridToCanvas(g);
}

// Одноцветная копия спрайта — для шлейфа во время рывка.
function tint(canvas, color) {
  const c = makeCanvas(canvas.width, canvas.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/* ---------- Джетт ---------- */

const HEAD = [
  '.W.WWWW....',
  '.WWWWWWWW..',
  'WWWWWWWWWW.',
  'WWwWWWWWWWW',
  'WwWWWWWWWWW',
  'wWWWWWWwWwW',
  'wWWWWSSSSSS',
  'vwWWsSSSEPS',
  '.vwWsSSSEES',
  '..vwsMMMMMM',
  '...v.MMMMmM',
  '......MMMM.',
];

// Та же голова, но с зажмуренным глазом — для проигрыша.
const HEAD_HURT = HEAD.map((row, i) => {
  if (i === 7) return 'vwWWsSSSSSS';
  if (i === 8) return '.vwWsSSEEES';
  return row;
});

const TORSO = [
  '.cc.......',
  'cCCccCc...',
  '.cCJJJJJJ.',
  '..jJJJJJJ.',
  '..jJJJJJJ.',
  '..jjJJJJc.',
  '...jJJJcc.',
  '...cCCCc..',
  '...NNNNN..',
];

// Пряди волос, развевающиеся на ветру.
const HAIR_TAILS = [
  ['...wWW', '.wWWWW', 'WWWww.', '..v...'],
  ['....WW', '..WWWW', 'wWWWw.', 'W.vv..'],
  ['...WWW', 'wWWWWW', '..wwWw', '....v.'],
];

const PLAYER_W = 28;
const PLAYER_H = 33;

function drawLimb(g, a, b, c, upper, lower) {
  thickLine(g, a[0], a[1], b[0], b[1], upper);
  thickLine(g, b[0], b[1], c[0], c[1], lower);
}

function drawShoe(g, x, y, kind) {
  if (kind === 'toe') {
    stamp(g, ['.H', 'HH', 'hh'], x, y + 1);
  } else if (kind === 'tuck') {
    stamp(g, ['HH', 'Hh'], x - 1, y + 1);
  } else {
    stamp(g, ['HHH', 'hhhh'], x, y + 1);
  }
}

function drawHand(g, x, y) {
  stamp(g, ['GG', 'GG'], x, y);
}

/*
 * Поза описывается координатами суставов:
 * arm: [плечо, локоть, кисть], leg: [бедро, колено, лодыжка, тип ботинка].
 */
function buildPose(pose) {
  const dy = pose.bob || 0;
  const shift = (p) => [p[0], p[1] + dy];
  const layers = [];
  layers.push((g) => {
    const [a, b, c] = pose.farArm.map(shift);
    drawLimb(g, a, b, c, 'j', 'j');
    drawHand(g, c[0], c[1]);
  });
  layers.push((g) => {
    const [a, b, c, shoe] = pose.farLeg;
    drawLimb(g, shift(a), b, c, 'n', 'n');
    drawShoe(g, c[0], c[1], shoe);
  });
  layers.push((g) => {
    const [a, b, c, shoe] = pose.nearLeg;
    drawLimb(g, shift(a), b, c, 'N', 'N');
    drawShoe(g, c[0], c[1], shoe);
  });
  layers.push((g) => stamp(g, TORSO, 10, 11 + dy));
  layers.push((g) => stamp(g, HAIR_TAILS[pose.tail || 0], 6, 4 + dy));
  layers.push((g) => stamp(g, pose.hurt ? HEAD_HURT : HEAD, 11, 1 + dy));
  layers.push((g) => {
    const [a, b, c] = pose.nearArm.map(shift);
    drawLimb(g, a, b, c, 'J', 'J');
    drawHand(g, c[0], c[1]);
  });
  return gridToCanvas(buildLayers(PLAYER_W, PLAYER_H, layers));
}

const POSES = {
  run: [
    {
      tail: 0,
      farArm: [[14, 13], [17, 16], [20, 14]],
      farLeg: [[14, 20], [11, 24], [8, 27], 'toe'],
      nearLeg: [[15, 20], [18, 24], [20, 29], 'flat'],
      nearArm: [[15, 13], [12, 16], [9, 15]],
    },
    {
      tail: 1, bob: -1,
      farArm: [[14, 13], [13, 17], [15, 18]],
      farLeg: [[14, 20], [16, 22], [12, 25], 'tuck'],
      nearLeg: [[15, 20], [16, 24], [15, 29], 'flat'],
      nearArm: [[15, 13], [15, 17], [18, 17]],
    },
    {
      tail: 2,
      farArm: [[14, 13], [11, 16], [8, 15]],
      farLeg: [[14, 20], [17, 24], [19, 29], 'flat'],
      nearLeg: [[15, 20], [12, 24], [9, 27], 'toe'],
      nearArm: [[15, 13], [18, 16], [21, 14]],
    },
    {
      tail: 1, bob: -1,
      farArm: [[14, 13], [15, 17], [18, 17]],
      farLeg: [[14, 20], [15, 24], [14, 29], 'flat'],
      nearLeg: [[15, 20], [17, 22], [13, 25], 'tuck'],
      nearArm: [[15, 13], [13, 17], [15, 18]],
    },
  ],
  jump: {
    tail: 2,
    farArm: [[14, 13], [11, 12], [8, 10]],
    farLeg: [[14, 20], [13, 25], [10, 28], 'toe'],
    nearLeg: [[15, 20], [19, 22], [17, 26], 'tuck'],
    nearArm: [[15, 13], [18, 15], [21, 13]],
  },
  fall: {
    tail: 0,
    farArm: [[14, 13], [11, 15], [9, 14]],
    farLeg: [[14, 20], [12, 24], [11, 28], 'toe'],
    nearLeg: [[15, 20], [17, 24], [17, 28], 'flat'],
    nearArm: [[15, 13], [18, 14], [21, 13]],
  },
  glide: {
    tail: 1,
    farArm: [[14, 14], [10, 15], [6, 14]],
    farLeg: [[14, 20], [13, 25], [11, 28], 'toe'],
    nearLeg: [[15, 20], [15, 25], [14, 29], 'toe'],
    nearArm: [[15, 14], [19, 15], [23, 14]],
  },
  hurt: {
    tail: 0, hurt: true,
    farArm: [[14, 13], [11, 14], [8, 13]],
    farLeg: [[14, 20], [15, 25], [16, 29], 'flat'],
    nearLeg: [[15, 20], [19, 22], [22, 23], 'tuck'],
    nearArm: [[15, 13], [12, 11], [9, 9]],
  },
};

/* Подкат/низкий бег: корпус почти горизонтальный, голова впереди. */
const TORSO_LOW = [
  '.....cCCc.',
  'jJJJJJJCCc',
  'JJJJJJJJJJ',
  'jjJJJJJJJ.',
  'NcCCc.....',
  'NNNN......',
];

const SLIDE_W = 36;
const SLIDE_H = 22;

function buildSlide(frame) {
  const near = frame === 0
    ? [[14, 15], [18, 16], [17, 18], 'flat']
    : [[14, 15], [11, 17], [8, 18], 'toe'];
  const far = frame === 0
    ? [[13, 15], [10, 17], [7, 18], 'toe']
    : [[13, 15], [17, 16], [16, 18], 'flat'];
  const layers = [
    (g) => { drawLimb(g, [19, 11], [14, 10], [10, 9], 'j', 'j'); drawHand(g, 9, 9); },
    (g) => { drawLimb(g, far[0], far[1], far[2], 'n', 'n'); drawShoe(g, far[2][0], far[2][1], far[3]); },
    (g) => { drawLimb(g, near[0], near[1], near[2], 'N', 'N'); drawShoe(g, near[2][0], near[2][1], near[3]); },
    (g) => stamp(g, TORSO_LOW, 12, 10),
    (g) => stamp(g, HAIR_TAILS[frame ? 2 : 0], 17, 5),
    (g) => stamp(g, HEAD, 22, 3),
    (g) => { drawLimb(g, [20, 12], [15, 12], [11, 11], 'J', 'J'); drawHand(g, 10, 11); },
  ];
  return gridToCanvas(buildLayers(SLIDE_W, SLIDE_H, layers));
}

/* ---------- Препятствия ---------- */

const CRATE = [
  'LLLLLLLLLLLLLL',
  'LTTTTTTTTTTTTt',
  'LTtTTTTTTTTtTt',
  'LTTtTTTTTTtTTt',
  'LTTTtTTTTtTTTt',
  'LTTTTtTTtTTTTt',
  'LTTTTTttTTTTTt',
  'LTTTTTttTTTTTt',
  'LTTTTtTTtTTTTt',
  'LTTTtTTTTtTTTt',
  'LTTtTTTTTTtTTt',
  'LTtTTTTTTTTtTt',
  'LTTTTTTTTTTTTt',
  'tttttttttttttt',
];

const TURRET = [
  '...yYYYYy...',
  '..yYYYYYYy..',
  '.yYYPRRPYYy.',
  '.yYYPRrPYYy.',
  '..yYYYYYYy..',
  '...yyyyyy...',
  '.....qq.....',
  '....qggq....',
  '....qggq....',
  '...gg..gg...',
  '..gg....gg..',
  '.gg......gg.',
  'gg........gg',
];

const BOOMBOT = [
  [
    '.....OOOOOO.....',
    '...OOOOOOOOOO...',
    '..OCCCOOOOOOOO..',
    '.OCCPCOOoOOOOOO.',
    '.OCCCCOOoOOOOOO.',
    '..OOOOOOOOOOOO..',
    '..dddddddddddd..',
    '.dqdqdqdqdqdqdd.',
    '..dddddddddddd..',
  ],
  [
    '.....OOOOOO.....',
    '...OOOOOOOOOO...',
    '..OCCCOOOOOOOO..',
    '.OCCPCOOoOOOOOO.',
    '.OCCCCOOoOOOOOO.',
    '..OOOOOOOOOOOO..',
    '..dddddddddddd..',
    '.ddqdqdqdqdqdqd.',
    '..dddddddddddd..',
  ],
];

const DRONE = [
  [
    'qqqqq......qqqqq',
    '...q........q...',
    '...bbbbbbbbbb...',
    '.bbBBBBBBBBBBbb.',
    'bBPPBBBBBBBBBBBb',
    'bPCCPBBBBBBBBBBb',
    'bPCCPBBBBBBBBBBb',
    'bBPPBBBBBBBBBBBb',
    '.bbBBBBBBBBBBbb.',
    '...bbYbbbbYbb...',
  ],
  [
    '..qqqqq..qqqqq..',
    '...q........q...',
    '...bbbbbbbbbb...',
    '.bbBBBBBBBBBBbb.',
    'bBPPBBBBBBBBBBBb',
    'bPCCPBBBBBBBBBBb',
    'bPCCPBBBBBBBBBBb',
    'bBPPBBBBBBBBBBBb',
    '.bbBBBBBBBBBBbb.',
    '...bbbbYbbYbb...',
  ],
];

const BOLT = [
  '..C...............cc.',
  '.CCC............cc...',
  'CCPPwwwwwwwwwwwwwwwww',
  '.CCC............cc...',
  '..C...............cc.',
];

// Детерминированный генератор случайных чисел: фон всегда одинаковый.
function makeRandom(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Стена Sage — ледяные кристаллы, генерируются процедурно.
function buildWall(w, h, seed) {
  const g = makeGrid(w, h);
  const rnd = makeRandom(seed);
  for (let x = 0; x < w; x++) {
    const top = Math.floor(rnd() * 5) + (x % 3 === 1 ? 0 : 2);
    for (let y = top; y < h; y++) {
      const facet = (x + Math.floor(y / 7)) % 4;
      put(g, x, y, ['I', 'i', 'U', 'i'][facet]);
    }
    put(g, x, top, 'I');
  }
  for (let i = 0; i < 6; i++) {
    const x = 1 + Math.floor(rnd() * (w - 2));
    const y = 6 + Math.floor(rnd() * (h - 10));
    put(g, x, y, 'I');
    put(g, x, y + 1, 'I');
  }
  for (let x = 0; x < w; x++) put(g, x, h - 1, 'u');
  const pad = makeGrid(w + 2, h + 2);
  g.px.forEach((ch, i) => put(pad, (i % w) + 1, Math.floor(i / w) + 1, ch));
  outline(pad);
  return gridToCanvas(pad);
}

/* ---------- Фон: закат над городом ---------- */

const SKY_COLORS = [
  '#0f1923', '#141f38', '#1d2447', '#2a2955', '#3e2d62', '#583267',
  '#7a3a6c', '#9d436f', '#c05370', '#de6c70', '#f08c73', '#fbb07c',
];

// Небо из полос с «пиксельным» дизерингом на стыках.
function buildSky(w, h) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const n = SKY_COLORS.length;
  for (let i = 0; i < n; i++) {
    const y0 = Math.round((i * h) / n);
    const y1 = Math.round(((i + 1) * h) / n);
    ctx.fillStyle = SKY_COLORS[i];
    ctx.fillRect(0, y0, w, y1 - y0);
    if (i + 1 < n) {
      ctx.fillStyle = SKY_COLORS[i + 1];
      for (let x = 0; x < w; x += 2) ctx.fillRect(x + ((y1 - 1) % 2), y1 - 1, 1, 1);
      for (let x = 0; x < w; x += 4) ctx.fillRect(x + ((y1 - 2) % 4), y1 - 2, 1, 1);
    }
  }
  return c;
}

function buildSun(r) {
  const size = r * 2 + 9;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const mid = Math.floor(size / 2);
  for (let y = -r - 4; y <= r + 4; y++) {
    for (let x = -r - 4; x <= r + 4; x++) {
      const d = Math.sqrt(x * x + y * y);
      let color = null;
      if (d <= r) {
        color = d < r * 0.55 ? '#fff4d6' : d < r * 0.85 ? '#ffe2a6' : '#ffc98c';
        // горизонтальные прорези снизу — как на ретро-закатах
        if (y > r * 0.3 && (y % 4 === 0 || (y > r * 0.65 && y % 4 === 1))) color = null;
      } else if (d <= r + 3 && (x + y) % 2 === 0) {
        color = '#ff9f80';
      }
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(mid + x, mid + y, 1, 1);
      }
    }
  }
  return c;
}

// Горный хребет из суммы синусов с целыми частотами — бесшовно повторяется.
function buildRidge(w, h, seed, waves, colors) {
  const rnd = makeRandom(seed);
  const phases = waves.map(() => rnd() * Math.PI * 2);
  const base = h - 1 - waves.reduce((sum, [, amp]) => sum + amp, 0);
  const height = (x) => {
    const t = (x / w) * Math.PI * 2;
    return waves.reduce((sum, [freq, amp], i) => sum + Math.sin(t * freq + phases[i]) * amp, base);
  };
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  for (let x = 0; x < w; x++) {
    const top = Math.round(h - height(x));
    const lit = height((x + 1) % w) < height(x); // склон, освещённый закатом
    ctx.fillStyle = colors.body;
    ctx.fillRect(x, top, 1, h - top);
    ctx.fillStyle = lit ? colors.light : colors.rim;
    ctx.fillRect(x, top, 1, lit ? 3 : 1);
    if (colors.snow && h - top > colors.snowLine) {
      ctx.fillStyle = colors.snow;
      ctx.fillRect(x, top, 1, lit ? 2 : 1);
    }
  }
  return c;
}

// Силуэты города: дома с огнями и пагоды (как на картах Haven и Split).
function buildCity(w, h, seed) {
  const rnd = makeRandom(seed);
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const rect = (x, y, rw, rh, color) => {
    ctx.fillStyle = color;
    for (const shift of [-w, 0, w]) ctx.fillRect(x + shift, y, rw, rh);
  };
  const lights = ['#ffcf6e', '#ffb36b', '#ff8fb1', '#8fe3ff'];

  const block = (x, bw) => {
    const bh = 12 + Math.floor(rnd() * 30);
    const top = h - bh;
    rect(x, top, bw, bh, '#1b1633');
    rect(x, top, 1, bh, '#2a2248');
    if (rnd() < 0.35) rect(x + 2 + Math.floor(rnd() * (bw - 4)), top - 5, 1, 5, '#1b1633');
    if (rnd() < 0.25) rect(x + 2, top - 3, 5, 3, '#1b1633');
    for (let wy = top + 3; wy < h - 3; wy += 4) {
      for (let wx = x + 2; wx < x + bw - 2; wx += 3) {
        if (rnd() < 0.16) rect(wx, wy, 1, 2, lights[Math.floor(rnd() * lights.length)]);
      }
    }
    if (rnd() < 0.15) rect(x + bw - 3, top + 4, 1, 5 + Math.floor(rnd() * 5), rnd() < 0.6 ? '#e8506a' : '#4aa8cf');
  };

  const pagoda = (x, bw) => {
    const tiers = 3 + Math.floor(rnd() * 2);
    let y = h;
    let width = bw - 6;
    for (let i = 0; i < tiers; i++) {
      const cx = x + Math.floor((bw - width) / 2);
      rect(cx, y - 5, width, 5, '#201a3c');
      rect(cx + 2, y - 3, 1, 2, '#ff4655');
      rect(cx + width - 3, y - 3, 1, 2, '#ffcf6e');
      y -= 5;
      rect(cx - 3, y - 1, width + 6, 2, '#15102a');
      rect(cx - 3, y - 2, 1, 1, '#15102a');
      rect(cx + width + 2, y - 2, 1, 1, '#15102a');
      y -= 1;
      width = Math.max(4, width - 4);
    }
    rect(x + Math.floor(bw / 2), y - 6, 1, 6, '#15102a');
  };

  let x = 0;
  while (x < w) {
    let bw = 12 + Math.floor(rnd() * 20);
    if (w - x - bw < 12) bw = w - x;
    if (bw >= 18 && rnd() < 0.25) pagoda(x, bw);
    else block(x, bw);
    x += bw;
  }
  return c;
}

function buildCloud(seed) {
  const rnd = makeRandom(seed);
  const w = 24 + Math.floor(rnd() * 14);
  const h = 9;
  const g = makeGrid(w, h);
  const puffs = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < puffs; i++) {
    const cx = 4 + ((w - 8) * i) / (puffs - 1);
    const r = 2.5 + rnd() * 2.5;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - (h - 2 - r * 0.6);
        if (dx * dx + dy * dy <= r * r && y < h - 1) put(g, x, y, 'c');
      }
    }
  }
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!g.px[y * w + x]) continue;
      const above = y > 0 && g.px[(y - 1) * w + x];
      const below = y < h - 1 && g.px[(y + 1) * w + x];
      ctx.fillStyle = !above ? '#f3b9c9' : !below ? '#8c5d93' : '#c48ab3';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

// Дымка у основания города: ступенчатая, как и небо. Отделяет персонажей от тёмных домов.
function buildHaze(w, h) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const y0 = Math.round((i * h) / steps);
    const y1 = Math.round(((i + 1) * h) / steps);
    ctx.fillStyle = `rgba(240, 140, 115, ${(0.07 * (i + 1)).toFixed(2)})`;
    ctx.fillRect(0, y0, w, y1 - y0);
  }
  return c;
}

// Плитка каменной дорожки, по которой бежит Джетт.
function buildGroundTile(w, h) {
  const rnd = makeRandom(99);
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3b3152';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f1b5a5';
  ctx.fillRect(0, 0, w, 1);
  ctx.fillStyle = '#8d6f9e';
  ctx.fillRect(0, 1, w, 1);
  const seamY = 8;
  ctx.fillStyle = '#2b2440';
  ctx.fillRect(0, seamY, w, 1);
  for (const [x, y0, y1] of [[0, 2, seamY], [w / 2, 2, seamY], [w / 4, seamY + 1, h], [(3 * w) / 4, seamY + 1, h]]) {
    ctx.fillStyle = '#2b2440';
    ctx.fillRect(x, y0, 1, y1 - y0);
    ctx.fillStyle = '#4a3f66';
    ctx.fillRect(x + 1, y0, 1, y1 - y0);
  }
  ctx.fillStyle = '#4a3f66';
  ctx.fillRect(0, 2, w, 1);
  ctx.fillRect(0, seamY + 1, w, 1);
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = rnd() < 0.5 ? '#2f2846' : '#463c61';
    ctx.fillRect(Math.floor(rnd() * w), 3 + Math.floor(rnd() * (h - 4)), 1, 1);
  }
  return c;
}

function buildScenery(width, groundY, height) {
  const rnd = makeRandom(2024);
  const stars = [];
  for (let i = 0; i < 46; i++) {
    stars.push({
      x: Math.floor(rnd() * width),
      y: Math.floor(rnd() * 44),
      phase: rnd() * Math.PI * 2,
      bright: rnd() < 0.25,
    });
  }
  return {
    sky: buildSky(width, groundY),
    sun: buildSun(17),
    stars,
    far: buildRidge(width * 2, 58, 11, [[2, 9], [3, 7], [7, 4], [13, 2]], {
      body: '#4a3470', rim: '#5b4282', light: '#8a5a8e', snow: '#e7b7c6', snowLine: 44,
    }),
    near: buildRidge(width * 2, 40, 5, [[3, 6], [5, 5], [11, 3], [19, 1]], {
      body: '#2c2350', rim: '#3a2d63', light: '#5d3f73',
    }),
    city: buildCity(width * 2, 52, 3),
    haze: buildHaze(width, 30),
    clouds: [buildCloud(3), buildCloud(8), buildCloud(21)],
    ground: buildGroundTile(32, height - groundY),
  };
}

/* ---------- Сборка всех спрайтов ---------- */

function buildArt() {
  return {
    player: {
      h: PLAYER_H,
      run: POSES.run.map(buildPose),
      jump: buildPose(POSES.jump),
      fall: buildPose(POSES.fall),
      glide: buildPose(POSES.glide),
      hurt: buildPose(POSES.hurt),
    },
    slide: {
      h: SLIDE_H,
      frames: [buildSlide(0), buildSlide(1)],
    },
    crate: spriteFromRows(CRATE),
    turret: spriteFromRows(TURRET),
    boombot: BOOMBOT.map((f) => spriteFromRows(f)),
    drone: DRONE.map((f) => spriteFromRows(f)),
    bolt: spriteFromRows(BOLT),
    wall: buildWall(12, 26, 7),
  };
}
