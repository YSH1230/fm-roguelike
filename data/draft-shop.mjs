import { generateProceduralPlayer } from './generate-player.mjs';
import { GOD_PLAYER_SHOP_CHANCE, PLAYSTYLE_TAGS } from '../engine/constants.mjs';

// 상점 매물 등급 분포 - 리그별. 자금은 이미 리그가 낮을수록 적게 설계돼
// 있는데(engine/economy.mjs calculateStartingFunds) 카드 등급은 예전엔
// 리그 무관 고정이었다 - 5부에서도 legendary가 뜨는 위화감이 있었다.
// 2000판 재실측(20명 스쿼드 + 리그별 상점 분포 + 5부 자금 discount + 케미
// 보너스 상향 + 시작 감독 루키화 + 시작 스쿼드 OVR 상한(11-A) 반영,
// tools/tune-ladder.mjs - 이적시장을 실제로 활용하는 플레이어 기준):
//   5부 우승 11.5% / 승격 21.3% / 안전 60.3% / 강등  6.9%
//   4부 우승  8.9% / 승격 21.6% / 안전 56.9% / 강등 12.7%
//   3부 우승 12.3% / 승격 21.3% / 안전 52.4% / 강등 14.0%
//   2부 우승 17.3% / 승격 16.1% / 안전 48.7% / 강등 17.9%
//   1부 우승 17.6% / 승격 21.6% / 안전 45.4% / 강등 15.5%
// 리그가 오를수록 우승률이 내려가고 강등률이 오르는 순서는 대체로 유지된다.
// 별도로, 이적시장을 한 번도 안 쓰고 12주 내내 "다음 주로"만 누르는 방치
// 플레이의 5부 잔류율을 직접 측정하면 43.6% - 예전(77%)과 달리 방치는
// 진짜로 위험해졌다(11-A 밸런스 패치의 목적).
export const SHOP_TIER_WEIGHTS_BY_TIER = {
  tier5: { local: 70, bigLeaguer: 25, topClass: 5, worldClass: 0, legendary: 0 },
  tier4: { local: 45, bigLeaguer: 35, topClass: 15, worldClass: 5, legendary: 0 },
  tier3: { local: 20, bigLeaguer: 30, topClass: 30, worldClass: 15, legendary: 5 },
  tier2: { local: 10, bigLeaguer: 20, topClass: 30, worldClass: 30, legendary: 10 },
  tier1: { local: 5, bigLeaguer: 10, topClass: 20, worldClass: 40, legendary: 25 },
};

// boost: 스카우터가 톱클래스 이상 카드가 나올 가중치를 올리는 비율(0이면 리그 기본 분포).
const TOP_TIERS = ['topClass', 'worldClass', 'legendary'];
function tierPool(tierId, boost = 0) {
  const weights = SHOP_TIER_WEIGHTS_BY_TIER[tierId] ?? SHOP_TIER_WEIGHTS_BY_TIER.tier1;
  return Object.entries(weights).flatMap(([tier, count]) => Array(Math.round(count * 10 * (TOP_TIERS.includes(tier) ? 1 + boost : 1))).fill(tier));
}

// 상점형 드래프트: N장 전부 살 수 있다(자금이 제약). 스펙 7절.
// availableGods: 이번 런에서 아직 등장/영입되지 않은 GOD 카드 목록(data/god-players.mjs).
// 등장해도 목록에서 빼지 않는다 - 실제로 "영입"할 때만 소모(ui/app.mjs에서 처리).
// tierId: 지금 뛰는 리그 등급. 안 넘기면 가장 관대한 tier1 분포를 쓴다
// (구버전 호출부·유닛 테스트 호환용 기본값 - 실제 게임은 항상 넘긴다).
// 스카우터 목표 태그 카드: 이 리그 상점 분포의 등급으로 뽑되, 그 태그를 달 수 있는 포지션으로 만든다.
function targetedCard(tag, tierId, rng, position = null) {
  const pool = tierPool(tierId);
  const tier = pool[Math.floor(rng() * pool.length)];
  return generateProceduralPlayer(tier, rng, position, tag);
}

// targetTag/targetSlots: 스카우터가 매주 맨 앞 targetSlots장을 목표 태그 카드로 보장한다.
// targetPosition: 태그 보장 카드 다음 한 장을 그 포지션 선수로 보장한다(베테랑 이상 스카우터).
// qualityBoost: 스카우터가 올려 주는 상위 등급 확률.
// combined: 태그와 포지션을 동시에 만족하는 카드 1장(마스터). 한쪽만 정했으면 그쪽 카드 1장.
export function generateShopOffer(size, availableGods = [], rng = Math.random, tierId = 'tier1', targetTag = null, targetSlots = 0, targetPosition = null, qualityBoost = 0, combined = false) {
  const pool = tierPool(tierId, qualityBoost);
  // GOD 카드는 1부에서만 굴린다 - 예전엔 리그 무관 고정 확률이라 5부 상점에도
  // 똑같이 뜰 수 있었다(local 카드들 사이에 OVR 88+ 카드가 섞이는 위화감).
  const godEligible = tierId === 'tier1' && availableGods.length > 0;
  return Array.from({ length: size }, (_, i) => {
    if (targetTag && i < targetSlots && PLAYSTYLE_TAGS[targetTag]) return targetedCard(targetTag, tierId, rng, combined ? targetPosition : null);
    if (targetPosition && !(combined && targetTag && targetSlots) && i === (targetTag ? targetSlots : 0)) {
      return generateProceduralPlayer(pool[Math.floor(rng() * pool.length)], rng, targetPosition);
    }
    if (godEligible && rng() < GOD_PLAYER_SHOP_CHANCE) {
      return availableGods[Math.floor(rng() * availableGods.length)];
    }
    const tier = pool[Math.floor(rng() * pool.length)];
    return generateProceduralPlayer(tier, rng);
  });
}
