import { computeTeamPower, applyVariance } from './team-power.mjs';
import { convertPowerToPoints, getLeagueTier } from './league.mjs';
import { applyStableWeekRecovery } from './chemistry.mjs';

// 이적시장 한 주가 지나갈 때: 거래가 있었으면 그대로, 없었으면 적응도 +1 (스펙 6절)
export function advanceWeek(chemistry, hadTransactionThisWeek) {
  return hadTransactionThisWeek ? chemistry : applyStableWeekRecovery(chemistry);
}

// convertPowerToPoints는 38경기(풀시즌) 스케일로 캘리브레이션되어 있으므로,
// 전/후반기(19경기씩) 각각에 쓸 때는 결과를 절반으로 나눠 스케일을 맞춘다.
// ponytail: 근사치. 전/후반기 별도 계수가 필요해지면 그때 분리한다.
export function runHalfSeason(lineup, bench, managerTier, chemistry, leagueTierId, rng = Math.random, boostedTagId = null) {
  const tier = getLeagueTier(leagueTierId);
  const leagueAverageOVR = (tier.averageOVR[0] + tier.averageOVR[1]) / 2;
  const basePower = computeTeamPower(lineup, bench, managerTier, chemistry, boostedTagId);
  const finalPower = applyVariance(basePower, undefined, rng);
  return convertPowerToPoints(finalPower, leagueAverageOVR) / 2;
}

export function judgeSeasonResult(totalPoints, leagueTierId) {
  const tier = getLeagueTier(leagueTierId);
  if (totalPoints >= tier.championPoints) return 'champion';
  if (totalPoints >= tier.targetPoints) return 'promotion';
  if (totalPoints >= tier.safePoints) return 'safe';
  return 'relegation';
}

// 스펙 2절 시즌 루프: 여름 시장(스쿼드 확정) → 전반기 결산 → 겨울 시장 →
// 후반기 결산 → 거취 판정. 이적시장 중 실제 매매는 아직 없어(경제 시스템은
// 계산 함수만 존재), 같은 스쿼드로 전/후반기를 각각 결산한다.
export function runFullSeason(lineup, bench, managerTier, chemistry, leagueTierId, rng = Math.random) {
  const firstHalf = runHalfSeason(lineup, bench, managerTier, chemistry, leagueTierId, rng);
  const secondHalf = runHalfSeason(lineup, bench, managerTier, chemistry, leagueTierId, rng);
  const totalPoints = firstHalf + secondHalf;
  return { firstHalf, secondHalf, totalPoints, result: judgeSeasonResult(totalPoints, leagueTierId) };
}
