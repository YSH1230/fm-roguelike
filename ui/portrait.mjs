// 선수 초상화. 선수 카드는 전부 절차적 생성이라 사진을 쓸 수 없고 이미지 생성
// 도구도 없다 — 그래서 id로 시드한 결정론적 SVG를 그린다. 같은 선수는 언제
// 어디서 렌더해도 같은 얼굴이 나온다(피치·상점·선수단·결산 전부 동일).

// 대륙 태그별 피부톤. 이름 풀(data/name-pools.mjs)이 이미 대륙을 따라가므로
// 얼굴도 따라가야 이름과 초상화가 따로 놀지 않는다.
const SKIN = {
  africa: ['#7d5138', '#684129', '#8d6244'],
  southAmerica: ['#b07a52', '#96613e', '#c68f63'],
  asiaOceania: ['#d9a877', '#c79463', '#e3b98c'],
  europe: ['#e8be9a', '#d9a87f', '#f0cbaa'],
  northCentralAmerica: ['#c68f63', '#a9714a', '#d9a87f'],
};
const HAIR_COLORS = ['#191310', '#2b1d14', '#43291a', '#6f482a', '#a8793f', '#b8b3ab'];
// bald가 하나뿐인 건 의도적이다. 7분의 1이면 가끔 보여서 눈에 띄고,
// 더 늘리면 "머리 없는 달걀"이 늘어나 얼굴들이 서로 구분되지 않는다.
const STYLES = ['crop', 'fade', 'afro', 'curls', 'long', 'topknot', 'bald'];

// FNV-1a. 카드 id 문자열 하나에서 필요한 만큼 안정적인 수를 뽑는다.
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
// >>> 를 써야 한다. seed는 2^31을 넘길 수 있는데 부호 있는 >> 는 그걸 음수
// int32로 바꿔버리고, 음수 % length 는 음수라 list[-2] === undefined 가 된다.
const at = (seed, shift, list) => list[(seed >>> shift) % list.length];

// 머리통(피부)은 cx32 cy27 rx13 ry14.5, 즉 y 12.5~41.5 / x 19~45 를 차지한다.
// 머리 모양은 그 뒤에 깔 덩어리(back)와 앞에 덮을 부분(front)으로 나눈다.
// 뒤/앞을 안 나누면 긴 머리가 얼굴을 덮어버린다. 작은 크기(36~54px)에서
// 서로 구분되려면 실루엣이 머리통 밖으로 튀어나와야 한다 — 머리통 안에만
// 있는 얇은 테두리는 전부 같은 얼굴로 보인다.
function hairShapes(style, color) {
  const back = {
    afro: `<circle cx="32" cy="22" r="16.5" fill="${color}"/>`,
    curls: `<circle cx="32" cy="21" r="14.5" fill="${color}"/>`,
    long: `<rect x="17" y="14" width="30" height="31" rx="13" fill="${color}"/>`,
  }[style] ?? '';

  const front = {
    crop: `<ellipse cx="32" cy="18.5" rx="13.4" ry="7.6" fill="${color}"/>`,
    fade: `<ellipse cx="32" cy="17" rx="11.6" ry="6.2" fill="${color}"/>`,
    afro: `<ellipse cx="32" cy="18" rx="13.2" ry="7" fill="${color}"/>`,
    curls: `<g fill="${color}"><circle cx="23" cy="18" r="6"/><circle cx="32" cy="15.5" r="6.4"/><circle cx="41" cy="18" r="6"/></g>`,
    long: `<ellipse cx="32" cy="18" rx="13.4" ry="7.4" fill="${color}"/>`,
    topknot: `<ellipse cx="32" cy="18.5" rx="13.2" ry="7" fill="${color}"/><circle cx="32" cy="8.5" r="4.6" fill="${color}"/>`,
    bald: '',
  }[style] ?? '';

  return { back, front };
}

// kit: 유니폼 색. 보유 선수는 구단 색, 상점 매물은 아직 우리 팀이 아니므로 중립색.
export function renderPortrait(card, { size = 44, kit = '#2c4239' } = {}) {
  const seed = hash(card.id ?? card.name ?? 'x');
  const skin = at(seed, 3, SKIN[card.continentTag] ?? SKIN.europe);
  const style = at(seed, 9, STYLES);
  const hairColor = at(seed, 14, HAIR_COLORS);
  const { back, front } = hairShapes(style, hairColor);
  // 눈 간격과 눈썹 높이를 아주 조금 흔든다. 전부 같은 자리면 머리만 다른
  // 같은 얼굴 60장이 되고, 크게 흔들면 만화가 된다.
  const spread = ((seed >>> 24) % 3) * 0.7;
  const brow = ((seed >>> 27) % 3) * 0.8;
  // 33세 이상만 수염을 붙인다 — 나이가 얼굴에서 읽히면 베테랑 리더 같은
  // 나이 조건부 성향이 카드만 봐도 짐작된다.
  const beard = card.age >= 33 && (seed >>> 20) % 2
    ? `<path d="M21 30c0 8 5 13 11 13s11-5 11-13c-2 6-6 9-11 9s-9-3-11-9z" fill="${hairColor}" opacity=".9"/>`
    : '';

  return `<svg class="portrait" width="${size}" height="${size}" viewBox="0 0 64 64"
    role="img" aria-label="${(card.name ?? '').replace(/"/g, '')} 초상" focusable="false">
    <rect width="64" height="64" rx="10" fill="${kit}" opacity=".3"/>
    <path d="M4 64c0-12 9-18 19-20h18c10 2 19 8 19 20z" fill="${kit}"/>
    <rect x="27.5" y="35" width="9" height="9" rx="4" fill="${skin}"/>
    ${back}
    <ellipse cx="32" cy="27" rx="13" ry="14.5" fill="${skin}"/>
    ${beard}
    ${front}
    <g fill="${hairColor}" opacity=".7">
      <rect x="${25.2 - spread}" y="${21.6 + brow}" width="5.2" height="1.5" rx=".75"/>
      <rect x="${33.6 + spread}" y="${21.6 + brow}" width="5.2" height="1.5" rx=".75"/>
    </g>
    <rect x="${25.5 - spread}" y="26" width="4.6" height="2.6" rx="1.3" fill="#1a1512" opacity=".82"/>
    <rect x="${33.9 + spread}" y="26" width="4.6" height="2.6" rx="1.3" fill="#1a1512" opacity=".82"/>
  </svg>`;
}
