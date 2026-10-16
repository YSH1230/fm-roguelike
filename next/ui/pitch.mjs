import { nameOf } from '../engine/names.mjs';
import { teamRatings } from '../engine/ratings.mjs';
import { ATTRIBUTES } from '../engine/constants.mjs';
import { benchmarks } from './bench.mjs';
import {
  ATTR_LABEL, AWARD_LABEL, POS_LABEL, abilityStars, bar, chip, esc, facts, icon, moodFace, onColor, portrait, xpBar,
} from './components.mjs';

// 위에서부터 공격 -> 미드 -> 수비 -> 골키퍼. 세로 위치(%)
const ROW_Y = { FW: 19, MF: 42, DF: 66, GK: 88 };
const ORDER = ['FW', 'MF', 'DF', 'GK'];

const PITCH_LINES = `<svg class="pitch__lines" viewBox="0 0 100 108" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <rect x="3" y="3" width="94" height="102"/><path d="M3 24h94"/>
  <path d="M30 105V89h40v16M40 105V97h20v8"/><path d="M37 24a13 13 0 0026 0"/>
</svg>`;

const surname = (id) => nameOf(id).split(' ').slice(-1)[0];
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
      // 얼굴 타일끼리 겹치지 않게 양 끝 14%~86% 안에서 고르게 펼친다(6명 이상이면 타일을 줄인다)
      const x = group.length === 1 ? 50 : 14 + (72 * i) / (group.length - 1);
      const y = ROW_Y[pos];
      if (!stars.has(p)) {
        nodes.push(`<span class="pp pp--sub" style="left:${x}%;top:${y}%" aria-hidden="true"></span>`);
        return;
      }
      const resting = ui.rest.has(p.id);
      const badge = isHurt(p) ? `<span class="pp__badge pp__badge--hurt" title="부상">${icon('injury', 12)}</span>`
        : (resting ? `<span class="pp__badge" title="휴식">${icon('rest', 12)}</span>` : '');
      nodes.push(`<button class="pp pp--star${group.length > 5 ? ' tight' : ''}${ui.sel === p.id ? ' on' : ''}${resting || isHurt(p) ? ' out' : ''}" style="left:${x}%;top:${y}%;--tile:${kit};--on-tile:${onColor(kit)}" data-act="pick" data-id="${esc(p.id)}" aria-pressed="${ui.sel === p.id}" aria-label="${esc(nameOf(p.id))}, ${POS_LABEL[p.position]}">
        <span class="pp__face">${portrait(p, { size: 48, kit })}</span>
        <span class="pp__name">${esc(surname(p.id))}</span>${badge}
        <i class="pp__cond${p.condition < 50 ? ' low' : ''}" style="--c:${p.condition}%"></i></button>`);
    });
  }
  const r = teamRatings(team);
  return `<div class="pitch" role="group" aria-label="라인업 보드">${PITCH_LINES}${nodes.join('')}</div>
    <div class="power"><span><em>ATTACK 공격력</em><b class="num">${Math.round(r.attack)}</b>${bar(r.attack)}</span><span><em>DEFENSE 수비력</em><b class="num">${Math.round(r.defense)}</b>${bar(r.defense)}</span></div>`;
}

// 능력치 하나의 YOU / AVERAGE / BEST 비교. 비교 상대가 없으면 YOU만 보인다.
function compare(key, you, bench) {
  const rows = [['YOU', you, 'you'], ...(bench ? [['AVERAGE', bench.avg, 'avg'], ['BEST', bench.best, 'best']] : [])];
  return `<div class="col"><h5>${key.toUpperCase()}<span>${ATTR_LABEL[key]}</span></h5>${rows.map(([who, v, cls]) => `<div class="cmp cmp--${cls}"><span class="who">${who}</span>${bar(v)}<b class="num">${v}</b></div>`).join('')}</div>`;
}

// 선택한 스타의 리포트(모달이 아니라 보드 아래에 바로 붙는다)
export function playerDetail(game, ui, p) {
  const rec = game.history.players.get(p.id);
  const hurt = isHurt(p);
  const resting = ui.rest.has(p.id);
  const bench = benchmarks(game, p.position);
  const awards = (p.awards ?? []).map((a) => chip(`${a.year}년차 ${AWARD_LABEL[a.key]}`, 'best')).join('');
  const per = p.stats.apps ? (p.stats.goals / p.stats.apps).toFixed(1) : '0.0';
  const restBtn = hurt
    ? `<p class="hurt">${icon('injury', 16)}부상으로 결장 중</p>`
    : `<button class="pill${resting ? ' pill--on' : ''}" data-act="rest" data-id="${esc(p.id)}">${icon('rest', 16)}${resting ? '휴식 지정됨' : '다음 구간 쉬게 하기'}</button>`;
  const [last, ...first] = nameOf(p.id).split(' ').reverse();
  return `<section class="detail" aria-label="${esc(nameOf(p.id))} 상세">
    <div class="rephead"><span class="lab">PLAYER REPORT</span><span class="lab">${facts(`LV ${p.xpLevel}`, `${p.age}세`)}</span></div>
    <h3 class="repname">${esc(last)}</h3>
    <p class="repsub"><span class="tag">${p.position}</span>${esc(first.reverse().join(' '))}<span class="mood">${moodFace(p.mood, 20)}</span></p>
    <div class="repstars">${abilityStars(p, 18)}<span class="lab">조건 ${Math.round(p.condition)} · 성장</span>${xpBar(p)}</div>
    <h4 class="sech">ATTRIBUTES <span>능력치</span></h4>
    ${ATTRIBUTES[p.position].map((k) => compare(k, p.attrs[k], bench[k])).join('')}
    <div class="big"><b class="num">${p.stats.goals}</b><span>시즌 골</span></div>
    <div class="tri"><div><b class="num">${p.stats.apps}</b><span>출전</span></div><div><b class="num">${p.stats.assists}</b><span>도움</span></div><div><b class="num">${per}</b><span>경기당 골</span></div></div>
    ${rec ? `<p class="career">통산 ${rec.career.goals}골 ${rec.career.assists}도움</p>` : ''}
    <p class="contract"><span class="lab">CONTRACT</span><b class="num">${p.contract.salary}</b><span>${p.contract.years}년 남음</span></p>
    ${awards ? `<div class="medals">${awards}</div>` : ''}
    ${restBtn}
  </section>`;
}

export const defaultSelection = (game, ui) => (game.myTeam.stars.some((p) => p.id === ui.sel) ? ui.sel : game.myTeam.stars[0]?.id ?? null);
