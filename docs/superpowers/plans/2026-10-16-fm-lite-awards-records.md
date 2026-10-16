# FM-Lite 상·기록 구현 계획 (계획 6/8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시즌 기록실(시즌·통산·수상), 시상(발롱도르 포함 6개 상), 역대 우승팀, 트로피 진열대, 은퇴식, 명예의 전당, 커리어 점수를 화면 없는 엔진으로 만들고 테스트로 고정한다.

**Architecture:** 모든 것이 `history` 객체 하나에 쌓인다. 시즌이 끝나면 (1) 리그 종료 시점과 챔피언스리그 종료 시점에 `collectStats`를 두 번 찍고, (2) `buildRows`가 선수별 리그 기록·챔피언스리그 기록·팀 성적을 한 줄로 합치고, (3) `computeAwards`가 상을 정하고, (4) `recordSeason` `recordChampions` `recordMyTeam`이 기록한다. 이 순서는 선수 시즌 기록을 0으로 돌리는 계획 5의 `startNextSeason` 앞에서 끝나야 한다.

**Tech Stack:** 순수 ES 모듈(`.mjs`), Node 내장 테스트러너, 외부 의존성 0, 빌드 없음.

**Spec:** `docs/superpowers/specs/2026-10-16-fm-lite-next-design.md` (10절 기록과 명예, 10.5절 종료 정산, 13절 미정 항목)

## Global Constraints

- 새 파일은 `next/` 아래에만 만든다. 기존 게임은 건드리지 않는다. 앞선 계획의 파일 중 고치는 것은 `constants.mjs`(추가만)뿐이다.
- 엔진에서 `Math.random`, `document`, `window`, `localStorage`를 쓰지 않는다. 같은 입력이면 같은 수상자가 나와야 하므로 동점은 선수 id 순으로 정한다.
- 주석과 사용자에게 보이는 문구는 한국어, 문구에 em 대시를 쓰지 않는다.
- 기록 대상은 모든 팀의 스타(내 선수와 이름 있는 AI 선수)이고 조연은 올리지 않는다.
- 수상 후보는 38경기 중 19경기 이상 뛴 선수만이다. 내 리그 상(시즌 MVP, 골든부트, 도움왕, 골든글러브, 올해의 영건)은 내 리그 선수만, 발롱도르는 전 세계 선수가 대상이며 챔피언스리그 활약을 반영한다.
- 상 이름과 목록, 커리어 점수식은 사용자가 추후 수정하는 초기값이며 `constants.mjs`(`AWARDS` `CAREER_SCORE`) 한 곳에서만 정의한다.
- 명예의 전당은 은퇴한 선수 중 사용자가 직접 지정한다(영구결번 번호 처리 없음).

## Review Focus

1. **후보가 한 명도 없는 상(21세 이하 선수 없음, 골키퍼 없음, 경기 수 미달)**: 오류 없이 `null`을 돌려준다 (Task 2).
2. **동점 수상자, 같은 선수가 여러 상 수상**: 매번 같은 선수가 뽑히고 상이 모두 쌓인다 (Task 2).
3. **챔피언스리그를 치르지 않은 시즌, 기록이 없는 선수의 은퇴**: 오류 없이 빈 값으로 정리된다 (Task 1, 3).
4. **은퇴하지 않은 선수나 이미 올린 선수를 명예의 전당에 지정**: 명확한 오류여야 한다 (Task 3).
5. **1부에 올랐다가 강등된 커리어의 최고 리그, 시즌을 하나도 안 치른 커리어의 점수**: 최고 리그는 내려가지 않고 점수는 0이다 (Task 3).

---

### Task 1: 상수와 기록 수집·시즌 기록

**Files:**
- Modify: `next/engine/constants.mjs` (맨 아래에 추가)
- Create: `next/engine/records.mjs`
- Test: `next/tests/records.test.mjs`

**Interfaces:**
- Consumes: 계획 1 `overall`, 계획 5 `allTeams`(테스트는 `makeWorld` `playFullSeason`)
- Produces: `collectStats(world) -> Map(id -> 한 줄)`, `diffStats(after, before)`, `createHistory()`, `playerRecord(history, row)`, `recordSeason(history, { year, leagueStats, clStats, myTeamId })`. 상수 `AWARD_MIN_APPS` `AWARD_TIER_WEIGHT` `YOUNG_MAX_AGE` `AWARDS` `CAREER_SCORE`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/records.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectStats, createHistory, diffStats, recordSeason } from '../engine/records.mjs';
import { allTeams } from '../engine/world.mjs';
import { makeWorld, playFullSeason } from './helpers.mjs';

const row = (id, apps, goals, assists, extra = {}) => ({ id, teamId: 'T', tier: 1, region: 0, position: 'FW', age: 25, overall: 70, apps, goals, assists, ...extra });

test('기록 대상은 모든 팀의 스타 1200명이고 조연은 빠진다', () => {
  const { world } = makeWorld(1);
  const stats = collectStats(world);
  assert.equal(stats.size, 200 * 6);
  const filler = allTeams(world)[0].lineup[8];
  assert.ok(!stats.has(filler.id));
});

test('diffStats: 증가분을 구하고 없던 선수는 그대로 둔다', () => {
  const before = new Map([['a', row('a', 10, 3, 1)]]);
  const after = new Map([['a', row('a', 16, 5, 1)], ['b', row('b', 4, 2, 0)]]);
  const d = diffStats(after, before);
  assert.deepEqual([d.get('a').apps, d.get('a').goals, d.get('a').assists], [6, 2, 0]);
  assert.deepEqual([d.get('b').apps, d.get('b').goals], [4, 2]);
});

test('recordSeason: 시즌 줄과 통산이 쌓이고 뛰지 않은 선수는 건너뛴다', () => {
  const h = createHistory();
  const league = new Map([['a', row('a', 30, 10, 4)], ['idle', row('idle', 0, 0, 0)]]);
  const cl = new Map([['a', row('a', 8, 3, 2)]]);
  recordSeason(h, { year: 1, leagueStats: league, clStats: cl, myTeamId: 'T' });
  recordSeason(h, { year: 2, leagueStats: new Map([['a', row('a', 20, 5, 5)]]), myTeamId: 'T' });
  const a = h.players.get('a');
  assert.equal(a.seasons.length, 2);
  assert.deepEqual(a.career, { apps: 58, goals: 18, assists: 11 });
  assert.equal(a.seasons[0].clGoals, 3);
  assert.equal(a.mine, true);
  assert.ok(!h.players.has('idle'));
});

test('내 팀이 아닌 선수는 mine이 아니다', () => {
  const h = createHistory();
  recordSeason(h, { year: 1, leagueStats: new Map([['x', row('x', 5, 1, 0, { teamId: 'OTHER' })]]), myTeamId: 'T' });
  assert.equal(h.players.get('x').mine, false);
});

test('실제 시즌을 돌린 뒤 기록하면 득점 합계가 선수 기록과 일치한다', () => {
  const { world, rng } = makeWorld(2);
  playFullSeason(world, rng);
  const stats = collectStats(world);
  const h = createHistory();
  recordSeason(h, { year: 1, leagueStats: stats, myTeamId: 'ME' });
  const total = [...h.players.values()].reduce((s, p) => s + p.career.goals, 0);
  assert.equal(total, [...stats.values()].reduce((s, r) => s + r.goals, 0));
  assert.ok(total > 1000);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/records.test.mjs`
Expected: FAIL (`Cannot find module '../engine/records.mjs'`)

- [ ] **Step 3: 상수 추가**

`next/engine/constants.mjs` 맨 아래에 붙인다

```js
// ---- 계획 6: 상·기록 ----
export const AWARD_MIN_APPS = 19; // 시즌 38경기의 절반 이상 뛴 선수만 수상 후보
export const AWARD_TIER_WEIGHT = { 1: 1, 2: 0.85, 3: 0.7 }; // 발롱도르에서 리그 단계별 가중
export const YOUNG_MAX_AGE = 21;
// 상 이름과 목록은 추후 사용자가 수정한다(키는 엔진 안에서만 쓴다).
export const AWARDS = [
  { key: 'ballonDor', label: '발롱도르' },
  { key: 'mvp', label: '시즌 MVP' },
  { key: 'goldenBoot', label: '골든부트' },
  { key: 'assistKing', label: '도움왕' },
  { key: 'goldenGlove', label: '골든글러브' },
  { key: 'youngStar', label: '올해의 영건' },
];
// 커리어 점수(초기값, 사용자가 추후 수정): 도달한 최고 리그, 우승 횟수, 수상, 명예의 전당, 시즌 수
export const CAREER_SCORE = {
  bestTier: { 1: 100, 2: 40, 3: 0 }, leagueTitle: 30, clTitle: 100, award: 5, hallOfFame: 20, season: 5,
};
```

- [ ] **Step 4: 구현** — `next/engine/records.mjs`

```js
import { overall } from './player.mjs';
import { allTeams } from './world.mjs';

// 기록 대상은 모든 팀의 스타(내 선수 + 이름 있는 AI 선수)다. 조연은 기록실에 올리지 않는다.
export function collectStats(world) {
  const out = new Map();
  for (const team of allTeams(world)) {
    for (const p of team.stars) {
      out.set(p.id, {
        id: p.id, teamId: team.id, region: team.region, tier: team.tier, position: p.position, age: p.age,
        overall: overall(p), apps: p.stats.apps, goals: p.stats.goals, assists: p.stats.assists,
      });
    }
  }
  return out;
}

// after - before (없던 선수는 after 그대로)
export function diffStats(after, before) {
  const out = new Map();
  for (const [id, a] of after) {
    const b = before.get(id) ?? { apps: 0, goals: 0, assists: 0 };
    out.set(id, { ...a, apps: a.apps - b.apps, goals: a.goals - b.goals, assists: a.assists - b.assists });
  }
  return out;
}

export const createHistory = () => ({
  players: new Map(), // id -> { id, position, mine, career: { apps, goals, assists }, seasons: [], awards: [] }
  champions: [], // 시즌별 각 리그·챔피언스리그 우승팀과 주요 선수
  mySeasons: [], // 내 팀의 시즌 결과
  trophies: [], // 내 트로피 진열대
  retired: [],
  hallOfFame: [],
  bestTier: 3,
});

export function playerRecord(history, row) {
  if (!history.players.has(row.id)) {
    history.players.set(row.id, { id: row.id, position: row.position, mine: false, career: { apps: 0, goals: 0, assists: 0 }, seasons: [], awards: [] });
  }
  return history.players.get(row.id);
}

// 시즌이 끝날 때(선수 시즌 기록이 0으로 돌아가기 전에) 한 번 부른다.
// leagueStats: 리그 종료 시점의 collectStats, clStats: 챔피언스리그만의 증가분(diffStats), 안 나갔으면 빈 Map.
export function recordSeason(history, { year, leagueStats, clStats = new Map(), myTeamId }) {
  for (const [id, l] of leagueStats) {
    const c = clStats.get(id) ?? { apps: 0, goals: 0, assists: 0 };
    if (l.apps + c.apps === 0) continue;
    const rec = playerRecord(history, l);
    if (l.teamId === myTeamId) rec.mine = true;
    rec.seasons.push({
      year, teamId: l.teamId, tier: l.tier, apps: l.apps, goals: l.goals, assists: l.assists,
      clApps: c.apps, clGoals: c.goals, clAssists: c.assists,
    });
    rec.career.apps += l.apps + c.apps;
    rec.career.goals += l.goals + c.goals;
    rec.career.assists += l.assists + c.assists;
  }
}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test next/tests/records.test.mjs`
Expected: PASS (5 tests). 이어서 `node --test next/tests/*.test.mjs`로 앞선 테스트도 그대로 통과하는지 확인한다(172개).

- [ ] **Step 6: 커밋**

```bash
git add next/engine/constants.mjs next/engine/records.mjs next/tests/records.test.mjs
git commit -m "feat(next): 기록 수집과 시즌·통산 기록실"
```


---

### Task 2: 시상(6개 상)

**Files:**
- Create: `next/engine/awards.mjs`
- Test: `next/tests/awards.test.mjs`

**Interfaces:**
- Consumes: Task 1 `playerRecord`, 계획 5 `standings`(계획 1) `allTeams` `leagueKey` `playChampions`(테스트)
- Produces: `buildRows(world, leagueStats, afterStats) -> 후보 줄[]`, `computeAwards(rows, { myLeagueKey, cl }) -> { ballonDor, mvp, goldenBoot, assistKing, goldenGlove, youngStar }`(없으면 각각 null), `giveAwards(history, awards, year, world)`. 수상은 `{ key, playerId, teamId, value }`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/awards.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, collectStats } from '../engine/records.mjs';
import { buildRows, computeAwards, giveAwards } from '../engine/awards.mjs';
import { playChampions } from '../engine/champions.mjs';
import { allTeams } from '../engine/world.mjs';
import { makeWorld, playFullSeason } from './helpers.mjs';

const row = (id, o = {}) => ({
  id, teamId: `T-${id}`, region: 0, tier: 1, position: 'FW', age: 25, overall: 70,
  league: { apps: 30, goals: 0, assists: 0 }, cl: { apps: 0, goals: 0, assists: 0 },
  team: { rank: 5, points: 50, ga: 40 }, ...o,
});
const KEY = '0:1';

test('골든부트는 득점 최다, 동점이면 도움이 많은 선수, 그래도 같으면 id 순이다', () => {
  const rows = [row('b', { league: { apps: 30, goals: 20, assists: 3 } }), row('a', { league: { apps: 30, goals: 20, assists: 3 } }), row('c', { league: { apps: 30, goals: 20, assists: 9 } })];
  assert.equal(computeAwards(rows, { myLeagueKey: KEY }).goldenBoot.playerId, 'c');
  assert.equal(computeAwards(rows.slice(0, 2), { myLeagueKey: KEY }).goldenBoot.playerId, 'a');
});

test('도움왕은 도움 최다다', () => {
  const rows = [row('a', { league: { apps: 30, goals: 30, assists: 2 } }), row('b', { league: { apps: 30, goals: 1, assists: 15 } })];
  assert.equal(computeAwards(rows, { myLeagueKey: KEY }).assistKing.playerId, 'b');
});

test('경기 수가 19 미만인 선수는 어떤 상도 받지 못한다', () => {
  const rows = [row('a', { league: { apps: 18, goals: 40, assists: 40 } }), row('b', { league: { apps: 19, goals: 1, assists: 0 } })];
  const aw = computeAwards(rows, { myLeagueKey: KEY });
  assert.equal(aw.goldenBoot.playerId, 'b');
  assert.equal(aw.mvp.playerId, 'b');
  assert.equal(aw.ballonDor.playerId, 'b');
});

test('후보가 아무도 없으면 상은 null이다', () => {
  const aw = computeAwards([row('a', { league: { apps: 3, goals: 9, assists: 0 } })], { myLeagueKey: KEY });
  assert.deepEqual(Object.values(aw), [null, null, null, null, null, null]);
  assert.deepEqual(Object.values(computeAwards([], { myLeagueKey: KEY })), [null, null, null, null, null, null]);
});

test('골든글러브는 골키퍼만, 실점이 가장 적은 팀의 골키퍼가 받는다', () => {
  const rows = [
    row('fw', { league: { apps: 30, goals: 30, assists: 0 }, team: { rank: 1, points: 90, ga: 10 } }),
    row('gk1', { position: 'GK', team: { rank: 3, points: 70, ga: 30 } }),
    row('gk2', { position: 'GK', team: { rank: 8, points: 50, ga: 25 } }),
  ];
  assert.equal(computeAwards(rows, { myLeagueKey: KEY }).goldenGlove.playerId, 'gk2');
  assert.equal(computeAwards([rows[0]], { myLeagueKey: KEY }).goldenGlove, null);
});

test('올해의 영건은 21세 이하 중 점수가 가장 높은 선수다', () => {
  const rows = [row('old', { league: { apps: 30, goals: 30, assists: 0 } }), row('kid', { age: 21 }), row('kid2', { age: 22, league: { apps: 30, goals: 50, assists: 0 } })];
  assert.equal(computeAwards(rows, { myLeagueKey: KEY }).youngStar.playerId, 'kid');
});

test('내 리그 상은 내 리그 선수만 받고, 발롱도르는 다른 지역 선수도 받는다', () => {
  const rows = [
    row('mine', { league: { apps: 30, goals: 10, assists: 0 } }),
    row('abroad', { region: 3, league: { apps: 30, goals: 25, assists: 0 } }),
  ];
  const aw = computeAwards(rows, { myLeagueKey: KEY });
  assert.equal(aw.goldenBoot.playerId, 'mine');
  assert.equal(aw.ballonDor.playerId, 'abroad');
});

test('발롱도르: 같은 기록이면 1부가 3부보다 앞서고, 챔피언스리그 우승팀 선수가 가산을 받는다', () => {
  const base = { league: { apps: 30, goals: 15, assists: 5 } };
  const rows = [row('t3', { ...base, tier: 3 }), row('t1', { ...base, tier: 1 })];
  assert.equal(computeAwards(rows, { myLeagueKey: KEY }).ballonDor.playerId, 't1');
  const champ = [row('x', { ...base, teamId: 'CHAMP' }), row('y', { league: { apps: 30, goals: 17, assists: 5 }, teamId: 'OTHER' })];
  assert.equal(computeAwards(champ, { myLeagueKey: KEY, cl: { champion: 'CHAMP', runnerUp: 'Z' } }).ballonDor.playerId, 'x');
  assert.equal(computeAwards(champ, { myLeagueKey: KEY }).ballonDor.playerId, 'y');
});

test('실제 시즌: 상 6개가 모두 정해지고 수상자는 후보 조건을 지키며, 기록실과 선수 카드에 올라간다', () => {
  const { world, rng, me } = makeWorld(3);
  me.stars[4].age = 20; // 처음 만든 세계에는 21세 이하가 없어 영건 후보를 하나 둔다
  playFullSeason(world, rng);
  const leagueStats = collectStats(world);
  const cl = playChampions(world, rng);
  const rows = buildRows(world, leagueStats, collectStats(world));
  const aw = computeAwards(rows, { myLeagueKey: '0:3', cl });
  for (const a of Object.values(aw)) assert.ok(a, '모든 상에 수상자가 있어야 한다');
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const key of ['mvp', 'goldenBoot', 'assistKing', 'goldenGlove', 'youngStar']) {
    const r = byId.get(aw[key].playerId);
    assert.equal(`${r.region}:${r.tier}`, '0:3');
    assert.ok(r.league.apps >= 19);
  }
  assert.equal(byId.get(aw.goldenGlove.playerId).position, 'GK');
  assert.ok(byId.get(aw.youngStar.playerId).age <= 21);
  const h = createHistory();
  giveAwards(h, aw, 1, world);
  assert.equal(h.players.get(aw.mvp.playerId).awards.some((x) => x.key === 'mvp'), true);
  const winner = allTeams(world).flatMap((t) => t.stars).find((p) => p.id === aw.mvp.playerId);
  assert.equal(winner.awards.some((x) => x.key === 'mvp'), true);
});

test('giveAwards: null 수상은 건너뛰고 한 선수가 여러 상을 받으면 모두 쌓인다', () => {
  const { world } = makeWorld(4);
  const star = allTeams(world)[0].stars[0];
  const h = createHistory();
  giveAwards(h, { mvp: { key: 'mvp', playerId: star.id }, goldenBoot: { key: 'goldenBoot', playerId: star.id }, youngStar: null }, 2, world);
  assert.deepEqual(star.awards.map((a) => a.key), ['mvp', 'goldenBoot']);
  assert.equal(h.players.get(star.id).awards.length, 2);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/awards.test.mjs`
Expected: FAIL (`Cannot find module '../engine/awards.mjs'`)

- [ ] **Step 3: 구현** — `next/engine/awards.mjs`

```js
import { AWARD_MIN_APPS, AWARD_TIER_WEIGHT, YOUNG_MAX_AGE } from './constants.mjs';
import { standings } from './league.mjs';
import { playerRecord } from './records.mjs';
import { allTeams, leagueKey } from './world.mjs';

// 시상 후보 한 줄: 선수의 리그 기록, 챔피언스리그 기록, 소속 팀의 리그 성적.
// 반드시 startNextSeason(승강 반영) 전에 만든다. 그 뒤에는 team.tier가 바뀐다.
// leagueStats: 챔피언스리그 직전 collectStats, afterStats: 챔피언스리그 직후 collectStats(안 치렀으면 leagueStats와 같게)
export function buildRows(world, leagueStats, afterStats = leagueStats) {
  const table = new Map();
  for (const [key, league] of world.leagues) {
    standings(league).forEach((r, i) => table.set(`${key}/${r.id}`, { rank: i + 1, points: r.points, ga: r.ga }));
  }
  const teams = new Map(allTeams(world).map((t) => [t.id, t]));
  const rows = [];
  for (const [id, l] of leagueStats) {
    const a = afterStats.get(id) ?? l;
    const team = teams.get(l.teamId);
    rows.push({
      id, teamId: l.teamId, region: l.region, tier: l.tier, position: l.position, age: l.age, overall: l.overall,
      league: { apps: l.apps, goals: l.goals, assists: l.assists },
      cl: { apps: a.apps - l.apps, goals: a.goals - l.goals, assists: a.assists - l.assists },
      team: table.get(`${leagueKey(team.region, team.tier)}/${l.teamId}`),
    });
  }
  return rows;
}

// 점수가 가장 높은 선수. 동점은 선수 id 순으로 정해서 결과가 흔들리지 않는다.
function best(rows, score, key) {
  let top = null;
  for (const r of rows) {
    const s = score(r);
    if (top === null || s > top.value || (s === top.value && r.id < top.playerId)) top = { key, playerId: r.id, teamId: r.teamId, value: s };
  }
  return top;
}

const eligible = (r) => r.league.apps >= AWARD_MIN_APPS;
const mvpScore = (r) => r.league.goals * 3 + r.league.assists * 2 + r.team.points * 0.4 + r.overall * 0.3;

// 시상: 내 리그 상(MVP, 골든부트, 도움왕, 골든글러브, 올해의 영건)과 전 세계 대상 발롱도르.
// 후보가 없는 상은 null. cl: playChampions 결과(없으면 생략).
export function computeAwards(rows, { myLeagueKey, cl } = {}) {
  const mine = rows.filter((r) => leagueKey(r.region, r.tier) === myLeagueKey && eligible(r));
  const goalkeepers = mine.filter((r) => r.position === 'GK');
  const ballon = (r) => (r.league.goals * 3 + r.league.assists * 2 + r.team.points * 0.4) * AWARD_TIER_WEIGHT[r.tier]
    + r.cl.goals * 2 + r.cl.assists
    + (cl && r.teamId === cl.champion ? 15 : (cl && r.teamId === cl.runnerUp ? 8 : 0));
  return {
    ballonDor: best(rows.filter(eligible), ballon, 'ballonDor'),
    mvp: best(mine, mvpScore, 'mvp'),
    goldenBoot: best(mine, (r) => r.league.goals + r.league.assists / 1000, 'goldenBoot'),
    assistKing: best(mine, (r) => r.league.assists + r.league.goals / 1000, 'assistKing'),
    goldenGlove: best(goalkeepers, (r) => -r.team.ga + r.overall / 1000, 'goldenGlove'),
    youngStar: best(mine.filter((r) => r.age <= YOUNG_MAX_AGE), mvpScore, 'youngStar'),
  };
}

// 수상을 기록실과 선수 카드(메달 줄)에 올린다. 수상자가 없으면(null) 건너뛴다.
export function giveAwards(history, awards, year, world) {
  const byId = new Map(allTeams(world).flatMap((t) => t.stars.map((p) => [p.id, p])));
  for (const award of Object.values(awards)) {
    if (!award) continue;
    const rec = playerRecord(history, { id: award.playerId, position: byId.get(award.playerId)?.position });
    rec.awards.push({ year, key: award.key });
    const p = byId.get(award.playerId);
    if (p) (p.awards ??= []).push({ year, key: award.key });
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test next/tests/awards.test.mjs`
Expected: PASS (10 tests). 이어서 `node --test next/tests/*.test.mjs`로 앞선 테스트도 그대로 통과하는지 확인한다(182개).

- [ ] **Step 5: 커밋**

```bash
git add next/engine/awards.mjs next/tests/awards.test.mjs
git commit -m "feat(next): 시상(발롱도르·MVP·골든부트·도움왕·골든글러브·영건)"
```


---

### Task 3: 우승 기록·트로피·은퇴식·명예의 전당·커리어 점수

**Files:**
- Create: `next/engine/honors.mjs`
- Test: `next/tests/honors.test.mjs`

**Interfaces:**
- Consumes: Task 1 `playerRecord`, `CAREER_SCORE`, 계획 1 `standings`, 계획 5 `allTeams`
- Produces: `recordChampions(history, { year, world, cl })`, `recordMyTeam(history, { year, tier, rank, fate, clChampion, awards, myTeamId })`, `retirePlayer(history, player, year) -> 은퇴식 요약`, `inductHallOfFame(history, playerId)`, `careerSummary(history) -> { seasons, bestTier, leagueTitles, clTitles, awardCount, hallOfFame, standout, score }`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/honors.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, collectStats, recordSeason } from '../engine/records.mjs';
import { playChampions } from '../engine/champions.mjs';
import { standings } from '../engine/league.mjs';
import { allTeams } from '../engine/world.mjs';
import {
  careerSummary, inductHallOfFame, recordChampions, recordMyTeam, retirePlayer,
} from '../engine/honors.mjs';
import { makeWorld, playFullSeason } from './helpers.mjs';

test('역대 우승팀: 모든 리그의 1위와 주요 선수 3명, 챔피언스리그 우승팀이 기록된다', () => {
  const { world, rng } = makeWorld(1);
  playFullSeason(world, rng);
  const cl = playChampions(world, rng);
  const h = createHistory();
  recordChampions(h, { year: 1, world, cl });
  const entry = h.champions[0];
  assert.equal(Object.keys(entry.leagues).length, 10);
  assert.equal(entry.leagues['0:3'].teamId, standings(world.leagues.get('0:3'))[0].id);
  assert.equal(entry.leagues['0:3'].players.length, 3);
  assert.equal(entry.champions.teamId, cl.champion);
  const teams = new Map(allTeams(world).map((t) => [t.id, t]));
  for (const id of entry.champions.players) assert.ok(teams.get(cl.champion).stars.some((p) => p.id === id));
});

test('챔피언스리그를 치르지 않은 시즌의 champions는 null이다', () => {
  const { world, rng } = makeWorld(2);
  playFullSeason(world, rng);
  const h = createHistory();
  recordChampions(h, { year: 1, world });
  assert.equal(h.champions[0].champions, null);
});

test('내 시즌 결과: 1위면 리그 우승 트로피, 챔피언스리그 우승 트로피, 내 선수가 받은 상만 진열대에 오른다', () => {
  const h = createHistory();
  const awards = {
    mvp: { key: 'mvp', playerId: 'mine1', teamId: 'ME' },
    goldenBoot: { key: 'goldenBoot', playerId: 'other', teamId: 'X' },
    youngStar: null,
  };
  recordMyTeam(h, { year: 1, tier: 3, rank: 1, fate: 'promoted', awards, myTeamId: 'ME' });
  recordMyTeam(h, { year: 2, tier: 2, rank: 4, fate: 'stay', myTeamId: 'ME' });
  recordMyTeam(h, { year: 3, tier: 1, rank: 1, fate: 'stay', clChampion: true, myTeamId: 'ME' });
  assert.deepEqual(h.trophies.map((t) => t.kind), ['league', 'award', 'league', 'cl']);
  assert.equal(h.trophies[1].key, 'mvp');
  assert.equal(h.bestTier, 1);
  assert.equal(h.mySeasons.length, 3);
});

test('최고 리그는 낮아지지 않는다(1부에 올랐다가 강등돼도 1)', () => {
  const h = createHistory();
  recordMyTeam(h, { year: 1, tier: 1, rank: 20, fate: 'fired', myTeamId: 'ME' });
  recordMyTeam(h, { year: 2, tier: 2, rank: 5, fate: 'stay', myTeamId: 'ME' });
  assert.equal(h.bestTier, 1);
});

test('은퇴식: 통산·수상·최고 시즌 득점이 정리된다', () => {
  const h = createHistory();
  const p = { id: 'p1', position: 'FW', age: 36 };
  const row = (goals) => ({ id: 'p1', teamId: 'ME', tier: 3, region: 0, position: 'FW', age: 30, overall: 70, apps: 30, goals, assists: 2 });
  recordSeason(h, { year: 1, leagueStats: new Map([['p1', row(12)]]), myTeamId: 'ME' });
  recordSeason(h, { year: 2, leagueStats: new Map([['p1', row(20)]]), clStats: new Map([['p1', { apps: 5, goals: 4, assists: 0 }]]), myTeamId: 'ME' });
  h.players.get('p1').awards.push({ year: 2, key: 'mvp' });
  const c = retirePlayer(h, p, 3);
  assert.deepEqual(c.career, { apps: 65, goals: 36, assists: 4 });
  assert.equal(c.bestSeasonGoals, 24);
  assert.equal(c.awards, 1);
  assert.equal(c.seasons, 2);
  assert.equal(h.retired.length, 1);
});

test('기록이 없는 선수도 은퇴식은 오류 없이 빈 통산으로 정리된다', () => {
  const c = retirePlayer(createHistory(), { id: 'new', position: 'GK', age: 40 }, 1);
  assert.deepEqual(c.career, { apps: 0, goals: 0, assists: 0 });
  assert.equal(c.bestSeasonGoals, 0);
});

test('명예의 전당: 은퇴한 선수만, 한 번만 올릴 수 있다', () => {
  const h = createHistory();
  assert.throws(() => inductHallOfFame(h, 'p1'), /은퇴한 선수만/);
  retirePlayer(h, { id: 'p1', position: 'FW', age: 37 }, 4);
  inductHallOfFame(h, 'p1');
  assert.deepEqual(h.hallOfFame, [{ playerId: 'p1', retiredYear: 4 }]);
  assert.throws(() => inductHallOfFame(h, 'p1'), /이미 명예의 전당/);
});

test('커리어 요약과 점수: 최고 리그·우승·상·명예의 전당·시즌 수를 합산하고 대표 선수는 내 선수 중 득점+도움 상위 3명이다', () => {
  const h = createHistory();
  const mk = (id, goals, mine) => ({ id, teamId: mine ? 'ME' : 'X', tier: 3, region: 0, position: 'FW', age: 25, overall: 70, apps: 30, goals, assists: 0 });
  recordSeason(h, {
    year: 1,
    leagueStats: new Map([['a', mk('a', 5, true)], ['b', mk('b', 20, true)], ['c', mk('c', 12, true)], ['d', mk('d', 9, true)], ['star', mk('star', 99, false)]]),
    myTeamId: 'ME',
  });
  recordMyTeam(h, { year: 1, tier: 3, rank: 1, fate: 'promoted', awards: { mvp: { key: 'mvp', playerId: 'b', teamId: 'ME' } }, myTeamId: 'ME' });
  recordMyTeam(h, { year: 2, tier: 2, rank: 1, fate: 'promoted', myTeamId: 'ME' });
  recordMyTeam(h, { year: 3, tier: 1, rank: 1, fate: 'stay', clChampion: true, myTeamId: 'ME' });
  retirePlayer(h, { id: 'b', position: 'FW', age: 38 }, 3);
  inductHallOfFame(h, 'b');
  const s = careerSummary(h);
  assert.deepEqual(s.standout, ['b', 'c', 'd']);
  assert.equal(s.leagueTitles, 3);
  assert.equal(s.clTitles, 1);
  assert.equal(s.awardCount, 1);
  assert.equal(s.seasons, 3);
  assert.equal(s.score, 100 + 3 * 30 + 100 + 5 + 20 + 3 * 5);
});

test('아무 시즌도 안 치른 커리어의 점수는 0이다', () => {
  const s = careerSummary(createHistory());
  assert.equal(s.score, 0);
  assert.deepEqual(s.standout, []);
});

test('실제 두 시즌을 돌린 기록이 쌓인다', () => {
  const { world, rng } = makeWorld(3);
  playFullSeason(world, rng);
  const h = createHistory();
  recordSeason(h, { year: 1, leagueStats: collectStats(world), myTeamId: 'ME' });
  recordMyTeam(h, { year: 1, tier: 3, rank: standings(world.leagues.get('0:3')).findIndex((r) => r.id === 'ME') + 1, fate: 'stay', myTeamId: 'ME' });
  const s = careerSummary(h);
  assert.equal(s.seasons, 1);
  assert.ok(s.standout.length === 3);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/honors.test.mjs`
Expected: FAIL (`Cannot find module '../engine/honors.mjs'`)

- [ ] **Step 3: 구현** — `next/engine/honors.mjs`

```js
import { CAREER_SCORE } from './constants.mjs';
import { standings } from './league.mjs';
import { playerRecord } from './records.mjs';
import { allTeams } from './world.mjs';

// 팀의 주요 선수: 이번 시즌 득점+도움이 많은 스타 3명의 id
const keyPlayers = (team) => [...team.stars]
  .sort((a, b) => (b.stats.goals + b.stats.assists) - (a.stats.goals + a.stats.assists) || (a.id < b.id ? -1 : 1))
  .slice(0, 3).map((p) => p.id);

// 시즌 우승팀 기록(역대 우승팀). 승강을 반영하는 startNextSeason 전에, 선수 시즌 기록이 0이 되기 전에 부른다.
// cl: playChampions 결과(안 치렀으면 생략)
export function recordChampions(history, { year, world, cl }) {
  const teams = new Map(allTeams(world).map((t) => [t.id, t]));
  const leagues = {};
  for (const [key, league] of world.leagues) {
    const winnerId = standings(league)[0].id;
    leagues[key] = { teamId: winnerId, players: keyPlayers(teams.get(winnerId)) };
  }
  const champions = cl ? { teamId: cl.champion, players: keyPlayers(teams.get(cl.champion)) } : null;
  history.champions.push({ year, leagues, champions });
}

// 내 팀의 시즌 결과와 트로피 진열대. tier는 이번 시즌에 뛴 리그 단계, rank는 최종 순위.
// awards는 computeAwards 결과이며 내 팀 선수가 받은 상은 진열대에 오른다.
export function recordMyTeam(history, { year, tier, rank, fate, clChampion = false, awards = {}, myTeamId }) {
  const leagueChampion = rank === 1;
  history.mySeasons.push({ year, tier, rank, fate, leagueChampion, clChampion });
  history.bestTier = Math.min(history.bestTier, tier);
  if (leagueChampion) history.trophies.push({ year, kind: 'league', tier });
  if (clChampion) history.trophies.push({ year, kind: 'cl' });
  for (const award of Object.values(awards)) {
    if (award && award.teamId === myTeamId) history.trophies.push({ year, kind: 'award', key: award.key, playerId: award.playerId });
  }
}

// 은퇴식: 선수의 통산을 정리해 보관한다. 스타 명단에서 빼는 일은 계획 4의 retire/endOfSeason이 한다.
export function retirePlayer(history, player, year) {
  const rec = playerRecord(history, { id: player.id, position: player.position });
  const bestSeason = rec.seasons.reduce((m, s) => Math.max(m, s.goals + s.clGoals), 0);
  const ceremony = {
    playerId: player.id, year, age: player.age, seasons: rec.seasons.length,
    career: { ...rec.career }, awards: rec.awards.length, bestSeasonGoals: bestSeason,
  };
  history.retired.push(ceremony);
  return ceremony;
}

// 명예의 전당은 은퇴한 선수 중에서 내가 직접 지정한다.
export function inductHallOfFame(history, playerId) {
  const retired = history.retired.find((r) => r.playerId === playerId);
  if (!retired) throw new Error('은퇴한 선수만 명예의 전당에 올릴 수 있습니다');
  if (history.hallOfFame.some((h) => h.playerId === playerId)) throw new Error('이미 명예의 전당에 있습니다');
  history.hallOfFame.push({ playerId, retiredYear: retired.year });
}

// 종료 정산용 커리어 요약과 점수(점수식은 초기값).
export function careerSummary(history) {
  const leagueTitles = history.trophies.filter((t) => t.kind === 'league').length;
  const clTitles = history.trophies.filter((t) => t.kind === 'cl').length;
  const awardCount = history.trophies.filter((t) => t.kind === 'award').length;
  const standout = [...history.players.values()].filter((p) => p.mine)
    .sort((a, b) => (b.career.goals + b.career.assists) - (a.career.goals + a.career.assists) || (a.id < b.id ? -1 : 1))
    .slice(0, 3).map((p) => p.id);
  const score = CAREER_SCORE.bestTier[history.bestTier]
    + leagueTitles * CAREER_SCORE.leagueTitle + clTitles * CAREER_SCORE.clTitle + awardCount * CAREER_SCORE.award
    + history.hallOfFame.length * CAREER_SCORE.hallOfFame + history.mySeasons.length * CAREER_SCORE.season;
  return {
    seasons: history.mySeasons.length, bestTier: history.bestTier, leagueTitles, clTitles, awardCount,
    hallOfFame: history.hallOfFame.map((h) => h.playerId), standout, score,
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test next/tests/honors.test.mjs`
Expected: PASS (10 tests). 이어서 `node --test next/tests/*.test.mjs`로 앞선 테스트도 그대로 통과하는지 확인한다(192개).

- [ ] **Step 5: 커밋**

```bash
git add next/engine/honors.mjs next/tests/honors.test.mjs
git commit -m "feat(next): 역대 우승팀·트로피·은퇴식·명예의 전당·커리어 점수"
```


---

### Task 4: 전체 확인

- [ ] **Step 1: 전체 테스트**

Run: `node --test next/tests/*.test.mjs`
Expected: PASS (192 tests, 0 fail: 앞선 계획의 167개 + 이 계획의 25개). 기존 게임: `node --test tests/*.test.mjs`도 그대로 통과.

## Self-Review

**Spec coverage** (이 계획이 맡는 부분)
- 10절 선수 기록실(시즌·통산·수상) → Task 1 `recordSeason` `playerRecord`, Task 2 `giveAwards`(선수 카드의 메달 줄 `player.awards`).
- 10절 상(발롱도르=챔피언스리그 포함 전 지역, 시즌 MVP=내 리그, 골든부트, 도움왕, 골든글러브, 올해의 영건) → Task 2.
- 10절 트로피 진열대, 역대 우승팀(시즌별 각 리그·챔피언스리그 우승팀과 주요 선수) → Task 3 `recordMyTeam` `recordChampions`.
- 10절 명예의 전당(은퇴 선수 중 내가 지정)과 은퇴식 → Task 3 `retirePlayer` `inductHallOfFame`.
- 10.5절 종료 정산의 커리어 요약(최고 리그, 우승·챔피언스리그 우승 횟수, 트로피, 명예의 전당, 대표 선수, 커리어 점수) → Task 3 `careerSummary`. 커리어 점수식은 13절 미정이라 초기값이다.
- 이 계획에서 하지 않는 것: 은퇴식 연출과 화면(계획 7), 선수 이름(계획 8의 시작 단계에서 이름 생성 자산을 연결, 지금은 id), 은퇴·경질로 런을 끝내고 기록을 다음 판에서도 보는 저장(계획 8), 시즌 종료 순서에 이 호출들을 끼워 넣는 일(계획 8).

**Placeholder scan:** 모든 단계에 실제 코드와 명령이 있다. "TBD" 없음.

**Type consistency:** `collectStats`가 만드는 한 줄 `{ id, teamId, region, tier, position, age, overall, apps, goals, assists }`를 `diffStats` `recordSeason` `buildRows`가 같은 필드 이름으로 읽는다. `buildRows`의 한 줄 `{ league, cl, team: { rank, points, ga } }`를 `computeAwards`가 읽는다. 수상 `{ key, playerId, teamId, value }`는 `giveAwards` `recordMyTeam`에서 같다. `history`의 모양은 `createHistory`가 정의하고 Task 3이 같은 필드를 쓴다.

**검증 메모:** 이 계획의 코드는 계획 5까지 끝난 `next/`를 임시 폴더에 복사해 `node --test`로 192개가 모두 통과하는 것을 확인한 뒤 옮겼다.

## 후속 계획 (서브프로젝트)

| 계획 | 내용 |
|---|---|
| 7 화면 | 로스터·선수 상세·결과·프런트 오피스 등 (기존 현재 톤) |
| 8 시작·튜토리얼 | 스타 3명 배정 + 시작 드래프트, 튜토리얼, 시즌 흐름 연결, 런 종료(은퇴·경질) |
