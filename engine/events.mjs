import { calculatePlayerPrice, renewalCost, computeReleaseProceeds } from './economy.mjs';
import { PLAYER_TIERS, PROMOTION_RENEWAL_HIKE_RATIO, PROMOTION_TRANSFER_DEMAND_OVR_PENALTY } from './constants.mjs';

// [FFP 긴급 감사] (일반 위기): 비용을 내거나, 자금이 모자라면 카드 1장을 무료로 방출한다.
// 비용은 그 리그 시즌 지급액의 12%(최소 20G)다. 예전에는 "탑클래스 1명분"(약 210G)이라 5부(지급 330G)에는 너무 커서 비율로 바꿨다.
export const FFP_AUDIT_RATIO = 0.12;
export function resolveFfpAudit(baseFunds = 330) {
  return { payCost: Math.max(20, Math.round(baseFunds * FFP_AUDIT_RATIO)) };
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
