import { calculatePlayerPrice, renewalCost, computeReleaseProceeds } from './economy.mjs';
import { PLAYER_TIERS, PROMOTION_RENEWAL_HIKE_RATIO, PROMOTION_TRANSFER_DEMAND_OVR_PENALTY } from './constants.mjs';

// [FFP 긴급 감사] (일반 위기): 탑클래스 1명분 비용을 내거나, 카드 1장을 무료로 방출한다.
// "탑클래스 1명분"은 등급 중간값 OVR 기준으로 계산한다.
export function resolveFfpAudit() {
  const { minOVR, maxOVR } = PLAYER_TIERS.topClass;
  const midOVR = Math.round((minOVR + maxOVR) / 2);
  return { payCost: calculatePlayerPrice('topClass', midOVR) };
}

// 승격 전용 위기: 핵심 선수 재계약 비용 +30%
export function resolvePromotionRenewalHike(originalPrice, years) {
  return Math.round(renewalCost(originalPrice, years) * (1 + PROMOTION_RENEWAL_HIKE_RATIO));
}

// 승격 전용 위기: 핵심 선수 이적 요구. 수락하면 40% 회수 방출, 거부하면 그 시즌 OVR -N.
export function resolvePromotionTransferDemand(originalPrice, rng = Math.random) {
  return {
    acceptProceeds: computeReleaseProceeds(originalPrice, 'deadline', rng), // 40%
    rejectOvrPenalty: PROMOTION_TRANSFER_DEMAND_OVR_PENALTY,
  };
}
