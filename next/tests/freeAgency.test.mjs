import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createPlayer } from '../engine/player.mjs';
import { createTeam } from '../engine/team.mjs';
import { newContract } from '../engine/contract.mjs';
import {
  aiSign, evaluateOffer, evaluateResign, generateFreeAgents, releaseToPool, resign, signFreeAgent, toEntry,
} from '../engine/freeAgency.mjs';

const club = (extra = {}) => ({ rank: 1, facility: 10, fans: 100, morale: 100, capRoom: 100, ...extra });
const entry = (conditions = {}, asking = 10) => ({ player: createPlayer({ rng: createRng(1), id: 'fa', position: 'FW' }), conditions, asking });

test('FA 시장은 새 6명 + 풀려난 4명 = 10명이고 풀려난 선수가 5명 이상이어도 4명까지만 받는다', () => {
  const rng = createRng(1);
  const released = Array.from({ length: 6 }, (_, i) => createPlayer({ rng, id: `r${i}`, position: 'DF', age: 29 }));
  const market = generateFreeAgents(rng, { released, prefix: 'FA' });
  assert.equal(market.length, 10);
  assert.equal(market.filter((e) => e.player.id.startsWith('FA')).length, 6);
  assert.equal(market.filter((e) => e.player.id.startsWith('r')).length, 4);
});

test('풀려난 선수가 없으면 새 6명만 나온다', () => {
  assert.equal(generateFreeAgents(createRng(2), { prefix: 'FA' }).length, 6);
});

test('금액이 요구액 이상이고 조건을 채우면 수락한다', () => {
  assert.deepEqual(evaluateOffer(entry(), 10, club()), { accepted: true, reason: null });
});

test('금액이 모자라면 salary, 캡 여유보다 크면 cap으로 거절한다', () => {
  assert.equal(evaluateOffer(entry(), 9, club()).reason, 'salary');
  assert.equal(evaluateOffer(entry(), 50, club({ capRoom: 20 })).reason, 'cap');
});

test('영입 조건(순위·시설·팬·사기) 하나라도 모자라면 이유와 함께 거절한다', () => {
  assert.equal(evaluateOffer(entry({ maxRank: 5 }), 10, club({ rank: 6 })).reason, 'rank');
  assert.equal(evaluateOffer(entry({ minFacility: 4 }), 10, club({ facility: 3 })).reason, 'facility');
  assert.equal(evaluateOffer(entry({ minFans: 30 }), 10, club({ fans: 29 })).reason, 'fans');
  assert.equal(evaluateOffer(entry({ minMorale: 60 }), 10, club({ morale: 59 })).reason, 'morale');
  assert.equal(evaluateOffer(entry({ maxRank: 5 }), 10, club({ rank: 5 })).accepted, true);
});

test('강한 선수일수록 조건이 많다', () => {
  const rng = createRng(3);
  const count = (level) => {
    let n = 0;
    for (let i = 0; i < 200; i += 1) n += Object.keys(toEntry(rng, createPlayer({ rng, id: 'x', position: 'FW', level })).conditions).length;
    return n;
  };
  assert.ok(count(85) > count(35) + 50);
});

test('스타가 5명일 때 영입하면 6명이 되고 계약 3년이 붙고 라인업은 11명이다', () => {
  const rng = createRng(4);
  const team = createTeam({ rng, id: 'A', starPositions: ['GK', 'DF', 'DF', 'MF', 'FW'] });
  const fa = entry({}, 12);
  signFreeAgent(team, rng, fa, 12, club());
  assert.equal(team.stars.length, 6);
  assert.equal(team.lineup.length, 11);
  assert.equal(fa.player.contract.years, 3);
  assert.equal(fa.player.contract.salary, 12);
});

test('스타 6명이 가득하면 영입이 오류이고, 협상이 거절이면 영입이 오류이며 명단은 그대로다', () => {
  const rng = createRng(5);
  const full = createTeam({ rng, id: 'A' });
  assert.throws(() => signFreeAgent(full, rng, entry(), 10, club()), /가득/);
  const open = createTeam({ rng, id: 'B', starPositions: ['GK', 'DF', 'MF', 'FW', 'FW'] });
  assert.throws(() => signFreeAgent(open, rng, entry(), 5, club()), /salary/);
  assert.equal(open.stars.length, 5);
});

test('재계약: 사기가 40 미만이면 어떤 금액이어도 거절한다', () => {
  const p = createPlayer({ rng: createRng(6), id: 'p', position: 'MF', level: 60 });
  p.mood = 39;
  p.contract = newContract(10);
  assert.equal(evaluateResign(p, 99, club({ capRoom: 999 })).reason, 'mood');
});

test('재계약: 사기 80 이상은 요구액의 90%에 응하고, 새 계약은 3년이다', () => {
  const p = createPlayer({ rng: createRng(7), id: 'p', position: 'MF', level: 70 });
  p.contract = { salary: 8, years: 0 };
  p.mood = 85;
  const normal = Math.round(toEntry(createRng(1), p).asking * 0.9);
  assert.equal(evaluateResign(p, normal - 1, club()).reason, 'salary');
  resign(p, normal, club());
  assert.deepEqual(p.contract, { salary: normal, years: 3 });
});

test('재계약: 기존 연봉 몫은 캡 여유로 돌려받아 계산한다', () => {
  const p = createPlayer({ rng: createRng(8), id: 'p', position: 'MF', level: 70 });
  p.contract = { salary: 20, years: 0 };
  p.mood = 70;
  const need = toEntry(createRng(1), p).asking;
  assert.equal(evaluateResign(p, need, club({ capRoom: 0 })).accepted, need <= 20);
});

test('releaseToPool은 스타를 빼서 FA 항목으로 돌려주고 라인업 11명을 유지한다', () => {
  const rng = createRng(9);
  const team = createTeam({ rng, id: 'A' });
  const gone = team.stars[0];
  const back = releaseToPool(team, rng, gone);
  assert.equal(back.player, gone);
  assert.equal(team.stars.length, 5);
  assert.equal(team.lineup.length, 11);
  assert.throws(() => releaseToPool(team, rng, gone), /스타가 아닙니다/);
});

test('aiSign: 남은 FA는 모두 AI 팀에 가고 팀당 이름 있는 선수는 3명까지만 남는다', () => {
  const rng = createRng(10);
  const teams = ['X', 'Y'].map((id) => createTeam({ rng, id }));
  const entries = generateFreeAgents(rng, { prefix: 'FA' });
  const out = aiSign(rng, entries, teams);
  assert.equal(out.length, 6);
  for (const t of teams) assert.ok((t.named ?? []).length <= 3);
});

test('aiSign: FA가 없으면 빈 결과, AI 팀이 없는데 FA가 있으면 오류다', () => {
  assert.deepEqual(aiSign(createRng(1), [], []), []);
  assert.throws(() => aiSign(createRng(1), [entry()], []), /AI 팀이 없습니다/);
});
