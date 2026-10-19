// 풋살 매니지먼트 M1: 16팀 한국 리그, 22경기 정규시즌, 컨퍼런스 플레이오프.
// 순수 로직. 경기는 통째 시뮬(futsalSim 없이)로 처리한다.
import { createRng } from '../next/engine/rng.mjs';

export const TEAM_NAMES = [
  '서울', '인천', '수원', '대전', '대구', '부산', '울산', '광주/전남',
  '경기', '강원', '충남', '충북', '경북', '경남', '전북', '제주',
];
export const CONFERENCE_NAMES = ['메트로', '도원'];
export const DIVISION_NAMES = ['북부', '남부'];
export const ABILITIES = ['speed', 'stamina', 'power', 'tech', 'shoot'];
export const GOALS_PER_TEAM = 2.5;
export const SEGMENT_SIZES = [7, 7, 8];

// 팀 id 0~15: 컨퍼런스 = id >> 3, 디비전 = (id >> 2) & 1 (0 북부, 1 남부)
export const conferenceOf = (id) => id >> 3;
export const divisionOf = (id) => (id >> 2) & 1;
export const divisionGroupOf = (id) => id >> 2; // 0~3

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createTeams(rng) {
  return TEAM_NAMES.map((name, id) => {
    const base = 9 + rng() * 5; // 팀 기본 수준 9~14
    const players = Array.from({ length: 8 }, (_, k) => {
      const abilities = {};
      for (const s of ABILITIES) {
        abilities[s] = clamp(Math.round(base + (rng() * 2 - 1) * 6), 0, 20);
      }
      return { id: `${id}-${k}`, abilities };
    });
    return { id, name, conference: conferenceOf(id), division: divisionOf(id), players };
  });
}

// 코트 5명 = 능력 합 상위 5명. 공격 = (속도, 기술, 슛), 수비 = (속도, 체력, 힘) 평균.
export function teamStrength(team) {
  const court = [...team.players]
    .sort((a, b) => sumAbilities(b) - sumAbilities(a))
    .slice(0, 5);
  const avg = (keys) =>
    court.reduce((t, p) => t + keys.reduce((s, k) => s + p.abilities[k], 0) / keys.length, 0) /
    court.length;
  return { attack: avg(['speed', 'tech', 'shoot']), defense: avg(['speed', 'stamina', 'power']) };
}

const sumAbilities = (p) => ABILITIES.reduce((s, k) => s + p.abilities[k], 0);

// 기대 득점 = 2.5 × (내 공격 ÷ 상대 수비). 능력이 같으면 2.5골.
export function expectedGoals(attacker, defender) {
  return clamp(GOALS_PER_TEAM * (attacker.attack / defender.defense), 0.3, 6);
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

// 한 경기 통째 시뮬. 무승부 허용 여부는 호출자가 정한다.
export function simulateMatch(home, away, rng) {
  const lh = expectedGoals(teamStrength(home), teamStrength(away));
  const la = expectedGoals(teamStrength(away), teamStrength(home));
  return { hg: poisson(lh, rng), ag: poisson(la, rng), lh, la };
}

// 정규시즌 일정: 22 라운드 × 8경기 (각 라운드에 16팀 전원이 한 번씩 뛴다).
//  라운드 1~8   : 같은 컨퍼런스 다른 디비전 (4 × 4 쌍, 홈/원정 두 번)
//  라운드 9~14  : 다른 컨퍼런스 (K8,8 중 6개 매칭)
//  라운드 15~20 : 같은 디비전 (K4 3개 매칭을 두 번, 홈/원정 뒤집어서)
//  라운드 21~22 : 다른 컨퍼런스 나머지 2개 매칭
// 관리 구간: 라운드 1~7 / 8~14 / 15~22 (7 / 7 / 8경기).
// 홀수 시즌은 모든 경기의 홈/원정을 뒤집는다.
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
    for (const round of rounds) for (const m of round) [m.home, m.away] = [m.away, m.home];
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

// 순위표. 승점 → 동점 팀끼리의 승자승(미니리그 승점) → 득실차 → 다득점 → 추첨 키.
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
    if (group.length > 1) {
      const ids = new Set(group.map((s) => s.id));
      const mini = new Map(group.map((s) => [s.id, 0]));
      for (const m of results) {
        if (!ids.has(m.home) || !ids.has(m.away)) continue;
        if (m.hg > m.ag) mini.set(m.home, mini.get(m.home) + 3);
        else if (m.hg < m.ag) mini.set(m.away, mini.get(m.away) + 3);
        else { mini.set(m.home, mini.get(m.home) + 1); mini.set(m.away, mini.get(m.away) + 1); }
      }
      group.sort(
        (a, b) =>
          mini.get(b.id) - mini.get(a.id) ||
          b.gd - a.gd ||
          b.gf - a.gf ||
          drawKey[a.id] - drawKey[b.id],
      );
    }
    table.push(...group);
    i = j;
  }
  return table;
}

// 시즌 상태. stepRound로 한 라운드씩, finishSeason으로 나머지와 플레이오프.
export function createSeason({ teams, seasonIndex = 0, rng }) {
  return {
    teams,
    seasonIndex,
    rng,
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
    const sim = simulateMatch(season.teams[m.home], season.teams[m.away], season.rng);
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

// 단판 또는 시리즈. 동점(연장과 승부차기 대신)은 기대 득점 비율로 가린다.
function playMatch(season, home, away) {
  const sim = simulateMatch(season.teams[home], season.teams[away], season.rng);
  let winner;
  if (sim.hg !== sim.ag) winner = sim.hg > sim.ag ? home : away;
  else winner = season.rng() < sim.lh / (sim.lh + sim.la) ? home : away;
  return { home, away, hg: sim.hg, ag: sim.ag, winner };
}

// homeGames: 높은 시드가 홈인 경기 번호 목록, null이면 중립 (홈 = higher로 고정하되 의미 없음)
function playSeries(season, higher, lower, games, homeGames) {
  const need = Math.ceil(games / 2);
  const wins = { [higher]: 0, [lower]: 0 };
  const log = [];
  for (let g = 1; wins[higher] < need && wins[lower] < need; g++) {
    const higherHome = homeGames === null || homeGames.includes(g);
    const homeTeam = higherHome ? higher : lower;
    const awayTeam = higherHome ? lower : higher;
    const m = playMatch(season, homeTeam, awayTeam);
    wins[m.winner]++;
    log.push(m);
  }
  const winner = wins[higher] >= need ? higher : lower;
  return { winner, games: log };
}

// 컨퍼런스 4팀: 디비전 우승 2팀이 1·2시드, 나머지 중 승점 상위 2팀이 3·4시드.
export function seedConference(confTable, divTables) {
  const winners = divTables.map((t) => t[0].id);
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
    const semi1 = playMatch(season, s1, s4);
    const semi2 = playMatch(season, s2, s3);
    const pairs = [[s1, s4, semi1], [s2, s3, semi2]];
    const [f1, f2] = pairs.map(([, , m]) => m.winner);
    // 시드 번호가 낮은(높은 시드) 쪽이 먼저 홈 1, 3경기
    const [hi, lo] = seeds.indexOf(f1) < seeds.indexOf(f2) ? [f1, f2] : [f2, f1];
    const final = playSeries(season, hi, lo, 3, [1, 3]);
    return { seeds, semis: pairs.map(([a, b, m]) => ({ a, b, ...m })), final, champion: final.winner };
  });
  const [metro, doewon] = conferences;
  // 챔피언결정전은 중립 경기장: 홈 개념 없이 playSeries에 홈 지정 없음
  const champ = playSeries(season, metro.champion, doewon.champion, 3, null);
  season.playoffs = { conferences, champion: champ.winner, title: champ };
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
