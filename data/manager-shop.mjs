import { generateProceduralManager } from './generate-manager.mjs';
import { GOD_MANAGERS } from './god-managers.mjs';

// 감독 시장 매물. 스펙 11절: 별도 탭에서 매주 후보 순환. 루키가 흔하고
// 레전더리는 드물게(가격도 껑충 뛰니 자주 보이면 시작부터 고민할 이유가 없다).
const TIER_WEIGHTS = { rookie: 60, tactician: 30, legendary: 10 };
const TIER_POOL = Object.entries(TIER_WEIGHTS).flatMap(([tier, count]) => Array(count).fill(tier));

// GOD 감독은 전 세계 2명 - 슬롯마다 드물게 끼고, 지금 우리 감독이면 안 나온다(해임하면 다시 매물로 돌아옴).
const GOD_MANAGER_CHANCE = 0.04;

export function generateManagerOffer(size, rng = Math.random, currentManagerId = null) {
  const gods = GOD_MANAGERS.filter((g) => g.id !== currentManagerId);
  const offer = [];
  for (let i = 0; i < size; i++) {
    const god = gods.filter((g) => !offer.includes(g));
    if (god.length && rng() < GOD_MANAGER_CHANCE) {
      offer.push(god[Math.floor(rng() * god.length)]);
      continue;
    }
    const tier = TIER_POOL[Math.floor(rng() * TIER_POOL.length)];
    offer.push(generateProceduralManager(tier, rng));
  }
  return offer;
}
