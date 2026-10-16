import { nameOf } from '../engine/names.mjs';

import { teamRatings } from '../engine/ratings.mjs';
import {
  AWARD_LABEL, POS_LABEL, abilityStars, attrBars, bar, chip, esc, faceTile, icon, moodFace, onColor, portrait, xpBar,
} from './components.mjs';

// 위에서부터 공격 -> 미드 -> 수비 -> 골키퍼. 세로 위치(%)
const ROW_Y = { FW: 19, MF: 42, DF: 66, GK: 88 };
const ORDER = ['FW', 'MF', 'DF', 'GK'];

const PITCH_LINES = `<svg class="pitch__lines" viewBox="0 0 100 108" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <rect x="3" y="3" width="94" height="102" rx="2"/><path d="M3 24h94"/>
  <path d="M30 105V89h40v16M40 105V97h20v8"/><path d="M37 24a13 13 0 0026 0"/>
</svg>`;

const short = (id) => nameOf(id).split(' ').slice(-1)[0];
const isHurt = (p) => (p.injury?.chunksLeft ?? 0) > 0;

// 축구장 라인업 보드: 11명 중 스타 6명은 얼굴 타일, 조연 5명은 작은 점으로 보인다.
export function pitchBoard(game, ui) {
  const team = game.myTeam;
  const kit = game.clubKit;
  const stars = new Set(team.stars);
  const nodes = [];
  for (const pos of ORDER) {
    const group = team.lineup.filter((p) => p.position === pos);
    group.forEach((p, i) => {
      const x = ((i + 1) / (group.length + 1)) * 100;
      const y = ROW_Y[pos];
      if (!stars.has(p)) {
        nodes.push(`<span class="pp pp--sub" style="left:${x}%;top:${y}%" aria-hidden="true"></span>`);
        return;
      }
      const resting = ui.rest.has(p.id);
      const badge = isHurt(p) ? `<span class="pp__badge pp__badge--hurt" title="부상">${icon('cross', 12)}</span>`
        : (resting ? `<span class="pp__badge" title="휴식">${icon('moon', 12)}</span>` : '');
      nodes.push(`<button class="pp pp--star${ui.sel === p.id ? ' on' : ''}${resting || isHurt(p) ? ' out' : ''}" style="left:${x}%;top:${y}%;--tile:${kit};--on-tile:${onColor(kit)}" data-act="pick" data-id="${esc(p.id)}" aria-pressed="${ui.sel === p.id}" aria-label="${esc(nameOf(p.id))}, ${POS_LABEL[p.position]}">
        <span class="pp__face">${portrait(p, { size: 48, kit })}</span>
        <span class="pp__name">${esc(short(p.id))}</span>${badge}
        <i class="pp__cond${p.condition < 50 ? ' low' : ''}" style="--c:${p.condition}%"></i></button>`);
    });
  }
  const r = teamRatings(team);
  return `<div class="pitch" role="group" aria-label="라인업 보드">${PITCH_LINES}${nodes.join('')}</div>
    <div class="power"><span>공격력 <b class="num">${Math.round(r.attack)}</b>${bar(r.attack, 'atk')}</span><span>수비력 <b class="num">${Math.round(r.defense)}</b>${bar(r.defense, 'def')}</span></div>`;
}

// 선택한 스타의 상세(모달이 아니라 보드 아래에 바로 붙는다)
export function playerDetail(game, ui, p) {
  const rec = game.history.players.get(p.id);
  const hurt = isHurt(p);
  const resting = ui.rest.has(p.id);
  const awards = (p.awards ?? []).map((a) => chip(`${a.year}년차 ${AWARD_LABEL[a.key]}`, 'coin')).join('');
  const restBtn = hurt
    ? `<span class="chip down">${icon('cross', 12)} 부상 결장 중</span>`
    : `<button class="pill${resting ? ' pill--on' : ''}" data-act="rest" data-id="${esc(p.id)}">${icon('moon', 16)}${resting ? '휴식 지정됨' : '다음 구간 쉬게 하기'}</button>`;
  return `<section class="detail" aria-label="${esc(nameOf(p.id))} 상세">
    <header class="detail__head">
      ${faceTile(p, { kit: game.clubKit, size: 64 })}
      <div><h3>${esc(nameOf(p.id))}</h3><p class="meta">${POS_LABEL[p.position]} · ${p.age}세 · Lv${p.xpLevel}</p>${abilityStars(p, 20)}</div>
    </header>
    <div class="detail__cols">
      <div class="attrs">${attrBars(p)}</div>
      <dl class="kv">
        <dt>사기</dt><dd>${moodFace(p.mood, 20)}</dd>
        <dt>컨디션</dt><dd>${bar(p.condition, p.condition < 50 ? 'low' : '')}</dd>
        <dt>성장</dt><dd>${xpBar(p)}</dd>
        <dt>연봉</dt><dd class="num">${p.contract.salary}<small>${p.contract.years}년</small></dd>
      </dl>
    </div>
    <p class="statline"><b class="num">${p.stats.goals}</b>골 <b class="num">${p.stats.assists}</b>도움 <small>이번 시즌 ${p.stats.apps}경기</small>${rec ? ` <small>통산 ${rec.career.goals}골 ${rec.career.assists}도움</small>` : ''}</p>
    ${awards ? `<div class="medals">${awards}</div>` : ''}
    ${restBtn}
  </section>`;
}

export const defaultSelection = (game, ui) => (game.myTeam.stars.some((p) => p.id === ui.sel) ? ui.sel : game.myTeam.stars[0]?.id ?? null);
