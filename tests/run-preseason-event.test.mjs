import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollPreseasonEvent } from '../data/run-preseason-event.mjs';

function makePlayer(id, baseOVR) {
  return {
    id, name: `P${id}`, baseOVR, age: 25, position: 'CB', playstyleTags: [],
    continentTag: null, specialTrait: null, isDraftedYouth: false, price: 10,
  };
}

test('4개 후보 중 하나를 고정 rng로 재현 가능하게 고른다', () => {
  const squad = [makePlayer('a', 60)];
  // rng()가 항상 0을 반환하면 CANDIDATES[0] = 'mainSponsorship'이 뽑힌다
  const result = rollPreseasonEvent(squad, 1000, () => 0);
  assert.equal(result.id, 'mainSponsorship');
  assert.equal(result.funds, 1200);
});

test('FFP 감사: 자금이 충분하면 납부하고 스쿼드는 그대로다', () => {
  const squad = [makePlayer('a', 60)];
  const rng = () => 0.3; // CANDIDATES 4개 중 index 1 = 'ffpAudit'
  const result = rollPreseasonEvent(squad, 100000, rng);
  assert.equal(result.id, 'ffpAudit');
  assert.equal(result.squad.length, 1);
  assert.ok(result.funds < 100000);
});

test('FFP 감사: 자금이 부족하면 최약체 카드를 무료 방출한다', () => {
  const squad = [makePlayer('weak', 50), makePlayer('strong', 90)];
  const rng = () => 0.3; // 'ffpAudit'
  const result = rollPreseasonEvent(squad, 0, rng);
  assert.equal(result.squad.length, 1);
  assert.equal(result.squad[0].id, 'strong');
  assert.equal(result.funds, 0);
});

test('유스 아카데미 골든 제너레이션: 성골 유스 무료 카드가 스쿼드에 추가된다', () => {
  const squad = [makePlayer('a', 60)];
  const rng = () => 0.6; // index 2 = 'youthGoldenGeneration'
  const result = rollPreseasonEvent(squad, 1000, rng);
  assert.equal(result.squad.length, 2);
  const added = result.squad[1];
  assert.equal(added.price, 0);
  assert.equal(added.specialTrait, 'seongGolYouth');
});

test('이벤트 없음도 나온다', () => {
  const squad = [makePlayer('a', 60)];
  const rng = () => 0.9; // index 3 = null
  const result = rollPreseasonEvent(squad, 1000, rng);
  assert.equal(result.id, null);
  assert.equal(result.funds, 1000);
  assert.equal(result.squad.length, 1);
});
