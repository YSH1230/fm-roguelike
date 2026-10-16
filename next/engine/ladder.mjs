import { MY_REGION } from './constants.mjs';
import { createLeague, standings } from './league.mjs';
import { applyMatchStats, simulateMatch } from './match.mjs';
import { allTeams, isWorldSeasonOver, leagueKey, myLeague } from './world.mjs';

// 단판: 비기면 승부차기(50대 50). 상위 리그 팀이 홈이다.
export function playOffMatch(home, away, rng) {
  const r = simulateMatch(home, away, rng);
  applyMatchStats(home, away, r);
  const penalties = r.homeGoals === r.awayGoals;
  const homeWins = penalties ? rng() < 0.5 : r.homeGoals > r.awayGoals;
  return { homeId: home.id, awayId: away.id, homeGoals: r.homeGoals, awayGoals: r.awayGoals, penalties, winnerId: homeWins ? home.id : away.id };
}

const ids = (league) => standings(league).map((r) => r.id);

// 시즌이 끝난 내 지역의 승강을 확정한다.
// 2·3부 1~2위 자동 승격, 3위는 상위 리그 18위와 단판. 1·2부 19~20위 자동 강등.
// 반환: { playoffs, membership: {1,2,3 -> id[]}, finalRank: Map(id -> 순위), tierBefore: Map(id -> 단계) }
export function resolveLadder(world, rng) {
  if (!isWorldSeasonOver(world)) throw new Error('시즌이 아직 끝나지 않았습니다');
  const leagues = { 1: world.leagues.get(leagueKey(MY_REGION, 1)), 2: world.leagues.get(leagueKey(MY_REGION, 2)), 3: world.leagues.get(leagueKey(MY_REGION, 3)) };
  const rank = { 1: ids(leagues[1]), 2: ids(leagues[2]), 3: ids(leagues[3]) };
  const team = (tier, id) => leagues[tier].teams.get(id);

  const a = playOffMatch(team(1, rank[1][17]), team(2, rank[2][2]), rng); // 2부 3위가 1부 18위에 도전
  const b = playOffMatch(team(2, rank[2][17]), team(3, rank[3][2]), rng); // 3부 3위가 2부 18위에 도전

  const membership = {
    1: [...rank[1].slice(0, 17), ...rank[2].slice(0, 2), a.winnerId],
    2: [...rank[2].slice(3, 17), ...rank[1].slice(18), a.winnerId === rank[1][17] ? rank[2][2] : rank[1][17],
      ...rank[3].slice(0, 2), b.winnerId],
    3: [...rank[3].slice(3), ...rank[2].slice(18), b.winnerId === rank[2][17] ? rank[3][2] : rank[2][17]],
  };
  const finalRank = new Map();
  const tierBefore = new Map();
  for (const tier of [1, 2, 3]) rank[tier].forEach((id, i) => { finalRank.set(id, i + 1); tierBefore.set(id, tier); });
  return { playoffs: [a, b], membership, finalRank, tierBefore };
}

// 내 감독 운명: 3부에서 강등권(19~20위) 마감, 또는 강등되면 'fired', 승격하면 'promoted', 아니면 'stay'.
export function managerFate(outcome, myId) {
  const from = outcome.tierBefore.get(myId);
  const to = [1, 2, 3].find((t) => outcome.membership[t].includes(myId));
  if (from === 3 && outcome.finalRank.get(myId) >= 19) return 'fired';
  if (to > from) return 'fired';
  return to < from ? 'promoted' : 'stay';
}

function resetSeasonStats(team) {
  for (const p of [...team.lineup, ...Object.values(team.subs ?? {})]) p.stats = { apps: 0, goals: 0, assists: 0 };
}

// 새 시즌: 승강을 반영해 내 지역 리그 3개를 다시 짜고, 다른 지역 리그는 같은 팀으로 새 일정을 만든다.
// 선수의 시즌 기록은 0으로 돌아간다(계획 6이 기록실에 옮기는 일을 이 호출 전에 끝내야 한다).
export function startNextSeason(world, outcome) {
  const byId = new Map(allTeams(world).map((t) => [t.id, t]));
  const next = new Map();
  for (const [key, league] of world.leagues) {
    const region = Number(key.split(':')[0]);
    if (region === MY_REGION) continue;
    next.set(key, createLeague([...league.teams.values()]));
  }
  for (const tier of [1, 2, 3]) {
    const teams = outcome.membership[tier].map((id) => byId.get(id));
    for (const t of teams) t.tier = tier;
    next.set(leagueKey(MY_REGION, tier), createLeague(teams));
  }
  for (const t of byId.values()) resetSeasonStats(t);
  world.leagues = next;
  world.year += 1;
  return myLeague(world);
}
