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

test('플레이스타일 태그 8종이 스펙 수치와 일치한다', () => {
  assert.equal(Object.keys(PLAYSTYLE_TAGS).length, 8);
  assert.deepEqual(PLAYSTYLE_TAGS.gegenpressing, {
    positions: ['ST', 'CMF'],
    tier3: 4,
    tier5: 7,
  });
  assert.deepEqual(PLAYSTYLE_TAGS.tikiTaka, {
    positions: ['CMF', 'AMF'],
    tier3: 3,
    tier5: 5,
  });
  assert.deepEqual(PLAYSTYLE_TAGS.totalFootball, {
    positions: ['WB', 'CMF'],
    tier3: 3,
    tier5: 6,
  });
});

test('대륙 태그 5종이 모두 3명 +3 / 5명 +5 이다', () => {
  assert.equal(Object.keys(CONTINENT_TAGS).length, 5);
  for (const tag of Object.values(CONTINENT_TAGS)) {
    assert.equal(tag.tier3, 3);
    assert.equal(tag.tier5, 5);
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
