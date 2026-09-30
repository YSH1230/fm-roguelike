import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFullSeason, judgeSeasonResult, boardGoalPoints, boardReward } from '../engine/season.mjs';

function makePlayer(overrides = {}) {
  return {
    id: 'p', baseOVR: 55, age: 25, position: 'CB', playstyleTags: [],
    continentTag: null, specialTrait: null, isDraftedYouth: false,
    seasonsAtClub: 0, acquiredThisSeason: false, inBench: false,
    ...overrides,
  };
}

test('runFullSeason은 전/후반기 승점 합이 전체 승점과 같다', () => {
  const lineup = Array.from({ length: 11 }, (_, i) => makePlayer({ id: `p${i}` }));
  const result = runFullSeason(lineup, [], 'rookie', 55, 'tier5', () => 0.5); // 변동 없음(중간값)
  assert.ok(Math.abs(result.totalPoints - (result.firstHalf + result.secondHalf)) < 0.001);
});

test('judgeSeasonResult은 승점 구간에 맞는 결과를 낸다', () => {
  assert.equal(judgeSeasonResult(30, 'tier5'), 'relegation'); // 안전 38 미만
  assert.equal(judgeSeasonResult(50, 'tier5'), 'safe'); // 안전~승격 사이
  assert.equal(judgeSeasonResult(70, 'tier5'), 'promotion'); // 승격~우승 사이
  assert.equal(judgeSeasonResult(85, 'tier5'), 'champion'); // 우승 80 이상
});

test('이사진 목표는 안전선~승격선 사이이고, 초과 승점만큼 보상하되 상한이 있다', () => {
  const tier = { safePoints: 38, targetPoints: 68 };
  assert.equal(boardGoalPoints(tier), 56);
  assert.deepEqual(boardReward(56, 56, 1000), { surplus: 0, funds: 0, chemistry: 0 });
  assert.equal(boardReward(50, 56, 1000).funds, 0);
  assert.deepEqual(boardReward(64, 56, 1000), { surplus: 8, funds: 120, chemistry: 5 });
  assert.equal(boardReward(100, 56, 1000).funds, 300); // 상한 30%
});
