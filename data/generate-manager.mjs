import {
  MANAGER_TIER_MULTIPLIER,
  MANAGER_TRAITS,
  HIGH_TIER_RESTRICTED_TRAITS,
  MANAGER_PRICE_TABLE,
  BASIC_TAGS,
  EXTRA_TAGS,
  TAG_IDS,
  CONTINENT_TAGS,
} from '../engine/constants.mjs';
import { randomInRange } from '../engine/economy.mjs';
import { pick, randomName } from './name-pools.mjs';

let nextId = 1;

// 선호 전술 태그: 루키는 처음 3종(초반 상점에도 흔해서 불화가 안 난다), 택티션은 3종 70% / 나머지 3종 30%, 레전더리는 6종 전부.
function pickTacticalTag(tierId, rng) {
  if (tierId === 'legendary') return pick(TAG_IDS, rng);
  if (tierId === 'tactician' && rng() < 0.3) return pick(EXTRA_TAGS, rng);
  return pick(BASIC_TAGS, rng);
}

// rookie/tactician/legendary만 생성 (GOD 2명은 data/god-managers.mjs 수작업)
export function generateProceduralManager(tierId, rng = Math.random) {
  if (!(tierId in MANAGER_TIER_MULTIPLIER) || tierId === 'god') {
    throw new Error(`generateProceduralManager는 god를 생성하지 않음: ${tierId}`);
  }

  const continentTag = pick(Object.keys(CONTINENT_TAGS), rng);
  const name = randomName(continentTag, rng);

  // 스펙 5.2절: 등급이 낮을수록 강한 세부 성향(헤어드라이어 등)을 가짐 — 반비례 밸런스
  const eligibleTraits =
    tierId === 'legendary'
      ? MANAGER_TRAITS.filter((t) => !HIGH_TIER_RESTRICTED_TRAITS.includes(t))
      : MANAGER_TRAITS;
  const noTraitChance = tierId === 'legendary' ? 0.5 : 0;
  const trait = rng() < noTraitChance ? null : pick(eligibleTraits, rng);

  const [minPrice, maxPrice] = MANAGER_PRICE_TABLE[tierId];

  return {
    id: `mgr${String(nextId++).padStart(3, '0')}`,
    name,
    tier: tierId,
    multiplier: MANAGER_TIER_MULTIPLIER[tierId],
    price: Math.round(randomInRange(minPrice, maxPrice, rng)),
    tacticalTag: pickTacticalTag(tierId, rng),
    continentTag,
    trait,
  };
}
