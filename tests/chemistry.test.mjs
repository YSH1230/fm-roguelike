import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chemistryMultiplier,
  applyTransactionDecay,
  applyStableWeekRecovery,
  clamp,
} from '../engine/chemistry.mjs';

test('clamp는 값을 min~max 사이로 제한한다', () => {
  assert.equal(clamp(150, 0, 100), 100);
  assert.equal(clamp(-10, 0, 100), 0);
  assert.equal(clamp(50, 0, 100), 50);
});

test('조직력 배율은 0=0.94, 60=1.015, 100=1.08을 잇는 꺾은선이다', () => {
  assert.equal(chemistryMultiplier(0), 0.92);
  assert.ok(Math.abs(chemistryMultiplier(60) - 1.015) < 1e-9);
  assert.ok(Math.abs(chemistryMultiplier(100) - 1.10) < 1e-9);
  assert.ok(Math.abs(chemistryMultiplier(30) - 0.9675) < 1e-9);
  assert.ok(chemistryMultiplier(99) < chemistryMultiplier(100)); // 절벽 없음
});

test('거래 발생 시 조직력가 거래당 지정된 값만큼 하락하고 0 밑으로 안 내려간다', () => {
  assert.equal(applyTransactionDecay(60, 1, 2), 58);
  assert.equal(applyTransactionDecay(60, 5, 2), 50);
  assert.equal(applyTransactionDecay(1, 1, 2), 0);
});

test('변동 없는 주는 조직력 +1, 100을 넘지 않는다', () => {
  assert.equal(applyStableWeekRecovery(60), 61);
  assert.equal(applyStableWeekRecovery(100), 100);
});

test('조직력 하락은 세 번째 인자를 생략하면 CHEMISTRY_DECAY_PER_TRANSACTION 기본값을 쓴다', () => {
  assert.equal(applyTransactionDecay(60, 1), 58);
});
