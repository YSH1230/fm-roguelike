// 아이콘: 24 격자, 선 굵기 3, 끝은 잘린 모양(butt), 꺾임은 miter. 직선·직각·45도·원호로만 그리고,
// 틈 없이 이어 그리며 대칭 사물은 중심선 x=12에 맞춘다. 이모지·기호 글자를 아이콘으로 쓰지 않는다.
const SET = {
  roster: '<path d="M8 3.5h2.5L12 6l1.5-2.5H16l5.5 4-2 4.5-3.5-1.5V21H8V10.5L4.5 12l-2-4.5z"/>',
  table: '<path d="M3.5 6h17M3.5 12h17M3.5 18h11"/>',
  front: '<path d="M3.5 21V10.5L12 4l8.5 6.5V21z"/><path d="M9 21v-6h6v6"/>',
  records: '<path d="M4 4h11.5A2.5 2.5 0 0 1 18 6.5V21H7A3 3 0 0 1 4 18z"/><path d="M4 18a3 3 0 0 1 3-3h11"/><path d="M8 8.5h6"/>',
  play: '<path d="M7 4.5L19.5 12 7 19.5z"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M8 8.8l1.8 6.4L12 10.8l2.2 4.4L16 8.8"/><path d="M7.5 12h9"/>',
  fans: '<circle cx="7" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M2.5 20.5v-1.5a4.5 4.5 0 0 1 9 0v1.5"/><path d="M12.5 20.5v-1.5a4.5 4.5 0 0 1 9 0v1.5"/>',
  rest: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  upgrade: '<path d="M12 20.5V5M5.5 11.5L12 5l6.5 6.5"/>',
  injury: '<path d="M9 3.5h6v5.5h5.5v6H15v5.5H9V15H3.5V9H9z"/>',
  mic: '<rect x="9" y="3" width="6" height="11"/><path d="M5 11.5v1a7 7 0 0 0 14 0v-1"/><path d="M12 19.5v2"/><path d="M8.5 21.5h7"/>',
  chat: '<path d="M4 4.5h16v11.5h-9L6.5 20.5V16H4z"/><path d="M8.5 10h7"/>',
  transfer: '<path d="M4 13L13 4"/><path d="M8 4h5v5"/><path d="M20 11L11 20"/><path d="M16 20h-5v-5"/>',
  check: '<path d="M4.5 12.5l5 5L19.5 7"/>',
  close: '<path d="M5 5l14 14M19 5L5 19"/>',
  next: '<path d="M3.5 12h17M13.5 5.5l7 6.5-7 6.5"/>',
  globe: '<circle cx="12" cy="10" r="7.5"/><ellipse cx="12" cy="10" rx="3.6" ry="7.5"/><path d="M4.5 10h15"/><path d="M12 17.5v4M8 21.5h8"/>',
  medal: '<path d="M7.5 2.5l3 6.5"/><path d="M16.5 2.5L13.5 9"/><circle cx="12" cy="15" r="6"/><path d="M12 13v4"/>',
  flag: '<path d="M5 21V4.5h14l-3.5 4 3.5 4H5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v6"/><path d="M12 7v.1"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  down: '<path d="M4.5 8.5L12 16l7.5-7.5"/>',
  bolt: '<path d="M13.5 2.5L5 13.5h6l-1 8L19 10.5h-6z"/>',
  shield: '<path d="M12 3L4.5 6v6c0 4.5 3 7.5 7.5 9 4.5-1.5 7.5-4.5 7.5-9V6z"/>',
  ball: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8.7l3.1 2.3-1.2 3.7h-3.8L8.9 11z"/><path d="M12 8.7V3.5M15.1 11l5-1.6M13.9 14.7l3.1 4.2M10.1 14.7l-3.1 4.2M8.9 11l-5-1.6"/>',
  manager: '<circle cx="12" cy="8" r="4.2"/><path d="M3.5 20.5V16.5h17v4z"/>',
  training: '<path d="M10.5 3.5h3L18.5 19h-13z"/><path d="M8.2 12.5h7.6"/><path d="M3 21.5h18"/>',
  condition: '<path d="M12 20.5C6 15.5 3.5 12.5 3.5 9a4.5 4.5 0 0 1 8.5-2 4.5 4.5 0 0 1 8.5 2c0 3.5-2.5 6.5-8.5 11.5z"/>',
  trophy: '<path d="M8 3.5h8v7.5a4 4 0 0 1-8 0z"/><path d="M8 5.5H3.5v4H8M16 5.5h4.5v4H16"/><path d="M12 15.5v4"/><path d="M7.5 21h9"/>',
};
// 예전 이름도 같은 그림을 가리킨다(화면 코드가 옛 이름을 그대로 쓴다)
const ALIAS = { moon: 'rest', up: 'upgrade', cross: 'injury', swap: 'transfer', list: 'table', jersey: 'roster', office: 'front', book: 'records', right: 'next' };

export function icon(name, size = 20, cls = '') {
  const body = SET[ALIAS[name] ?? name];
  if (!body) throw new Error(`알 수 없는 아이콘: ${name}`);
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="butt" stroke-linejoin="miter" aria-hidden="true" focusable="false">${body}</svg>`;
}

export const ICON_NAMES = Object.keys(SET);

// 사기 얼굴 5단계: 입 모양만 달라진다(선으로 그린 표정).
const FACES = {
  5: '<path d="M7.5 14.5h9"/><path d="M7.5 14.5c1 4 8 4 9 0"/>',
  4: '<path d="M8 15c1.2 2 6.8 2 8 0"/>',
  3: '<path d="M8 16h8"/>',
  2: '<path d="M8 17.5c1.2-2 6.8-2 8 0"/>',
  1: '<path d="M8 18c1.2-2 6.8-2 8 0M7 8l3.5 1.5M17 8l-3.5 1.5"/>',
};
export const moodLevel = (mood) => (mood >= 80 ? 5 : (mood >= 60 ? 4 : (mood >= 40 ? 3 : (mood >= 20 ? 2 : 1))));

export function moodFace(mood, size = 22) {
  const lv = moodLevel(mood);
  return `<svg class="face face--${lv}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="butt" stroke-linejoin="miter" role="img" aria-label="사기 ${Math.round(mood)}"><circle cx="12" cy="12" r="9"/><path d="M9 10v.1M15 10v.1"/>${FACES[lv]}</svg>`;
}

// 별 5개: 현재 실력(채움), 잠재력까지(옅은 채움), 나머지(윤곽). 0.5 단위 값 두 개를 받는다.
const STAR = 'M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2 6.3 20.3l1.2-6.4L2.8 9.5l6.4-.8z';
let starId = 0;
export function stars(current, potential = current, size = 16) {
  const id = `s${(starId += 1)}`;
  const row = (cls) => Array.from({ length: 5 }, (_, i) => `<path class="${cls}" transform="translate(${i * 24} 0)" d="${STAR}"/>`).join('');
  return `<svg class="stars" width="${size * 5}" height="${size}" viewBox="0 0 120 24" role="img" aria-label="별 ${current}개, 잠재 ${potential}개">
    <defs><clipPath id="${id}c"><rect width="${(current / 5) * 120}" height="24"/></clipPath><clipPath id="${id}p"><rect width="${(potential / 5) * 120}" height="24"/></clipPath></defs>
    ${row('st-base')}<g clip-path="url(#${id}p)">${row('st-pot')}</g><g clip-path="url(#${id}c)">${row('st-cur')}</g></svg>`;
}
