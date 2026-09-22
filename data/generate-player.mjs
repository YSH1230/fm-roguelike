import { PLAYER_TIERS, POSITIONS, CONTINENT_TAGS, PLAYSTYLE_TAGS, SPECIAL_TRAITS } from '../engine/constants.mjs';
import { calculatePlayerPrice } from '../engine/economy.mjs';
import { pick, randomName } from './name-pools.mjs';

// 5부 시작 스쿼드 등급 분포 (스펙 11절: 60~80장, 스펙 2절 "5부=로컬 급"에 맞춤).
// 순수 로컬 등급만 60장 — 실측(node tune-check)으로 확인한 결과, 등급을
// 조금만 섞어도(빅리거 등) 75장 중 베스트11만 골라 쓰는 구조상 평균이 리그
// 평균(50~58)을 계속 웃돌아 강등이 수학적으로 불가능해짐. 상점 매물(더 좋은
// 카드를 뽑을 기회)은 별도 SHOP_TIER_WEIGHTS(draft-shop.mjs)를 쓴다.
export const TIER5_SQUAD_WEIGHTS = { local: 60, bigLeaguer: 0, topClass: 0, worldClass: 0, legendary: 0 };

function pickN(array, n, rng) {
  const pool = [...array];
  const result = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
}

function randomInt(min, max, rng) {
  return min + Math.floor(rng() * (max - min + 1));
}

let nextId = 1;

// 로컬~레전더리 절차적 생성 (GOD은 data/god-players.mjs 참고, 여기서 생성 안 함)
export function generateProceduralPlayer(tierId, rng = Math.random) {
  const tier = PLAYER_TIERS[tierId];
  if (!tier) throw new Error(`Unknown player tier: ${tierId}`);

  const continentTag = pick(Object.keys(CONTINENT_TAGS), rng);
  const name = randomName(continentTag, rng);
  const baseOVR = randomInt(tier.minOVR, tier.maxOVR, rng);
  const age = randomInt(18, 35, rng);

  // 30% 확률로 특수 성향 하나 부여 (스펙: 등급 무관 0~1개).
  // 베테랑 리더는 33세 이상에서만 발동하므로(engine/ovr.mjs), 어린 선수에게는
  // 뽑히지 않게 후보에서 뺀다 — 안 그러면 평생 효과 없는 카드가 생긴다.
  const eligibleTraits = age >= 33 ? SPECIAL_TRAITS : SPECIAL_TRAITS.filter((t) => t !== 'veteranLeader');
  const specialTrait = rng() < 0.3 ? pick(eligibleTraits, rng) : null;

  return {
    id: `p${String(nextId++).padStart(4, '0')}`,
    name,
    baseOVR,
    price: calculatePlayerPrice(tierId, baseOVR),
    age,
    position: pick(POSITIONS, rng),
    playstyleTags: pickN(Object.keys(PLAYSTYLE_TAGS), tier.playstyleTagCount, rng),
    continentTag,
    specialTrait,
    isDraftedYouth: specialTrait === 'seongGolYouth',
  };
}

// tierWeights: { local: 30, bigLeaguer: 25, ... } 처럼 등급별 인원수
export function generateSquadPool(tierWeights, rng = Math.random) {
  const players = [];
  for (const [tierId, count] of Object.entries(tierWeights)) {
    for (let i = 0; i < count; i++) {
      players.push(generateProceduralPlayer(tierId, rng));
    }
  }
  return players;
}
