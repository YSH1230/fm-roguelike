import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createUcl, advanceUcl, uclRanking, playMatch, generateMatchEvents, tieAggregate,
  UCL_RESULT_LABELS, UCL_REWARDS_FUNDS, UCL_OPPONENTS, UCL_LEAGUE_DAYS,
} from '../engine/champions-league.mjs';

const runAll = (power, rng = Math.random) => {
  let s = createUcl(power, rng);
  let steps = 0;
  while (s.stage !== 'done' && steps < 40) { s = advanceUcl(s, rng); steps += 1; }
  return { s, steps };
};

test('24팀 리그 단계: 6라운드, 라운드마다 12경기, 각 팀은 서로 다른 상대 6팀과 붙는다', () => {
  const s = createUcl(90);
  assert.equal(s.teams.length, 24);
  assert.equal(UCL_OPPONENTS.length, 23);
  assert.equal(s.fixtures.length, UCL_LEAGUE_DAYS);
  const opponents = {};
  for (const day of s.fixtures) {
    assert.equal(day.length, 12);
    for (const [a, b] of day) {
      (opponents[a] ??= new Set()).add(b);
      (opponents[b] ??= new Set()).add(a);
    }
  }
  for (const id of Object.keys(opponents)) assert.equal(opponents[id].size, 6, id);
});

test('압도적으로 강하면 우승하고, 16강·8강·4강은 2경기, 결승은 1경기라 총 13번 진행한다', () => {
  const { s, steps } = runAll(1000);
  assert.equal(s.result, 'champion');
  assert.equal(steps, 6 + 2 + 2 + 2 + 1);
});

test('압도적으로 약하면 리그 단계에서 탈락한다(6번 진행)', () => {
  const { s, steps } = runAll(1);
  assert.equal(s.result, 'league');
  assert.equal(steps, 6);
});

test('진행할 때마다 내 경기가 한 번 기록되고 이벤트 개수가 스코어와 같다', () => {
  let s = createUcl(92);
  s = advanceUcl(s);
  assert.equal(s.log.filter((m) => m.mine).length, 1);
  assert.equal(s.log.length, 12);
  assert.equal(s.last.events.length, s.last.me + s.last.opp);
});

test('리그 단계가 끝나면 상위 16팀이 시드 순서로 16강 8개 타이를 만든다', () => {
  let s = createUcl(95);
  for (let i = 0; i < 6; i++) s = advanceUcl(s);
  assert.equal(s.seeds.length, 16);
  assert.equal(s.ties.length, 8);
  assert.deepEqual([s.ties[0].a, s.ties[0].b], [s.seeds[0], s.seeds[15]]); // 1-16
  assert.deepEqual([s.ties[1].a, s.ties[1].b], [s.seeds[7], s.seeds[8]]); // 8-9
  const rank = uclRanking(s);
  for (let i = 1; i < rank.length; i++) assert.ok(s.table[rank[i - 1]].p >= s.table[rank[i]].p);
});

test('리그 승점·경기 수가 맞는다(24팀 모두 6경기)', () => {
  let s = createUcl(95);
  for (let i = 0; i < 6; i++) s = advanceUcl(s);
  for (const r of Object.values(s.table)) assert.equal(r.w + r.d + r.l, 6);
});

test('2차전이 끝나면 합계로 승자가 정해지고 결과 키와 상금이 유효하다', () => {
  for (let i = 0; i < 40; i++) {
    const { s } = runAll(94);
    assert.ok(UCL_RESULT_LABELS[s.result], s.result);
    assert.ok(UCL_REWARDS_FUNDS[s.result] > 0);
    for (const ties of Object.values(s.rounds)) {
      for (const t of ties) {
        assert.ok(t.winner);
        const agg = tieAggregate(t);
        if (agg.a !== agg.b) assert.equal(t.winner, agg.a > agg.b ? t.a : t.b);
      }
    }
  }
});

test('득점 이벤트는 시간순이고 1~90분 사이다', () => {
  const ev = generateMatchEvents(3, 2);
  assert.equal(ev.length, 5);
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].minute >= ev[i - 1].minute);
  assert.ok(ev.every((e) => e.minute >= 1 && e.minute <= 90));
});

test('토너먼트 경기는 무승부면 승부차기 승자를 정한다', () => {
  for (let i = 0; i < 200; i++) {
    const m = playMatch(90, 90, Math.random, true);
    if (m.ga === m.gb) assert.ok(m.pens === 'a' || m.pens === 'b');
  }
});
