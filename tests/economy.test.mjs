import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePlayerPrice,
  applyCostModifiers,
  renewalCost,
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

test('재계약 비용은 1년 30%, 2년 60%다', () => {
  assert.equal(renewalCost(1000, 1), 300);
  assert.equal(renewalCost(1000, 2), 600);
});

test('방출 회수: 즉시 0%, 데드라인 40%', () => {
  assert.equal(computeReleaseProceeds(1000, 'immediate'), 0);
  assert.equal(computeReleaseProceeds(1000, 'deadline'), 400);
});

test('방출 회수: 이적명단은 시즌별 범위 안에서 무작위다', () => {
  const proceeds = computeReleaseProceeds(1000, 'listedWinter', () => 0); // 최저값
  assert.equal(proceeds, 700); // 70%
});

test('시작 자금은 리그 단계마다 1.5배씩 오른다', () => {
  assert.equal(calculateStartingFunds(0), 1000); // 5부
  assert.equal(calculateStartingFunds(1), 1500); // 4부
});

test('이월 자금은 다음 시즌 시작 자금의 30%를 넘지 않는다', () => {
  assert.equal(applyCarryoverCap(1000, 1500), 450);
  assert.equal(applyCarryoverCap(100, 1500), 100); // 30%보다 적으면 그대로
});
