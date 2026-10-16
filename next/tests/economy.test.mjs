import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createTeam } from '../engine/team.mjs';
import { newContract } from '../engine/contract.mjs';
import { evaluateOffer } from '../engine/freeAgency.mjs';
import {
  capExpandCost, chunkIncome, createClub, earn, expandCap, facilityEffects, fansAfterChunk, negotiationClub,
  salaryCap, seasonPrize, spend, upgradeCost, upgradeFacility,
} from '../engine/economy.mjs';

test('코인이 모자라면 지출이 오류이고 코인은 그대로다', () => {
  const club = createClub({ coins: 5 });
  assert.throws(() => spend(club, 6), /모자랍니다/);
  assert.equal(club.coins, 5);
  spend(club, 5);
  assert.equal(club.coins, 0);
});

test('음수 수입·지출은 오류다', () => {
  const club = createClub();
  assert.throws(() => earn(club, -1), /0 이상/);
  assert.throws(() => spend(club, -1), /0 이상/);
});

test('시설은 1단계에서 시작하고, 올릴수록 비싸진다(5, 10, 17, 26, ...)', () => {
  const club = createClub({ coins: 100 });
  assert.equal(upgradeCost(club, 'stadium'), 5);
  upgradeFacility(club, 'stadium');
  assert.equal(club.facilities.stadium, 2);
  assert.equal(club.coins, 95);
  assert.equal(upgradeCost(club, 'stadium'), 10);
  upgradeFacility(club, 'stadium');
  assert.equal(upgradeCost(club, 'stadium'), 17);
  upgradeFacility(club, 'stadium');
  assert.equal(upgradeCost(club, 'stadium'), 26);
});

test('코인이 모자라면 시설이 그대로이고, 10단계를 넘길 수 없다', () => {
  const poor = createClub({ coins: 4 });
  assert.throws(() => upgradeFacility(poor, 'rehab'), /모자랍니다/);
  assert.equal(poor.facilities.rehab, 1);
  const rich = createClub({ coins: 99999 });
  for (let i = 0; i < 9; i += 1) upgradeFacility(rich, 'training');
  assert.equal(rich.facilities.training, 10);
  assert.throws(() => upgradeFacility(rich, 'training'), /최고 단계/);
  assert.throws(() => upgradeFacility(rich, 'nope'), /알 수 없는 시설/);
});

test('캡 확장: 1회 +10, 비용 100부터 20씩 늘고, 5회까지', () => {
  const club = createClub({ coins: 99999 });
  assert.equal(salaryCap(club, 3), 100);
  assert.equal(capExpandCost(club), 100);
  expandCap(club);
  assert.equal(capExpandCost(club), 120);
  club.capLevel = 0;
  club.coins = 99999;
  for (let i = 0; i < 5; i += 1) expandCap(club);
  assert.equal(salaryCap(club, 3), 150);
  assert.equal(salaryCap(club, 1), 250);
  assert.throws(() => expandCap(club), /더 늘릴 수 없/);
  assert.throws(() => salaryCap(club, 4), /알 수 없는 리그/);
});

const result = (homeId, awayId, homeGoals, awayGoals) => ({ homeId, awayId, homeGoals, awayGoals });

test('수입: 승리는 리그 단계 수입, 무승부·패배는 0, 남의 경기는 무시한다', () => {
  const club = createClub({ fans: 0 }); // 팬 수입 0으로 만든다
  const results = [result('A', 'B', 2, 0), result('B', 'A', 1, 1), result('A', 'B', 0, 3), result('B', 'A', 0, 1), result('C', 'D', 5, 0)];
  assert.deepEqual(chunkIncome(results, 'A', club, 3), { win: 12, fan: 0, total: 12 });
  assert.equal(chunkIncome(results, 'A', club, 1).win, 28);
});

test('수입: 팬 수입은 홈경기에서만 나오고 경기장 단계와 팬 지수에 비례한다', () => {
  const home = Array.from({ length: 10 }, () => result('A', 'B', 0, 0));
  const away = Array.from({ length: 10 }, () => result('B', 'A', 0, 0));
  const club = createClub({ fans: 50 });
  club.facilities.stadium = 4;
  assert.equal(chunkIncome(home, 'A', club, 3).fan, 40); // 10경기 x 4 x 0.5 x 2
  assert.equal(chunkIncome(away, 'A', club, 3).fan, 0);
});

test('팬 지수: 이기면 오르고 지면 내리며 0~100을 벗어나지 않는다', () => {
  const wins = Array.from({ length: 14 }, () => result('A', 'B', 1, 0));
  const losses = Array.from({ length: 14 }, () => result('A', 'B', 0, 1));
  assert.ok(Math.abs(fansAfterChunk(50, wins, 'A') - 54.2) < 1e-9);
  assert.ok(Math.abs(fansAfterChunk(50, losses, 'A') - 45.8) < 1e-9);
  assert.equal(fansAfterChunk(99.9, wins, 'A'), 100);
  assert.equal(fansAfterChunk(0.1, losses, 'A'), 0);
  assert.equal(fansAfterChunk(50, [result('A', 'B', 2, 2)], 'A'), 50);
});

test('우승 상금은 우승했을 때만, 리그 단계별로 나온다', () => {
  assert.equal(seasonPrize(3, true), 50);
  assert.equal(seasonPrize(1, true), 200);
  assert.equal(seasonPrize(1, false), 0);
});

test('시설 효과: 1단계는 기본 배율, 단계가 오를수록 커진다', () => {
  const club = createClub();
  assert.deepEqual(facilityEffects(club), { xpMultiplier: 1, healMultiplier: 1 });
  club.facilities.training = 10;
  assert.ok(Math.abs(facilityEffects(club).xpMultiplier - 1.72) < 1e-9);
});

test('협상용 club: 시설 평균(내림), 캡 여유가 계획 2의 evaluateOffer에 그대로 들어간다', () => {
  const rng = createRng(1);
  const team = createTeam({ rng, id: 'A' });
  team.stars.forEach((p) => { p.contract = newContract(10); });
  const club = createClub({ fans: 33.4 });
  club.facilities = { stadium: 5, training: 4, rehab: 2 };
  const view = negotiationClub(club, { rank: 7, morale: 60, team, tier: 3 });
  assert.deepEqual(view, { rank: 7, facility: 3, fans: 33, morale: 60, capRoom: 40 });
  const entry = { player: team.stars[0], conditions: { minFacility: 4 }, asking: 10 };
  assert.equal(evaluateOffer(entry, 10, view).reason, 'facility');
});
