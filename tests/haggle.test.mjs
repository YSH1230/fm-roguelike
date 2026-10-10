import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attitudeScore, attitudeLabel, patienceFor, clubBaseAttitude, cardUniform, toleranceFor, offerAccepted, moodAfter, TOLERANCE_BY_SCORE,
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
