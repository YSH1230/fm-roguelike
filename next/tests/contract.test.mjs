import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createPlayer } from '../engine/player.mjs';
import { createTeam } from '../engine/team.mjs';
import { setStars } from '../engine/roster.mjs';
import { askingSalary, capRoom, marketValue, newContract, payroll, tickContracts } from '../engine/contract.mjs';

const make = (level, age = 24, seed = 1) => createPlayer({ rng: createRng(seed), id: 'p', position: 'FW', level, age });

test('능력이 높을수록 가치와 요구 연봉이 높다', () => {
  assert.ok(marketValue(make(80)) > marketValue(make(50)));
  assert.ok(askingSalary(make(80)) > askingSalary(make(50)) + 10);
});

test('같은 능력이면 어리고 잠재력 큰 선수가 비싸고, 늙으면 값이 깎인다', () => {
  assert.ok(marketValue(make(60, 19)) > marketValue(make(60, 30)));
  assert.ok(marketValue(make(60, 38)) < marketValue(make(60, 30)));
});

test('요구 연봉은 최소 2, 최대 40이다', () => {
  assert.equal(askingSalary(make(1)), 2);
  assert.ok(askingSalary(make(99, 19)) <= 40);
});

test('연봉 총액은 스타만 센다', () => {
  const team = createTeam({ rng: createRng(2), id: 'A' });
  team.stars.forEach((p, i) => { p.contract = newContract(10 + i); });
  assert.equal(payroll(team), 75);
  assert.equal(capRoom(team, 100), 25);
});

test('tickContracts는 연수를 1 줄이고 만료된 스타를 돌려준다', () => {
  const team = createTeam({ rng: createRng(3), id: 'A' });
  team.stars[0].contract.years = 1;
  const expired = tickContracts(team);
  assert.deepEqual(expired.map((p) => p.id), [team.stars[0].id]);
  assert.equal(team.stars[1].contract.years, 2);
});

test('setStars: 스타를 바꿔도 라인업은 11명이고 골키퍼 1명이며 기존 조연 기록이 남는다', () => {
  const rng = createRng(4);
  const team = createTeam({ rng, id: 'A' });
  const kept = team.lineup[6]; // 수비 조연
  kept.stats.goals = 7;
  // 골키퍼 스타를 빼고 공격수를 넣는다
  const next = [...team.stars.filter((p) => p.position !== 'GK'), createPlayer({ rng, id: 'new', position: 'FW' })];
  setStars(team, rng, next);
  assert.equal(team.lineup.length, 11);
  assert.equal(team.lineup.filter((p) => p.position === 'GK').length, 1);
  assert.ok(team.lineup.includes(kept));
  assert.equal(new Set(team.lineup.map((p) => p.id)).size, 11);
});

test('setStars: 스타가 0명이어도 라인업 11명을 채운다', () => {
  const team = createTeam({ rng: createRng(5), id: 'B' });
  setStars(team, createRng(6), []);
  assert.equal(team.lineup.length, 11);
  assert.equal(team.lineup.filter((p) => p.position === 'GK').length, 1);
});
