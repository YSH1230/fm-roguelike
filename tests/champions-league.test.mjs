import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createUcl, advanceUcl, uclRanking, playMatch,
  UCL_RESULT_LABELS, UCL_REWARDS_FUNDS, UCL_OPPONENTS,
} from '../engine/champions-league.mjs';

const runAll = (power, rng = Math.random) => {
  let s = createUcl(power, rng);
  let steps = 0;
  while (s.stage !== 'done' && steps < 30) { s = advanceUcl(s, rng); steps += 1; }
  return { s, steps };
};

test('8팀 리그는 7라운드, 매 라운드 4경기이고 모든 팀이 서로 한 번씩 붙는다', () => {
  const s = createUcl(90);
  assert.equal(s.fixtures.length, 7);
  const seen = new Set();
  for (const day of s.fixtures) {
    assert.equal(day.length, 4);
    for (const [a, b] of day) seen.add([a, b].sort().join('-'));
  }
  assert.equal(seen.size, 28);
});

test('압도적으로 강하면 리그를 통과해 우승한다', () => {
  const { s } = runAll(1000);
  assert.equal(s.result, 'champion');
  assert.equal(s.stage, 'done');
});

test('압도적으로 약하면 리그 단계에서 탈락한다(7번 진행)', () => {
  const { s, steps } = runAll(1);
  assert.equal(s.result, 'league');
  assert.equal(steps, 7);
});

test('진행할 때마다 내 경기가 한 번씩 로그에 남고, 결과는 항상 유효한 키다', () => {
  for (let i = 0; i < 30; i++) {
    const { s } = runAll(92);
    assert.ok(UCL_RESULT_LABELS[s.result]);
    assert.ok(UCL_REWARDS_FUNDS[s.result] > 0);
  }
  let s = createUcl(92);
  s = advanceUcl(s);
  assert.equal(s.log.filter((m) => m.mine).length, 1);
  assert.equal(s.log.length, 4);
});

test('리그 승점 합은 경기 수와 결과에 맞고, 순위는 승점 내림차순이다', () => {
  let s = createUcl(95);
  for (let i = 0; i < 7; i++) s = advanceUcl(s);
  const rows = Object.values(s.table);
  assert.ok(rows.every((r) => r.w + r.d + r.l === 7));
  const rank = uclRanking(s);
  for (let i = 1; i < rank.length; i++) assert.ok(s.table[rank[i - 1]].p >= s.table[rank[i]].p);
});

test('토너먼트는 무승부 대신 승부차기로 승자가 정해진다', () => {
  for (let i = 0; i < 200; i++) {
    const m = playMatch(90, 90, Math.random, true);
    if (m.ga === m.gb) assert.ok(m.pens === 'a' || m.pens === 'b');
  }
  assert.equal(UCL_OPPONENTS.length, 7);
});
