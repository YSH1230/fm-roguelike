import { generateProceduralPlayer } from './generate-player.mjs';
import { GOD_PLAYER_SHOP_CHANCE } from '../engine/constants.mjs';

// 상점 매물 전용 등급 분포. 시작 스쿼드(TIER5_SQUAD_WEIGHTS)보다 상위 등급
// 비중을 조금 더 둬서, 12주 이적시장 동안 가끔 더 좋은 카드를 뽑는 재미를 준다.
// (시작 스쿼드와 같은 분포를 쓰면 상위 등급을 영영 못 보게 됨 — node tune-check로 확인)
// 상위 등급 비중을 { 45, 30, 15, 8, 2 }에서 아래 값으로 넓혔다(tools/tune-ladder.mjs).
// 그전에는 legendary가 매물의 2%뿐이어서 12주 36장을 다 봐도 플레이어 베스트11이
// 2부에서 86, 1부에서 88에 막혔다 — 1부 리그 평균에 못 미쳐서 우승이 불가능했다.
// 카드 가격은 리그와 무관하게 고정(스펙 7절)이라, 자금이 1.5배씩 늘어나는 상위
// 리그만 이 분포의 이득을 받는다. 5부는 애초에 비싼 카드를 살 돈이 없어서
// 2500판 실측 우승률이 21~23%로 기존 24%와 거의 같다(강등 2.4%로 유지).
const SHOP_TIER_WEIGHTS = { local: 35, bigLeaguer: 25, topClass: 18, worldClass: 14, legendary: 8 };
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
