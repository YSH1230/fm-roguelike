import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateShopOffer } from '../data/draft-shop.mjs';
import { PLAYER_TIERS, PLAYSTYLE_TAGS } from '../engine/constants.mjs';

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

test('스카우터 목표 태그: 맨 앞 N장이 그 태그를 달고, 그 태그를 받는 포지션이다', () => {
  for (const tag of ['counter', 'press']) {
    for (let i = 0; i < 50; i++) {
      const offer = generateShopOffer(4, [], Math.random, 'tier3', tag, 2);
      assert.equal(offer.length, 4);
      for (const c of offer.slice(0, 2)) {
        assert.ok(c.playstyleTags.includes(tag));
        assert.ok(PLAYSTYLE_TAGS[tag].positions.includes(c.position));
      }
    }
  }
});

test('목표 태그는 처음 3종이어도 맨 앞 카드에 보장된다', () => {
  const offer = generateShopOffer(3, [], Math.random, 'tier5', 'pass', 3);
  assert.equal(offer.length, 3);
  assert.ok(offer.every((c) => c.playstyleTags.includes('pass')));
});

test('스카우터 목표 포지션: 태그 보장 카드 다음 한 장이 그 포지션 선수다', () => {
  for (let i = 0; i < 50; i++) {
    const offer = generateShopOffer(4, [], Math.random, 'tier3', 'press', 1, 'GK');
    assert.ok(offer[0].playstyleTags.includes('press'));
    assert.equal(offer[1].position, 'GK');
  }
  // 태그 없이 포지션만: 첫 장이 그 포지션
  assert.equal(generateShopOffer(3, [], Math.random, 'tier4', null, 0, 'ST')[0].position, 'ST');
});

test('스카우터 상위 등급 확률: 값이 클수록 톱클래스 이상 카드가 더 자주 나온다', () => {
  const topShare = (boost) => {
    let top = 0; let n = 0;
    for (let i = 0; i < 4000; i++) for (const c of generateShopOffer(3, [], Math.random, 'tier4', null, 0, null, boost)) { n++; if (c.baseOVR >= 73) top++; }
    return top / n;
  };
  const base = topShare(0);
  assert.ok(topShare(0.9) > base * 1.4, '마스터 스카우터는 상위 카드가 눈에 띄게 많아야 한다');
});

test('마스터 스카우터: 태그와 포지션을 동시에 만족하는 카드 1장이 맨 앞에 나온다', () => {
  for (let i = 0; i < 50; i++) {
    const offer = generateShopOffer(4, [], Math.random, 'tier3', 'press', 1, 'AMF', 0, true);
    assert.ok(offer[0].playstyleTags.includes('press'));
    assert.equal(offer[0].position, 'AMF');
    assert.equal(offer.length, 4);
  }
});
