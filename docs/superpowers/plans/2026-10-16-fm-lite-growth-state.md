# FM-Lite 성장·상태 구현 계획 (계획 4/8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선수 XP와 레벨업, 컨디션·부상·휴식 지정, 사기, 나이·하락·은퇴, 기자회견·면담 이벤트를 화면 없는 엔진으로 만들고 테스트로 고정한다.

**Architecture:** 한 구간(14/14/10라운드)을 돌리는 흐름이 중심이다. 구간 전에 `setRest`로 쉬게 할 스타를 정하고, `lineupView`가 쉬는·다친 스타 자리에 같은 포지션 대체 선수를 넣은 팀 보기를 만들어 리그에 끼워 넣는다(`league.teams.set`). 구간이 끝나면 `chunkStep` 하나가 스타 전원의 XP·컨디션·사기·부상을 갱신한다. 시즌 끝에는 `endOfSeason`이 나이·하락·은퇴를 처리한다. 코치 강도·특성과 시설 배율은 계획 3의 값을 `coachMul` `facilityEffects`로 읽기만 한다.

**Tech Stack:** 순수 ES 모듈(`.mjs`), Node 내장 테스트러너, 외부 의존성 0, 빌드 없음.

**Spec:** `docs/superpowers/specs/2026-10-16-fm-lite-next-design.md` (5절 XP·나이·사기·컨디션, 6.5절 훈련 강도, 9절 이벤트)

## Global Constraints

- 새 파일은 `next/` 아래에만 만든다. 기존 게임은 건드리지 않는다. 앞선 계획의 파일 중 고치는 것은 `constants.mjs`(추가만)뿐이다.
- 엔진에서 `Math.random`, `document`, `window`, `localStorage`를 쓰지 않는다. 난수는 `rng` 인자로 받는다.
- 주석과 사용자에게 보이는 문구는 한국어, 문구에 em 대시를 쓰지 않는다.
- 나이 19~40세, 33세부터 하락, 40세는 강제 은퇴. 사기와 컨디션은 0~100, 능력은 1~99를 벗어나지 않는다.
- 훈련 강도 LIGHT / NORMAL / HARD는 계획 3의 `INTENSITIES`를 그대로 쓴다.
- 이벤트 효과는 선택 전에 화면에 보여 줘야 하므로 데이터(`effects`)로 두고, 효과 적용은 `applyChoice` 한 곳에서만 한다.
- 수치(XP량, 소모·회복량, 부상 확률 등)는 초기값이며 `constants.mjs` 한 곳에서만 정의한다.

## Review Focus

1. **쉬게 한 선수가 골키퍼이거나 스타 전원을 쉬게 함**: 라인업은 항상 11명이고 골키퍼 1명이며 시뮬이 돌아가야 한다 (Task 2).
2. **쉬는 선수의 기록**: 쉰 스타는 출전이 늘지 않고 대체 선수의 기록이 이어져야 한다 (Task 2).
3. **능력이 잠재력에 닿은 선수의 레벨업, 99에 가까운 능력**: 능력이 잠재력과 99를 넘지 않아야 한다 (Task 1).
4. **사기·컨디션 극단값과 연속 하락**: 0~100을 벗어나지 않고 능력은 1 아래로 내려가지 않는다 (Task 2, 3).
5. **코인이 모자란 이벤트 선택, 면담 선수 없는 면담 효과**: 오류이고 코인·팬·사기가 하나도 바뀌지 않아야 한다 (Task 4).

---

### Task 1: 상수, XP와 레벨업, 구간 XP

**Files:**
- Modify: `next/engine/constants.mjs` (맨 아래에 추가)
- Create: `next/engine/growth.mjs`
- Test: `next/tests/growth.test.mjs`

**Interfaces:**
- Consumes: 계획 1 `overall` `randInt`, 계획 3 `trainingMultipliers` `facilityEffects`
- Produces: `xpNeeded(level)`, `ageXpFactor(age)`, `coachMul(team, position, key)`(key: `xp` `fatigue` `mood` `injury`), `raiseAttrs(p, rng)`, `addXp(p, amount, rng) -> 오른 레벨 수`, `chunkXp(p, delta, { team, club })`. 상수 `XP_BASE_PER_CHUNK` `XP_PER_APP` `XP_PER_GOAL` `XP_PER_ASSIST` `FATIGUE_PER_ROUND` `NATURAL_RECOVERY` `REST_RECOVERY` `INJURY_BASE` `INJURY_MAX_CHUNKS` `UNDERPAID_RATIO` `DECLINE_AGE` `MAX_AGE` `RETIRE_CHANCE`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/growth.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createPlayer, overall } from '../engine/player.mjs';
import { createTeam } from '../engine/team.mjs';
import { createClub } from '../engine/economy.mjs';
import { createCoach, setIntensity } from '../engine/coach.mjs';
import { addXp, ageXpFactor, chunkXp, coachMul, raiseAttrs, xpNeeded } from '../engine/growth.mjs';

const young = (seed = 1, level = 50) => createPlayer({ rng: createRng(seed), id: 'p', position: 'FW', age: 19, level });
const zero = { apps: 0, goals: 0, assists: 0 };

test('필요 XP는 레벨마다 10씩 늘고, 어릴수록 효율이 좋다', () => {
  assert.deepEqual([1, 2, 5].map(xpNeeded), [50, 60, 90]);
  assert.ok(ageXpFactor(19) > ageXpFactor(24) && ageXpFactor(24) > ageXpFactor(28));
  assert.ok(ageXpFactor(28) > ageXpFactor(31) && ageXpFactor(31) > ageXpFactor(35));
});

test('레벨업하면 레벨이 오르고 남은 XP가 이어지며 능력이 오른다', () => {
  const p = young();
  p.potential = 90;
  const before = overall(p);
  assert.equal(addXp(p, 50 + 60 + 7, createRng(2)), 2);
  assert.equal(p.xpLevel, 3);
  assert.equal(p.xp, 7);
  assert.ok(overall(p) > before);
});

test('XP가 부족하면 레벨도 능력도 그대로다', () => {
  const p = young();
  const before = overall(p);
  assert.equal(addXp(p, 49, createRng(3)), 0);
  assert.equal(p.xpLevel, 1);
  assert.equal(overall(p), before);
});

test('능력이 잠재력에 닿으면 레벨은 올라도 능력은 오르지 않는다', () => {
  const p = young();
  p.potential = Math.ceil(overall(p)) - 1;
  const before = { ...p.attrs };
  assert.equal(raiseAttrs(p, createRng(4)), 0);
  addXp(p, 500, createRng(4));
  assert.deepEqual(p.attrs, before);
  assert.ok(p.xpLevel > 1);
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
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/growth.test.mjs`
Expected: FAIL (`Cannot find module '../engine/growth.mjs'`)

- [ ] **Step 3: 상수 추가** — `next/engine/constants.mjs` 맨 아래에 붙인다

```js
// ---- 계획 4: 성장·상태 ----
export const XP_BASE_PER_CHUNK = 6; // 구간마다 훈련으로 얻는 기본 XP
export const XP_PER_APP = 0.5;
export const XP_PER_GOAL = 2;
export const XP_PER_ASSIST = 1.2;
export const FATIGUE_PER_ROUND = 1.3; // 뛴 라운드당 컨디션 소모
export const NATURAL_RECOVERY = 8; // 뛰면서도 구간마다 자연 회복
export const REST_RECOVERY = 35; // 쉬거나 다친 선수의 구간 회복
export const INJURY_BASE = 0.06; // 구간당 기본 부상 확률
export const INJURY_MAX_CHUNKS = 2;
export const UNDERPAID_RATIO = 0.8; // 요구 연봉의 80% 미만이면 사기 하락
export const DECLINE_AGE = 33;
export const MAX_AGE = 40;
// 33세부터 시즌이 끝날 때 은퇴할 확률(40세는 강제)
export const RETIRE_CHANCE = { 33: 0.05, 34: 0.1, 35: 0.2, 36: 0.3, 37: 0.45, 38: 0.6, 39: 0.8 };
```

- [ ] **Step 4: 구현** — `next/engine/growth.mjs`

```js
import {
  XP_BASE_PER_CHUNK, XP_PER_APP, XP_PER_ASSIST, XP_PER_GOAL,
} from './constants.mjs';
import { overall } from './player.mjs';
import { randInt } from './rng.mjs';
import { trainingMultipliers } from './coach.mjs';
import { facilityEffects } from './economy.mjs';

// 다음 레벨까지 필요한 XP: 레벨 1은 50, 레벨마다 10씩 늘어난다.
export const xpNeeded = (level) => 40 + 10 * level;

// 어릴수록 XP 효율이 좋다.
export function ageXpFactor(age) {
  if (age <= 21) return 1.3;
  if (age <= 25) return 1.15;
  if (age <= 29) return 1;
  if (age <= 32) return 0.8;
  return 0.5;
}

// 선수 포지션에 맞는 코치 배율(공격수는 공격 코치, 수비수·골키퍼는 수비 코치, 미드는 평균).
// 특성·강도가 없는 단순 코치(별만 있는 객체)는 배율 1로 본다. key: xp | fatigue | mood | injury
export function coachMul(team, position, key) {
  const of = (c) => (c.trait ? trainingMultipliers(c)[key] : (key === 'mood' ? 0 : 1));
  const { attack, defense } = team.coaches;
  if (position === 'FW') return of(attack);
  if (position === 'DF' || position === 'GK') return of(defense);
  return (of(attack) + of(defense)) / 2;
}

// 능력이 잠재력보다 낮을 때만 능력 2개가 +1~2 오른다(99 상한).
export function raiseAttrs(p, rng) {
  const keys = Object.keys(p.attrs);
  let gained = 0;
  for (let i = 0; i < 2 && overall(p) < p.potential; i += 1) {
    const key = keys[randInt(rng, 0, keys.length - 1)];
    const next = Math.min(99, p.attrs[key] + randInt(rng, 1, 2));
    gained += next - p.attrs[key];
    p.attrs[key] = next;
  }
  return gained;
}

// XP를 쌓고 레벨업마다 능력을 올린다. 올라간 레벨 수를 돌려준다.
export function addXp(p, amount, rng) {
  p.xp += amount;
  let levelUps = 0;
  while (p.xp >= xpNeeded(p.xpLevel)) {
    p.xp -= xpNeeded(p.xpLevel);
    p.xpLevel += 1;
    levelUps += 1;
    raiseAttrs(p, rng);
  }
  return levelUps;
}

// 한 구간에서 얻는 XP. delta는 그 구간의 { apps, goals, assists }.
export function chunkXp(p, delta, { team, club }) {
  const raw = XP_BASE_PER_CHUNK + delta.apps * XP_PER_APP + delta.goals * XP_PER_GOAL + delta.assists * XP_PER_ASSIST;
  return raw * ageXpFactor(p.age) * facilityEffects(club).xpMultiplier * coachMul(team, p.position, 'xp');
}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test next/tests/growth.test.mjs`
Expected: PASS (7 tests). 이어서 `node --test next/tests/*.test.mjs`로 앞선 테스트도 그대로 통과하는지 확인한다(110개).

- [ ] **Step 6: 커밋**

```bash
git add next/engine/constants.mjs next/engine/growth.mjs next/tests/growth.test.mjs
git commit -m "feat(next): XP·레벨업·구간 XP(나이·시설·코치 배율)"
```

---

### Task 2: 컨디션·부상·휴식·사기와 구간 갱신

**Files:**
- Create: `next/engine/condition.mjs`
- Test: `next/tests/condition.test.mjs`

**Interfaces:**
- Consumes: Task 1 `addXp` `chunkXp` `coachMul`, 계획 2 `askingSalary`, 계획 3 `facilityEffects`, 계획 1 `createPlayer` `fillerLevel` `randInt`
- Produces: `isInjured(p)`, `isAvailable(p)`, `teamMorale(team)`, `snapshotStats(team) -> Map`, `setRest(team, ids)`, `lineupView(team, rng) -> 대체 선수가 들어간 팀 보기`, `nextCondition(p, { played, rounds, fatigue })`, `rollInjury(p, rng, { injuryMul, healMultiplier })`, `nextMood(p, delta, { rested, wasInjured, coachMood })`, `chunkStep({ team, before, rng, club, rounds }) -> 요약[]`. 구간 흐름: `setRest` → `snapshotStats` → `lineupView`를 리그에 끼워 `playChunk` → 원래 팀 복귀 → `chunkStep`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/condition.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createTeam } from '../engine/team.mjs';
import { createClub } from '../engine/economy.mjs';
import { createLeague, isSeasonOver, playChunk } from '../engine/league.mjs';
import { askingSalary } from '../engine/contract.mjs';
import { teamRatings } from '../engine/ratings.mjs';
import {
  chunkStep, isAvailable, lineupView, nextCondition, nextMood, rollInjury, setRest, snapshotStats, teamMorale,
} from '../engine/condition.mjs';

const mk = (seed = 1) => createTeam({ rng: createRng(seed), id: 'A' });
const pay = (team) => team.stars.forEach((p) => { p.contract = { salary: askingSalary(p), years: 3 }; });

test('쉬게 지정한 스타는 빠지고 지정은 덮어쓴다. 남의 선수 id는 오류', () => {
  const team = mk();
  setRest(team, [team.stars[0].id, team.stars[1].id]);
  assert.equal(team.stars.filter((p) => !isAvailable(p)).length, 2);
  setRest(team, [team.stars[2].id]);
  assert.equal(team.stars.filter((p) => !isAvailable(p)).length, 1);
  assert.throws(() => setRest(team, ['ghost']), /스타가 아닙니다/);
});

test('뛰는 11명: 쉬는 스타 자리를 같은 포지션 대체 선수가 메우고 골키퍼도 1명이다', () => {
  const team = mk(2);
  const gk = team.stars.find((p) => p.position === 'GK');
  setRest(team, [gk.id]);
  const view = lineupView(team, createRng(2));
  assert.equal(view.lineup.length, 11);
  assert.equal(view.lineup.filter((p) => p.position === 'GK').length, 1);
  assert.ok(!view.lineup.includes(gk));
  assert.equal(lineupView(team, createRng(9)).lineup.at(-1), view.lineup.at(-1)); // 대체 선수는 보관된다
});

test('스타 전원이 빠져도 11명이 뛰고 전력은 코치 기본값으로 떨어진다', () => {
  const team = mk(3);
  const full = teamRatings(team);
  setRest(team, team.stars.map((p) => p.id));
  const view = lineupView(team, createRng(3));
  assert.equal(view.lineup.length, 11);
  assert.equal(view.stars.length, 0);
  assert.ok(teamRatings(view).attack < full.attack);
});

test('리그에서 view로 한 구간을 돌리면 쉰 스타는 출전하지 않고 대체 선수가 뛴다', () => {
  const rng = createRng(4);
  const teams = Array.from({ length: 20 }, (_, i) => createTeam({ rng, id: `T${i}` }));
  const league = createLeague(teams);
  const mine = teams[0];
  const rested = mine.stars[4];
  setRest(mine, [rested.id]);
  const view = lineupView(mine, rng);
  league.teams.set('T0', view);
  playChunk(league, rng);
  league.teams.set('T0', mine);
  assert.equal(rested.stats.apps, 0);
  assert.equal(mine.subs.FW1.stats.apps, 14);
  assert.equal(mine.stars[0].stats.apps, 14);
  assert.ok(!isSeasonOver(league));
});

test('컨디션: 뛰면 줄고(14라운드 NORMAL 약 -10), HARD는 더 줄고, 쉬면 35 회복하며 0~100을 지킨다', () => {
  const p = { condition: 100 };
  assert.ok(Math.abs(nextCondition(p, { played: true, rounds: 14, fatigue: 1 }) - 89.8) < 1e-9);
  assert.ok(nextCondition(p, { played: true, rounds: 14, fatigue: 1.4 }) < 84);
  assert.equal(nextCondition({ condition: 50 }, { played: false, rounds: 14, fatigue: 1 }), 85);
  assert.equal(nextCondition({ condition: 90 }, { played: false, rounds: 14, fatigue: 1 }), 100);
  assert.equal(nextCondition({ condition: 3 }, { played: true, rounds: 14, fatigue: 2 }), 0);
});

test('부상: 컨디션이 낮을수록, 강도가 높을수록 자주 다치고 회복 구간은 1~2(재활 시설이 좋으면 1)', () => {
  const rate = (cond, injuryMul = 1, heal = 1) => {
    const rng = createRng(5);
    let n = 0;
    for (let i = 0; i < 4000; i += 1) n += rollInjury({ condition: cond }, rng, { injuryMul, healMultiplier: heal }) ? 1 : 0;
    return n;
  };
  assert.ok(rate(20) > rate(90) * 1.8);
  assert.ok(rate(90, 1.3) > rate(90, 1));
  const p = { condition: 0 };
  const rng = createRng(6);
  while (!rollInjury(p, rng, { injuryMul: 1, healMultiplier: 1.9 })) { /* 다칠 때까지 */ }
  assert.equal(p.injury.chunksLeft, 1);
});

test('사기: 득점·출전은 올리고 벤치·부상·저연봉은 내리며 0~100을 지킨다', () => {
  const team = mk(7);
  pay(team);
  const p = team.stars[0];
  const none = { apps: 0, goals: 0, assists: 0 };
  assert.equal(nextMood(p, { apps: 14, goals: 3, assists: 2 }, { rested: false, wasInjured: false, coachMood: 0 }), 70 + 0.5 + 3 + 1);
  assert.equal(nextMood(p, none, { rested: false, wasInjured: false, coachMood: 0 }), 68);
  assert.equal(nextMood(p, none, { rested: true, wasInjured: false, coachMood: 0 }), 70);
  assert.equal(nextMood(p, none, { rested: false, wasInjured: true, coachMood: 0 }), 69);
  p.contract.salary = 0; // 요구 연봉의 80% 미만
  assert.equal(nextMood(p, none, { rested: true, wasInjured: false, coachMood: 0 }), 69);
  p.mood = 99.9;
  assert.equal(nextMood(p, { apps: 14, goals: 9, assists: 0 }, { rested: false, wasInjured: false, coachMood: 0 }), 100);
  p.mood = 0.2;
  assert.equal(nextMood(p, none, { rested: false, wasInjured: false, coachMood: -5 }), 0);
});

test('chunkStep: 한 구간 뒤 XP·컨디션이 갱신되고 쉬는 지정이 풀리며 다친 선수는 구간마다 회복한다', () => {
  const rng = createRng(8);
  const teams = Array.from({ length: 20 }, (_, i) => createTeam({ rng, id: `T${i}` }));
  const league = createLeague(teams);
  const mine = teams[0];
  pay(mine);
  const club = createClub();
  const injuredStar = mine.stars[1];
  injuredStar.injury = { chunksLeft: 1 };
  const resting = mine.stars[2];
  setRest(mine, [resting.id]);
  const before = snapshotStats(mine);
  league.teams.set('T0', lineupView(mine, rng));
  playChunk(league, rng);
  league.teams.set('T0', mine);
  const summary = chunkStep({ team: mine, before, rng, club, rounds: 14 });
  assert.equal(summary.length, 6);
  assert.ok(summary.every((s) => s.xp > 0));
  assert.equal(resting.resting, false);
  assert.equal(resting.condition, 100);
  assert.equal(injuredStar.injury, undefined);
  assert.equal(injuredStar.condition, 100);
  const played = mine.stars[0];
  assert.ok(played.condition < 100 && played.condition > 80);
});

test('팀 사기는 스타 사기의 평균이고 스타가 없으면 0이다', () => {
  const team = mk(9);
  team.stars.forEach((p, i) => { p.mood = 50 + i * 10; });
  assert.equal(teamMorale(team), 75);
  assert.equal(teamMorale({ stars: [] }), 0);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/condition.test.mjs`
Expected: FAIL (`Cannot find module '../engine/condition.mjs'`)

- [ ] **Step 3: 구현** — `next/engine/condition.mjs`

```js
import {
  FATIGUE_PER_ROUND, INJURY_BASE, INJURY_MAX_CHUNKS, NATURAL_RECOVERY, REST_RECOVERY, UNDERPAID_RATIO,
} from './constants.mjs';
import { askingSalary } from './contract.mjs';
import { facilityEffects } from './economy.mjs';
import { addXp, chunkXp, coachMul } from './growth.mjs';
import { createPlayer } from './player.mjs';
import { randInt } from './rng.mjs';
import { fillerLevel } from './team.mjs';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const isInjured = (p) => (p.injury?.chunksLeft ?? 0) > 0;
export const isAvailable = (p) => !p.resting && !isInjured(p);
export const teamMorale = (team) => (team.stars.length === 0 ? 0 : team.stars.reduce((s, p) => s + p.mood, 0) / team.stars.length);

// 구간 시작 전에 기록을 찍어 두면 끝난 뒤 그 구간의 증가분을 구할 수 있다.
export const snapshotStats = (team) => new Map(team.lineup.map((p) => [p.id, { ...p.stats }]));
const statDelta = (p, before) => {
  const b = before.get(p.id) ?? { apps: 0, goals: 0, assists: 0 };
  return { apps: p.stats.apps - b.apps, goals: p.stats.goals - b.goals, assists: p.stats.assists - b.assists };
};

// 이번 구간에 쉬게 할 스타를 지정한다(이전 지정은 모두 덮어쓴다). 이 팀 스타가 아니면 오류.
export function setRest(team, ids) {
  for (const id of ids) if (!team.stars.some((p) => p.id === id)) throw new Error(`이 팀의 스타가 아닙니다: ${id}`);
  for (const p of team.stars) p.resting = ids.includes(p.id);
}

// 쉬는 스타와 다친 스타 자리를 같은 포지션 대체 선수가 메운 팀 보기. simulateMatch에 그대로 넘길 수 있다.
// 대체 선수는 team.subs에 보관해 기록이 이어진다. 리그에서는 league.teams.set(id, view) 후 playChunk, 끝나면 원래 팀을 되돌린다.
export function lineupView(team, rng) {
  const available = team.stars.filter(isAvailable);
  const fillers = team.lineup.slice(team.stars.length);
  const used = {};
  const subs = team.stars.filter((p) => !isAvailable(p)).map((p) => {
    used[p.position] = (used[p.position] ?? 0) + 1;
    const key = `${p.position}${used[p.position]}`;
    team.subs ??= {};
    team.subs[key] ??= createPlayer({
      rng,
      id: `${team.id}-sub-${key}`,
      position: p.position,
      age: 25,
      level: fillerLevel(team.coaches.attack.stars, team.coaches.defense.stars),
    });
    return team.subs[key];
  });
  return { ...team, stars: available, lineup: [...available, ...fillers, ...subs] };
}

// 뛴 선수: 라운드 x 1.3 x 강도 배율만큼 줄고 8 회복. 쉬거나 다친 선수: 35 회복.
export function nextCondition(p, { played, rounds, fatigue }) {
  if (!played) return clamp(p.condition + REST_RECOVERY, 0, 100);
  return clamp(p.condition - rounds * FATIGUE_PER_ROUND * fatigue + NATURAL_RECOVERY, 0, 100);
}

// 뛴 선수만 다친다. 컨디션이 50 아래면 확률이 올라가고, 재활 시설이 좋으면 회복 구간이 줄어든다(최소 1).
export function rollInjury(p, rng, { injuryMul, healMultiplier }) {
  const tired = p.condition < 50 ? 1 + (50 - p.condition) / 25 : 1;
  if (rng() >= INJURY_BASE * injuryMul * tired) return false;
  p.injury = { chunksLeft: Math.max(1, Math.round(randInt(rng, 1, INJURY_MAX_CHUNKS) / healMultiplier)) };
  return true;
}

// 사기: 출전 +0.5, 쉼 0, 다쳐서 못 뜀 -1, 벤치 -2. 득점 +1, 도움 +0.5, 코치 강도·특성, 연봉이 요구액의 80% 미만이면 -1.
export function nextMood(p, d, { rested, wasInjured, coachMood }) {
  let delta = d.apps > 0 ? 0.5 : (wasInjured ? -1 : (rested ? 0 : -2));
  delta += d.goals + d.assists * 0.5 + coachMood;
  if (p.contract.salary < askingSalary(p) * UNDERPAID_RATIO) delta -= 1;
  return clamp(p.mood + delta, 0, 100);
}

// 구간 하나가 끝난 뒤 스타 전원의 XP·컨디션·사기·부상을 한꺼번에 갱신한다.
// before: snapshotStats(team), rounds: 이 구간 라운드 수(14/14/10). 요약 목록을 돌려준다.
export function chunkStep({ team, before, rng, club, rounds }) {
  const heal = facilityEffects(club).healMultiplier;
  const summary = team.stars.map((p) => {
    const wasInjured = isInjured(p);
    const rested = Boolean(p.resting);
    const d = statDelta(p, before);
    const played = d.apps > 0;
    const xp = chunkXp(p, d, { team, club });
    const levelUps = addXp(p, xp, rng);
    p.condition = nextCondition(p, { played, rounds, fatigue: coachMul(team, p.position, 'fatigue') });
    const moodBefore = p.mood;
    p.mood = nextMood(p, d, { rested, wasInjured, coachMood: coachMul(team, p.position, 'mood') });
    if (wasInjured) {
      p.injury.chunksLeft -= 1;
      if (p.injury.chunksLeft <= 0) delete p.injury;
    }
    const injured = played && rollInjury(p, rng, { injuryMul: coachMul(team, p.position, 'injury'), healMultiplier: heal });
    p.resting = false;
    return { id: p.id, xp, levelUps, condition: p.condition, moodDelta: p.mood - moodBefore, injured };
  });
  return summary;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test next/tests/condition.test.mjs`
Expected: PASS (9 tests). 이어서 `node --test next/tests/*.test.mjs`로 앞선 테스트도 그대로 통과하는지 확인한다(119개).

- [ ] **Step 5: 커밋**

```bash
git add next/engine/condition.mjs next/tests/condition.test.mjs
git commit -m "feat(next): 컨디션·부상·휴식 지정·사기와 구간 갱신"
```

---

### Task 3: 나이·하락·은퇴·은퇴 제안

**Files:**
- Create: `next/engine/aging.mjs`
- Test: `next/tests/aging.test.mjs`

**Interfaces:**
- Consumes: 계획 2 `setStars`, 계획 1 `overall` `randInt`, Task 1 상수 `DECLINE_AGE` `MAX_AGE` `RETIRE_CHANCE`
- Produces: `declineAmount(age)`, `ageUp(p, rng)`, `retirementChance(age)`, `shouldRetire(p, rng)`, `evaluateRetireOffer(p) -> { accepted, reason }`, `retire(team, rng, player)`, `endOfSeason(team, rng) -> 은퇴한 선수[]`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/aging.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createPlayer, overall } from '../engine/player.mjs';
import { createTeam } from '../engine/team.mjs';
import { ageUp, declineAmount, endOfSeason, evaluateRetireOffer, retire, retirementChance } from '../engine/aging.mjs';

const player = (age, seed = 1) => createPlayer({ rng: createRng(seed), id: 'p', position: 'MF', age, level: 70 });

test('하락량: 32세까지 0, 33~35세 1, 36세 이상 2', () => {
  assert.deepEqual([32, 33, 35, 36, 40].map(declineAmount), [0, 1, 1, 2, 2]);
});

test('32세 이하는 한 살만 먹고 능력이 그대로이며, 33세가 되면 능력이 줄고 성장 여지가 0이 된다', () => {
  const young = player(25);
  const before = { ...young.attrs };
  ageUp(young, createRng(2));
  assert.equal(young.age, 26);
  assert.deepEqual(young.attrs, before);
  const vet = player(32);
  const was = overall(vet);
  ageUp(vet, createRng(3));
  assert.equal(vet.age, 33);
  assert.ok(overall(vet) < was);
  assert.equal(vet.potential, Math.round(overall(vet)));
});

test('능력은 1 아래로 내려가지 않는다', () => {
  const p = player(36);
  for (const k of Object.keys(p.attrs)) p.attrs[k] = 1;
  ageUp(p, createRng(4));
  for (const v of Object.values(p.attrs)) assert.equal(v, 1);
});

test('은퇴 확률은 나이에 따라 오르고 40세는 강제다', () => {
  const chances = [32, 33, 35, 37, 39, 40, 45].map(retirementChance);
  assert.deepEqual(chances, [0, 0.05, 0.2, 0.45, 0.8, 1, 1]);
});

test('은퇴 제안: 33세 미만 거절, 33~37세는 사기에 따라, 38세부터 수락', () => {
  const p = player(30);
  assert.deepEqual(evaluateRetireOffer(p), { accepted: false, reason: 'young' });
  const old = player(35);
  old.mood = 65;
  assert.equal(evaluateRetireOffer(old).accepted, true);
  old.mood = 66;
  assert.deepEqual(evaluateRetireOffer(old), { accepted: false, reason: 'mood' });
  const ancient = player(38);
  ancient.mood = 100;
  assert.equal(evaluateRetireOffer(ancient).accepted, true);
});

test('retire: 스타에서 빠지고 라인업은 11명을 유지한다. 남의 선수는 오류', () => {
  const rng = createRng(5);
  const team = createTeam({ rng, id: 'A' });
  const gone = team.stars[3];
  assert.equal(retire(team, rng, gone), gone);
  assert.equal(team.stars.length, 5);
  assert.equal(team.lineup.length, 11);
  assert.throws(() => retire(team, rng, gone), /스타가 아닙니다/);
});

test('시즌 종료: 전원 한 살, 컨디션 100, 부상 완치, 사기는 70 쪽으로 회복한다', () => {
  const rng = createRng(6);
  const team = createTeam({ rng, id: 'A' });
  const p = team.stars[0];
  p.condition = 20;
  p.injury = { chunksLeft: 2 };
  p.mood = 20;
  const age = p.age;
  endOfSeason(team, rng);
  assert.equal(p.age, age + 1);
  assert.equal(p.condition, 100);
  assert.equal(p.injury, undefined);
  assert.equal(p.mood, 30);
});

test('시즌 종료: 40세는 반드시 은퇴하고 명단과 라인업이 정리된다. 젊은 팀은 아무도 은퇴하지 않는다', () => {
  const rng = createRng(7);
  const team = createTeam({ rng, id: 'A' });
  assert.deepEqual(endOfSeason(team, rng), []);
  const old = team.stars[0];
  old.age = 39; // 이번 시즌 종료로 40세
  const retired = endOfSeason(team, rng);
  assert.ok(retired.includes(old));
  assert.ok(!team.stars.includes(old));
  assert.equal(team.stars.length, 6 - retired.length);
  assert.equal(team.lineup.length, 11);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/aging.test.mjs`
Expected: FAIL (`Cannot find module '../engine/aging.mjs'`)

- [ ] **Step 3: 구현** — `next/engine/aging.mjs`

```js
import { DECLINE_AGE, MAX_AGE, RETIRE_CHANCE } from './constants.mjs';
import { overall } from './player.mjs';
import { randInt } from './rng.mjs';
import { setStars } from './roster.mjs';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 33~35세는 -1, 36세 이상은 -2씩 능력 2개가 줄어든다.
export const declineAmount = (age) => (age < DECLINE_AGE ? 0 : (age < 36 ? 1 : 2));

// 한 살 먹는다. 33세부터 하락하고 성장 여지(잠재력)는 현재 능력으로 맞춰진다.
export function ageUp(p, rng) {
  p.age += 1;
  const drop = declineAmount(p.age);
  if (drop > 0) {
    const keys = Object.keys(p.attrs);
    for (let i = 0; i < 2; i += 1) {
      const key = keys[randInt(rng, 0, keys.length - 1)];
      p.attrs[key] = clamp(p.attrs[key] - drop, 1, 99);
    }
    p.potential = Math.round(overall(p));
  }
}

// 나이별 은퇴 확률. 40세 이상은 강제(1).
export const retirementChance = (age) => (age >= MAX_AGE ? 1 : (RETIRE_CHANCE[age] ?? 0));
export const shouldRetire = (p, rng) => rng() < retirementChance(p.age);

// 내가 은퇴를 제안했을 때 선수의 대답: 33세 미만은 거절, 33~37세는 사기가 (50 + 8 x (나이 - 33)) 미만이면 수락, 38세부터는 수락.
export function evaluateRetireOffer(p) {
  if (p.age < DECLINE_AGE) return { accepted: false, reason: 'young' };
  if (p.age >= 38 || p.mood < 50 + (p.age - DECLINE_AGE) * 8) return { accepted: true, reason: null };
  return { accepted: false, reason: 'mood' };
}

// 은퇴시킨다: 스타 명단에서 빼고(명예의 전당 후보로) 선수를 돌려준다.
export function retire(team, rng, player) {
  if (!team.stars.includes(player)) throw new Error('이 팀의 스타가 아닙니다');
  setStars(team, rng, team.stars.filter((p) => p !== player));
  return player;
}

// 시즌이 끝날 때: 나이 +1과 하락, 컨디션 회복, 부상 완치, 사기가 70으로 20%씩 돌아옴, 확률 은퇴.
// 은퇴한 선수 목록을 돌려준다(계약 만료와 FA 처리는 계획 2의 tickContracts를 따로 부른다).
export function endOfSeason(team, rng) {
  for (const p of team.stars) {
    ageUp(p, rng);
    p.condition = 100;
    delete p.injury;
    p.resting = false;
    p.mood += (70 - p.mood) * 0.2;
  }
  const retired = team.stars.filter((p) => shouldRetire(p, rng));
  if (retired.length > 0) setStars(team, rng, team.stars.filter((p) => !retired.includes(p)));
  return retired;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test next/tests/aging.test.mjs`
Expected: PASS (8 tests). 이어서 `node --test next/tests/*.test.mjs`로 앞선 테스트도 그대로 통과하는지 확인한다(127개).

- [ ] **Step 5: 커밋**

```bash
git add next/engine/aging.mjs next/tests/aging.test.mjs
git commit -m "feat(next): 나이·능력 하락·확률 은퇴·은퇴 제안과 시즌 종료 처리"
```

---

### Task 4: 기자회견·선수 면담

**Files:**
- Create: `next/engine/events.mjs`
- Test: `next/tests/events.test.mjs`

**Interfaces:**
- Consumes: 계획 3 `earn` `spend`
- Produces: `pressSituation({ won, lost })`, `pickPress(rng, situation) -> 질문`, `interviewFor(rng, player) -> 면담 | null`, `canChoose(club, option)`, `applyChoice({ club, team, option, player })`. 질문과 면담은 `{ id, text, options: [{ label, effects }] }`이고 `effects`는 `teamMood` `playerMood` `fans` `coins` `rest` 중 일부

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/events.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createTeam } from '../engine/team.mjs';
import { createClub } from '../engine/economy.mjs';
import { applyChoice, canChoose, interviewFor, pickPress, pressSituation } from '../engine/events.mjs';

const mk = () => createTeam({ rng: createRng(1), id: 'A' });

test('기자회견 상황: 승패 차이 +4 이상 연승, -4 이하 부진, 그 사이 평범', () => {
  assert.equal(pressSituation({ won: 9, lost: 5 }), 'winning');
  assert.equal(pressSituation({ won: 8, lost: 5 }), 'even');
  assert.equal(pressSituation({ won: 4, lost: 8 }), 'losing');
  assert.equal(pressSituation({ won: 5, lost: 8 }), 'even');
});

test('기자회견 질문은 상황마다 선택지 2개이고 모르는 상황은 오류다', () => {
  for (const s of ['winning', 'losing', 'even']) {
    const q = pickPress(createRng(2), s);
    assert.equal(q.options.length, 2);
    assert.ok(q.text.length > 0);
  }
  assert.throws(() => pickPress(createRng(2), 'weird'), /알 수 없는 상황/);
});

test('선택 효과: 팀 사기·팬·코인이 적용되고 0~100을 벗어나지 않는다', () => {
  const team = mk();
  const club = createClub({ coins: 5, fans: 99 });
  applyChoice({ club, team, option: { effects: { teamMood: 40, fans: 5, coins: 10 } } });
  assert.equal(club.coins, 15);
  assert.equal(club.fans, 100);
  assert.ok(team.stars.every((p) => p.mood === 100));
  applyChoice({ club, team, option: { effects: { teamMood: -200, fans: -200 } } });
  assert.ok(team.stars.every((p) => p.mood === 0));
  assert.equal(club.fans, 0);
});

test('코인이 모자란 선택은 막고 아무것도 바꾸지 않는다', () => {
  const team = mk();
  const club = createClub({ coins: 5, fans: 50 });
  const player = team.stars[0];
  const option = { effects: { coins: -10, playerMood: 12, fans: 3 } };
  assert.equal(canChoose(club, option), false);
  assert.throws(() => applyChoice({ club, team, option, player }), /코인이 모자랍니다/);
  assert.equal(club.coins, 5);
  assert.equal(club.fans, 50);
  assert.equal(player.mood, 70);
});

test('면담 효과를 면담 선수 없이 적용하면 오류다', () => {
  const team = mk();
  assert.throws(() => applyChoice({ club: createClub(), team, option: { effects: { playerMood: 5 } } }), /면담 선수/);
});

test('면담 상황: 사기 낮음 > 컨디션 낮음 > 득점 슬럼프 순으로 걸리고, 평범하면 광고 아니면 없음', () => {
  const rng = createRng(3);
  const p = mk().stars.find((s) => s.position === 'FW');
  p.mood = 40;
  p.condition = 10;
  assert.equal(interviewFor(rng, p).id, 'iv-unhappy');
  p.mood = 70;
  assert.equal(interviewFor(rng, p).id, 'iv-tired');
  p.condition = 100;
  p.stats = { apps: 12, goals: 0, assists: 1 };
  assert.equal(interviewFor(rng, p).id, 'iv-slump');
  p.stats = { apps: 12, goals: 3, assists: 1 };
  const results = new Set(Array.from({ length: 200 }, () => interviewFor(rng, p)?.id ?? null));
  assert.deepEqual([...results].sort(), ['iv-ad', null]);
  p.mood = 59;
  assert.equal(interviewFor(rng, p), null);
});

test('면담 선택: 쉬게 하면 다음 구간 휴식이 지정되고 사기가 오르며, 광고는 코인을 주고 사기를 깎는다', () => {
  const team = mk();
  const club = createClub({ coins: 0 });
  const p = team.stars[0];
  p.condition = 10;
  const tired = interviewFor(createRng(4), p);
  applyChoice({ club, team, option: tired.options[0], player: p });
  assert.equal(p.resting, true);
  assert.equal(p.mood, 76);
  const q = team.stars[1];
  const ad = { effects: { coins: 15, playerMood: -5 } };
  applyChoice({ club, team, option: ad, player: q });
  assert.equal(club.coins, 15);
  assert.equal(q.mood, 65);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/events.test.mjs`
Expected: FAIL (`Cannot find module '../engine/events.mjs'`)

- [ ] **Step 3: 구현** — `next/engine/events.mjs`

```js
import { earn, spend } from './economy.mjs';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 효과는 선택 전에 아이콘으로 보여 주므로 데이터로 둔다.
// effects: teamMood(스타 전원 사기), playerMood(면담 선수 사기), fans, coins, rest(다음 구간 휴식)
const PRESS = {
  winning: [
    { id: 'win-secret', text: '연승 비결이 뭔가요?', options: [
      { label: '선수들 덕분입니다', effects: { teamMood: 3 } },
      { label: '제 전술 덕분입니다', effects: { fans: 2, teamMood: -1 } },
    ] },
    { id: 'win-title', text: '우승 도전, 가능할까요?', options: [
      { label: '자신 있습니다', effects: { fans: 3, teamMood: 1 } },
      { label: '한 경기씩 가겠습니다', effects: { teamMood: 2 } },
    ] },
  ],
  losing: [
    { id: 'lose-blame', text: '부진의 책임은 누구에게 있나요?', options: [
      { label: '제 책임입니다', effects: { teamMood: 3, fans: -1 } },
      { label: '선수들이 더 해줘야죠', effects: { teamMood: -4, fans: 1 } },
    ] },
    { id: 'lose-job', text: '감독직을 지킬 수 있을까요?', options: [
      { label: '결과로 증명하겠습니다', effects: { fans: 1 } },
      { label: '구단에 맡기겠습니다', effects: { fans: -2, teamMood: -1 } },
    ] },
  ],
  even: [
    { id: 'even-goal', text: '다음 구간 목표는요?', options: [
      { label: '상위권 도약', effects: { fans: 2, teamMood: -1 } },
      { label: '안정적 운영', effects: { teamMood: 1 } },
    ] },
    { id: 'even-sponsor', text: '스폰서 행사 참석 요청이 왔습니다', options: [
      { label: '참석한다', effects: { coins: 10, teamMood: -2 } },
      { label: '거절한다', effects: { teamMood: 1 } },
    ] },
  ],
};

const INTERVIEWS = {
  unhappy: { id: 'iv-unhappy', text: '출전과 대우에 불만이 있습니다', options: [
    { label: '연봉 인상을 약속한다', effects: { coins: -10, playerMood: 12 } },
    { label: '기다리라고 한다', effects: { playerMood: -4 } },
  ] },
  tired: { id: 'iv-tired', text: '몸이 많이 무겁습니다', options: [
    { label: '다음 구간은 쉬게 한다', effects: { playerMood: 6, rest: true } },
    { label: '버텨 달라고 한다', effects: { playerMood: -5 } },
  ] },
  slump: { id: 'iv-slump', text: '골이 안 터져서 답답합니다', options: [
    { label: '격려한다', effects: { playerMood: 5 } },
    { label: '채찍질한다', effects: { playerMood: -3 } },
  ] },
  ad: { id: 'iv-ad', text: '광고 촬영 제안이 왔습니다', options: [
    { label: '촬영을 수락한다', effects: { coins: 15, playerMood: -5 } },
    { label: '거절한다', effects: { playerMood: 3 } },
  ] },
};

// 구간 성적(승 - 패)이 +4 이상이면 연승 분위기, -4 이하면 부진, 그 사이는 평범.
export const pressSituation = ({ won, lost }) => (won - lost >= 4 ? 'winning' : (won - lost <= -4 ? 'losing' : 'even'));

export function pickPress(rng, situation) {
  const list = PRESS[situation];
  if (!list) throw new Error(`알 수 없는 상황: ${situation}`);
  return list[Math.floor(rng() * list.length)];
}

// 선수 상태에 맞는 면담 하나. 사기 낮음 > 컨디션 낮음 > 득점 슬럼프 > 광고(사기 60 이상, 25%) 순이고 없으면 null.
export function interviewFor(rng, p) {
  if (p.mood < 45) return INTERVIEWS.unhappy;
  if (p.condition < 50) return INTERVIEWS.tired;
  if (p.stats.apps >= 10 && p.stats.goals === 0 && (p.position === 'FW' || p.position === 'MF')) return INTERVIEWS.slump;
  if (p.mood >= 60 && rng() < 0.25) return INTERVIEWS.ad;
  return null;
}

// 코인이 모자라 못 고르는 선택지인지 미리 알려 준다(화면에서 흐리게 표시).
export const canChoose = (club, option) => (option.effects.coins ?? 0) + club.coins >= 0;

// 선택을 적용한다. 코인이 모자라면 아무것도 바꾸지 않고 오류. player는 면담 대상(기자회견은 생략).
export function applyChoice({ club, team, option, player }) {
  const e = option.effects;
  if (!canChoose(club, option)) throw new Error('코인이 모자랍니다');
  if ((e.playerMood !== undefined || e.rest) && !player) throw new Error('면담 선수가 필요합니다');
  if (e.coins > 0) earn(club, e.coins);
  if (e.coins < 0) spend(club, -e.coins);
  if (e.fans) club.fans = clamp(club.fans + e.fans, 0, 100);
  if (e.teamMood) for (const p of team.stars) p.mood = clamp(p.mood + e.teamMood, 0, 100);
  if (e.playerMood) player.mood = clamp(player.mood + e.playerMood, 0, 100);
  if (e.rest) player.resting = true;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test next/tests/events.test.mjs`
Expected: PASS (7 tests). 이어서 `node --test next/tests/*.test.mjs`로 앞선 테스트도 그대로 통과하는지 확인한다(134개).

- [ ] **Step 5: 커밋**

```bash
git add next/engine/events.mjs next/tests/events.test.mjs
git commit -m "feat(next): 기자회견·선수 면담(효과 데이터, 코인 부족 시 선택 차단)"
```

---

### Task 5: 전체 확인

- [ ] **Step 1: 전체 테스트**

Run: `node --test next/tests/*.test.mjs`
Expected: PASS (134 tests, 0 fail: 앞선 계획의 103개 + 이 계획의 31개). 기존 게임: `node --test tests/*.test.mjs`도 그대로 통과.

## Self-Review

**Spec coverage** (이 계획이 맡는 부분)
- 5절 XP(경기 활약, 훈련 시설·코치, 나이, 시즌 종료) → Task 1 `chunkXp`(출전·득점·도움 + 시설 + 코치 + 나이), `addXp`. "시즌 종료 연출로 쌓이는 XP"는 연출과 같이 계획 7에서 `addXp`를 부르면 된다.
- 5절 나이 19~40, 33세부터 하락, 확률 은퇴, 40세 강제 → Task 3.
- 5절 사기(활약·출전·연봉·면담 선택) → Task 2 `nextMood`, Task 4. 팀 사기 → `teamMorale`.
- 5절 컨디션(연속 출전 하락, 낮으면 부상 확률↑), 휴식 지정, 부상 시 조연 출전 → Task 2.
- 6.5절 훈련 강도와 재활 시설의 부상·회복 영향 → Task 1·2(`coachMul`, `rollInjury`의 `healMultiplier`).
- 9절 기자회견(구간 후 매번), 선수 면담(상황별, 코인 vs 사기 딜레마), 은퇴 제안 → Task 4, Task 3 `evaluateRetireOffer`.
- 이 계획에서 하지 않는 것: 낮은 사기의 재계약 거절·경기력 하락 중 경기력 하락(전력 보정은 계획 1의 `modifier`가 이미 사기를 읽는다), 큰 순간 기자회견(우승·강등 위기 등)은 계획 5의 승강·시상 이벤트가 생긴 뒤 상황 키를 추가, 발롱도르 후보 등 수상 면담은 계획 6, 질문·면담 문구 추가와 화면은 계획 7.

**Placeholder scan:** 모든 단계에 실제 코드와 명령이 있다. "TBD" 없음.

**Type consistency:** 선수 상태 필드 `mood` `condition` `xp` `xpLevel` `injury: { chunksLeft }` `resting`은 계획 1의 `createPlayer`와 이 계획 모든 Task에서 같은 이름이다. `before`는 `snapshotStats`가 만드는 `Map(id -> { apps, goals, assists })`이고 `chunkStep`이 그대로 받는다. 팀 보기(`lineupView`)는 `simulateMatch`가 읽는 `id` `coaches` `stars` `lineup`을 모두 가진다. 이벤트 `effects` 키는 데이터와 `applyChoice`에서 같다.

**검증 메모:** 이 계획의 코드는 계획 3까지 끝난 `next/`를 임시 폴더에 복사해 `node --test`로 134개가 모두 통과하는 것을 확인한 뒤 옮겼다.

## 후속 계획 (서브프로젝트)

| 계획 | 내용 |
|---|---|
| 5 리그 세계 | 3단계 사다리, 승강·단판 승강전, AI 팀 생성·FA 이동, 8개 지역 챔피언스리그 |
| 6 상·기록 | 상 판정, 기록실, 트로피, 역대 우승팀, 명예의 전당, 은퇴식 |
| 7 화면 | 로스터·선수 상세·결과·프런트 오피스 등 |
| 8 시작·튜토리얼 | 스타 3명 배정 + 시작 드래프트, 튜토리얼, 런 종료 |
