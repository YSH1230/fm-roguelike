import { clamp } from './chemistry.mjs';
import {
  PLAYER_TIERS,
  PLAYER_PRICE_TABLE,
  COST_MODIFIER_CLAMP_MIN,
  COST_MODIFIER_CLAMP_MAX,
  CONTRACT_RENEWAL_RATIO,
  RELEASE_RECOVERY_IMMEDIATE,
  RELEASE_RECOVERY_LISTED_SUMMER,
  RELEASE_RECOVERY_LISTED_WINTER,
  RELEASE_RECOVERY_DEADLINE,
  STARTING_FUNDS_TIER5,
  FUNDS_MULTIPLIER_PER_LEAGUE_TIER,
  CARRYOVER_CAP_RATIO,
} from './constants.mjs';

export function randomInRange(min, max, rng = Math.random) {
  return min + rng() * (max - min);
}

// 선수 가격: 등급 내 OVR 위치에 비례한 선형 보간 (스펙 7절)
export function calculatePlayerPrice(tierId, baseOVR) {
  const tier = PLAYER_TIERS[tierId];
  const [minPrice, maxPrice] = PLAYER_PRICE_TABLE[tierId];
  if (!tier) throw new Error(`Unknown player tier: ${tierId}`);
  const progress = (baseOVR - tier.minOVR) / (tier.maxOVR - tier.minOVR);
  return Math.round(minPrice + progress * (maxPrice - minPrice));
}

// 영입비 할인/할증(감독 화술, 윈터 택스 등)을 전부 가산 합산 후 한 번만 적용, -60%~+80% 클램프
export function applyCostModifiers(basePrice, modifierRatios) {
  const total = modifierRatios.reduce((sum, r) => sum + r, 0);
  const clamped = clamp(total, COST_MODIFIER_CLAMP_MIN, COST_MODIFIER_CLAMP_MAX);
  return Math.round(basePrice * (1 + clamped));
}

// 재계약 비용: 1년 연장 30%, 2년 연장 60%
export function renewalCost(originalPrice, years) {
  const ratio = CONTRACT_RENEWAL_RATIO[years];
  if (ratio === undefined) throw new Error(`Unknown renewal years: ${years}`);
  return Math.round(originalPrice * ratio);
}

// 방출 3단계 회수 금액. method: 'immediate' | 'listedSummer' | 'listedWinter' | 'deadline'
export function computeReleaseProceeds(originalPrice, method, rng = Math.random) {
  switch (method) {
    case 'immediate':
      return Math.round(originalPrice * RELEASE_RECOVERY_IMMEDIATE);
    case 'listedSummer':
      return Math.round(originalPrice * randomInRange(...RELEASE_RECOVERY_LISTED_SUMMER, rng));
    case 'listedWinter':
      return Math.round(originalPrice * randomInRange(...RELEASE_RECOVERY_LISTED_WINTER, rng));
    case 'deadline':
      return Math.round(originalPrice * RELEASE_RECOVERY_DEADLINE);
    default:
      throw new Error(`Unknown release method: ${method}`);
  }
}

// 리그 단계(0 = 5부)에 따른 시작 자금
export function calculateStartingFunds(leagueTierIndex) {
  return Math.round(STARTING_FUNDS_TIER5 * FUNDS_MULTIPLIER_PER_LEAGUE_TIER ** leagueTierIndex);
}

// 이월 자금은 다음 시즌 시작 자금의 30%를 넘지 않음
export function applyCarryoverCap(leftoverFunds, nextSeasonStartingFunds) {
  return Math.min(leftoverFunds, nextSeasonStartingFunds * CARRYOVER_CAP_RATIO);
}
