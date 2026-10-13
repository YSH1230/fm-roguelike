// 선수 초상화 v4: 익살스러운 스티커풍 상반신. 굵은 외곽선 + 큰 머리 + 과장된 표정과 손짓.
// 얼굴형·표정(눈/눈썹/입 묶음)·코·머리·수염·장신구·손짓을 id로 시드해 조합한다.
// 같은 선수는 어디서나 같은 얼굴이다. 실제 선수를 본뜨지 않는다(전부 절차적 생성).
import { mixHex, shade, light } from './pixel.mjs';

const INK = '#1a1010';
const SW = 3.2;
const SKIN = {
  africa: ['#8d5a3b', '#7a4a2e', '#9d6b49', '#6e4328'],
  southAmerica: ['#c68e60', '#b37b52', '#d6a073', '#a9724a'],
  asiaOceania: ['#eebf90', '#e0ad7e', '#f5cfa4', '#d8a574'],
  europe: ['#f6cfae', '#ecbf9a', '#fbdcc1', '#e4b48d'],
  northCentralAmerica: ['#d6a073', '#c48c60', '#e4b184', '#b8825a'],
};
const HAIR = ['#201814', '#3a2618', '#5a3720', '#8a5a2e', '#c18a3f', '#e0b84a', '#a8391f', '#d8d4cc', '#2b4a8a'];
export const TOON_EXPRESSIONS = ['yell', 'grin', 'smug', 'angry', 'goofy', 'cool', 'worried'];
const HEADS = [
  'M26 32 C26 16 38 11 50 11 C62 11 74 16 74 32 C74 54 64 68 50 68 C36 68 26 54 26 32Z', // 둥근
  'M25 30 C25 15 37 11 50 11 C63 11 75 15 75 30 L75 48 C75 62 65 69 50 69 C35 69 25 62 25 48Z', // 각진 턱
  'M28 28 C28 13 38 9 50 9 C62 9 72 13 72 28 L72 48 C72 62 62 76 50 76 C38 76 28 62 28 48Z', // 긴 얼굴
  'M21 36 C21 17 35 11 50 11 C65 11 79 17 79 36 C79 54 67 67 50 67 C33 67 21 54 21 36Z', // 넓은 볼
];
const HEAD_CY = [38, 40, 42, 38];

function hash(text, salt = '') {
  let h = 0x811c9dc5;
  const s = text + salt;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const pick = (s, shift, n) => (s >>> shift) % n;
const lum = (c) => { const n = parseInt(c.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };

let uid = 0;
export function toonPortrait(card, kit = '#4b3a9a', { expression } = {}) {
  const id = card.id ?? card.name ?? 'x';
  const s1 = hash(id), s2 = hash(id, 'b'), s3 = hash(id, 'c');
  const skins = SKIN[card.continentTag] ?? SKIN.europe;
  const skin = skins[pick(s1, 3, skins.length)];
  const skinS = shade(skin, 0.16);
  const old = (card.age ?? 25) >= 33;
  let hairC = HAIR[pick(s1, 8, HAIR.length)];
  if (old) hairC = mixHex(hairC, '#d8d4cc', 0.6);
  const hairD = shade(hairC, 0.28);
  const headIdx = pick(s2, 0, 4);
  const head = HEADS[headIdx];
  const cy = HEAD_CY[headIdx];
  const expr = expression ?? TOON_EXPRESSIONS[pick(s2, 3, TOON_EXPRESSIONS.length)];
  const noseT = pick(s2, 7, 4);
  const hairStyle = ['crop', 'spiky', 'afro', 'curly', 'long', 'slick', 'mohawk', 'topknot', 'bald', 'buzz', 'mullet', 'dreads'][pick(s2, 10, 12)];
  const facial = (card.age ?? 25) < 20 ? 0 : [0, 0, 0, 1, 2, 3, 4, 5][pick(s2, 14, 8)]; // 0 없음 1 까칠 2 콧수염 3 턱수염 4 염소수염 5 구레나룻
  const acc = [0, 1, 2, 3, 4, 4, 4, 4, 4][pick(s2, 18, 9)]; // 0 머리띠 1 귀걸이 2 흉터 3 주근깨 4 없음
  const pose = ['none', 'fist', 'cheer', 'point', 'chest', 'none'][pick(s3, 0, 6)];
  const earBig = pick(s3, 4, 5) === 0;
  const num = 1 + pick(s3, 8, 30);
  const clip = `tp${++uid}`;
  const shirt = kit;
  const shirtD = shade(shirt, 0.22);
  const shirtL = light(shirt, 0.3);
  const onShirt = lum(shirt) > 0.55 ? '#14100f' : '#ffffff';
  const sw = `stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round" stroke-linecap="round"`;
  const bgDark = mixHex(kit, '#0c0b10', 0.62);
  let o = '';
  o += `<rect width="100" height="100" fill="${bgDark}"/><circle cx="50" cy="44" r="42" fill="${mixHex(kit, '#0c0b10', 0.4)}"/>`;

  // ---- 뒤 머리카락 ----
  const back = {
    afro: `<circle cx="50" cy="28" r="31" fill="${hairC}" ${sw}/>`,
    long: `<path d="M20 30 C18 6 36 1 50 1 C64 1 82 6 80 30 L82 78 L66 78 L66 42 L34 42 L34 78 L18 78Z" fill="${hairC}" ${sw}/>`,
    dreads: [24, 32, 68, 76].map((x, i) => `<path d="M${x} 28 L${x + (i < 2 ? -3 : 3)} ${62 + (i % 2) * 8}" stroke="${INK}" stroke-width="9.500" stroke-linecap="round"/><path d="M${x} 28 L${x + (i < 2 ? -3 : 3)} ${62 + (i % 2) * 8}" stroke="${hairC}" stroke-width="5.500" stroke-linecap="round"/>`).join(''),
    mullet: `<path d="M26 40 L19 70 L36 62Z M74 40 L81 70 L64 62Z" fill="${hairC}" ${sw}/>`,
  }[hairStyle] ?? '';
  o += back;

  // ---- 몸 ----
  const armLine = (x1, y1, x2, y2) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${INK}" stroke-width="17" stroke-linecap="round"/><path d="M${x1} ${y1} L${x2} ${y2}" stroke="${shirt}" stroke-width="11" stroke-linecap="round"/>`;
  const fist = (x, y, r = 8) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${skin}" ${sw}/><path d="M${x - r * 0.45} ${y - r * 0.2} H${x + r * 0.45} M${x - r * 0.45} ${y + r * 0.25} H${x + r * 0.45}" stroke="${skinS}" stroke-width="1.400" stroke-linecap="round"/>`;
  if (pose === 'fist') o += armLine(80, 90, 86, 58) + fist(86, 50);
  if (pose === 'cheer') o += armLine(20, 92, 10, 58) + fist(9, 50) + armLine(80, 92, 90, 58) + fist(91, 50);
  if (pose === 'point') o += armLine(80, 92, 94, 66) + `<circle cx="95" cy="62" r="6" fill="${skin}" ${sw}/><path d="M97 58 L100 52" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M97 58 L100 52" stroke="${skin}" stroke-width="2.200" stroke-linecap="round"/>`;
  o += `<path d="M8 101 C8 82 22 72 42 70 L58 70 C78 72 92 82 92 101Z" fill="${shirt}" ${sw}/>`;
  o += `<path d="M8 101 C8 92 12 86 18 82 L22 101Z" fill="${shirtD}" opacity=".55"/>`;
  o += `<rect x="42" y="64" width="16" height="12" fill="${skinS}" ${sw}/>`;
  o += `<path d="M40 71 L50 84 L60 71 L56 69 L50 76 L44 69Z" fill="${shirtL}" ${sw}/>`;
  const stripe = pick(s1, 24, 4);
  if (stripe === 1) o += `<rect x="46" y="86" width="8" height="15" fill="${shirtL}" opacity=".7"/>`;
  if (stripe === 2) o += `<path d="M9 92 H91 M9 98 H91" stroke="${shirtL}" stroke-width="3" opacity=".7"/>`;
  o += `<text x="50" y="99" text-anchor="middle" font-family="Anton, sans-serif" font-size="15" fill="${onShirt}" opacity=".95">${num}</text>`;
  if (pose === 'chest') o += `<circle cx="64" cy="88" r="7" fill="${skin}" ${sw}/><path d="M60 86 H68 M60 90 H68" stroke="${skinS}" stroke-width="1.400" stroke-linecap="round"/>`;

  // ---- 귀 + 머리통 ----
  const er = earBig ? 8.500 : 6;
  o += `<circle cx="24" cy="${cy + 6}" r="${er}" fill="${skin}" ${sw}/><circle cx="76" cy="${cy + 6}" r="${er}" fill="${skinS}" ${sw}/>`;
  if (acc === 1) o += `<circle cx="22" cy="${cy + er + 5}" r="2.600" fill="#f2d24a" stroke="${INK}" stroke-width="1.400"/>`;
  o += `<clipPath id="${clip}"><path d="${head}"/></clipPath>`;
  o += `<path d="${head}" fill="${skin}"/>`;
  o += `<g clip-path="url(#${clip})"><path d="M66 0 C72 30 70 60 52 80 L100 80 V0Z" fill="${skinS}" opacity=".5"/></g>`;
  o += `<path d="${head}" fill="none" ${sw}/>`;

  // ---- 수염/구레나룻 (뒤) ----
  if (facial === 3) o += `<g clip-path="url(#${clip})"><path d="M20 ${cy + 8} C24 ${cy + 30} 38 ${cy + 44} 50 ${cy + 44} C62 ${cy + 44} 76 ${cy + 30} 80 ${cy + 8} L80 90 L20 90Z" fill="${hairD}"/></g><path d="${head}" fill="none" ${sw}/>`;
  if (facial === 5) o += `<g clip-path="url(#${clip})"><path d="M22 ${cy} L32 ${cy + 4} L32 ${cy + 22} L24 ${cy + 16}Z M78 ${cy} L68 ${cy + 4} L68 ${cy + 22} L76 ${cy + 16}Z" fill="${hairD}"/></g>`;
  if (facial === 1) o += `<g clip-path="url(#${clip})">${Array.from({ length: 34 }, (_, i) => `<circle cx="${28 + (i * 7) % 44}" cy="${cy + 14 + (i * 5) % 26}" r="0.9" fill="${hairD}" opacity=".8"/>`).join('')}</g>`;

  // ---- 눈 ----
  const ex = [39.500, 60.500];
  const ey = cy + 1;
  const eyeWhite = (x, rx = 6.200, ry = 7.200, dx = 0) => `<ellipse cx="${x}" cy="${ey}" rx="${rx}" ry="${ry}" fill="#fff" stroke="${INK}" stroke-width="2.600"/><circle cx="${x + dx}" cy="${ey + 0.8}" r="3.200" fill="${INK}"/><circle cx="${x + dx - 1.200}" cy="${ey - 0.800}" r="1.100" fill="#fff"/>`;
  const happyEye = (x) => `<path d="M${x - 6} ${ey + 3} Q${x} ${ey - 7} ${x + 6} ${ey + 3}" fill="none" stroke="${INK}" stroke-width="3.400" stroke-linecap="round"/>`;
  const smugEye = (x) => `<ellipse cx="${x}" cy="${ey + 1}" rx="6" ry="4.600" fill="#fff" stroke="${INK}" stroke-width="2.400"/><circle cx="${x + 1}" cy="${ey + 2}" r="2.600" fill="${INK}"/><path d="M${x - 7.500} ${ey - 1} H${x + 7.500}" stroke="${INK}" stroke-width="3.400" stroke-linecap="round"/><path d="M${x - 6.500} ${ey - 0.600} H${x + 6.500} V${ey - 5} H${x - 6.500}Z" fill="${skin}"/><path d="M${x - 7.500} ${ey - 1} H${x + 7.500}" stroke="${INK}" stroke-width="3.400" stroke-linecap="round"/>`;
  const angryEye = (x, inner) => `<ellipse cx="${x}" cy="${ey + 1}" rx="5.600" ry="5.400" fill="#fff" stroke="${INK}" stroke-width="2.400"/><circle cx="${x + (inner ? 1.500 : -1.500)}" cy="${ey + 2}" r="3" fill="${INK}"/>`;
  const dotEye = (x) => `<circle cx="${x}" cy="${ey + 1}" r="3" fill="${INK}"/><circle cx="${x - 0.900}" cy="${ey}" r="0.900" fill="#fff"/>`;
  const worriedEye = (x) => `<ellipse cx="${x}" cy="${ey + 1}" rx="5.800" ry="6.400" fill="#fff" stroke="${INK}" stroke-width="2.400"/><circle cx="${x}" cy="${ey - 0.500}" r="3" fill="${INK}"/><circle cx="${x - 1.100}" cy="${ey - 1.500}" r="1" fill="#fff"/>`;
  let eyes = '';
  let brows = '';
  const brow = (x1, y1, x2, y2, w = 4.600) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${INK}" stroke-width="${w + 2}" stroke-linecap="round"/><path d="M${x1} ${y1} L${x2} ${y2}" stroke="${old || hairStyle === 'bald' ? hairD : hairC}" stroke-width="${w}" stroke-linecap="round"/>`;
  const by = ey - 11;
  if (expr === 'yell') { eyes = eyeWhite(ex[0]) + eyeWhite(ex[1]); brows = brow(33, by - 1, 45, by + 3) + brow(67, by - 1, 55, by + 3); }
  if (expr === 'grin') { eyes = happyEye(ex[0]) + happyEye(ex[1]); brows = brow(33, by + 1, 45, by - 1, 3.600) + brow(67, by + 1, 55, by - 1, 3.600); }
  if (expr === 'smug') { eyes = smugEye(ex[0]) + smugEye(ex[1]); brows = brow(33, by, 45, by, 4) + brow(55, by - 4, 67, by - 1, 4); }
  if (expr === 'angry') { eyes = angryEye(ex[0], true) + angryEye(ex[1], true); brows = brow(32, by - 3, 46, by + 5, 5.500) + brow(68, by - 3, 54, by + 5, 5.500); }
  if (expr === 'goofy') { eyes = eyeWhite(ex[0], 6.200, 7.200, -2) + eyeWhite(ex[1], 6.200, 7.200, 2.500); brows = brow(33, by - 2, 45, by - 2) + brow(55, by - 4, 67, by - 4); }
  if (expr === 'cool') { eyes = dotEye(ex[0]) + dotEye(ex[1]); brows = brow(33, by + 1, 45, by + 1, 4) + brow(55, by + 1, 67, by + 1, 4); }
  if (expr === 'worried') { eyes = worriedEye(ex[0]) + worriedEye(ex[1]); brows = brow(33, by + 3, 45, by - 3, 4) + brow(67, by + 3, 55, by - 3, 4); }
  o += eyes + brows;
  if (old) o += `<path d="M32 ${ey + 9} Q36 ${ey + 11} 40 ${ey + 9} M60 ${ey + 9} Q64 ${ey + 11} 68 ${ey + 9}" fill="none" stroke="${skinS}" stroke-width="1.600" stroke-linecap="round"/>`;

  // ---- 코 ----
  const ny = cy + 12;
  if (noseT === 0) o += `<ellipse cx="50" cy="${ny}" rx="6" ry="5" fill="${skin}" ${sw}/><ellipse cx="48.500" cy="${ny - 1.500}" rx="1.800" ry="1.200" fill="#fff" opacity=".4"/>`;
  if (noseT === 1) o += `<path d="M50 ${ny - 10} Q57 ${ny + 1} 50 ${ny + 4} Q47 ${ny + 4} 46 ${ny + 1}" fill="${skin}" ${sw}/>`;
  if (noseT === 2) o += `<circle cx="50" cy="${ny + 1}" r="3.200" fill="${skinS}" ${sw}/>`;
  if (noseT === 3) o += `<path d="M43 ${ny + 2} Q50 ${ny + 8} 57 ${ny + 2} Q57 ${ny - 3} 50 ${ny - 3} Q43 ${ny - 3} 43 ${ny + 2}Z" fill="${skin}" ${sw}/><circle cx="47" cy="${ny + 3}" r="1" fill="${INK}"/><circle cx="53" cy="${ny + 3}" r="1" fill="${INK}"/>`;

  // ---- 입 ----
  const my = cy + 24;
  const teethLine = (x1, y1, x2, y2) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${INK}" stroke-width="1.200"/>`;
  if (expr === 'yell') o += `<path d="M36 ${my - 3} Q50 ${my - 6} 64 ${my - 3} Q62 ${my + 16} 50 ${my + 16} Q38 ${my + 16} 36 ${my - 3}Z" fill="#4a1414" ${sw}/><path d="M38 ${my - 3} Q50 ${my - 5} 62 ${my - 3} L61 ${my + 1} Q50 ${my - 1} 39 ${my + 1}Z" fill="#fff"/><ellipse cx="50" cy="${my + 11}" rx="8" ry="4.500" fill="#e0605a"/>`;
  if (expr === 'grin') o += `<path d="M35 ${my - 3} Q50 ${my + 14} 65 ${my - 3} Q50 ${my - 6} 35 ${my - 3}Z" fill="#fff" ${sw}/>${teethLine(50, my - 4, 50, my + 7)}${teethLine(42, my - 3, 43, my + 5)}${teethLine(58, my - 3, 57, my + 5)}`;
  if (expr === 'smug') o += `<path d="M40 ${my + 2} Q52 ${my + 4} 62 ${my - 5}" fill="none" stroke="${INK}" stroke-width="3.400" stroke-linecap="round"/><path d="M63 ${my - 3} Q66 ${my - 1} 65 ${my + 2}" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
  if (expr === 'angry') o += `<rect x="38" y="${my - 3}" width="24" height="10" rx="3" fill="#fff" ${sw}/>${[44, 50, 56].map((x) => teethLine(x, my - 3, x, my + 7)).join('')}${teethLine(38, my + 2, 62, my + 2)}`;
  if (expr === 'goofy') o += `<path d="M38 ${my - 2} Q50 ${my + 8} 62 ${my - 2}" fill="none" stroke="${INK}" stroke-width="3.400" stroke-linecap="round"/><path d="M45 ${my + 3} Q46 ${my + 15} 54 ${my + 13} Q56 ${my + 8} 55 ${my + 3}Z" fill="#e0605a" ${sw}/><path d="M50 ${my + 4} V${my + 10}" stroke="#b03a36" stroke-width="1.400"/>`;
  if (expr === 'cool') o += `<path d="M42 ${my + 1} H58" stroke="${INK}" stroke-width="3.400" stroke-linecap="round"/>`;
  if (expr === 'worried') o += `<path d="M42 ${my + 4} Q50 ${my - 2} 58 ${my + 4}" fill="none" stroke="${INK}" stroke-width="3.400" stroke-linecap="round"/>`;
  // 수염 (앞)
  if (facial === 2) o += `<path d="M37 ${my - 6} Q44 ${my - 12} 50 ${my - 8} Q56 ${my - 12} 63 ${my - 6} Q57 ${my - 4} 50 ${my - 5} Q43 ${my - 4} 37 ${my - 6}Z" fill="${hairD}" ${sw}/>`;
  if (facial === 4) o += `<path d="M44 ${my + 8} Q50 ${my + 22} 56 ${my + 8} Q50 ${my + 12} 44 ${my + 8}Z" fill="${hairD}" ${sw}/>`;
  if (facial === 3) o += `<path d="M36 ${my - 5} Q50 ${my - 12} 64 ${my - 5}" fill="none" stroke="${hairD}" stroke-width="4" stroke-linecap="round" opacity=".0"/>`;

  // 볼 홍조 · 장신구
  o += `<ellipse cx="31" cy="${cy + 15}" rx="4.600" ry="2.600" fill="#e0605a" opacity=".35"/><ellipse cx="69" cy="${cy + 15}" rx="4.600" ry="2.600" fill="#e0605a" opacity=".35"/>`;
  if (acc === 2) o += `<path d="M58 ${cy - 6} L68 ${cy + 8}" stroke="#b33a36" stroke-width="2.200" stroke-linecap="round"/><path d="M60 ${cy + 0} L65 ${cy - 1} M62 ${cy + 4} L67 ${cy + 3}" stroke="#b33a36" stroke-width="1.400" stroke-linecap="round"/>`;
  if (acc === 3) o += [[34, 16], [38, 19], [31, 20], [66, 16], [62, 19], [69, 20], [36, 21], [64, 21]].map(([x, y]) => `<circle cx="${x}" cy="${cy + y}" r="1.100" fill="${shade(skin, 0.3)}"/>`).join('');

  // ---- 앞 머리카락 ----
  const hp = {
    crop: `<path d="M25 36 C22 12 38 5 50 5 C64 5 78 12 75 36 C70 26 62 22 50 22 C38 22 30 26 25 36Z" fill="${hairC}" ${sw}/>`,
    spiky: `<path d="M25 38 L21 18 L32 24 L35 6 L44 21 L51 2 L58 21 L67 6 L69 24 L79 18 L75 38 C70 28 62 25 50 25 C38 25 30 28 25 38Z" fill="${hairC}" ${sw}/>`,
    afro: `<path d="M27 34 C29 22 40 18 50 18 C60 18 71 22 73 34 C67 28 59 26 50 26 C41 26 33 28 27 34Z" fill="${hairC}" ${sw}/>`,
    curly: `<g fill="${hairC}" ${sw}>${[[31, 24], [41, 14], [53, 12], [64, 16], [72, 26]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9.500"/>`).join('')}<path d="M26 38 C28 24 40 22 50 22 C60 22 72 24 74 38 C68 30 60 28 50 28 C40 28 32 30 26 38Z"/></g>`,
    long: `<path d="M25 36 C22 12 38 5 50 5 C64 5 78 12 75 36 C70 26 62 22 50 22 C38 22 30 26 25 36Z" fill="${hairC}" ${sw}/>`,
    slick: `<path d="M24 40 C19 12 40 3 54 5 C70 7 79 20 76 40 C72 30 66 21 52 21 C40 23 30 30 24 40Z" fill="${hairC}" ${sw}/><path d="M34 14 Q46 8 58 12" fill="none" stroke="${light(hairC, 0.4)}" stroke-width="2.200" stroke-linecap="round"/>`,
    mohawk: `<path d="M26 34 C26 24 36 20 50 20 C64 20 74 24 74 34 C68 28 60 26 50 26 C40 26 32 28 26 34Z" fill="${hairD}" ${sw} opacity=".9"/><path d="M41 24 L38 0 L50 8 L62 0 L59 24Z" fill="${hairC}" ${sw}/>`,
    topknot: `<circle cx="50" cy="3" r="8.500" fill="${hairC}" ${sw}/><path d="M25 36 C22 12 38 8 50 8 C64 8 78 12 75 36 C70 26 62 22 50 22 C38 22 30 26 25 36Z" fill="${hairC}" ${sw}/>`,
    bald: `<ellipse cx="42" cy="17" rx="7" ry="3.200" fill="#fff" opacity=".45" transform="rotate(-18 42 17)"/>`,
    buzz: `<path d="M26 34 C24 14 38 9 50 9 C62 9 76 14 74 34 C70 26 62 21 50 21 C38 21 30 26 26 34Z" fill="${hairD}" opacity=".85" ${sw}/>`,
    mullet: `<path d="M25 36 C22 12 38 5 50 5 C64 5 78 12 75 36 C70 26 62 22 50 22 C38 22 30 26 25 36Z" fill="${hairC}" ${sw}/>`,
    dreads: `<path d="M25 36 C22 12 38 5 50 5 C64 5 78 12 75 36 C70 26 62 22 50 22 C38 22 30 26 25 36Z" fill="${hairC}" ${sw}/>`,
  }[hairStyle];
  o += hp;
  if (acc === 0) o += `<path d="M24 ${cy - 8} Q50 ${cy - 18} 76 ${cy - 8} L76 ${cy - 1} Q50 ${cy - 11} 24 ${cy - 1}Z" fill="${shirtL}" ${sw}/>`;
  // 땀방울·분노 표시(표정에 맞춰)
  if (expr === 'worried') o += `<path d="M84 22 Q88 30 84 33 Q80 30 84 22Z" fill="#8fd3ff" ${sw}/>`;
  if (expr === 'angry') o += `<path d="M82 18 L86 24 L92 22 M84 30 L90 32" stroke="#ff4a3a" stroke-width="2.600" fill="none" stroke-linecap="round"/>`;
  return o;
}

export const renderToonPortrait = (card, { size = 44, kit = '#4b3a9a', expression } = {}) =>
  `<svg class="portrait portrait--toon" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${(card.name ?? '').replace(/"/g, '')} 초상" focusable="false">${toonPortrait(card, kit, { expression })}</svg>`;
