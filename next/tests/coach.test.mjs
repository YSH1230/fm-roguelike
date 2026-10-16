import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createTeam } from '../engine/team.mjs';
import { createClub } from '../engine/economy.mjs';
import { overall } from '../engine/player.mjs';
import {
  addCoachXp, coachCost, coachSeasonGrowth, coachXpNeeded, createCoach, evaluateCoachRenewal, generateCoachCandidates,
  hireCoach, renewCoach, setIntensity, syncFillers, tickCoachContract, trainingMultipliers,
} from '../engine/coach.mjs';

const coach = (kind = 'attack', stars = 2, extra = {}) => ({ ...createCoach({ rng: createRng(1), id: 'c', kind, stars }), ...extra });

test('코치 생성: 종류와 별(0.5 단위)을 검사한다', () => {
  assert.throws(() => createCoach({ rng: createRng(1), id: 'c', kind: 'goalie' }), /알 수 없는 코치/);
  assert.throws(() => createCoach({ rng: createRng(1), id: 'c', kind: 'attack', stars: 2.3 }), /0.5 단위/);
  assert.throws(() => createCoach({ rng: createRng(1), id: 'c', kind: 'attack', stars: 6 }), /0.5 단위/);
  const c = createCoach({ rng: createRng(1), id: 'c', kind: 'defense', stars: 3 });
  assert.deepEqual([c.intensity, c.contract.years, c.mood, c.xp], ['NORMAL', 3, 70, 0]);
});

test('코치 비용은 별의 제곱에 비례한다', () => {
  assert.deepEqual([1, 3, 5].map(coachCost), [6, 54, 150]);
});

test('고용 후보 3명은 1~4별이다', () => {
  const list = generateCoachCandidates(createRng(2), { kind: 'attack', prefix: 'K' });
  assert.equal(list.length, 3);
  for (const c of list) assert.ok(c.stars >= 1 && c.stars <= 4);
});

test('훈련 강도: HARD는 XP가 크고 사기·부상이 나쁘고, LIGHT는 반대다. 모르는 강도는 오류', () => {
  const c = coach('attack', 2, { trait: 'motivator' });
  setIntensity(c, 'HARD');
  const hard = trainingMultipliers(c);
  setIntensity(c, 'LIGHT');
  const light = trainingMultipliers(c);
  assert.ok(hard.xp > light.xp && hard.fatigue > light.fatigue && hard.injury > light.injury);
  assert.ok(hard.mood < light.mood);
  assert.throws(() => setIntensity(c, 'EXTREME'), /알 수 없는 훈련 강도/);
  assert.equal(c.intensity, 'LIGHT');
});

test('XP가 차면 별이 반 칸 오르고 남은 XP는 이어진다', () => {
  const c = coach('attack', 2);
  addCoachXp(c, coachXpNeeded(2) + 10);
  assert.equal(c.stars, 2.5);
  assert.equal(c.xp, 10);
  addCoachXp(c, 5000); // 한 번에 여러 칸
  assert.equal(c.stars, 5);
});

test('5별 코치는 더 오르지 않고 XP는 상한에서 멈춘다', () => {
  const c = coach('defense', 5);
  addCoachXp(c, 99999);
  assert.equal(c.stars, 5);
  assert.equal(c.xp, coachXpNeeded(5) - 1);
});

test('시즌 성장: XP를 얻고 한 살 먹으며, 승수가 많고 젊을수록 많이 번다', () => {
  const young = coach('attack', 2, { age: 40, trait: 'motivator' });
  const old = coach('attack', 2, { age: 58, trait: 'motivator' });
  const a = coachSeasonGrowth(young, createRng(3), { wins: 30 });
  const b = coachSeasonGrowth(old, createRng(3), { wins: 5 });
  assert.ok(a > b);
  assert.equal(young.age, 41);
});

test('고용: 비용을 내고 팀 코치가 바뀌며 조연 능력이 같이 오른다(기록은 유지)', () => {
  const rng = createRng(4);
  const team = createTeam({ rng, id: 'A', attackStars: 2, defenseStars: 2 });
  team.coaches.attack = coach('attack', 2);
  team.coaches.defense = coach('defense', 2);
  const filler = team.lineup[8];
  filler.stats.goals = 3;
  const before = overall(filler);
  const club = createClub({ coins: 100 });
  const previous = hireCoach(club, team, coach('attack', 4, { id: 'new' }));
  assert.equal(previous.stars, 2);
  assert.equal(team.coaches.attack.id, 'new');
  assert.equal(club.coins, 100 - 96);
  assert.ok(overall(filler) > before + 7); // 별 +2 -> 조연 수준 +8(공격·수비 평균이라 +8)
  assert.equal(filler.stats.goals, 3);
});

test('고용: 코인이 모자라면 코치도 조연도 그대로다', () => {
  const rng = createRng(5);
  const team = createTeam({ rng, id: 'A' });
  team.coaches.attack = coach('attack', 3, { id: 'old' });
  const snapshot = overall(team.lineup[8]);
  const club = createClub({ coins: 10 });
  assert.throws(() => hireCoach(club, team, coach('attack', 5)), /모자랍니다/);
  assert.equal(team.coaches.attack.id, 'old');
  assert.equal(overall(team.lineup[8]), snapshot);
  assert.equal(club.coins, 10);
});

test('코치가 XP로 별이 오른 뒤 syncFillers를 부르면 조연이 따라 올라가고, 두 번 불러도 한 번만 반영된다', () => {
  const rng = createRng(6);
  const team = createTeam({ rng, id: 'A', attackStars: 2, defenseStars: 2 });
  team.coaches.attack = coach('attack', 2);
  team.coaches.defense = coach('defense', 2);
  const filler = team.lineup[9];
  const before = overall(filler);
  addCoachXp(team.coaches.attack, coachXpNeeded(2));
  syncFillers(team);
  const once = overall(filler);
  syncFillers(team);
  assert.ok(once > before);
  assert.equal(overall(filler), once);
});

test('계약: 3년에서 시작해 해마다 줄고 0이 되면 만료, 재계약하면 다시 3년', () => {
  const c = coach();
  assert.equal(tickCoachContract(c), false);
  assert.equal(tickCoachContract(c), false);
  assert.equal(tickCoachContract(c), true);
  const club = createClub({ coins: 50 });
  renewCoach(club, c);
  assert.equal(c.contract.years, 3);
  assert.equal(club.coins, 50 - coachCost(2));
});

test('재계약: 사기 40 미만이면 거절하고 코인은 그대로, 코인이 모자라도 오류다', () => {
  const c = coach('attack', 2, { mood: 39 });
  assert.equal(evaluateCoachRenewal(c).reason, 'mood');
  const club = createClub({ coins: 100 });
  assert.throws(() => renewCoach(club, c), /mood/);
  assert.equal(club.coins, 100);
  assert.throws(() => renewCoach(createClub({ coins: 1 }), coach()), /모자랍니다/);
});
