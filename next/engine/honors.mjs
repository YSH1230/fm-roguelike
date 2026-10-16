import { CAREER_SCORE } from './constants.mjs';
import { standings } from './league.mjs';
import { playerRecord } from './records.mjs';
import { allTeams } from './world.mjs';

// 팀의 주요 선수: 이번 시즌 득점+도움이 많은 스타 3명의 id
const keyPlayers = (team) => [...team.stars]
  .sort((a, b) => (b.stats.goals + b.stats.assists) - (a.stats.goals + a.stats.assists) || (a.id < b.id ? -1 : 1))
  .slice(0, 3).map((p) => p.id);

// 시즌 우승팀 기록(역대 우승팀). 승강을 반영하는 startNextSeason 전에, 선수 시즌 기록이 0이 되기 전에 부른다.
// cl: playChampions 결과(안 치렀으면 생략)
export function recordChampions(history, { year, world, cl }) {
  const teams = new Map(allTeams(world).map((t) => [t.id, t]));
  const leagues = {};
  for (const [key, league] of world.leagues) {
    const winnerId = standings(league)[0].id;
    leagues[key] = { teamId: winnerId, players: keyPlayers(teams.get(winnerId)) };
  }
  const champions = cl ? { teamId: cl.champion, players: keyPlayers(teams.get(cl.champion)) } : null;
  history.champions.push({ year, leagues, champions });
}

// 내 팀의 시즌 결과와 트로피 진열대. tier는 이번 시즌에 뛴 리그 단계, rank는 최종 순위.
// awards는 computeAwards 결과이며 내 팀 선수가 받은 상은 진열대에 오른다.
export function recordMyTeam(history, { year, tier, rank, fate, clChampion = false, awards = {}, myTeamId }) {
  const leagueChampion = rank === 1;
  history.mySeasons.push({ year, tier, rank, fate, leagueChampion, clChampion });
  history.bestTier = Math.min(history.bestTier, tier);
  if (leagueChampion) history.trophies.push({ year, kind: 'league', tier });
  if (clChampion) history.trophies.push({ year, kind: 'cl' });
  for (const award of Object.values(awards)) {
    if (award && award.teamId === myTeamId) history.trophies.push({ year, kind: 'award', key: award.key, playerId: award.playerId });
  }
}

// 은퇴식: 선수의 통산을 정리해 보관한다. 스타 명단에서 빼는 일은 계획 4의 retire/endOfSeason이 한다.
export function retirePlayer(history, player, year) {
  const rec = playerRecord(history, { id: player.id, position: player.position });
  const bestSeason = rec.seasons.reduce((m, s) => Math.max(m, s.goals + s.clGoals), 0);
  const ceremony = {
    playerId: player.id, year, age: player.age, seasons: rec.seasons.length,
    career: { ...rec.career }, awards: rec.awards.length, bestSeasonGoals: bestSeason,
  };
  history.retired.push(ceremony);
  return ceremony;
}

// 명예의 전당은 은퇴한 선수 중에서 내가 직접 지정한다.
export function inductHallOfFame(history, playerId) {
  const retired = history.retired.find((r) => r.playerId === playerId);
  if (!retired) throw new Error('은퇴한 선수만 명예의 전당에 올릴 수 있습니다');
  if (history.hallOfFame.some((h) => h.playerId === playerId)) throw new Error('이미 명예의 전당에 있습니다');
  history.hallOfFame.push({ playerId, retiredYear: retired.year });
}

// 종료 정산용 커리어 요약과 점수(점수식은 초기값).
export function careerSummary(history) {
  const leagueTitles = history.trophies.filter((t) => t.kind === 'league').length;
  const clTitles = history.trophies.filter((t) => t.kind === 'cl').length;
  const awardCount = history.trophies.filter((t) => t.kind === 'award').length;
  const standout = [...history.players.values()].filter((p) => p.mine)
    .sort((a, b) => (b.career.goals + b.career.assists) - (a.career.goals + a.career.assists) || (a.id < b.id ? -1 : 1))
    .slice(0, 3).map((p) => p.id);
  const score = CAREER_SCORE.bestTier[history.bestTier]
    + leagueTitles * CAREER_SCORE.leagueTitle + clTitles * CAREER_SCORE.clTitle + awardCount * CAREER_SCORE.award
    + history.hallOfFame.length * CAREER_SCORE.hallOfFame + history.mySeasons.length * CAREER_SCORE.season;
  return {
    seasons: history.mySeasons.length, bestTier: history.bestTier, leagueTitles, clTitles, awardCount,
    hallOfFame: history.hallOfFame.map((h) => h.playerId), standout, score,
  };
}

// 엔딩: 1부에서 우승하면 'league'(목표 달성), 챔피언스리그에서 우승하면 'champions'(최종). 각각 처음 한 번만.
// seen: 이미 본 엔딩 목록. 둘이 한 시즌에 겹치면 최종 엔딩 하나만 보여 주고 둘 다 본 것으로 친다.
export function endingFor({ tier, rank, clChampion }, seen = []) {
  if (clChampion && !seen.includes('champions')) return 'champions';
  if (tier === 1 && rank === 1 && !seen.includes('league')) return 'league';
  return null;
}
