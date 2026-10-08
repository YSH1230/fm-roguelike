// 16x16 픽셀 캐릭터를 그리는 작은 도구. 격자에 색을 찍고, 바깥을 검은 윤곽선으로 두른 뒤
// 같은 색이 이어지는 칸은 한 줄로 합쳐 SVG rect로 내보낸다.
export const OUT = '#14100f';
const N = 16;

export function grid() { return Array.from({ length: N }, () => Array(N).fill(null)); }
export function put(g, x, y, c) { if (x >= 0 && x < N && y >= 0 && y < N) g[y][x] = c; }
// rows: [y, x1, x2] 목록
export function rows(g, list, c) { for (const [y, x1, x2] of list) for (let x = x1; x <= x2; x++) put(g, x, y, c); }

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function rgbToHex([r, g, b]) { return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`; }
export function mixHex(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A.map((v, i) => v * (1 - t) + B[i] * t)); }
export const shade = (c, t = 0.22) => mixHex(c, '#000000', t);
export const light = (c, t = 0.25) => mixHex(c, '#ffffff', t);

// 칠해진 칸의 상하좌우가 비어 있으면 그 칸을 윤곽선 색으로 채운다.
export function outline(g, color = OUT) {
  const add = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (g[y][x]) continue;
    if ((y > 0 && g[y - 1][x]) || (y < N - 1 && g[y + 1][x]) || (x > 0 && g[y][x - 1]) || (x < N - 1 && g[y][x + 1])) add.push([x, y]);
  }
  for (const [x, y] of add) g[y][x] = color;
}

export function gridToRects(g) {
  let out = '';
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const c = g[y][x];
      if (!c) { x++; continue; }
      let e = x;
      while (e + 1 < N && g[y][e + 1] === c) e++;
      out += `<rect x="${x}" y="${y}" width="${e - x + 1}" height="1" fill="${c}"/>`;
      x = e + 1;
    }
  }
  return out;
}

// 임의 크기 스프라이트(문자열 격자) → rect. 시뮬레이션의 작은 선수/공에 쓴다.
export function spriteRects(lines, palette) {
  let out = '';
  lines.forEach((line, y) => {
    let x = 0;
    while (x < line.length) {
      const ch = line[x];
      if (ch === '.' || ch === ' ') { x++; continue; }
      let e = x;
      while (e + 1 < line.length && line[e + 1] === ch) e++;
      out += `<rect x="${x}" y="${y}" width="${e - x + 1}" height="1" fill="${palette[ch]}"/>`;
      x = e + 1;
    }
  });
  return out;
}

// 문자열 격자에 1칸 여백을 두르고 바깥 윤곽선('O')을 붙인다.
export function withOutline(lines) {
  const h = lines.length, w = Math.max(...lines.map((l) => l.length));
  const g = Array.from({ length: h + 2 }, (_, y) => Array.from({ length: w + 2 }, (_, x) => (lines[y - 1]?.[x - 1] ?? '.')));
  const out = g.map((r) => r.slice());
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
    if (g[y][x] !== '.') continue;
    const n = (yy, xx) => g[yy]?.[xx] && g[yy][xx] !== '.';
    if (n(y - 1, x) || n(y + 1, x) || n(y, x - 1) || n(y, x + 1)) out[y][x] = 'O';
  }
  return out.map((r) => r.join(''));
}

const PLAYER = ['..HHH..', '.HHHHH.', '.SSSSS.', '.SKSKS.', '.SSSSS.', '.CCCCC.', 'SCCCCCS', '..PPP..', '..B.B..'];
const BALL = ['.WWW.', 'WWKWW', 'WKWKW', 'WWKWW', '.WWW.'];

export function pixelPlayerSvg({ shirt, shorts, skin, hair }) {
  const lines = withOutline(PLAYER);
  const pal = { O: OUT, H: hair, S: skin, K: '#1b1311', C: shirt, P: shorts, B: '#1b1311' };
  return `<svg viewBox="0 0 ${lines[0].length} ${lines.length}" shape-rendering="crispEdges" aria-hidden="true">${spriteRects(lines, pal)}</svg>`;
}
export function pixelBallSvg() {
  const lines = withOutline(BALL);
  return `<svg viewBox="0 0 ${lines[0].length} ${lines.length}" shape-rendering="crispEdges" aria-hidden="true">${spriteRects(lines, { O: OUT, W: '#f4f4f0', K: '#3a3a40' })}</svg>`;
}

// 128x80 픽셀 경기장: 잔디 줄무늬 + 질감 + 흰 라인 + 골대.
export function pixelPitchSvg() {
  const W = 128, H = 80;
  const A = '#3f8f45', B = '#4aa14f', LINE = '#e9f0e2', NET = '#cfd8c8';
  let r = '';
  for (let i = 0; i < 8; i++) r += `<rect x="${i * 16}" y="0" width="16" height="${H}" fill="${i % 2 ? B : A}"/>`;
  // 잔디 질감(고정 시드)
  let s = 7;
  for (let i = 0; i < 70; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const x = s % W; s = (s * 1103515245 + 12345) & 0x7fffffff; const y = s % H;
    const stripe = Math.floor(x / 16) % 2;
    r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${stripe ? A : B}" opacity=".85"/>`;
  }
  const line = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${LINE}"/>`;
  r += line(4, 4, 120, 1) + line(4, 75, 120, 1) + line(4, 4, 1, 72) + line(123, 4, 1, 72) + line(64, 4, 1, 72);
  r += line(4, 22, 18, 1) + line(4, 57, 18, 1) + line(21, 22, 1, 36) + line(4, 32, 7, 1) + line(4, 47, 7, 1) + line(10, 32, 1, 16);
  r += line(106, 22, 18, 1) + line(106, 57, 18, 1) + line(106, 22, 1, 36) + line(117, 32, 7, 1) + line(117, 47, 7, 1) + line(117, 32, 1, 16);
  for (let a = 0; a < 360; a += 4) { const x = Math.round(64 + 10 * Math.cos(a * Math.PI / 180)), y = Math.round(40 + 10 * Math.sin(a * Math.PI / 180)); r += line(x, y, 1, 1); }
  r += line(63, 39, 3, 3);
  r += `<rect x="0" y="34" width="4" height="12" fill="${NET}" opacity=".55"/><rect x="124" y="34" width="4" height="12" fill="${NET}" opacity=".55"/>`;
  return `<svg class="pxpitch__bg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
}

// 전술 탭 좌표(위가 공격, 아래가 골문)를 가로 경기장(오른쪽 공격)으로 옮긴다.
const toSim = (x, y) => ({ sx: 7 + Math.max(0, Math.min(1, (91 - y) / 82)) * 38, sy: 14 + x * 0.72 });
const SKINS = ['#f1c9a5', '#d6a275', '#b8825a', '#8d5a3b', '#e4b48d'];
const HAIRS = ['#201814', '#3a2618', '#5a3720', '#c18a3f', '#c9c4bb'];
const DEFAULT_433 = [[50, 90], [37, 70], [63, 70], [11, 63], [89, 63], [50, 52], [27, 42], [73, 42], [15, 20], [85, 20], [50, 9]];

// home: [{ coord:[x,y], slot, skin?, hair? }] (내 포메이션·내 선수). away: 같은 형식(없으면 기본 배치).
export function pixelMatchHtml(kit, { home = null, away = null } = {}) {
  const lum = (h) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)); };
  const awayShirt = lum(kit) > 150 ? '#2a3a6a' : '#e8e8e8';
  const base = (list) => (list ?? DEFAULT_433.map((coord, i) => ({ coord, slot: i === 0 ? 'GK' : '' })));
  const mk = (list, mirror, shirt, shorts, gk) => base(list).map((p, i) => {
    const { sx, sy } = toSim(p.coord[0], p.coord[1]);
    const x = mirror ? 100 - sx : sx;
    const y = mirror ? 100 - sy + (i % 2 ? 3 : -3) : sy;
    const svg = pixelPlayerSvg({ shirt: p.slot === 'GK' ? gk : shirt, shorts, skin: p.skin ?? SKINS[(i * 3 + (mirror ? 2 : 0)) % SKINS.length], hair: p.hair ?? HAIRS[(i * 2 + (mirror ? 1 : 0)) % HAIRS.length] });
    return `<span class="pxp" style="left:${x.toFixed(1)}%;top:${Math.max(8, Math.min(92, y)).toFixed(1)}%;--d:${((i * 137) % 700) / 1000}s">${svg}</span>`;
  }).join('');
  return `${pixelPitchSvg()}${mk(home, false, kit, '#f2f2f2', '#f2d24a')}${mk(away, true, awayShirt, '#23262c', '#5fb4e8')}<div class="matchsim__ball">${pixelBallSvg()}</div>`;
}
