import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickAutoCaptain, resolveCaptain, sortCapOverflow } from '../engine/captain.mjs';

const p = (id, age, seasonsAtClub, s) => ({ id, age, seasonsAtClub, s });
const stars = (x) => x.s;
const xi = [p('a', 22, 3, 3), p('b', 30, 1, 5), p('c', 34, 1, 5), p('d', 25, 3, 4)];

test('첫 시즌: 별 최고, 동률이면 나이 많은 선수', () => {
  assert.equal(pickAutoCaptain(xi, 1, stars).id, 'c');
});
test('2시즌부터: 오래 뛴 순 → 별 → 나이', () => {
  assert.equal(pickAutoCaptain(xi, 2, stars).id, 'd');
  assert.equal(pickAutoCaptain([p('x', 20, 2, 4), p('y', 30, 2, 4)], 2, stars).id, 'y');
});
test('임명 주장은 벤치·부상이어도 유지되고, 사라지면 자동 규칙 + lost', () => {
  const squad = [...xi, p('bench', 19, 0, 1)];
  assert.deepEqual(resolveCaptain({ squad, lineup: xi, appointedId: 'bench', seasonNumber: 1, stars }), { captain: squad[4], lost: false });
  const r = resolveCaptain({ squad, lineup: xi, appointedId: 'gone', seasonNumber: 1, stars });
  assert.equal(r.captain.id, 'c');
  assert.equal(r.lost, true);
  assert.equal(resolveCaptain({ squad, lineup: xi, appointedId: null, seasonNumber: 1, stars }).lost, false);
});
test('정원 초과 방출 순서: 별 낮은 순, 같으면 나이 많은 순', () => {
  const out = sortCapOverflow([p('1', 22, 0, 3), p('2', 30, 0, 2), p('3', 28, 0, 3)], stars);
  assert.deepEqual(out.map((x) => x.id), ['2', '3', '1']);
});
