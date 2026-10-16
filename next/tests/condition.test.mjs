import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createTeam } from '../engine/team.mjs';
import { createClub } from '../engine/economy.mjs';
import { createLeague, isSeasonOver, playChunk } from '../engine/league.mjs';
import { askingSalary } from '../engine/contract.mjs';
import { teamRatings } from '../engine/ratings.mjs';
import {
  chunkStep, isAvailable, lineupView, nextCondition, nextMood, rollInjury, setRest, snapshotStats, teamMorale,
} from '../engine/condition.mjs';

const mk = (seed = 1) => createTeam({ rng: createRng(seed), id: 'A' });
const pay = (team) => team.stars.forEach((p) => { p.contract = { salary: askingSalary(p), years: 3 }; });

test('쉬게 지정한 스타는 빠지고 지정은 덮어쓴다. 남의 선수 id는 오류', () => {
  const team = mk();
  setRest(team, [team.stars[0].id, team.stars[1].id]);
  assert.equal(team.stars.filter((p) => !isAvailable(p)).length, 2);
  setRest(team, [team.stars[2].id]);
  assert.equal(team.stars.filter((p) => !isAvailable(p)).length, 1);
  assert.throws(() => setRest(team, ['ghost']), /스타가 아닙니다/);
});

test('뛰는 11명: 쉬는 스타 자리를 같은 포지션 대체 선수가 메우고 골키퍼도 1명이다', () => {
  const team = mk(2);
  const gk = team.stars.find((p) => p.position === 'GK');
  setRest(team, [gk.id]);
  const view = lineupView(team, createRng(2));
  assert.equal(view.lineup.length, 11);
  assert.equal(view.lineup.filter((p) => p.position === 'GK').length, 1);
  assert.ok(!view.lineup.includes(gk));
  assert.equal(lineupView(team, createRng(9)).lineup.at(-1), view.lineup.at(-1)); // 대체 선수는 보관된다
});

test('스타 전원이 빠져도 11명이 뛰고 전력은 코치 기본값으로 떨어진다', () => {
  const team = mk(3);
  const full = teamRatings(team);
  setRest(team, team.stars.map((p) => p.id));
  const view = lineupView(team, createRng(3));
  assert.equal(view.lineup.length, 11);
  assert.equal(view.stars.length, 0);
  assert.ok(teamRatings(view).attack < full.attack);
});

test('리그에서 view로 한 구간을 돌리면 쉰 스타는 출전하지 않고 대체 선수가 뛴다', () => {
  const rng = createRng(4);
  const teams = Array.from({ length: 20 }, (_, i) => createTeam({ rng, id: `T${i}` }));
  const league = createLeague(teams);
  const mine = teams[0];
  const rested = mine.stars[4];
  setRest(mine, [rested.id]);
  const view = lineupView(mine, rng);
  league.teams.set('T0', view);
  playChunk(league, rng);
  league.teams.set('T0', mine);
  assert.equal(rested.stats.apps, 0);
  assert.equal(mine.subs.FW1.stats.apps, 14);
  assert.equal(mine.stars[0].stats.apps, 14);
  assert.ok(!isSeasonOver(league));
});

test('컨디션: 뛰면 줄고(14라운드 NORMAL 약 -10), HARD는 더 줄고, 쉬면 35 회복하며 0~100을 지킨다', () => {
  const p = { condition: 100 };
  assert.ok(Math.abs(nextCondition(p, { played: true, rounds: 14, fatigue: 1 }) - 89.8) < 1e-9);
  assert.ok(nextCondition(p, { played: true, rounds: 14, fatigue: 1.4 }) < 84);
  assert.equal(nextCondition({ condition: 50 }, { played: false, rounds: 14, fatigue: 1 }), 85);
  assert.equal(nextCondition({ condition: 90 }, { played: false, rounds: 14, fatigue: 1 }), 100);
  assert.equal(nextCondition({ condition: 3 }, { played: true, rounds: 14, fatigue: 2 }), 0);
});

test('부상: 컨디션이 낮을수록, 강도가 높을수록 자주 다치고 회복 구간은 1~2(재활 시설이 좋으면 1)', () => {
  const rate = (cond, injuryMul = 1, heal = 1) => {
    const rng = createRng(5);
    let n = 0;
    for (let i = 0; i < 4000; i += 1) n += rollInjury({ condition: cond }, rng, { injuryMul, healMultiplier: heal }) ? 1 : 0;
    return n;
  };
  assert.ok(rate(20) > rate(90) * 1.8);
  assert.ok(rate(90, 1.3) > rate(90, 1));
  const p = { condition: 0 };
  const rng = createRng(6);
  while (!rollInjury(p, rng, { injuryMul: 1, healMultiplier: 1.9 })) { /* 다칠 때까지 */ }
  assert.equal(p.injury.chunksLeft, 1);
});

test('사기: 득점·출전은 올리고 벤치·부상·저연봉은 내리며 0~100을 지킨다', () => {
  const team = mk(7);
  pay(team);
  const p = team.stars[0];
  const none = { apps: 0, goals: 0, assists: 0 };
  assert.equal(nextMood(p, { apps: 14, goals: 3, assists: 2 }, { rested: false, wasInjured: false, coachMood: 0 }), 70 + 0.5 + 3 + 1);
  assert.equal(nextMood(p, none, { rested: false, wasInjured: false, coachMood: 0 }), 68);
  assert.equal(nextMood(p, none, { rested: true, wasInjured: false, coachMood: 0 }), 70);
  assert.equal(nextMood(p, none, { rested: false, wasInjured: true, coachMood: 0 }), 69);
  p.contract.salary = 0; // 요구 연봉의 80% 미만
  assert.equal(nextMood(p, none, { rested: true, wasInjured: false, coachMood: 0 }), 69);
  p.mood = 99.9;
  assert.equal(nextMood(p, { apps: 14, goals: 9, assists: 0 }, { rested: false, wasInjured: false, coachMood: 0 }), 100);
  p.mood = 0.2;
  assert.equal(nextMood(p, none, { rested: false, wasInjured: false, coachMood: -5 }), 0);
});

test('chunkStep: 한 구간 뒤 XP·컨디션이 갱신되고 쉬는 지정이 풀리며 다친 선수는 구간마다 회복한다', () => {
  const rng = createRng(8);
  const teams = Array.from({ length: 20 }, (_, i) => createTeam({ rng, id: `T${i}` }));
  const league = createLeague(teams);
  const mine = teams[0];
  pay(mine);
  const club = createClub();
  const injuredStar = mine.stars[1];
  injuredStar.injury = { chunksLeft: 1 };
  const resting = mine.stars[2];
  setRest(mine, [resting.id]);
  const before = snapshotStats(mine);
  league.teams.set('T0', lineupView(mine, rng));
  playChunk(league, rng);
  league.teams.set('T0', mine);
  const summary = chunkStep({ team: mine, before, rng, club, rounds: 14 });
  assert.equal(summary.length, 6);
  assert.ok(summary.every((s) => s.xp > 0));
  assert.equal(resting.resting, false);
  assert.equal(resting.condition, 100);
  assert.equal(injuredStar.injury, undefined);
  assert.equal(injuredStar.condition, 100);
  const played = mine.stars[0];
  assert.ok(played.condition < 100 && played.condition > 80);
});

test('팀 사기는 스타 사기의 평균이고 스타가 없으면 0이다', () => {
  const team = mk(9);
  team.stars.forEach((p, i) => { p.mood = 50 + i * 10; });
  assert.equal(teamMorale(team), 75);
  assert.equal(teamMorale({ stars: [] }), 0);
});
