// 스타디움 성장 5단계(5부=1단계 … 1부=5단계). 픽셀 느낌의 작은 SVG. 승격 화면·런 종료 화면에서만 보여 준다.
const LADDER = ['tier5', 'tier4', 'tier3', 'tier2', 'tier1'];
export const stadiumLevel = (tierId) => Math.max(1, LADDER.indexOf(tierId) + 1);

export function stadiumHtml(level, kit = '#ccff00') {
  const r = (x, y, w, h, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
  const parts = [];
  // 잔디와 라인
  parts.push(r(0, 38, 120, 18, '#2f7a46'), r(0, 38, 120, 2, '#3f9a5a'), r(58, 40, 2, 16, '#ffffff22'), r(40, 44, 40, 8, 'none', 'stroke="#ffffff33" stroke-width="1"'));
  const crowd = (x, y, w, rows) => {
    for (let i = 0; i < rows; i++) {
      parts.push(r(x, y + i * 3, w, 3, i % 2 ? '#3a4a42' : '#2c3a34'));
      for (let cx = x + 1 + (i % 2); cx < x + w - 1; cx += 3) parts.push(r(cx, y + i * 3, 1.4, 1.6, i % 3 ? kit : '#f0ead9'));
    }
  };
  // 관중석: 단계가 오를수록 늘고 높아진다
  const rows = [2, 3, 3, 4, 5][level - 1];
  crowd(8, 38 - rows * 3, 26, rows); // 왼쪽
  if (level >= 2) crowd(86, 38 - rows * 3, 26, rows); // 오른쪽
  if (level >= 3) { crowd(36, 38 - (rows + 1) * 3 - 2, 48, rows + 1); parts.push(r(36, 36, 48, 2, '#1d2824')); } // 뒤쪽 스탠드
  if (level >= 4) { parts.push(r(6, 38 - rows * 3 - 3, 30, 3, '#d9d2c0'), r(84, 38 - rows * 3 - 3, 30, 3, '#d9d2c0')); } // 지붕
  if (level >= 5) { parts.push(r(34, 38 - (rows + 1) * 3 - 5, 52, 3, '#d9d2c0')); }
  // 조명탑
  const lights = level >= 5 ? [4, 114, 30, 88] : level >= 3 ? [4, 114] : [];
  for (const x of lights) parts.push(r(x, 8, 2, 30, '#8c978f'), r(x - 3, 5, 8, 4, '#fff7c2'));
  // 구단 깃발
  if (level >= 4) parts.push(r(59, 6, 1, 14, '#8c978f'), r(60, 6, 8, 5, kit));
  const top = level <= 2 ? 22 : 0; // 낮은 단계는 위쪽 빈 하늘을 잘라 낸다
  return `<svg class="stadium" viewBox="0 ${top} 120 ${56 - top}" width="240" role="img" aria-label="스타디움 ${level}단계" shape-rendering="crispEdges">${parts.join('')}</svg>`;
}
