// 챔피언스리그(엔드 콘텐츠): 1부를 4위 이내로 마친 팀만 진출하고, 리그가 끝난 뒤에 진행한다.
// 24팀 리그 단계(각 팀 6경기, 서로 다른 상대) → 상위 16팀이 16강 → 8강 → 4강(각 2경기 합계)
// → 결승(단판). 16강 대진은 1-16 / 8-9 / 4-13 / 5-12 / 2-15 / 7-10 / 3-14 / 6-11 시드 순.
// 경기는 팀 파워에 변동(applyVariance)을 줘서 굴린다. 상대 세기는 tier1 평균(79~86) 위쪽으로
// 잡은 추정값이라 tune-ladder처럼 실측하면 더 정확해진다.
// ponytail: 경기 결과는 파워 비교(+무승부 문턱)로만 정한다. 선수 단위 시뮬은 없다.
import { applyVariance } from './team-power.mjs';

const OPPONENT_NAMES = [
  'Valdoria FC', 'Nordhaven United', 'Castellmar', 'Rheinmark 04', 'Aurelian Sporting', 'Kronberg SV',
  'Solmere Athletic', 'Veridia City', 'Monteluce', 'Havenholt', 'Brightmoor Albion', 'Skarnes IF',
  'Lakemont FC', 'Torrenza', 'Drachenfels', 'Verdant Lions', 'Pellegrino SC', 'Halcyon Park',
  'Ironvale', 'Baltmere', 'Zephyra', 'Corvanne', 'Eldoris',
];
const KITS = [
  '#b8452f', '#2f5f9e', '#6b4a5d', '#3f7d4f', '#c9a227', '#1d3f8f', '#7d2f4a', '#2f7d7d',
  '#9e6b2f', '#4a2f9e', '#2f9e6b', '#9e2f4a', '#5f7d2f', '#7d5f2f', '#2f4a7d', '#7d2f2f',
  '#4a7d5f', '#6b2f7d', '#2f6b7d', '#9e4a2f', '#3f5f7d', '#7d6b2f', '#5f2f7d',
];
export const UCL_OPPONENTS = OPPONENT_NAMES.map((name, i) => ({ id: `opp${i + 1}`, name, power: 98 - i, kit: KITS[i] }));

export const UCL_RESULT_LABELS = {
  league: '리그 단계 탈락', r16: '16강 탈락', qf: '8강 탈락', sf: '4강 탈락', final: '준우승', champion: '우승',
};
export const UCL_REWARDS_FUNDS = { league: 200, r16: 400, qf: 700, sf: 1000, final: 1400, champion: 2000 };
export const UCL_STAGES = ['league', 'r16', 'qf', 'sf', 'final'];
export const UCL_STAGE_LABELS = { league: '리그 단계', r16: '16강', qf: '8강', sf: '4강', final: '결승', done: '종료' };
export const UCL_LEAGUE_DAYS = 6;
export const UCL_QUALIFY_SPOTS = 16;
export const UCL_SEED_SPOTS = 8; // 상위 8팀은 시드(대진표에서 약한 팀과 붙는다)

const DRAW_MARGIN = 1.2; // 변동이 적용된 파워 차이가 이 안이면 무승부

// 한 경기: 스코어. knockout이면 무승부 때 승부차기 승자(pens: 'a'|'b')를 정한다.
export function playMatch(powerA, powerB, rng = Math.random, knockout = false) {
  const a = applyVariance(powerA, undefined, rng);
  const b = applyVariance(powerB, undefined, rng);
  const diff = a - b;
  let ga; let gb; let pens = null;
  if (Math.abs(diff) < DRAW_MARGIN) {
    const r = rng();
    ga = gb = r < 0.3 ? 0 : r < 0.75 ? 1 : 2;
    if (knockout) pens = rng() < 0.5 + Math.max(-0.2, Math.min(0.2, diff / 20)) ? 'a' : 'b';
  } else {
    const w = 1 + Math.floor(rng() * 3.2);
    const l = Math.floor(rng() * w);
    if (diff > 0) { ga = w; gb = l; } else { ga = l; gb = w; }
  }
  return { ga, gb, pens };
}

// 스코어를 분 단위 득점 이벤트로 푼다(경기 진행 화면용). side: 'a' | 'b', minute 1~90.
export function generateMatchEvents(ga, gb, rng = Math.random) {
  const events = [];
  for (let i = 0; i < ga; i++) events.push({ side: 'a', minute: 1 + Math.floor(rng() * 90) });
  for (let i = 0; i < gb; i++) events.push({ side: 'b', minute: 1 + Math.floor(rng() * 90) });
  return events.sort((x, y) => x.minute - y.minute);
}

// 서클 방식 라운드 로빈: 라운드마다 서로 다른 상대와 한 번씩. 처음 n일만 쓴다.
function roundRobinDays(ids, days) {
  const n = ids.length;
  const rot = [...ids];
  const out = [];
  for (let d = 0; d < days; d++) {
    const day = [];
    for (let i = 0; i < n / 2; i++) day.push([rot[i], rot[n - 1 - i]]);
    out.push(day);
    rot.splice(1, 0, rot.pop());
  }
  return out;
}

export function createUcl(myPower, rng = Math.random) {
  const teams = [{ id: 'me', name: '내 팀', power: myPower, kit: '#3f7d4f' }, ...UCL_OPPONENTS];
  const table = Object.fromEntries(teams.map((t) => [t.id, { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, form: [] }]));
  return {
    teams, table, stage: 'league', day: 0, leg: 1,
    fixtures: roundRobinDays(teams.map((t) => t.id), UCL_LEAGUE_DAYS),
    ties: [], // 현재 토너먼트 라운드의 대진: { a, b, legs: [{ga,gb}], winner, pens }
    rounds: {}, // 지난 라운드 기록 { r16: [...ties], qf: [...] } (대진표 표시용)
    seeds: [], // 리그 단계 최종 순위(1~16 시드 순)
    prevRank: [], // 직전 진행 전 순위(순위 변동 표시용)
    last: null, // 직전 진행에서 내 경기 { oppId, label, me, opp, pens, events, leg }
    log: [], // 직전 진행에서 열린 모든 경기
    result: null,
    tie: Object.fromEntries(teams.map((t) => [t.id, rng()])),
  };
}

const powerOf = (state, id) => state.teams.find((t) => t.id === id).power;
export const teamOf = (state, id) => state.teams.find((t) => t.id === id);
export const nameOf = (state, id) => teamOf(state, id).name;

export function uclRanking(state) {
  return Object.keys(state.table).sort((x, y) => {
    const a = state.table[x]; const b = state.table[y];
    return (b.p - a.p) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf) || (state.tie[x] - state.tie[y]);
  });
}

function record(state, a, b, m) {
  const A = state.table[a]; const B = state.table[b];
  A.gf += m.ga; A.ga += m.gb; B.gf += m.gb; B.ga += m.ga;
  const push = (t, r) => { t.form = [...t.form, r].slice(-5); };
  if (m.ga > m.gb) { A.w += 1; A.p += 3; B.l += 1; push(A, 'W'); push(B, 'L'); }
  else if (m.ga < m.gb) { B.w += 1; B.p += 3; A.l += 1; push(A, 'L'); push(B, 'W'); }
  else { A.d += 1; B.d += 1; A.p += 1; B.p += 1; push(A, 'D'); push(B, 'D'); }
}

// 16강 대진(시드 순서대로 넘어온 16개 id) -> 8개 타이
function r16Ties(seedIds) {
  const pairs = [[1, 16], [8, 9], [4, 13], [5, 12], [2, 15], [7, 10], [3, 14], [6, 11]];
  return pairs.map(([x, y]) => ({ a: seedIds[x - 1], b: seedIds[y - 1], legs: [], winner: null, pens: null }));
}

const aggregate = (tie) => tie.legs.reduce((s, l) => ({ a: s.a + l.ga, b: s.b + l.gb }), { a: 0, b: 0 });

// 한 경기를 "내 팀 기준"으로 정리(표시용)
function mineView(state, a, b, m, label, leg) {
  const meIsA = a === 'me';
  return {
    oppId: meIsA ? b : a,
    label, leg,
    me: meIsA ? m.ga : m.gb,
    opp: meIsA ? m.gb : m.ga,
    pens: m.pens ? (m.pens === 'a') === meIsA ? 'me' : 'opp' : null,
    events: generateMatchEvents(meIsA ? m.ga : m.gb, meIsA ? m.gb : m.ga).map((e) => ({ minute: e.minute, side: e.side === 'a' ? 'me' : 'opp' })),
  };
}

// 진행 버튼 한 번 = 내 다음 경기(와 그때 같이 열리는 다른 경기들). 새 상태를 돌려준다.
export function advanceUcl(prev, rng = Math.random) {
  const s = structuredClone(prev);
  s.log = [];
  s.last = null;
  s.prevRank = uclRanking(s);
  if (s.stage === 'done') return s;

  if (s.stage === 'league') {
    for (const [a, b] of s.fixtures[s.day]) {
      const m = playMatch(powerOf(s, a), powerOf(s, b), rng);
      record(s, a, b, m);
      s.log.push({ a, b, ...m, stage: 'league', mine: a === 'me' || b === 'me' });
      if (a === 'me' || b === 'me') s.last = mineView(s, a, b, m, `리그 단계 ${s.day + 1}/${UCL_LEAGUE_DAYS}라운드`, 1);
    }
    s.day += 1;
    if (s.day >= UCL_LEAGUE_DAYS) {
      s.seeds = uclRanking(s).slice(0, UCL_QUALIFY_SPOTS);
      if (!s.seeds.includes('me')) { s.stage = 'done'; s.result = 'league'; return s; }
      s.stage = 'r16'; s.leg = 1;
      s.ties = r16Ties(s.seeds);
    }
    return s;
  }

  // 토너먼트: 같은 라운드의 모든 타이를 한 번에 진행한다(1차전 → 2차전, 결승은 단판).
  const isFinal = s.stage === 'final';
  for (const tie of s.ties) {
    const m = playMatch(powerOf(s, tie.a), powerOf(s, tie.b), rng, isFinal);
    tie.legs.push({ ga: m.ga, gb: m.gb });
    if (isFinal) tie.pens = m.pens;
    s.log.push({ a: tie.a, b: tie.b, ...m, stage: s.stage, leg: s.leg, mine: tie.a === 'me' || tie.b === 'me' });
    if (tie.a === 'me' || tie.b === 'me') s.last = mineView(s, tie.a, tie.b, m, `${UCL_STAGE_LABELS[s.stage]}${isFinal ? '' : ` ${s.leg}차전`}`, s.leg);
  }

  if (!isFinal && s.leg === 1) { s.leg = 2; return s; }

  // 라운드 종료: 합계로 승자 결정(합계 동률이면 승부차기)
  for (const tie of s.ties) {
    const agg = aggregate(tie);
    if (agg.a !== agg.b) tie.winner = agg.a > agg.b ? tie.a : tie.b;
    else if (isFinal && tie.pens) tie.winner = tie.pens === 'a' ? tie.a : tie.b;
    else {
      const diff = powerOf(s, tie.a) - powerOf(s, tie.b);
      tie.pens = rng() < 0.5 + Math.max(-0.2, Math.min(0.2, diff / 20)) ? 'a' : 'b';
      tie.winner = tie.pens === 'a' ? tie.a : tie.b;
    }
  }
  s.rounds[s.stage] = s.ties;
  const mine = s.ties.find((t) => t.a === 'me' || t.b === 'me');
  if (mine.winner !== 'me') { s.result = prev.stage; s.stage = 'done'; return s; } // 탈락 결과 키 = 그 라운드 id(결승이면 final=준우승)
  if (isFinal) { s.stage = 'done'; s.result = 'champion'; return s; }

  const winners = s.ties.map((t) => t.winner);
  s.ties = [];
  for (let i = 0; i < winners.length; i += 2) s.ties.push({ a: winners[i], b: winners[i + 1], legs: [], winner: null, pens: null });
  s.stage = UCL_STAGES[UCL_STAGES.indexOf(prev.stage) + 1];
  s.leg = 1;
  return s;
}


export { aggregate as tieAggregate };
