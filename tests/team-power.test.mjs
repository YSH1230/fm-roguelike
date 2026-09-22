import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAverageOVR,
  computeTeamMultiplier,
  computeTeamPower,
  applyVariance,
} from '../engine/team-power.mjs';

function makePlayer(overrides = {}) {
  return {
    id: 'p',
    baseOVR: 70,
    age: 25,
    position: 'CB',
    playstyleTags: [],
    continentTag: null,
    specialTrait: null,
    isDraftedYouth: false,
    seasonsAtClub: 0,
    acquiredThisSeason: false,
    inBench: false,
    ...overrides,
  };
}

test('computeAverageOVR은 11명의 최종 OVR 평균을 낸다(태그 없는 단순 케이스)', () => {
  const lineup = Array.from({ length: 11 }, (_, i) =>
    makePlayer({ id: `p${i}`, baseOVR: 70 })
  );
  assert.equal(computeAverageOVR(lineup, []), 70);
});

test('computeTeamMultiplier는 감독 배율 × 적응도 배율이고 캡을 넘지 않는다', () => {
  // god(1.20) × 적응도 100(1.12) = 1.344 → 캡 1.30으로 clamp
  const capped = computeTeamMultiplier('god', 100);
  assert.equal(capped, 1.30);

  // rookie(1.00) × 적응도 60(구간 보간 값) → 캡 안 걸림
  const uncapped = computeTeamMultiplier('rookie', 40);
  assert.equal(uncapped, 1.00);
});

test('computeTeamPower는 평균 OVR × 팀 배율이다', () => {
  const lineup = Array.from({ length: 11 }, (_, i) =>
    makePlayer({ id: `p${i}`, baseOVR: 70 })
  );
  const power = computeTeamPower(lineup, [], 'rookie', 40);
  assert.equal(power, 70 * 1.00);
});

test('applyVariance는 randomFn 결과에 따라 ±ratio 범위로 조정한다', () => {
  assert.equal(applyVariance(100, 0.05, () => 1), 105); // 최대치
  assert.equal(applyVariance(100, 0.05, () => 0), 95); // 최소치
  assert.equal(applyVariance(100, 0.05, () => 0.5), 100); // 중간값(변화 없음)
});
