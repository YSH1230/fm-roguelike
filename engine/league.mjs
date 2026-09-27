import { LEAGUE_POINTS_COEFFICIENT, BASE_POINTS_AT_LEAGUE_AVERAGE } from './constants.mjs';
import { clamp } from './chemistry.mjs';

const MAX_SEASON_POINTS = 38 * 3; // 38경기 승리 시 만점

export function convertPowerToPoints(
  teamPower,
  leagueAverageOVR,
  coefficient = LEAGUE_POINTS_COEFFICIENT,
  basePoints = BASE_POINTS_AT_LEAGUE_AVERAGE
) {
  const raw = basePoints + coefficient * (teamPower - leagueAverageOVR);
  return clamp(raw, 0, MAX_SEASON_POINTS);
}

// 스펙 2절 커리어 사다리. 5부에서 1부까지.
// averageOVR 간격(+9~10)과 승점 기준선 증가폭(안전 +2 / 목표 +2 / 우승 +4)은
// 5부에서 4부로 가는 기존 값의 간격을 그대로 이어붙인 출발값이다.
// tools/tune-ladder.mjs 실측으로 교체한다.
const LEAGUE_TIERS = {
  tier5: { label: '5부', averageOVR: [50, 58], safePoints: 38, targetPoints: 68, championPoints: 80 },
  tier4: { label: '4부', averageOVR: [60, 67], safePoints: 40, targetPoints: 70, championPoints: 84 },
  tier3: { label: '3부', averageOVR: [69, 76], safePoints: 42, targetPoints: 72, championPoints: 88 },
  tier2: { label: '2부', averageOVR: [78, 85], safePoints: 44, targetPoints: 74, championPoints: 92 },
  tier1: { label: '1부', averageOVR: [87, 94], safePoints: 46, targetPoints: 76, championPoints: 96 },
};

// 낮은 리그부터. 사다리 순서는 엔진이 소유한다.
// (예전에는 ui/app.mjs가 자기 사본을 들고 있어서 리그를 늘릴 때 두 군데를 고쳐야 했다.)
export const LEAGUE_LADDER = ['tier5', 'tier4', 'tier3', 'tier2', 'tier1'];

export function getLeagueTier(tierId) {
  const tier = LEAGUE_TIERS[tierId];
  if (!tier) throw new Error(`Unknown league tier: ${tierId}`);
  return tier;
}

export function getLadderIndex(tierId) {
  const index = LEAGUE_LADDER.indexOf(tierId);
  if (index === -1) throw new Error(`Unknown league tier: ${tierId}`);
  return index;
}

export function getNextTier(tierId) {
  const index = getLadderIndex(tierId);
  return LEAGUE_LADDER[index + 1] ?? null;
}
