import { generateProceduralPlayer, TIER5_SQUAD_WEIGHTS } from './generate-player.mjs';

// TIER5_SQUAD_WEIGHTS 비율대로 등급을 뽑는 풀 (로컬 30개, 빅리거 25개... 처럼 가중치를 그대로 반영)
const TIER_POOL = Object.entries(TIER5_SQUAD_WEIGHTS).flatMap(([tier, count]) => Array(count).fill(tier));

// 상점형 드래프트: N장 전부 살 수 있다(자금이 제약). 스펙 7절.
export function generateShopOffer(size, rng = Math.random) {
  return Array.from({ length: size }, () => {
    const tier = TIER_POOL[Math.floor(rng() * TIER_POOL.length)];
    return generateProceduralPlayer(tier, rng);
  });
}
