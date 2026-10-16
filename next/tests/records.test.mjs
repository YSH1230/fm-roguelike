import test from 'node:test';
import assert from 'node:assert/strict';
import { collectStats, createHistory, diffStats, recordSeason } from '../engine/records.mjs';
import { allTeams } from '../engine/world.mjs';
import { makeWorld, playFullSeason } from './helpers.mjs';

const row = (id, apps, goals, assists, extra = {}) => ({ id, teamId: 'T', tier: 1, region: 0, position: 'FW', age: 25, overall: 70, apps, goals, assists, ...extra });

test('기록 대상은 모든 팀의 스타 1200명이고 조연은 빠진다', () => {
  const { world } = makeWorld(1);
  const stats = collectStats(world);
  assert.equal(stats.size, 200 * 6);
  const filler = allTeams(world)[0].lineup[8];
  assert.ok(!stats.has(filler.id));
});

test('diffStats: 증가분을 구하고 없던 선수는 그대로 둔다', () => {
  const before = new Map([['a', row('a', 10, 3, 1)]]);
  const after = new Map([['a', row('a', 16, 5, 1)], ['b', row('b', 4, 2, 0)]]);
  const d = diffStats(after, before);
  assert.deepEqual([d.get('a').apps, d.get('a').goals, d.get('a').assists], [6, 2, 0]);
  assert.deepEqual([d.get('b').apps, d.get('b').goals], [4, 2]);
});

test('recordSeason: 시즌 줄과 통산이 쌓이고 뛰지 않은 선수는 건너뛴다', () => {
  const h = createHistory();
  const league = new Map([['a', row('a', 30, 10, 4)], ['idle', row('idle', 0, 0, 0)]]);
  const cl = new Map([['a', row('a', 8, 3, 2)]]);
  recordSeason(h, { year: 1, leagueStats: league, clStats: cl, myTeamId: 'T' });
  recordSeason(h, { year: 2, leagueStats: new Map([['a', row('a', 20, 5, 5)]]), myTeamId: 'T' });
  const a = h.players.get('a');
  assert.equal(a.seasons.length, 2);
  assert.deepEqual(a.career, { apps: 58, goals: 18, assists: 11 });
  assert.equal(a.seasons[0].clGoals, 3);
  assert.equal(a.mine, true);
  assert.ok(!h.players.has('idle'));
});

test('내 팀이 아닌 선수는 mine이 아니다', () => {
  const h = createHistory();
  recordSeason(h, { year: 1, leagueStats: new Map([['x', row('x', 5, 1, 0, { teamId: 'OTHER' })]]), myTeamId: 'T' });
  assert.equal(h.players.get('x').mine, false);
});

test('실제 시즌을 돌린 뒤 기록하면 득점 합계가 선수 기록과 일치한다', () => {
  const { world, rng } = makeWorld(2);
  playFullSeason(world, rng);
  const stats = collectStats(world);
  const h = createHistory();
  recordSeason(h, { year: 1, leagueStats: stats, myTeamId: 'ME' });
  const total = [...h.players.values()].reduce((s, p) => s + p.career.goals, 0);
  assert.equal(total, [...stats.values()].reduce((s, r) => s + r.goals, 0));
  assert.ok(total > 1000);
});
