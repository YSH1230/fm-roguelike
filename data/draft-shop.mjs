import { generateProceduralPlayer } from './generate-player.mjs';
import { GOD_PLAYER_SHOP_CHANCE } from '../engine/constants.mjs';

// 상점 매물 등급 분포 - 리그별. 자금은 이미 리그가 낮을수록 적게 설계돼
// 있는데(engine/economy.mjs calculateStartingFunds) 카드 등급은 예전엔
// 리그 무관 고정이었다 - 5부에서도 legendary가 뜨는 위화감이 있었다.
// 아래 값은 tools/tune-ladder.mjs로 재튜닝하기 전 출발점이다(스펙 문서 참고).
export const SHOP_TIER_WEIGHTS_BY_TIER = {
  tier5: { local: 70, bigLeaguer: 25, topClass: 5, worldClass: 0, legendary: 0 },
  tier4: { local: 45, bigLeaguer: 35, topClass: 15, worldClass: 5, legendary: 0 },
  tier3: { local: 20, bigLeaguer: 30, topClass: 30, worldClass: 15, legendary: 5 },
  tier2: { local: 10, bigLeaguer: 20, topClass: 30, worldClass: 30, legendary: 10 },
  tier1: { local: 5, bigLeaguer: 10, topClass: 20, worldClass: 40, legendary: 25 },
};

function tierPool(tierId) {
  const weights = SHOP_TIER_WEIGHTS_BY_TIER[tierId] ?? SHOP_TIER_WEIGHTS_BY_TIER.tier1;
  return Object.entries(weights).flatMap(([tier, count]) => Array(count).fill(tier));
}

// 상점형 드래프트: N장 전부 살 수 있다(자금이 제약). 스펙 7절.
// availableGods: 이번 런에서 아직 등장/영입되지 않은 GOD 카드 목록(data/god-players.mjs).
// 등장해도 목록에서 빼지 않는다 - 실제로 "영입"할 때만 소모(ui/app.mjs에서 처리).
// tierId: 지금 뛰는 리그 등급. 안 넘기면 가장 관대한 tier1 분포를 쓴다
// (구버전 호출부·유닛 테스트 호환용 기본값 - 실제 게임은 항상 넘긴다).
export function generateShopOffer(size, availableGods = [], rng = Math.random, tierId = 'tier1') {
  const pool = tierPool(tierId);
  return Array.from({ length: size }, () => {
    if (availableGods.length > 0 && rng() < GOD_PLAYER_SHOP_CHANCE) {
      return availableGods[Math.floor(rng() * availableGods.length)];
    }
    const tier = pool[Math.floor(rng() * pool.length)];
    return generateProceduralPlayer(tier, rng);
  });
}
