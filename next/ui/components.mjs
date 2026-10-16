import { ATTRIBUTES } from '../engine/constants.mjs';
import { askingSalary } from '../engine/contract.mjs';
import { continentOf, nameOf, teamIdentity } from '../engine/names.mjs';
import { overall, starsOf } from '../engine/player.mjs';
import { xpNeeded } from '../engine/growth.mjs';
import { renderPortrait } from './portrait.mjs';
import { renderCrest } from './crest2.mjs';
import { icon, moodFace, stars } from './icons.mjs';

export const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const POS_LABEL = { GK: '골키퍼', DF: '수비수', MF: '미드필더', FW: '공격수' };
export const ATTR_LABEL = {
  diving: 'DIV', handling: 'HAN', reflexes: 'REF', positioning: 'POS',
  pace: 'PAC', shooting: 'SHO', passing: 'PAS', dribbling: 'DRI', defending: 'DEF', physical: 'PHY',
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
// 내 구단 색 = 화면의 "YOU" 색(내 수치, 내 선수, 주 행동). 기본은 주황.
export const KIT_CHOICES = [
  ['#ff4a1c', '주황'], ['#2f7bff', '파랑'], ['#19e0b0', '민트'], ['#ffd500', '노랑'],
  ['#ff4fa3', '핑크'], ['#8b5cff', '보라'], ['#b6f500', '라임'], ['#ffffff', '하양'],
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

// 업적 배지의 금·은·동 그라디언트(이 배지 테두리와 아이콘 선에만 쓴다). 페이지에 한 번만 넣는다.
export const METAL_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="g-gold" gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="21" y2="21"><stop offset="0" stop-color="#fff3b0"/><stop offset=".3" stop-color="#f0c94c"/><stop offset=".55" stop-color="#b8860b"/><stop offset=".78" stop-color="#f8e58a"/><stop offset="1" stop-color="#a67c12"/></linearGradient>
  <linearGradient id="g-silver" gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="21" y2="21"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#d5dade"/><stop offset=".55" stop-color="#8d949c"/><stop offset=".78" stop-color="#eef1f3"/><stop offset="1" stop-color="#7b828a"/></linearGradient>
  <linearGradient id="g-bronze" gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="21" y2="21"><stop offset="0" stop-color="#ffd9b0"/><stop offset=".3" stop-color="#dc8f50"/><stop offset=".55" stop-color="#8f4f21"/><stop offset=".78" stop-color="#f0b685"/><stop offset="1" stop-color="#6e3a14"/></linearGradient></defs></svg>`;

export const metalIcon = (name, tier, size = 36) => icon(name, size).replace('<svg ', `<svg style="stroke:url(#g-${tier})" `);

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

// 별은 0.5 단위로만 움직인다. 진한 칸 = 지금 실력, 구단 색 칸 = 앞으로 클 수 있는 여지(잠재).
export function abilityStars(p, size = 16) {
  const cur = starsOf(overall(p));
  return stars(cur, Math.max(cur, starsOf(p.potential)), size);
}

// 후보·FA·신인·재계약처럼 목록에서 쓰는 한 줄 선수 행
// 목록의 선수 행은 어두운 면에 구단 색 얼굴 타일만 둔다(구단 색 면은 선수 상세 카드 한 장에만).
export function playerRow(p, { kit, note = '', action = '', contract = false, stack = false, stats = true, detail = '', tag = false } = {}) {
  const hurt = (p.injury?.chunksLeft ?? 0) > 0;
  return `<article class="prow${hurt ? ' prow--hurt' : ''}${stack ? ' prow--stack' : ''}">
    ${faceTile(p, { kit })}
    <div class="prow__main">
      <h4 class="prow__name"><span class="prow__nm">${esc(nameOf(p.id))}</span>${tag ? '' : `<small>AGE ${p.age}</small>`}</h4>
      ${tag ? `<div class="prow__meta"><span class="tag">${p.position}</span><small>AGE ${p.age}</small>${abilityStars(p)}</div>` : abilityStars(p)}
      ${stats ? `<div class="attrs-mini">${Object.entries(p.attrs).map(([k, v]) => `<span>${ATTR_LABEL[k]}<b>${v}</b></span>`).join('')}</div>` : ''}
      ${note}
    </div>
    <div class="prow__side">${contract ? `<span class="num">${p.contract.salary}</span><small>${p.contract.years}년 계약</small>` : ''}${action}</div>
    ${detail}
  </article>`;
}

export function attrBars(p) {
  return ATTRIBUTES[p.position].map((k) => `<div class="attr"><span>${ATTR_LABEL[k]}</span>${bar(p.attrs[k])}<b>${p.attrs[k]}</b></div>`).join('');
}

export const xpBar = (p) => bar((p.xp / xpNeeded(p.xpLevel)) * 100, 'xp');
export const askText = (p) => `요구 ${askingSalary(p)}`;
