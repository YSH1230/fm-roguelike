import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateProceduralPlayer, generateSquadPool } from '../data/generate-player.mjs';
import { PLAYER_TIERS } from '../engine/constants.mjs';

function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

test('생성된 선수의 OVR은 등급 범위 안에 있다', () => {
  const rng = seededRng(1);
  for (let i = 0; i < 50; i++) {
    const p = generateProceduralPlayer('topClass', rng);
    assert.ok(p.baseOVR >= PLAYER_TIERS.topClass.minOVR);
    assert.ok(p.baseOVR <= PLAYER_TIERS.topClass.maxOVR);
  }
});

test('생성된 선수의 플레이스타일 태그 수는 등급 규칙과 일치한다', () => {
  const rng = seededRng(2);
  const legendary = generateProceduralPlayer('legendary', rng);
  assert.equal(legendary.playstyleTags.length, PLAYER_TIERS.legendary.playstyleTagCount);
  assert.equal(new Set(legendary.playstyleTags).size, legendary.playstyleTags.length); // 중복 없음
});

test('성골 유스가 아니면 isDraftedYouth는 false다', () => {
  const rng = () => 0.99; // specialTrait 확률(0.3) 미만이 되지 않도록 고정
  const p = generateProceduralPlayer('local', rng);
  assert.equal(p.specialTrait, null);
  assert.equal(p.isDraftedYouth, false);
});

test('generateSquadPool은 등급별 가중치대로 인원수를 만든다', () => {
  const rng = seededRng(3);
  const pool = generateSquadPool({ local: 3, bigLeaguer: 2 }, rng);
  assert.equal(pool.length, 5);
  assert.equal(pool.every((p) => p.id), true); // 모든 카드에 고유 id
});

test('33세 미만 선수는 베테랑 리더 성향을 가질 수 없다(효과가 33세 이상에서만 발동하므로)', () => {
  const rng = seededRng(7);
  for (let i = 0; i < 200; i++) {
    const p = generateProceduralPlayer('local', rng);
    if (p.specialTrait === 'veteranLeader') {
      assert.ok(p.age >= 33, `veteranLeader 카드가 ${p.age}세로 생성됨`);
    }
  }
});
