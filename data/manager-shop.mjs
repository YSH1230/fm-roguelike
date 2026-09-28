import { generateProceduralManager } from './generate-manager.mjs';

// 감독 시장 매물. 스펙 11절: 별도 탭에서 매주 후보 순환. 루키가 흔하고
// 레전더리는 드물게(가격도 껑충 뛰니 자주 보이면 시작부터 고민할 이유가 없다).
const TIER_WEIGHTS = { rookie: 60, tactician: 30, legendary: 10 };
const TIER_POOL = Object.entries(TIER_WEIGHTS).flatMap(([tier, count]) => Array(count).fill(tier));

export function generateManagerOffer(size, rng = Math.random) {
  return Array.from({ length: size }, () => {
    const tier = TIER_POOL[Math.floor(rng() * TIER_POOL.length)];
    return generateProceduralManager(tier, rng);
  });
}
