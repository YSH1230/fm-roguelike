// 구단 엠블럼. portrait.mjs와 같은 원칙 - 로고 이미지를 쓸 수 없으니 구단 id로
// 시드한 결정론적 SVG를 그린다. 같은 구단은 시작 화면·상단바·순위표·결산에서
// 항상 같은 문장(紋章)을 보여준다.

function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
const at = (seed, shift, list) => list[(seed >>> shift) % list.length];

// 이름에서 이니셜을 뽑는다. "Foxwell City" -> FC, "유스 명문" -> 유.
function initials(name) {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return words[0].slice(0, 2).toUpperCase();
}

const SHAPES = {
  shield: 'M32 4 L56 12 V32 C56 48 46 58 32 62 C18 58 8 48 8 32 V12 Z',
  kite: 'M32 4 L58 26 L32 62 L6 26 Z',
  roundel: 'M32 4 A28 28 0 1 1 31.9 4 Z',
};

// 문장 안쪽에 얹는 장식. kit 색 바탕 위에 밝은 색으로 그린다.
function device(kind, accent) {
  return {
    band: `<path d="M8 24 H56 V38 H8 Z" fill="${accent}" opacity=".85"/>`,
    chevron: `<path d="M10 46 L32 24 L54 46 L54 58 L32 38 L10 58 Z" fill="${accent}" opacity=".85"/>`,
    star: `<path d="M32 12 L36.5 25 L50 25 L39 33.5 L43 47 L32 39 L21 47 L25 33.5 L14 25 L27.5 25 Z" fill="${accent}" opacity=".9"/>`,
    ring: `<circle cx="32" cy="33" r="16" fill="none" stroke="${accent}" stroke-width="4" opacity=".85"/>`,
  }[kind] ?? '';
}

let renderCount = 0;

export function renderCrest(club, { size = 40 } = {}) {
  const seed = hash(club.id ?? club.name ?? 'x');
  const shapeId = at(seed, 4, Object.keys(SHAPES));
  const deviceId = at(seed, 10, ['band', 'chevron', 'star', 'ring']);
  const kit = club.kit ?? '#2c4239';
  const accent = at(seed, 16, ['#f0ead9', '#dda63a', '#ffffff']);
  // 같은 구단이 한 화면에 두 번(상단바 + 순위표 등) 나올 수 있어 clipPath id는
  // seed만으로는 부족하다 - 호출 순번을 섞어 매번 고유하게 만든다.
  renderCount += 1;
  const clipId = `crest-clip-${seed}-${renderCount}`;

  return `<svg class="crest" width="${size}" height="${size}" viewBox="0 0 64 64"
    role="img" aria-label="${esc(club.name ?? '')} 엠블럼" focusable="false">
    <path d="${SHAPES[shapeId]}" fill="${kit}"/>
    <path d="${SHAPES[shapeId]}" fill="none" stroke="#00000030" stroke-width="2"/>
    <clipPath id="${clipId}"><path d="${SHAPES[shapeId]}"/></clipPath>
    <g clip-path="url(#${clipId})">${device(deviceId, accent)}</g>
    <text x="32" y="39" text-anchor="middle" font-family="Anton, system-ui, sans-serif"
      font-weight="900" font-size="20" fill="${accent}" stroke="#00000040" stroke-width="0.6"
      paint-order="stroke">${esc(initials(club.name ?? '??'))}</text>
  </svg>`;
}

function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
