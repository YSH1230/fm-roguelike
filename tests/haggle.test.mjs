import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attitudeScore, attitudeLabel, patienceFor, clubBaseAttitude, cardUniform, toleranceFor, offerAccepted, moodAfter, TOLERANCE_BY_SCORE,
  buyBid, sellBid, reservePrice, maxSalePrice, deadlinePressure, patienceCost,
} from '../engine/haggle.mjs';

test('태도 점수와 라벨', () => {
  assert.equal(attitudeLabel(1), '유연');
  assert.equal(attitudeLabel(0), '보통');
  assert.equal(attitudeLabel(-1), '완강');
  assert.equal(attitudeScore(1, 1), 2);
  assert.equal(attitudeScore(-1, -1), -2);
  assert.equal(attitudeScore(2, 1), 2); // 상한
});

test('구단 성격은 같은 런에서 항상 같고 -1·0·1 중 하나다', () => {
  for (const n of ['A FC', 'B Town', 'C United']) {
    const v = clubBaseAttitude(n, 'run1');
    assert.equal(v, clubBaseAttitude(n, 'run1'));
    assert.ok([-1, 0, 1].includes(v));
  }
});

test('카드별 값은 고정이고 0~1 사이다', () => {
  const u = cardUniform('p0001', 'r');
  assert.equal(u, cardUniform('p0001', 'r'));
  assert.ok(u >= 0 && u < 1);
});

test('태도가 유연할수록 받아 주는 폭이 크다', () => {
  assert.ok(toleranceFor(1, 0.5) > toleranceFor(0, 0.5));
  assert.ok(toleranceFor(0, 0.5) > toleranceFor(-1, 0.5));
  for (const [, [lo, hi]] of Object.entries(TOLERANCE_BY_SCORE)) assert.ok(lo <= hi);
});

test('깎아 달라는 비율이 구단이 받아 줄 폭 이내면 수락, 넘으면 거절', () => {
  // 요구액 = 시세일 때 폭 = toleranceFor(0, 0.5) = 0.09
  const base = { ask: 100, trueValue: 100, score: 0, u: 0.5 };
  assert.equal(offerAccepted({ ...base, discount: 0.05 }), true);
  assert.equal(offerAccepted({ ...base, discount: 0.1 }), false);
  // 요구액이 시세보다 15% 부풀려 있으면 더 깎을 수 있다
  assert.equal(offerAccepted({ ask: 115, trueValue: 100, discount: 0.2, score: 0, u: 0.5 }), true);
  // 이미 시세보다 싸게 나온 매물은 못 깎는다
  assert.equal(offerAccepted({ ask: 90, trueValue: 100, discount: 0.1, score: 0, u: 0.5 }), false);
});

test('기분: 협상 결렬은 -1, 요구액으로 산 거래는 +1, 범위는 -1~+1', () => {
  assert.equal(moodAfter(0, 'broken'), -1);
  assert.equal(moodAfter(-1, 'broken'), -1);
  assert.equal(moodAfter(0, 'asking'), 1);
  assert.equal(moodAfter(1, 'asking'), 1);
});

test('인내심은 태도와 같이 간다: 유연 3 / 보통 2 / 완강 1', () => {
  assert.equal(patienceFor(2), 3);
  assert.equal(patienceFor(1), 3);
  assert.equal(patienceFor(0), 2);
  assert.equal(patienceFor(-1), 1);
  assert.equal(patienceFor(-2), 1);
});

test('영입 협상: 하한선 이상이면 수락, 조금 모자라면 역제안, 더 모자라면 조금 더/말도 안 돼요', () => {
  const reserve = reservePrice({ trueValue: 100, score: 0, u: 0.5 }); // 91
  assert.equal(reserve, 91);
  assert.equal(buyBid({ bid: 91, ask: 100, reserve }).result, 'accept');
  const c = buyBid({ bid: 89, ask: 100, reserve });
  assert.equal(c.result, 'counter');
  assert.ok(c.counter >= reserve && c.counter <= 100);
  assert.equal(buyBid({ bid: 83, ask: 100, reserve }).result, 'mid');
  assert.equal(buyBid({ bid: 60, ask: 100, reserve }).result, 'far');
});

test('마감이 가까울수록 구단이 급해져 하한선이 내려간다', () => {
  const base = { trueValue: 100, score: 0, u: 0.5 };
  assert.ok(reservePrice({ ...base, pressure: deadlinePressure(0) }) < reservePrice({ ...base, pressure: deadlinePressure(1) }));
  assert.ok(reservePrice({ ...base, pressure: deadlinePressure(1) }) < reservePrice({ ...base }));
  assert.equal(deadlinePressure(5), 0);
});

test('판매 협상: 상한선 이하면 수락, 조금 넘으면 역제안(오퍼 이상), 많이 넘으면 거절', () => {
  const max = maxSalePrice({ offer: 100, score: 0, u: 0.5 }); // 100 × (1 + 0.09×0.5) = 105
  assert.equal(max, 105);
  assert.equal(sellBid({ bid: 105, offer: 100, max }).result, 'accept');
  const c = sellBid({ bid: 108, offer: 100, max });
  assert.equal(c.result, 'counter');
  assert.ok(c.counter >= 100 && c.counter <= max);
  assert.equal(sellBid({ bid: 115, offer: 100, max }).result, 'mid');
  assert.equal(sellBid({ bid: 140, offer: 100, max }).result, 'far');
});

test('인내심 비용: 말도 안 되는 가격은 2, 그 밖은 1, 수락은 0', () => {
  assert.equal(patienceCost('far'), 2);
  assert.equal(patienceCost('mid'), 1);
  assert.equal(patienceCost('counter'), 1);
  assert.equal(patienceCost('accept'), 0);
});
