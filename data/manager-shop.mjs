import { generateProceduralManager } from './generate-manager.mjs';
import { GOD_MANAGERS } from './god-managers.mjs';
import { MANAGER_OFFER_WEIGHTS_BY_TIER } from '../engine/constants.mjs';

// 감독 시장 매물. 스펙 11절: 별도 탭에서 매주 후보 순환. 리그가 낮을수록 루키가 압도적이고
// 레전더리는 아예 없다(5부 시장에 월드클래스 감독이 있는 건 비현실적) - 위로 갈수록 높은 등급이 늘어난다.
const poolFor = (tierId) => Object.entries(MANAGER_OFFER_WEIGHTS_BY_TIER[tierId] ?? MANAGER_OFFER_WEIGHTS_BY_TIER.tier3)
  .flatMap(([tier, count]) => Array(count).fill(tier));

// GOD 감독은 전 세계 2명 - 슬롯마다 드물게 끼고, 지금 우리 감독이면 안 나온다(해임하면 다시 매물로 돌아옴).
const GOD_MANAGER_CHANCE = 0.04;

export function generateManagerOffer(size, rng = Math.random, currentManagerId = null, tierId = 'tier1') {
  const pool = poolFor(tierId);
  // GOD 감독은 GOD 선수처럼 1부에서만 나온다.
  const gods = tierId === 'tier1' ? GOD_MANAGERS.filter((g) => g.id !== currentManagerId) : [];
  const offer = [];
  for (let i = 0; i < size; i++) {
    const god = gods.filter((g) => !offer.includes(g));
    if (god.length && rng() < GOD_MANAGER_CHANCE) {
      offer.push(god[Math.floor(rng() * god.length)]);
      continue;
    }
    const tier = pool[Math.floor(rng() * pool.length)];
    offer.push(generateProceduralManager(tier, rng));
  }
  return offer;
}
