import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, collectStats } from '../engine/records.mjs';
import { buildRows, computeAwards, giveAwards } from '../engine/awards.mjs';
import { playChampions } from '../engine/champions.mjs';
import { allTeams } from '../engine/world.mjs';
import { makeWorld, playFullSeason } from './helpers.mjs';

const row = (id, o = {}) => ({
  id, teamId: `T-${id}`, region: 0, tier: 1, position: 'FW', age: 25, overall: 70,
  league: { apps: 30, goals: 0, assists: 0 }, cl: { apps: 0, goals: 0, assists: 0 },
  team: { rank: 5, points: 50, ga: 40 }, ...o,
});
const KEY = '0:1';

test('골든부트는 득점 최다, 동점이면 도움이 많은 선수, 그래도 같으면 id 순이다', () => {
  const rows = [row('b', { league: { apps: 30, goals: 20, assists: 3 } }), row('a', { league: { apps: 30, goals: 20, assists: 3 } }), row('c', { league: { apps: 30, goals: 20, assists: 9 } })];
  assert.equal(computeAwards(rows, { myLeagueKey: KEY }).goldenBoot.playerId, 'c');
  assert.equal(computeAwards(rows.slice(0, 2), { myLeagueKey: KEY }).goldenBoot.playerId, 'a');
});

test('도움왕은 도움 최다다', () => {
  const rows = [row('a', { league: { apps: 30, goals: 30, assists: 2 } }), row('b', { league: { apps: 30, goals: 1, assists: 15 } })];
  assert.equal(computeAwards(rows, { myLeagueKey: KEY }).assistKing.playerId, 'b');
});

test('경기 수가 19 미만인 선수는 어떤 상도 받지 못한다', () => {
  const rows = [row('a', { league: { apps: 18, goals: 40, assists: 40 } }), row('b', { league: { apps: 19, goals: 1, assists: 0 } })];
  const aw = computeAwards(rows, { myLeagueKey: KEY });
  assert.equal(aw.goldenBoot.playerId, 'b');
  assert.equal(aw.mvp.playerId, 'b');
  assert.equal(aw.ballonDor.playerId, 'b');
});

test('후보가 아무도 없으면 상은 null이다', () => {
  const aw = computeAwards([row('a', { league: { apps: 3, goals: 9, assists: 0 } })], { myLeagueKey: KEY });
  assert.deepEqual(Object.values(aw), [null, null, null, null, null, null]);
  assert.deepEqual(Object.values(computeAwards([], { myLeagueKey: KEY })), [null, null, null, null, null, null]);
});

test('골든글러브는 골키퍼만, 실점이 가장 적은 팀의 골키퍼가 받는다', () => {
  const rows = [
    row('fw', { league: { apps: 30, goals: 30, assists: 0 }, team: { rank: 1, points: 90, ga: 10 } }),
    row('gk1', { position: 'GK', team: { rank: 3, points: 70, ga: 30 } }),
    row('gk2', { position: 'GK', team: { rank: 8, points: 50, ga: 25 } }),
  ];
  assert.equal(computeAwards(rows, { myLeagueKey: KEY }).goldenGlove.playerId, 'gk2');
  assert.equal(computeAwards([rows[0]], { myLeagueKey: KEY }).goldenGlove, null);
});

test('올해의 영건은 21세 이하 중 점수가 가장 높은 선수다', () => {
  const rows = [row('old', { league: { apps: 30, goals: 30, assists: 0 } }), row('kid', { age: 21 }), row('kid2', { age: 22, league: { apps: 30, goals: 50, assists: 0 } })];
  assert.equal(computeAwards(rows, { myLeagueKey: KEY }).youngStar.playerId, 'kid');
});

test('내 리그 상은 내 리그 선수만 받고, 발롱도르는 다른 지역 선수도 받는다', () => {
  const rows = [
    row('mine', { league: { apps: 30, goals: 10, assists: 0 } }),
    row('abroad', { region: 3, league: { apps: 30, goals: 25, assists: 0 } }),
  ];
  const aw = computeAwards(rows, { myLeagueKey: KEY });
  assert.equal(aw.goldenBoot.playerId, 'mine');
  assert.equal(aw.ballonDor.playerId, 'abroad');
});

test('발롱도르: 같은 기록이면 1부가 3부보다 앞서고, 챔피언스리그 우승팀 선수가 가산을 받는다', () => {
  const base = { league: { apps: 30, goals: 15, assists: 5 } };
  const rows = [row('t3', { ...base, tier: 3 }), row('t1', { ...base, tier: 1 })];
  assert.equal(computeAwards(rows, { myLeagueKey: KEY }).ballonDor.playerId, 't1');
  const champ = [row('x', { ...base, teamId: 'CHAMP' }), row('y', { league: { apps: 30, goals: 17, assists: 5 }, teamId: 'OTHER' })];
  assert.equal(computeAwards(champ, { myLeagueKey: KEY, cl: { champion: 'CHAMP', runnerUp: 'Z' } }).ballonDor.playerId, 'x');
  assert.equal(computeAwards(champ, { myLeagueKey: KEY }).ballonDor.playerId, 'y');
});

test('실제 시즌: 상 6개가 모두 정해지고 수상자는 후보 조건을 지키며, 기록실과 선수 카드에 올라간다', () => {
  const { world, rng, me } = makeWorld(3);
  me.stars[4].age = 20; // 처음 만든 세계에는 21세 이하가 없어 영건 후보를 하나 둔다
  playFullSeason(world, rng);
  const leagueStats = collectStats(world);
  const cl = playChampions(world, rng);
  const rows = buildRows(world, leagueStats, collectStats(world));
  const aw = computeAwards(rows, { myLeagueKey: '0:3', cl });
  for (const a of Object.values(aw)) assert.ok(a, '모든 상에 수상자가 있어야 한다');
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const key of ['mvp', 'goldenBoot', 'assistKing', 'goldenGlove', 'youngStar']) {
    const r = byId.get(aw[key].playerId);
    assert.equal(`${r.region}:${r.tier}`, '0:3');
    assert.ok(r.league.apps >= 19);
  }
  assert.equal(byId.get(aw.goldenGlove.playerId).position, 'GK');
  assert.ok(byId.get(aw.youngStar.playerId).age <= 21);
  const h = createHistory();
  giveAwards(h, aw, 1, world);
  assert.equal(h.players.get(aw.mvp.playerId).awards.some((x) => x.key === 'mvp'), true);
  const winner = allTeams(world).flatMap((t) => t.stars).find((p) => p.id === aw.mvp.playerId);
  assert.equal(winner.awards.some((x) => x.key === 'mvp'), true);
});

test('giveAwards: null 수상은 건너뛰고 한 선수가 여러 상을 받으면 모두 쌓인다', () => {
  const { world } = makeWorld(4);
  const star = allTeams(world)[0].stars[0];
  const h = createHistory();
  giveAwards(h, { mvp: { key: 'mvp', playerId: star.id }, goldenBoot: { key: 'goldenBoot', playerId: star.id }, youngStar: null }, 2, world);
  assert.deepEqual(star.awards.map((a) => a.key), ['mvp', 'goldenBoot']);
  assert.equal(h.players.get(star.id).awards.length, 2);
});
