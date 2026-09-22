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

// 스펙 2절 "커리어 사다리 및 리그 스케일링" 표 — 슬라이스 범위(5부, 4부)만 우선 구현
const LEAGUE_TIERS = {
  tier5: { averageOVR: [50, 58], safePoints: 38, targetPoints: 68, championPoints: 80 },
  tier4: { averageOVR: [60, 67], safePoints: 40, targetPoints: 70, championPoints: 84 },
};

export function getLeagueTier(tierId) {
  const tier = LEAGUE_TIERS[tierId];
  if (!tier) throw new Error(`Unknown league tier: ${tierId}`);
  return tier;
}
