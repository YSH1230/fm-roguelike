import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruneMarks } from '../engine/marks.mjs';
import { saveRun, loadRun } from '../data/local-save.mjs';

test('북마크: 팀에 있는 선수는 유지하고 떠난 선수만 정리한다', () => {
  const squad = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(pruneMarks({ a: 'prospect', b: 'cut', gone: 'cut' }, squad), { a: 'prospect', b: 'cut' });
  assert.equal(pruneMarks(undefined, squad), undefined);
  assert.deepEqual(pruneMarks({}, squad), {});
});

test('북마크는 저장·불러오기 뒤에도 남는다', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  saveRun({ marks: { a: 'prospect' }, squad: [] }, storage);
  assert.deepEqual(loadRun(storage).marks, { a: 'prospect' });
});
