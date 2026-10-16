# FM-Lite 리그 세계 구현 계획 (계획 5/8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3단계 사다리(내 지역)와 7개 지역 1부로 이루어진 세계를 만들고, 승강·승강전, AI 팀의 해마다 변화와 FA 이동, 8개 지역 챔피언스리그를 화면 없는 엔진으로 만들어 테스트로 고정한다.

**Architecture:** `world`는 `leagues: Map('지역:단계' -> 계획 1의 league)` 하나다. 구간 진행(`playWorldChunk`)은 모든 리그를 함께 돌리고, 내 팀만 계획 4의 `lineupView`로 바꿔 끼운다. 시즌이 끝나면 `resolveLadder`가 승강과 단판 승강전을 확정하고, `startNextSeason`이 리그를 다시 짠다. AI 팀은 수치로만 시뮬되며(`driftTeam`), 이름 있는 선수 3명은 득점·상 경쟁용이고 일부가 FA로 풀린다. 챔피언스리그는 지역 1부 상위 4팀 32개로 조별 8개 조와 단판 토너먼트를 치른다.

**Tech Stack:** 순수 ES 모듈(`.mjs`), Node 내장 테스트러너, 외부 의존성 0, 빌드 없음.

**Spec:** `docs/superpowers/specs/2026-10-16-fm-lite-next-design.md` (3절 사다리와 승강, 4절 챔피언스리그, 7절 AI 팀, 10.5절 경질 조건)

## Global Constraints

- 새 파일은 `next/` 아래에만 만든다. 기존 게임은 건드리지 않는다. 앞선 계획의 파일 중 고치는 것은 `constants.mjs`(추가만)와 `league.mjs`(`export` 두 개)뿐이다.
- 엔진에서 `Math.random`, `document`, `window`, `localStorage`를 쓰지 않는다. 난수는 `rng` 인자로 받는다.
- 주석과 사용자에게 보이는 문구는 한국어, 문구에 em 대시를 쓰지 않는다.
- 리그는 3단계(3부 → 2부 → 1부), 각 20팀. 2·3부 1~2위 자동 승격, 3위는 상위 리그 18위와 단판 승강전. 1·2부 19~20위 자동 강등, 18위는 하위 리그 3위와 승강전. 승강전 세부는 사용자가 추후 수정한다.
- 8개 지역(내 지역 1~3부 + 다른 7개 지역 1부만), 챔피언스리그는 지역 1부 상위 4팀 = 32팀. 조별 형식 세부는 구현 후 사용자가 수정한다.
- 이름 있는 AI 선수는 팀당 3명이다. 내 팀 외 모든 AI 팀은 스타 6명을 항상 유지한다.
- 경질: 3부에서 강등권(19~20위)으로 마감하면 즉시, 2부→3부 또는 1부→2부 강등(자동·승강전 패배 모두)도 즉시.
- 수치(리그 단계별 AI 수준, 변동 폭 등)는 초기값이며 `constants.mjs`와 `aiWorld.mjs` 한 곳에서만 정의한다.

## Review Focus

1. **시즌이 끝나지 않았는데 승강 확정, 3년 연속 시즌 반복**: 명확한 오류이거나 팀 수·명단이 깨지지 않아야 한다 (Task 2).
2. **승강전 무승부, 3부 하위 2팀(강등이 없는 단계)의 경질, 승강전 패배 강등**: 승자가 반드시 정해지고 경질 판정이 규칙대로여야 한다 (Task 2).
3. **구간 도중 오류가 나도 내 팀이 리그에 끼워진 채 남음**: 항상 원래 팀으로 복구되어야 한다 (Task 1).
4. **AI 팀의 선수 은퇴·FA 풀림·영입으로 스타가 6명 아니게 됨, 같은 지역 팀이 같은 조에 몰림**: 스타 6명과 라인업 11명, 조마다 4개 지역이 유지되어야 한다 (Task 3, 4).
5. **AI 능력이 1~99를 벗어나거나 코치 별이 범위를 벗어남, 풀 선수가 없는데 FA 방출 요청**: 범위를 지키고 빈 목록을 돌려준다 (Task 3).

---

### Task 1: 세계 만들기와 구간 진행

**Files:**
- Modify: `next/engine/constants.mjs` (맨 아래에 추가), `next/engine/league.mjs` (`export` 두 개)
- Create: `next/engine/world.mjs`, `next/tests/helpers.mjs`
- Test: `next/tests/world.test.mjs`

**Interfaces:**
- Consumes: 계획 1 `createTeam` `createLeague` `playChunk` `isSeasonOver` `randInt`, 계획 4 `lineupView`(테스트)
- Produces: `tiersOf(region)`, `leagueKey(region, tier) -> 'r:t'`, `createWorld({ rng, myTeam }) -> { year, myTeamId, leagues: Map }`, `myLeague(world)`, `allTeams(world)`, `isWorldSeasonOver(world)`, `playWorldChunk(world, rng, { views }) -> Map(리그 키 -> 경기 결과[])`. 팀에는 `region` `tier` `named`(AI는 이름 있는 선수 3명)가 붙는다. 상수 `REGIONS` `MY_REGION` `TIER_COUNT` `TIER_PARAMS` `CL_PER_REGION` `AI_REPLACEMENT_AGE`. 테스트 도우미 `makeWorld(seed)`, `playFullSeason(world, rng)`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/world.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld } from './helpers.mjs';
import { teamRatings } from '../engine/ratings.mjs';
import { lineupView, setRest } from '../engine/condition.mjs';
import { isSeasonOver, standings } from '../engine/league.mjs';
import {
  allTeams, isWorldSeasonOver, leagueKey, myLeague, playWorldChunk, tiersOf,
} from '../engine/world.mjs';

test('리그는 10개: 내 지역 1~3부 + 다른 7개 지역 1부, 모두 20팀', () => {
  const { world } = makeWorld();
  assert.equal(world.leagues.size, 10);
  assert.deepEqual(tiersOf(0), [1, 2, 3]);
  assert.deepEqual(tiersOf(5), [1]);
  for (const league of world.leagues.values()) assert.equal(league.teams.size, 20);
  assert.equal(allTeams(world).length, 200);
  assert.equal(new Set(allTeams(world).map((t) => t.id)).size, 200);
});

test('내 팀은 내 지역 3부에 들어가고 팀마다 지역·단계가 적힌다', () => {
  const { world, me } = makeWorld(2);
  assert.equal(myLeague(world), world.leagues.get(leagueKey(0, 3)));
  assert.equal(me.region, 0);
  assert.equal(me.tier, 3);
  assert.equal(world.leagues.get('3:1').teams.values().next().value.region, 3);
});

test('상위 리그일수록 팀 전력이 높다', () => {
  const { world } = makeWorld(3);
  const avg = (key) => {
    const teams = [...world.leagues.get(key).teams.values()].filter((t) => t.id !== 'ME');
    return teams.reduce((s, t) => s + teamRatings(t).attack + teamRatings(t).defense, 0) / teams.length;
  };
  assert.ok(avg('0:1') > avg('0:2') + 8);
  assert.ok(avg('0:2') > avg('0:3') + 8);
});

test('AI 팀은 이름 있는 선수 3명을 가진다', () => {
  const { world } = makeWorld(4);
  for (const t of world.leagues.get('0:1').teams.values()) {
    assert.equal(t.named.length, 3);
    assert.ok(t.named.every((p) => t.stars.includes(p)));
  }
});

test('한 구간씩 모든 리그가 함께 진행되고 세 번이면 시즌이 끝난다', () => {
  const { world, rng } = makeWorld(5);
  const out = playWorldChunk(world, rng);
  assert.equal(out.size, 10);
  assert.equal(out.get('0:3').length, 140);
  assert.equal(isWorldSeasonOver(world), false);
  playWorldChunk(world, rng);
  playWorldChunk(world, rng);
  assert.equal(isWorldSeasonOver(world), true);
  for (const league of world.leagues.values()) assert.ok(isSeasonOver(league));
  assert.equal(standings(myLeague(world)).length, 20);
});

test('views: 쉬는 스타 자리에 대체 선수가 뛰고 구간이 끝나면 원래 팀으로 돌아온다', () => {
  const { world, rng, me } = makeWorld(6);
  const rested = me.stars[4];
  setRest(me, [rested.id]);
  playWorldChunk(world, rng, { views: new Map([['ME', lineupView(me, rng)]]) });
  assert.equal(myLeague(world).teams.get('ME'), me);
  assert.equal(rested.stats.apps, 0);
  assert.equal(me.subs.FW1.stats.apps, 14);
});

test('views에 던져진 오류가 나도 원래 팀이 복구된다', () => {
  const { world, rng, me } = makeWorld(7);
  const bad = { ...me, lineup: null };
  assert.throws(() => playWorldChunk(world, rng, { views: new Map([['ME', bad]]) }));
  assert.equal(myLeague(world).teams.get('ME'), me);
});

test('내 팀이 없는 리그 키를 부르면 오류다', () => {
  const { world } = makeWorld(8);
  world.myTeamId = 'ghost';
  assert.throws(() => myLeague(world), /어느 리그에도/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/world.test.mjs`
Expected: FAIL (`Cannot find module '../engine/world.mjs'`)

- [ ] **Step 3: 상수 추가**

`next/engine/constants.mjs` 맨 아래에 붙인다

```js
// ---- 계획 5: 리그 세계 ----
export const REGIONS = 8;
export const MY_REGION = 0;
export const TIER_COUNT = 3;
// AI 팀 생성 범위, 리그 단계(1=1부)별. coach는 코치 별 범위, level은 스타 평균 능력 범위, target은 해마다 끌려가는 기준.
export const TIER_PARAMS = {
  1: { coach: [3, 5], level: [60, 78], target: 69 },
  2: { coach: [2, 4], level: [50, 66], target: 58 },
  3: { coach: [1.5, 3.5], level: [38, 54], target: 46 },
};
export const CL_PER_REGION = 4; // 지역별 챔피언스리그 진출 팀 수(1부 상위)
export const AI_REPLACEMENT_AGE = [19, 22];
```

- [ ] **Step 4: league.mjs 수정**

`next/engine/league.mjs`에서 두 곳에 `export`만 붙인다(챔피언스리그 조별리그가 같은 순위표 기록 함수를 쓴다). 내용은 바뀌지 않는다.

```js
export const emptyRow = () => ({ played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 });
```

```js
export function record(table, homeId, awayId, { homeGoals, awayGoals }) {
```

- [ ] **Step 5: 테스트 공용 도우미**

`next/tests/helpers.mjs` (계획 5의 모든 테스트가 같이 쓴다. `*.test.mjs`가 아니라서 테스트로 실행되지 않는다)

```js
import { createRng } from '../engine/rng.mjs';
import { createTeam } from '../engine/team.mjs';
import { createWorld, isWorldSeasonOver, playWorldChunk } from '../engine/world.mjs';

// 테스트 공용: 내 팀(3부 시작)이 들어간 세계. 계획 5 테스트들이 같이 쓴다.
export function makeWorld(seed = 1) {
  const rng = createRng(seed);
  const me = createTeam({ rng, id: 'ME', starLevel: 46 });
  return { rng, me, world: createWorld({ rng, myTeam: me }) };
}

export function playFullSeason(world, rng) {
  while (!isWorldSeasonOver(world)) playWorldChunk(world, rng);
}
```

- [ ] **Step 6: 구현** — `next/engine/world.mjs`

```js
import { MY_REGION, REGIONS, TIER_PARAMS } from './constants.mjs';
import { createLeague, isSeasonOver, playChunk } from './league.mjs';
import { randInt } from './rng.mjs';
import { createTeam } from './team.mjs';

// 내 지역(0번)만 1~3부 사다리를 갖고, 나머지 7개 지역은 1부 20팀만 만든다.
export const tiersOf = (region) => (region === MY_REGION ? [1, 2, 3] : [1]);
export const leagueKey = (region, tier) => `${region}:${tier}`;

function makeAiTeam(rng, id, tier) {
  const p = TIER_PARAMS[tier];
  const stars = () => randInt(rng, p.coach[0] * 2, p.coach[1] * 2) / 2;
  const team = createTeam({
    rng,
    id,
    attackStars: stars(),
    defenseStars: stars(),
    starLevel: p.level[0] + rng() * (p.level[1] - p.level[0]),
  });
  team.named = team.stars.slice(0, 3); // 득점·도움·상 경쟁에 나서는 이름 있는 선수 3명
  return team;
}

// myTeam은 내 팀(3부, 내 지역에 들어간다). 리그 3개 + 다른 지역 1부 7개 = 총 10개 리그.
export function createWorld({ rng, myTeam }) {
  const leagues = new Map();
  for (let region = 0; region < REGIONS; region += 1) {
    for (const tier of tiersOf(region)) {
      const teams = [];
      for (let i = 0; i < 20; i += 1) {
        if (region === MY_REGION && tier === 3 && i === 0) {
          teams.push(myTeam);
        } else {
          teams.push(makeAiTeam(rng, `R${region}T${tier}-${String(i).padStart(2, '0')}`, tier));
        }
      }
      for (const t of teams) { t.region = region; t.tier = tier; }
      leagues.set(leagueKey(region, tier), createLeague(teams));
    }
  }
  return { year: 1, myTeamId: myTeam.id, leagues };
}

// 내 팀이 지금 속한 리그
export function myLeague(world) {
  for (const tier of tiersOf(MY_REGION)) {
    const league = world.leagues.get(leagueKey(MY_REGION, tier));
    if (league.teams.has(world.myTeamId)) return league;
  }
  throw new Error('내 팀이 어느 리그에도 없습니다');
}
export const allTeams = (world) => [...world.leagues.values()].flatMap((l) => [...l.teams.values()]);
export const isWorldSeasonOver = (world) => [...world.leagues.values()].every(isSeasonOver);

// 모든 리그가 한 구간씩 함께 진행된다. views는 { 팀 id -> 대체 선수가 들어간 팀 보기 }(계획 4의 lineupView)로,
// 구간 동안만 끼워 넣고 끝나면 원래 팀으로 되돌린다. 리그별 경기 결과를 { 키 -> results }로 돌려준다.
export function playWorldChunk(world, rng, { views = new Map() } = {}) {
  const out = new Map();
  for (const [key, league] of world.leagues) {
    const swapped = [...views.keys()].filter((id) => league.teams.has(id));
    const originals = swapped.map((id) => league.teams.get(id));
    swapped.forEach((id) => league.teams.set(id, views.get(id)));
    try {
      out.set(key, playChunk(league, rng));
    } finally {
      swapped.forEach((id, i) => league.teams.set(id, originals[i]));
    }
  }
  return out;
}
```

- [ ] **Step 7: 통과 확인**

Run: `node --test next/tests/world.test.mjs`
Expected: PASS (8 tests). 이어서 `node --test next/tests/*.test.mjs`로 앞선 테스트도 그대로 통과하는지 확인한다(142개).

- [ ] **Step 8: 커밋**

```bash
git add next/engine/constants.mjs next/engine/league.mjs next/engine/world.mjs next/tests/helpers.mjs next/tests/world.test.mjs
git commit -m "feat(next): 8개 지역 세계(내 지역 3단계 사다리 + 7개 지역 1부)와 구간 진행"
```

---

### Task 2: 승강과 승강전, 새 시즌, 감독 운명

**Files:**
- Create: `next/engine/ladder.mjs`
- Test: `next/tests/ladder.test.mjs`

**Interfaces:**
- Consumes: Task 1 `leagueKey` `myLeague` `allTeams` `isWorldSeasonOver`, 계획 1 `simulateMatch` `applyMatchStats` `standings` `createLeague`
- Produces: `playOffMatch(home, away, rng) -> { homeId, awayId, homeGoals, awayGoals, penalties, winnerId }`, `resolveLadder(world, rng) -> { playoffs: [A, B], membership: { 1, 2, 3 -> id[] }, finalRank: Map, tierBefore: Map }`, `managerFate(outcome, myId) -> 'fired' | 'promoted' | 'stay'`, `startNextSeason(world, outcome)`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/ladder.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createTeam } from '../engine/team.mjs';
import { standings } from '../engine/league.mjs';
import { allTeams, leagueKey, myLeague } from '../engine/world.mjs';
import { managerFate, playOffMatch, resolveLadder, startNextSeason } from '../engine/ladder.mjs';
import { makeWorld, playFullSeason } from './helpers.mjs';

function finished(seed) {
  const { world, rng, me } = makeWorld(seed);
  playFullSeason(world, rng);
  return { world, rng, me, outcome: resolveLadder(world, rng) };
}

test('시즌이 끝나기 전에는 승강을 확정할 수 없다', () => {
  const { world, rng } = makeWorld(1);
  assert.throws(() => resolveLadder(world, rng), /아직 끝나지/);
});

test('승강 뒤에도 각 리그는 20팀이고 60팀이 한 번씩만 들어 있다', () => {
  const { outcome } = finished(2);
  for (const tier of [1, 2, 3]) assert.equal(outcome.membership[tier].length, 20);
  const all = [1, 2, 3].flatMap((t) => outcome.membership[t]);
  assert.equal(new Set(all).size, 60);
});

test('자동 승격·강등: 2부 1~2위는 1부로, 1부 19~20위는 2부로, 3부 1~2위는 2부로, 2부 19~20위는 3부로', () => {
  const { world, outcome } = finished(3);
  const rank = (tier) => standings(world.leagues.get(leagueKey(0, tier))).map((r) => r.id);
  const m = outcome.membership;
  for (const id of rank(2).slice(0, 2)) assert.ok(m[1].includes(id));
  for (const id of rank(1).slice(18)) assert.ok(m[2].includes(id));
  for (const id of rank(3).slice(0, 2)) assert.ok(m[2].includes(id));
  for (const id of rank(2).slice(18)) assert.ok(m[3].includes(id));
  for (const id of rank(1).slice(0, 17)) assert.ok(m[1].includes(id));
  for (const id of rank(3).slice(3)) assert.ok(m[3].includes(id));
});

test('승강전 2경기: 승자가 상위 리그에 남고 패자가 하위 리그로 간다', () => {
  const { world, outcome } = finished(4);
  const rank = (tier) => standings(world.leagues.get(leagueKey(0, tier))).map((r) => r.id);
  const [a, b] = outcome.playoffs;
  assert.deepEqual([a.homeId, a.awayId], [rank(1)[17], rank(2)[2]]);
  assert.deepEqual([b.homeId, b.awayId], [rank(2)[17], rank(3)[2]]);
  assert.ok(outcome.membership[1].includes(a.winnerId));
  assert.ok(outcome.membership[2].includes(a.winnerId === a.homeId ? a.awayId : a.homeId));
  assert.ok(outcome.membership[2].includes(b.winnerId));
  assert.ok(outcome.membership[3].includes(b.winnerId === b.homeId ? b.awayId : b.homeId));
});

test('단판은 비기면 승부차기이고 승자는 항상 정해진다', () => {
  const rng = createRng(5);
  const home = createTeam({ rng, id: 'H' });
  const away = createTeam({ rng, id: 'A' });
  let shootouts = 0;
  for (let i = 0; i < 200; i += 1) {
    const r = playOffMatch(home, away, rng);
    assert.ok([r.homeId, r.awayId].includes(r.winnerId));
    assert.equal(r.penalties, r.homeGoals === r.awayGoals);
    if (!r.penalties) assert.equal(r.winnerId, r.homeGoals > r.awayGoals ? r.homeId : r.awayId);
    shootouts += r.penalties ? 1 : 0;
  }
  assert.ok(shootouts > 10 && shootouts < 120);
});

const fate = (from, rank, to, id = 'ME') => managerFate({
  tierBefore: new Map([[id, from]]),
  finalRank: new Map([[id, rank]]),
  membership: { 1: to === 1 ? [id] : [], 2: to === 2 ? [id] : [], 3: to === 3 ? [id] : [] },
}, id);

test('감독 운명: 3부 19~20위 경질, 2부·1부 강등 경질, 승격, 유지', () => {
  assert.equal(fate(3, 19, 3), 'fired');
  assert.equal(fate(3, 20, 3), 'fired');
  assert.equal(fate(3, 18, 3), 'stay');
  assert.equal(fate(3, 2, 2), 'promoted');
  assert.equal(fate(2, 19, 3), 'fired');
  assert.equal(fate(2, 18, 3), 'fired'); // 승강전 패배도 강등이다
  assert.equal(fate(2, 10, 2), 'stay');
  assert.equal(fate(1, 20, 2), 'fired');
  assert.equal(fate(2, 1, 1), 'promoted');
  assert.equal(fate(1, 1, 1), 'stay');
});

test('새 시즌: 리그 10개가 새 일정과 0점 순위표로 다시 시작하고 팀 단계와 선수 시즌 기록이 갱신된다', () => {
  const { world, outcome } = finished(6);
  const before = world.year;
  const league = startNextSeason(world, outcome);
  assert.equal(world.year, before + 1);
  assert.equal(world.leagues.size, 10);
  for (const l of world.leagues.values()) {
    assert.equal(l.teams.size, 20);
    assert.equal(l.nextRound, 0);
    assert.ok([...l.table.values()].every((row) => row.played === 0));
  }
  for (const tier of [1, 2, 3]) {
    for (const t of world.leagues.get(leagueKey(0, tier)).teams.values()) assert.equal(t.tier, tier);
  }
  for (const t of allTeams(world)) assert.ok(t.lineup.every((p) => p.stats.apps === 0 && p.stats.goals === 0));
  assert.equal(league, myLeague(world));
});

test('3시즌 연속으로 돌려도 오류 없이 팀 수가 유지된다', () => {
  const { world, rng } = makeWorld(7);
  for (let y = 0; y < 3; y += 1) {
    playFullSeason(world, rng);
    startNextSeason(world, resolveLadder(world, rng));
  }
  assert.equal(world.year, 4);
  assert.equal(allTeams(world).length, 200);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/ladder.test.mjs`
Expected: FAIL (`Cannot find module '../engine/ladder.mjs'`)

- [ ] **Step 3: 구현** — `next/engine/ladder.mjs`

```js
import { MY_REGION } from './constants.mjs';
import { createLeague, standings } from './league.mjs';
import { applyMatchStats, simulateMatch } from './match.mjs';
import { allTeams, isWorldSeasonOver, leagueKey, myLeague } from './world.mjs';

// 단판: 비기면 승부차기(50대 50). 상위 리그 팀이 홈이다.
export function playOffMatch(home, away, rng) {
  const r = simulateMatch(home, away, rng);
  applyMatchStats(home, away, r);
  const penalties = r.homeGoals === r.awayGoals;
  const homeWins = penalties ? rng() < 0.5 : r.homeGoals > r.awayGoals;
  return { homeId: home.id, awayId: away.id, homeGoals: r.homeGoals, awayGoals: r.awayGoals, penalties, winnerId: homeWins ? home.id : away.id };
}

const ids = (league) => standings(league).map((r) => r.id);

// 시즌이 끝난 내 지역의 승강을 확정한다.
// 2·3부 1~2위 자동 승격, 3위는 상위 리그 18위와 단판. 1·2부 19~20위 자동 강등.
// 반환: { playoffs, membership: {1,2,3 -> id[]}, finalRank: Map(id -> 순위), tierBefore: Map(id -> 단계) }
export function resolveLadder(world, rng) {
  if (!isWorldSeasonOver(world)) throw new Error('시즌이 아직 끝나지 않았습니다');
  const leagues = { 1: world.leagues.get(leagueKey(MY_REGION, 1)), 2: world.leagues.get(leagueKey(MY_REGION, 2)), 3: world.leagues.get(leagueKey(MY_REGION, 3)) };
  const rank = { 1: ids(leagues[1]), 2: ids(leagues[2]), 3: ids(leagues[3]) };
  const team = (tier, id) => leagues[tier].teams.get(id);

  const a = playOffMatch(team(1, rank[1][17]), team(2, rank[2][2]), rng); // 2부 3위가 1부 18위에 도전
  const b = playOffMatch(team(2, rank[2][17]), team(3, rank[3][2]), rng); // 3부 3위가 2부 18위에 도전

  const membership = {
    1: [...rank[1].slice(0, 17), ...rank[2].slice(0, 2), a.winnerId],
    2: [...rank[2].slice(3, 17), ...rank[1].slice(18), a.winnerId === rank[1][17] ? rank[2][2] : rank[1][17],
      ...rank[3].slice(0, 2), b.winnerId],
    3: [...rank[3].slice(3), ...rank[2].slice(18), b.winnerId === rank[2][17] ? rank[3][2] : rank[2][17]],
  };
  const finalRank = new Map();
  const tierBefore = new Map();
  for (const tier of [1, 2, 3]) rank[tier].forEach((id, i) => { finalRank.set(id, i + 1); tierBefore.set(id, tier); });
  return { playoffs: [a, b], membership, finalRank, tierBefore };
}

// 내 감독 운명: 3부에서 강등권(19~20위) 마감, 또는 강등되면 'fired', 승격하면 'promoted', 아니면 'stay'.
export function managerFate(outcome, myId) {
  const from = outcome.tierBefore.get(myId);
  const to = [1, 2, 3].find((t) => outcome.membership[t].includes(myId));
  if (from === 3 && outcome.finalRank.get(myId) >= 19) return 'fired';
  if (to > from) return 'fired';
  return to < from ? 'promoted' : 'stay';
}

function resetSeasonStats(team) {
  for (const p of [...team.lineup, ...Object.values(team.subs ?? {})]) p.stats = { apps: 0, goals: 0, assists: 0 };
}

// 새 시즌: 승강을 반영해 내 지역 리그 3개를 다시 짜고, 다른 지역 리그는 같은 팀으로 새 일정을 만든다.
// 선수의 시즌 기록은 0으로 돌아간다(계획 6이 기록실에 옮기는 일을 이 호출 전에 끝내야 한다).
export function startNextSeason(world, outcome) {
  const byId = new Map(allTeams(world).map((t) => [t.id, t]));
  const next = new Map();
  for (const [key, league] of world.leagues) {
    const region = Number(key.split(':')[0]);
    if (region === MY_REGION) continue;
    next.set(key, createLeague([...league.teams.values()]));
  }
  for (const tier of [1, 2, 3]) {
    const teams = outcome.membership[tier].map((id) => byId.get(id));
    for (const t of teams) t.tier = tier;
    next.set(leagueKey(MY_REGION, tier), createLeague(teams));
  }
  for (const t of byId.values()) resetSeasonStats(t);
  world.leagues = next;
  world.year += 1;
  return myLeague(world);
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test next/tests/ladder.test.mjs`
Expected: PASS (8 tests). 이어서 `node --test next/tests/*.test.mjs`로 앞선 테스트도 그대로 통과하는지 확인한다(150개).

- [ ] **Step 5: 커밋**

```bash
git add next/engine/ladder.mjs next/tests/ladder.test.mjs
git commit -m "feat(next): 승강·승강전·새 시즌·감독 운명(경질 조건)"
```

---

### Task 3: AI 세계 변화(변동·나이·은퇴·FA 풀림·이름 있는 선수)

**Files:**
- Create: `next/engine/aiWorld.mjs`
- Test: `next/tests/aiWorld.test.mjs`

**Interfaces:**
- Consumes: Task 1 `allTeams`, 계획 4 `endOfSeason`, 계획 3 `syncFillers`, 계획 2 `setStars` `aiSign`(테스트), 계획 1 `createPlayer` `overall` `gauss` `randInt` `weightedPick`
- Produces: `topThree(team)`, `driftTeam(team, rng)`, `refillStars(team, rng)`, `ageAiTeam(team, rng) -> 은퇴자[]`, `releaseAiPlayers(rng, aiTeams, count) -> 풀린 선수[]`(계획 2의 `generateFreeAgents`의 `released`로 넘긴다), `integrateNamed(team, rng)`(계획 2의 `aiSign` 뒤에 부른다), `offseasonAi(world, rng) -> 은퇴자[]`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/aiWorld.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createPlayer, overall } from '../engine/player.mjs';
import { aiSign } from '../engine/freeAgency.mjs';
import { allTeams, leagueKey } from '../engine/world.mjs';
import {
  ageAiTeam, driftTeam, integrateNamed, offseasonAi, refillStars, releaseAiPlayers, topThree,
} from '../engine/aiWorld.mjs';
import { makeWorld } from './helpers.mjs';

const aiTeams = (world) => [...world.leagues.get(leagueKey(0, 1)).teams.values()];

test('driftTeam: 능력이 1~99 안에서 기준 수준 쪽으로 움직이고 코치 별은 1~5를 지킨다', () => {
  const { world } = makeWorld(1);
  const team = aiTeams(world)[0];
  team.stars.forEach((p) => { for (const k of Object.keys(p.attrs)) p.attrs[k] = 99; });
  const rng = createRng(2);
  for (let i = 0; i < 30; i += 1) driftTeam(team, rng);
  const avg = team.stars.reduce((s, p) => s + overall(p), 0) / 6;
  assert.ok(avg < 90 && avg > 55, `평균 ${avg}`);
  for (const p of team.stars) for (const v of Object.values(p.attrs)) assert.ok(v >= 1 && v <= 99);
  for (const k of ['attack', 'defense']) assert.ok(team.coaches[k].stars >= 1 && team.coaches[k].stars <= 5);
});

test('driftTeam: 3부 팀이 낮은 수준이면 위로 끌려 올라간다', () => {
  const { world } = makeWorld(3);
  const team = [...world.leagues.get(leagueKey(0, 3)).teams.values()].find((t) => t.id !== 'ME');
  team.stars.forEach((p) => { for (const k of Object.keys(p.attrs)) p.attrs[k] = 10; });
  const before = team.stars.reduce((s, p) => s + overall(p), 0);
  const rng = createRng(4);
  for (let i = 0; i < 5; i += 1) driftTeam(team, rng);
  assert.ok(team.stars.reduce((s, p) => s + overall(p), 0) > before + 30);
});

test('refillStars: 스타가 모자라면 부족한 포지션을 어린 선수로 채우고 라인업은 11명이다', () => {
  const { world } = makeWorld(5);
  const team = aiTeams(world)[0];
  team.stars = team.stars.filter((p) => p.position !== 'GK');
  team.lineup = [...team.stars, ...team.lineup.slice(6)];
  refillStars(team, createRng(5));
  assert.equal(team.stars.length, 6);
  assert.ok(team.stars.some((p) => p.position === 'GK' && p.age <= 22));
  assert.equal(team.lineup.length, 11);
  assert.equal(team.named.length, 3);
});

test('ageAiTeam: 한 살 먹고 40세는 은퇴하며 빈자리는 신인이 채워 6명을 유지한다', () => {
  const { world } = makeWorld(6);
  const team = aiTeams(world)[0];
  const old = team.stars[0];
  old.age = 39;
  const retired = ageAiTeam(team, createRng(6));
  assert.ok(retired.includes(old));
  assert.equal(team.stars.length, 6);
  assert.ok(!team.stars.includes(old));
  assert.equal(team.lineup.length, 11);
});

test('releaseAiPlayers: 요청한 수만큼 서로 다른 선수가 풀리고 각 팀은 6명을 유지한다', () => {
  const { world } = makeWorld(7);
  const teams = aiTeams(world);
  const released = releaseAiPlayers(createRng(7), teams, 4);
  assert.equal(released.length, 4);
  assert.equal(new Set(released.map((p) => p.id)).size, 4);
  for (const t of teams) {
    assert.equal(t.stars.length, 6);
    for (const p of released) assert.ok(!t.stars.includes(p));
  }
});

test('releaseAiPlayers: 이름 있는 선수가 없으면 빈 목록이다', () => {
  assert.deepEqual(releaseAiPlayers(createRng(8), [], 4), []);
});

test('aiSign으로 들어온 FA는 integrateNamed로 스타가 되고 가장 약한 스타가 밀려난다', () => {
  const { world } = makeWorld(9);
  const team = aiTeams(world)[0];
  const star = createPlayer({ rng: createRng(9), id: 'FA-X', position: 'FW', level: 95 });
  aiSign(createRng(9), [{ player: star }], [team]);
  const weakest = [...team.stars].sort((a, b) => overall(a) - overall(b))[0];
  integrateNamed(team, createRng(9));
  assert.ok(team.stars.includes(star));
  assert.ok(!team.stars.includes(weakest));
  assert.equal(team.stars.length, 6);
  assert.ok(team.named.includes(star));
  assert.equal(team.lineup.length, 11);
});

test('topThree는 능력 순 상위 3명이다', () => {
  const { world } = makeWorld(10);
  const team = aiTeams(world)[0];
  const top = topThree(team);
  const rest = team.stars.filter((p) => !top.includes(p));
  assert.ok(Math.min(...top.map(overall)) >= Math.max(...rest.map(overall)));
});

test('offseasonAi: 내 팀은 건드리지 않고 나머지 199팀은 나이가 한 살 늘며 모두 스타 6명이다', () => {
  const { world, me } = makeWorld(11);
  const mine = me.stars.map((p) => [p.age, { ...p.attrs }]);
  const probe = aiTeams(world)[0].stars[0];
  const age = probe.age;
  offseasonAi(world, createRng(11));
  assert.deepEqual(me.stars.map((p) => [p.age, { ...p.attrs }]), mine);
  if (aiTeams(world)[0].stars.includes(probe)) assert.equal(probe.age, age + 1);
  for (const t of allTeams(world)) assert.equal(t.stars.length, 6);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/aiWorld.test.mjs`
Expected: FAIL (`Cannot find module '../engine/aiWorld.mjs'`)

- [ ] **Step 3: 구현** — `next/engine/aiWorld.mjs`

```js
import { AI_REPLACEMENT_AGE, TIER_PARAMS } from './constants.mjs';
import { endOfSeason } from './aging.mjs';
import { syncFillers } from './coach.mjs';
import { createPlayer, overall } from './player.mjs';
import { gauss, randInt, weightedPick } from './rng.mjs';
import { setStars } from './roster.mjs';
import { allTeams } from './world.mjs';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const SHAPE = ['GK', 'DF', 'DF', 'MF', 'FW', 'FW'];

export const topThree = (team) => [...team.stars].sort((a, b) => overall(b) - overall(a)).slice(0, 3);

// 해마다 AI 팀은 리그 단계의 기준 수준 쪽으로 10%씩 끌려가며 흔들린다. 코치 별은 25% 확률로 반 칸 변한다.
export function driftTeam(team, rng) {
  const target = TIER_PARAMS[team.tier].target;
  for (const p of team.stars) {
    for (const key of Object.keys(p.attrs)) {
      p.attrs[key] = clamp(Math.round(p.attrs[key] + (target - p.attrs[key]) * 0.1 + gauss(rng) * 2), 1, 99);
    }
    p.potential = Math.max(p.potential, Math.round(overall(p)));
  }
  for (const kind of ['attack', 'defense']) {
    if (rng() < 0.25) team.coaches[kind].stars = clamp(team.coaches[kind].stars + (rng() < 0.5 ? 0.5 : -0.5), 1, 5);
  }
  syncFillers(team);
}

// 스타가 6명보다 적으면 부족한 포지션(기본 구성 기준)에 어린 신인을 채운다.
export function refillStars(team, rng) {
  const stars = [...team.stars];
  const base = stars.length === 0 ? TIER_PARAMS[team.tier].target : stars.reduce((s, p) => s + overall(p), 0) / stars.length;
  while (stars.length < 6) {
    const missing = [...SHAPE];
    for (const p of stars) { const at = missing.indexOf(p.position); if (at >= 0) missing.splice(at, 1); }
    team.newCount = (team.newCount ?? 0) + 1;
    stars.push(createPlayer({
      rng,
      id: `${team.id}-n${team.newCount}`,
      position: missing[0] ?? SHAPE[randInt(rng, 0, 5)],
      age: randInt(rng, AI_REPLACEMENT_AGE[0], AI_REPLACEMENT_AGE[1]),
      level: base - 5,
    }));
  }
  setStars(team, rng, stars);
  team.named = topThree(team);
}

// 시즌 종료 처리: 나이 +1, 하락, 확률 은퇴(40세 강제) 뒤 빈자리를 신인으로 메운다. 은퇴자 목록을 돌려준다.
export function ageAiTeam(team, rng) {
  const retired = endOfSeason(team, rng);
  refillStars(team, rng);
  return retired;
}

// 일부 AI 선수가 FA로 풀린다: 이름 있는 선수 중 나이가 많을수록 잘 뽑힌다. 풀린 자리는 신인이 메운다.
export function releaseAiPlayers(rng, aiTeams, count) {
  const released = [];
  for (let i = 0; i < count; i += 1) {
    const pool = aiTeams.flatMap((t) => (t.named ?? []).filter((p) => t.stars.includes(p)).map((p) => ({ team: t, p })));
    if (pool.length === 0) break;
    const { team, p } = weightedPick(rng, pool, ({ p: q }) => Math.max(1, q.age - 26));
    setStars(team, rng, team.stars.filter((s) => s !== p));
    refillStars(team, rng);
    released.push(p);
  }
  return released;
}

// 계획 2의 aiSign으로 이름 있는 선수 목록에 들어온 FA를 실제 스타로 넣는다(가장 약한 스타를 밀어낸다).
export function integrateNamed(team, rng) {
  const incoming = (team.named ?? []).filter((p) => !team.stars.includes(p));
  const stars = [...team.stars];
  for (const p of incoming) {
    const weakest = stars.reduce((w, s, i) => (overall(s) < overall(stars[w]) ? i : w), 0);
    stars[weakest] = p;
  }
  if (incoming.length > 0) setStars(team, rng, stars);
  team.named = topThree(team);
}

// 시즌 사이 AI 팀 전체 갱신(내 팀 제외): 기준 수준 쪽 변동 -> 나이·은퇴·신인 보충 -> 이름 있는 선수 갱신.
export function offseasonAi(world, rng) {
  const retired = [];
  for (const team of allTeams(world)) {
    if (team.id === world.myTeamId) continue;
    driftTeam(team, rng);
    retired.push(...ageAiTeam(team, rng));
  }
  return retired;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test next/tests/aiWorld.test.mjs`
Expected: PASS (9 tests). 이어서 `node --test next/tests/*.test.mjs`로 앞선 테스트도 그대로 통과하는지 확인한다(159개).

- [ ] **Step 5: 커밋**

```bash
git add next/engine/aiWorld.mjs next/tests/aiWorld.test.mjs
git commit -m "feat(next): AI 팀 변동·나이·은퇴·FA 풀림·이름 있는 선수 통합"
```

---

### Task 4: 챔피언스리그

**Files:**
- Create: `next/engine/champions.mjs`
- Test: `next/tests/champions.test.mjs`

**Interfaces:**
- Consumes: Task 1 `leagueKey`, Task 2 `playOffMatch`, 계획 1 `generateFixtures` `emptyRow` `record` `standings` `simulateMatch` `applyMatchStats`
- Produces: `championsEntrants(world) -> 지역별 4팀[][]`, `drawGroups(regions, rng) -> 조별 4팀[][]`, `playChampions(world, rng) -> { groups: [{ ids, table, matches }], rounds: { r16, qf, sf, final }, champion, runnerUp }`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/champions.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { championsEntrants, drawGroups, playChampions } from '../engine/champions.mjs';
import { makeWorld, playFullSeason } from './helpers.mjs';

function ready(seed) {
  const { world, rng } = makeWorld(seed);
  playFullSeason(world, rng);
  return { world, rng };
}

test('출전 팀은 8개 지역 x 4팀 = 32팀이고 각 지역 1부 상위 4팀이다', () => {
  const { world } = ready(1);
  const regions = championsEntrants(world);
  assert.equal(regions.length, 8);
  for (const [r, teams] of regions.entries()) {
    assert.equal(teams.length, 4);
    for (const t of teams) assert.equal(t.region, r);
  }
  assert.equal(new Set(regions.flat().map((t) => t.id)).size, 32);
});

test('조 추첨: 8개 조에 4팀씩, 한 조에 같은 지역이 둘 없고 포트(순위)가 하나씩 들어간다', () => {
  const { world } = ready(2);
  const groups = drawGroups(championsEntrants(world), createRng(2));
  assert.equal(groups.length, 8);
  for (const g of groups) {
    assert.equal(g.length, 4);
    assert.equal(new Set(g.map((t) => t.region)).size, 4);
  }
  assert.equal(new Set(groups.flat().map((t) => t.id)).size, 32);
});

test('조별리그 8개 조 x 12경기, 순위표는 승점순이다', () => {
  const { world, rng } = ready(3);
  const cl = playChampions(world, rng);
  assert.equal(cl.groups.length, 8);
  for (const g of cl.groups) {
    assert.equal(g.matches.length, 12);
    assert.equal(g.table.length, 4);
    for (const row of g.table) assert.equal(row.played, 6);
    for (let i = 1; i < 4; i += 1) assert.ok(g.table[i - 1].points >= g.table[i].points);
  }
});

test('토너먼트는 16강 8경기, 8강 4경기, 4강 2경기, 결승 1경기이고 승자만 올라간다', () => {
  const { world, rng } = ready(4);
  const { rounds } = playChampions(world, rng);
  assert.deepEqual(Object.values(rounds).map((m) => m.length), [8, 4, 2, 1]);
  const names = ['r16', 'qf', 'sf', 'final'];
  for (let i = 0; i < 3; i += 1) {
    const winners = new Set(rounds[names[i]].map((m) => m.winnerId));
    for (const m of rounds[names[i + 1]]) {
      assert.ok(winners.has(m.homeId) && winners.has(m.awayId));
    }
  }
});

test('16강: 조 1위가 다른 조 2위를 만나고 한 팀이 두 번 나오지 않는다', () => {
  const { world, rng } = ready(5);
  const cl = playChampions(world, rng);
  const firsts = new Set(cl.groups.map((g) => g.table[0].id));
  const seconds = new Set(cl.groups.map((g) => g.table[1].id));
  for (const m of cl.rounds.r16) {
    assert.ok(firsts.has(m.homeId));
    assert.ok(seconds.has(m.awayId));
  }
  const all = cl.rounds.r16.flatMap((m) => [m.homeId, m.awayId]);
  assert.equal(new Set(all).size, 16);
});

test('우승팀은 출전 32팀 중 하나이고 결승 상대와 다르다', () => {
  const { world, rng } = ready(6);
  const entrants = new Set(championsEntrants(world).flat().map((t) => t.id));
  const cl = playChampions(world, rng);
  assert.ok(entrants.has(cl.champion));
  assert.ok(entrants.has(cl.runnerUp));
  assert.notEqual(cl.champion, cl.runnerUp);
});

test('같은 시드면 같은 챔피언스리그 결과가 나온다', () => {
  const run = () => {
    const { world, rng } = ready(7);
    const cl = playChampions(world, rng);
    return [cl.champion, cl.runnerUp, cl.groups.map((g) => g.table.map((r) => r.id).join())];
  };
  assert.deepEqual(run(), run());
});

test('챔피언스리그 득점도 선수 기록에 쌓인다', () => {
  const { world, rng } = ready(8);
  const entrants = championsEntrants(world).flat();
  const before = entrants.reduce((s, t) => s + t.lineup.reduce((a, p) => a + p.stats.apps, 0), 0);
  playChampions(world, rng);
  const after = entrants.reduce((s, t) => s + t.lineup.reduce((a, p) => a + p.stats.apps, 0), 0);
  assert.ok(after > before + 32 * 6 * 11 - 1);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/champions.test.mjs`
Expected: FAIL (`Cannot find module '../engine/champions.mjs'`)

- [ ] **Step 3: 구현** — `next/engine/champions.mjs`

```js
import { CL_PER_REGION, REGIONS } from './constants.mjs';
import { emptyRow, generateFixtures, record, standings } from './league.mjs';
import { applyMatchStats, simulateMatch } from './match.mjs';
import { playOffMatch } from './ladder.mjs';
import { leagueKey } from './world.mjs';

// 각 지역 1부 상위 4팀 = 32팀. 지역 순서는 [지역 번호 -> 그 지역 4팀(1위부터)]
export function championsEntrants(world) {
  const regions = [];
  for (let region = 0; region < REGIONS; region += 1) {
    const league = world.leagues.get(leagueKey(region, 1));
    regions.push(standings(league).slice(0, CL_PER_REGION).map((r) => league.teams.get(r.id)));
  }
  return regions;
}

// 조 추첨: 지역 순서를 섞은 뒤, g조의 p번째 포트(p위 팀)는 (g + 2p)번째 지역에서 가져온다.
// 한 조에 같은 지역 팀이 둘 들어가지 않는다.
export function drawGroups(regions, rng) {
  const order = regions.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return Array.from({ length: 8 }, (_, g) => [0, 1, 2, 3].map((pot) => regions[order[(g + 2 * pot) % 8]][pot]));
}

function playGroup(teams, rng) {
  const ids = teams.map((t) => t.id);
  const byId = new Map(teams.map((t) => [t.id, t]));
  const table = new Map(ids.map((id) => [id, emptyRow()]));
  const matches = [];
  for (const round of generateFixtures(ids)) {
    for (const [homeId, awayId] of round) {
      const result = simulateMatch(byId.get(homeId), byId.get(awayId), rng);
      applyMatchStats(byId.get(homeId), byId.get(awayId), result);
      record(table, homeId, awayId, result);
      matches.push({ homeId, awayId, ...result });
    }
  }
  return { ids, table: standings({ table }), matches };
}

// 챔피언스리그 한 시즌: 8개 조(홈 앤 어웨이 6경기) -> 16강 -> 8강 -> 4강 -> 결승(모두 단판, 비기면 승부차기).
// 반환: { groups, rounds: { r16, qf, sf, final }, champion, runnerUp }
export function playChampions(world, rng) {
  const regions = championsEntrants(world);
  const teams = drawGroups(regions, rng);
  const byId = new Map(regions.flat().map((t) => [t.id, t]));
  const groups = teams.map((g) => playGroup(g, rng));
  const winner = (g) => byId.get(groups[g].table[0].id);
  const second = (g) => byId.get(groups[g].table[1].id);

  const knock = (pairs) => pairs.map(([home, away]) => playOffMatch(home, away, rng));
  const winners = (matches) => matches.map((m) => byId.get(m.winnerId));
  const next = (list) => list.reduce((acc, t, i) => (i % 2 === 0 ? [...acc, [t, list[i + 1]]] : acc), []);

  const r16 = knock([0, 2, 4, 6].flatMap((a) => [[winner(a), second(a + 1)], [winner(a + 1), second(a)]]));
  const qf = knock(next(winners(r16)));
  const sf = knock(next(winners(qf)));
  const final = knock(next(winners(sf)));
  const champion = final[0].winnerId;
  return {
    groups,
    rounds: { r16, qf, sf, final },
    champion,
    runnerUp: champion === final[0].homeId ? final[0].awayId : final[0].homeId,
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test next/tests/champions.test.mjs`
Expected: PASS (8 tests). 이어서 `node --test next/tests/*.test.mjs`로 앞선 테스트도 그대로 통과하는지 확인한다(167개).

- [ ] **Step 5: 커밋**

```bash
git add next/engine/champions.mjs next/tests/champions.test.mjs
git commit -m "feat(next): 챔피언스리그(8개 조, 16강~결승 단판, 승부차기)"
```

---

### Task 5: 전체 확인

- [ ] **Step 1: 전체 테스트**

Run: `node --test next/tests/*.test.mjs`
Expected: PASS (167 tests, 0 fail: 앞선 계획의 134개 + 이 계획의 33개). 기존 게임: `node --test tests/*.test.mjs`도 그대로 통과.

## Self-Review

**Spec coverage** (이 계획이 맡는 부분)
- 3절 3단계 사다리, 자동 승격·강등, 단판 승강전 → Task 2 `resolveLadder`. 상위 리그 코인 수입·우승 상금은 계획 3의 `WIN_INCOME` `CHAMPION_PRIZE`가 이미 단계별로 갖고 있어, 호출하는 쪽이 `team.tier`를 넘기면 된다.
- 4절 챔피언스리그(8개 지역 상위 4팀, 조별 → 16강 → 8강 → 4강 → 결승) → Task 4. 효과(큰 코인 보상·팬 증가·FA 조건 `챔피언스리그 출전 팀만`·발롱도르 반영)의 연결은 계획 6·7에서 `playChampions` 결과를 읽어 처리한다. 챔피언스리그 득점은 선수 `stats`에 합산되므로 계획 6은 챔피언스리그 직전에 `stats`를 찍어 두고 차이로 대회별 기록을 나눈다.
- 7절 AI 팀(수치로 시뮬, 이름 있는 선수 팀당 3명, 은퇴까지 잔류, 일부만 FA로, 안 잡으면 AI가 영입) → Task 1 `named`, Task 3 `releaseAiPlayers` `integrateNamed`(계획 2의 `aiSign`과 이어진다), `ageAiTeam`.
- 10.5절 경질 조건 → Task 2 `managerFate`. 은퇴(자진 종료)와 종료 정산 화면은 계획 8.
- 이 계획에서 하지 않는 것: 상 판정·기록실(계획 6), 승강전·챔피언스리그 결과 화면과 시즌 종료 순서 연결(계획 7·8), 승강전 세부와 조별 형식 수정(사용자가 추후 지정), 상위 리그일수록 커지는 샐러리캡의 팀별 적용은 `salaryCap(club, tier)`에 `team.tier`를 넘기면 된다.

**Placeholder scan:** 모든 단계에 실제 코드와 명령이 있다. "TBD" 없음.

**Type consistency:** `world.leagues`의 키는 `leagueKey(region, tier)`이고 Task 1·2·4가 같은 함수를 쓴다. `outcome.membership` `finalRank` `tierBefore`는 Task 2 구현과 `managerFate` 테스트가 같은 모양이다. 팀의 `named`는 Task 1에서 `stars`의 부분집합이고 Task 3의 `topThree` `integrateNamed`가 같은 규칙을 지킨다. `playOffMatch`의 결과 필드는 Task 2에서 정의하고 Task 4가 그대로 쓴다.

**검증 메모:** 이 계획의 코드는 계획 4까지 끝난 `next/`를 임시 폴더에 복사해 `node --test`로 167개가 모두 통과하는 것을 확인한 뒤 옮겼다.

## 후속 계획 (서브프로젝트)

| 계획 | 내용 |
|---|---|
| 6 상·기록 | 상 판정, 기록실, 트로피, 역대 우승팀, 명예의 전당, 은퇴식 |
| 7 화면 | 로스터·선수 상세·결과·프런트 오피스 등 |
| 8 시작·튜토리얼 | 스타 3명 배정 + 시작 드래프트, 튜토리얼, 시즌 흐름 연결, 런 종료(은퇴·경질) |
