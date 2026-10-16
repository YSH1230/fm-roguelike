import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createTeam } from '../engine/team.mjs';
import { createLeague, generateFixtures, isSeasonOver, playChunk, standings, topScorers } from '../engine/league.mjs';

const ids = Array.from({ length: 20 }, (_, i) => `T${i}`);

test('20팀이면 38라운드, 라운드마다 10경기다', () => {
  const fixtures = generateFixtures(ids);
  assert.equal(fixtures.length, 38);
  for (const round of fixtures) assert.equal(round.length, 10);
});

test('모든 팀이 라운드마다 정확히 한 번 경기한다', () => {
  for (const round of generateFixtures(ids)) {
    const seen = round.flat();
    assert.equal(new Set(seen).size, 20);
  }
});

test('모든 순서쌍(홈, 원정)이 정확히 한 번씩 나온다', () => {
  const seen = new Set();
  for (const round of generateFixtures(ids)) {
    for (const [h, a] of round) {
      const key = `${h}>${a}`;
      assert.ok(!seen.has(key), `중복 경기 ${key}`);
      seen.add(key);
    }
  }
  assert.equal(seen.size, 20 * 19);
});

test('팀마다 홈 19경기, 원정 19경기다', () => {
  const home = new Map(ids.map((id) => [id, 0]));
  for (const round of generateFixtures(ids)) for (const [h] of round) home.set(h, home.get(h) + 1);
  for (const count of home.values()) assert.equal(count, 19);
});

function makeLeague(seed) {
  const rng = createRng(seed);
  const teams = ids.map((id, i) => createTeam({
    rng,
    id,
    attackStars: 1 + (i % 5),
    defenseStars: 1 + ((i * 2) % 5),
    starLevel: 40 + i * 2,
  }));
  return { league: createLeague(teams), rng };
}

test('구간은 14/14/10라운드로 끊어 진행하고 세 번이면 시즌이 끝난다', () => {
  const { league, rng } = makeLeague(1);
  assert.equal(playChunk(league, rng).length, 14 * 10);
  assert.equal(playChunk(league, rng).length, 14 * 10);
  assert.equal(isSeasonOver(league), false);
  assert.equal(playChunk(league, rng).length, 10 * 10);
  assert.equal(isSeasonOver(league), true);
  assert.throws(() => playChunk(league, rng), /끝났/);
});

test('시즌이 끝나면 팀마다 38경기를 했고 승점 합계가 일치한다', () => {
  const { league, rng } = makeLeague(2);
  while (!isSeasonOver(league)) playChunk(league, rng);
  const table = standings(league);
  let points = 0;
  let draws = 0;
  for (const row of table) {
    assert.equal(row.played, 38);
    assert.equal(row.won + row.drawn + row.lost, 38);
    points += row.points;
    draws += row.drawn;
  }
  assert.equal(points, 380 * 3 - draws / 2); // 무승부 한 경기는 두 팀의 drawn에 각각 잡힌다
});

test('순위표는 승점 내림차순이다', () => {
  const { league, rng } = makeLeague(3);
  while (!isSeasonOver(league)) playChunk(league, rng);
  const table = standings(league);
  for (let i = 1; i < table.length; i += 1) assert.ok(table[i - 1].points >= table[i].points);
});

test('경기당 평균 득점은 현실적인 범위다(2.0~3.2골)', () => {
  const { league, rng } = makeLeague(4);
  while (!isSeasonOver(league)) playChunk(league, rng);
  const goals = standings(league).reduce((s, r) => s + r.gf, 0);
  const perMatch = goals / 380;
  assert.ok(perMatch > 2.0 && perMatch < 3.2, `경기당 ${perMatch}골`);
});

test('전력이 높은 팀 5개가 낮은 팀 5개보다 승점이 확실히 높다', () => {
  for (const seed of [5, 6, 7]) {
    const { league, rng } = makeLeague(seed);
    while (!isSeasonOver(league)) playChunk(league, rng);
    const table = standings(league);
    const strongest = ['T19', 'T18', 'T17', 'T14', 'T13'];
    const weakest = ['T0', 'T1', 'T2', 'T5', 'T6'];
    const avgPoints = (list) => list.reduce((s, id) => s + table.find((r) => r.id === id).points, 0) / list.length;
    assert.ok(avgPoints(strongest) > avgPoints(weakest) + 10, `seed ${seed}`);
  }
});

test('득점왕은 득점이 가장 많은 선수다', () => {
  const { league, rng } = makeLeague(8);
  while (!isSeasonOver(league)) playChunk(league, rng);
  const top = topScorers(league, 3);
  assert.equal(top.length, 3);
  assert.ok(top[0].goals >= top[1].goals && top[1].goals >= top[2].goals);
  assert.ok(top[0].goals >= 5);
});

test('팀 수가 홀수이거나 팀 id가 중복이면 일정 생성이 실패한다', () => {
  assert.throws(() => generateFixtures(['A', 'B', 'C']), /짝수/);
  assert.throws(() => generateFixtures(['A', 'B', 'A', 'C']), /중복/);
});
