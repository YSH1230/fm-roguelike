import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateProceduralManager } from '../data/generate-manager.mjs';
import { MANAGER_TIER_MULTIPLIER } from '../engine/constants.mjs';

function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

test('생성된 감독의 배율은 등급과 일치한다', () => {
  const rng = seededRng(1);
  const m = generateProceduralManager('tactician', rng);
  assert.equal(m.multiplier, MANAGER_TIER_MULTIPLIER.tactician);
});

test('레전더리 감독은 헤어드라이어를 가질 수 없다', () => {
  const rng = seededRng(2);
  for (let i = 0; i < 100; i++) {
    const m = generateProceduralManager('legendary', rng);
    assert.notEqual(m.trait, 'hairdryer');
  }
});

test('god 등급은 생성 불가(수작업 카드만 존재)', () => {
  assert.throws(() => generateProceduralManager('god'));
});

test('선호 전술 태그 등급: 루키는 기본기만, 택티션은 기본기·보통, 레전더리는 보통·어려움', async () => {
  const { PLAYSTYLE_TAGS } = await import('../engine/constants.mjs');
  const grades = (tier) => new Set(Array.from({ length: 300 }, () => PLAYSTYLE_TAGS[generateProceduralManager(tier).tacticalTag].grade));
  assert.deepEqual([...grades('rookie')], ['basic']);
  assert.deepEqual([...grades('tactician')].sort(), ['basic', 'mid']);
  assert.deepEqual([...grades('legendary')].sort(), ['hard', 'mid']);
});
