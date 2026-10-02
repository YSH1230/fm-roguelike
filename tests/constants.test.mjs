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

// 11-A 밸런스 패치로 스펙 초안 수치보다 상향됨(engine/constants.mjs 주석 참고) -
// 이 테스트는 "8종/5종이 있고 각 태그 요구 인원(3/5명)은 그대로"라는 구조를
// 고정하는 용도지, 보너스 절댓값을 스펙에 못박는 용도가 아니다.
test('플레이스타일 태그 11종의 구조(포지션·등급별 보너스)가 유지된다', () => {
  assert.equal(Object.keys(PLAYSTYLE_TAGS).length, 11);
  assert.ok(PLAYSTYLE_TAGS.gegenpressing.positions.includes('DMF'));
  assert.ok(PLAYSTYLE_TAGS.tikiTaka.positions.includes('AMF'));
  assert.deepEqual(PLAYSTYLE_TAGS.totalFootball.positions, ['WB', 'CMF', 'DMF']);
  for (const tag of Object.values(PLAYSTYLE_TAGS)) {
    assert.equal(tag.values.length, 3);
    assert.ok(tag.values[1] > tag.values[0] && tag.values[2] > tag.values[1], '문턱이 높을수록 보너스가 커야 한다');
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

test('모든 보통·어려움 태그는 어떤 포메이션에서든 최소 3슬롯, 한 포메이션 이상에서 5슬롯 이상이 된다', async () => {
  const { FORMATIONS } = await import('../ui/formations.mjs');
  for (const [tag, def] of Object.entries(PLAYSTYLE_TAGS)) {
    if (def.grade === 'basic') continue;
    const counts = Object.values(FORMATIONS).map((f) => f.slots.filter((p) => def.positions.includes(p)).length);
    assert.ok(Math.min(...counts) >= 3, tag + ' 최소 슬롯');
    assert.ok(Math.max(...counts) >= 5, tag + ' 최대 슬롯');
  }
});
