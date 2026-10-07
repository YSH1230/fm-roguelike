import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertPowerToPoints, getLeagueTier, LEAGUE_LADDER, getLadderIndex, getNextTier } from '../engine/league.mjs';

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
  assert.deepEqual(tier5.averageOVR, [48, 56]);
  assert.equal(tier5.safePoints, 38);
  assert.equal(tier5.targetPoints, 68);
  assert.equal(tier5.championPoints, 80);

  const tier4 = getLeagueTier('tier4');
  assert.deepEqual(tier4.averageOVR, [54, 62]);
  assert.equal(tier4.safePoints, 40);
  assert.equal(tier4.targetPoints, 73);
  assert.equal(tier4.championPoints, 86);
});

test('리그 사다리는 5부에서 1부까지 5단계다', () => {
  assert.deepEqual(LEAGUE_LADDER, ['tier5', 'tier4', 'tier3', 'tier2', 'tier1']);
});

test('모든 티어가 필요한 필드를 갖는다', () => {
  for (const tierId of LEAGUE_LADDER) {
    const tier = getLeagueTier(tierId);
    assert.equal(typeof tier.label, 'string');
    assert.equal(tier.averageOVR.length, 2);
    assert.ok(tier.averageOVR[0] < tier.averageOVR[1], `${tierId} averageOVR 범위가 뒤집혔다`);
    assert.ok(tier.safePoints < tier.targetPoints, `${tierId} 안전선이 목표선보다 높다`);
    assert.ok(tier.targetPoints < tier.championPoints, `${tierId} 목표선이 우승선보다 높다`);
  }
});

test('상위 리그일수록 평균 OVR과 기준 승점이 높다', () => {
  for (let i = 1; i < LEAGUE_LADDER.length; i++) {
    const lower = getLeagueTier(LEAGUE_LADDER[i - 1]);
    const upper = getLeagueTier(LEAGUE_LADDER[i]);
    assert.ok(upper.averageOVR[0] > lower.averageOVR[0], `${LEAGUE_LADDER[i]} 평균 OVR이 아래 리그보다 낮다`);
    assert.ok(upper.safePoints >= lower.safePoints, `${LEAGUE_LADDER[i]} 안전선이 아래 리그보다 낮다`);
  }
});

test('getLadderIndex는 5부를 0으로 센다', () => {
  assert.equal(getLadderIndex('tier5'), 0);
  assert.equal(getLadderIndex('tier1'), 4);
});

test('getNextTier는 최상위에서 null을 준다', () => {
  assert.equal(getNextTier('tier5'), 'tier4');
  assert.equal(getNextTier('tier2'), 'tier1');
  assert.equal(getNextTier('tier1'), null);
});

test('모르는 티어는 에러를 낸다', () => {
  assert.throws(() => getLeagueTier('tier9'), /Unknown league tier/);
  assert.throws(() => getLadderIndex('tier9'), /Unknown league tier/);
});
