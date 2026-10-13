// 선수 초상화 v3: 24x24 도트. 16x16보다 눈·코·입·수염·머리를 크게 그릴 수 있어서
// 얼굴형, 눈, 눈썹, 코, 입, 수염, 머리 모양, 장신구를 id로 시드해 조합한다(같은 선수는 항상 같은 얼굴).
import { mixHex, shade, light } from './pixel.mjs';

const N = 24;
const SKIN = {
  africa: ['#8d5a3b', '#7a4a2e', '#9d6b49', '#6e4328'],
  southAmerica: ['#c08a5c', '#a9724a', '#d09b6d', '#b37b52'],
  asiaOceania: ['#e8b98a', '#d6a275', '#f0c79c', '#dcae80'],
  europe: ['#f1c9a5', '#e4b48d', '#f8d6b7', '#ecbf9a'],
  northCentralAmerica: ['#d09b6d', '#b8825a', '#e0ac80', '#c48c60'],
};
const HAIR_COLORS = ['#201814', '#3a2618', '#5a3720', '#8a5a2e', '#c18a3f', '#d8b25a', '#7a2f1d', '#c9c4bb'];
const LIP = '#8a3b36';
const INK = '#1b1311';
const OUT = '#14100f';

function hash(text, salt = '') {
  let h = 0x811c9dc5;
  const s = text + salt;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const grid = () => Array.from({ length: N }, () => Array(N).fill(null));
const put = (g, x, y, c) => { if (x >= 0 && x < N && y >= 0 && y < N) g[y][x] = c; };
const rect = (g, x1, y1, x2, y2, c) => { for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) put(g, x, y, c); };
const fillIf = (g, test, c) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (test(x, y)) g[y][x] = c; };

const FACES = [
  { rx: 5.8, ry: 6.3, cy: 10.6 }, // 둥근 계란형
  { rx: 6.5, ry: 5.7, cy: 10.9 }, // 넓은 얼굴
  { rx: 5.3, ry: 6.8, cy: 10.4 }, // 갸름한 얼굴
];
export const HAIR_STYLES = ['crop', 'fade', 'afro', 'curls', 'long', 'topknot', 'bald', 'mohawk', 'cornrows', 'ponytail', 'buzz', 'wavy'];

export function drawPortrait24(card, kit) {
  const s1 = hash(card.id ?? card.name ?? 'x');
  const s2 = hash(card.id ?? card.name ?? 'x', 'b');
  const pick = (s, shift, n) => (s >>> shift) % n;
  const skinList = SKIN[card.continentTag] ?? SKIN.europe;
  const skin = skinList[pick(s1, 3, skinList.length)];
  const skinShade = shade(skin, 0.16);
  const skinLight = light(skin, 0.18);
  const old = (card.age ?? 25) >= 33;
  let hairColor = HAIR_COLORS[pick(s1, 12, HAIR_COLORS.length)];
  if (old) hairColor = mixHex(hairColor, '#c9c4bb', 0.6);
  const hairDark = shade(hairColor, 0.25);
  const hairLight = light(hairColor, 0.3);
  const face = FACES[pick(s1, 0, 3)];
  const eyeType = pick(s2, 0, 3);
  const browType = pick(s2, 3, 4);
  const noseType = pick(s2, 6, 3);
  const mouthType = pick(s2, 9, 4);
  const style = HAIR_STYLES[pick(s2, 12, HAIR_STYLES.length)];
  const facial = (card.age ?? 25) < 20 ? 0 : [0, 0, 0, 1, 2, 3, 4][pick(s2, 16, 7)]; // 0 없음 1 까칠 2 콧수염 3 턱수염 4 염소수염
  const accessory = [0, 1, 2, 3, 4, 4, 4, 4][pick(s2, 20, 8)]; // 0 머리띠 1 귀걸이 2 흉터 3 주근깨
  const shirtPattern = pick(s1, 24, 4);
  const g = grid();

  const cx = 11.5;
  const inHead = (x, y) => ((x - cx) / face.rx) ** 2 + ((y - face.cy) / face.ry) ** 2 <= 1;
  const headRow = (y) => { let a = null, b = null; for (let x = 0; x < N; x++) if (inHead(x, y)) { if (a === null) a = x; b = x; } return [a, b]; };

  // 긴 머리는 몸 뒤에 먼저 깐다
  if (style === 'long') { rect(g, 4, 5, 19, 20, hairColor); rect(g, 4, 18, 19, 23, hairColor); }
  if (style === 'ponytail') { rect(g, 18, 8, 20, 14, hairColor); rect(g, 19, 14, 20, 16, hairDark); }

  // 몸통(유니폼)
  const shirt = kit;
  const shirtDark = shade(shirt, 0.2);
  const shirtLight = light(shirt, 0.28);
  rect(g, 10, 16, 13, 18, skinShade); // 목
  for (let y = 18; y < N; y++) {
    const half = y === 18 ? 5 : y === 19 ? 8 : 10;
    for (let x = Math.round(cx - half + 0.5); x <= Math.round(cx + half - 0.5); x++) put(g, x, y, y >= 22 ? shirtDark : shirt);
  }
  if (shirtPattern === 1) rect(g, 11, 19, 12, 23, shirtLight);
  if (shirtPattern === 2) { rect(g, 3, 21, 20, 21, shirtLight); }
  if (shirtPattern === 3) for (let i = 0; i < 6; i++) { put(g, 5 + i * 2, 19 + Math.floor(i / 1.5), shirtLight); put(g, 6 + i * 2, 19 + Math.floor(i / 1.5), shirtLight); }
  // 목 카라(브이넥)
  for (const [x, y] of [[9, 18], [10, 19], [11, 20], [12, 20], [13, 19], [14, 18]]) put(g, x, y, y === 20 ? skinShade : shirtLight);
  put(g, 11, 19, skinShade); put(g, 12, 19, skinShade); put(g, 10, 18, skinShade); put(g, 13, 18, skinShade);

  // 머리통
  fillIf(g, inHead, skin);
  fillIf(g, (x, y) => inHead(x, y) && x >= cx + face.rx - 1.6, skinShade); // 오른쪽 음영(빛은 왼쪽 위)
  fillIf(g, (x, y) => inHead(x, y) && y >= face.cy + face.ry - 1.2, skinShade);
  // 귀
  const [l11, r11] = headRow(11);
  rect(g, l11 - 1, 10, l11 - 1, 12, skin); put(g, l11 - 1, 11, skinShade);
  rect(g, r11 + 1, 10, r11 + 1, 12, skinShade); put(g, r11 + 1, 11, shade(skin, 0.3));

  // 머리카락 (얼굴 창: 이마 아래는 지우지 않는다)
  const hairTop = (x, y, yEdge) => inHead(x, y + 1.2) && y <= yEdge;
  const faceTop = Math.round(face.cy - face.ry);
  if (style === 'crop' || style === 'long' || style === 'ponytail' || style === 'wavy') {
    fillIf(g, (x, y) => (inHead(x, y + 1.6) && y <= faceTop + 3) || (inHead(x, y) && y <= faceTop + 5 && (x <= l11 + 0 || x >= r11 - 0)), hairColor);
    if (style === 'wavy') { for (let x = 6; x <= 17; x += 2) put(g, x, faceTop + 3, hairColor); }
  }
  if (style === 'fade') {
    fillIf(g, (x, y) => inHead(x, y + 1.6) && y <= faceTop + 2, hairColor);
    fillIf(g, (x, y) => inHead(x, y) && y <= faceTop + 4 && (x <= l11 || x >= r11), hairDark);
  }
  if (style === 'buzz') fillIf(g, (x, y) => inHead(x, y + 1.4) && y <= faceTop + 2, hairDark);
  if (style === 'cornrows') {
    fillIf(g, (x, y) => inHead(x, y + 1.6) && y <= faceTop + 3, hairColor);
    for (let x = 7; x <= 16; x += 2) for (let y = faceTop - 1; y <= faceTop + 3; y++) if (g[y]?.[x] === hairColor) g[y][x] = hairDark;
  }
  if (style === 'afro') fillIf(g, (x, y) => (x - cx) ** 2 + (y - 8.2) ** 2 <= 8.6 ** 2 && !(y >= faceTop + 3 && x >= l11 + 1 && x <= r11 - 1), hairColor);
  if (style === 'curls') {
    fillIf(g, (x, y) => inHead(x, y + 1.6) && y <= faceTop + 3, hairColor);
    for (const [px, py] of [[7, faceTop], [10, faceTop - 1], [13, faceTop - 1], [16, faceTop]]) fillIf(g, (x, y) => (x - px) ** 2 + (y - py) ** 2 <= 5.5, hairColor);
    for (const [px, py] of [[6, faceTop + 3], [17, faceTop + 3]]) fillIf(g, (x, y) => (x - px) ** 2 + (y - py) ** 2 <= 4, hairColor);
  }
  if (style === 'topknot') {
    fillIf(g, (x, y) => inHead(x, y + 1.6) && y <= faceTop + 3, hairColor);
    fillIf(g, (x, y) => (x - cx) ** 2 + (y - 2.2) ** 2 <= 5, hairColor);
  }
  if (style === 'mohawk') {
    fillIf(g, (x, y) => inHead(x, y + 1.6) && y <= faceTop + 2, hairDark);
    rect(g, 10, 0, 13, faceTop + 3, hairColor);
  }
  if (style === 'bald') { put(g, 9, faceTop + 1, skinLight); put(g, 10, faceTop + 1, skinLight); put(g, 9, faceTop + 2, skinLight); }
  if (style !== 'bald' && style !== 'buzz') { put(g, 8, faceTop + 1, hairLight); put(g, 9, faceTop, hairLight); put(g, 10, faceTop, hairLight); }

  // 눈썹
  const brow = style === 'bald' || old ? shade(HAIR_COLORS[pick(s1, 12, 5)], 0.1) : hairDark;
  const bx = [[7, 8, 9], [14, 15, 16]];
  const by = 8;
  for (const xs of bx) {
    if (browType === 0) xs.forEach((x) => put(g, x, by, brow));
    if (browType === 1) { const left = xs[0] < 12; put(g, xs[0], left ? by + 1 : by, brow); put(g, xs[1], by, brow); put(g, xs[2], left ? by : by + 1, brow); } // 화난 눈썹(안쪽이 낮음)
    if (browType === 2) { put(g, xs[0], by, brow); put(g, xs[1], by, brow); }
    if (browType === 3) { xs.forEach((x) => { put(g, x, by, brow); put(g, x, by - 1, brow); }); } // 두꺼운 눈썹
  }
  // 눈 (3x2)
  const eyes = [[7, 9], [14, 16]];
  for (const [x1] of eyes) {
    if (eyeType === 0) { put(g, x1, 10, '#ffffff'); put(g, x1 + 1, 10, INK); put(g, x1 + 2, 10, '#ffffff'); put(g, x1 + 1, 11, INK); }
    if (eyeType === 1) { rect(g, x1, 10, x1 + 2, 10, INK); put(g, x1, 11, '#ffffff'); put(g, x1 + 1, 11, INK); put(g, x1 + 2, 11, '#ffffff'); }
    if (eyeType === 2) { put(g, x1, 10, '#ffffff'); put(g, x1 + 1, 10, INK); put(g, x1 + 2, 10, '#ffffff'); put(g, x1, 11, '#ffffff'); put(g, x1 + 1, 11, INK); put(g, x1 + 2, 11, '#ffffff'); }
  }
  // 코
  if (noseType === 0) { put(g, 11, 13, skinShade); put(g, 12, 13, skinShade); }
  if (noseType === 1) { put(g, 12, 12, skinShade); put(g, 12, 13, skinShade); put(g, 11, 13, skinShade); put(g, 11, 12, skinLight); }
  if (noseType === 2) { put(g, 11, 12, skinLight); put(g, 11, 13, shade(skin, 0.28)); put(g, 12, 13, shade(skin, 0.28)); }

  // 수염
  const beardColor = old ? mixHex(hairColor, '#c9c4bb', 0.3) : hairColor;
  if (facial === 1) fillIf(g, (x, y) => inHead(x, y) && y >= 13 && (x + y) % 2 === 0 && !(y <= 13 && x >= 11 && x <= 12), mixHex(skin, beardColor, 0.55));
  if (facial === 2) { rect(g, 9, 13, 14, 13, beardColor); put(g, 10, 12, beardColor); put(g, 13, 12, beardColor); put(g, 11, 13, skinShade); put(g, 12, 13, skinShade); }
  if (facial === 3) fillIf(g, (x, y) => inHead(x, y) && ((y >= 14) || (y >= 12 && (x <= l11 + 1 || x >= r11 - 1))), beardColor);
  if (facial === 4) { rect(g, 10, 14, 13, 17, beardColor); }

  // 입
  const mouthY = 15;
  if (facial === 3) { rect(g, 10, mouthY, 13, mouthY, LIP); put(g, 9, mouthY - 1, beardColor); }
  else if (mouthType === 0) { rect(g, 10, mouthY, 13, mouthY, LIP); put(g, 9, mouthY - 1, LIP); put(g, 14, mouthY - 1, LIP); }
  else if (mouthType === 1) { rect(g, 10, mouthY, 13, mouthY, LIP); }
  else if (mouthType === 2) { rect(g, 9, mouthY - 1, 14, mouthY - 1, LIP); rect(g, 10, mouthY, 13, mouthY, '#ffffff'); rect(g, 10, mouthY + 1, 13, mouthY + 1, LIP); }
  else { rect(g, 10, mouthY, 12, mouthY, LIP); put(g, 13, mouthY, LIP); put(g, 14, mouthY - 1, LIP); }
  // 볼
  put(g, 7, 13, mixHex(skin, '#e0605a', 0.3)); put(g, 16, 13, mixHex(skin, '#e0605a', 0.3));

  // 장신구
  if (accessory === 0) rect(g, 6, faceTop + 2, 17, faceTop + 2, light(kit, 0.5)); // 머리띠
  if (accessory === 1) put(g, l11 - 1, 13, '#f2d24a'); // 귀걸이
  if (accessory === 2) { put(g, 15, 12, '#c9605a'); put(g, 16, 13, '#c9605a'); put(g, 17, 14, '#c9605a'); } // 흉터
  if (accessory === 3) for (const [x, y] of [[8, 12], [9, 13], [14, 12], [15, 13], [7, 12], [16, 12]]) put(g, x, y, shade(skin, 0.25)); // 주근깨
  if (old) { put(g, 6, 11, skinShade); put(g, 17, 11, skinShade); put(g, 10, 7, skinShade); put(g, 13, 7, skinShade); } // 주름

  // 윤곽선
  const add = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!g[y][x] && ((y > 0 && g[y - 1][x]) || (y < N - 1 && g[y + 1][x]) || (x > 0 && g[y][x - 1]) || (x < N - 1 && g[y][x + 1]))) add.push([x, y]);
  for (const [x, y] of add) g[y][x] = OUT;

  // 렌더
  const bg = mixHex(kit, '#0c0b10', 0.55);
  let out = `<rect width="24" height="24" style="fill:color-mix(in srgb,var(--tier,${bg}) 70%,#0c0b10)"/>`;
  for (let y = 0; y < 14; y++) for (let x = 0; x < N; x++) if ((x + y) % 2 === 0) out += `<rect x="${x}" y="${y}" width="1" height="1" fill="#fff" opacity=".05"/>`;
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
