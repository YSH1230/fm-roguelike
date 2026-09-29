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
