import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, collectStats, recordSeason } from '../engine/records.mjs';
import { playChampions } from '../engine/champions.mjs';
import { standings } from '../engine/league.mjs';
import { allTeams } from '../engine/world.mjs';
import {
  careerSummary, inductHallOfFame, recordChampions, recordMyTeam, retirePlayer,
} from '../engine/honors.mjs';
import { makeWorld, playFullSeason } from './helpers.mjs';

test('역대 우승팀: 모든 리그의 1위와 주요 선수 3명, 챔피언스리그 우승팀이 기록된다', () => {
  const { world, rng } = makeWorld(1);
  playFullSeason(world, rng);
  const cl = playChampions(world, rng);
  const h = createHistory();
  recordChampions(h, { year: 1, world, cl });
  const entry = h.champions[0];
  assert.equal(Object.keys(entry.leagues).length, 10);
  assert.equal(entry.leagues['0:3'].teamId, standings(world.leagues.get('0:3'))[0].id);
  assert.equal(entry.leagues['0:3'].players.length, 3);
  assert.equal(entry.champions.teamId, cl.champion);
  const teams = new Map(allTeams(world).map((t) => [t.id, t]));
  for (const id of entry.champions.players) assert.ok(teams.get(cl.champion).stars.some((p) => p.id === id));
});

test('챔피언스리그를 치르지 않은 시즌의 champions는 null이다', () => {
  const { world, rng } = makeWorld(2);
  playFullSeason(world, rng);
  const h = createHistory();
  recordChampions(h, { year: 1, world });
  assert.equal(h.champions[0].champions, null);
});

test('내 시즌 결과: 1위면 리그 우승 트로피, 챔피언스리그 우승 트로피, 내 선수가 받은 상만 진열대에 오른다', () => {
  const h = createHistory();
  const awards = {
    mvp: { key: 'mvp', playerId: 'mine1', teamId: 'ME' },
    goldenBoot: { key: 'goldenBoot', playerId: 'other', teamId: 'X' },
    youngStar: null,
  };
  recordMyTeam(h, { year: 1, tier: 3, rank: 1, fate: 'promoted', awards, myTeamId: 'ME' });
  recordMyTeam(h, { year: 2, tier: 2, rank: 4, fate: 'stay', myTeamId: 'ME' });
  recordMyTeam(h, { year: 3, tier: 1, rank: 1, fate: 'stay', clChampion: true, myTeamId: 'ME' });
  assert.deepEqual(h.trophies.map((t) => t.kind), ['league', 'award', 'league', 'cl']);
  assert.equal(h.trophies[1].key, 'mvp');
  assert.equal(h.bestTier, 1);
  assert.equal(h.mySeasons.length, 3);
});

test('최고 리그는 낮아지지 않는다(1부에 올랐다가 강등돼도 1)', () => {
  const h = createHistory();
  recordMyTeam(h, { year: 1, tier: 1, rank: 20, fate: 'fired', myTeamId: 'ME' });
  recordMyTeam(h, { year: 2, tier: 2, rank: 5, fate: 'stay', myTeamId: 'ME' });
  assert.equal(h.bestTier, 1);
});

test('은퇴식: 통산·수상·최고 시즌 득점이 정리된다', () => {
  const h = createHistory();
  const p = { id: 'p1', position: 'FW', age: 36 };
  const row = (goals) => ({ id: 'p1', teamId: 'ME', tier: 3, region: 0, position: 'FW', age: 30, overall: 70, apps: 30, goals, assists: 2 });
  recordSeason(h, { year: 1, leagueStats: new Map([['p1', row(12)]]), myTeamId: 'ME' });
  recordSeason(h, { year: 2, leagueStats: new Map([['p1', row(20)]]), clStats: new Map([['p1', { apps: 5, goals: 4, assists: 0 }]]), myTeamId: 'ME' });
  h.players.get('p1').awards.push({ year: 2, key: 'mvp' });
  const c = retirePlayer(h, p, 3);
  assert.deepEqual(c.career, { apps: 65, goals: 36, assists: 4 });
  assert.equal(c.bestSeasonGoals, 24);
  assert.equal(c.awards, 1);
  assert.equal(c.seasons, 2);
  assert.equal(h.retired.length, 1);
});

test('기록이 없는 선수도 은퇴식은 오류 없이 빈 통산으로 정리된다', () => {
  const c = retirePlayer(createHistory(), { id: 'new', position: 'GK', age: 40 }, 1);
  assert.deepEqual(c.career, { apps: 0, goals: 0, assists: 0 });
  assert.equal(c.bestSeasonGoals, 0);
});

test('명예의 전당: 은퇴한 선수만, 한 번만 올릴 수 있다', () => {
  const h = createHistory();
  assert.throws(() => inductHallOfFame(h, 'p1'), /은퇴한 선수만/);
  retirePlayer(h, { id: 'p1', position: 'FW', age: 37 }, 4);
  inductHallOfFame(h, 'p1');
  assert.deepEqual(h.hallOfFame, [{ playerId: 'p1', retiredYear: 4 }]);
  assert.throws(() => inductHallOfFame(h, 'p1'), /이미 명예의 전당/);
});

test('커리어 요약과 점수: 최고 리그·우승·상·명예의 전당·시즌 수를 합산하고 대표 선수는 내 선수 중 득점+도움 상위 3명이다', () => {
  const h = createHistory();
  const mk = (id, goals, mine) => ({ id, teamId: mine ? 'ME' : 'X', tier: 3, region: 0, position: 'FW', age: 25, overall: 70, apps: 30, goals, assists: 0 });
  recordSeason(h, {
    year: 1,
    leagueStats: new Map([['a', mk('a', 5, true)], ['b', mk('b', 20, true)], ['c', mk('c', 12, true)], ['d', mk('d', 9, true)], ['star', mk('star', 99, false)]]),
    myTeamId: 'ME',
  });
  recordMyTeam(h, { year: 1, tier: 3, rank: 1, fate: 'promoted', awards: { mvp: { key: 'mvp', playerId: 'b', teamId: 'ME' } }, myTeamId: 'ME' });
  recordMyTeam(h, { year: 2, tier: 2, rank: 1, fate: 'promoted', myTeamId: 'ME' });
  recordMyTeam(h, { year: 3, tier: 1, rank: 1, fate: 'stay', clChampion: true, myTeamId: 'ME' });
  retirePlayer(h, { id: 'b', position: 'FW', age: 38 }, 3);
  inductHallOfFame(h, 'b');
  const s = careerSummary(h);
  assert.deepEqual(s.standout, ['b', 'c', 'd']);
  assert.equal(s.leagueTitles, 3);
  assert.equal(s.clTitles, 1);
  assert.equal(s.awardCount, 1);
  assert.equal(s.seasons, 3);
  assert.equal(s.score, 100 + 3 * 30 + 100 + 5 + 20 + 3 * 5);
});

test('아무 시즌도 안 치른 커리어의 점수는 0이다', () => {
  const s = careerSummary(createHistory());
  assert.equal(s.score, 0);
  assert.deepEqual(s.standout, []);
});

test('실제 두 시즌을 돌린 기록이 쌓인다', () => {
  const { world, rng } = makeWorld(3);
  playFullSeason(world, rng);
  const h = createHistory();
  recordSeason(h, { year: 1, leagueStats: collectStats(world), myTeamId: 'ME' });
  recordMyTeam(h, { year: 1, tier: 3, rank: standings(world.leagues.get('0:3')).findIndex((r) => r.id === 'ME') + 1, fate: 'stay', myTeamId: 'ME' });
  const s = careerSummary(h);
  assert.equal(s.seasons, 1);
  assert.ok(s.standout.length === 3);
});

test('엔딩: 1부 우승은 league, 챔피언스리그 우승은 champions, 각각 처음 한 번만, 겹치면 champions', async () => {
  const { endingFor } = await import('../engine/honors.mjs');
  assert.equal(endingFor({ tier: 3, rank: 1, clChampion: false }), null);
  assert.equal(endingFor({ tier: 1, rank: 2, clChampion: false }), null);
  assert.equal(endingFor({ tier: 1, rank: 1, clChampion: false }), 'league');
  assert.equal(endingFor({ tier: 1, rank: 1, clChampion: false }, ['league']), null);
  assert.equal(endingFor({ tier: 1, rank: 3, clChampion: true }, ['league']), 'champions');
  assert.equal(endingFor({ tier: 1, rank: 1, clChampion: true }), 'champions');
  assert.equal(endingFor({ tier: 1, rank: 1, clChampion: true }, ['champions']), 'league');
});
