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

test('스카우터 목표 태그: 목표 칸마다 그 태그를 달고, 그 태그를 받는 포지션이다', () => {
  for (const tag of ['counter', 'press']) {
    for (let i = 0; i < 50; i++) {
      const offer = generateShopOffer(4, [], Math.random, 'tier3', [{ tag }, { tag }]);
      assert.equal(offer.length, 4);
      for (const c of offer.slice(0, 2)) {
        assert.ok(c.playstyleTags.includes(tag));
        assert.ok(PLAYSTYLE_TAGS[tag].positions.includes(c.position));
      }
    }
  }
});

test('목표 태그는 처음 3종이어도 보장된다', () => {
  const offer = generateShopOffer(3, [], Math.random, 'tier5', [{ tag: 'pass' }, { tag: 'pass' }, { tag: 'pass' }]);
  assert.equal(offer.length, 3);
  assert.ok(offer.every((c) => c.playstyleTags.includes('pass')));
});

test('스카우터 목표 칸: 태그 칸, 포지션 칸을 섞어 여러 개 둘 수 있다', () => {
  for (let i = 0; i < 50; i++) {
    const offer = generateShopOffer(4, [], Math.random, 'tier3', [{ tag: 'press' }, { position: 'GK' }, { tag: 'counter', position: 'AMF' }]);
    assert.ok(offer[0].playstyleTags.includes('press'));
    assert.equal(offer[1].position, 'GK');
    assert.ok(offer[2].playstyleTags.includes('counter'));
    assert.equal(offer[2].position, 'AMF');
    assert.equal(offer.length, 4);
  }
  assert.equal(generateShopOffer(3, [], Math.random, 'tier4', [{ position: 'ST' }])[0].position, 'ST');
});

test('스카우터 상위 등급 확률: 값이 클수록 톱클래스 이상 카드가 더 자주 나온다', () => {
  const topShare = (boost) => {
    let top = 0; let n = 0;
    for (let i = 0; i < 4000; i++) for (const c of generateShopOffer(3, [], Math.random, 'tier4', [], boost)) { n++; if (c.baseOVR >= 73) top++; }
    return top / n;
  };
  const base = topShare(0);
  assert.ok(topShare(0.9) > base * 1.4, '마스터 스카우터는 상위 카드가 눈에 띄게 많아야 한다');
});

import { generateScoutDelivery, SCOUT_AGE_BANDS } from '../data/draft-shop.mjs';
test('스카우트 지시: 3명 모두 포지션·태그·나이대 조건을 만족한다', () => {
  for (let i = 0; i < 60; i++) {
    const cards = generateScoutDelivery({ pos: 'CMF', tag: 'pass', age: 'young' }, 3, [], Math.random, 'tier3');
    assert.equal(cards.length, 3);
    for (const c of cards) {
      assert.equal(c.position, 'CMF');
      assert.ok(c.playstyleTags.includes('pass'));
      assert.ok(c.age >= SCOUT_AGE_BANDS.young[0] && c.age <= SCOUT_AGE_BANDS.young[1]);
    }
  }
});
test('스카우트 지시가 비어 있으면 아무 3명이 오고, 세 명의 수준이 벌어지는 편이다', () => {
  let spreads = 0;
  for (let i = 0; i < 200; i++) {
    const o = generateScoutDelivery({}, 3, [], Math.random, 'tier3').map((c) => c.baseOVR);
    spreads += Math.max(...o) - Math.min(...o);
  }
  assert.ok(spreads / 200 >= 5);
});
