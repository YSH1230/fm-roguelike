// 챔피언스리그(엔드 콘텐츠): 실제 챔피언스리그(2024~ 방식)를 따른다. 1부를 4위 이내로 마친
// 팀만 진출하고, 리그가 끝난 뒤에 진행한다.
//  - 리그 단계: 36팀이 포트(세기 순 9팀씩 4포트)에 따라 8라운드, 8개 서로 다른 상대와 홈/원정 4:4로 붙는다.
//  - 1~8위 16강 직행, 9~24위 플레이오프(9-24, 10-23, … 2경기 합계), 25위 이하 탈락.
//  - 16강/8강/4강은 2경기 합계(시드 높은 팀이 2차전 홈), 결승은 중립 단판. 합계 동률이면 승부차기.
// 경기는 팀 파워에 변동(applyVariance)과 홈 이점(+HOME_POWER)을 줘서 굴린다. 상대 세기는 tier1 평균
// (79~86) 위쪽으로 잡은 추정값이라 tune-ladder처럼 실측하면 더 정확해진다.
// 상대 개성: 플레이 스타일(경기 득점 흐름에 영향)과 "원정팀의 무덤"(내 팀이 그곳 원정이면 적응도 절반).
// ponytail: 경기 결과는 파워 비교(+무승부 문턱)로만 정한다. 선수 단위 시뮬은 없다.
import { applyVariance } from './team-power.mjs';

const OPPONENT_NAMES = [
  'Valdoria FC', 'Nordhaven United', 'Castellmar', 'Rheinmark 04', 'Aurelian Sporting', 'Kronberg SV',
  'Solmere Athletic', 'Veridia City', 'Monteluce', 'Havenholt', 'Brightmoor Albion', 'Skarnes IF',
  'Lakemont FC', 'Torrenza', 'Drachenfels', 'Verdant Lions', 'Pellegrino SC', 'Halcyon Park',
  'Ironvale', 'Baltmere', 'Zephyra', 'Corvanne', 'Eldoris', 'Orsolva', 'Kestrelhaven', 'Dunmere',
  'Falkenstad', 'Marrowgate City', 'Quillon FC', 'Ashgrove Royal', 'Tolmara', 'Vesper United',
  'Brannigan Town', 'Cobalt Sporting', 'Ysgarth',
];
const KITS = [
  '#b8452f', '#2f5f9e', '#6b4a5d', '#3f7d4f', '#c9a227', '#1d3f8f', '#7d2f4a', '#2f7d7d',
  '#9e6b2f', '#4a2f9e', '#2f9e6b', '#9e2f4a', '#5f7d2f', '#7d5f2f', '#2f4a7d', '#7d2f2f',
  '#4a7d5f', '#6b2f7d', '#2f6b7d', '#9e4a2f', '#3f5f7d', '#7d6b2f', '#5f2f7d', '#8a3a3a',
  '#3a8a5f', '#3a5f8a', '#8a6b3a', '#6b3a8a', '#8a3a6b', '#3a8a8a', '#7a8a3a', '#a04a4a',
  '#4aa06b', '#4a6ba0', '#a08a4a',
];
export const UCL_STYLES = ['attacking', 'defensive', 'counter', 'possession', 'balanced'];
export const UCL_STYLE_LABELS = { attacking: '공격형', defensive: '수비형', counter: '역습형', possession: '점유형', balanced: '균형형' };

export const UCL_OPPONENTS = OPPONENT_NAMES.map((name, i) => ({
  id: `opp${i + 1}`, name, power: Math.round((98 - i * 0.8) * 10) / 10, kit: KITS[i], style: UCL_STYLES[(i * 3) % UCL_STYLES.length],
}));

export const UCL_RESULT_LABELS = {
  league: '리그 단계 탈락', playoff: '플레이오프 탈락', r16: '16강 탈락', qf: '8강 탈락', sf: '4강 탈락', final: '준우승', champion: '우승',
};
export const UCL_REWARDS_FUNDS = { league: 200, playoff: 350, r16: 500, qf: 800, sf: 1100, final: 1500, champion: 2200 };
export const UCL_STAGES = ['league', 'playoff', 'r16', 'qf', 'sf', 'final'];
export const UCL_STAGE_LABELS = { league: '리그 단계', playoff: '플레이오프', r16: '16강', qf: '8강', sf: '4강', final: '결승', done: '종료' };
export const UCL_LEAGUE_DAYS = 8;
export const UCL_DIRECT_SPOTS = 8; // 1~8위 16강 직행
export const UCL_PLAYOFF_SPOTS = 24; // 9~24위 플레이오프
export const UCL_FORTRESS_CHANCE = 0.2;
export const HOME_POWER = 1.5;
const DRAW_MARGIN = 1.2; // 변동이 적용된 파워 차이가 이 안이면 무승부

// 한 경기. home/away는 파워, knockout이면 무승부 때 승부차기(pens: 'home'|'away'). tempo>0(공격형이 많음)이면
// 양 팀 득점이 1씩 늘 수 있고, tempo<0(수비형)이면 줄 수 있다 - 승패는 그대로 두고 득점 흐름만 바꾼다.
export function playMatch(powerHome, powerAway, rng = Math.random, knockout = false, neutral = false, tempo = 0) {
  const h = applyVariance(powerHome + (neutral ? 0 : HOME_POWER), undefined, rng);
  const a = applyVariance(powerAway, undefined, rng);
  const diff = h - a;
  let gh; let ga; let pens = null;
  if (Math.abs(diff) < DRAW_MARGIN) {
    const r = rng();
    gh = ga = r < 0.3 ? 0 : r < 0.75 ? 1 : 2;
    if (knockout) pens = rng() < 0.5 + Math.max(-0.2, Math.min(0.2, diff / 20)) ? 'home' : 'away';
  } else {
    const w = 1 + Math.floor(rng() * 3.2);
    const l = Math.floor(rng() * w);
    if (diff > 0) { gh = w; ga = l; } else { gh = l; ga = w; }
  }
  if (tempo > 0 && rng() < 0.15 * tempo) { gh += 1; ga += 1; }
  else if (tempo < 0 && gh >= 1 && ga >= 1 && rng() < -0.15 * tempo) { gh -= 1; ga -= 1; }
  return { gh, ga, pens };
}

// 스코어를 분 단위 득점 이벤트로 푼다(경기 진행 화면용). side: 'a' | 'b', minute 1~90.
export function generateMatchEvents(ga, gb, rng = Math.random) {
  const events = [];
  for (let i = 0; i < ga; i++) events.push({ side: 'a', minute: 1 + Math.floor(rng() * 90) });
  for (let i = 0; i < gb; i++) events.push({ side: 'b', minute: 1 + Math.floor(rng() * 90) });
  return events.sort((x, y) => x.minute - y.minute);
}

const STYLE_TEMPO = { attacking: 1, defensive: -1, counter: 0, possession: 0, balanced: 0 };

// ---------- 리그 단계 일정 ----------
// 36팀을 세기 순으로 9팀씩 4포트(A~D)로 나눈다. 8라운드 중 6라운드는 "다른 포트 한 쌍씩 9명 대 9명
// 맞대결(두 가지 어긋남 s=0/1)", 2라운드는 같은 포트 안 대결(9명이라 한 명이 쉬고, 쉬는 선수끼리는
// 서로 안 붙어 본 다른 포트 팀과 짝). 라운드마다 모든 팀이 정확히 한 경기라 8라운드에 8경기, 홈/원정 4:4.
// 라운드 순서는 섞는다.
export function buildLeagueSchedule(teamIdsByStrength, rng = Math.random) {
  const pots = [0, 1, 2, 3].map((p) => teamIdsByStrength.slice(p * 9, p * 9 + 9));
  const rounds = [];
  const matchings = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  matchings.forEach((pairs, m) => {
    for (const s of [0, 1]) {
      const day = [];
      for (const [X, Y] of pairs) {
        for (let k = 0; k < 9; k++) {
          const x = pots[X][k];
          const y = pots[Y][(k + s) % 9];
          day.push((m + s) % 2 === 0 ? [x, y] : [y, x]); // [홈, 원정]
        }
      }
      rounds.push(day);
    }
  });
  // 같은 포트 안 라운드(쉬는 선수 인덱스 b)
  const ownRound = (byes, byePairs, homeFirst) => {
    const day = [];
    pots.forEach((pot, t) => {
      const L = pot.map((_, i) => pot[(i + byes[t] - 4 + 9) % 9]); // L[4] = pot[byes[t]]
      for (let i = 0; i < 4; i++) day.push(homeFirst ? [L[i], L[8 - i]] : [L[8 - i], L[i]]);
    });
    for (const [px, py] of byePairs) day.push([pots[px][byes[px]], pots[py][byes[py]]]);
    return day;
  };
  rounds.push(ownRound([4, 6, 4, 6], [[0, 1], [2, 3]], true));
  rounds.push(ownRound([7, 7, 0, 0], [[0, 2], [1, 3]], false));
  for (let i = rounds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rounds[i], rounds[j]] = [rounds[j], rounds[i]];
  }
  return rounds;
}

export function createUcl(myPower, rng = Math.random, { myPowerAway = null } = {}) {
  const me = { id: 'me', name: '내 팀', power: myPower, kit: '#3f7d4f', style: 'balanced', fortress: false };
  const teams = [me, ...UCL_OPPONENTS.map((t) => ({ ...t, fortress: rng() < UCL_FORTRESS_CHANCE }))];
  const byStrength = [...teams].sort((a, b) => b.power - a.power).map((t) => t.id);
  const table = Object.fromEntries(teams.map((t) => [t.id, { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, form: [] }]));
  return {
    teams, table, stage: 'league', day: 0, leg: 1,
    myPowerAway: myPowerAway ?? myPower * 0.97, // 원정팀의 무덤에서 적응도가 절반이 된 전력
    pots: [0, 1, 2, 3].map((p) => byStrength.slice(p * 9, p * 9 + 9)),
    fixtures: buildLeagueSchedule(byStrength, rng),
    ties: [], // 현재 토너먼트 라운드의 대진: { a(시드 높은 팀), b, legs: [{ga,gb}], winner, pens }
    rounds: {}, // 끝난 라운드 기록 { playoff: [...], r16: [...] } (대진표 표시용)
    seeds: [], // 리그 단계 최종 순위(1~24)
    prevRank: [],
    last: null, // 직전 진행의 내 경기 { oppId, label, home, me, opp, pens, events, fortress }
    log: [],
    result: null,
    tie: Object.fromEntries(teams.map((t) => [t.id, rng()])),
  };
}

export const teamOf = (state, id) => state.teams.find((t) => t.id === id);
export const nameOf = (state, id) => teamOf(state, id).name;

export function uclRanking(state) {
  return Object.keys(state.table).sort((x, y) => {
    const a = state.table[x]; const b = state.table[y];
    return (b.p - a.p) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf) || (state.tie[x] - state.tie[y]);
  });
}

function record(state, h, a, m) {
  const H = state.table[h]; const A = state.table[a];
  H.gf += m.gh; H.ga += m.ga; A.gf += m.ga; A.ga += m.gh;
  const push = (t, r) => { t.form = [...t.form, r].slice(-5); };
  if (m.gh > m.ga) { H.w += 1; H.p += 3; A.l += 1; push(H, 'W'); push(A, 'L'); }
  else if (m.gh < m.ga) { A.w += 1; A.p += 3; H.l += 1; push(H, 'L'); push(A, 'W'); }
  else { H.d += 1; A.d += 1; H.p += 1; A.p += 1; push(H, 'D'); push(A, 'D'); }
}

// 내 팀이 이 경기에서 쓰는 전력(원정팀의 무덤이면 적응도가 절반인 전력)
function powerFor(state, id, opponentId, isHome) {
  if (id !== 'me') return teamOf(state, id).power;
  const fortressAway = !isHome && teamOf(state, opponentId).fortress;
  return fortressAway ? state.myPowerAway : teamOf(state, 'me').power;
}

function simulate(state, homeId, awayId, rng, knockout, neutral) {
  const tempo = (STYLE_TEMPO[teamOf(state, homeId).style] ?? 0) + (STYLE_TEMPO[teamOf(state, awayId).style] ?? 0);
  return playMatch(powerFor(state, homeId, awayId, true), powerFor(state, awayId, homeId, false), rng, knockout, neutral, tempo);
}

// 한 경기를 "내 팀 기준"으로 정리(경기 진행 화면용)
function mineView(state, homeId, awayId, m, label, neutral) {
  const meHome = homeId === 'me';
  const oppId = meHome ? awayId : homeId;
  const my = meHome ? m.gh : m.ga;
  const op = meHome ? m.ga : m.gh;
  return {
    oppId, label, home: neutral ? null : meHome,
    fortress: !neutral && !meHome && teamOf(state, oppId).fortress,
    me: my, opp: op,
    pens: m.pens ? ((m.pens === 'home') === meHome ? 'me' : 'opp') : null,
    events: generateMatchEvents(my, op, () => Math.random()).map((e) => ({ minute: e.minute, side: e.side === 'a' ? 'me' : 'opp' })),
  };
}

export const tieAggregate = (tie) => tie.legs.reduce((s, l) => ({ a: s.a + l.ga, b: s.b + l.gb }), { a: 0, b: 0 });

const newTie = (a, b) => ({ a, b, legs: [], winner: null, pens: null });

// 한 타이의 한 경기(leg)를 굴려 기록한다. leg 1 홈=낮은 시드(b), leg 2 홈=높은 시드(a), 결승은 중립.
function playLeg(state, tie, leg, isFinal, rng) {
  const homeId = isFinal ? tie.a : leg === 1 ? tie.b : tie.a;
  const awayId = homeId === tie.a ? tie.b : tie.a;
  const m = simulate(state, homeId, awayId, rng, isFinal, isFinal);
  const aIsHome = homeId === tie.a;
  tie.legs.push({ ga: aIsHome ? m.gh : m.ga, gb: aIsHome ? m.ga : m.gh });
  if (isFinal && m.pens) tie.pens = (m.pens === 'home') === aIsHome ? 'a' : 'b';
  return { homeId, awayId, m };
}

function resolveTie(state, tie, rng) {
  const agg = tieAggregate(tie);
  if (agg.a !== agg.b) { tie.winner = agg.a > agg.b ? tie.a : tie.b; return; }
  if (!tie.pens) {
    const diff = teamOf(state, tie.a).power - teamOf(state, tie.b).power;
    tie.pens = rng() < 0.5 + Math.max(-0.2, Math.min(0.2, diff / 20)) ? 'a' : 'b';
  }
  tie.winner = tie.pens === 'a' ? tie.a : tie.b;
}

const PLAYOFF_PAIRS = [[9, 24], [10, 23], [11, 22], [12, 21], [13, 20], [14, 19], [15, 18], [16, 17]];
const PLAYOFF_TO_R16 = [6, 7, 4, 5, 2, 3, 0, 1]; // 시드 1~8이 맞붙는 플레이오프 타이 순번
const QF_PAIRS = [[0, 7], [3, 4], [1, 6], [2, 5]];

// 한 라운드(플레이오프/16강/8강/4강)의 두 경기를 모두 굴려 승자를 정한다(내가 안 뛰는 라운드용)
function playWholeRound(state, stage, rng) {
  for (const tie of state.ties) {
    for (const leg of [1, 2]) playLeg(state, tie, leg, false, rng);
    resolveTie(state, tie, rng);
  }
  state.rounds[stage] = state.ties;
}

function startR16(state, playoffWinnersByTie) {
  const top = state.seeds.slice(0, UCL_DIRECT_SPOTS);
  state.ties = top.map((seed, i) => newTie(seed, playoffWinnersByTie[PLAYOFF_TO_R16[i]]));
  state.stage = 'r16'; state.leg = 1;
}

// 진행 버튼 한 번 = 내 다음 경기(와 그때 같이 열리는 다른 경기들). 새 상태를 돌려준다.
export function advanceUcl(prev, rng = Math.random) {
  const s = structuredClone(prev);
  s.log = [];
  s.last = null;
  s.prevRank = uclRanking(s);
  if (s.stage === 'done') return s;

  // ----- 리그 단계 -----
  if (s.stage === 'league') {
    for (const [h, a] of s.fixtures[s.day]) {
      const m = simulate(s, h, a, rng, false, false);
      record(s, h, a, m);
      const mine = h === 'me' || a === 'me';
      s.log.push({ a: h, b: a, ga: m.gh, gb: m.ga, pens: null, stage: 'league', mine });
      if (mine) s.last = mineView(s, h, a, m, `리그 단계 ${s.day + 1}/${UCL_LEAGUE_DAYS}라운드`, false);
    }
    s.day += 1;
    if (s.day >= UCL_LEAGUE_DAYS) {
      const rank = uclRanking(s);
      s.seeds = rank.slice(0, UCL_PLAYOFF_SPOTS);
      const myIdx = s.seeds.indexOf('me');
      if (myIdx < 0) { s.stage = 'done'; s.result = 'league'; return s; }
      s.ties = PLAYOFF_PAIRS.map(([x, y]) => newTie(s.seeds[x - 1], s.seeds[y - 1]));
      if (myIdx < UCL_DIRECT_SPOTS) {
        // 직행: 내가 안 뛰는 플레이오프는 바로 끝내고 16강으로
        playWholeRound(s, 'playoff', rng);
        startR16(s, s.ties.map((t) => t.winner));
      } else {
        s.stage = 'playoff'; s.leg = 1;
      }
    }
    return s;
  }

  // ----- 토너먼트(플레이오프/16강/8강/4강: 2경기, 결승: 단판) -----
  const stage = s.stage;
  const isFinal = stage === 'final';
  const label = (leg) => `${UCL_STAGE_LABELS[stage]}${isFinal ? '' : ` ${leg}차전`}`;
  for (const tie of s.ties) {
    const { homeId, awayId, m } = playLeg(s, tie, s.leg, isFinal, rng);
    const mine = tie.a === 'me' || tie.b === 'me';
    s.log.push({ a: tie.a, b: tie.b, ga: tie.legs.at(-1).ga, gb: tie.legs.at(-1).gb, pens: isFinal ? tie.pens : null, stage, leg: s.leg, mine });
    if (mine) s.last = mineView(s, homeId, awayId, m, label(s.leg), isFinal);
  }
  if (!isFinal && s.leg === 1) { s.leg = 2; return s; }

  // 라운드 종료: 합계로 승자(동률이면 승부차기)
  for (const tie of s.ties) resolveTie(s, tie, rng);
  s.rounds[stage] = s.ties;
  const mine = s.ties.find((t) => t.a === 'me' || t.b === 'me');
  if (mine.winner !== 'me') { s.result = stage; s.stage = 'done'; return s; } // 탈락 결과 키 = 그 라운드 id(결승=준우승)
  if (isFinal) { s.stage = 'done'; s.result = 'champion'; return s; }

  const winners = s.ties.map((t) => t.winner);
  if (stage === 'playoff') { startR16(s, winners); return s; }
  if (stage === 'r16') { s.ties = QF_PAIRS.map(([x, y]) => newTie(winners[x], winners[y])); s.stage = 'qf'; }
  else if (stage === 'qf') { s.ties = [newTie(winners[0], winners[1]), newTie(winners[2], winners[3])]; s.stage = 'sf'; }
  else { s.ties = [newTie(winners[0], winners[1])]; s.stage = 'final'; }
  s.leg = 1;
  return s;
}

// 승부차기 진행(연출용): winner('me'|'opp')가 이기도록 맞춘 킥 순서. 5번씩 차고 승부가 안 나면 서든데스.
// 승부가 일찍 결정되면(남은 킥으로 못 따라잡으면) 거기서 끝낸다. 성공률 76%로 굴리다가 승자가 맞는 판을 고른다.
export function generateShootout(winner, rng = Math.random) {
  const run = () => {
    const kicks = []; let me = 0; let opp = 0;
    const taken = { me: 0, opp: 0 };
    const kick = (side) => {
      const scored = rng() < 0.76;
      kicks.push({ side, scored });
      taken[side] += 1;
      if (scored) { if (side === 'me') me += 1; else opp += 1; }
    };
    const decided = () => me > opp + (5 - taken.opp) || opp > me + (5 - taken.me);
    for (let round = 0; round < 5; round++) {
      for (const side of ['me', 'opp']) {
        kick(side);
        if (decided()) return { kicks, me, opp };
      }
    }
    while (me === opp) { kick('me'); kick('opp'); }
    return { kicks, me, opp };
  };
  for (let i = 0; i < 300; i++) {
    const r = run();
    if ((r.me > r.opp ? 'me' : 'opp') === winner) return r;
  }
  return winner === 'me'
    ? { kicks: [{ side: 'me', scored: true }, { side: 'opp', scored: false }], me: 1, opp: 0 }
    : { kicks: [{ side: 'me', scored: false }, { side: 'opp', scored: true }], me: 0, opp: 1 };
}
