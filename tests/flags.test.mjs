import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFlags, updateFlags, isUnlocked, unlockForSeason } from '../data/flags.mjs';

const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

test('처음엔 아무것도 열려 있지 않고 튜토리얼은 0단계다', () => {
  const s = fakeStorage();
  const f = loadFlags(s);
  assert.equal(f.tutorialDone, false);
  assert.equal(f.tutorialStep, 0);
  assert.equal(isUnlocked('mid', f), false);
});

test('시즌에 도달하면 그 시즌까지의 기능이 열리고, 한 번만 새로 열린다', () => {
  const s = fakeStorage();
  assert.deepEqual(unlockForSeason(1, s), []);
  assert.deepEqual(unlockForSeason(2, s).sort(), ['board', 'direction', 'mid']);
  assert.deepEqual(unlockForSeason(2, s), []); // 이미 열림
  assert.deepEqual(unlockForSeason(3, s).sort(), ['hard', 'staff', 'traits']);
  assert.equal(isUnlocked('hard', loadFlags(s)), true);
});

test('저장이 깨져 있어도 기본값으로 돌아온다', () => {
  const s = fakeStorage();
  s.setItem('fm-roguelike-flags', '{not json');
  assert.equal(loadFlags(s).tutorialStep, 0);
  updateFlags((f) => { f.tutorialDone = true; return f; }, s);
  assert.equal(loadFlags(s).tutorialDone, true);
});
