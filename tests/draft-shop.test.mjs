import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateShopOffer } from '../data/draft-shop.mjs';
import { PLAYER_TIERS } from '../engine/constants.mjs';

test('generateShopOffer는 요청한 장수만큼 카드를 만든다', () => {
  const offer = generateShopOffer(3);
  assert.equal(offer.length, 3);
});

test('상점 카드는 전부 값이 매겨진 유효한 등급 카드다', () => {
  const offer = generateShopOffer(5);
  for (const card of offer) {
    assert.ok(card.price > 0);
    assert.ok(Object.keys(PLAYER_TIERS).some((t) => card.baseOVR >= PLAYER_TIERS[t].minOVR));
  }
});

test('리그가 낮을수록 상점 매물의 평균 OVR이 낮다', () => {
  const rng = () => 0.5; // 각 리그 테이블 안에서 항상 같은 인덱스를 골라 결정론적으로 비교
  const avgOVR = (tierId) => {
    const offer = generateShopOffer(200, [], rng, tierId);
    return offer.reduce((sum, c) => sum + c.baseOVR, 0) / offer.length;
  };
  assert.ok(avgOVR('tier5') < avgOVR('tier3'));
  assert.ok(avgOVR('tier3') < avgOVR('tier1'));
});

test('tierId 없이 호출해도(구버전 호출부) 정상 동작한다', () => {
  const offer = generateShopOffer(3);
  assert.equal(offer.length, 3);
});

test('GOD 카드는 1부가 아니면 절대 안 뜬다', () => {
  const gods = [{ id: 'god-1', name: 'Test God', baseOVR: 99 }];
  // rng를 거의 0에 붙여서 GOD_PLAYER_SHOP_CHANCE를 항상 통과하게 만든다 -
  // 그래도 tier5/tier4에서는 한 장도 안 나와야 한다.
  const rng = () => 0.0001;
  for (const tierId of ['tier5', 'tier4', 'tier3', 'tier2']) {
    const offer = generateShopOffer(50, gods, rng, tierId);
    assert.ok(offer.every((c) => c.id !== 'god-1'), `${tierId}에 GOD 카드가 뜨면 안 된다`);
  }
  const tier1Offer = generateShopOffer(50, gods, rng, 'tier1');
  assert.ok(tier1Offer.some((c) => c.id === 'god-1'), '1부에서는 GOD 카드가 뜰 수 있어야 한다');
});
