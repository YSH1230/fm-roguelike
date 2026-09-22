import { computePlayerFinalOVR } from './ovr.mjs';
import { chemistryMultiplier, clamp } from './chemistry.mjs';
import { MANAGER_TIER_MULTIPLIER, TEAM_MULTIPLIER_CAP, POWER_VARIANCE_RATIO } from './constants.mjs';

export function computeAverageOVR(lineup, bench, boostedTagId = null) {
  const total = lineup.reduce(
    (sum, player) => sum + computePlayerFinalOVR(player, lineup, bench, boostedTagId),
    0
  );
  return total / lineup.length;
}

export function computeTeamMultiplier(managerTier, chemistry) {
  const raw = MANAGER_TIER_MULTIPLIER[managerTier] * chemistryMultiplier(chemistry);
  return clamp(raw, 0, TEAM_MULTIPLIER_CAP);
}

export function computeTeamPower(lineup, bench, managerTier, chemistry, boostedTagId = null) {
  return computeAverageOVR(lineup, bench, boostedTagId) * computeTeamMultiplier(managerTier, chemistry);
}

export function applyVariance(power, varianceRatio = POWER_VARIANCE_RATIO, randomFn = Math.random) {
  const swing = (randomFn() * 2 - 1) * varianceRatio; // -ratio ~ +ratio
  return power * (1 + swing);
}
