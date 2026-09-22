import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceWeek } from '../engine/season.mjs';

test('거래가 없었던 주는 적응도가 1 오른다', () => {
  assert.equal(advanceWeek(60, false), 61);
});

test('거래가 있었던 주는 적응도가 그대로다(감소는 거래 시점에 이미 반영됨)', () => {
  assert.equal(advanceWeek(60, true), 60);
});
