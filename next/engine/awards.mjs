import { AWARD_MIN_APPS, AWARD_TIER_WEIGHT, YOUNG_MAX_AGE } from './constants.mjs';
import { standings } from './league.mjs';
import { playerRecord } from './records.mjs';
import { allTeams, leagueKey } from './world.mjs';

// 시상 후보 한 줄: 선수의 리그 기록, 챔피언스리그 기록, 소속 팀의 리그 성적.
// 반드시 startNextSeason(승강 반영) 전에 만든다. 그 뒤에는 team.tier가 바뀐다.
// leagueStats: 챔피언스리그 직전 collectStats, afterStats: 챔피언스리그 직후 collectStats(안 치렀으면 leagueStats와 같게)
export function buildRows(world, leagueStats, afterStats = leagueStats) {
  const table = new Map();
  for (const [key, league] of world.leagues) {
    standings(league).forEach((r, i) => table.set(`${key}/${r.id}`, { rank: i + 1, points: r.points, ga: r.ga }));
  }
  const teams = new Map(allTeams(world).map((t) => [t.id, t]));
  const rows = [];
  for (const [id, l] of leagueStats) {
    const a = afterStats.get(id) ?? l;
    const team = teams.get(l.teamId);
    rows.push({
      id, teamId: l.teamId, region: l.region, tier: l.tier, position: l.position, age: l.age, overall: l.overall,
      league: { apps: l.apps, goals: l.goals, assists: l.assists },
      cl: { apps: a.apps - l.apps, goals: a.goals - l.goals, assists: a.assists - l.assists },
      team: table.get(`${leagueKey(team.region, team.tier)}/${l.teamId}`),
    });
  }
  return rows;
}

// 점수가 가장 높은 선수. 동점은 선수 id 순으로 정해서 결과가 흔들리지 않는다.
function best(rows, score, key) {
  let top = null;
  for (const r of rows) {
    const s = score(r);
    if (top === null || s > top.value || (s === top.value && r.id < top.playerId)) top = { key, playerId: r.id, teamId: r.teamId, value: s };
  }
  return top;
}

const eligible = (r) => r.league.apps >= AWARD_MIN_APPS;
const mvpScore = (r) => r.league.goals * 3 + r.league.assists * 2 + r.team.points * 0.4 + r.overall * 0.3;

// 시상: 내 리그 상(MVP, 골든부트, 도움왕, 골든글러브, 올해의 영건)과 전 세계 대상 발롱도르.
// 후보가 없는 상은 null. cl: playChampions 결과(없으면 생략).
export function computeAwards(rows, { myLeagueKey, cl } = {}) {
  const mine = rows.filter((r) => leagueKey(r.region, r.tier) === myLeagueKey && eligible(r));
  const goalkeepers = mine.filter((r) => r.position === 'GK');
  const ballon = (r) => (r.league.goals * 3 + r.league.assists * 2 + r.team.points * 0.4) * AWARD_TIER_WEIGHT[r.tier]
    + r.cl.goals * 2 + r.cl.assists
    + (cl && r.teamId === cl.champion ? 15 : (cl && r.teamId === cl.runnerUp ? 8 : 0));
  return {
    ballonDor: best(rows.filter(eligible), ballon, 'ballonDor'),
    mvp: best(mine, mvpScore, 'mvp'),
    goldenBoot: best(mine, (r) => r.league.goals + r.league.assists / 1000, 'goldenBoot'),
    assistKing: best(mine, (r) => r.league.assists + r.league.goals / 1000, 'assistKing'),
    goldenGlove: best(goalkeepers, (r) => -r.team.ga + r.overall / 1000, 'goldenGlove'),
    youngStar: best(mine.filter((r) => r.age <= YOUNG_MAX_AGE), mvpScore, 'youngStar'),
  };
}

// 수상을 기록실과 선수 카드(메달 줄)에 올린다. 수상자가 없으면(null) 건너뛴다.
export function giveAwards(history, awards, year, world) {
  const byId = new Map(allTeams(world).flatMap((t) => t.stars.map((p) => [p.id, p])));
  for (const award of Object.values(awards)) {
    if (!award) continue;
    const rec = playerRecord(history, { id: award.playerId, position: byId.get(award.playerId)?.position });
    rec.awards.push({ year, key: award.key });
    const p = byId.get(award.playerId);
    if (p) (p.awards ??= []).push({ year, key: award.key });
  }
}

