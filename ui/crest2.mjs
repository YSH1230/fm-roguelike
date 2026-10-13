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
  wings: (f, d) => `<g fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"><path d="M31 30 C24 16 14 16 10 20 C16 22 18 26 16 30 C22 28 26 32 24 38 C29 35 31 36 31 30Z"/><path d="M33 30 C40 16 50 16 54 20 C48 22 46 26 48 30 C42 28 38 32 40 38 C35 35 33 36 33 30Z"/></g>`,
  ship: (f, d) => `<path d="M15 36 H49 L43 45 H21Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M32 14 V36" stroke="${d}" stroke-width="2.500"/><path d="M33 16 L46 32 H33Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M31 20 L20 32 H31Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>`,
  key: (f, d) => `<g fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"><circle cx="32" cy="19" r="7"/><circle cx="32" cy="19" r="2.500" fill="${d}"/><rect x="29.500" y="25" width="5" height="18"/><path d="M34.500 35 H40 V38 H34.500Z M34.500 41 H38 V44 H34.500Z"/></g>`,
  bolt: (f, d) => `<path d="M36 12 L22 32 H31 L27 46 L43 24 H33Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>`,
  wheel: (f, d) => `<g stroke="${d}" stroke-width="2" fill="${f}"><circle cx="32" cy="28" r="13"/><circle cx="32" cy="28" r="9" fill="none"/><circle cx="32" cy="28" r="3" fill="${d}"/>${[0, 45, 90, 135].map((a) => `<path d="M32 19 V37" transform="rotate(${a} 32 28)" stroke="${d}"/>`).join('')}</g>`,
  rose: (f, d) => `<g fill="${f}" stroke="${d}" stroke-width="1.500">${[0, 72, 144, 216, 288].map((a) => `<circle cx="32" cy="18" r="6" transform="rotate(${a} 32 28)"/>`).join('')}<circle cx="32" cy="28" r="5" fill="${d}"/></g>`,
  boot: (f, d) => `<path d="M20 16 H31 V28 C31 32 36 33 42 35 C46 36 47 40 44 42 H20Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M22 42 V46 M28 42 V46 M34 42 V46 M40 42 V46" stroke="${d}" stroke-width="2.500" stroke-linecap="round"/>`,
  oak: (f, d) => `<path d="M32 44 V30 M32 30 C24 30 20 24 22 18 C26 18 30 21 32 25 C34 21 38 18 42 18 C44 24 40 30 32 30Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="16" r="3" fill="${f}" stroke="${d}" stroke-width="2"/>`,

  // ---- 동물 (정면 머리 위주, 굵은 선) ----
  lion: (f, d) => `<path d="M32 9 L36 14 L42 12 L43 18 L49 19 L47 25 L52 29 L47 33 L49 39 L43 40 L42 46 L36 44 L32 49 L28 44 L22 46 L21 40 L15 39 L17 33 L12 29 L17 25 L15 19 L21 18 L22 12 L28 14Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="29" r="11" fill="${f}" stroke="${d}" stroke-width="2"/><circle cx="32" cy="29" r="11" fill="#fff" opacity=".28"/><circle cx="27.500" cy="26" r="1.800" fill="${d}"/><circle cx="36.500" cy="26" r="1.800" fill="${d}"/><path d="M29.500 31 H34.500 L32 34Z" fill="${d}"/><path d="M32 34 V36 M27.500 37 Q32 40 36.500 37" fill="none" stroke="${d}" stroke-width="1.800" stroke-linecap="round"/><circle cx="24" cy="19" r="3" fill="${f}" stroke="${d}" stroke-width="1.600"/><circle cx="40" cy="19" r="3" fill="${f}" stroke="${d}" stroke-width="1.600"/>`,
  wolf: (f, d) => `<path d="M17 9 L26 19 H38 L47 9 L50 30 L41 44 L32 49 L23 44 L14 30Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M32 26 L40 40 L32 47 L24 40Z" fill="#fff" opacity=".3"/><path d="M22 27 L28 29 M42 27 L36 29" stroke="${d}" stroke-width="2.600" stroke-linecap="round"/><circle cx="26" cy="29" r="1.500" fill="${d}"/><circle cx="38" cy="29" r="1.500" fill="${d}"/><path d="M29 41 H35 L32 46Z" fill="${d}"/><path d="M20 12 L24 18 M44 12 L40 18" stroke="${d}" stroke-width="1.400"/>`,
  bull: (f, d) => `<path d="M24 22 H40 L39 38 C38 44 35 47 32 47 C29 47 26 44 25 38Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M24 24 C14 24 10 17 12 8 M40 24 C50 24 54 17 52 8" fill="none" stroke="${d}" stroke-width="7" stroke-linecap="round"/><path d="M24 24 C14 24 10 17 12 8 M40 24 C50 24 54 17 52 8" fill="none" stroke="#fff" stroke-width="3.400" stroke-linecap="round" opacity=".85"/><circle cx="28" cy="30" r="1.800" fill="${d}"/><circle cx="36" cy="30" r="1.800" fill="${d}"/><path d="M26 40 Q32 44 38 40" fill="none" stroke="${d}" stroke-width="2"/><circle cx="29.500" cy="41" r="1.200" fill="${d}"/><circle cx="34.500" cy="41" r="1.200" fill="${d}"/><path d="M19 24 L24 30 M45 24 L40 30" stroke="${d}" stroke-width="3" stroke-linecap="round"/>`,
  stag: (f, d) => `<path d="M26 22 H38 L36 38 L32 46 L28 38Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><g fill="none" stroke="${d}" stroke-width="5" stroke-linecap="round"><path d="M27 22 L20 10 M20 10 L13 7 M23 15 L16 16 M20 10 L21 3"/><path d="M37 22 L44 10 M44 10 L51 7 M41 15 L48 16 M44 10 L43 3"/></g><g fill="none" stroke="${f}" stroke-width="2.200" stroke-linecap="round"><path d="M27 22 L20 10 M20 10 L13 7 M23 15 L16 16 M20 10 L21 3"/><path d="M37 22 L44 10 M44 10 L51 7 M41 15 L48 16 M44 10 L43 3"/></g><circle cx="29" cy="30" r="1.600" fill="${d}"/><circle cx="35" cy="30" r="1.600" fill="${d}"/><path d="M30 41 H34 L32 44Z" fill="${d}"/><path d="M24 24 L21 29 L27 28Z M40 24 L43 29 L37 28Z" fill="${f}" stroke="${d}" stroke-width="1.600" stroke-linejoin="round"/>`,
  fox: (f, d) => `<path d="M14 10 L26 22 H38 L50 10 L48 34 L32 49 L16 34Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M32 30 L46 34 L32 49 L18 34Z" fill="#fff" opacity=".82"/><path d="M19 14 L25 22 M45 14 L39 22" stroke="${d}" stroke-width="2" opacity=".6"/><path d="M24 28 L29 30 M40 28 L35 30" stroke="${d}" stroke-width="2.600" stroke-linecap="round"/><path d="M29.500 41 H34.500 L32 45Z" fill="${d}"/>`,
  eagle: (f, d) => `<path d="M30 28 L6 12 L10 22 L2 24 L10 29 L6 36 L16 35 L15 42 L30 38Z M34 28 L58 12 L54 22 L62 24 L54 29 L58 36 L48 35 L49 42 L34 38Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M26 31 L32 50 L38 31 Q32 26 26 31Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="22" r="7" fill="${f}" stroke="${d}" stroke-width="2"/><path d="M28.500 23 L32 31 L35.500 23Z" fill="#ffc400" stroke="${d}" stroke-width="1.600" stroke-linejoin="round"/><circle cx="29.500" cy="20" r="1.400" fill="${d}"/><circle cx="34.500" cy="20" r="1.400" fill="${d}"/>`,
  owl: (f, d) => `<path d="M18 12 L24 18 H40 L46 12 L48 36 C48 44 40 50 32 50 C24 50 16 44 16 36Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><circle cx="25" cy="27" r="7.500" fill="#fff" stroke="${d}" stroke-width="2"/><circle cx="39" cy="27" r="7.500" fill="#fff" stroke="${d}" stroke-width="2"/><circle cx="25" cy="28" r="3.200" fill="${d}"/><circle cx="39" cy="28" r="3.200" fill="${d}"/><path d="M29.500 31 H34.500 L32 37Z" fill="#ffc400" stroke="${d}" stroke-width="1.400" stroke-linejoin="round"/><path d="M24 42 Q32 47 40 42" fill="none" stroke="${d}" stroke-width="1.600" opacity=".6"/>`,
  bear: (f, d) => `<circle cx="20" cy="17" r="6" fill="${f}" stroke="${d}" stroke-width="2"/><circle cx="44" cy="17" r="6" fill="${f}" stroke="${d}" stroke-width="2"/><path d="M16 28 C16 16 24 14 32 14 C40 14 48 16 48 28 C48 40 42 47 32 47 C22 47 16 40 16 28Z" fill="${f}" stroke="${d}" stroke-width="2"/><ellipse cx="32" cy="36" rx="9" ry="7" fill="#fff" opacity=".3"/><circle cx="25" cy="27" r="1.800" fill="${d}"/><circle cx="39" cy="27" r="1.800" fill="${d}"/><ellipse cx="32" cy="34" rx="3.600" ry="2.600" fill="${d}"/><path d="M32 36 V39 M28 40 Q32 43 36 40" fill="none" stroke="${d}" stroke-width="1.800" stroke-linecap="round"/>`,
  shark: (f, d) => `<path d="M6 35 C16 26 30 24 38 12 C40 22 46 29 58 35 C48 36 42 41 34 48 C30 41 20 38 6 35Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M34 48 L38 40 L42 44Z M14 33 L10 28 L20 31Z" fill="${f}" stroke="${d}" stroke-width="1.600" stroke-linejoin="round"/><circle cx="46" cy="33" r="1.600" fill="${d}"/><path d="M52 34 L56 34 M24 33 Q26 37 24 41 M28 32 Q30 36 28 40" fill="none" stroke="${d}" stroke-width="1.400" stroke-linecap="round"/><path d="M48 37 L50 39 L52 37 L54 39 L56 36" fill="#fff" stroke="${d}" stroke-width="1"/>`,
  swan: (f, d) => `<path d="M14 40 C14 46 22 49 32 49 C44 49 50 44 48 38 C44 40 36 40 30 36 C26 32 30 28 34 24 C38 20 38 14 33 12 C28 10 25 14 27 18" fill="none" stroke="${d}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 40 C14 46 22 49 32 49 C44 49 50 44 48 38 C44 40 36 40 30 36 C26 32 30 28 34 24 C38 20 38 14 33 12 C28 10 25 14 27 18" fill="none" stroke="${f}" stroke-width="4.200" stroke-linecap="round" stroke-linejoin="round"/><path d="M26 17 L20 19 L27 22Z" fill="#ff8a3d" stroke="${d}" stroke-width="1.400" stroke-linejoin="round"/><circle cx="29.500" cy="15" r="1.200" fill="${d}"/>`,
  flame: (f, d) => `<path d="M32 12 C36 20 44 24 42 34 C41 40 37 44 32 44 C27 44 22 40 22 34 C22 28 27 26 28 20 C30 22 31 24 32 12Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M32 30 C35 34 36 38 32 40 C28 38 29 34 32 30Z" fill="${d}" opacity=".55"/>`,
  moon: (f, d) => `<path d="M38 14 C27 14 20 21 20 30 C20 39 27 46 36 46 C40 46 43 45 45 43 C38 43 32 37 32 30 C32 23 36 17 42 15 C41 14 40 14 38 14Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M44 24 L45.500 28 L50 28.500 L46.500 31 L47.800 35 L44 32.800 L40.200 35 L41.500 31 L38 28.500 L42.500 28Z" fill="${f}" stroke="${d}" stroke-width="1.200"/>`,
  mountain: (f, d) => `<path d="M14 44 L28 20 L34 30 L40 22 L52 44Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M28 20 L24 28 L28 27 L31 30Z M40 22 L37 28 L41 27 L44 31Z" fill="#fff" opacity=".75"/>`,
  horseshoe: (f, d) => `<path d="M20 44 V30 C20 20 26 14 32 14 C38 14 44 20 44 30 V44 H37 V30 C37 26 35 22 32 22 C29 22 27 26 27 30 V44Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>${[0, 1, 2].map((i) => `<circle cx="${23.500}" cy="${24 + i * 6}" r="1" fill="${d}"/><circle cx="${40.500}" cy="${24 + i * 6}" r="1" fill="${d}"/>`).join('')}`,
  fleur: (f, d) => `<path d="M32 12 C36 18 36 24 32 30 C28 24 28 18 32 12Z M22 22 C28 20 30 26 32 32 C26 34 20 30 22 22Z M42 22 C36 20 34 26 32 32 C38 34 44 30 42 22Z M24 36 H40 V40 H24Z M28 40 L32 46 L36 40Z" fill="${f}" stroke="${d}" stroke-width="1.600" stroke-linejoin="round"/>`,
  horns: (f, d) => `<path d="M14 16 C14 26 22 30 28 30 L30 36 H34 L36 30 C42 30 50 26 50 16 C46 22 42 24 36 24 H28 C22 24 18 22 14 16Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M28 36 H36 L34 46 H30Z" fill="${f}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>`,
  trident: (f, d) => `<g fill="none" stroke="${f}" stroke-width="3.500" stroke-linecap="round" stroke-linejoin="round"><path d="M32 14 V46 M22 16 V26 C22 32 27 34 32 34 C37 34 42 32 42 26 V16"/></g><g fill="${f}"><path d="M32 10 L28 17 H36Z M22 12 L19 18 H25Z M42 12 L39 18 H45Z"/></g>`,
};
const NAME_CHARGES = [
  [/colliery|mining|miners|steel|forge|works|quarry/i, ['hammer', 'wheel', 'bolt', 'bull']], [/wanderer/i, ['boot', 'fox', 'stag', 'eagle', 'ship', 'ball']], [/rover/i, ['wolf', 'wheel', 'ball', 'bear']],
  [/town/i, ['tower', 'lion', 'stag', 'oak', 'key']], [/city/i, ['lion', 'crown', 'eagle', 'tower', 'ball']], [/united/i, ['lion', 'bull', 'star', 'eagle', 'rose']],
  [/athletic|athletics/i, ['eagle', 'ball', 'stag', 'wings']], [/port|harbo|dock|marsh|sea|bay/i, ['shark', 'anchor', 'ship', 'swan', 'trident']], [/rangers/i, ['eagle', 'wolf', 'bear', 'bolt']],
  [/royal|king|kings|sovereign/i, ['lion', 'crown', 'eagle']], [/forest|wood|oak|thorn|ash/i, ['oak', 'stag', 'owl', 'rose']], [/rose/i, ['rose']],
  [/albion/i, ['swan', 'lion']], [/county|shire/i, ['stag', 'lion', 'oak']],
  [/fox/i, ['fox']], [/wolf|wulf/i, ['wolf']], [/raven|crow|rook/i, ['eagle', 'owl']], [/hart|stag|deer/i, ['stag']], [/bull|ox/i, ['bull']], [/lion|leon/i, ['lion']], [/bear/i, ['bear']], [/swan|mere/i, ['swan']], [/hawk|eagle|falcon|kite/i, ['eagle']], [/owl/i, ['owl']],
  [/sun|dawn|east/i, ['sun', 'star']], [/wing|swift/i, ['wings', 'eagle']], [/neptune|wave/i, ['trident', 'shark']], [/key|gate/i, ['key', 'tower']],
];
// 구단 성격(색채)이 상징 취향을 만든다
const COLOR_CHARGES = {
  richOwner: ['crown', 'lion', 'key', 'star'], risingForce: ['flame', 'eagle', 'bolt', 'star'], attackingFlair: ['flame', 'bolt', 'wings', 'lion'], overseasScouting: ['ship', 'anchor', 'eagle', 'wings', 'trident'],
  veteranCore: ['lion', 'stag', 'tower', 'oak'], youthDevelopment: ['oak', 'sun', 'ball', 'rose', 'swan'], defensiveWall: ['tower', 'bear', 'bull', 'key', 'mountain'], localRoots: ['rose', 'horseshoe', 'oak', 'wheel', 'fleur'],
  counterAttack: ['wolf', 'fox', 'eagle', 'shark', 'bolt'], financialTrouble: ['horseshoe', 'moon', 'owl', 'anchor', 'mountain'],
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

let crestCount = 0;
// club: { name, kit, kit2?, crest? }. kit2가 있으면 보조색으로 쓴다.
export function renderCrest(club, { size = 40 } = {}) {
  const name = club.name ?? 'x';
  const seed = hash(club.id ?? name);
  const kit = club.kit ?? '#2c4239';
  const d = designOf(club);
  const shapeId = d.shape, fieldId = d.field, chargeId = d.charge, decoId = d.deco;
  const ringText = !!d.ring;
  const cands = SECOND.filter((c) => Math.abs(lum(c) - lum(kit)) > 0.35);
  const second = club.kit2 ?? (cands.length ? cands : ['#f4f1e8'])[(seed >>> 15) % (cands.length || 1)];
  const c1 = kit;
  const c2 = fieldId === 'solid' ? kit : second;
  const ink = '#14100f';
  const chargeFill = lum(c1) > 0.6 ? '#14100f' : (lum(second) > 0.6 ? second : '#f4f1e8');
  const rim = lum(c1) > 0.55 ? '#14100f' : '#f4f1e8';
  const gold = '#ffc400';
  const words = name.trim().split(/\s+/);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
  crestCount += 1;
  const id = `cr${seed}-${crestCount}`;
  const shape = SHAPES[shapeId];
  const busy = fieldId !== 'solid';
  const disc = busy ? `<circle cx="32" cy="28" r="15.500" fill="${mix(c1, '#000000', 0.45)}" opacity=".92"/>` : '';
  const banner = `<g><path d="M6 43 H58 L54 49.500 L58 56 H6 L10 49.500Z" fill="${mix(c1, '#000000', 0.55)}" stroke="${rim}" stroke-width="1.600" stroke-linejoin="round"/><text x="32" y="53.700" text-anchor="middle" font-family="Anton, 'FM Square', sans-serif" font-size="9.500" letter-spacing=".8" fill="#f4f1e8">${esc(initials)}</text></g>`;
  const label = esc(words[0].slice(0, 6).toUpperCase());
  const ring = ringText ? `<circle cx="32" cy="32" r="25" fill="none" stroke="${mix(c1, '#000000', 0.5)}" stroke-width="9"/><path id="${id}r" d="M32 32 m-24 0 a24 24 0 1 1 48 0 a24 24 0 1 1 -48 0" fill="none"/><text font-family="Anton, 'FM Square', sans-serif" font-size="7.200" letter-spacing="1.400" fill="#f4f1e8"><textPath href="#${id}r" startOffset="25%" text-anchor="middle">${esc(name.toUpperCase())}</textPath></text>` : '';
  const innerScale = ringText ? 0.72 : 1;
  const body = `<g transform="translate(32 ${ringText ? 32 : 31}) scale(${innerScale}) translate(-32 -${ringText ? 32 : 31})">${disc}<g>${CHARGES[chargeId](chargeFill, ink)}</g>${ringText ? '' : banner}</g>`;
  const deco = DECOS[decoId](gold, ink, label);
  const sideDeco = decoId === 'wings' || decoId === 'laurel';
  const shieldScale = decoId === 'none' ? 0.96 : decoId === 'ribbonTop' ? 0.8 : 0.84;
  const ty = decoId === 'none' ? 32 : decoId === 'ribbonTop' ? 38 : 36;
  return `<svg class="crest crest--v3" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="${esc(name)} 엠블럼" focusable="false">
    ${sideDeco ? deco : ''}
    <g transform="translate(32 ${ty}) scale(${shieldScale}) translate(-32 -32)">
      <clipPath id="${id}"><path d="${shape}"/></clipPath>
      <g clip-path="url(#${id})">${FIELDS[fieldId](c1, c2)}</g>
      ${ring}
      <path d="${shape}" fill="none" stroke="${rim}" stroke-width="3.400" stroke-linejoin="round"/>
      <path d="${shape}" fill="none" stroke="#14100f" stroke-width="1" stroke-linejoin="round" transform="translate(32 32) scale(.93) translate(-32 -32)" opacity=".5"/>
      ${body}
    </g>
    ${sideDeco ? '' : deco}
  </svg>`;
}
