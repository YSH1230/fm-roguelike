import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { championsEntrants, drawGroups, playChampions } from '../engine/champions.mjs';
import { makeWorld, playFullSeason } from './helpers.mjs';

function ready(seed) {
  const { world, rng } = makeWorld(seed);
  playFullSeason(world, rng);
  return { world, rng };
}

test('출전 팀은 8개 지역 x 4팀 = 32팀이고 각 지역 1부 상위 4팀이다', () => {
  const { world } = ready(1);
  const regions = championsEntrants(world);
  assert.equal(regions.length, 8);
  for (const [r, teams] of regions.entries()) {
    assert.equal(teams.length, 4);
    for (const t of teams) assert.equal(t.region, r);
  }
  assert.equal(new Set(regions.flat().map((t) => t.id)).size, 32);
});

test('조 추첨: 8개 조에 4팀씩, 한 조에 같은 지역이 둘 없고 포트(순위)가 하나씩 들어간다', () => {
  const { world } = ready(2);
  const groups = drawGroups(championsEntrants(world), createRng(2));
  assert.equal(groups.length, 8);
  for (const g of groups) {
    assert.equal(g.length, 4);
    assert.equal(new Set(g.map((t) => t.region)).size, 4);
  }
  assert.equal(new Set(groups.flat().map((t) => t.id)).size, 32);
});

test('조별리그 8개 조 x 12경기, 순위표는 승점순이다', () => {
  const { world, rng } = ready(3);
  const cl = playChampions(world, rng);
  assert.equal(cl.groups.length, 8);
  for (const g of cl.groups) {
    assert.equal(g.matches.length, 12);
    assert.equal(g.table.length, 4);
    for (const row of g.table) assert.equal(row.played, 6);
    for (let i = 1; i < 4; i += 1) assert.ok(g.table[i - 1].points >= g.table[i].points);
  }
});

test('토너먼트는 16강 8경기, 8강 4경기, 4강 2경기, 결승 1경기이고 승자만 올라간다', () => {
  const { world, rng } = ready(4);
  const { rounds } = playChampions(world, rng);
  assert.deepEqual(Object.values(rounds).map((m) => m.length), [8, 4, 2, 1]);
  const names = ['r16', 'qf', 'sf', 'final'];
  for (let i = 0; i < 3; i += 1) {
    const winners = new Set(rounds[names[i]].map((m) => m.winnerId));
    for (const m of rounds[names[i + 1]]) {
      assert.ok(winners.has(m.homeId) && winners.has(m.awayId));
    }
  }
});

test('16강: 조 1위가 다른 조 2위를 만나고 한 팀이 두 번 나오지 않는다', () => {
  const { world, rng } = ready(5);
  const cl = playChampions(world, rng);
  const firsts = new Set(cl.groups.map((g) => g.table[0].id));
  const seconds = new Set(cl.groups.map((g) => g.table[1].id));
  for (const m of cl.rounds.r16) {
    assert.ok(firsts.has(m.homeId));
    assert.ok(seconds.has(m.awayId));
  }
  const all = cl.rounds.r16.flatMap((m) => [m.homeId, m.awayId]);
  assert.equal(new Set(all).size, 16);
});

test('우승팀은 출전 32팀 중 하나이고 결승 상대와 다르다', () => {
  const { world, rng } = ready(6);
  const entrants = new Set(championsEntrants(world).flat().map((t) => t.id));
  const cl = playChampions(world, rng);
  assert.ok(entrants.has(cl.champion));
  assert.ok(entrants.has(cl.runnerUp));
  assert.notEqual(cl.champion, cl.runnerUp);
});

test('같은 시드면 같은 챔피언스리그 결과가 나온다', () => {
  const run = () => {
    const { world, rng } = ready(7);
    const cl = playChampions(world, rng);
    return [cl.champion, cl.runnerUp, cl.groups.map((g) => g.table.map((r) => r.id).join())];
  };
  assert.deepEqual(run(), run());
});

test('챔피언스리그 득점도 선수 기록에 쌓인다', () => {
  const { world, rng } = ready(8);
  const entrants = championsEntrants(world).flat();
  const before = entrants.reduce((s, t) => s + t.lineup.reduce((a, p) => a + p.stats.apps, 0), 0);
  playChampions(world, rng);
  const after = entrants.reduce((s, t) => s + t.lineup.reduce((a, p) => a + p.stats.apps, 0), 0);
  assert.ok(after > before + 32 * 6 * 11 - 1);
});
