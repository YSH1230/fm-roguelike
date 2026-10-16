import { AI_NAMED_MAX, FA_FRESH, FA_RELEASED, POSITIONS, RESIGN_MIN_MOOD, ROSTER_STARS } from './constants.mjs';
import { askingSalary, marketValue, newContract } from './contract.mjs';
import { createPlayer, overall } from './player.mjs';
import { randInt } from './rng.mjs';
import { setStars } from './roster.mjs';

// 가치가 높은 선수일수록 영입 조건이 까다롭다.
// 조건: maxRank(작년 N위 이상), minFacility(시설 N 이상), minFans(팬 N 이상), minMorale(팀 사기 N 이상)
function makeConditions(rng, player) {
  const v = marketValue(player);
  const c = {};
  if (v > 60 && rng() < 0.7) c.maxRank = randInt(rng, 4, 12);
  if (v > 50 && rng() < 0.5) c.minFacility = randInt(rng, 2, 6);
  if (v > 55 && rng() < 0.4) c.minFans = randInt(rng, 10, 50);
  if (rng() < 0.3) c.minMorale = randInt(rng, 50, 75);
  return c;
}

export const toEntry = (rng, player) => ({ player, conditions: makeConditions(rng, player), asking: askingSalary(player) });

// 이번 시즌 FA 시장: 새로 만든 6명 + 풀려난 선수(최대 4명).
// released는 내 팀이 거절한 선수나 AI 팀이 내놓은 선수 목록이다.
export function generateFreeAgents(rng, { released = [], prefix }) {
  const fresh = Array.from({ length: FA_FRESH }, (_, i) => createPlayer({
    rng,
    id: `${prefix}-${i}`,
    position: POSITIONS[randInt(rng, 0, POSITIONS.length - 1)],
    age: randInt(rng, 24, 31),
    level: 45 + rng() * 35,
  }));
  return [...fresh, ...released.slice(0, FA_RELEASED)].map((p) => toEntry(rng, p));
}

// club: { rank(작년 순위), facility, fans, morale(팀 사기), capRoom }
// 이유 순서: 캡 → 영입 조건 → 금액. 이유는 화면에서 그대로 보여 준다.
export function evaluateOffer(entry, salary, club) {
  const c = entry.conditions;
  if (salary > club.capRoom) return { accepted: false, reason: 'cap' };
  if (c.maxRank !== undefined && club.rank > c.maxRank) return { accepted: false, reason: 'rank' };
  if (c.minFacility !== undefined && club.facility < c.minFacility) return { accepted: false, reason: 'facility' };
  if (c.minFans !== undefined && club.fans < c.minFans) return { accepted: false, reason: 'fans' };
  if (c.minMorale !== undefined && club.morale < c.minMorale) return { accepted: false, reason: 'morale' };
  if (salary < entry.asking) return { accepted: false, reason: 'salary' };
  return { accepted: true, reason: null };
}

// 협상이 통과한 FA를 내 팀 스타로 데려온다. 자리가 없으면 먼저 누군가를 내보내야 한다.
export function signFreeAgent(team, rng, entry, salary, club) {
  if (team.stars.length >= ROSTER_STARS) throw new Error('스타 자리가 가득 찼습니다');
  const result = evaluateOffer(entry, salary, club);
  if (!result.accepted) throw new Error(`영입 실패: ${result.reason}`);
  entry.player.contract = newContract(salary);
  setStars(team, rng, [...team.stars, entry.player]);
  return entry.player;
}

// 재계약·연장 연봉은 선수 가치(요구 연봉)에 비례해 고정이다. 사기가 80 이상이면 90%에 응한다.
export const resignSalary = (player) => Math.round(askingSalary(player) * (player.mood >= 80 ? 0.9 : 1));

// 재계약: 사기가 너무 낮으면 거절한다.
export function evaluateResign(player, salary, club) {
  if (player.mood < RESIGN_MIN_MOOD) return { accepted: false, reason: 'mood' };
  if (salary > club.capRoom + player.contract.salary) return { accepted: false, reason: 'cap' };
  const need = resignSalary(player);
  if (salary < need) return { accepted: false, reason: 'salary' };
  return { accepted: true, reason: null };
}

export function resign(player, salary, club) {
  const result = evaluateResign(player, salary, club);
  if (!result.accepted) throw new Error(`재계약 실패: ${result.reason}`);
  player.contract = newContract(salary);
}

// 재계약을 거절했거나 안 한 선수를 팀에서 빼서 FA 시장 항목으로 돌려준다.
export function releaseToPool(team, rng, player) {
  if (!team.stars.includes(player)) throw new Error('이 팀의 스타가 아닙니다');
  setStars(team, rng, team.stars.filter((p) => p !== player));
  return toEntry(rng, player);
}

// 내가 영입하지 않은 FA는 AI 팀이 데려가 이름 있는 AI 선수(팀당 최대 3명)가 된다.
// 3명이 넘으면 가장 약한 선수가 밀려난다.
export function aiSign(rng, entries, aiTeams) {
  if (entries.length > 0 && aiTeams.length === 0) throw new Error('영입할 AI 팀이 없습니다');
  return entries.map((entry) => {
    const team = aiTeams[randInt(rng, 0, aiTeams.length - 1)];
    const named = (team.named ??= []);
    named.push(entry.player);
    if (named.length > AI_NAMED_MAX) {
      named.sort((a, b) => overall(b) - overall(a));
      named.length = AI_NAMED_MAX;
    }
    return { playerId: entry.player.id, teamId: team.id };
  });
}

