// 챔피언스리그: 1부 리그를 4위 이내로 마친 팀만 진출하고, 리그가 끝난 뒤에 진행한다.
// 8팀 리그 단계(단일 리그 7경기) → 상위 4팀 준결승(1위-4위, 2위-3위, 단판) → 결승(단판).
// 경기는 팀 파워에 변동(applyVariance)을 줘서 굴린다. 상대 세기는 tier1 평균(79~86) 위쪽으로
// 잡은 추정값이라 tune-ladder처럼 실측하면 더 정확해진다.
// ponytail: 경기 결과는 파워 비교(+무승부 문턱)로만 정한다. 선수 단위 시뮬은 없다.
import { applyVariance } from './team-power.mjs';

export const UCL_OPPONENTS = [
  { id: 'opp1', name: 'Valdoria FC', power: 98 },
  { id: 'opp2', name: 'Nordhaven United', power: 96 },
  { id: 'opp3', name: 'Castellmar', power: 94 },
  { id: 'opp4', name: 'Rheinmark 04', power: 92 },
  { id: 'opp5', name: 'Aurelian Sporting', power: 90 },
  { id: 'opp6', name: 'Kronberg SV', power: 88 },
  { id: 'opp7', name: 'Solmere Athletic', power: 86 },
];

export const UCL_RESULT_LABELS = { league: '리그 단계 탈락', sf: '4강 탈락', final: '준우승', champion: '우승' };
export const UCL_REWARDS_FUNDS = { league: 200, sf: 500, final: 900, champion: 1500 };

const DRAW_MARGIN = 1.2; // 변동이 적용된 파워 차이가 이 안이면 무승부

// 한 경기: 결과와 스코어. knockout이면 무승부 대신 승부차기로 승자를 정한다.
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

// 8팀 단일 리그의 라운드 로빈 대진(서클 방식): 7라운드 × 4경기
function roundRobin(ids) {
  const n = ids.length;
  const rot = [...ids];
  const days = [];
  for (let d = 0; d < n - 1; d++) {
    const day = [];
    for (let i = 0; i < n / 2; i++) day.push([rot[i], rot[n - 1 - i]]);
    days.push(day);
    rot.splice(1, 0, rot.pop());
  }
  return days;
}

export function createUcl(myPower, rng = Math.random) {
  const teams = [{ id: 'me', name: '내 팀', power: myPower }, ...UCL_OPPONENTS];
  const table = Object.fromEntries(teams.map((t) => [t.id, { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }]));
  return {
    teams, table, stage: 'league', day: 0,
    fixtures: roundRobin(teams.map((t) => t.id)),
    bracket: null, // { semi: [[a,b],[c,d]], final: [x,y] }
    log: [], // 마지막 진행에서 나온 경기들(표시용)
    result: null,
    tie: Object.fromEntries(teams.map((t) => [t.id, rng()])),
  };
}

const powerOf = (state, id) => state.teams.find((t) => t.id === id).power;
export const nameOf = (state, id) => state.teams.find((t) => t.id === id).name;

export function uclRanking(state) {
  return Object.keys(state.table).sort((x, y) => {
    const a = state.table[x]; const b = state.table[y];
    return (b.p - a.p) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf) || (state.tie[x] - state.tie[y]);
  });
}

function record(state, a, b, m) {
  const A = state.table[a]; const B = state.table[b];
  A.gf += m.ga; A.ga += m.gb; B.gf += m.gb; B.ga += m.ga;
  if (m.ga > m.gb) { A.w += 1; A.p += 3; B.l += 1; }
  else if (m.ga < m.gb) { B.w += 1; B.p += 3; A.l += 1; }
  else { A.d += 1; B.d += 1; A.p += 1; B.p += 1; }
}

const winnerOf = (m, a, b) => (m.ga > m.gb ? a : m.ga < m.gb ? b : (m.pens === 'a' ? a : b));

// 진행 버튼 한 번 = 내 다음 경기(와 그때 같이 열리는 다른 경기들). 새 상태를 돌려준다.
export function advanceUcl(prev, rng = Math.random) {
  const s = structuredClone(prev);
  s.log = [];
  if (s.stage === 'done') return s;

  if (s.stage === 'league') {
    for (const [a, b] of s.fixtures[s.day]) {
      const m = playMatch(powerOf(s, a), powerOf(s, b), rng);
      record(s, a, b, m);
      s.log.push({ a, b, ...m, stage: 'league', mine: a === 'me' || b === 'me' });
    }
    s.day += 1;
    if (s.day >= s.fixtures.length) {
      const top = uclRanking(s).slice(0, 4);
      if (!top.includes('me')) { s.stage = 'done'; s.result = 'league'; return s; }
      s.bracket = { semi: [[top[0], top[3]], [top[1], top[2]]], final: null };
      s.stage = 'semi';
    }
    return s;
  }

  if (s.stage === 'semi') {
    const winners = s.bracket.semi.map(([a, b]) => {
      const m = playMatch(powerOf(s, a), powerOf(s, b), rng, true);
      s.log.push({ a, b, ...m, stage: 'semi', mine: a === 'me' || b === 'me' });
      return winnerOf(m, a, b);
    });
    if (!winners.includes('me')) { s.stage = 'done'; s.result = 'sf'; return s; }
    s.bracket.final = winners;
    s.stage = 'final';
    return s;
  }

  const [a, b] = s.bracket.final;
  const m = playMatch(powerOf(s, a), powerOf(s, b), rng, true);
  s.log.push({ a, b, ...m, stage: 'final', mine: true });
  s.stage = 'done';
  s.result = winnerOf(m, a, b) === 'me' ? 'champion' : 'final';
  return s;
}
