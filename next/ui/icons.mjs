// 직접 그린 아이콘(24칸 격자, 선 두께 2). 이모지·유니코드 글자를 아이콘으로 쓰지 않는다.
const PATHS = {
  coin: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>',
  fans: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.5 0 4.5 2 4.5 4.5"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 01-8 0V4z"/><path d="M8 6H4v1a4 4 0 004 4M16 6h4v1a4 4 0 01-4 4M12 13v4M8 20h8"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M12 8l3.5 2.5-1.3 4h-4.4l-1.3-4zM12 3v5M20 9.5l-4.5 1M17 19l-2.8-4.5M7 19l2.8-4.5M4 9.5l4.5 1"/>',
  cross: '<path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  jersey: '<path d="M8 4L3 7l2 4 2-1v10h10V10l2 1 2-4-5-3a4 4 0 01-8 0z"/>',
  office: '<path d="M4 21V9l8-5 8 5v12M9 21v-6h6v6"/>',
  book: '<path d="M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h10"/>',
  right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  medal: '<circle cx="12" cy="15" r="5"/><path d="M8.5 3l3.5 6M15.5 3L12 9"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bolt: '<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
};

export function icon(name, size = 20, cls = '') {
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}

// 사기 얼굴 5단계(선으로 그린 표정). 낮을수록 입꼬리가 내려가고 빨갛게 변한다.
const FACES = {
  5: '<path d="M7.5 14c1 3 8 3 9 0z" fill="currentColor"/>',
  4: '<path d="M8 14.5c1.2 1.8 6.8 1.8 8 0"/>',
  3: '<path d="M8.5 15.5h7"/>',
  2: '<path d="M8 17c1.2-1.8 6.8-1.8 8 0"/>',
  1: '<path d="M8 17.5c1.2-1.8 6.8-1.8 8 0M7 8.5l3 1.2M17 8.5l-3 1.2"/>',
};
export const moodLevel = (mood) => (mood >= 80 ? 5 : (mood >= 60 ? 4 : (mood >= 40 ? 3 : (mood >= 20 ? 2 : 1))));

export function moodFace(mood, size = 22) {
  const lv = moodLevel(mood);
  return `<svg class="face face--${lv}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="사기 ${Math.round(mood)}"><circle cx="12" cy="12" r="9"/><path d="M9 9.5v.5M15 9.5v.5"/>${FACES[lv]}</svg>`;
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
