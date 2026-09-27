import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertPowerToPoints, getLeagueTier } from '../engine/league.mjs';

// 계수/기준점은 밸런스 튜닝 상수라 자주 바뀐다 — 공식만 검증하도록 값을 직접 넘긴다.
test('팀 전력이 리그 평균과 같으면 기준 승점을 받는다', () => {
  assert.equal(convertPowerToPoints(60, 60, 2, 42), 42);
});

test('팀 전력이 리그 평균보다 높으면 승점이 계수만큼 오른다', () => {
  assert.equal(convertPowerToPoints(64, 60, 2, 42), 50); // 42 + 4*2
});

test('팀 전력이 리그 평균보다 낮으면 승점이 계수만큼 내려간다', () => {
  assert.equal(convertPowerToPoints(56, 60, 2, 42), 34); // 42 - 4*2
});

test('승점은 0~114(38경기 만점) 범위를 벗어나지 않는다', () => {
  assert.equal(convertPowerToPoints(1000, 60), 114);
  assert.equal(convertPowerToPoints(-1000, 60), 0);
});

test('getLeagueTier는 5부와 4부의 체급 정보를 반환한다', () => {
  const tier5 = getLeagueTier('tier5');
  assert.deepEqual(tier5.averageOVR, [50, 58]);
  assert.equal(tier5.safePoints, 38);
  assert.equal(tier5.targetPoints, 68);
  assert.equal(tier5.championPoints, 80);

  const tier4 = getLeagueTier('tier4');
  assert.deepEqual(tier4.averageOVR, [60, 67]);
  assert.equal(tier4.safePoints, 40);
  assert.equal(tier4.targetPoints, 70);
  assert.equal(tier4.championPoints, 84);
});
