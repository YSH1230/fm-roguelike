import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankFromPoints, predictRanks, marketReport } from '../engine/preview.mjs';

test('승점이 높을수록 예상 순위가 좋다', () => {
  assert.equal(rankFromPoints(200, 'tier5'), 1);
  assert.equal(rankFromPoints(0, 'tier5'), 20);
  assert.ok(rankFromPoints(60, 'tier5') < rankFromPoints(40, 'tier5'));
});

test('기자 예상: 낙관파는 위, 비관파는 아래로 쏠리고 분석가는 대체로 맞다', () => {
  let a = 0; let o = 0; let p = 0; let close = 0; const n = 4000;
  for (let i = 0; i < n; i++) {
    const r = predictRanks(10);
    a += r.analyst; o += r.optimist; p += r.pessimist;
    if (Math.abs(r.analyst - 10) <= 2) close += 1;
    for (const v of Object.values(r)) assert.ok(v >= 1 && v <= 20);
  }
  assert.ok(o / n < 8 && p / n > 12);
  assert.ok(Math.abs(a / n - 10) < 0.6);
  assert.ok(close / n > 0.8 && close / n < 0.9); // 약 15%는 크게 빗나간다
});

test('이적시장 성적표 등급', () => {
  assert.equal(marketReport([]).grade, '-');
  assert.equal(marketReport([{ name: 'a', delta: 1.5 }]).grade, 'A');
  assert.equal(marketReport([{ name: 'a', delta: -1 }]).grade, 'D');
  assert.equal(marketReport([{ name: 'a', delta: 0 }, { name: 'b', delta: 0.5, bargain: true }]).grade, 'C');
});
