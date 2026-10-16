import { ATTRIBUTES } from '../engine/constants.mjs';
import { askingSalary } from '../engine/contract.mjs';
import { continentOf, nameOf, teamIdentity } from '../engine/names.mjs';
import { overall } from '../engine/player.mjs';
import { xpNeeded } from '../engine/growth.mjs';
import { renderPortrait } from './portrait.mjs';
import { renderCrest } from './crest2.mjs';
import { icon, moodFace, stars } from './icons.mjs';

export const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const POS_LABEL = { GK: '골키퍼', DF: '수비수', MF: '미드필더', FW: '공격수' };
export const ATTR_LABEL = {
  reflexes: '반응', handling: '핸들링', positioning: '위치 선정', stamina: '체력', tackling: '태클', marking: '대인',
  heading: '헤딩', passing: '패스', vision: '시야', workrate: '활동량', shooting: '슈팅', pace: '속도', dribbling: '드리블',
};
export const AWARD_LABEL = {
  ballonDor: '발롱도르', mvp: '시즌 MVP', goldenBoot: '골든부트', assistKing: '도움왕', goldenGlove: '골든글러브', youngStar: '올해의 영건',
};
export const TIER_LABEL = { 1: '1부', 2: '2부', 3: '3부' };
export const REASON_TEXT = {
  cap: '샐러리캡 여유가 부족합니다', rank: '작년 순위가 선수의 요구에 못 미칩니다', facility: '시설 수준이 선수의 요구에 못 미칩니다',
  fans: '팬 수가 선수의 요구에 못 미칩니다', morale: '팀 사기가 선수의 요구에 못 미칩니다', salary: '제시 금액이 요구보다 낮습니다',
  mood: '선수 사기가 낮아 거절했습니다', roster: '스타 자리가 가득 찼습니다. 먼저 한 명을 내보내세요',
};
// 내 구단 색 후보(빨강·노랑은 행동·금액 신호색이라 뺀다)
export const KIT_CHOICES = [
  ['#2f6fed', '파랑'], ['#1f9d6a', '초록'], ['#8a4fd6', '보라'], ['#e07a1f', '주황'],
  ['#18a5b3', '청록'], ['#d6508a', '분홍'], ['#4aa3e8', '하늘'], ['#7a8a3a', '올리브'],
];

// 팀 색 위의 글자색: 밝기에 따라 검정 또는 흰색
export function onColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.55 ? '#0b0b0b' : '#ffffff';
}

// 점(·)으로 이어 붙인 한 줄 대신, 사실마다 칸을 나눠 간격으로 구분한다
export const facts = (...parts) => `<span class="facts">${parts.filter(Boolean).map((x) => `<span>${x}</span>`).join('')}</span>`;

export const bar = (value, cls = '') => `<span class="bar ${cls}" role="img" aria-label="${Math.round(value)}%"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></span>`;
export const chip = (text, cls = '') => `<span class="chip ${cls}">${esc(text)}</span>`;
export { icon, moodFace, stars };

export function effectChips(effects) {
  const out = [];
  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
  if (effects.teamMood) out.push(chip(`팀 사기 ${sign(effects.teamMood)}`, effects.teamMood > 0 ? 'up' : 'down'));
  if (effects.playerMood) out.push(chip(`선수 사기 ${sign(effects.playerMood)}`, effects.playerMood > 0 ? 'up' : 'down'));
  if (effects.fans) out.push(chip(`팬 ${sign(effects.fans)}`, effects.fans > 0 ? 'up' : 'down'));
  if (effects.coins) out.push(chip(`코인 ${sign(effects.coins)}`, effects.coins > 0 ? 'coin' : 'down'));
  if (effects.rest) out.push(chip('다음 구간 휴식', 'up'));
  return out.join('');
}

export function conditionTexts(conditions) {
  const out = [];
  if (conditions.maxRank !== undefined) out.push(`작년 ${conditions.maxRank}위 이상`);
  if (conditions.minFacility !== undefined) out.push(`시설 ${conditions.minFacility} 이상`);
  if (conditions.minFans !== undefined) out.push(`팬 ${conditions.minFans} 이상`);
  if (conditions.minMorale !== undefined) out.push(`팀 사기 ${conditions.minMorale} 이상`);
  return out;
}

export const portrait = (p, { size = 48, kit } = {}) =>
  renderPortrait({ id: p.id, name: nameOf(p.id), continentTag: continentOf(p.id), age: p.age }, { size, kit, role: 'player' });

export const teamKit = (game, id) => (id === game.myTeam.id ? game.clubKit : teamIdentity(id).kit);
export const teamName = (game, id) => (id === game.myTeam.id ? game.clubName : teamIdentity(id).name);
export const crest = (game, id, size = 28) => renderCrest({ id, name: teamName(game, id), kit: teamKit(game, id) }, { size });

// 선수 얼굴 타일: 팀 색 바탕 위에 도트 초상화, 포지션 뱃지는 왼쪽 아래(팀 색과 무관하게 고정)
export function faceTile(p, { kit, size = 48 } = {}) {
  return `<span class="tile" style="--tile:${kit};--on-tile:${onColor(kit)}">${portrait(p, { size, kit })}<span class="pos" title="${POS_LABEL[p.position]}">${p.position}</span></span>`;
}

export const abilityStars = (p, size = 16) => stars(overall(p) / 20, p.potential / 20, size);

// 후보·FA·신인·재계약처럼 목록에서 쓰는 한 줄 선수 행
// 목록의 선수 행은 어두운 면에 구단 색 얼굴 타일만 둔다(구단 색 면은 선수 상세 카드 한 장에만).
export function playerRow(p, { kit, note = '', action = '', contract = false, stack = false } = {}) {
  const hurt = (p.injury?.chunksLeft ?? 0) > 0;
  return `<article class="prow${hurt ? ' prow--hurt' : ''}${stack ? ' prow--stack' : ''}">
    ${faceTile(p, { kit })}
    <div class="prow__main">
      <h4 class="prow__name">${esc(nameOf(p.id))}<small>${p.age}세</small></h4>
      ${abilityStars(p)}
      <div class="attrs-mini">${Object.entries(p.attrs).map(([k, v]) => `<span>${ATTR_LABEL[k]}<b>${v}</b></span>`).join('')}</div>
      ${note}
    </div>
    <div class="prow__side">${contract ? `<span class="num">${p.contract.salary}</span><small>${p.contract.years}년 계약</small>` : ''}${action}</div>
  </article>`;
}

export function attrBars(p) {
  return ATTRIBUTES[p.position].map((k) => `<div class="attr"><span>${ATTR_LABEL[k]}</span>${bar(p.attrs[k])}<b>${p.attrs[k]}</b></div>`).join('');
}

export const xpBar = (p) => bar((p.xp / xpNeeded(p.xpLevel)) * 100, 'xp');
export const askText = (p) => `요구 ${askingSalary(p)}`;
