import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePlayerPrice,
  applyCostModifiers,
  computeReleaseProceeds,
  calculateStartingFunds,
  applyCarryoverCap,
} from '../engine/economy.mjs';

test('선수 가격은 등급 내 OVR 위치에 비례한다', () => {
  assert.equal(calculatePlayerPrice('local', 50), 10); // 범위 최저
  assert.equal(calculatePlayerPrice('local', 62), 40); // 범위 최고
});

test('가산 할인/할증은 합산 후 한 번만 적용되고 -60%~+80%로 클램프된다', () => {
  assert.equal(applyCostModifiers(100, [0.2, -0.3]), 90); // -10% 합산
  assert.equal(applyCostModifiers(100, [1.0, 1.0]), 180); // +80% 상한 클램프
  assert.equal(applyCostModifiers(100, [-1.0, -1.0]), 40); // -60% 하한 클램프
});

test('방출 회수: 즉시 0%, 데드라인 40%', () => {
  assert.equal(computeReleaseProceeds(1000, 'immediate'), 0);
  assert.equal(computeReleaseProceeds(1000, 'deadline'), 400);
});

test('방출 회수: 이적명단은 시즌별 범위 안에서 무작위다', () => {
  const proceeds = computeReleaseProceeds(1000, 'listedWinter', () => 0); // 최저값
  assert.equal(proceeds, 700); // 70%
});

test('시즌 지급 자금은 리그가 오를수록 늘고, 하부는 5~6명분·상위는 굵직한 3~4명분이다', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(calculateStartingFunds), [330, 480, 800, 1300, 2000]);
  for (let i = 1; i < 5; i++) assert.ok(calculateStartingFunds(i) > calculateStartingFunds(i - 1));
});

test('이월 자금은 다음 시즌 시작 자금의 10%를 넘지 않는다', () => {
  assert.equal(applyCarryoverCap(1000, 1500), 150);
  assert.equal(applyCarryoverCap(100, 1500), 100); // 10%보다 적으면 그대로
});

test('남은 돈은 이월 상한만큼 남기고 나머지는 2~3개 명분으로 나뉘어 회수된다', async () => {
  const { recallFunds } = await import('../engine/economy.mjs');
  const r = recallFunds(1000, 1500);
  assert.equal(r.carried, 150);
  assert.equal(r.recalled, 850);
  assert.ok(r.items.length >= 2 && r.items.length <= 3);
  assert.equal(r.items.reduce((s, x) => s + x.amount, 0), 850);
  assert.deepEqual(recallFunds(100, 1500), { carried: 100, recalled: 0, items: [] });
  assert.deepEqual(recallFunds(0, 500), { carried: 0, recalled: 0, items: [] });
});
