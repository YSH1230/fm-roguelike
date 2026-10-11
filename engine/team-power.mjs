import { computePlayerFinalOVR } from './ovr.mjs';
import { chemistryMultiplier, clamp } from './chemistry.mjs';
import { TEAM_MULTIPLIER_CAP, POWER_VARIANCE_RATIO } from './constants.mjs';

// fx = 감독 특기 효과(engine/specialties.mjs). 감독 NPC는 없다 - 전력은 선발 평균 OVR(특기·태그 보너스 포함) × 조직력 배율이다.
export function computeAverageOVR(lineup, bench, fx = null) {
  const total = lineup.reduce(
    (sum, player) => sum + computePlayerFinalOVR(player, lineup, bench, fx),
    0
  );
  return total / lineup.length;
}

export function computeTeamMultiplier(chemistry) {
  return clamp(chemistryMultiplier(chemistry), 0, TEAM_MULTIPLIER_CAP);
}

export function computeTeamPower(lineup, bench, chemistry, fx = null) {
  return computeAverageOVR(lineup, bench, fx) * computeTeamMultiplier(chemistry);
}

export function applyVariance(power, varianceRatio = POWER_VARIANCE_RATIO, randomFn = Math.random) {
  const swing = (randomFn() * 2 - 1) * varianceRatio; // -ratio ~ +ratio
  return power * (1 + swing);
}
