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

test('적응도 40 미만이면 배율 0.95', () => {
  assert.equal(chemistryMultiplier(0), 0.95);
  assert.equal(chemistryMultiplier(39), 0.95);
});

test('적응도 40~95는 1.00~1.04 선형 보간', () => {
  assert.equal(chemistryMultiplier(40), 1.00);
  assert.ok(Math.abs(chemistryMultiplier(95) - (1.00 + (55 / 56) * 0.04)) < 0.001);
  const mid = chemistryMultiplier(67.5); // 40과 95의 중간
  assert.ok(Math.abs(mid - 1.02) < 0.001);
});

test('적응도 96 이상은 배율 1.12', () => {
  assert.equal(chemistryMultiplier(96), 1.12);
  assert.equal(chemistryMultiplier(100), 1.12);
});

test('거래 발생 시 적응도가 거래당 지정된 값만큼 하락하고 0 밑으로 안 내려간다', () => {
  assert.equal(applyTransactionDecay(60, 1, 2), 58);
  assert.equal(applyTransactionDecay(60, 5, 2), 50);
  assert.equal(applyTransactionDecay(1, 1, 2), 0);
});

test('변동 없는 주는 적응도 +1, 100을 넘지 않는다', () => {
  assert.equal(applyStableWeekRecovery(60), 61);
  assert.equal(applyStableWeekRecovery(100), 100);
});

test('적응도 하락은 세 번째 인자를 생략하면 CHEMISTRY_DECAY_PER_TRANSACTION 기본값을 쓴다', () => {
  assert.equal(applyTransactionDecay(60, 1), 58);
});
