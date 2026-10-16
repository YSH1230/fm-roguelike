import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, randInt, gauss, poisson, weightedPick } from '../engine/rng.mjs';

test('같은 시드는 같은 수열을 만든다', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 5; i += 1) assert.equal(a(), b());
});

test('값은 0 이상 1 미만이다', () => {
  const rng = createRng(7);
  for (let i = 0; i < 1000; i += 1) {
    const v = rng();
    assert.ok(v >= 0 && v < 1);
  }
});

test('randInt는 양 끝을 포함한다', () => {
  const rng = createRng(3);
  const seen = new Set();
  for (let i = 0; i < 500; i += 1) seen.add(randInt(rng, 1, 3));
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
});

test('gauss 평균은 0 근처다', () => {
  const rng = createRng(11);
  let sum = 0;
  for (let i = 0; i < 5000; i += 1) sum += gauss(rng);
  assert.ok(Math.abs(sum / 5000) < 0.1);
});

test('poisson 평균은 lambda 근처다', () => {
  const rng = createRng(5);
  let sum = 0;
  for (let i = 0; i < 5000; i += 1) sum += poisson(rng, 1.3);
  assert.ok(Math.abs(sum / 5000 - 1.3) < 0.1);
});

test('weightedPick은 가중치 0인 항목을 뽑지 않는다', () => {
  const rng = createRng(9);
  for (let i = 0; i < 200; i += 1) {
    const item = weightedPick(rng, ['a', 'b'], (x) => (x === 'a' ? 0 : 1));
    assert.equal(item, 'b');
  }
});
