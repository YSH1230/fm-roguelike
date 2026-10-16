import { ATTRIBUTES } from '../engine/constants.mjs';
import { askingSalary } from '../engine/contract.mjs';
import { continentOf, nameOf, teamIdentity } from '../engine/names.mjs';
import { overall, starsOf } from '../engine/player.mjs';
import { xpNeeded } from '../engine/growth.mjs';
import { renderPortrait } from './portrait.mjs';
import { renderCrest } from './crest2.mjs';

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

// 별 0.5 단위. 채운 비율만큼 색이 칠해진다.
export const starsHtml = (value, cls = '') => `<span class="stars ${cls}" style="--v:${(value / 5) * 100}%" role="img" aria-label="별 ${value}개">★★★★★</span>`;
export const bar = (value, cls = '') => `<span class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></span>`;
export const moodFace = (mood) => (mood >= 75 ? '😄' : (mood >= 55 ? '🙂' : (mood >= 40 ? '😐' : (mood >= 25 ? '😟' : '😡'))));
export const chip = (text, cls = '') => `<span class="chip ${cls}">${esc(text)}</span>`;

export function effectChips(effects) {
  const out = [];
  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
  if (effects.teamMood) out.push(chip(`팀 사기 ${sign(effects.teamMood)}`, effects.teamMood > 0 ? 'good' : 'bad'));
  if (effects.playerMood) out.push(chip(`선수 사기 ${sign(effects.playerMood)}`, effects.playerMood > 0 ? 'good' : 'bad'));
  if (effects.fans) out.push(chip(`팬 ${sign(effects.fans)}`, effects.fans > 0 ? 'good' : 'bad'));
  if (effects.coins) out.push(chip(`코인 ${sign(effects.coins)}`, effects.coins > 0 ? 'good' : 'bad'));
  if (effects.rest) out.push(chip('다음 구간 휴식', 'good'));
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

export function teamName(game, id) {
  return id === game.myTeam.id ? game.clubName : teamIdentity(id).name;
}

export function crest(game, id, size = 28) {
  const t = id === game.myTeam.id ? { name: game.clubName, kit: '#2e8b57' } : teamIdentity(id);
  return renderCrest({ id, name: t.name, kit: t.kit }, { size });
}

// 선수 카드(로스터 한 줄 이상): 초상화, 이름, 포지션, 현재·잠재 별, XP 바, 사기 표정, 컨디션, 계약
export function playerCard(p, { rest = false, action = '' } = {}) {
  const now = starsOf(overall(p));
  const pot = starsOf(p.potential);
  const hurt = (p.injury?.chunksLeft ?? 0) > 0;
  return `<article class="pcard${hurt ? ' pcard--hurt' : ''}" data-act="sheet" data-id="${esc(p.id)}">
    <div class="pcard__face">${portrait(p, { size: 52 })}<span class="pos pos--${p.position}">${p.position}</span></div>
    <div class="pcard__main">
      <div class="pcard__name">${esc(nameOf(p.id))} <small>${p.age}세</small>${hurt ? ' <span class="chip bad">부상</span>' : ''}${rest ? ' <span class="chip">휴식</span>' : ''}</div>
      <div class="pcard__stars">${starsHtml(now)} <span class="pot">잠재 ${starsHtml(pot, 'stars--pot')}</span></div>
      <div class="pcard__bars"><span title="XP">Lv${p.xpLevel} ${bar((p.xp / xpNeeded(p.xpLevel)) * 100, 'xp')}</span><span title="컨디션">컨 ${bar(p.condition, p.condition < 50 ? 'low' : 'cond')}</span></div>
    </div>
    <div class="pcard__side"><span class="face">${moodFace(p.mood)}</span><span class="money">${p.contract.salary}<small> / ${p.contract.years}년</small></span>${action}</div>
  </article>`;
}

// 후보·FA처럼 아직 우리 선수가 아닌 선수의 요약 카드
export function prospectCard(p, { note = '', action = '' } = {}) {
  const now = starsOf(overall(p));
  return `<article class="pcard pcard--plain">
    <div class="pcard__face">${portrait(p, { size: 48 })}<span class="pos pos--${p.position}">${p.position}</span></div>
    <div class="pcard__main">
      <div class="pcard__name">${esc(nameOf(p.id))} <small>${p.age}세</small></div>
      <div class="pcard__stars">${starsHtml(now)} <span class="pot">잠재 ${starsHtml(starsOf(p.potential), 'stars--pot')}</span></div>
      <div class="attrs-mini">${Object.entries(p.attrs).map(([k, v]) => `<span>${ATTR_LABEL[k]} <b>${v}</b></span>`).join('')}</div>
      ${note}
    </div>
    <div class="pcard__side">${action}</div>
  </article>`;
}

export function attrBars(p) {
  return ATTRIBUTES[p.position].map((k) => `<div class="attr"><span>${ATTR_LABEL[k]}</span>${bar(p.attrs[k], 'attrbar')}<b>${p.attrs[k]}</b></div>`).join('');
}

export const askText = (p) => `요구 연봉 ${askingSalary(p)}`;
