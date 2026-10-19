import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../next/engine/rng.mjs';
import {
  buildSchedule,
  computeTable,
  conferenceOf,
  createSeason,
  createTeams,
  divisionGroupOf,
  finishSeason,
  matchStrength,
  runPlayoffs,
  seedConference,
  segmentOfRound,
  leagueBaseline,
  makePlayer,
  simulateRegulation,
  simulateSeason,
  AGE_RATIO,
  STAR_LEVELS,
  STAR_WEIGHTS,
  squadSnapshot,
  stepRound,
} from './futsalLeague.mjs';

const SEASONS = 500;
const sameDiv = (a, b) => divisionGroupOf(a) === divisionGroupOf(b);
const sameConf = (a, b) => conferenceOf(a) === conferenceOf(b);
const flat = (rounds) => rounds.flat();

function poissonPmf(k, lambda) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

// ── 일정 ─────────────────────────────────────────────

test(`일정 불변식 (시즌 ${SEASONS}회)`, () => {
  for (let s = 0; s < SEASONS; s++) {
    const rounds = buildSchedule(s);
    assert.equal(rounds.length, 22);
    for (const r of rounds) {
      assert.equal(r.length, 8);
      const ids = r.flatMap((m) => [m.home, m.away]).sort((a, b) => a - b);
      assert.deepEqual(ids, Array.from({ length: 16 }, (_, i) => i));
    }
    const matches = flat(rounds);
    for (let id = 0; id < 16; id++) {
      const mine = matches.filter((m) => m.home === id || m.away === id);
      assert.equal(mine.length, 22, `season ${s} team ${id} games`);
      assert.equal(mine.filter((m) => m.home === id).length, 11, `season ${s} team ${id} home`);
      const count = new Map();
      for (const m of mine) {
        const opp = m.home === id ? m.away : m.home;
        count.set(opp, (count.get(opp) ?? 0) + 1);
      }
      for (let opp = 0; opp < 16; opp++) {
        if (opp === id) continue;
        assert.equal(count.get(opp), sameConf(id, opp) ? 2 : 1, `season ${s} ${id} vs ${opp}`);
      }
      const sd = mine.filter((m) => sameDiv(m.home, m.away));
      assert.equal(sd.filter((m) => m.home === id).length, 3);
      const od = mine.filter((m) => sameConf(m.home, m.away) && !sameDiv(m.home, m.away));
      assert.equal(od.filter((m) => m.home === id).length, 4);
      const cross = mine.filter((m) => !sameConf(m.home, m.away));
      assert.equal(cross.filter((m) => m.home === id).length, 4);
    }
  }
});

test('일정: 홀수 시즌은 다른 컨퍼런스 경기만 홈/원정이 뒤집힌다', () => {
  const even = flat(buildSchedule(0));
  const odd = flat(buildSchedule(1));
  even.forEach((m, i) => {
    const o = odd[i];
    if (sameConf(m.home, m.away)) {
      assert.equal(o.home, m.home, `same-conf kept ${i}`);
      assert.equal(o.away, m.away, `same-conf kept ${i}`);
    } else {
      assert.equal(o.home, m.away, `cross flipped ${i}`);
      assert.equal(o.away, m.home, `cross flipped ${i}`);
    }
  });
});

test('일정: 관리 구간 7 / 7 / 8, 구간 3은 같은 디비전 6경기 + 다른 컨퍼런스 2경기', () => {
  const rounds = buildSchedule(0);
  const segCount = [0, 0, 0];
  rounds.forEach((_, r) => { segCount[segmentOfRound(r) - 1]++; });
  assert.deepEqual(segCount, [7, 7, 8]);
  for (let id = 0; id < 16; id++) {
    const seg3 = flat(rounds).filter((m) => m.segment === 3 && (m.home === id || m.away === id));
    assert.equal(seg3.filter((m) => sameDiv(m.home, m.away)).length, 6, `team ${id} div`);
    assert.equal(seg3.filter((m) => !sameConf(m.home, m.away)).length, 2, `team ${id} cross`);
  }
});

// ── 순위표 ───────────────────────────────────────────

test('순위표: 두 팀 동점이면 맞대결 승점이 득실차보다 먼저', () => {
  const key = [0, 0];
  // 0과 1 모두 3점. 맞대결은 1이 이김(2:0), 0이 이김(1:0) → 1승 1승, 맞대결 승점 3:3.
  // 득실차: 1 = +1, 0 = -1 → 맞대결이 같으면 득실차로 1이 위.
  const tie = [
    { home: 1, away: 0, hg: 2, ag: 0 },
    { home: 0, away: 1, hg: 1, ag: 0 },
  ];
  assert.deepEqual(computeTable([0, 1], tie, key).map((s) => s.id), [1, 0]);
  // 맞대결 승점이 다르면 득실차와 무관하게 맞대결 승자가 위.
  // 0: 1에게 1:0 승, 2에게 0:5 패 → 3점, 득실 -4
  // 1: 0에게 0:1 패, 2에게 6:0 승 → 3점, 득실 +6 (맞대결 승점은 0:3)
  const h2hDecides = [
    { home: 0, away: 1, hg: 1, ag: 0 },
    { home: 2, away: 0, hg: 5, ag: 0 },
    { home: 1, away: 2, hg: 6, ag: 0 },
  ];
  const t = computeTable([0, 1], h2hDecides, [0, 0]);
  assert.deepEqual(t.map((s) => s.id), [0, 1], 'h2h 승점이 득실차보다 먼저');
});

test('순위표: 세 팀 이상 동점이면 맞대결을 보지 않고 득실차부터', () => {
  // 0, 1, 2가 모두 3점. 맞대결은 순환 (0>1, 1>2, 2>0), 득실차는 2 > 1 > 0.
  const results = [
    { home: 0, away: 1, hg: 1, ag: 0 },
    { home: 1, away: 2, hg: 1, ag: 0 },
    { home: 2, away: 0, hg: 1, ag: 0 },
    { home: 3, away: 0, hg: 0, ag: 4 }, // 0 가 4실점 (gd 0: 1-0 +... 아래 검증은 gd 순서만)
    { home: 3, away: 1, hg: 0, ag: 1 },
    { home: 3, away: 2, hg: 0, ag: 3 },
  ];
  const t = computeTable([0, 1, 2], results, [0, 0, 0, 0]);
  const gd = t.map((s) => s.gd);
  assert.deepEqual(gd, [...gd].sort((a, b) => b - a), `gd order ${gd}`);
});

test('순위표: 완전 동률은 추첨 키가 낮은 쪽이 위', () => {
  const drawn = [{ home: 4, away: 5, hg: 1, ag: 1 }];
  assert.deepEqual(computeTable([4, 5], drawn, [0, 0, 0, 0, 0.9, 0.1]).map((s) => s.id), [5, 4]);
});

test('컨퍼런스 시드: 디비전 우승 2팀이 1·2, 나머지 승점 상위 2팀이 3·4', () => {
  // 컨퍼런스 순위: 10, 1, 0, 11, 2, 3, 12, 13
  const conf = [10, 1, 0, 11, 2, 3, 12, 13].map((id) => ({ id }));
  const seeds = seedConference(conf, [[{ id: 1 }], [{ id: 11 }]]);
  assert.deepEqual(seeds, [1, 11, 10, 0]);
});

// ── 플레이오프 ───────────────────────────────────────

test(`플레이오프 불변식 (시즌 ${SEASONS}회)`, () => {
  for (let s = 0; s < SEASONS; s++) {
    const rng = createRng(50000 + s);
    const season = createSeason({ teams: createTeams(rng), seasonIndex: s, rng });
    finishSeason(season);
    const po = season.playoffs;
    const confChampions = [];
    po.conferences.forEach((c, ci) => {
      const [s1, s2, s3, s4] = c.seeds;
      assert.equal(new Set(c.seeds).size, 4);
      assert.ok(c.seeds.every((id) => conferenceOf(id) === ci));
      assert.deepEqual([c.semis[0].a, c.semis[0].b], [s1, s4], 'semi 1 vs 4');
      assert.deepEqual([c.semis[1].a, c.semis[1].b], [s2, s3], 'semi 2 vs 3');
      const finalists = c.semis.map((m) => m.winner).sort((a, b) => a - b);
      const playedFinal = [...new Set(c.final.games.flatMap((g) => [g.home, g.away]))].sort((a, b) => a - b);
      assert.deepEqual(playedFinal, finalists, 'final = semi winners');
      assert.ok(c.final.games.length >= 2 && c.final.games.length <= 3, 'series length');
      assert.equal(c.final.games.filter((g) => g.winner === c.champion).length, 2, 'champion won 2');
      assert.ok(c.final.games.every((g) => g.neutral === false), 'conf final not neutral');
      confChampions.push(c.champion);
    });
    const t = po.title;
    assert.ok(t.games.length >= 2 && t.games.length <= 3, 'title length');
    assert.ok(t.games.every((g) => g.neutral === true), 'championship neutral');
    assert.deepEqual(
      [...new Set(t.games.flatMap((g) => [g.home, g.away]))].sort((a, b) => a - b),
      [...confChampions].sort((a, b) => a - b),
      'title = conference champions',
    );
    assert.ok(confChampions.includes(po.champion));
  }
});

test('플레이오프 결승: 높은 시드가 1, 3경기 홈', () => {
  for (let s = 0; s < 100; s++) {
    const rng = createRng(90000 + s);
    const season = createSeason({ teams: createTeams(rng), seasonIndex: s, rng });
    finishSeason(season);
    for (const c of season.playoffs.conferences) {
      const higher = [c.final.games[0].home, c.final.games[0].away].sort(
        (a, b) => c.seeds.indexOf(a) - c.seeds.indexOf(b),
      )[0];
      c.final.games.forEach((g, i) => {
        if (i === 0 || i === 2) assert.equal(g.home, higher, `game ${i + 1} home is higher seed`);
      });
    }
  }
});

// ── 통계 ─────────────────────────────────────────────

test('득점 평균 2.5 ± 0.1 (정규시간, 팀당 경기당)', () => {
  let goals = 0;
  let n = 0;
  for (let s = 0; s < SEASONS; s++) {
    const rng = createRng(7000 + s);
    const teams = createTeams(rng);
    for (const m of flat(buildSchedule(s))) {
      const sim = simulateRegulation(teams[m.home], teams[m.away], rng);
      goals += sim.hg + sim.ag;
      n += 2;
    }
  }
  const avg = goals / n;
  console.log(`팀당 경기당 평균 득점: ${avg.toFixed(3)}`);
  assert.ok(Math.abs(avg - 2.5) <= 0.1, `avg ${avg}`);
});

test('푸아송 적합: 경기별 기대득점 기준 χ² (df=7, 5% 임계 14.07)와 분산 지수 0.97~1.03', () => {
  const obs = new Array(8).fill(0);
  const exp = new Array(8).fill(0);
  let res2 = 0;
  let sumLambda = 0;
  for (let s = 0; s < SEASONS; s++) {
    const rng = createRng(31000 + s);
    const teams = createTeams(rng);
    for (const m of flat(buildSchedule(s))) {
      const sim = simulateRegulation(teams[m.home], teams[m.away], rng);
      for (const [k, lam] of [[sim.hg, sim.lh], [sim.ag, sim.la]]) {
        obs[Math.min(k, 7)]++;
        let cum = 0;
        for (let j = 0; j < 7; j++) {
          const p = poissonPmf(j, lam);
          exp[j] += p;
          cum += p;
        }
        exp[7] += 1 - cum;
        res2 += (k - lam) ** 2;
        sumLambda += lam;
      }
    }
  }
  let chi2 = 0;
  for (let j = 0; j < 8; j++) chi2 += (obs[j] - exp[j]) ** 2 / exp[j];
  const dispersion = res2 / sumLambda;
  console.log(`χ²=${chi2.toFixed(2)} (df=7), 분산 지수=${dispersion.toFixed(4)}`);
  assert.ok(chi2 < 14.07, `chi2 ${chi2}`);
  assert.ok(dispersion >= 0.97 && dispersion <= 1.03, `dispersion ${dispersion}`);
});

test('강도 순위와 평균 승점 순위 스피어만 상관 0.9 이상', () => {
  // 팀은 한 번만 만들고 시즌 500회 동안 같은 팀으로 돌린다.
  const teams = createTeams(createRng(1));
  const power = teams.map((t) => {
    const st = matchStrength(squadSnapshot(t));
    return st.attack + st.defense + st.gkRating;
  });
  const pts = new Array(16).fill(0);
  for (let s = 0; s < SEASONS; s++) {
    const rng = createRng(60000 + s);
    const { standings: st } = simulateSeason({ teams, seasonIndex: s, rng });
    for (const table of st.conf) for (const row of table) pts[row.id] += row.pts / SEASONS;
  }
  const rank = (arr) => {
    const order = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(arr.length);
    order.forEach(([, i], k) => { r[i] = k + 1; });
    return r;
  };
  const rp = rank(power);
  const rq = rank(pts);
  const d2 = rp.reduce((sum, v, i) => sum + (v - rq[i]) ** 2, 0);
  const rho = 1 - (6 * d2) / (16 * (16 * 16 - 1));
  console.log(`강도 순위와 평균 승점 순위 스피어만 상관: ${rho.toFixed(3)}`);
  assert.ok(rho >= 0.9, `rho ${rho}`);
});

test('정규시간 동점 16~21%, 플레이오프 승부차기 8~12%', () => {
  let draws = 0;
  let regular = 0;
  let shootouts = 0;
  let knockout = 0;
  for (let s = 0; s < SEASONS; s++) {
    const rng = createRng(120000 + s);
    const season = createSeason({ teams: createTeams(rng), seasonIndex: s, rng });
    while (season.nextRound < season.rounds.length) {
      for (const m of stepRound(season)) {
        regular++;
        if (m.hg === m.ag) draws++;
      }
    }
    runPlayoffs(season);
    const games = [
      ...season.playoffs.conferences.flatMap((c) => [...c.semis, ...c.final.games]),
      ...season.playoffs.title.games,
    ];
    for (const g of games) {
      knockout++;
      if (g.shootout) shootouts++;
    }
  }
  const drawRate = draws / regular;
  const soRate = shootouts / knockout;
  console.log(`정규시간 동점 ${(drawRate * 100).toFixed(1)}%, 플레이오프 승부차기 ${(soRate * 100).toFixed(1)}%`);
  assert.ok(drawRate >= 0.16 && drawRate <= 0.21, `draw ${drawRate}`);
  assert.ok(soRate >= 0.08 && soRate <= 0.12, `shootout ${soRate}`);
});
