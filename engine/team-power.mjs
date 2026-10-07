import { computePlayerFinalOVR, autoRoles } from './ovr.mjs';
import { chemistryMultiplier, clamp } from './chemistry.mjs';
import {
  MANAGER_TIER_MULTIPLIER, TEAM_MULTIPLIER_CAP, POWER_VARIANCE_RATIO,
  LEAGUE_EXPECTED_MANAGER,
} from './constants.mjs';

export function computeAverageOVR(lineup, bench, coach = null, roles = undefined) {
  const r = roles === undefined ? autoRoles(lineup, bench, coach) : roles; // 한 번만 구해서 전원에게 쓴다
  const total = lineup.reduce(
    (sum, player) => sum + computePlayerFinalOVR(player, lineup, bench, coach, r),
    0
  );
  return total / lineup.length;
}

// extras: { leagueTierId } - 리그가 기대하는 감독 대비 배율. 없으면(옛 호출) 감독 × 적응도만 곱한다.
// 수석 코치 효과는 선수 OVR에 유닛 보너스로 이미 들어가 있다(engine/ovr.mjs coachBonusFor).
export function computeTeamMultiplier(managerTier, chemistry, extras = {}) {
  const expected = extras.leagueTierId ? LEAGUE_EXPECTED_MANAGER[extras.leagueTierId] ?? 1 : 1;
  const raw = (MANAGER_TIER_MULTIPLIER[managerTier] / expected) * chemistryMultiplier(chemistry);
  return clamp(raw, 0, TEAM_MULTIPLIER_CAP);
}

export function computeTeamPower(lineup, bench, managerTier, chemistry, coach = null, extras = {}) {
  return computeAverageOVR(lineup, bench, coach, extras.roles) * computeTeamMultiplier(managerTier, chemistry, extras);
}

export function applyVariance(power, varianceRatio = POWER_VARIANCE_RATIO, randomFn = Math.random) {
  const swing = (randomFn() * 2 - 1) * varianceRatio; // -ratio ~ +ratio
  return power * (1 + swing);
}
