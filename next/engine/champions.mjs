import { CL_PER_REGION, REGIONS } from './constants.mjs';
import { emptyRow, generateFixtures, record, standings } from './league.mjs';
import { applyMatchStats, simulateMatch } from './match.mjs';
import { playOffMatch } from './ladder.mjs';
import { leagueKey } from './world.mjs';

// 각 지역 1부 상위 4팀 = 32팀. 지역 순서는 [지역 번호 -> 그 지역 4팀(1위부터)]
export function championsEntrants(world) {
  const regions = [];
  for (let region = 0; region < REGIONS; region += 1) {
    const league = world.leagues.get(leagueKey(region, 1));
    regions.push(standings(league).slice(0, CL_PER_REGION).map((r) => league.teams.get(r.id)));
  }
  return regions;
}

// 조 추첨: 지역 순서를 섞은 뒤, g조의 p번째 포트(p위 팀)는 (g + 2p)번째 지역에서 가져온다.
// 한 조에 같은 지역 팀이 둘 들어가지 않는다.
export function drawGroups(regions, rng) {
  const order = regions.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return Array.from({ length: 8 }, (_, g) => [0, 1, 2, 3].map((pot) => regions[order[(g + 2 * pot) % 8]][pot]));
}

function playGroup(teams, rng) {
  const ids = teams.map((t) => t.id);
  const byId = new Map(teams.map((t) => [t.id, t]));
  const table = new Map(ids.map((id) => [id, emptyRow()]));
  const matches = [];
  for (const round of generateFixtures(ids)) {
    for (const [homeId, awayId] of round) {
      const result = simulateMatch(byId.get(homeId), byId.get(awayId), rng);
      applyMatchStats(byId.get(homeId), byId.get(awayId), result);
      record(table, homeId, awayId, result);
      matches.push({ homeId, awayId, ...result });
    }
  }
  return { ids, table: standings({ table }), matches };
}

// 챔피언스리그 한 시즌: 8개 조(홈 앤 어웨이 6경기) -> 16강 -> 8강 -> 4강 -> 결승(모두 단판, 비기면 승부차기).
// 반환: { groups, rounds: { r16, qf, sf, final }, champion, runnerUp }
export function playChampions(world, rng) {
  const regions = championsEntrants(world);
  const teams = drawGroups(regions, rng);
  const byId = new Map(regions.flat().map((t) => [t.id, t]));
  const groups = teams.map((g) => playGroup(g, rng));
  const winner = (g) => byId.get(groups[g].table[0].id);
  const second = (g) => byId.get(groups[g].table[1].id);

  const knock = (pairs) => pairs.map(([home, away]) => playOffMatch(home, away, rng));
  const winners = (matches) => matches.map((m) => byId.get(m.winnerId));
  const next = (list) => list.reduce((acc, t, i) => (i % 2 === 0 ? [...acc, [t, list[i + 1]]] : acc), []);

  const r16 = knock([0, 2, 4, 6].flatMap((a) => [[winner(a), second(a + 1)], [winner(a + 1), second(a)]]));
  const qf = knock(next(winners(r16)));
  const sf = knock(next(winners(qf)));
  const final = knock(next(winners(sf)));
  const champion = final[0].winnerId;
  return {
    groups,
    rounds: { r16, qf, sf, final },
    champion,
    runnerUp: champion === final[0].homeId ? final[0].awayId : final[0].homeId,
  };
}
