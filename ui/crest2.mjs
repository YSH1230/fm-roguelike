// 구단 엠블럼 v3: 실제 축구 구단 문장처럼 방패 + 바탕 무늬 + 상징 + 이니셜 띠.
// 구단 id(없으면 이름)로 시드한 결정론적 SVG라 같은 구단은 어디서나 같은 문장이다.
// 이름에 든 단어(Colliery, Wanderers, Town 등)가 상징을 정하고, 없으면 시드가 정한다.

function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const pick = (seed, shift, list) => list[(seed >>> shift) % list.length];
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function mix(a, b, t) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const f = (s) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => f(s).toString(16).padStart(2, '0')).join('')}`;
}
const lum = (c) => { const n = parseInt(c.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };

const SHAPES = {
  heater: 'M8 6 H56 V32 C56 46 44 57 32 62 C20 57 8 46 8 32 Z',
  spanish: 'M8 6 H56 V34 A24 24 0 0 1 8 34 Z',
  notch: 'M8 10 Q20 4 32 8 Q44 4 56 10 V34 C56 48 44 57 32 62 C20 57 8 48 8 34 Z',
  round: 'M32 3 A29 29 0 1 1 31.9 3 Z',
  hex: 'M32 3 L57 17 V47 L32 61 L7 47 V17 Z',
  diamond: 'M32 3 L58 14 V34 C58 48 46 58 32 62 C18 58 6 48 6 34 V14 Z',
  oval: 'M32 3 C50 3 58 16 58 32 C58 50 46 61 32 62 C18 61 6 50 6 32 C6 16 14 3 32 3Z',
  gothic: 'M8 20 C8 10 20 5 32 2 C44 5 56 10 56 20 V36 C56 48 44 57 32 62 C20 57 8 48 8 36Z',
};

// 바탕 무늬. c1 바탕, c2 보조색
const FIELDS = {
  solid: (c1) => `<rect width="64" height="64" fill="${c1}"/>`,
  halves: (c1, c2) => `<rect width="64" height="64" fill="${c1}"/><rect x="32" width="32" height="64" fill="${c2}"/>`,
  stripes: (c1, c2) => `<rect width="64" height="64" fill="${c1}"/>${[0, 1, 2].map((i) => `<rect x="${6 + i * 20}" width="10" height="64" fill="${c2}"/>`).join('')}`,
  hoops: (c1, c2) => `<rect width="64" height="64" fill="${c1}"/>${[0, 1, 2].map((i) => `<rect y="${6 + i * 17}" width="64" height="9" fill="${c2}"/>`).join('')}`,
  quarters: (c1, c2) => `<rect width="64" height="64" fill="${c1}"/><rect width="32" height="32" fill="${c2}"/><rect x="32" y="32" width="32" height="32" fill="${c2}"/>`,
  diagonal: (c1, c2) => `<rect width="64" height="64" fill="${c1}"/><path d="M-4 40 L40 -4 L68 -4 L-4 68Z" fill="${c2}"/>`,
  chevron: (c1, c2) => `<rect width="64" height="64" fill="${c1}"/><path d="M0 34 L32 8 L64 34 V50 L32 24 L0 50Z" fill="${c2}"/>`,
  cross: (c1, c2) => `<rect width="64" height="64" fill="${c1}"/><rect x="26" width="12" height="64" fill="${c2}"/><rect y="24" width="64" height="12" fill="${c2}"/>`,
  thin: (c1, c2) => `<rect width="64" height="64" fill="${c1}"/>${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${5 + i * 11}" width="5" height="64" fill="${c2}"/>`).join('')}`,
  bars: (c1, c2) => `<rect width="64" height="64" fill="${c1}"/>${[0, 1, 2, 3].map((i) => `<path d="M${-10 + i * 22} 64 L${22 + i * 22} -4 L${32 + i * 22} -4 L${0 + i * 22} 64Z" fill="${c2}"/>`).join('')}`,
  chief: (c1, c2) => `<rect width="64" height="64" fill="${c1}"/><rect width="64" height="24" fill="${c2}"/>`,
  checks: (c1, c2) => `<rect width="64" height="64" fill="${c1}"/>${Array.from({ length: 16 }, (_, i) => ((i % 4 + Math.floor(i / 4)) % 2 ? `<rect x="${(i % 4) * 16}" y="${Math.floor(i / 4) * 16}" width="16" height="16" fill="${c2}"/>` : '')).join('')}`,
  thirds: (c1, c2) => `<rect width="64" height="64" fill="${c1}"/><rect x="21" width="22" height="64" fill="${c2}"/>`,
  saltire: (c1, c2) => `<rect width="64" height="64" fill="${c1}"/><path d="M0 8 L8 0 L64 56 L56 64Z M56 0 L64 8 L8 64 L0 56Z" fill="${c2}"/>`,
};

// 상징 (64칸 안에서 중심 32,28 근처, 크기 약 26). fill = f, 보조 = d(어두운 선)
const CHARGES = {
  ball: (f, d) => `<circle cx="32" cy="28" r="12" fill="${f}" stroke="${d}" stroke-width="2"/><path d="M32 22 L37 25.5 L35 31.500 H29 L27 25.500Z" fill="${d}"/><path d="M32 22 V17 M37 25.500 L42 24 M35 31.500 L38.500 36 M29 31.500 L25.500 36 M27 25.500 L22 24" stroke="${d}" stroke-width="2" stroke-linecap="round"/>`,
  star: (f, d) => `<path d="M32 14 L36.500 24 L47.500 25.200 L39.300 32.500 L41.700 43.300 L32 37.800 L22.300 43.300 L24.700 32.500 L16.500 25.200 L27.500 24Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>`,
  crown: (f, d) => `<path d="M18 38 L20 20 L27 29 L32 17 L37 29 L44 20 L46 38Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><rect x="18" y="38" width="28" height="5" rx="1" fill="${f}" stroke="${d}" stroke-width="2"/><circle cx="20" cy="19" r="2" fill="${d}"/><circle cx="32" cy="16" r="2" fill="${d}"/><circle cx="44" cy="19" r="2" fill="${d}"/>`,
  tower: (f, d) => `<path d="M21 43 V22 H25 V26 H29 V22 H35 V26 H39 V22 H43 V43Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M28 43 V35 A4 4 0 0 1 36 35 V43Z" fill="${d}"/>`,
  anchor: (f, d) => `<g fill="none" stroke="${f}" stroke-width="4" stroke-linecap="round"><circle cx="32" cy="17" r="4"/><path d="M32 21 V42 M24 27 H40 M18 33 C19 41 25 45 32 45 C39 45 45 41 46 33"/></g><g fill="none" stroke="${d}" stroke-width="1.200" opacity=".55"><circle cx="32" cy="17" r="4"/></g>`,
  hammer: (f, d) => `<g stroke="${d}" stroke-width="2" stroke-linejoin="round" fill="${f}"><path d="M20 16 L25 11 L46 32 L41 37Z"/><rect x="17" y="30" width="4.500" height="19" rx="1" transform="rotate(-45 20 40)"/><path d="M44 16 L39 11 L18 32 L23 37Z" fill="${f}"/></g>`,
  sun: (f, d) => `<circle cx="32" cy="28" r="8" fill="${f}" stroke="${d}" stroke-width="2"/><g stroke="${f}" stroke-width="3.500" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M32 13 V17" transform="rotate(${a} 32 28)"/>`).join('')}</g>`,
  laurel: (f, d) => `<g fill="${f}" stroke="${d}" stroke-width="1.500">${[0, 1, 2, 3, 4].map((i) => `<ellipse cx="${20 + i * 1.500}" cy="${40 - i * 5.500}" rx="2.800" ry="5" transform="rotate(${-30 + i * 14} ${20 + i * 1.500} ${40 - i * 5.500})"/><ellipse cx="${44 - i * 1.500}" cy="${40 - i * 5.500}" rx="2.800" ry="5" transform="rotate(${30 - i * 14} ${44 - i * 1.500} ${40 - i * 5.500})"/>`).join('')}</g>`,
  ship: (f, d) => `<path d="M15 36 H49 L43 45 H21Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M32 14 V36" stroke="${d}" stroke-width="2.500"/><path d="M33 16 L46 32 H33Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M31 20 L20 32 H31Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>`,
  key: (f, d) => `<g fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"><circle cx="32" cy="19" r="7"/><circle cx="32" cy="19" r="2.500" fill="${d}"/><rect x="29.500" y="25" width="5" height="18"/><path d="M34.500 35 H40 V38 H34.500Z M34.500 41 H38 V44 H34.500Z"/></g>`,
  bolt: (f, d) => `<path d="M36 12 L22 32 H31 L27 46 L43 24 H33Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>`,
  wheel: (f, d) => `<g stroke="${d}" stroke-width="2" fill="${f}"><circle cx="32" cy="28" r="13"/><circle cx="32" cy="28" r="9" fill="none"/><circle cx="32" cy="28" r="3" fill="${d}"/>${[0, 45, 90, 135].map((a) => `<path d="M32 19 V37" transform="rotate(${a} 32 28)" stroke="${d}"/>`).join('')}</g>`,
  rose: (f, d) => `<g fill="${f}" stroke="${d}" stroke-width="1.500">${[0, 72, 144, 216, 288].map((a) => `<circle cx="32" cy="18" r="6" transform="rotate(${a} 32 28)"/>`).join('')}<circle cx="32" cy="28" r="5" fill="${d}"/></g>`,
  boot: (f, d) => `<path d="M20 16 H31 V28 C31 32 36 33 42 35 C46 36 47 40 44 42 H20Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M22 42 V46 M28 42 V46 M34 42 V46 M40 42 V46" stroke="${d}" stroke-width="2.500" stroke-linecap="round"/>`,
  oak: (f, d) => `<path d="M32 44 V30 M32 30 C24 30 20 24 22 18 C26 18 30 21 32 25 C34 21 38 18 42 18 C44 24 40 30 32 30Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="16" r="3" fill="${f}" stroke="${d}" stroke-width="2"/>`,


  // ---- 동물을 상징으로만(눈·코·입 없이): 발자국, 발톱 자국, 뿔, 가지뿔, 펼친 날개, 지느러미, 깃털 ----
  mane: (f, d) => `<path d="${Array.from({ length: 28 }, (_, i) => { const a = (i * Math.PI * 2) / 28 - Math.PI / 2; const r = i % 2 ? 15 : 22; return `${i ? 'L' : 'M'}${(32 + r * Math.cos(a)).toFixed(1)} ${(28 + r * Math.sin(a)).toFixed(1)}`; }).join(' ')}Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="28" r="11.500" fill="${d}"/><circle cx="32" cy="28" r="11.500" fill="none" stroke="${f}" stroke-width="2"/><path d="M32 19 L34.500 25 L41 25.500 L36 29.500 L37.800 36 L32 32.500 L26.200 36 L28 29.500 L23 25.500 L29.500 25Z" fill="${f}"/>`,
  paw: (f, d) => `<g fill="${f}" stroke="${d}" stroke-width="2.200" stroke-linejoin="round"><path d="M32 29 C23 29 17 38 19 44 C21 50 27 47 32 47 C37 47 43 50 45 44 C47 38 41 29 32 29Z"/><ellipse cx="17.500" cy="27" rx="4.600" ry="6" transform="rotate(-24 17.500 27)"/><ellipse cx="26.500" cy="17.500" rx="4.800" ry="6.600" transform="rotate(-8 26.500 17.500)"/><ellipse cx="37.500" cy="17.500" rx="4.800" ry="6.600" transform="rotate(8 37.500 17.500)"/><ellipse cx="46.500" cy="27" rx="4.600" ry="6" transform="rotate(24 46.500 27)"/></g>`,
  claws: (f, d) => `<g fill="${f}" stroke="${d}" stroke-width="2.200" stroke-linejoin="round">${[0, 1, 2].map((i) => `<path d="M${14 + i * 13} 8 C${23 + i * 13} 20 ${24 + i * 13} 34 ${18 + i * 13} 50 C${14 + i * 13} 36 ${10 + i * 13} 22 ${14 + i * 13} 8Z"/>`).join('')}</g>`,
  horns: (f, d) => `<path d="M6 12 C6 32 18 44 32 44 C46 44 58 32 58 12 C52 26 44 34 32 34 C20 34 12 26 6 12Z" fill="${f}" stroke="${d}" stroke-width="2.400" stroke-linejoin="round"/><path d="M26 38 L32 50 L38 38Z" fill="${f}" stroke="${d}" stroke-width="2.200" stroke-linejoin="round"/>`,
  antlers: (f, d) => `<g fill="none" stroke="${d}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><path d="M29 46 C27 36 22 30 16 12 M25 34 L12 30 M21 24 L9 20 M18 16 L18 4"/><path d="M35 46 C37 36 42 30 48 12 M39 34 L52 30 M43 24 L55 20 M46 16 L46 4"/></g><g fill="none" stroke="${f}" stroke-width="3.800" stroke-linecap="round" stroke-linejoin="round"><path d="M29 46 C27 36 22 30 16 12 M25 34 L12 30 M21 24 L9 20 M18 16 L18 4"/><path d="M35 46 C37 36 42 30 48 12 M39 34 L52 30 M43 24 L55 20 M46 16 L46 4"/></g>`,
  wingspread: (f, d) => {
    const feather = (sx, sign, L, a) => { const r = (a * Math.PI) / 180; const cx = sx + sign * Math.cos(r) * (L / 2); const cy = 38 - Math.sin(r) * (L / 2); return `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${L / 2}" ry="5.400" transform="rotate(${sign * -a} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`; };
    const set = [[24, 66], [27, 46], [27, 26], [23, 6]];
    return `<g fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round">${set.map(([L, a]) => feather(28, -1, L, a)).join('')}${set.map(([L, a]) => feather(36, 1, L, a)).join('')}</g><path d="M32 26 C38 32 38 44 32 54 C26 44 26 32 32 26Z" fill="${f}" stroke="${d}" stroke-width="2.200" stroke-linejoin="round"/><circle cx="32" cy="36" r="3" fill="${d}"/>`;
  },
  fin: (f, d) => `<path d="M15 44 C27 39 33 25 34 6 C36 23 41 35 52 44Z" fill="${f}" stroke="${d}" stroke-width="2.400" stroke-linejoin="round"/><path d="M12 51 Q17 46 22 51 T32 51 T42 51 T52 51" fill="none" stroke="${f}" stroke-width="3.800" stroke-linecap="round"/><path d="M12 51 Q17 46 22 51 T32 51 T42 51 T52 51" fill="none" stroke="${d}" stroke-width="1.200" stroke-linecap="round" opacity=".8"/>`,
  feather: (f, d) => `<path d="M16 50 C8 32 20 10 50 6 C54 26 40 44 20 50Z" fill="${f}" stroke="${d}" stroke-width="2.400" stroke-linejoin="round"/><path d="M16 50 L46 10" fill="none" stroke="${d}" stroke-width="2.200" stroke-linecap="round"/><path d="M24 40 L16 30 M30 33 L24 22 M36 26 L33 16 M28 42 L38 38 M34 35 L44 29 M40 28 L48 20" fill="none" stroke="${d}" stroke-width="1.400" stroke-linecap="round" opacity=".6"/>`,
  flame: (f, d) => `<path d="M32 12 C36 20 44 24 42 34 C41 40 37 44 32 44 C27 44 22 40 22 34 C22 28 27 26 28 20 C30 22 31 24 32 12Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M32 30 C35 34 36 38 32 40 C28 38 29 34 32 30Z" fill="${d}" opacity=".55"/>`,
  moon: (f, d) => `<path d="M38 14 C27 14 20 21 20 30 C20 39 27 46 36 46 C40 46 43 45 45 43 C38 43 32 37 32 30 C32 23 36 17 42 15 C41 14 40 14 38 14Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M44 24 L45.500 28 L50 28.500 L46.500 31 L47.800 35 L44 32.800 L40.200 35 L41.500 31 L38 28.500 L42.500 28Z" fill="${f}" stroke="${d}" stroke-width="1.200"/>`,
  mountain: (f, d) => `<path d="M14 44 L28 20 L34 30 L40 22 L52 44Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M28 20 L24 28 L28 27 L31 30Z M40 22 L37 28 L41 27 L44 31Z" fill="#fff" opacity=".75"/>`,
  horseshoe: (f, d) => `<path d="M20 44 V30 C20 20 26 14 32 14 C38 14 44 20 44 30 V44 H37 V30 C37 26 35 22 32 22 C29 22 27 26 27 30 V44Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>${[0, 1, 2].map((i) => `<circle cx="${23.500}" cy="${24 + i * 6}" r="1" fill="${d}"/><circle cx="${40.500}" cy="${24 + i * 6}" r="1" fill="${d}"/>`).join('')}`,
  fleur: (f, d) => `<path d="M32 12 C36 18 36 24 32 30 C28 24 28 18 32 12Z M22 22 C28 20 30 26 32 32 C26 34 20 30 22 22Z M42 22 C36 20 34 26 32 32 C38 34 44 30 42 22Z M24 36 H40 V40 H24Z M28 40 L32 46 L36 40Z" fill="${f}" stroke="${d}" stroke-width="1.600" stroke-linejoin="round"/>`,
  trident: (f, d) => `<g fill="none" stroke="${f}" stroke-width="3.500" stroke-linecap="round" stroke-linejoin="round"><path d="M32 14 V46 M22 16 V26 C22 32 27 34 32 34 C37 34 42 32 42 26 V16"/></g><g fill="${f}"><path d="M32 10 L28 17 H36Z M22 12 L19 18 H25Z M42 12 L39 18 H45Z"/></g>`,
};
const NAME_CHARGES = [
  [/colliery|mining|miners|steel|forge|works|quarry/i, ['hammer', 'wheel', 'bolt', 'horns']], [/wanderer/i, ['boot', 'feather', 'antlers', 'wingspread', 'ship', 'ball']], [/rover/i, ['claws', 'wheel', 'ball', 'paw']],
  [/town/i, ['tower', 'mane', 'antlers', 'oak', 'key']], [/city/i, ['mane', 'crown', 'wingspread', 'tower', 'ball']], [/united/i, ['mane', 'horns', 'star', 'wingspread', 'rose']],
  [/athletic|athletics/i, ['wingspread', 'ball', 'antlers', 'laurel']], [/port|harbo|dock|marsh|sea|bay/i, ['fin', 'anchor', 'ship', 'feather', 'trident']], [/rangers/i, ['wingspread', 'claws', 'paw', 'bolt']],
  [/royal|king|kings|sovereign/i, ['mane', 'crown', 'wingspread']], [/forest|wood|oak|thorn|ash/i, ['oak', 'antlers', 'feather', 'rose']], [/rose/i, ['rose']],
  [/albion/i, ['feather', 'mane']], [/county|shire/i, ['antlers', 'mane', 'oak']],
  [/fox/i, ['claws']], [/wolf|wulf/i, ['claws']], [/raven|crow|rook/i, ['wingspread', 'feather']], [/hart|stag|deer/i, ['antlers']], [/bull|ox/i, ['horns']], [/lion|leon/i, ['mane']], [/bear/i, ['paw']], [/swan|mere/i, ['feather']], [/hawk|eagle|falcon|kite/i, ['wingspread']], [/owl/i, ['feather']],
  [/sun|dawn|east/i, ['sun', 'star']], [/wing|swift/i, ['wingspread']], [/neptune|wave/i, ['trident', 'fin']], [/key|gate/i, ['key', 'tower']],
];
// 구단 성격(색채)이 상징 취향을 만든다
const COLOR_CHARGES = {
  richOwner: ['crown', 'mane', 'key', 'star'], risingForce: ['flame', 'wingspread', 'bolt', 'star'], attackingFlair: ['flame', 'bolt', 'mane', 'claws'], overseasScouting: ['ship', 'anchor', 'wingspread', 'trident'],
  veteranCore: ['mane', 'antlers', 'tower', 'oak'], youthDevelopment: ['oak', 'sun', 'ball', 'rose', 'feather'], defensiveWall: ['tower', 'horns', 'key', 'mountain', 'paw'], localRoots: ['rose', 'horseshoe', 'oak', 'wheel', 'fleur'],
  counterAttack: ['claws', 'fin', 'wingspread', 'bolt', 'paw'], financialTrouble: ['horseshoe', 'moon', 'feather', 'anchor', 'mountain'],
};
// 강팀일수록 화려한 장식, 약팀은 소박하게
const DECO_BY_KLASS = { strong: ['stars3', 'stars5', 'crownTop', 'crownStars', 'laurel', 'wings', 'stars2'], mid: null, weak: ['none', 'stars1', 'ribbonTop', 'none', 'stars2'] };
const CHARGE_IDS = Object.keys(CHARGES);
// 팀 색(kit)과 겹치지 않는 보조색
const SECOND = ['#f4f1e8', '#ffc400', '#1b1b1f', '#e8e8ea'];

const starPath = (cx, cy, r) => { const pts = []; for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.42 : r; const ang = -Math.PI / 2 + (i * Math.PI) / 5; pts.push(`${(cx + rr * Math.cos(ang)).toFixed(1)} ${(cy + rr * Math.sin(ang)).toFixed(1)}`); } return `M${pts.join(' L')}Z`; };
// 방패 바깥을 꾸미는 요소(실제 문장처럼 별·왕관·날개·월계수·리본)
const DECOS = {
  none: () => '',
  stars1: (gold, d) => `<path d="${starPath(32, 5.500, 4.200)}" fill="${gold}" stroke="${d}" stroke-width="1"/>`,
  stars2: (gold, d) => [[25, 6.500], [39, 6.500]].map(([x, y]) => `<path d="${starPath(x, y, 4)}" fill="${gold}" stroke="${d}" stroke-width="1"/>`).join(''),
  crownStars: (gold, d) => `<path d="M24 10 L25.500 3.500 L29 7 L32 2.500 L35 7 L38.500 3.500 L40 10Z" fill="${gold}" stroke="${d}" stroke-width="1.100" stroke-linejoin="round"/>`,
  stars3: (gold, d) => [[20, 7.500], [32, 4.500], [44, 7.500]].map(([x, y]) => `<path d="${starPath(x, y, 3.800)}" fill="${gold}" stroke="${d}" stroke-width="1"/>`).join(''),
  stars5: (gold, d) => [[14, 11], [23, 6.500], [32, 4.500], [41, 6.500], [50, 11]].map(([x, y]) => `<path d="${starPath(x, y, 3.200)}" fill="${gold}" stroke="${d}" stroke-width="1"/>`).join(''),
  crownTop: (gold, d) => `<path d="M22 11 L23.500 2.500 L28 7 L32 1.500 L36 7 L40.500 2.500 L42 11Z" fill="${gold}" stroke="${d}" stroke-width="1.200" stroke-linejoin="round"/>`,
  wings: (gold, d) => `<g fill="${gold}" stroke="${d}" stroke-width="1" stroke-linejoin="round"><path d="M9 30 C4 22 0 22 -1 24 C2 25 3 27 2 29 C5 28 7 30 6 33 C8 32 9 33 9 30Z" transform="translate(1 0)"/><path d="M55 30 C60 22 64 22 65 24 C62 25 61 27 62 29 C59 28 57 30 58 33 C56 32 55 33 55 30Z" transform="translate(-1 0)"/></g>`,
  laurel: (gold, d) => `<g fill="${gold}" stroke="${d}" stroke-width=".8">${Array.from({ length: 6 }, (_, i) => `<ellipse cx="${3.500 + Math.sin(i * 0.5) * 1.500}" cy="${52 - i * 8}" rx="2.200" ry="4" transform="rotate(${-25 + i * 6} 3.500 ${52 - i * 8})"/><ellipse cx="${60.500 - Math.sin(i * 0.5) * 1.500}" cy="${52 - i * 8}" rx="2.200" ry="4" transform="rotate(${25 - i * 6} 60.500 ${52 - i * 8})"/>`).join('')}</g>`,
  ribbonTop: (gold, d, label) => `<path d="M10 3 H54 L51 8 L54 13 H10 L13 8Z" fill="${gold}" stroke="${d}" stroke-width="1.200" stroke-linejoin="round"/><text x="32" y="10.500" text-anchor="middle" font-family="Anton, 'FM Square', sans-serif" font-size="6.500" letter-spacing=".6" fill="${d}">${label}</text>`,
};
const DECO_IDS = Object.keys(DECOS);
export const CREST_PARTS = { shape: Object.keys(SHAPES), field: Object.keys(FIELDS), charge: Object.keys(CHARGES), deco: DECO_IDS };



// ---- 디자인 선택(구단마다 다르게) ----
// 디자인 = 모양 + 바탕 무늬 + 상징 + 바깥 장식 + 이름 띠. 같은 조합은 한 번만 쓴다.
const designKey = (d) => `${d.shape}|${d.field}|${d.charge}|${d.deco}|${d.ring ? 1 : 0}`;
export { designKey };
function designFromSeed(club, salt) {
  const name = club.name ?? 'x';
  const seed = hash(`${club.id ?? name}#${salt}`);
  const byName = salt < 6 ? NAME_CHARGES.find(([re]) => re.test(name)) : null; // 충돌이 거듭되면 이름 단서를 버린다
  const byColor = salt < 6 ? COLOR_CHARGES[club.color] : null;
  const pool = [...(byName ? byName[1] : []), ...(byColor ?? [])];
  const shape = pick(seed, 3, CREST_PARTS.shape);
  const decoPool = salt < 6 && DECO_BY_KLASS[club.klass] ? DECO_BY_KLASS[club.klass] : CREST_PARTS.deco;
  return {
    shape,
    field: pick(seed, 7, CREST_PARTS.field),
    charge: pool.length ? pick(seed, 11, pool) : pick(seed, 11, CREST_PARTS.charge),
    deco: pick(seed, 19, decoPool),
    ring: (shape === 'round' || shape === 'oval') && (seed >>> 23) % 3 !== 0,
  };
}
import { CLUB_ROSTER } from '../data/clubs.mjs';
const ROSTER_DESIGN = new Map(); // 구단 이름 -> 디자인
const USED = new Set();
for (const tier of ['tier1', 'tier2', 'tier3', 'tier4', 'tier5']) {
  for (const c of CLUB_ROSTER[tier] ?? []) {
    let d;
    for (let salt = 0; salt < 600; salt++) { d = designFromSeed(c, salt); if (!USED.has(designKey(d))) break; }
    USED.add(designKey(d));
    ROSTER_DESIGN.set(c.name, d);
  }
}
export const isDesignFree = (d) => !USED.has(designKey(d));
// 내 구단용: 리그 구단이 쓰지 않는 디자인 중에서 무작위로 고른다
export function randomFreeDesign(rng = Math.random) {
  for (let i = 0; i < 500; i++) {
    const d = { shape: CREST_PARTS.shape[Math.floor(rng() * CREST_PARTS.shape.length)], field: CREST_PARTS.field[Math.floor(rng() * CREST_PARTS.field.length)], charge: CREST_PARTS.charge[Math.floor(rng() * CREST_PARTS.charge.length)], deco: CREST_PARTS.deco[Math.floor(rng() * CREST_PARTS.deco.length)] };
    d.ring = (d.shape === 'round' || d.shape === 'oval') && rng() < 0.65;
    if (isDesignFree(d)) return d;
  }
  return designFromSeed({ name: 'x' }, 999);
}
export function designOf(club) {
  if (club.crest) return club.crest;
  return ROSTER_DESIGN.get(club.name) ?? designFromSeed(club, 0);
}

// 보색 계열 보조색(채도 높게)
function complement(hex, shift = 0) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0; const dd = mx - mn;
  if (dd) h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
  h = (h * 60 + 180 + shift + 360) % 360;
  const l = 0.55, sat = 0.8;
  const k = (m) => (m + h / 30) % 12; const a = sat * Math.min(l, 1 - l);
  const f = (m) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(m) - 3, Math.min(9 - k(m), 1)))));
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
// 문장에서는 색이 또렷해야 해서, 지정 색이 없는 리그 구단은 채도와 밝기를 끌어올려 쓴다
function vivid(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0; const dd = mx - mn;
  if (dd) h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
  h = (h * 60 + 360) % 360;
  const l = Math.min(0.46, Math.max(0.34, (mx + mn) / 2)); const sat = 0.72;
  const k = (m) => (m + h / 30) % 12; const a = sat * Math.min(l, 1 - l);
  const f = (m) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(m) - 3, Math.min(9 - k(m), 1)))));
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
let crestCount = 0;
// 실제 구단 문장처럼: 굵은 이중 테두리 + 2색 바탕 + 크게 그린 상징(또는 큼직한 모노그램) + 별/왕관/리본.
// club: { name, kit, kit2?, crest? }. kit2가 있으면 보조색으로 쓴다.
export function renderCrest(club, { size = 40 } = {}) {
  const name = club.name ?? 'x';
  const seed = hash(club.id ?? name);
  const kit = club.crest ? (club.kit ?? '#2c4239') : vivid(club.kit ?? '#2c4239');
  const d = designOf(club);
  const shapeId = d.shape, fieldId = d.field, chargeId = d.charge, decoId = d.deco;
  const ringText = !!d.ring;
  const cands = [...SECOND, complement(kit), complement(kit, 40), '#14233f'].filter((c) => Math.abs(lum(c) - lum(kit)) > 0.28);
  const second = club.kit2 ?? (cands.length ? cands : ['#f4f1e8'])[(seed >>> 15) % (cands.length || 1)];
  const c1 = kit;
  const c2 = fieldId === 'solid' ? mix(kit, '#000000', 0.25) : second;
  const ink = '#14100f';
  const rim = lum(c1) > 0.55 ? '#1b1b1f' : '#f4f1e8'; // 바깥 테두리: 밝은 색 팀은 검정, 어두운 색 팀은 아이보리
  const gold = '#ffc400';
  const monogram = (seed >>> 27) % 4 === 0 && !ringText; // 네 곳에 한 곳쯤은 큼직한 이니셜 문장
  const words = name.trim().split(/\s+/);
  const initials = (words.length > 2 ? words.slice(0, 3).map((w) => w[0]).join('') : words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
  crestCount += 1;
  const id = `cr${seed}-${crestCount}`;
  const shape = SHAPES[shapeId];
  const busy = fieldId !== 'solid';
  // 상징 색: 바탕(두 색) 위에서 눈에 띄게 아이보리/금/검정 중 고른다
  const pickFill = () => {
    const opts = lum(c1) > 0.6 && !busy ? ['#14100f', '#f4f1e8'] : ['#f4f1e8', gold];
    const best = opts.filter((c) => Math.abs(lum(c) - lum(c1)) > 0.4 && (!busy || Math.abs(lum(c) - lum(c2)) > 0.3));
    return (best.length ? best : ['#f4f1e8'])[(seed >>> 9) % (best.length || 1)];
  };
  // 날개·가지뿔·발자국은 금빛으로, 나머지는 아이보리로(바탕과 어울리게)
  const chargeFill = ['wingspread', 'antlers', 'paw', 'mane'].includes(chargeId) && Math.abs(lum(gold) - lum(c1)) > 0.25 && (seed >>> 13) % 2 === 0 ? gold : pickFill();
  const plate = busy ? `<circle cx="32" cy="29" r="${monogram ? 17 : 19}" fill="${mix(c1, '#000000', 0.5)}" stroke="${rim}" stroke-width="2"/>` : '';
  const label = esc(words[0].slice(0, 6).toUpperCase());
  const ring = ringText ? `<circle cx="32" cy="32" r="25.500" fill="${mix(c1, '#000000', 0.45)}"/><path id="${id}r" d="M32 32 m-23 0 a23 23 0 1 1 46 0 a23 23 0 1 1 -46 0" fill="none"/><text font-family="Anton, 'FM Square', sans-serif" font-size="7.600" letter-spacing="1.600" fill="#f4f1e8"><textPath href="#${id}r" startOffset="25%" text-anchor="middle">${esc(name.toUpperCase())}</textPath></text><circle cx="32" cy="32" r="19" fill="${c1}"/><circle cx="32" cy="32" r="19" fill="none" stroke="${rim}" stroke-width="1.600"/>` : '';
  const bannerOn = !ringText && !monogram && (seed >>> 5) % 2 === 0; // 이니셜 띠는 절반만
  const banner = `<g><path d="M6 45 H58 L54 51 L58 57 H6 L10 51Z" fill="${mix(c1, '#000000', 0.6)}" stroke="${rim}" stroke-width="1.800" stroke-linejoin="round"/><text x="32" y="55" text-anchor="middle" font-family="Anton, 'FM Square', sans-serif" font-size="9.500" letter-spacing=".9" fill="#f4f1e8">${esc(initials.slice(0, 3))}</text></g>`;
  // 상징은 크게(방패의 60% 이상)
  const SYMBOL_SCALE = { antlers: 0.8, wingspread: 0.8, fin: 0.72, claws: 1, horns: 0.8, feather: 1, paw: 1, mane: 1 };
  const cScale = ringText ? 0.78 : (bannerOn ? 1.2 : 1.42) * (SYMBOL_SCALE[chargeId] ?? 1);
  const cy = ringText ? 32 : bannerOn ? 28 : 31;
  const symbol = monogram
    ? `<text x="32" y="${initials.length > 2 ? 40 : 43}" text-anchor="middle" font-family="Anton, 'FM Square', sans-serif" font-size="${initials.length > 2 ? 24 : 32}" letter-spacing="1" fill="${chargeFill}" stroke="${ink}" stroke-width="3.600" paint-order="stroke" stroke-linejoin="round">${esc(initials)}</text>`
    : `<g transform="translate(32 ${cy}) scale(${cScale}) translate(-32 -28)">${CHARGES[chargeId](chargeFill, ink)}</g>`;
  const body = `${plate}${symbol}${bannerOn ? banner : ''}`;
  const decoRaw = DECOS[decoId](gold, ink, label);
  const deco = decoId === 'wings' || decoId === 'laurel' || decoId === 'none' ? decoRaw : `<g transform="translate(32 6) scale(1.28) translate(-32 -6)">${decoRaw}</g>`;
  const sideDeco = decoId === 'wings' || decoId === 'laurel';
  const shieldScale = decoId === 'none' ? 0.97 : decoId === 'ribbonTop' ? 0.8 : 0.86;
  const ty = decoId === 'none' ? 32 : decoId === 'ribbonTop' ? 38 : 36;
  // 입체감: 왼쪽 위 하이라이트와 오른쪽 아래 그늘(완전 평면은 아니지만 그라디언트는 쓰지 않는다)
  const gloss = `<path d="M0 0 H64 V20 C44 18 22 28 0 44Z" fill="#fff" opacity=".13"/><path d="M64 30 V64 H30 C46 58 58 46 64 30Z" fill="#000" opacity=".16"/>`;
  return `<svg class="crest crest--v3" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="${esc(name)} 엠블럼" focusable="false">
    ${sideDeco ? deco : ''}
    <g transform="translate(32 ${ty}) scale(${shieldScale}) translate(-32 -32)">
      <path d="${shape}" fill="${rim}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
      <path d="${shape}" fill="${rim}" stroke="${rim}" stroke-width="3.600" stroke-linejoin="round"/>
      <clipPath id="${id}"><path d="${shape}"/></clipPath>
      <g transform="translate(32 32) scale(.94) translate(-32 -32)"><g clip-path="url(#${id})">${FIELDS[fieldId](c1, c2)}${gloss}</g></g>
      <path d="${shape}" fill="none" stroke="${ink}" stroke-width="1.200" stroke-linejoin="round" transform="translate(32 32) scale(.94) translate(-32 -32)" opacity=".7"/>
      ${ring}
      ${body}
    </g>
    ${sideDeco ? '' : deco}
  </svg>`;
}
