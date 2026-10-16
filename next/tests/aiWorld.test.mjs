import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createPlayer, overall } from '../engine/player.mjs';
import { aiSign } from '../engine/freeAgency.mjs';
import { allTeams, leagueKey } from '../engine/world.mjs';
import {
  ageAiTeam, driftTeam, integrateNamed, offseasonAi, refillStars, releaseAiPlayers, topThree,
} from '../engine/aiWorld.mjs';
import { makeWorld } from './helpers.mjs';

const aiTeams = (world) => [...world.leagues.get(leagueKey(0, 1)).teams.values()];

test('driftTeam: 능력이 1~99 안에서 기준 수준 쪽으로 움직이고 코치 별은 1~5를 지킨다', () => {
  const { world } = makeWorld(1);
  const team = aiTeams(world)[0];
  team.stars.forEach((p) => { for (const k of Object.keys(p.attrs)) p.attrs[k] = 99; });
  const rng = createRng(2);
  for (let i = 0; i < 30; i += 1) driftTeam(team, rng);
  const avg = team.stars.reduce((s, p) => s + overall(p), 0) / 6;
  assert.ok(avg < 90 && avg > 55, `평균 ${avg}`);
  for (const p of team.stars) for (const v of Object.values(p.attrs)) assert.ok(v >= 1 && v <= 99);
  for (const k of ['attack', 'defense']) assert.ok(team.coaches[k].stars >= 1 && team.coaches[k].stars <= 5);
});

test('driftTeam: 3부 팀이 낮은 수준이면 위로 끌려 올라간다', () => {
  const { world } = makeWorld(3);
  const team = [...world.leagues.get(leagueKey(0, 3)).teams.values()].find((t) => t.id !== 'ME');
  team.stars.forEach((p) => { for (const k of Object.keys(p.attrs)) p.attrs[k] = 10; });
  const before = team.stars.reduce((s, p) => s + overall(p), 0);
  const rng = createRng(4);
  for (let i = 0; i < 5; i += 1) driftTeam(team, rng);
  assert.ok(team.stars.reduce((s, p) => s + overall(p), 0) > before + 30);
});

test('refillStars: 스타가 모자라면 부족한 포지션을 어린 선수로 채우고 라인업은 11명이다', () => {
  const { world } = makeWorld(5);
  const team = aiTeams(world)[0];
  team.stars = team.stars.filter((p) => p.position !== 'GK');
  team.lineup = [...team.stars, ...team.lineup.slice(6)];
  refillStars(team, createRng(5));
  assert.equal(team.stars.length, 6);
  assert.ok(team.stars.some((p) => p.position === 'GK' && p.age <= 22));
  assert.equal(team.lineup.length, 11);
  assert.equal(team.named.length, 3);
});

test('ageAiTeam: 한 살 먹고 40세는 은퇴하며 빈자리는 신인이 채워 6명을 유지한다', () => {
  const { world } = makeWorld(6);
  const team = aiTeams(world)[0];
  const old = team.stars[0];
  old.age = 39;
  const retired = ageAiTeam(team, createRng(6));
  assert.ok(retired.includes(old));
  assert.equal(team.stars.length, 6);
  assert.ok(!team.stars.includes(old));
  assert.equal(team.lineup.length, 11);
});

test('releaseAiPlayers: 요청한 수만큼 서로 다른 선수가 풀리고 각 팀은 6명을 유지한다', () => {
  const { world } = makeWorld(7);
  const teams = aiTeams(world);
  const released = releaseAiPlayers(createRng(7), teams, 4);
  assert.equal(released.length, 4);
  assert.equal(new Set(released.map((p) => p.id)).size, 4);
  for (const t of teams) {
    assert.equal(t.stars.length, 6);
    for (const p of released) assert.ok(!t.stars.includes(p));
  }
});

test('releaseAiPlayers: 이름 있는 선수가 없으면 빈 목록이다', () => {
  assert.deepEqual(releaseAiPlayers(createRng(8), [], 4), []);
});

test('aiSign으로 들어온 FA는 integrateNamed로 스타가 되고 가장 약한 스타가 밀려난다', () => {
  const { world } = makeWorld(9);
  const team = aiTeams(world)[0];
  const star = createPlayer({ rng: createRng(9), id: 'FA-X', position: 'FW', level: 95 });
  aiSign(createRng(9), [{ player: star }], [team]);
  const weakest = [...team.stars].sort((a, b) => overall(a) - overall(b))[0];
  integrateNamed(team, createRng(9));
  assert.ok(team.stars.includes(star));
  assert.ok(!team.stars.includes(weakest));
  assert.equal(team.stars.length, 6);
  assert.ok(team.named.includes(star));
  assert.equal(team.lineup.length, 11);
});

test('topThree는 능력 순 상위 3명이다', () => {
  const { world } = makeWorld(10);
  const team = aiTeams(world)[0];
  const top = topThree(team);
  const rest = team.stars.filter((p) => !top.includes(p));
  assert.ok(Math.min(...top.map(overall)) >= Math.max(...rest.map(overall)));
});

test('offseasonAi: 내 팀은 건드리지 않고 나머지 199팀은 나이가 한 살 늘며 모두 스타 6명이다', () => {
  const { world, me } = makeWorld(11);
  const mine = me.stars.map((p) => [p.age, { ...p.attrs }]);
  const probe = aiTeams(world)[0].stars[0];
  const age = probe.age;
  offseasonAi(world, createRng(11));
  assert.deepEqual(me.stars.map((p) => [p.age, { ...p.attrs }]), mine);
  if (aiTeams(world)[0].stars.includes(probe)) assert.equal(probe.age, age + 1);
  for (const t of allTeams(world)) assert.equal(t.stars.length, 6);
});
