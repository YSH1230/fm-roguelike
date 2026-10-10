import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFlags, updateFlags, isUnlocked, markSeen } from '../data/flags.mjs';

const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

test('처음엔 튜토리얼이 0단계고, 모든 기능은 처음부터 열려 있다', () => {
  const f = loadFlags(fakeStorage());
  assert.equal(f.tutorialDone, false);
  assert.equal(f.tutorialStep, 0);
  for (const k of ['mid', 'board', 'direction', 'staff', 'traits']) assert.equal(isUnlocked(k, f), true);
});

test('저장이 깨져 있어도 기본값으로 돌아온다', () => {
  const s = fakeStorage();
  s.setItem('fm-roguelike-flags', '{not json');
  assert.equal(loadFlags(s).tutorialStep, 0);
  updateFlags((f) => { f.tutorialDone = true; return f; }, s);
  assert.equal(loadFlags(s).tutorialDone, true);
});

test('처음 마주친 기능 안내는 한 번만 본 것으로 기록된다', () => {
  const s = fakeStorage();
  assert.equal(loadFlags(s).seen.sale, undefined);
  markSeen('sale', s);
  assert.equal(loadFlags(s).seen.sale, true);
});
