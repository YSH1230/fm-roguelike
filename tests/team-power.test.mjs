import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAverageOVR,
  computeTeamMultiplier,
  computeTeamPower,
  applyVariance,
} from '../engine/team-power.mjs';
import { chemistryMultiplier } from '../engine/chemistry.mjs';

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
  // god(1.20) × 적응도 100(1.08) = 1.296 - 곡선을 완만하게 바꾼 뒤엔 캡(1.30) 바로 아래다
  const top = computeTeamMultiplier('god', 100);
  assert.ok(Math.abs(top - 1.296) < 1e-9);
  assert.ok(top <= 1.30);

  // rookie(1.00) × 적응도 60(1.015)
  const plain = computeTeamMultiplier('rookie', 60);
  assert.ok(Math.abs(plain - 1.015) < 1e-9);
});

test('computeTeamPower는 평균 OVR × 팀 배율이다', () => {
  const lineup = Array.from({ length: 11 }, (_, i) =>
    makePlayer({ id: `p${i}`, baseOVR: 70 })
  );
  const power = computeTeamPower(lineup, [], 'rookie', 60);
  assert.ok(Math.abs(power - 70 * 1.015) < 1e-9);
});

test('computeTeamPower correctly multiplies non-uniform average OVR by a non-identity team multiplier', () => {
  // 5 players at OVR 65, 6 players at OVR 75 → average = (5*65 + 6*75) / 11 = (325 + 450) / 11 = 775/11 = 70.4545...
  const lineup = [
    ...Array.from({ length: 5 }, (_, i) => makePlayer({ id: `low${i}`, baseOVR: 65 })),
    ...Array.from({ length: 6 }, (_, i) => makePlayer({ id: `high${i}`, baseOVR: 75 })),
  ];
  const averageOVR = computeAverageOVR(lineup, []);
  assert.ok(Math.abs(averageOVR - 775 / 11) < 0.001);

  // tactician (1.05) × chemistry 95 (interpolated, not identity)
  const multiplier = computeTeamMultiplier('tactician', 95);
  assert.ok(multiplier > 1.05 && multiplier < 1.30); // must reflect BOTH factors, not just one

  const power = computeTeamPower(lineup, [], 'tactician', 95);
  const expectedPower = averageOVR * multiplier;
  assert.ok(Math.abs(power - expectedPower) < 0.001);
});

test('applyVariance는 randomFn 결과에 따라 ±ratio 범위로 조정한다', () => {
  assert.equal(applyVariance(100, 0.05, () => 1), 105); // 최대치
  assert.equal(applyVariance(100, 0.05, () => 0), 95); // 최소치
  assert.equal(applyVariance(100, 0.05, () => 0.5), 100); // 중간값(변화 없음)
});

test('리그가 기대하는 감독 대비 배율: 1부에서 루키는 손해, 레전더리는 이득이다', () => {
  const rookie = computeTeamMultiplier('rookie', 60, { leagueTierId: 'tier1' });
  const legendary = computeTeamMultiplier('legendary', 60, { leagueTierId: 'tier1' });
  assert.ok(Math.abs(rookie - (1.0 / 1.1) * 1.015) < 1e-9);
  assert.ok(legendary > 1.015);
  assert.equal(computeTeamMultiplier('rookie', 60, { leagueTierId: 'tier5' }), computeTeamMultiplier('rookie', 60));
});

test('수석 코치 등급이 팀 전력에 직접 곱해진다', () => {
  const none = computeTeamMultiplier('rookie', 60, { coachLevel: 'academy' });
  const master = computeTeamMultiplier('rookie', 60, { coachLevel: 'master' });
  assert.ok(Math.abs(master / none - 1.04) < 1e-9);
});
