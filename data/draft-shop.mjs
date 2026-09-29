import { generateProceduralPlayer } from './generate-player.mjs';
import { GOD_PLAYER_SHOP_CHANCE } from '../engine/constants.mjs';

// 상점 매물 등급 분포 - 리그별. 자금은 이미 리그가 낮을수록 적게 설계돼
// 있는데(engine/economy.mjs calculateStartingFunds) 카드 등급은 예전엔
// 리그 무관 고정이었다 - 5부에서도 legendary가 뜨는 위화감이 있었다.
// 2000판 재실측(20명 스쿼드 + 리그별 상점 분포 + 5부 자금 discount 반영,
// tools/tune-ladder.mjs):
//   5부 우승  8.1% / 승격 20.4% / 안전 64.0% / 강등  7.4%
//   4부 우승  4.9% / 승격 16.0% / 안전 60.3% / 강등 18.9%
//   3부 우승  6.6% / 승격 14.7% / 안전 57.1% / 강등 21.6%
//   2부 우승  7.0% / 승격 13.1% / 안전 52.9% / 강등 27.1%
//   1부 우승  7.9% / 승격 15.3% / 안전 50.0% / 강등 26.8%
// 리그가 오를수록 우승률이 내려가고 강등률이 오르는 순서는 그대로 유지된다.
// 5부 강등률이 예전(2.6%, 60명 스쿼드 기준)보다 오른 건 시작 스쿼드를
// 20명으로 줄인 결정 + 5부 자금 discount(engine/constants.mjs
// TIER5_FUNDS_DISCOUNT)의 예상된 여파다 - 리그 점수 기준선(engine/league.mjs)은
// 그대로 두고 여기서 더 손대지 않았다.
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
  // GOD 카드는 1부에서만 굴린다 - 예전엔 리그 무관 고정 확률이라 5부 상점에도
  // 똑같이 뜰 수 있었다(local 카드들 사이에 OVR 88+ 카드가 섞이는 위화감).
  const godEligible = tierId === 'tier1' && availableGods.length > 0;
  return Array.from({ length: size }, () => {
    if (godEligible && rng() < GOD_PLAYER_SHOP_CHANCE) {
      return availableGods[Math.floor(rng() * availableGods.length)];
    }
    const tier = pool[Math.floor(rng() * pool.length)];
    return generateProceduralPlayer(tier, rng);
  });
}
