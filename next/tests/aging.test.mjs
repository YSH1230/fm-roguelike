import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createPlayer, overall } from '../engine/player.mjs';
import { createTeam } from '../engine/team.mjs';
import { ageUp, declineAmount, endOfSeason, evaluateRetireOffer, retire, retirementChance } from '../engine/aging.mjs';

const player = (age, seed = 1) => createPlayer({ rng: createRng(seed), id: 'p', position: 'MF', age, level: 70 });

test('하락량: 32세까지 0, 33~35세 1, 36세 이상 2', () => {
  assert.deepEqual([32, 33, 35, 36, 40].map(declineAmount), [0, 1, 1, 2, 2]);
});

test('32세 이하는 한 살만 먹고 능력이 그대로이며, 33세가 되면 능력이 줄고 성장 여지가 0이 된다', () => {
  const young = player(25);
  const before = { ...young.attrs };
  ageUp(young, createRng(2));
  assert.equal(young.age, 26);
  assert.deepEqual(young.attrs, before);
  const vet = player(32);
  const was = overall(vet);
  ageUp(vet, createRng(3));
  assert.equal(vet.age, 33);
  assert.ok(overall(vet) < was);
  assert.equal(vet.potential, Math.round(overall(vet)));
});

test('능력은 1 아래로 내려가지 않는다', () => {
  const p = player(36);
  for (const k of Object.keys(p.attrs)) p.attrs[k] = 1;
  ageUp(p, createRng(4));
  for (const v of Object.values(p.attrs)) assert.equal(v, 1);
});

test('은퇴 확률은 나이에 따라 오르고 40세는 강제다', () => {
  const chances = [32, 33, 35, 37, 39, 40, 45].map(retirementChance);
  assert.deepEqual(chances, [0, 0.05, 0.2, 0.45, 0.8, 1, 1]);
});

test('은퇴 제안: 33세 미만 거절, 33~37세는 사기에 따라, 38세부터 수락', () => {
  const p = player(30);
  assert.deepEqual(evaluateRetireOffer(p), { accepted: false, reason: 'young' });
  const old = player(35);
  old.mood = 65;
  assert.equal(evaluateRetireOffer(old).accepted, true);
  old.mood = 66;
  assert.deepEqual(evaluateRetireOffer(old), { accepted: false, reason: 'mood' });
  const ancient = player(38);
  ancient.mood = 100;
  assert.equal(evaluateRetireOffer(ancient).accepted, true);
});

test('retire: 스타에서 빠지고 라인업은 11명을 유지한다. 남의 선수는 오류', () => {
  const rng = createRng(5);
  const team = createTeam({ rng, id: 'A' });
  const gone = team.stars[3];
  assert.equal(retire(team, rng, gone), gone);
  assert.equal(team.stars.length, 5);
  assert.equal(team.lineup.length, 11);
  assert.throws(() => retire(team, rng, gone), /스타가 아닙니다/);
});

test('시즌 종료: 전원 한 살, 컨디션 100, 부상 완치, 사기는 70 쪽으로 회복한다', () => {
  const rng = createRng(6);
  const team = createTeam({ rng, id: 'A' });
  const p = team.stars[0];
  p.condition = 20;
  p.injury = { chunksLeft: 2 };
  p.mood = 20;
  const age = p.age;
  endOfSeason(team, rng);
  assert.equal(p.age, age + 1);
  assert.equal(p.condition, 100);
  assert.equal(p.injury, undefined);
  assert.equal(p.mood, 30);
});

test('시즌 종료: 40세는 반드시 은퇴하고 명단과 라인업이 정리된다. 젊은 팀은 아무도 은퇴하지 않는다', () => {
  const rng = createRng(1);
  const team = createTeam({ rng, id: 'A' });
  assert.deepEqual(endOfSeason(team, rng), []);
  const old = team.stars[0];
  old.age = 39; // 이번 시즌 종료로 40세
  const retired = endOfSeason(team, rng);
  assert.ok(retired.includes(old));
  assert.ok(!team.stars.includes(old));
  assert.equal(team.stars.length, 6 - retired.length);
  assert.equal(team.lineup.length, 11);
});
