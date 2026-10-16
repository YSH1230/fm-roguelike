import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { ATTRIBUTES } from '../engine/constants.mjs';
import { createPlayer, overall, starsOf } from '../engine/player.mjs';

test('포지션에 맞는 속성 4개를 가진다', () => {
  const p = createPlayer({ rng: createRng(1), id: 'p1', position: 'FW' });
  assert.deepEqual(Object.keys(p.attrs), ATTRIBUTES.FW);
});

test('속성은 1~99 범위다', () => {
  const rng = createRng(2);
  for (let i = 0; i < 200; i += 1) {
    const p = createPlayer({ rng, id: `p${i}`, position: 'MF', level: 95 });
    for (const v of Object.values(p.attrs)) assert.ok(v >= 1 && v <= 99);
  }
});

test('level이 높을수록 평균 능력이 높다', () => {
  const rng = createRng(3);
  const avg = (level) => {
    let sum = 0;
    for (let i = 0; i < 300; i += 1) sum += overall(createPlayer({ rng, id: 'x', position: 'DF', level }));
    return sum / 300;
  };
  assert.ok(avg(75) > avg(50) + 15);
});

test('잠재력은 현재 능력 이상이고 33세 이상은 성장 여지가 없다', () => {
  const rng = createRng(4);
  for (let i = 0; i < 100; i += 1) {
    const young = createPlayer({ rng, id: 'y', position: 'GK', age: 19 });
    assert.ok(young.potential >= Math.round(overall(young)) - 1);
  }
  const old = createPlayer({ rng, id: 'o', position: 'GK', age: 34 });
  assert.ok(old.potential - overall(old) < 1);
});

test('어린 선수가 평균적으로 성장 여지가 더 크다', () => {
  const rng = createRng(5);
  const room = (age) => {
    let sum = 0;
    for (let i = 0; i < 300; i += 1) {
      const p = createPlayer({ rng, id: 'x', position: 'FW', age });
      sum += p.potential - overall(p);
    }
    return sum / 300;
  };
  assert.ok(room(19) > room(28) + 3);
});

test('starsOf는 0.5 단위로 0.5~5 사이다', () => {
  assert.equal(starsOf(80), 4);
  assert.equal(starsOf(52), 2.5);
  assert.equal(starsOf(96), 5);
  assert.equal(starsOf(3), 0.5);
  assert.equal(starsOf(120), 5);
});
