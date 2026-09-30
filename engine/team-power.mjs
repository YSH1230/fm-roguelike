import { computePlayerFinalOVR } from './ovr.mjs';
import { chemistryMultiplier, clamp } from './chemistry.mjs';
import {
  MANAGER_TIER_MULTIPLIER, TEAM_MULTIPLIER_CAP, POWER_VARIANCE_RATIO,
  COACH_POWER_MULTIPLIER, LEAGUE_EXPECTED_MANAGER,
} from './constants.mjs';

export function computeAverageOVR(lineup, bench, boostedTagId = null) {
  const total = lineup.reduce(
    (sum, player) => sum + computePlayerFinalOVR(player, lineup, bench, boostedTagId),
    0
  );
  return total / lineup.length;
}

// extras: { leagueTierId, coachLevel } - 리그가 기대하는 감독 대비 배율, 수석 코치 직접 효과.
// 둘 다 없으면(옛 호출) 감독 × 적응도만 곱한다.
export function computeTeamMultiplier(managerTier, chemistry, extras = {}) {
  const expected = extras.leagueTierId ? LEAGUE_EXPECTED_MANAGER[extras.leagueTierId] ?? 1 : 1;
  const coach = COACH_POWER_MULTIPLIER[extras.coachLevel] ?? 1;
  const raw = (MANAGER_TIER_MULTIPLIER[managerTier] / expected) * chemistryMultiplier(chemistry) * coach;
  return clamp(raw, 0, TEAM_MULTIPLIER_CAP);
}

export function computeTeamPower(lineup, bench, managerTier, chemistry, boostedTagId = null, extras = {}) {
  return computeAverageOVR(lineup, bench, boostedTagId) * computeTeamMultiplier(managerTier, chemistry, extras);
}

export function applyVariance(power, varianceRatio = POWER_VARIANCE_RATIO, randomFn = Math.random) {
  const swing = (randomFn() * 2 - 1) * varianceRatio; // -ratio ~ +ratio
  return power * (1 + swing);
}
