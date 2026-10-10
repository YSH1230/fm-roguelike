import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateProceduralPlayer, generateSquadPool, TIER5_SQUAD_WEIGHTS } from '../data/generate-player.mjs';
import { PLAYER_TIERS, PLAYSTYLE_TAGS } from '../engine/constants.mjs';

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

test('모든 선수는 태그가 1개이고 그 포지션이 가질 수 있는 태그다, 월드클래스 이상만 개인 특기를 가진다', () => {
  const rng = seededRng(2);
  for (const tier of ['local', 'bigLeaguer', 'topClass', 'worldClass', 'legendary']) {
    for (let i = 0; i < 30; i++) {
      const p = generateProceduralPlayer(tier, rng);
      assert.equal(p.playstyleTags.length, 1, tier);
      assert.ok(PLAYSTYLE_TAGS[p.playstyleTags[0]].positions.includes(p.position), '그 포지션이 가질 수 있는 태그만');
      assert.equal(Boolean(p.flair), p.baseOVR >= 81, `${tier} 특기`);
    }
  }
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

test('한 스쿼드 안에서 이름이 겹치지 않는다', () => {
  // 60명 스쿼드를 20번 뽑아서 한 번이라도 동명이인이 나오면 실패.
  // 이름 풀이 좁으면 생일 역설로 거의 매번 겹친다.
  for (let attempt = 0; attempt < 20; attempt++) {
    const names = generateSquadPool(TIER5_SQUAD_WEIGHTS).map((p) => p.name);
    assert.equal(new Set(names).size, names.length, `${attempt}번째 스쿼드에 동명이인이 있다`);
  }
});
