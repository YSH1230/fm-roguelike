// 선수·감독·스태프 초상화. 카드는 전부 절차적 생성이라 사진을 쓸 수 없어서, id로 시드한
// 결정론적 16x16 픽셀 캐릭터를 그린다. 같은 사람은 언제 어디서 그려도 같은 얼굴이 나온다.
import { grid, put, rows, outline, gridToRects, shade, light, mixHex } from './pixel.mjs';

// 대륙 태그별 피부톤. 이름 풀이 대륙을 따라가므로 얼굴도 따라가야 이름과 그림이 따로 놀지 않는다.
const SKIN = {
  africa: ['#8d5a3b', '#7a4a2e', '#9d6b49'],
  southAmerica: ['#c08a5c', '#a9724a', '#d09b6d'],
  asiaOceania: ['#e8b98a', '#d6a275', '#f0c79c'],
  europe: ['#f1c9a5', '#e4b48d', '#f8d6b7'],
  northCentralAmerica: ['#d09b6d', '#b8825a', '#e0ac80'],
};
const HAIR_COLORS = ['#201814', '#3a2618', '#5a3720', '#8a5a2e', '#c18a3f', '#c9c4bb'];
const STYLES = ['crop', 'fade', 'afro', 'curls', 'long', 'topknot', 'bald'];

// FNV-1a. 카드 id 문자열 하나에서 필요한 만큼 안정적인 수를 뽑는다.
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const at = (seed, shift, list) => list[(seed >>> shift) % list.length];

// 머리 모양. [y, x1, x2] 행 목록. 머리통(피부)은 x4~11, y3~10을 차지한다.
const HAIR = {
  crop: [[2, 5, 10], [3, 4, 11], [4, 4, 11]],
  fade: [[2, 5, 10], [3, 5, 10]],
  afro: [[0, 5, 10], [1, 4, 11], [2, 3, 12], [3, 3, 12], [4, 3, 12], [5, 3, 3], [5, 12, 12], [6, 3, 3], [6, 12, 12]],
  curls: [[1, 5, 6], [1, 9, 10], [2, 4, 11], [3, 4, 11], [4, 4, 5], [4, 10, 11]],
  long: [[2, 5, 10], [3, 4, 11], [4, 4, 5], [4, 10, 11], [5, 3, 4], [5, 11, 12], [6, 3, 4], [6, 11, 12], [7, 3, 4], [7, 11, 12], [8, 3, 4], [8, 11, 12], [9, 3, 4], [9, 11, 12], [10, 3, 4], [10, 11, 12]],
  topknot: [[0, 7, 8], [1, 7, 8], [2, 5, 10], [3, 4, 11], [4, 4, 11]],
  bald: [],
};

// 시뮬레이션의 작은 선수도 같은 사람이면 같은 피부색·머리색이 되도록 같은 규칙으로 뽑는다.
export function appearanceOf(card) {
  const seed = hash(card.id ?? card.name ?? 'x');
  return { skin: at(seed, 3, SKIN[card.continentTag] ?? SKIN.europe), hair: at(seed, 14, HAIR_COLORS) };
}

const cache = new Map();

// kit: 유니폼 색. role: 'player' | 'manager' | 'coach' | 'scout' (없으면 카드 모양으로 추정).
export function renderPortrait(card, { size = 44, kit = '#2c4239', role } = {}) {
  const kind = role ?? (card.tacticalTag !== undefined ? 'manager' : (card.baseOVR === undefined && card.level !== undefined ? 'coach' : 'player'));
  const key = `${card.id ?? card.name}|${kind}|${kit}|${card.continentTag}|${card.age >= 33}`;
  let body = cache.get(key);
  if (!body) { body = drawPortrait(card, kit, kind); cache.set(key, body); }
  return `<svg class="portrait portrait--px" width="${size}" height="${size}" viewBox="0 0 16 16" shape-rendering="crispEdges"
    role="img" aria-label="${(card.name ?? '').replace(/"/g, '')} 초상" focusable="false">${body}</svg>`;
}

function drawPortrait(card, kit, kind) {
  const seed = hash(card.id ?? card.name ?? 'x');
  const skin = at(seed, 3, SKIN[card.continentTag] ?? SKIN.europe);
  const skinShade = shade(skin, 0.16);
  const style = at(seed, 9, STYLES);
  const hairColor = at(seed, 14, HAIR_COLORS);
  const hairLight = light(hairColor, 0.3);
  const g = grid();

  // 몸통
  const shirt = kind === 'manager' ? '#2a2f3d' : kind === 'scout' ? '#3f5f46' : kit;
  rows(g, [[11, 4, 11], [12, 2, 13], [13, 2, 13], [14, 2, 13], [15, 2, 13]], shirt);
  rows(g, [[14, 2, 13], [15, 2, 13]], shade(shirt, 0.18));
  put(g, 7, 11, skinShade); put(g, 8, 11, skinShade); // 목
  if (kind === 'player') {
    rows(g, [[12, 7, 8], [13, 7, 8]], light(shirt, 0.28)); // 가운데 줄무늬
    rows(g, [[11, 6, 9]], light(shirt, 0.18));
  } else if (kind === 'manager') {
    rows(g, [[11, 6, 9], [12, 7, 8]], '#f4f1ea');
    rows(g, [[12, 7, 8], [13, 7, 8], [14, 7, 8]], '#b8323a'); // 넥타이
    put(g, 7, 12, '#f4f1ea'); put(g, 8, 12, '#f4f1ea');
  } else if (kind === 'coach') {
    rows(g, [[12, 2, 2], [13, 2, 2], [14, 2, 2], [15, 2, 2], [12, 13, 13], [13, 13, 13], [14, 13, 13], [15, 13, 13]], '#f2f2f2'); // 트레이닝복 소매 줄
    put(g, 8, 12, '#f2d24a'); put(g, 8, 13, '#f2d24a'); put(g, 9, 13, '#f2d24a'); // 호루라기
  } else if (kind === 'scout') {
    rows(g, [[12, 5, 6], [13, 5, 6], [12, 9, 10], [13, 9, 10]], '#23262c'); // 쌍안경
    rows(g, [[12, 7, 8]], '#23262c');
    put(g, 5, 13, '#5fb4e8'); put(g, 10, 13, '#5fb4e8');
  }

  // 머리통
  rows(g, [[3, 5, 10], [4, 4, 11], [5, 4, 11], [6, 4, 11], [7, 4, 11], [8, 4, 11], [9, 4, 11], [10, 5, 10]], skin);
  rows(g, [[10, 5, 10]], skinShade);
  rows(g, [[7, 11, 11], [8, 11, 11], [9, 11, 11]], skinShade);

  // 머리카락(모자를 쓰는 스카우트는 모자가 대신한다)
  if (kind === 'scout') {
    rows(g, [[2, 5, 10], [3, 4, 11]], '#2f5f8a');
    rows(g, [[4, 3, 9]], '#1f4263');
    put(g, 6, 2, light('#2f5f8a', 0.3));
  } else {
    rows(g, HAIR[style] ?? [], hairColor);
    if (style !== 'bald') { put(g, 6, 2, hairLight); if (style === 'afro') put(g, 6, 1, hairLight); } else { put(g, 6, 3, light(skin, 0.3)); put(g, 7, 3, light(skin, 0.3)); }
  }

  // 얼굴
  const browY = 6;
  const brow = ((seed >>> 27) % 3) === 0 ? mixHex(hairColor, '#000000', 0.2) : hairColor;
  if (style !== 'afro' || kind === 'scout') { rows(g, [[browY, 5, 6], [browY, 9, 10]], brow); }
  put(g, 6, 7, OUTC); put(g, 6, 8, OUTC); put(g, 9, 7, OUTC); put(g, 9, 8, OUTC);
  put(g, 5, 9, mixHex(skin, '#e0605a', 0.35)); put(g, 10, 9, mixHex(skin, '#e0605a', 0.35)); // 볼
  put(g, 7, 9, '#7a3b32'); put(g, 8, 9, '#7a3b32'); // 입
  if (kind !== 'manager' && card.age >= 33 && (seed >>> 20) % 2) { rows(g, [[9, 4, 4], [9, 11, 11], [10, 5, 10]], hairColor); put(g, 7, 9, '#7a3b32'); put(g, 8, 9, '#7a3b32'); }
  if (kind === 'manager') { // 안경: 은색 얇은 테. 눈은 그대로 보이게 한다
    const f = '#c9ced6';
    rows(g, [[6, 5, 10], [8, 5, 5], [8, 7, 8], [8, 10, 10]], f);
    put(g, 5, 7, f); put(g, 7, 7, f); put(g, 8, 7, f); put(g, 10, 7, f);
  }

  outline(g);
  // 배경은 카드 등급 색(--tier)을 따라간다. 등급이 없는 곳에서는 유니폼 색을 쓴다.
  const bg = mixHex(kit, '#0c0b10', 0.55);
  return `<rect width="16" height="16" style="fill:color-mix(in srgb,var(--tier,${bg}) 70%,#0c0b10)"/><rect y="15" width="16" height="1" style="fill:color-mix(in srgb,var(--tier,${bg}) 70%,#000)" opacity=".55"/>${gridToRects(g)}`;
}
const OUTC = '#1b1311';
