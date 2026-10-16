import { SEASON } from './constants.mjs';
import { applyMatchStats, simulateMatch } from './match.mjs';

// 원형(circle) 방식 더블 라운드로빈. 20팀이면 38라운드, 라운드마다 10경기.
export function generateFixtures(teamIds) {
  const n = teamIds.length;
  if (n < 2 || n % 2 !== 0) throw new Error('팀 수는 2 이상의 짝수여야 합니다');
  if (new Set(teamIds).size !== n) throw new Error('팀 id가 중복됩니다');
  const ids = [...teamIds];
  const firstLeg = [];
  for (let r = 0; r < n - 1; r += 1) {
    const round = [];
    for (let i = 0; i < n / 2; i += 1) {
      const home = ids[i];
      const away = ids[n - 1 - i];
      round.push(r % 2 === 0 ? [home, away] : [away, home]);
    }
    firstLeg.push(round);
    ids.splice(1, 0, ids.pop()); // 첫 팀은 고정하고 나머지를 한 칸 회전
  }
  const secondLeg = firstLeg.map((round) => round.map(([home, away]) => [away, home]));
  return [...firstLeg, ...secondLeg];
}

export const emptyRow = () => ({ played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 });

export function createLeague(teams) {
  const ids = teams.map((t) => t.id);
  return {
    teams: new Map(teams.map((t) => [t.id, t])),
    fixtures: generateFixtures(ids),
    nextRound: 0,
    chunkIndex: 0,
    table: new Map(ids.map((id) => [id, emptyRow()])),
  };
}

export function record(table, homeId, awayId, { homeGoals, awayGoals }) {
  const home = table.get(homeId);
  const away = table.get(awayId);
  home.played += 1;
  away.played += 1;
  home.gf += homeGoals;
  home.ga += awayGoals;
  away.gf += awayGoals;
  away.ga += homeGoals;
  if (homeGoals > awayGoals) {
    home.won += 1; home.points += 3; away.lost += 1;
  } else if (homeGoals < awayGoals) {
    away.won += 1; away.points += 3; home.lost += 1;
  } else {
    home.drawn += 1; away.drawn += 1; home.points += 1; away.points += 1;
  }
}

export const isSeasonOver = (league) => league.chunkIndex >= SEASON.chunks.length;

// 다음 구간(14/14/10라운드)을 한 번에 시뮬하고 경기 결과 목록을 돌려준다.
export function playChunk(league, rng) {
  const size = SEASON.chunks[league.chunkIndex];
  if (size === undefined) throw new Error('시즌이 이미 끝났습니다');
  const results = [];
  for (let i = 0; i < size; i += 1) {
    for (const [homeId, awayId] of league.fixtures[league.nextRound]) {
      const home = league.teams.get(homeId);
      const away = league.teams.get(awayId);
      const result = simulateMatch(home, away, rng);
      applyMatchStats(home, away, result);
      record(league.table, homeId, awayId, result);
      results.push({ round: league.nextRound, homeId, awayId, ...result });
    }
    league.nextRound += 1;
  }
  league.chunkIndex += 1;
  return results;
}

// 승점, 골득실, 다득점 순
export function standings(league) {
  return [...league.table.entries()]
    .map(([id, row]) => ({ id, ...row, gd: row.gf - row.ga }))
    .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
}

// 득점·도움 순위(이름 있는 선수 전체)
export function topScorers(league, limit = 5) {
  const players = [...league.teams.values()].flatMap((t) => t.lineup.map((p) => ({ teamId: t.id, id: p.id, goals: p.stats.goals, assists: p.stats.assists })));
  return players.sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, limit);
}
