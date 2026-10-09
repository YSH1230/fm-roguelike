import { clamp } from './chemistry.mjs';
import {
  PLAYER_TIERS,
  PLAYER_PRICE_TABLE,
  COST_MODIFIER_CLAMP_MIN,
  COST_MODIFIER_CLAMP_MAX,
  RELEASE_RECOVERY_IMMEDIATE,
  RELEASE_RECOVERY_LISTED_SUMMER,
  RELEASE_RECOVERY_LISTED_WINTER,
  RELEASE_RECOVERY_DEADLINE,
  STARTING_FUNDS_BY_TIER,
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

// 시즌 지급액 배율. 계약(재계약비)을 없애서 생긴 여윳돈을 리그별로 되돌리는 조절판이다. first = 첫 시즌.
// 시뮬레이션(tools/sim-human.mjs, 환경변수 FS)으로 맞춘다.
export const FUNDS_SCALE = { first: 1.25, tier5: 0.85, tier4: 0.85, tier3: 0.75, tier2: 0.7, tier1: 0.45 };
export const fundsScale = (tierId, seasonNumber) => (seasonNumber <= 1 ? FUNDS_SCALE.first : FUNDS_SCALE[tierId] ?? 1);

// 판매 오퍼(2시즌~): 선수 가치(OVR)에 비례해 1~3건. 금액은 기존 판매 범위(여름 50~100%, 겨울 70~110%)에서 굴린다.
export function saleOfferCount(baseOVR) {
  return baseOVR >= 81 ? 3 : baseOVR >= 63 ? 2 : 1;
}
export function generateSaleOffers(originalPrice, baseOVR, method, rng = Math.random) {
  return Array.from({ length: saleOfferCount(baseOVR) }, () => computeReleaseProceeds(originalPrice, method, rng))
    .sort((a, b) => b - a);
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

// 리그 단계(0 = 5부)에 따른 시작 자금. 5부(인덱스 0)만 추가로 깎는다 -
// 곡선 전체(4부 이상)는 그대로 두고 "5부가 너무 넉넉하다"는 지점만 고친다.
export function calculateStartingFunds(leagueTierIndex) {
  return STARTING_FUNDS_BY_TIER[leagueTierIndex];
}

// 이월 자금은 다음 시즌 시작 자금의 10%를 넘지 않음
export function applyCarryoverCap(leftoverFunds, nextSeasonStartingFunds) {
  return Math.min(leftoverFunds, nextSeasonStartingFunds * CARRYOVER_CAP_RATIO);
}

// 시즌 결산 후 남은 돈 중 이월 상한을 넘는 몫은 구단이 "운영 명분"으로 회수한다.
// 어디에 쓰였는지(구단 운영비, 경기장 증축 등)를 2~3개 항목으로 나눠 보여주기 위한 순수 함수.
const RECALL_REASONS = ['구단 운영비', '경기장 증축', '유소년 아카데미 투자', '시설 유지보수', '스태프 임금 인상'];
export function recallFunds(leftover, nextGrant, rng = Math.random) {
  const carried = Math.round(applyCarryoverCap(Math.max(0, leftover), nextGrant));
  const recalled = Math.max(0, Math.round(leftover) - carried);
  if (recalled === 0) return { carried, recalled: 0, items: [] };
  const pool = [...RECALL_REASONS];
  const count = recalled >= 60 ? 3 : 2;
  const picks = [];
  for (let i = 0; i < count && pool.length; i++) picks.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  const weights = picks.map(() => 0.5 + rng());
  const total = weights.reduce((a, b) => a + b, 0);
  let left = recalled;
  const items = picks.map((label, i) => {
    const amount = i === picks.length - 1 ? left : Math.round((recalled * weights[i]) / total);
    left -= amount;
    return { label, amount };
  });
  return { carried, recalled, items };
}
