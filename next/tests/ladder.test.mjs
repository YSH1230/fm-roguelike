import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createTeam } from '../engine/team.mjs';
import { standings } from '../engine/league.mjs';
import { allTeams, leagueKey, myLeague } from '../engine/world.mjs';
import { managerFate, playOffMatch, resolveLadder, startNextSeason } from '../engine/ladder.mjs';
import { makeWorld, playFullSeason } from './helpers.mjs';

function finished(seed) {
  const { world, rng, me } = makeWorld(seed);
  playFullSeason(world, rng);
  return { world, rng, me, outcome: resolveLadder(world, rng) };
}

test('시즌이 끝나기 전에는 승강을 확정할 수 없다', () => {
  const { world, rng } = makeWorld(1);
  assert.throws(() => resolveLadder(world, rng), /아직 끝나지/);
});

test('승강 뒤에도 각 리그는 20팀이고 60팀이 한 번씩만 들어 있다', () => {
  const { outcome } = finished(2);
  for (const tier of [1, 2, 3]) assert.equal(outcome.membership[tier].length, 20);
  const all = [1, 2, 3].flatMap((t) => outcome.membership[t]);
  assert.equal(new Set(all).size, 60);
});

test('자동 승격·강등: 2부 1~2위는 1부로, 1부 19~20위는 2부로, 3부 1~2위는 2부로, 2부 19~20위는 3부로', () => {
  const { world, outcome } = finished(3);
  const rank = (tier) => standings(world.leagues.get(leagueKey(0, tier))).map((r) => r.id);
  const m = outcome.membership;
  for (const id of rank(2).slice(0, 2)) assert.ok(m[1].includes(id));
  for (const id of rank(1).slice(18)) assert.ok(m[2].includes(id));
  for (const id of rank(3).slice(0, 2)) assert.ok(m[2].includes(id));
  for (const id of rank(2).slice(18)) assert.ok(m[3].includes(id));
  for (const id of rank(1).slice(0, 17)) assert.ok(m[1].includes(id));
  for (const id of rank(3).slice(3)) assert.ok(m[3].includes(id));
});

test('승강전 2경기: 승자가 상위 리그에 남고 패자가 하위 리그로 간다', () => {
  const { world, outcome } = finished(4);
  const rank = (tier) => standings(world.leagues.get(leagueKey(0, tier))).map((r) => r.id);
  const [a, b] = outcome.playoffs;
  assert.deepEqual([a.homeId, a.awayId], [rank(1)[17], rank(2)[2]]);
  assert.deepEqual([b.homeId, b.awayId], [rank(2)[17], rank(3)[2]]);
  assert.ok(outcome.membership[1].includes(a.winnerId));
  assert.ok(outcome.membership[2].includes(a.winnerId === a.homeId ? a.awayId : a.homeId));
  assert.ok(outcome.membership[2].includes(b.winnerId));
  assert.ok(outcome.membership[3].includes(b.winnerId === b.homeId ? b.awayId : b.homeId));
});

test('단판은 비기면 승부차기이고 승자는 항상 정해진다', () => {
  const rng = createRng(5);
  const home = createTeam({ rng, id: 'H' });
  const away = createTeam({ rng, id: 'A' });
  let shootouts = 0;
  for (let i = 0; i < 200; i += 1) {
    const r = playOffMatch(home, away, rng);
    assert.ok([r.homeId, r.awayId].includes(r.winnerId));
    assert.equal(r.penalties, r.homeGoals === r.awayGoals);
    if (!r.penalties) assert.equal(r.winnerId, r.homeGoals > r.awayGoals ? r.homeId : r.awayId);
    shootouts += r.penalties ? 1 : 0;
  }
  assert.ok(shootouts > 10 && shootouts < 120);
});

const fate = (from, rank, to, id = 'ME') => managerFate({
  tierBefore: new Map([[id, from]]),
  finalRank: new Map([[id, rank]]),
  membership: { 1: to === 1 ? [id] : [], 2: to === 2 ? [id] : [], 3: to === 3 ? [id] : [] },
}, id);

test('감독 운명: 3부 19~20위 경질, 2부·1부 강등 경질, 승격, 유지', () => {
  assert.equal(fate(3, 19, 3), 'fired');
  assert.equal(fate(3, 20, 3), 'fired');
  assert.equal(fate(3, 18, 3), 'stay');
  assert.equal(fate(3, 2, 2), 'promoted');
  assert.equal(fate(2, 19, 3), 'fired');
  assert.equal(fate(2, 18, 3), 'fired'); // 승강전 패배도 강등이다
  assert.equal(fate(2, 10, 2), 'stay');
  assert.equal(fate(1, 20, 2), 'fired');
  assert.equal(fate(2, 1, 1), 'promoted');
  assert.equal(fate(1, 1, 1), 'stay');
});

test('새 시즌: 리그 10개가 새 일정과 0점 순위표로 다시 시작하고 팀 단계와 선수 시즌 기록이 갱신된다', () => {
  const { world, outcome } = finished(6);
  const before = world.year;
  const league = startNextSeason(world, outcome);
  assert.equal(world.year, before + 1);
  assert.equal(world.leagues.size, 10);
  for (const l of world.leagues.values()) {
    assert.equal(l.teams.size, 20);
    assert.equal(l.nextRound, 0);
    assert.ok([...l.table.values()].every((row) => row.played === 0));
  }
  for (const tier of [1, 2, 3]) {
    for (const t of world.leagues.get(leagueKey(0, tier)).teams.values()) assert.equal(t.tier, tier);
  }
  for (const t of allTeams(world)) assert.ok(t.lineup.every((p) => p.stats.apps === 0 && p.stats.goals === 0));
  assert.equal(league, myLeague(world));
});

test('3시즌 연속으로 돌려도 오류 없이 팀 수가 유지된다', () => {
  const { world, rng } = makeWorld(7);
  for (let y = 0; y < 3; y += 1) {
    playFullSeason(world, rng);
    startNextSeason(world, resolveLadder(world, rng));
  }
  assert.equal(world.year, 4);
  assert.equal(allTeams(world).length, 200);
});
