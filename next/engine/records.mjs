import { overall } from './player.mjs';
import { allTeams } from './world.mjs';

// 기록 대상은 모든 팀의 스타(내 선수 + 이름 있는 AI 선수)다. 조연은 기록실에 올리지 않는다.
export function collectStats(world) {
  const out = new Map();
  for (const team of allTeams(world)) {
    for (const p of team.stars) {
      out.set(p.id, {
        id: p.id, teamId: team.id, region: team.region, tier: team.tier, position: p.position, age: p.age,
        overall: overall(p), apps: p.stats.apps, goals: p.stats.goals, assists: p.stats.assists,
      });
    }
  }
  return out;
}

// after - before (없던 선수는 after 그대로)
export function diffStats(after, before) {
  const out = new Map();
  for (const [id, a] of after) {
    const b = before.get(id) ?? { apps: 0, goals: 0, assists: 0 };
    out.set(id, { ...a, apps: a.apps - b.apps, goals: a.goals - b.goals, assists: a.assists - b.assists });
  }
  return out;
}

export const createHistory = () => ({
  players: new Map(), // id -> { id, position, mine, career: { apps, goals, assists }, seasons: [], awards: [] }
  champions: [], // 시즌별 각 리그·챔피언스리그 우승팀과 주요 선수
  mySeasons: [], // 내 팀의 시즌 결과
  trophies: [], // 내 트로피 진열대
  retired: [],
  hallOfFame: [],
  bestTier: 3,
});

export function playerRecord(history, row) {
  if (!history.players.has(row.id)) {
    history.players.set(row.id, { id: row.id, position: row.position, mine: false, career: { apps: 0, goals: 0, assists: 0 }, seasons: [], awards: [] });
  }
  return history.players.get(row.id);
}

// 시즌이 끝날 때(선수 시즌 기록이 0으로 돌아가기 전에) 한 번 부른다.
// leagueStats: 리그 종료 시점의 collectStats, clStats: 챔피언스리그만의 증가분(diffStats), 안 나갔으면 빈 Map.
export function recordSeason(history, { year, leagueStats, clStats = new Map(), myTeamId }) {
  for (const [id, l] of leagueStats) {
    const c = clStats.get(id) ?? { apps: 0, goals: 0, assists: 0 };
    if (l.apps + c.apps === 0) continue;
    const rec = playerRecord(history, l);
    if (l.teamId === myTeamId) rec.mine = true;
    rec.seasons.push({
      year, teamId: l.teamId, tier: l.tier, apps: l.apps, goals: l.goals, assists: l.assists,
      clApps: c.apps, clGoals: c.goals, clAssists: c.assists,
    });
    rec.career.apps += l.apps + c.apps;
    rec.career.goals += l.goals + c.goals;
    rec.career.assists += l.assists + c.assists;
  }
}
