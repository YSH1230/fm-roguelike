import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimizeLineup } from '../engine/lineup.mjs';
import { computeAverageOVR } from '../engine/team-power.mjs';

const mk = (id, position, baseOVR, extra = {}) => ({
  id, position, baseOVR, age: 25, playstyleTags: [], continentTag: null, specialTrait: null,
  isDraftedYouth: false, seasonsAtClub: 0, acquiredThisSeason: false, ...extra,
});
const SLOTS = ['GK', 'CB', 'CB', 'CMF', 'CMF', 'AMF', 'ST'];

test('포지션을 지키면서 OVR 높은 선수를 넣는다', () => {
  const squad = [mk('gk', 'GK', 60), mk('cb1', 'CB', 70), mk('cb2', 'CB', 65), mk('cb3', 'CB', 50),
    mk('c1', 'CMF', 60), mk('c2', 'CMF', 62), mk('a1', 'AMF', 61), mk('s1', 'ST', 66), mk('s2', 'ST', 55)];
  const { xi } = optimizeLineup(squad, SLOTS, 2);
  assert.deepEqual(xi.map((p) => p.id), ['gk', 'cb1', 'cb2', 'c2', 'c1', 'a1', 's1']);
  xi.forEach((p, i) => assert.equal(p.position, SLOTS[i]));
});

test('케미 문턱을 넘기는 조합이면 OVR이 조금 낮은 선수도 고른다', () => {
  const tiki = ['tikiTaka'];
  const squad = [mk('gk', 'GK', 60), mk('cb1', 'CB', 60), mk('cb2', 'CB', 60),
    mk('c1', 'CMF', 60, { playstyleTags: tiki }), mk('c2', 'CMF', 60, { playstyleTags: tiki }),
    mk('c3', 'CMF', 62), // 태그 없음(OVR만 +2)
    mk('a1', 'AMF', 60, { playstyleTags: tiki }), mk('s1', 'ST', 60)];
  const { xi, bench } = optimizeLineup(squad, SLOTS, 1);
  assert.deepEqual(xi.map((p) => p.id).filter((id) => /^c[0-9]/.test(id)).sort(), ['c1', 'c2']);
  assert.equal(computeAverageOVR(xi, bench) > computeAverageOVR(
    [squad[0], squad[1], squad[2], squad[3], squad[5], squad[6], squad[7]], [squad[4]]), true);
});

test('그 포지션 선수가 없으면 대타 없이 공석으로 둔다', () => {
  const squad = [mk('gk', 'GK', 60), mk('cb1', 'CB', 70), mk('s1', 'ST', 66)];
  const { xi } = optimizeLineup(squad, SLOTS, 0);
  assert.deepEqual(xi.map((p) => p?.id ?? null), ['gk', 'cb1', null, null, null, null, 's1']);
});
