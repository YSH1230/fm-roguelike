// 도트 아이콘과 도트 구단 엠블럼. 글자 격자(문자열)로 그리고 정수 배율로만 키운다.
// 아이콘은 currentColor로 칠해서 글자색을 그대로 따라간다.

const ICONS = {
  // 12x12 (하단 탭 등)
  draft: ['............', '..#####.....', '.##...##....', '.#.....#....', '.#.....#....', '.#.....#....', '.##...##....', '..#####.#...', '.......###..', '.........##.', '..........#.', '............'],
  tactics: ['############', '#....##....#', '#....##....#', '#...####...#', '#..##..##..#', '#..#....#..#', '#..#....#..#', '#..##..##..#', '#...####...#', '#....##....#', '#....##....#', '############'],
  squad: ['............', '..##....##..', '.####..####.', '.####..####.', '..##....##..', '............', '.######.####', '########.###', '########.###', '############', '............', '............'],
  staff: ['............', '....####....', '...######...', '...######...', '...######...', '....####....', '............', '..########..', '.##########.', '.##########.', '.##########.', '............'],
  // 8x8 (글자 옆 작은 아이콘)
  coin: ['..####..', '.#....#.', '#..##..#', '#.####.#', '#.####.#', '#..##..#', '.#....#.', '..####..'],
  clock: ['..####..', '.#....#.', '#..#...#', '#..#...#', '#..###.#', '#......#', '.#....#.', '..####..'],
  back: ['....##..', '...##...', '..##....', '.##.....', '..##....', '...##...', '....##..', '........'],
  grow: ['......##', '.....###', '....#.##', '#..#....', '##.#....', '.###....', '..#.....', '........'],
  heal: ['..####..', '..####..', '########', '########', '########', '########', '..####..', '..####..'],
  next: ['...##...', '....##..', '#######.', '########', '#######.', '....##..', '...##...', '........'],
};

export function pixelIcon(name, { scale = 2, label = '' } = {}) {
  const rows = ICONS[name];
  if (!rows) return '';
  const h = rows.length;
  const w = rows[0].length;
  const rects = rows.map((r, y) => [...r].map((c, x) => (c === '#' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : '')).join('')).join('');
  return `<svg class="pxicon" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}" fill="currentColor" shape-rendering="crispEdges" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} focusable="false">${rects}</svg>`;
}
export const hasPixelIcon = (name) => name in ICONS;

// 3x5 도트 글자(엠블럼 이니셜)
const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
};

function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const at = (seed, shift, list) => list[(seed >>> shift) % list.length];
const initialsOf = (name) => {
  const words = (name ?? '??').trim().split(/\s+/);
  const raw = words.length >= 2 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return raw.toUpperCase().replace(/[^A-Z]/g, 'X').padEnd(2, 'X');
};
function mix(a, b, t) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const f = (s) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => f(s).toString(16).padStart(2, '0')).join('')}`;
}

// 16x16 모양 마스크
const MASKS = {
  shield: (x, y) => (y >= 1 && y <= 8 && x >= 2 && x <= 13) || (y >= 9 && y <= 14 && x >= 2 + (y - 8) && x <= 13 - (y - 8)),
  banner: (x, y) => x >= 2 && x <= 13 && ((y >= 1 && y <= 11) || (y === 12 && x !== 7 && x !== 8) || (y === 13 && (x <= 6 || x >= 9) && x !== 2 && x !== 13) || (y === 14 && (x <= 5 || x >= 10) && x > 3 && x < 12)),
  roundel: (x, y) => (x - 7.5) ** 2 + (y - 7.5) ** 2 <= 7.4 ** 2,
};

let crestCount = 0;
export function pixelCrest(club, { scale = 3, label = true } = {}) {
  const seed = hash(club.id ?? club.name ?? 'x');
  const shape = at(seed, 4, Object.keys(MASKS));
  const device = at(seed, 10, ['band', 'top', 'star', 'ring']);
  const kit = club.kit ?? '#2c4239';
  const accent = at(seed, 16, ['#f4f1e8', '#ffc400', '#ffffff']);
  const dark = mix(kit, '#000000', 0.55);
  const lightKit = mix(kit, '#ffffff', 0.22);
  const N = 16;
  const g = Array.from({ length: N }, () => Array(N).fill(null));
  const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N && MASKS[shape](x, y);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (inside(x, y)) g[y][x] = x <= 3 && y <= 8 ? lightKit : kit;
  const put = (x, y, c) => { if (inside(x, y)) g[y][x] = c; };
  if (device === 'band') for (let x = 0; x < N; x++) { put(x, 12, accent); put(x, 13, accent); }
  if (device === 'top') for (let x = 0; x < N; x++) { put(x, 2, accent); put(x, 3, accent); }
  if (device === 'star') for (const [x, y] of [[7, 2], [8, 2], [6, 3], [7, 3], [8, 3], [9, 3], [7, 4], [8, 4]]) put(x, y, accent);
  if (device === 'ring') for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (inside(x, y) && !(inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))) g[y][x] = accent;
  // 이니셜(그림자 한 칸 아래)
  const [a, b] = initialsOf(club.name);
  const text = (ox, oy, c) => [a, b].forEach((ch, i) => FONT[ch].forEach((row, ry) => [...row].forEach((v, rx) => { if (v === '#') put(ox + i * 4 + rx, oy + ry, c); })));
  text(4, 7, dark);
  text(4, 6, '#ffffff');
  // 바깥 윤곽선
  const out = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!g[y][x] && ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx]))) out.push([x, y]);
  out.forEach(([x, y]) => { g[y][x] = '#14100f'; });
  let rects = '';
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const c = g[y][x];
      if (!c) { x++; continue; }
      let e = x;
      while (e + 1 < N && g[y][e + 1] === c) e++;
      rects += `<rect x="${x}" y="${y}" width="${e - x + 1}" height="1" fill="${c}"/>`;
      x = e + 1;
    }
  }
  crestCount += 1;
  return `<svg class="crest crest--px" width="${N * scale}" height="${N * scale}" viewBox="0 0 16 16" shape-rendering="crispEdges" ${label ? `role="img" aria-label="${String(club.name ?? '').replace(/"/g, '')} 엠블럼"` : 'aria-hidden="true"'} focusable="false" data-n="${crestCount}">${rects}</svg>`;
}
