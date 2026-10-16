import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld } from './helpers.mjs';
import { teamRatings } from '../engine/ratings.mjs';
import { lineupView, setRest } from '../engine/condition.mjs';
import { isSeasonOver, standings } from '../engine/league.mjs';
import {
  allTeams, isWorldSeasonOver, leagueKey, myLeague, playWorldChunk, tiersOf,
} from '../engine/world.mjs';

test('리그는 10개: 내 지역 1~3부 + 다른 7개 지역 1부, 모두 20팀', () => {
  const { world } = makeWorld();
  assert.equal(world.leagues.size, 10);
  assert.deepEqual(tiersOf(0), [1, 2, 3]);
  assert.deepEqual(tiersOf(5), [1]);
  for (const league of world.leagues.values()) assert.equal(league.teams.size, 20);
  assert.equal(allTeams(world).length, 200);
  assert.equal(new Set(allTeams(world).map((t) => t.id)).size, 200);
});

test('내 팀은 내 지역 3부에 들어가고 팀마다 지역·단계가 적힌다', () => {
  const { world, me } = makeWorld(2);
  assert.equal(myLeague(world), world.leagues.get(leagueKey(0, 3)));
  assert.equal(me.region, 0);
  assert.equal(me.tier, 3);
  assert.equal(world.leagues.get('3:1').teams.values().next().value.region, 3);
});

test('상위 리그일수록 팀 전력이 높다', () => {
  const { world } = makeWorld(3);
  const avg = (key) => {
    const teams = [...world.leagues.get(key).teams.values()].filter((t) => t.id !== 'ME');
    return teams.reduce((s, t) => s + teamRatings(t).attack + teamRatings(t).defense, 0) / teams.length;
  };
  assert.ok(avg('0:1') > avg('0:2') + 8);
  assert.ok(avg('0:2') > avg('0:3') + 8);
});

test('AI 팀은 이름 있는 선수 3명을 가진다', () => {
  const { world } = makeWorld(4);
  for (const t of world.leagues.get('0:1').teams.values()) {
    assert.equal(t.named.length, 3);
    assert.ok(t.named.every((p) => t.stars.includes(p)));
  }
});

test('한 구간씩 모든 리그가 함께 진행되고 세 번이면 시즌이 끝난다', () => {
  const { world, rng } = makeWorld(5);
  const out = playWorldChunk(world, rng);
  assert.equal(out.size, 10);
  assert.equal(out.get('0:3').length, 140);
  assert.equal(isWorldSeasonOver(world), false);
  playWorldChunk(world, rng);
  playWorldChunk(world, rng);
  assert.equal(isWorldSeasonOver(world), true);
  for (const league of world.leagues.values()) assert.ok(isSeasonOver(league));
  assert.equal(standings(myLeague(world)).length, 20);
});

test('views: 쉬는 스타 자리에 대체 선수가 뛰고 구간이 끝나면 원래 팀으로 돌아온다', () => {
  const { world, rng, me } = makeWorld(6);
  const rested = me.stars[4];
  setRest(me, [rested.id]);
  playWorldChunk(world, rng, { views: new Map([['ME', lineupView(me, rng)]]) });
  assert.equal(myLeague(world).teams.get('ME'), me);
  assert.equal(rested.stats.apps, 0);
  assert.equal(me.subs.FW1.stats.apps, 14);
});

test('views에 던져진 오류가 나도 원래 팀이 복구된다', () => {
  const { world, rng, me } = makeWorld(7);
  const bad = { ...me, lineup: null };
  assert.throws(() => playWorldChunk(world, rng, { views: new Map([['ME', bad]]) }));
  assert.equal(myLeague(world).teams.get('ME'), me);
});

test('내 팀이 없는 리그 키를 부르면 오류다', () => {
  const { world } = makeWorld(8);
  world.myTeamId = 'ghost';
  assert.throws(() => myLeague(world), /어느 리그에도/);
});
