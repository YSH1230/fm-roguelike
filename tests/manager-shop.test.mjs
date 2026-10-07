import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateManagerOffer } from '../data/manager-shop.mjs';

test('요청한 개수만큼 감독 후보를 만든다', () => {
  const offer = generateManagerOffer(3);
  assert.equal(offer.length, 3);
  for (const m of offer) {
    assert.ok(['rookie', 'tactician', 'legendary', 'god'].includes(m.tier));
    assert.ok(m.name);
    assert.ok(m.price > 0);
  }
});

test('rng를 고정하면 결과가 결정론적이다', () => {
  const fixedSeq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
  let i = 0;
  const rng = () => fixedSeq[i++ % fixedSeq.length];
  const a = generateManagerOffer(2, rng);
  i = 0;
  const b = generateManagerOffer(2, rng);
  assert.deepEqual(a.map((m) => m.tier), b.map((m) => m.tier));
});

test('GOD 감독은 드물게 끼고, 지금 우리 감독이면 안 나온다', () => {
  const always = () => 0; // 매 슬롯 GOD 확률 통과
  const offer = generateManagerOffer(3, always);
  assert.equal(offer[0].tier, 'god');
  assert.equal(offer[1].tier, 'god');
  assert.notEqual(offer[0].id, offer[1].id);
  assert.ok(offer[0].price > 0);
  const [mine] = offer;
  assert.ok(!generateManagerOffer(3, always, mine.id).some((m) => m.id === mine.id));
});

test('낮은 리그일수록 높은 등급 감독이 안 나온다(5부는 레전더리·GOD 없음)', () => {
  for (let i = 0; i < 400; i++) {
    const offer = generateManagerOffer(3, Math.random, null, 'tier5');
    assert.ok(offer.every((m) => m.tier === 'rookie' || m.tier === 'tactician'));
  }
  const top = Array.from({ length: 400 }, () => generateManagerOffer(3, Math.random, null, 'tier1')).flat();
  assert.ok(top.some((m) => m.tier === 'legendary'));
});
