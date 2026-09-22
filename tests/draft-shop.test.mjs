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
