import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createPlayer, overall } from '../engine/player.mjs';
import { createTeam } from '../engine/team.mjs';
import { createClub } from '../engine/economy.mjs';
import { createCoach, setIntensity } from '../engine/coach.mjs';
import { addXp, ageXpFactor, chunkXp, coachMul, hasRoom, spendPoint, xpNeeded } from '../engine/growth.mjs';

const young = (seed = 1, level = 50) => createPlayer({ rng: createRng(seed), id: 'p', position: 'FW', age: 19, level });
const zero = { apps: 0, goals: 0, assists: 0 };

test('필요 XP는 레벨마다 늘고, 어릴수록 효율이 좋다', () => {
  assert.deepEqual([1, 2, 5].map(xpNeeded), [18, 21, 30]);
  assert.ok(ageXpFactor(19) > ageXpFactor(24) && ageXpFactor(24) > ageXpFactor(28));
  assert.ok(ageXpFactor(28) > ageXpFactor(31) && ageXpFactor(31) > ageXpFactor(35));
});

test('레벨업하면 레벨이 오르고 남은 XP가 이어지며 포인트가 레벨마다 1개씩 쌓인다', () => {
  const p = young();
  p.caps = Object.fromEntries(Object.keys(p.attrs).map((k) => [k, 90]));
  const before = { ...p.attrs };
  assert.equal(addXp(p, 18 + 21 + 7), 2);
  assert.equal(p.xpLevel, 3);
  assert.equal(p.xp, 7);
  assert.equal(p.points, 2);
  assert.deepEqual(p.attrs, before); // 능력치는 포인트를 쓸 때만 오른다
});

test('XP가 부족하면 레벨도 포인트도 그대로다', () => {
  const p = young();
  assert.equal(addXp(p, 17), 0);
  assert.equal(p.xpLevel, 1);
  assert.equal(p.points ?? 0, 0);
});

test('포인트로 능력치를 +1 올리고, 천장에 닿으면 올릴 수 없다', () => {
  const p = young();
  const key = Object.keys(p.attrs)[0];
  p.caps = Object.fromEntries(Object.keys(p.attrs).map((k) => [k, p.attrs[k] + 1]));
  p.points = 2;
  const v = p.attrs[key];
  spendPoint(p, key);
  assert.equal(p.attrs[key], v + 1);
  assert.equal(p.points, 1);
  assert.throws(() => spendPoint(p, key), /천장/);
  assert.throws(() => spendPoint({ ...p, points: 0 }, Object.keys(p.attrs)[1]), /포인트/);
});

test('모든 능력치가 천장이면 레벨은 올라도 포인트는 쌓이지 않는다', () => {
  const p = young();
  p.caps = { ...p.attrs };
  addXp(p, 500);
  assert.ok(p.xpLevel > 1);
  assert.equal(p.points ?? 0, 0);
  assert.equal(hasRoom(p), false);
});

test('능력은 99를 넘지 않는다', () => {
  const p = young(5, 98);
  p.potential = 99;
  for (let i = 0; i < 50; i += 1) addXp(p, 100, createRng(i));
  for (const v of Object.values(p.attrs)) assert.ok(v <= 99);
});

test('구간 XP: 득점·도움·출전이 많을수록, 훈련 시설이 높을수록 많다', () => {
  const team = createTeam({ rng: createRng(6), id: 'A' });
  const p = young();
  const club = createClub();
  const idle = chunkXp(p, zero, { team, club });
  const active = chunkXp(p, { apps: 14, goals: 5, assists: 3 }, { team, club });
  assert.equal(idle, 6 * 1.3);
  assert.ok(active > idle + 15);
  club.facilities.training = 10;
  assert.ok(chunkXp(p, zero, { team, club }) > idle * 1.5);
});

test('코치 훈련 강도가 XP 배율에 반영되고, 별만 있는 단순 코치는 배율 1이다', () => {
  const team = createTeam({ rng: createRng(7), id: 'A' });
  assert.equal(coachMul(team, 'FW', 'xp'), 1);
  assert.equal(coachMul(team, 'FW', 'mood'), 0);
  const c = createCoach({ rng: createRng(7), id: 'c', kind: 'attack', stars: 3 });
  c.trait = 'motivator';
  setIntensity(c, 'HARD');
  team.coaches.attack = c;
  assert.equal(coachMul(team, 'FW', 'xp'), 1.25);
  assert.equal(coachMul(team, 'DF', 'xp'), 1); // 수비수는 수비 코치(단순 코치)
  assert.equal(coachMul(team, 'MF', 'xp'), (1.25 + 1) / 2);
});
