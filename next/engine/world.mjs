import { MY_REGION, REGIONS, TIER_PARAMS } from './constants.mjs';
import { createLeague, isSeasonOver, playChunk } from './league.mjs';
import { randInt } from './rng.mjs';
import { createTeam } from './team.mjs';

// 내 지역(0번)만 1~3부 사다리를 갖고, 나머지 7개 지역은 1부 20팀만 만든다.
export const tiersOf = (region) => (region === MY_REGION ? [1, 2, 3] : [1]);
export const leagueKey = (region, tier) => `${region}:${tier}`;

function makeAiTeam(rng, id, tier) {
  const p = TIER_PARAMS[tier];
  const stars = () => randInt(rng, p.coach[0] * 2, p.coach[1] * 2) / 2;
  const team = createTeam({
    rng,
    id,
    attackStars: stars(),
    defenseStars: stars(),
    starLevel: p.level[0] + rng() * (p.level[1] - p.level[0]),
  });
  team.named = team.stars.slice(0, 3); // 득점·도움·상 경쟁에 나서는 이름 있는 선수 3명
  return team;
}

// myTeam은 내 팀(3부, 내 지역에 들어간다). 리그 3개 + 다른 지역 1부 7개 = 총 10개 리그.
export function createWorld({ rng, myTeam }) {
  const leagues = new Map();
  for (let region = 0; region < REGIONS; region += 1) {
    for (const tier of tiersOf(region)) {
      const teams = [];
      for (let i = 0; i < 20; i += 1) {
        if (region === MY_REGION && tier === 3 && i === 0) {
          teams.push(myTeam);
        } else {
          teams.push(makeAiTeam(rng, `R${region}T${tier}-${String(i).padStart(2, '0')}`, tier));
        }
      }
      for (const t of teams) { t.region = region; t.tier = tier; }
      leagues.set(leagueKey(region, tier), createLeague(teams));
    }
  }
  return { year: 1, myTeamId: myTeam.id, leagues };
}

// 내 팀이 지금 속한 리그
export function myLeague(world) {
  for (const tier of tiersOf(MY_REGION)) {
    const league = world.leagues.get(leagueKey(MY_REGION, tier));
    if (league.teams.has(world.myTeamId)) return league;
  }
  throw new Error('내 팀이 어느 리그에도 없습니다');
}
export const allTeams = (world) => [...world.leagues.values()].flatMap((l) => [...l.teams.values()]);
export const isWorldSeasonOver = (world) => [...world.leagues.values()].every(isSeasonOver);

// 모든 리그가 한 구간씩 함께 진행된다. views는 { 팀 id -> 대체 선수가 들어간 팀 보기 }(계획 4의 lineupView)로,
// 구간 동안만 끼워 넣고 끝나면 원래 팀으로 되돌린다. 리그별 경기 결과를 { 키 -> results }로 돌려준다.
export function playWorldChunk(world, rng, { views = new Map() } = {}) {
  const out = new Map();
  for (const [key, league] of world.leagues) {
    const swapped = [...views.keys()].filter((id) => league.teams.has(id));
    const originals = swapped.map((id) => league.teams.get(id));
    swapped.forEach((id) => league.teams.set(id, views.get(id)));
    try {
      out.set(key, playChunk(league, rng));
    } finally {
      swapped.forEach((id, i) => league.teams.set(id, originals[i]));
    }
  }
  return out;
}
