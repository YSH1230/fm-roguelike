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

test('computeTeamMultiplier는 조직력 배율이고 캡을 넘지 않는다', () => {
  const top = computeTeamMultiplier(100);
  assert.ok(Math.abs(top - 1.10) < 1e-9);
  assert.ok(top <= 1.30);

  // 조직력 60 = 1.015
  const plain = computeTeamMultiplier(60);
  assert.ok(Math.abs(plain - 1.015) < 1e-9);
});

test('computeTeamPower는 평균 OVR × 팀 배율이다', () => {
  const lineup = Array.from({ length: 11 }, (_, i) =>
    makePlayer({ id: `p${i}`, baseOVR: 70 })
  );
  const power = computeTeamPower(lineup, [], 60);
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

  // 조직력 95 (곡선 위의 값, 1이 아님)
  const multiplier = computeTeamMultiplier(95);
  assert.ok(multiplier > 1.015 && multiplier < 1.30);

  const power = computeTeamPower(lineup, [], 95);
  const expectedPower = averageOVR * multiplier;
  assert.ok(Math.abs(power - expectedPower) < 0.001);
});

test('applyVariance는 randomFn 결과에 따라 ±ratio 범위로 조정한다', () => {
  assert.equal(applyVariance(100, 0.05, () => 1), 105); // 최대치
  assert.equal(applyVariance(100, 0.05, () => 0), 95); // 최소치
  assert.equal(applyVariance(100, 0.05, () => 0.5), 100); // 중간값(변화 없음)
});

test('철학 효과: 태그 철학·포메이션 궁합·철벽 수비가 선발 OVR에 더해진다', async () => {
  const { computePlayerFinalOVR } = await import('../engine/ovr.mjs');
  const { specialtyEffects } = await import('../engine/specialties.mjs');
  const mk = (id, position, tags = []) => ({ id, name: id, baseOVR: 60, age: 27, position, playstyleTags: tags, specialTrait: null, slotPosition: position });
  const lineup = [mk('gk', 'GK'), mk('cb', 'CB'), mk('dm', 'DMF'), mk('st', 'ST', ['dribble']), mk('w1', 'W', ['dribble']), mk('w2', 'W', ['dribble'])];
  const none = specialtyEffects(null);
  const p = (id) => lineup.find((x) => x.id === id);
  assert.equal(computePlayerFinalOVR(p('cb'), lineup, [], none), 60);
  // 철벽 수비 Lv1: 골키퍼·수비수·수비형 미드필더 +1, 공격수는 그대로
  const cat = specialtyEffects({ id: 'catenaccio', level: 1 });
  assert.deepEqual(['gk', 'cb', 'dm'].map((id) => computePlayerFinalOVR(p(id), lineup, [], cat)), [61, 61, 61]);
  assert.equal(computePlayerFinalOVR(p('st'), lineup, [], cat), computePlayerFinalOVR(p('st'), lineup, [], none));
  // 낭만 공격수 Lv1: 돌파 태그 선수 3명이 +2씩(보유자 3명 = 첫 문턱)
  const rom = specialtyEffects({ id: 'romantic', level: 1 });
  const base = computePlayerFinalOVR(p('w1'), lineup, [], none);
  assert.equal(computePlayerFinalOVR(p('w1'), lineup, [], rom), base + 2);
  assert.equal(computePlayerFinalOVR(p('cb'), lineup, [], rom), 60);
});
