import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollInjury, injuryChips, sampleInjuryHistory, injuryMult, INJURY_BASE, rollInjuryPart, INJURY_PART_NAME } from '../engine/injury.mjs';

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

test('이력 칩: 심한 것부터 최대 2개, 중간 부상 제외, 접힌 칩엔 부위 없고 펼친 줄엔 부위', () => {
  const p = { injHistory: [{ kind: 'minor', ago: 1 }, { kind: 'minor', ago: 1 }, { kind: 'mid', ago: 1 }, { kind: 'season', ago: 1, part: 'acl' }, { kind: 'half', ago: 0, part: 'ham' }] };
  assert.deepEqual(injuryChips(p).collapsed, ['지난 시즌 시즌 아웃', '이번 시즌 반기 아웃']);
  assert.deepEqual(injuryChips(p).expanded, ['십자인대 파열', '햄스트링 파열']);
  assert.deepEqual(injuryChips({ injHistory: [{ kind: 'minor', ago: 1 }, { kind: 'minor', ago: 0 }, { kind: 'mid', ago: 1 }] }).collapsed, ['잔부상 많음']);
  assert.deepEqual(injuryChips({ injHistory: [{ kind: 'mid', ago: 1 }, { kind: 'season', ago: 2, part: 'acl' }, { kind: 'minor', ago: 1 }] }).collapsed, ['이력 없음']);
  assert.deepEqual(injuryChips({ injHistory: [{ kind: 'season', ago: 1 }] }).expanded, ['지난 시즌 시즌 아웃']); // 옛 세이브: 부위 없음
  assert.ok(Array.isArray(sampleInjuryHistory({ durability: 'fragile', age: 30 })));
});

test('부위 추첨(4만 회): 포지션·내구성·나이 가중이 설계 수치와 맞는다', () => {
  const share = (p, kind, key, n = 40000) => { let c = 0; for (let i = 0; i < n; i++) if (rollInjuryPart(p, kind) === key) c++; return c / n; };
  const cmf = { position: 'CMF', durability: 'normal', age: 26 };
  assert.ok(Math.abs(share(cmf, 'season', 'acl') - 0.27) < 0.03);
  assert.ok(Math.abs(share(cmf, 'half', 'ham') - 0.22) < 0.03);
  const gk = { position: 'GK', durability: 'normal', age: 26 };
  assert.ok(Math.abs(share(gk, 'half', 'shoulderDis') - 0.19) < 0.03);
  assert.ok(Math.abs(share(gk, 'half', 'finger') - 0.17) < 0.03);
  assert.ok(Math.abs(share({ position: 'ST', durability: 'fragile', age: 35 }, 'half', 'ham') - 0.38) < 0.04);
});

test('새 이력 표본: 중간 부상은 없고 시즌·반기 아웃에만 부위가 있다', () => {
  let n = 0; let w = 0;
  for (let i = 0; i < 2000; i++) for (const h of sampleInjuryHistory({ durability: 'fragile', age: 30, position: 'ST' })) {
    n++;
    assert.notEqual(h.kind, 'mid');
    if (h.kind === 'minor') assert.equal(h.part, undefined); else assert.ok(INJURY_PART_NAME[h.part]);
    if (h.kind === 'minor') w++;
  }
  assert.ok(n > 0 && w > 0);
});
