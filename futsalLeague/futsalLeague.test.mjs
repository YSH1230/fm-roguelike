import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../next/engine/rng.mjs';
import {
  buildSchedule,
  computeTable,
  createTeams,
  divisionGroupOf,
  finishSeason,
  createSeason,
  seedConference,
  segmentOfRound,
  simulateSeason,
} from './futsalLeague.mjs';

const flat = (rounds) => rounds.flat();
const sameDiv = (a, b) => divisionGroupOf(a) === divisionGroupOf(b);
const sameConf = (a, b) => a >> 3 === b >> 3;

test('일정: 22 라운드, 매 라운드 8경기, 16팀 전원이 한 번씩 뛴다', () => {
  const rounds = buildSchedule(0);
  assert.equal(rounds.length, 22);
  for (const r of rounds) {
    assert.equal(r.length, 8);
    const ids = r.flatMap((m) => [m.home, m.away]).sort((a, b) => a - b);
    assert.deepEqual(ids, Array.from({ length: 16 }, (_, i) => i));
  }
});

test('일정: 팀당 22경기, 홈 11 / 원정 11, 상대 구성은 세 묶음이 정확히 맞다', () => {
  const matches = flat(buildSchedule(0));
  for (let id = 0; id < 16; id++) {
    const mine = matches.filter((m) => m.home === id || m.away === id);
    assert.equal(mine.length, 22, `team ${id} games`);
    assert.equal(mine.filter((m) => m.home === id).length, 11, `team ${id} home`);
    const count = new Map();
    for (const m of mine) {
      const opp = m.home === id ? m.away : m.home;
      count.set(opp, (count.get(opp) ?? 0) + 1);
    }
    for (let opp = 0; opp < 16; opp++) {
      if (opp === id) continue;
      const want = sameDiv(id, opp) ? 2 : sameConf(id, opp) ? 2 : 1;
      assert.equal(count.get(opp), want, `team ${id} vs ${opp}`);
    }
  }
});

test('일정: 같은 디비전은 홈 1 / 원정 1, 같은 컨퍼런스 다른 디비전은 홈 4 / 원정 4', () => {
  const matches = flat(buildSchedule(0));
  for (let id = 0; id < 16; id++) {
    const sd = matches.filter((m) => (m.home === id || m.away === id) && sameDiv(m.home, m.away));
    assert.equal(sd.filter((m) => m.home === id).length, 3);
    const od = matches.filter(
      (m) => (m.home === id || m.away === id) && sameConf(m.home, m.away) && !sameDiv(m.home, m.away),
    );
    assert.equal(od.length, 8);
    assert.equal(od.filter((m) => m.home === id).length, 4);
    const cross = matches.filter((m) => (m.home === id || m.away === id) && !sameConf(m.home, m.away));
    assert.equal(cross.filter((m) => m.home === id).length, 4);
  }
});

test('관리 구간 7 / 7 / 8, 구간 3은 같은 디비전 6경기 + 다른 컨퍼런스 2경기', () => {
  const rounds = buildSchedule(0);
  const segCount = [0, 0, 0, 0];
  rounds.forEach((_, r) => { segCount[segmentOfRound(r)]++; });
  assert.deepEqual(segCount.slice(1), [7, 7, 8]);
  for (let id = 0; id < 16; id++) {
    const seg3 = rounds.flat().filter((m) => m.segment === 3 && (m.home === id || m.away === id));
    assert.equal(seg3.filter((m) => sameDiv(m.home, m.away)).length, 6, `team ${id} div`);
    assert.equal(seg3.filter((m) => !sameConf(m.home, m.away)).length, 2, `team ${id} cross`);
  }
});

test('홀수 시즌은 홈과 원정이 뒤집힌다', () => {
  const even = flat(buildSchedule(0));
  const odd = flat(buildSchedule(1));
  assert.equal(odd.length, even.length);
  even.forEach((m, i) => {
    assert.equal(odd[i].home, m.away);
    assert.equal(odd[i].away, m.home);
  });
});

test('순위표: 승점 동률은 승자승, 그다음 득실차, 다득점, 추첨', () => {
  const key = [0, 0, 0, 0, 0.9, 0.1];
  // 0과 1 모두 3점. 1이 0을 이겼으므로 승자승으로 1이 위.
  const h2h = [
    { home: 1, away: 0, hg: 2, ag: 0 },
    { home: 0, away: 1, hg: 1, ag: 0 },
  ];
  assert.deepEqual(computeTable([0, 1], h2h, key).map((s) => s.id), [1, 0]);
  // 0과 1이 완전히 같은 기록이면 추첨 키가 낮은 쪽(5)이 위
  const drawn = [{ home: 4, away: 5, hg: 1, ag: 1 }];
  assert.deepEqual(computeTable([4, 5], drawn, key).map((s) => s.id), [5, 4]);
});

test('컨퍼런스 시드: 디비전 우승 2팀이 1·2, 나머지 승점 상위 2팀이 3·4', () => {
  // 컨퍼런스 순위: 10, 1, 0, 11, 2, 3, 12, 13
  const conf = [10, 1, 0, 11, 2, 3, 12, 13].map((id) => ({ id }));
  // 북부 우승 1, 남부 우승 11
  const seeds = seedConference(conf, [[{ id: 1 }], [{ id: 11 }]]);
  assert.deepEqual(seeds, [1, 11, 10, 0]);
});

test('시즌 시뮬: 플레이오프 대진 1v4, 2v3, 결승 3판, 챔피언결정전', () => {
  const rng = createRng(7);
  const teams = createTeams(rng);
  const season = createSeason({ teams, seasonIndex: 0, rng });
  finishSeason(season);
  assert.equal(season.results.length, 176);
  const po = season.playoffs;
  for (const c of po.conferences) {
    const [s1, s2, s3, s4] = c.seeds;
    assert.equal(c.semis.length, 2);
    assert.deepEqual([c.semis[0].a, c.semis[0].b], [s1, s4]);
    assert.deepEqual([c.semis[1].a, c.semis[1].b], [s2, s3]);
    assert.equal(c.final.games.length >= 2 && c.final.games.length <= 3, true);
    // 결승은 준결승 승자끼리
    const finalists = new Set(c.final.games.flatMap((g) => [g.home, g.away]));
    assert.deepEqual([...finalists].sort(), c.semis.map((s) => s.winner).sort());
  }
  const metroChamp = po.conferences[0].champion;
  const doewonChamp = po.conferences[1].champion;
  const cf = po.title.games.flatMap((g) => [g.home, g.away]);
  assert.ok(cf.includes(metroChamp) && cf.includes(doewonChamp));
  assert.ok([metroChamp, doewonChamp].includes(po.champion));
});

test('100 시즌 평균 득점 (팀당 경기당)', () => {
  let goals = 0;
  let games = 0;
  for (let s = 0; s < 100; s++) {
    const rng = createRng(1000 + s);
    const teams = createTeams(rng);
    const { season } = simulateSeason({ teams, seasonIndex: s, rng });
    for (const m of season.results) {
      goals += m.hg + m.ag;
      games += 2;
    }
  }
  const avg = goals / games;
  console.log(`100 시즌 팀당 경기당 평균 득점: ${avg.toFixed(3)}`);
  assert.ok(avg > 2.3 && avg < 2.7, `avg ${avg}`);
});
