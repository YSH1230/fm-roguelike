import { PLAYER_TIERS, POSITIONS, CONTINENT_TAGS, PLAYSTYLE_TAGS, SPECIAL_TRAITS } from '../engine/constants.mjs';
import { NAME_POOLS } from './name-pools.mjs';

function pick(array, rng) {
  return array[Math.floor(rng() * array.length)];
}

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
  const pool = NAME_POOLS[continentTag];
  const name = `${pick(pool.first, rng)} ${pick(pool.last, rng)}`;

  // 30% 확률로 특수 성향 하나 부여 (스펙: 등급 무관 0~1개)
  const specialTrait = rng() < 0.3 ? pick(SPECIAL_TRAITS, rng) : null;

  return {
    id: `p${String(nextId++).padStart(4, '0')}`,
    name,
    baseOVR: randomInt(tier.minOVR, tier.maxOVR, rng),
    age: randomInt(18, 35, rng),
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
