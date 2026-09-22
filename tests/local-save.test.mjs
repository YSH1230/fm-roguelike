import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveRun, loadRun, clearRun } from '../data/local-save.mjs';

function makeFakeStorage() {
  const map = new Map();
  return {
    setItem: (k, v) => map.set(k, v),
    getItem: (k) => map.get(k) ?? null,
    removeItem: (k) => map.delete(k),
  };
}

test('저장한 상태를 그대로 불러온다', () => {
  const storage = makeFakeStorage();
  const state = { week: 5, funds: 1000, squad: [{ id: 'p1', name: 'A' }] };
  saveRun(state, storage);
  assert.deepEqual(loadRun(storage), state);
});

test('저장한 적 없으면 null을 반환한다', () => {
  const storage = makeFakeStorage();
  assert.equal(loadRun(storage), null);
});

test('clearRun 이후에는 다시 null을 반환한다', () => {
  const storage = makeFakeStorage();
  saveRun({ week: 1 }, storage);
  clearRun(storage);
  assert.equal(loadRun(storage), null);
});

test('storage 접근이 예외를 던져도 조용히 무시한다', () => {
  const throwingStorage = {
    setItem: () => { throw new Error('blocked'); },
    getItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  assert.doesNotThrow(() => saveRun({ week: 1 }, throwingStorage));
  assert.equal(loadRun(throwingStorage), null);
  assert.doesNotThrow(() => clearRun(throwingStorage));
});
