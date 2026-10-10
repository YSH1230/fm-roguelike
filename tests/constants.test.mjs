import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYSTYLE_TAGS,
  CONTINENT_TAGS,
  MANAGER_TIER_MULTIPLIER,
  CHEMISTRY_START,
  CHEMISTRY_DECAY_PER_TRANSACTION,
  CHEMISTRY_RECOVERY_PER_STABLE_WEEK,
  TEAM_MULTIPLIER_CAP,
  LEAGUE_POINTS_COEFFICIENT,
  BASE_POINTS_AT_LEAGUE_AVERAGE,
} from '../engine/constants.mjs';

test('플레이스타일 태그 6종: 한 층, 모두 같은 문턱(3/4/5명)과 값(+2/+4/+7)', () => {
  assert.deepEqual(Object.keys(PLAYSTYLE_TAGS).sort(), ['buildup', 'counter', 'dribble', 'pass', 'physical', 'press']);
  for (const tag of Object.values(PLAYSTYLE_TAGS)) {
    assert.deepEqual(tag.thresholds, [3, 4, 5]);
    assert.deepEqual(tag.values, [2, 4, 7]);
  }
});

test('모든 포지션은 가질 수 있는 태그가 3개 이상이다(선수 생성이 막히지 않게)', () => {
  for (const pos of ['GK', 'CB', 'WB', 'DMF', 'CMF', 'AMF', 'W', 'ST']) {
    const n = Object.values(PLAYSTYLE_TAGS).filter((d) => d.positions.includes(pos)).length;
    assert.ok(n >= 3, `${pos} 가능한 태그 ${n}개`);
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
  assert.equal(MANAGER_TIER_MULTIPLIER.tactician, 1.07);
  assert.equal(MANAGER_TIER_MULTIPLIER.legendary, 1.16);
  assert.equal(MANAGER_TIER_MULTIPLIER.god, 1.26);
});

test('적응도 기본 상수가 스펙과 일치한다', () => {
  assert.equal(CHEMISTRY_START, 60);
  assert.equal(CHEMISTRY_DECAY_PER_TRANSACTION, 2);
  assert.equal(CHEMISTRY_RECOVERY_PER_STABLE_WEEK, 1);
});

test('튜닝 대상 상수가 노출되어 있다', () => {
  assert.equal(typeof TEAM_MULTIPLIER_CAP, 'number');
  assert.equal(typeof LEAGUE_POINTS_COEFFICIENT, 'number');
  assert.equal(typeof BASE_POINTS_AT_LEAGUE_AVERAGE, 'number');
});

test('포메이션 8종: 각 11칸이고 쓰는 포지션은 모두 POSITIONS 안에 있다', async () => {
  const { FORMATIONS } = await import('../ui/formations.mjs');
  const { POSITIONS } = await import('../engine/constants.mjs');
  assert.equal(Object.keys(FORMATIONS).length, 8);
  for (const [id, f] of Object.entries(FORMATIONS)) {
    assert.equal(f.slots.length, 11, id);
    assert.equal(f.coords.length, 11, id);
    assert.ok(f.slots.every((p) => POSITIONS.includes(p)), id);
  }
});

