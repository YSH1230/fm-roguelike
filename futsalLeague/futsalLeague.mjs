// 풋살 매니지먼트 M1: 16팀 한국 리그, 22경기 정규시즌, 컨퍼런스 플레이오프.
// 순수 로직. 경기는 통째 시뮬(futsalSim 없이)로 처리한다.
import { createRng } from '../next/engine/rng.mjs';

export const TEAM_NAMES = [
  '서울', '인천', '수원', '대전', '대구', '부산', '울산', '광주/전남',
  '경기', '강원', '충남', '충북', '경북', '경남', '전북', '제주',
];
export const CONFERENCE_NAMES = ['메트로', '도원'];
export const DIVISION_NAMES = ['북부', '남부'];
export const FIELD_ABILITIES = ['speed', 'stamina', 'power', 'tech', 'shoot'];
export const GK_ABILITIES = ['speed', 'stamina', 'power', 'reaction', 'handling'];
export const GOALS_PER_TEAM = 2.5;
export const SEGMENT_SIZES = [7, 7, 8];
export const OT_MINUTES_RATIO = 5 / 40; // 연장 5분 = 정규 40분의 1/8

// 설계 6.6절: 잠재 별 분포 (1.5 ~ 5.0, 0.5 단위). 5성은 AI 팀 스타 생성에서만 1%.
export const STAR_LEVELS = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
export const STAR_WEIGHTS = [5, 12, 20, 25, 20, 11, 6, 1];
// 설계 6.6절: 현재 칸 ÷ 천장 (입단 나이별)
export const AGE_RATIO = [
  { from: 19, to: 21, ratio: 0.5 },
  { from: 22, to: 25, ratio: 0.65 },
  { from: 26, to: 29, ratio: 0.8 },
  { from: 30, to: 32, ratio: 0.95 },
  { from: 33, to: 35, ratio: 0.9 },
];
export const LATE_BLOOMER_RATE = 0.03; // 28세 이상, 현재 칸이 천장의 약 60%

// 팀 id 0~15: 컨퍼런스 = id >> 3, 디비전 = (id >> 2) & 1 (0 북부, 1 남부)
export const conferenceOf = (id) => id >> 3;
export const divisionOf = (id) => (id >> 2) & 1;
export const divisionGroupOf = (id) => id >> 2; // 0~3

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fieldSum = (p) => FIELD_ABILITIES.reduce((s, k) => s + p.abilities[k], 0);
const gkRatingOf = (p) => (p.abilities.reaction + p.abilities.handling) / 2;

// 가중치로 뽑기 (index 반환)
function pickWeighted(weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

// 유형별 가중치: 고른형 = 균등, 특화형 = 2개 강조, 극단형 = 1개 크게 (유형은 1/3씩 가정)
function typeWeights(keys, rng) {
  const type = pickWeighted([1, 1, 1], rng);
  const w = keys.map(() => 1);
  if (type === 1) {
    const i = Math.floor(rng() * keys.length);
    let j = Math.floor(rng() * (keys.length - 1));
    if (j >= i) j++;
    w[i] = 3;
    w[j] = 3;
  } else if (type === 2) {
    w[Math.floor(rng() * keys.length)] = 4;
  }
  return w;
}

// 총량 T를 가중치대로 나누고, 칸 상한 20을 넘는 몫은 잘라서 나머지에 재분배한다.
function allocateCeiling(total, weights) {
  const out = new Array(weights.length).fill(0);
  let active = weights.map((_, i) => i);
  let rem = total;
  while (active.length) {
    const sw = active.reduce((s, i) => s + weights[i], 0);
    const over = active.filter((i) => (rem * weights[i]) / sw > 20);
    if (!over.length) {
      for (const i of active) out[i] = (rem * weights[i]) / sw;
      break;
    }
    for (const i of over) {
      out[i] = 20;
      rem -= 20;
    }
    active = active.filter((i) => !over.includes(i));
  }
  return out.map((v) => clamp(Math.round(v), 0, 20));
}

function ratioOfAge(age) {
  return AGE_RATIO.find((b) => age >= b.from && age <= b.to).ratio;
}

// 설계 6.6절에 따라 선수 한 명 생성: 잠재 별 → 천장 총량 → 유형별 칸 분배 → 나이별 현재 칸.
export function makePlayer(id, role, rng) {
  const star = STAR_LEVELS[pickWeighted(STAR_WEIGHTS, rng)];
  const keys = role === 'GK' ? GK_ABILITIES : FIELD_ABILITIES;
  const total = 20 * star;
  const weights = star === 5 ? keys.map(() => 1) : typeWeights(keys, rng);
  const ceilingArr = star === 5 ? keys.map(() => 20) : allocateCeiling(total, weights);
  let age = 19 + Math.floor(rng() * 17); // 19~35 균등 (가정)
  let ratio = ratioOfAge(age);
  if (rng() < LATE_BLOOMER_RATE) {
    age = 28 + Math.floor(rng() * 5);
    ratio = 0.6;
  }
  const ceiling = {};
  const abilities = {};
  keys.forEach((k, i) => {
    ceiling[k] = ceilingArr[i];
    abilities[k] = clamp(Math.round(ceilingArr[i] * ratio), 0, ceilingArr[i]);
  });
  return { id, role, age, star, ceiling, abilities };
}

// 팀 생성: 골키퍼 1명 + 필드 7명 (설계 6.1절).
export function createTeams(rng) {
  return TEAM_NAMES.map((name, id) => {
    const players = [makePlayer(`${id}-0`, 'GK', rng)];
    for (let k = 1; k < 8; k++) players.push(makePlayer(`${id}-${k}`, 'FIELD', rng));
    return { id, name, conference: conferenceOf(id), division: divisionOf(id), players };
  });
}

// 경기 시점의 스쿼드 스냅샷. M2에서 컨디션과 수동 라인업이 붙는다.
// 지금은 컨디션 1 고정, 라인업은 자동.
export function squadSnapshot(team) {
  return {
    id: team.id,
    players: team.players.map((p) => ({ id: p.id, role: p.role, abilities: { ...p.abilities }, condition: 1 })),
  };
}

// 자동 라인업: 골키퍼 역할 중 반응+핸들링 최고 1명, 필드 역할 중 필드 능력 합 상위 4명.
export function lineupOf(snapshot) {
  const gks = snapshot.players.filter((p) => p.role === 'GK');
  const gk = gks.reduce((best, p) => (gkRatingOf(p) > gkRatingOf(best) ? p : best));
  const field = snapshot.players
    .filter((p) => p.role === 'FIELD')
    .sort((a, b) => fieldSum(b) - fieldSum(a))
    .slice(0, 4);
  return { gk, field };
}

// 리그 기준값 (시즌 시작 시 고정): 골키퍼 평균 x, 필드 공격·수비 평균.
export function leagueBaseline(teams) {
  const st = teams.map((t) => matchStrength(squadSnapshot(t)));
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    muGK: mean(st.map((s) => s.gkRating)),
    muAttack: mean(st.map((s) => s.attack)),
    muDefense: mean(st.map((s) => s.defense)),
  };
}

// 팀 전력: 필드 4명 평균(공격 = 속도·기술·슛, 수비 = 속도·체력·힘), 슈팅 평균, 골키퍼 x와 배율.
// 골키퍼 배율 g = clamp(1 + 0.02 × (μ_GK − x), 0.8, 1.2): 상대 기대득점에 곱한다.
export function matchStrength(snapshot, league = null) {
  const { gk, field } = lineupOf(snapshot);
  const avg = (list, keys) =>
    list.reduce((t, p) => t + keys.reduce((s, k) => s + p.abilities[k], 0) / keys.length, 0) / list.length;
  const gkRating = gkRatingOf(gk);
  return {
    attack: avg(field, ['speed', 'tech', 'shoot']),
    defense: avg(field, ['speed', 'stamina', 'power']),
    shot: avg(field, ['shoot']),
    gkRating,
    gkMult: league ? clamp(1 + 0.02 * (league.muGK - gkRating), 0.8, 1.2) : 1,
  };
}

// 공격 쪽 기대득점. 공격과 수비를 리그 평균으로 정규화하고 상대 골키퍼 배율을 곱한다.
export function expectedGoals(attack, defense, league) {
  const ratio = (attack.attack / league.muAttack) / (defense.defense / league.muDefense);
  return clamp(GOALS_PER_TEAM * ratio * defense.gkMult, 0.3, 6);
}

function poisson(lambda, rng) {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > limit);
  return k - 1;
}

// 정규 40분 통째 시뮬. 동점 허용 (정규시즌 무승부).
export function simulateRegulation(home, away, rng, league) {
  const a = matchStrength(squadSnapshot(home), league);
  const b = matchStrength(squadSnapshot(away), league);
  const lh = expectedGoals(a, b, league);
  const la = expectedGoals(b, a, league);
  return { hg: poisson(lh, rng), ag: poisson(la, rng), lh, la, a, b };
}

// 토너먼트 경기. 정규 동점이면 연장 5분 골든골, 그래도 동점이면 승부차기.
// 연장 골은 각 팀 λ × 5/40의 푸아송에서 나온다 (무득점 확률 exp(-(λA+λB) × 5/40)).
// 승부차기: P(A승) = 0.5 + clamp(0.01 × ((S_A − G_B) − (S_B − G_A)), −0.05, 0.05)
//   S = 필드 4명 슈팅 평균, G = 골키퍼 (반응+핸들링)/2.
export function playKnockout(season, home, away, neutral = false) {
  const r = simulateRegulation(season.teams[home], season.teams[away], season.rng, season.league);
  const out = { home, away, hg: r.hg, ag: r.ag, winner: null, ot: false, shootout: false, neutral };
  if (r.hg !== r.ag) {
    out.winner = r.hg > r.ag ? home : away;
    return out;
  }
  out.ot = true;
  const lamOT = (r.lh + r.la) * OT_MINUTES_RATIO;
  if (season.rng() >= Math.exp(-lamOT)) {
    const scorerHome = season.rng() < r.lh / (r.lh + r.la);
    if (scorerHome) out.hg++;
    else out.ag++;
    out.winner = scorerHome ? home : away;
    return out;
  }
  out.shootout = true;
  const pA =
    0.5 + clamp(0.01 * (r.a.shot - r.b.gkRating - (r.b.shot - r.a.gkRating)), -0.05, 0.05);
  out.winner = season.rng() < pA ? home : away;
  return out;
}

// 정규시즌 일정: 22 라운드 × 8경기 (각 라운드에 16팀 전원이 한 번씩 뛴다).
//  라운드 1~8   : 같은 컨퍼런스 다른 디비전 (4 × 4 쌍, 홈/원정 두 번)
//  라운드 9~14  : 다른 컨퍼런스 (K8,8 중 6개 매칭)
//  라운드 15~20 : 같은 디비전 (K4 3개 매칭을 두 번, 홈/원정 뒤집어서)
//  라운드 21~22 : 다른 컨퍼런스 나머지 2개 매칭
// 관리 구간: 라운드 1~7 / 8~14 / 15~22 (7 / 7 / 8경기).
// 홀수 시즌은 다른 컨퍼런스 경기의 홈/원정만 뒤집는다. 같은 컨퍼런스 경기는 그대로.
export function buildSchedule(seasonIndex = 0) {
  const rounds = Array.from({ length: 22 }, () => []);
  const add = (r, home, away) => rounds[r].push({ home, away });

  for (let conf = 0; conf < 2; conf++) {
    const base = conf * 8;
    for (let a = 0; a < 4; a++) {
      for (let k = 0; k < 4; k++) {
        const north = base + k;
        const south = base + 4 + ((k + a) % 4);
        add(a, north, south); // 라운드 1~4: 북부 홈
        add(a + 4, south, north); // 라운드 5~8: 남부 홈
      }
    }
  }

  for (let d = 0; d < 8; d++) {
    for (let i = 0; i < 8; i++) {
      const metro = i;
      const doewon = 8 + ((i + d) % 8);
      const metroHome = d < 4; // 홈 4 / 원정 4
      const r = d < 6 ? 8 + d : 20 + (d - 6);
      if (metroHome) add(r, metro, doewon);
      else add(r, doewon, metro);
    }
  }

  const matchings = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ];
  for (let g = 0; g < 4; g++) {
    const base = g * 4;
    for (let copy = 0; copy < 2; copy++) {
      matchings.forEach((pairs, a) => {
        for (const [x, y] of pairs) {
          const [home, away] = copy === 0 ? [base + x, base + y] : [base + y, base + x];
          add(14 + 3 * copy + a, home, away);
        }
      });
    }
  }

  if (seasonIndex % 2 === 1) {
    for (const round of rounds) {
      for (const m of round) {
        if (conferenceOf(m.home) !== conferenceOf(m.away)) [m.home, m.away] = [m.away, m.home];
      }
    }
  }
  return rounds.map((matches, r) =>
    matches.map((m) => ({ ...m, round: r, segment: segmentOfRound(r) })),
  );
}

// 라운드 인덱스(0부터) → 관리 구간 1~3
export function segmentOfRound(r) {
  if (r < SEGMENT_SIZES[0]) return 1;
  if (r < SEGMENT_SIZES[0] + SEGMENT_SIZES[1]) return 2;
  return 3;
}

// 맞대결 승점 (두 팀이 모인 그룹 안에서만 집계)
function headToHeadPoints(ids, results) {
  const pts = new Map(ids.map((id) => [id, 0]));
  for (const m of results) {
    if (!pts.has(m.home) || !pts.has(m.away)) continue;
    if (m.hg > m.ag) pts.set(m.home, pts.get(m.home) + 3);
    else if (m.hg < m.ag) pts.set(m.away, pts.get(m.away) + 3);
    else {
      pts.set(m.home, pts.get(m.home) + 1);
      pts.set(m.away, pts.get(m.away) + 1);
    }
  }
  return pts;
}

// 순위표. 승점 → 동점 그룹 정렬.
//  두 팀: 맞대결 승점 → 득실차 → 다득점 → 추첨
//  세 팀 이상: 득실차 → 다득점 → 추첨
// 추첨 키는 시즌마다 한 번 뽑는다 (drawKey).
export function computeTable(teamIds, results, drawKey) {
  const stats = teamIds.map((id) => {
    const s = { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    for (const m of results) {
      if (m.home !== id && m.away !== id) continue;
      const mine = m.home === id ? m.hg : m.ag;
      const theirs = m.home === id ? m.ag : m.hg;
      s.p++;
      s.gf += mine;
      s.ga += theirs;
      if (mine > theirs) { s.w++; s.pts += 3; }
      else if (mine === theirs) { s.d++; s.pts += 1; }
      else s.l++;
    }
    s.gd = s.gf - s.ga;
    return s;
  });

  stats.sort((a, b) => b.pts - a.pts);
  const table = [];
  for (let i = 0; i < stats.length; ) {
    let j = i + 1;
    while (j < stats.length && stats[j].pts === stats[i].pts) j++;
    const group = stats.slice(i, j);
    if (group.length === 2) {
      const h2h = headToHeadPoints(group.map((s) => s.id), results);
      group.sort(
        (a, b) =>
          h2h.get(b.id) - h2h.get(a.id) ||
          b.gd - a.gd ||
          b.gf - a.gf ||
          drawKey[a.id] - drawKey[b.id],
      );
    } else if (group.length > 2) {
      group.sort((a, b) => b.gd - a.gd || b.gf - a.gf || drawKey[a.id] - drawKey[b.id]);
    }
    table.push(...group);
    i = j;
  }
  return table;
}

// 시즌 상태. 리그 기준값은 시즌 시작 때 한 번 계산해서 시즌 내내 고정한다.
export function createSeason({ teams, seasonIndex = 0, rng }) {
  return {
    teams,
    seasonIndex,
    rng,
    league: leagueBaseline(teams),
    rounds: buildSchedule(seasonIndex),
    nextRound: 0,
    results: [],
    drawKey: teams.map(() => rng()),
    playoffs: null,
  };
}

export function stepRound(season) {
  if (season.nextRound >= season.rounds.length) return [];
  const played = season.rounds[season.nextRound].map((m) => {
    const sim = simulateRegulation(season.teams[m.home], season.teams[m.away], season.rng, season.league);
    return { round: m.round, segment: m.segment, home: m.home, away: m.away, hg: sim.hg, ag: sim.ag };
  });
  season.results.push(...played);
  season.nextRound++;
  return played;
}

export function standings(season) {
  const conf = [0, 1].map((c) =>
    computeTable(
      season.teams.filter((t) => t.conference === c).map((t) => t.id),
      season.results,
      season.drawKey,
    ),
  );
  const div = [0, 1, 2, 3].map((g) =>
    computeTable(
      season.teams.filter((t) => divisionGroupOf(t.id) === g).map((t) => t.id),
      season.results,
      season.drawKey,
    ),
  );
  return { conf, div };
}

// 시리즈 (3판 2선승). 높은 시드(higher)가 higherHomeGames 번호의 경기에서 홈.
// higherHomeGames가 null이면 중립 경기장이다.
function playSeries(season, higher, lower, games, higherHomeGames) {
  const need = Math.ceil(games / 2);
  const wins = { [higher]: 0, [lower]: 0 };
  const log = [];
  for (let g = 1; wins[higher] < need && wins[lower] < need; g++) {
    const neutral = higherHomeGames === null;
    const higherHome = neutral || higherHomeGames.includes(g);
    const m = higherHome
      ? playKnockout(season, higher, lower, neutral)
      : playKnockout(season, lower, higher, neutral);
    wins[m.winner]++;
    log.push(m);
  }
  const winner = wins[higher] >= need ? higher : lower;
  return { winner, games: log };
}

// 컨퍼런스 4팀: 디비전 우승 2팀이 1·2시드, 나머지 중 승점 상위 2팀이 3·4시드.
// 순서는 컨퍼런스 순위표 기준 (와일드카드도 같은 기준).
export function seedConference(confTable, divWinnerTables) {
  const winners = divWinnerTables.map((t) => t[0].id);
  const rankOf = (id) => confTable.findIndex((s) => s.id === id);
  const topWinners = [...winners].sort((a, b) => rankOf(a) - rankOf(b));
  const wildcards = confTable.map((s) => s.id).filter((id) => !winners.includes(id)).slice(0, 2);
  return [...topWinners, ...wildcards];
}

export function runPlayoffs(season) {
  const { conf, div } = standings(season);
  const conferences = [0, 1].map((c) => {
    const seeds = seedConference(conf[c], [div[c * 2], div[c * 2 + 1]]);
    const [s1, s2, s3, s4] = seeds;
    const semi1 = playKnockout(season, s1, s4);
    const semi2 = playKnockout(season, s2, s3);
    const semis = [
      { a: s1, b: s4, ...semi1 },
      { a: s2, b: s3, ...semi2 },
    ];
    const [f1, f2] = [semi1.winner, semi2.winner];
    // 시드 번호가 낮은(높은 시드) 쪽이 먼저. 결승은 1, 3경기 홈.
    const [hi, lo] = seeds.indexOf(f1) < seeds.indexOf(f2) ? [f1, f2] : [f2, f1];
    const final = playSeries(season, hi, lo, 3, [1, 3]);
    return { seeds, semis, final, champion: final.winner };
  });
  const [metro, doewon] = conferences;
  // 챔피언결정전: 중립 경기장. 홈 표시와 홈 수입이 없다 (홈 어드밴티지는 결과에 영향 없음).
  const title = playSeries(season, metro.champion, doewon.champion, 3, null);
  season.playoffs = { conferences, champion: title.winner, title };
  return season.playoffs;
}

export function finishSeason(season) {
  while (season.nextRound < season.rounds.length) stepRound(season);
  return runPlayoffs(season);
}

export function simulateSeason({ teams, seasonIndex = 0, rng }) {
  const season = createSeason({ teams, seasonIndex, rng });
  finishSeason(season);
  return { season, standings: standings(season), playoffs: season.playoffs };
}
