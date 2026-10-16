import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createTeam } from '../engine/team.mjs';
import { applyMatchStats, expectedGoals, simulateMatch } from '../engine/match.mjs';

test('공격력=수비력이면 기대 득점은 1.3이다', () => {
  assert.equal(Math.round(expectedGoals(50, 50) * 100) / 100, 1.3);
});

test('공격이 강할수록, 상대 수비가 약할수록 기대 득점이 커진다', () => {
  assert.ok(expectedGoals(80, 40) > expectedGoals(50, 50));
  assert.ok(expectedGoals(40, 80) < expectedGoals(50, 50));
});

test('팀 생성: 스타 6명과 라인업 11명, 조연은 코치 수준을 따른다', () => {
  const rng = createRng(1);
  const strong = createTeam({ rng, id: 'A', attackStars: 5, defenseStars: 5 });
  const weak = createTeam({ rng, id: 'B', attackStars: 1, defenseStars: 1 });
  assert.equal(strong.stars.length, 6);
  assert.equal(strong.lineup.length, 11);
  const fillerAvg = (t) => t.lineup.slice(6).reduce((s, p) => s + Object.values(p.attrs).reduce((a, b) => a + b, 0) / 4, 0) / 5;
  assert.ok(fillerAvg(strong) > fillerAvg(weak) + 15);
});

test('같은 시드면 같은 경기 결과가 나온다', () => {
  const make = () => {
    const rng = createRng(10);
    const home = createTeam({ rng, id: 'H' });
    const away = createTeam({ rng, id: 'A' });
    return simulateMatch(home, away, rng);
  };
  assert.deepEqual(make(), make());
});

test('이벤트 수는 득점 수와 같고, 도움은 득점자와 다른 선수다', () => {
  const rng = createRng(21);
  const home = createTeam({ rng, id: 'H' });
  const away = createTeam({ rng, id: 'A' });
  for (let i = 0; i < 50; i += 1) {
    const r = simulateMatch(home, away, rng);
    assert.equal(r.events.length, r.homeGoals + r.awayGoals);
    for (const e of r.events) assert.notEqual(e.assistId, e.scorerId);
  }
});

test('강팀이 약팀을 상대로 더 자주 이기고 더 많이 넣는다', () => {
  const rng = createRng(33);
  const strong = createTeam({ rng, id: 'S', attackStars: 5, defenseStars: 5, starLevel: 85 });
  const weak = createTeam({ rng, id: 'W', attackStars: 1, defenseStars: 1, starLevel: 40 });
  let strongWins = 0;
  let weakWins = 0;
  let strongGoals = 0;
  let weakGoals = 0;
  for (let i = 0; i < 300; i += 1) {
    const r = simulateMatch(strong, weak, rng);
    strongGoals += r.homeGoals;
    weakGoals += r.awayGoals;
    if (r.homeGoals > r.awayGoals) strongWins += 1;
    else if (r.homeGoals < r.awayGoals) weakWins += 1;
  }
  assert.ok(strongWins > weakWins * 3);
  assert.ok(strongGoals > weakGoals * 2);
});

test('득점은 공격수에게 가장 많이 돌아간다', () => {
  const rng = createRng(44);
  const home = createTeam({ rng, id: 'H', attackStars: 4, defenseStars: 4, starLevel: 70 });
  const away = createTeam({ rng, id: 'A', attackStars: 4, defenseStars: 4, starLevel: 70 });
  for (let i = 0; i < 400; i += 1) applyMatchStats(home, away, simulateMatch(home, away, rng));
  const byPos = { FW: 0, MF: 0, DF: 0, GK: 0 };
  for (const p of home.lineup) byPos[p.position] += p.stats.goals;
  assert.ok(byPos.FW > byPos.MF);
  assert.ok(byPos.MF > byPos.DF);
  assert.ok(byPos.DF >= byPos.GK);
});

test('applyMatchStats는 출전·득점·도움을 누적한다', () => {
  const rng = createRng(55);
  const home = createTeam({ rng, id: 'H' });
  const away = createTeam({ rng, id: 'A' });
  const result = simulateMatch(home, away, rng);
  applyMatchStats(home, away, result);
  assert.equal(home.lineup[0].stats.apps, 1);
  const goals = [...home.lineup, ...away.lineup].reduce((s, p) => s + p.stats.goals, 0);
  assert.equal(goals, result.homeGoals + result.awayGoals);
});

test('스타에 골키퍼가 없어도 라인업에 골키퍼가 정확히 1명 있다', () => {
  const rng = createRng(61);
  const team = createTeam({ rng, id: 'X', starPositions: ['DF', 'DF', 'MF', 'MF', 'FW', 'FW'] });
  assert.equal(team.lineup.length, 11);
  assert.equal(team.lineup.filter((p) => p.position === 'GK').length, 1);
});

test('스타 6명이 전부 같은 포지션이어도 라인업은 11명이고 골키퍼가 있다', () => {
  const rng = createRng(62);
  const team = createTeam({ rng, id: 'Y', starPositions: ['FW', 'FW', 'FW', 'FW', 'FW', 'FW'] });
  assert.equal(team.lineup.length, 11);
  assert.equal(team.lineup.filter((p) => p.position === 'GK').length, 1);
  assert.ok(team.lineup.filter((p) => p.position === 'DF').length >= 3);
});
