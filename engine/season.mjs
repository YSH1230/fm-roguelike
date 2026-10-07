import { computeTeamPower, applyVariance } from './team-power.mjs';
import { convertPowerToPoints, getLeagueTier } from './league.mjs';
import { applyStableWeekRecovery } from './chemistry.mjs';
import { BOARD_GOAL_POSITION, BOARD_REWARD_FUNDS_PER_POINT, BOARD_REWARD_FUNDS_CAP, BOARD_REWARD_CHEMISTRY } from './constants.mjs';

// 이적시장 한 주가 지나갈 때: 거래가 있었으면 그대로, 없었으면 적응도 +1 (스펙 6절)
export function advanceWeek(chemistry, hadTransactionThisWeek) {
  return hadTransactionThisWeek ? chemistry : applyStableWeekRecovery(chemistry);
}

// convertPowerToPoints는 38경기(풀시즌) 스케일로 캘리브레이션되어 있으므로,
// 전/후반기(19경기씩) 각각에 쓸 때는 결과를 절반으로 나눠 스케일을 맞춘다.
// ponytail: 근사치. 전/후반기 별도 계수가 필요해지면 그때 분리한다.
export function runHalfSeason(lineup, bench, managerTier, chemistry, leagueTierId, rng = Math.random, coach = null, roles = undefined) {
  const tier = getLeagueTier(leagueTierId);
  const leagueAverageOVR = (tier.averageOVR[0] + tier.averageOVR[1]) / 2;
  const basePower = computeTeamPower(lineup, bench, managerTier, chemistry, coach, { leagueTierId, roles });
  const finalPower = applyVariance(basePower, undefined, rng);
  return convertPowerToPoints(finalPower, leagueAverageOVR) / 2;
}

// pointsModifier: 구단별 이사진 기대치 가감(data/clubs.mjs). 튜닝된 리그
// 기준선(tier.*)은 그대로 두고 판정 문턱만 밀어 올리거나 내린다.
export function judgeSeasonResult(totalPoints, leagueTierId, pointsModifier = 0) {
  const tier = getLeagueTier(leagueTierId);
  if (totalPoints >= tier.championPoints + pointsModifier) return 'champion';
  if (totalPoints >= tier.targetPoints + pointsModifier) return 'promotion';
  if (totalPoints >= tier.safePoints + pointsModifier) return 'safe';
  return 'relegation';
}

// 스펙 2절 시즌 루프을 한 번에 계산하는 간단 버전 (매주 이적시장을 진행하지
// 않고 같은 스쿼드로 전/후반기만 계산). 실제 게임(ui/app.mjs)은 12주
// 이적시장을 진행하면서 runHalfSeason을 두 번 직접 호출하므로 이 함수를
// 쓰지 않는다 — 밸런스 시뮬레이터 등 "매매 없이 빠르게 결과만" 볼 때를 위해 남겨둔다.
export function runFullSeason(lineup, bench, managerTier, chemistry, leagueTierId, rng = Math.random) {
  const firstHalf = runHalfSeason(lineup, bench, managerTier, chemistry, leagueTierId, rng);
  const secondHalf = runHalfSeason(lineup, bench, managerTier, chemistry, leagueTierId, rng);
  const totalPoints = firstHalf + secondHalf;
  return { firstHalf, secondHalf, totalPoints, result: judgeSeasonResult(totalPoints, leagueTierId) };
}

// 이사진이 그 시즌 요구하는 승점. tier는 구단 기대치가 이미 반영된 리그 기준선
// (안전선/승격선)이다.
export function boardGoalPoints(tier) {
  return Math.round(tier.safePoints + (tier.targetPoints - tier.safePoints) * BOARD_GOAL_POSITION);
}

// 목표를 넘긴 승점만큼 보상. baseGrant는 그 리그의 시즌 지급액.
export function boardReward(totalPoints, goal, baseGrant) {
  const surplus = Math.round(totalPoints - goal);
  if (surplus <= 0) return { surplus, funds: 0, chemistry: 0 };
  const ratio = Math.min(BOARD_REWARD_FUNDS_CAP, surplus * BOARD_REWARD_FUNDS_PER_POINT);
  return { surplus, funds: Math.round(baseGrant * ratio), chemistry: BOARD_REWARD_CHEMISTRY };
}
