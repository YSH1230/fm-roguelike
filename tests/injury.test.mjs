import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollInjury, injuryChips, sampleInjuryHistory, injuryMult, INJURY_BASE } from '../engine/injury.mjs';

const rate = (p, kinds, n = 20000) => { let c = 0; for (let i = 0; i < n; i++) if (rollInjury(p, Math.random, kinds)) c++; return c / n; };

test('부상 확률은 내구성과 나이에 따라 달라진다', () => {
  const base = rate({ durability: 'normal', age: 25 }, ['minor', 'mid', 'half', 'season']);
  const iron = rate({ durability: 'iron', age: 25 }, ['minor', 'mid', 'half', 'season']);
  const fragile = rate({ durability: 'fragile', age: 25 }, ['minor', 'mid', 'half', 'season']);
  assert.ok(iron < base && base < fragile);
  assert.ok(Math.abs(base - 0.24) < 0.02);
  assert.equal(injuryMult({ durability: 'normal', age: 34 }), 1.3);
});

test('시장 부상은 반기 아웃·시즌 아웃만 굴린다', () => {
  for (let i = 0; i < 2000; i++) assert.ok(['half', 'season', null].includes(rollInjury({ age: 25 }, Math.random, ['half', 'season'])));
  assert.equal(INJURY_BASE.season, 0.01);
});

test('이력 칩: 심한 것부터, 등급이 높을수록 많이, 없으면 이력 없음', () => {
  const p = { injHistory: [{ kind: 'minor', ago: 1 }, { kind: 'minor', ago: 1 }, { kind: 'mid', ago: 1 }, { kind: 'season', ago: 1 }] };
  assert.deepEqual(injuryChips(p, 'academy'), ['지난 시즌 시즌 아웃']);
  assert.equal(injuryChips(p, 'master').length, 3);
  assert.deepEqual(injuryChips({ injHistory: [] }, 'master'), ['부상 이력 없음']);
  assert.ok(Array.isArray(sampleInjuryHistory({ durability: 'fragile', age: 30 })));
});
