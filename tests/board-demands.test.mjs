import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMAND_CARDS, drawDemandOffer, evaluateDemand } from '../data/board-demands.mjs';

const p = (age, young = false) => ({ age: young ? 20 : age });
const base = (over = {}) => ({
  lineup: Array.from({ length: 11 }, () => p(25)),
  chemistry: 60, track: { spent: 0, winterTransactions: 0 }, firstHalfPoints: 30, grant: 1000, goal: 56, ...over,
});
const fail = {
  young1: {}, chem50: { chemistry: 49 }, age28: { lineup: Array.from({ length: 11 }, () => p(29)) },
  young3: { lineup: Array.from({ length: 11 }, (_, i) => p(25, i < 2)) },
  age26: { lineup: Array.from({ length: 11 }, () => p(27)) },
  winter2: { track: { spent: 0, winterTransactions: 3 } },
  spend60: { track: { spent: 601, winterTransactions: 0 } },
  age24: {}, pace: { firstHalfPoints: 27 }, spend40: { track: { spent: 401, winterTransactions: 0 } },
  uclQualify: { uclQualified: false }, uclQF: { uclResult: 'r16' }, uclChamp: { uclResult: 'final' },
};
const pass = {
  young1: { lineup: [p(25, true), ...Array.from({ length: 10 }, () => p(25))] },
  chem50: { chemistry: 50 }, age28: { lineup: Array.from({ length: 11 }, () => p(28)) },
  young3: { lineup: Array.from({ length: 11 }, (_, i) => p(25, i < 3)) },
  age26: { lineup: Array.from({ length: 11 }, () => p(26)) },
  winter2: { track: { spent: 0, winterTransactions: 2 } },
  spend60: { track: { spent: 600, winterTransactions: 0 } },
  age24: { lineup: Array.from({ length: 11 }, () => p(24)) },
  pace: { firstHalfPoints: 28 }, spend40: { track: { spent: 400, winterTransactions: 0 } },
  uclQualify: { uclQualified: true }, uclQF: { uclResult: 'qf' }, uclChamp: { uclResult: 'champion' },
};

test('카드 13장 각각 통과/실패 상태를 구분한다', () => {
  assert.equal(DEMAND_CARDS.length, 13);
  for (const c of DEMAND_CARDS) {
    assert.equal(evaluateDemand(c.id, base(pass[c.id])), true, `${c.id} 통과`);
    assert.equal(evaluateDemand(c.id, base(fail[c.id])), false, `${c.id} 실패`);
  }
});

test('drawDemandOffer는 쉬움/보통/어려움 각 1장을 준다', () => {
  const offer = drawDemandOffer(() => 0);
  assert.deepEqual(offer.map((c) => c.difficulty), ['easy', 'normal', 'hard']);
});

test('bias 태그로 카드 추첨이 편향된다', () => {
  const offer = drawDemandOffer(() => 0.99, { youth: 1000 });
  assert.equal(offer[0].id, 'young1'); // easy 풀에서 youth 태그가 압도적 가중
  assert.equal(offer[1].id, 'young3');
});

test('1부 오퍼에는 챔피언스리그 진출 카드가 항상 들어가고, 다른 리그엔 챔스 카드가 안 나온다', () => {
  for (let i = 0; i < 100; i++) {
    const t1 = drawDemandOffer(Math.random, {}, 'tier1');
    assert.equal(t1[1].id, 'uclQualify');
    const t5 = drawDemandOffer(Math.random, {}, 'tier5');
    assert.ok(t5.every((c) => !c.tier));
  }
});

test('챔스 카드 판정: 진출 여부는 즉시, 8강/우승은 챔스 결과로(deferred)', () => {
  assert.equal(evaluateDemand('uclQualify', { uclQualified: true }), true);
  assert.equal(evaluateDemand('uclQualify', { uclQualified: false }), false);
  assert.equal(evaluateDemand('uclQF', { uclResult: 'qf' }), true);
  assert.equal(evaluateDemand('uclQF', { uclResult: 'r16' }), false);
  assert.equal(evaluateDemand('uclChamp', { uclResult: 'champion' }), true);
  assert.equal(evaluateDemand('uclChamp', { uclResult: 'final' }), false);
});
