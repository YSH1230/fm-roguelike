import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYSTYLE_TAGS,
  CONTINENT_TAGS,
  MANAGER_TIER_MULTIPLIER,
  CHEMISTRY_START,
  CHEMISTRY_DECAY_PER_TRANSACTION,
  CHEMISTRY_RECOVERY_PER_STABLE_WEEK,
  CHEMISTRY_LOW_THRESHOLD,
  CHEMISTRY_HIGH_THRESHOLD,
  CHEMISTRY_LOW_MULTIPLIER,
  CHEMISTRY_HIGH_MULTIPLIER,
  TEAM_MULTIPLIER_CAP,
  LEAGUE_POINTS_COEFFICIENT,
  BASE_POINTS_AT_LEAGUE_AVERAGE,
} from '../engine/constants.mjs';

// 11-A 밸런스 패치로 스펙 초안 수치보다 상향됨(engine/constants.mjs 주석 참고) -
// 이 테스트는 "8종/5종이 있고 각 태그 요구 인원(3/5명)은 그대로"라는 구조를
// 고정하는 용도지, 보너스 절댓값을 스펙에 못박는 용도가 아니다.
test('플레이스타일 태그 8종의 구조(포지션·요구 인원)가 유지된다', () => {
  assert.equal(Object.keys(PLAYSTYLE_TAGS).length, 8);
  assert.deepEqual(PLAYSTYLE_TAGS.gegenpressing.positions, ['ST', 'CMF']);
  assert.deepEqual(PLAYSTYLE_TAGS.tikiTaka.positions, ['CMF', 'AMF']);
  assert.deepEqual(PLAYSTYLE_TAGS.totalFootball.positions, ['WB', 'CMF']);
  for (const tag of Object.values(PLAYSTYLE_TAGS)) {
    assert.ok(tag.tier5 > tag.tier3, '5명 보너스가 3명 보너스보다 커야 한다');
  }
});

test('대륙 태그 5종은 모두 같은 수치를 쓴다(포지션 무관)', () => {
  assert.equal(Object.keys(CONTINENT_TAGS).length, 5);
  const [first, ...rest] = Object.values(CONTINENT_TAGS);
  for (const tag of rest) {
    assert.deepEqual(tag, first);
  }
});

test('감독 등급 배율이 스펙과 일치한다', () => {
  assert.equal(MANAGER_TIER_MULTIPLIER.rookie, 1.00);
  assert.equal(MANAGER_TIER_MULTIPLIER.tactician, 1.05);
  assert.equal(MANAGER_TIER_MULTIPLIER.legendary, 1.12);
  assert.equal(MANAGER_TIER_MULTIPLIER.god, 1.20);
});

test('적응도 기본 상수가 스펙과 일치한다', () => {
  assert.equal(CHEMISTRY_START, 60);
  assert.equal(CHEMISTRY_DECAY_PER_TRANSACTION, 2);
  assert.equal(CHEMISTRY_RECOVERY_PER_STABLE_WEEK, 1);
  assert.equal(CHEMISTRY_LOW_THRESHOLD, 40);
  assert.equal(CHEMISTRY_HIGH_THRESHOLD, 96);
  assert.equal(CHEMISTRY_LOW_MULTIPLIER, 0.95);
  assert.equal(CHEMISTRY_HIGH_MULTIPLIER, 1.12);
});

test('튜닝 대상 상수가 노출되어 있다', () => {
  assert.equal(typeof TEAM_MULTIPLIER_CAP, 'number');
  assert.equal(typeof LEAGUE_POINTS_COEFFICIENT, 'number');
  assert.equal(typeof BASE_POINTS_AT_LEAGUE_AVERAGE, 'number');
});
