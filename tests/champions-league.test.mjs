import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createUcl, advanceUcl, uclRanking, playMatch, generateMatchEvents, tieAggregate, buildLeagueSchedule,
  UCL_RESULT_LABELS, UCL_REWARDS_FUNDS, UCL_OPPONENTS, UCL_LEAGUE_DAYS,
} from '../engine/champions-league.mjs';

const runAll = (power, rng = Math.random, opts) => {
  let s = createUcl(power, rng, opts);
  let steps = 0;
  while (s.stage !== 'done' && steps < 40) { s = advanceUcl(s, rng); steps += 1; }
  return { s, steps };
};

test('36팀, 포트 4개(9팀씩), 리그 단계 8라운드', () => {
  const s = createUcl(90);
  assert.equal(s.teams.length, 36);
  assert.equal(UCL_OPPONENTS.length, 35);
  assert.equal(s.pots.length, 4);
  assert.ok(s.pots.every((p) => p.length === 9));
  assert.equal(s.fixtures.length, UCL_LEAGUE_DAYS);
});

test('모든 팀이 라운드마다 정확히 한 경기, 총 8경기, 서로 다른 8개 상대, 홈/원정 3~5', () => {
  for (let trial = 0; trial < 5; trial++) {
    const s = createUcl(90);
    const opp = {}; const home = {};
    for (const day of s.fixtures) {
      assert.equal(day.length, 18);
      const seen = new Set();
      for (const [h, a] of day) {
        assert.ok(!seen.has(h) && !seen.has(a), '한 라운드에 한 번만');
        seen.add(h); seen.add(a);
        (opp[h] ??= new Set()).add(a); (opp[a] ??= new Set()).add(h);
        home[h] = (home[h] ?? 0) + 1;
      }
      assert.equal(seen.size, 36);
    }
    for (const t of s.teams) {
      assert.equal(opp[t.id].size, 8, `${t.id} 상대 수`);
      assert.ok((home[t.id] ?? 0) >= 3 && (home[t.id] ?? 0) <= 5, `${t.id} 홈 ${home[t.id]}`);
    }
  }
});

test('포트마다 상대는 다른 포트에서 2팀씩 + 같은 포트 2팀(거의 전부) 구성이다', () => {
  const s = createUcl(90);
  const potOf = Object.fromEntries(s.pots.flatMap((p, i) => p.map((id) => [id, i])));
  const count = {};
  for (const day of s.fixtures) for (const [h, a] of day) {
    for (const [x, y] of [[h, a], [a, h]]) {
      count[x] ??= [0, 0, 0, 0];
      count[x][potOf[y]] += 1;
    }
  }
  for (const t of s.teams) {
    for (let p = 0; p < 4; p++) assert.ok(count[t.id][p] >= 1 && count[t.id][p] <= 3, `${t.id} pot ${p}: ${count[t.id][p]}`);
  }
});

test('압도적으로 강하면 우승: 직행이면 8+2+2+2+1=15번, 모든 라운드를 통과한다', () => {
  const { s, steps } = runAll(1000);
  assert.equal(s.result, 'champion');
  assert.equal(steps, 8 + 2 + 2 + 2 + 1);
});

test('압도적으로 약하면 리그 단계에서 탈락한다(8번 진행)', () => {
  const { s, steps } = runAll(1);
  assert.equal(s.result, 'league');
  assert.equal(steps, 8);
});

test('9~24위면 플레이오프를 뛴다(2경기 추가)', () => {
  let found = false;
  for (let i = 0; i < 400 && !found; i++) {
    let s = createUcl(88);
    for (let d = 0; d < 8; d++) s = advanceUcl(s);
    if (s.stage === 'playoff') {
      found = true;
      assert.equal(s.ties.length, 8);
      assert.ok(s.seeds.indexOf('me') >= 8 && s.seeds.indexOf('me') < 24);
      assert.deepEqual([s.ties[0].a, s.ties[0].b], [s.seeds[8], s.seeds[23]]); // 9-24
    }
  }
  assert.ok(found, '플레이오프 경로가 나와야 한다');
});

test('1~8위 직행이면 플레이오프가 이미 치러져 있고 16강 대진이 시드 순서다', () => {
  let found = false;
  for (let i = 0; i < 100 && !found; i++) {
    let s = createUcl(99);
    for (let d = 0; d < 8; d++) s = advanceUcl(s);
    if (s.stage === 'r16') {
      found = true;
      assert.equal(s.ties.length, 8);
      assert.equal(s.rounds.playoff.length, 8);
      for (let k = 0; k < 8; k++) assert.equal(s.ties[k].a, s.seeds[k]);
      assert.ok(s.rounds.playoff.every((t) => t.winner));
    }
  }
  assert.ok(found);
});

test('진행할 때마다 내 경기 한 번, 이벤트 개수는 스코어와 같다', () => {
  let s = createUcl(92);
  s = advanceUcl(s);
  assert.equal(s.log.filter((m) => m.mine).length, 1);
  assert.equal(s.log.length, 18);
  assert.equal(s.last.events.length, s.last.me + s.last.opp);
  assert.ok(typeof s.last.home === 'boolean');
});

test('리그 단계가 끝나면 24팀이 시드로 정해지고 승점·경기수가 맞다', () => {
  let s = createUcl(95);
  for (let i = 0; i < 8; i++) s = advanceUcl(s);
  assert.equal(s.seeds.length, 24);
  for (const r of Object.values(s.table)) assert.equal(r.w + r.d + r.l, 8);
  const rank = uclRanking(s);
  for (let i = 1; i < rank.length; i++) assert.ok(s.table[rank[i - 1]].p >= s.table[rank[i]].p);
});

test('토너먼트 합계로 승자가 정해지고 결과 키/상금이 유효하다', () => {
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

test('원정팀의 무덤: 그곳 원정이면 내 팀이 약해진 전력으로 뛴다', () => {
  const s = createUcl(95, () => 0, { myPowerAway: 80 }); // rng 0 → 모든 상대가 "무덤"
  assert.ok(s.teams.slice(1).every((t) => t.fortress));
  assert.equal(s.myPowerAway, 80);
  const m = playMatch(80, 96, () => 0.5);
  assert.ok(m.gh <= m.ga); // 약한 쪽이 원정 불리한 상황에서 홈팀이 못 이김
});

test('득점 이벤트는 시간순이고 1~90분이며, 토너먼트 무승부는 승부차기로 결정된다', () => {
  const ev = generateMatchEvents(3, 2);
  assert.equal(ev.length, 5);
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].minute >= ev[i - 1].minute);
  for (let i = 0; i < 200; i++) {
    const m = playMatch(90, 90, Math.random, true);
    if (m.gh === m.ga) assert.ok(m.pens === 'home' || m.pens === 'away');
  }
  assert.equal(buildLeagueSchedule(Array.from({ length: 36 }, (_, i) => `t${i}`)).length, 8);
});

test('승부차기 연출: 요청한 팀이 이기고, 5번 안에 끝나거나 서든데스까지 가며 점수가 킥과 일치한다', async () => {
  const { generateShootout } = await import('../engine/champions-league.mjs');
  for (let i = 0; i < 200; i++) {
    for (const winner of ['me', 'opp']) {
      const r = generateShootout(winner);
      assert.equal(r.me > r.opp ? 'me' : 'opp', winner);
      assert.equal(r.me, r.kicks.filter((k) => k.side === 'me' && k.scored).length);
      assert.equal(r.opp, r.kicks.filter((k) => k.side === 'opp' && k.scored).length);
      assert.ok(r.kicks.length >= 2);
    }
  }
});
