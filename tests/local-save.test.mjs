import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveRun, loadRun, clearRun, withRunDefaults } from '../data/local-save.mjs';

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

test('구버전 세이브를 이어하면 이 브랜치가 추가한 필드에 기본값이 채워진다', () => {
  const storage = makeFakeStorage();
  saveRun({ week: 5, funds: 1000, leagueTierId: 'tier3', squad: [] }, storage);
  const state = withRunDefaults(loadRun(storage), '4-3-3');
  assert.equal(state.formation, '4-3-3');
  assert.equal(state.highestTierId, 'tier3');
  assert.equal(state.titles, 0);
  assert.equal(state.missedTargetCount, 0);
  assert.equal(state.seasonNumber, 1);
});

test('계약 시스템 이전 세이브는 선수마다 contractYearsLeft 2가 채워진다', () => {
  const storage = makeFakeStorage();
  saveRun({ week: 5, funds: 1000, leagueTierId: 'tier3', squad: [{ id: 'p1', name: 'A' }] }, storage);
  const state = withRunDefaults(loadRun(storage), '4-3-3');
  assert.equal(state.squad[0].contractYearsLeft, 2);
});

test('이미 contractYearsLeft가 있으면 덮어쓰지 않는다', () => {
  const storage = makeFakeStorage();
  saveRun({ week: 5, funds: 1000, leagueTierId: 'tier3', squad: [{ id: 'p1', name: 'A', contractYearsLeft: 0 }] }, storage);
  const state = withRunDefaults(loadRun(storage), '4-3-3');
  assert.equal(state.squad[0].contractYearsLeft, 0);
});
