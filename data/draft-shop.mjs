import { generateProceduralPlayer } from './generate-player.mjs';
import { GOD_PLAYER_SHOP_CHANCE } from '../engine/constants.mjs';

// 상점 매물 전용 등급 분포. 시작 스쿼드(TIER5_SQUAD_WEIGHTS)보다 상위 등급
// 비중을 조금 더 둬서, 12주 이적시장 동안 가끔 더 좋은 카드를 뽑는 재미를 준다.
// (시작 스쿼드와 같은 분포를 쓰면 상위 등급을 영영 못 보게 됨 — node tune-check로 확인)
const SHOP_TIER_WEIGHTS = { local: 45, bigLeaguer: 30, topClass: 15, worldClass: 8, legendary: 2 };
const TIER_POOL = Object.entries(SHOP_TIER_WEIGHTS).flatMap(([tier, count]) => Array(count).fill(tier));

// 상점형 드래프트: N장 전부 살 수 있다(자금이 제약). 스펙 7절.
// availableGods: 이번 런에서 아직 등장/영입되지 않은 GOD 카드 목록(data/god-players.mjs).
// 등장해도 목록에서 빼지 않는다 — 실제로 "영입"할 때만 소모(ui/app.mjs에서 처리).
export function generateShopOffer(size, availableGods = [], rng = Math.random) {
  return Array.from({ length: size }, () => {
    if (availableGods.length > 0 && rng() < GOD_PLAYER_SHOP_CHANCE) {
      return availableGods[Math.floor(rng() * availableGods.length)];
    }
    const tier = TIER_POOL[Math.floor(rng() * TIER_POOL.length)];
    return generateProceduralPlayer(tier, rng);
  });
}
