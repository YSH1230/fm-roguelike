import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMAND_CARDS, drawDemandOffer, evaluateDemand } from '../data/board-demands.mjs';

const p = (age, isDraftedYouth = false) => ({ age, isDraftedYouth });
const base = (over = {}) => ({
  lineup: Array.from({ length: 11 }, () => p(25)),
  chemistry: 60, track: { spent: 0, winterTransactions: 0 }, firstHalfPoints: 30, grant: 1000, goal: 56, ...over,
});
const fail = {
  youth1: {}, chem50: { chemistry: 49 }, age28: { lineup: Array.from({ length: 11 }, () => p(29)) },
  youth3: { lineup: Array.from({ length: 11 }, (_, i) => p(25, i < 2)) },
  age26: { lineup: Array.from({ length: 11 }, () => p(27)) },
  winter2: { track: { spent: 0, winterTransactions: 3 } },
  spend60: { track: { spent: 601, winterTransactions: 0 } },
  age24: {}, pace: { firstHalfPoints: 27 }, spend40: { track: { spent: 401, winterTransactions: 0 } },
};
const pass = {
  youth1: { lineup: [p(25, true), ...Array.from({ length: 10 }, () => p(25))] },
  chem50: { chemistry: 50 }, age28: { lineup: Array.from({ length: 11 }, () => p(28)) },
  youth3: { lineup: Array.from({ length: 11 }, (_, i) => p(25, i < 3)) },
  age26: { lineup: Array.from({ length: 11 }, () => p(26)) },
  winter2: { track: { spent: 0, winterTransactions: 2 } },
  spend60: { track: { spent: 600, winterTransactions: 0 } },
  age24: { lineup: Array.from({ length: 11 }, () => p(24)) },
  pace: { firstHalfPoints: 28 }, spend40: { track: { spent: 400, winterTransactions: 0 } },
};

test('카드 10장 각각 통과/실패 상태를 구분한다', () => {
  assert.equal(DEMAND_CARDS.length, 10);
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
  assert.equal(offer[0].id, 'youth1'); // easy 풀에서 youth 태그가 압도적 가중
  assert.equal(offer[1].id, 'youth3');
});
