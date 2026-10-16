# FM-Lite 코어 엔진 구현 계획 (계획 1/8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 새 게임 `next/`의 코어 엔진(선수 모델, 팀 전력, 경기 시뮬, 38경기 리그 시즌)을 테스트와 함께 만든다.

**Architecture:** 화면이 없는 순수 함수 모듈들. 모든 난수는 시드 고정 `createRng`를 받아 쓰므로 시뮬 테스트가 항상 같은 결과를 낸다. 팀 전력은 코치가 정하는 기본 레이팅 위에 스타 선수가 가산되는 공격력·수비력 두 축이고, 경기는 푸아송 득점 + 포지션 가중치로 득점·도움을 나눈다.

**Tech Stack:** 순수 ES 모듈(`.mjs`), Node 내장 테스트러너(`node --test`), 외부 의존성 0, 빌드 없음.

**Spec:** `docs/superpowers/specs/2026-10-16-fm-lite-next-design.md` (5절 선수 모델, 6절 득점·도움, 6.5절 팀 전력과 승패, 2절 시즌 구조)

## Global Constraints

- 모든 새 파일은 `next/` 아래에만 만든다. 기존 게임(`ui/`, `engine/`, `data/`, `tests/`)은 건드리지 않는다.
- 빌드 단계 없음, 순수 ES 모듈, npm 의존성 0. 테스트는 `node --test next/tests/*.test.mjs`.
- 엔진 코드에서 `Math.random`, `document`, `window`, `localStorage`를 쓰지 않는다. 난수는 항상 `createRng(seed)`로 만든 `rng`를 인자로 받는다.
- 주석과 사용자에게 보이는 문구는 한국어. 문구에 em 대시를 쓰지 않는다.
- 시즌은 20팀 38라운드를 14 / 14 / 10 구간으로 끊는다. 속성은 포지션별 4개(0~100), 별은 0.5 단위(0.5~5).
- 수치(득점 기본값, 가중치 등)는 이 계획의 값이 **초기값**이며 `next/engine/constants.mjs` 한 곳에서만 정의한다.

## Review Focus

실행 중 가장 빠뜨리기 쉬운 입력·실패 상황이다. 각 줄은 해당 태스크에서 테스트로 고정한다.

1. **스타에 골키퍼가 없는 팀**: 라인업에 골키퍼가 정확히 1명 있어야 한다 (Task 4).
2. **스타 6명이 전부 같은 포지션**: 라인업은 항상 11명이고 골키퍼와 수비수가 있어야 한다 (Task 4).
3. **팀 수가 홀수이거나 팀 id가 중복**: 일정 생성이 명확한 오류로 실패해야 한다 (Task 5).
4. **시즌이 끝난 뒤 `playChunk` 호출**: 조용히 넘어가지 않고 오류를 내야 한다 (Task 5).
5. **사기·컨디션이 0 또는 100인 극단값**: 보정 배율이 정해진 범위를 벗어나지 않아야 한다 (Task 3).

---

### Task 1: 시드 난수 모듈

**Files:**
- Create: `next/engine/rng.mjs`
- Test: `next/tests/rng.test.mjs`

**Interfaces:**
- Produces: `createRng(seed) -> () => number(0 이상 1 미만)`, `randInt(rng, min, max)`, `gauss(rng)`, `poisson(rng, lambda)`, `weightedPick(rng, items, weightFn)`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/rng.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, randInt, gauss, poisson, weightedPick } from '../engine/rng.mjs';

test('같은 시드는 같은 수열을 만든다', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 5; i += 1) assert.equal(a(), b());
});

test('값은 0 이상 1 미만이다', () => {
  const rng = createRng(7);
  for (let i = 0; i < 1000; i += 1) {
    const v = rng();
    assert.ok(v >= 0 && v < 1);
  }
});

test('randInt는 양 끝을 포함한다', () => {
  const rng = createRng(3);
  const seen = new Set();
  for (let i = 0; i < 500; i += 1) seen.add(randInt(rng, 1, 3));
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
});

test('gauss 평균은 0 근처다', () => {
  const rng = createRng(11);
  let sum = 0;
  for (let i = 0; i < 5000; i += 1) sum += gauss(rng);
  assert.ok(Math.abs(sum / 5000) < 0.1);
});

test('poisson 평균은 lambda 근처다', () => {
  const rng = createRng(5);
  let sum = 0;
  for (let i = 0; i < 5000; i += 1) sum += poisson(rng, 1.3);
  assert.ok(Math.abs(sum / 5000 - 1.3) < 0.1);
});

test('weightedPick은 가중치 0인 항목을 뽑지 않는다', () => {
  const rng = createRng(9);
  for (let i = 0; i < 200; i += 1) {
    const item = weightedPick(rng, ['a', 'b'], (x) => (x === 'a' ? 0 : 1));
    assert.equal(item, 'b');
  }
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/rng.test.mjs`
Expected: FAIL (`Cannot find module '../engine/rng.mjs'`)

- [ ] **Step 3: 구현** — `next/engine/rng.mjs`

```js
// 시드 고정 난수. 같은 시드면 항상 같은 결과라서 시뮬 테스트가 흔들리지 않는다.
export function createRng(seed = 1) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

// 표준정규분포 난수(Box-Muller)
export function gauss(rng) {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

// 푸아송 분포 난수(Knuth). lambda가 작을 때(득점 수준) 쓴다.
export function poisson(rng, lambda) {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > limit);
  return k - 1;
}

// weightFn(item)이 클수록 잘 뽑힌다.
export function weightedPick(rng, items, weightFn) {
  const weights = items.map(weightFn);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test next/tests/rng.test.mjs`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add next/engine/rng.mjs next/tests/rng.test.mjs
git commit -m "feat(next): 시드 고정 난수 모듈"
```

---

### Task 2: 상수와 선수 모델

**Files:**
- Create: `next/engine/constants.mjs`, `next/engine/player.mjs`
- Test: `next/tests/player.test.mjs`

**Interfaces:**
- Consumes: Task 1의 `gauss`
- Produces: `POSITIONS`, `ATTRIBUTES`, `SEASON`, `COACH_BASE_PER_STAR`, `STAR_MAX_BONUS`, `BASE_GOALS`, `HOME_BOOST`, `GOAL_SCALE`, `ASSIST_CHANCE`, `SCORER_POS_WEIGHT`, `ASSIST_POS_WEIGHT`; `overall(player) -> 0~100`, `starsOf(value) -> 0.5~5`, `createPlayer({ rng, id, position, age, level }) -> player`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/player.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { ATTRIBUTES } from '../engine/constants.mjs';
import { createPlayer, overall, starsOf } from '../engine/player.mjs';

test('포지션에 맞는 속성 4개를 가진다', () => {
  const p = createPlayer({ rng: createRng(1), id: 'p1', position: 'FW' });
  assert.deepEqual(Object.keys(p.attrs), ATTRIBUTES.FW);
});

test('속성은 1~99 범위다', () => {
  const rng = createRng(2);
  for (let i = 0; i < 200; i += 1) {
    const p = createPlayer({ rng, id: `p${i}`, position: 'MF', level: 95 });
    for (const v of Object.values(p.attrs)) assert.ok(v >= 1 && v <= 99);
  }
});

test('level이 높을수록 평균 능력이 높다', () => {
  const rng = createRng(3);
  const avg = (level) => {
    let sum = 0;
    for (let i = 0; i < 300; i += 1) sum += overall(createPlayer({ rng, id: 'x', position: 'DF', level }));
    return sum / 300;
  };
  assert.ok(avg(75) > avg(50) + 15);
});

test('잠재력은 현재 능력 이상이고 33세 이상은 성장 여지가 없다', () => {
  const rng = createRng(4);
  for (let i = 0; i < 100; i += 1) {
    const young = createPlayer({ rng, id: 'y', position: 'GK', age: 19 });
    assert.ok(young.potential >= Math.round(overall(young)) - 1);
  }
  const old = createPlayer({ rng, id: 'o', position: 'GK', age: 34 });
  assert.ok(old.potential - overall(old) < 1);
});

test('어린 선수가 평균적으로 성장 여지가 더 크다', () => {
  const rng = createRng(5);
  const room = (age) => {
    let sum = 0;
    for (let i = 0; i < 300; i += 1) {
      const p = createPlayer({ rng, id: 'x', position: 'FW', age });
      sum += p.potential - overall(p);
    }
    return sum / 300;
  };
  assert.ok(room(19) > room(28) + 3);
});

test('starsOf는 0.5 단위로 0.5~5 사이다', () => {
  assert.equal(starsOf(80), 4);
  assert.equal(starsOf(52), 2.5);
  assert.equal(starsOf(96), 5);
  assert.equal(starsOf(3), 0.5);
  assert.equal(starsOf(120), 5);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/player.test.mjs`
Expected: FAIL (`Cannot find module '../engine/constants.mjs'`)

- [ ] **Step 3: 상수 파일 작성** — `next/engine/constants.mjs`

```js
export const POSITIONS = ['GK', 'DF', 'MF', 'FW'];

// 포지션별 핵심 속성 4개(0~100)
export const ATTRIBUTES = {
  GK: ['reflexes', 'handling', 'positioning', 'stamina'],
  DF: ['tackling', 'marking', 'heading', 'stamina'],
  MF: ['passing', 'vision', 'workrate', 'stamina'],
  FW: ['shooting', 'pace', 'dribbling', 'stamina'],
};

// 한 시즌: 20팀 더블 라운드로빈 38라운드를 14/14/10 구간으로 끊는다.
export const SEASON = { teams: 20, rounds: 38, chunks: [14, 14, 10] };

// 팀 전력(공격력·수비력). 코치 별 1개당 기본 12점, 스타 한 명이 더하는 최대 8점.
export const COACH_BASE_PER_STAR = 12;
export const STAR_MAX_BONUS = 8;

// 기대 득점: BASE * boost * exp((공격-상대수비)/50). 공격=수비면 1.3골.
export const BASE_GOALS = 1.3;
export const HOME_BOOST = 1.1;
export const GOAL_SCALE = 50;
export const ASSIST_CHANCE = 0.7;

// 득점·도움을 누가 할지의 포지션 가중치
export const SCORER_POS_WEIGHT = { FW: 5, MF: 2.5, DF: 0.7, GK: 0.02 };
export const ASSIST_POS_WEIGHT = { FW: 3, MF: 4, DF: 1, GK: 0.05 };
```

- [ ] **Step 4: 선수 모델 구현** — `next/engine/player.mjs`

```js
import { ATTRIBUTES } from './constants.mjs';
import { gauss } from './rng.mjs';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 속성 평균(0~100)
export function overall(player) {
  const values = Object.values(player.attrs);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// 0.5 단위 별(0.5~5). 능력 10당 반 칸.
export function starsOf(value) {
  return clamp(Math.round(value / 10) / 2, 0.5, 5);
}

// 나이가 어릴수록 잠재력(성장 여지)이 크다. 33세부터는 0.
function growthRoom(age, rng) {
  if (age >= 33) return 0;
  return Math.round(Math.max(0, 33 - age) * 1.2 * rng());
}

// level: 목표 평균 능력(예: 60). 속성마다 ±6 정도 흔들린다.
export function createPlayer({ rng, id, position, age = 24, level = 60 }) {
  const attrs = {};
  for (const key of ATTRIBUTES[position]) {
    attrs[key] = Math.round(clamp(level + gauss(rng) * 6, 1, 99));
  }
  const player = {
    id,
    position,
    age,
    attrs,
    xp: 0,
    xpLevel: 1,
    mood: 70,
    condition: 100,
    contract: { salary: 0, years: 3 },
    stats: { apps: 0, goals: 0, assists: 0 },
  };
  const now = overall(player);
  player.potential = Math.round(clamp(now + growthRoom(age, rng), now, 99));
  return player;
}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test next/tests/player.test.mjs`
Expected: PASS (6 tests)

- [ ] **Step 6: 커밋**

```bash
git add next/engine/constants.mjs next/engine/player.mjs next/tests/player.test.mjs
git commit -m "feat(next): 상수와 선수 모델(속성·별·잠재력)"
```

---

### Task 3: 팀 전력(공격력·수비력)

**Files:**
- Create: `next/engine/ratings.mjs`
- Test: `next/tests/ratings.test.mjs`

**Interfaces:**
- Consumes: Task 2의 `COACH_BASE_PER_STAR`, `STAR_MAX_BONUS`
- Produces: `attackValue(p)`, `defenseValue(p)`, `modifier(p) -> 사기·컨디션 배율`, `teamRatings({ coaches, stars }) -> { attack, defense }` (`coaches = { attack: { stars }, defense: { stars } }`)

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/ratings.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { teamRatings, modifier } from '../engine/ratings.mjs';

const coaches = (a, d) => ({ attack: { stars: a }, defense: { stars: d } });
const player = (position, attrs, extra = {}) => ({ position, attrs, mood: 70, condition: 100, ...extra });
const fw = (v, extra) => player('FW', { shooting: v, pace: v, dribbling: v, stamina: v }, extra);
const mf = (passing, workrate, extra) => player('MF', { passing, vision: passing, workrate, stamina: workrate }, extra);
const df = (v, extra) => player('DF', { tackling: v, marking: v, heading: v, stamina: v }, extra);
const gk = (v, extra) => player('GK', { reflexes: v, handling: v, positioning: v, stamina: v }, extra);

test('스타가 없으면 코치 기본 레이팅만 남는다', () => {
  assert.deepEqual(teamRatings({ coaches: coaches(3, 2), stars: [] }), { attack: 36, defense: 24 });
});

test('공격수는 공격력만 올린다', () => {
  const base = teamRatings({ coaches: coaches(3, 3), stars: [] });
  const r = teamRatings({ coaches: coaches(3, 3), stars: [fw(90)] });
  assert.ok(r.attack > base.attack);
  assert.equal(r.defense, base.defense);
});

test('수비수와 골키퍼는 수비력만 올린다', () => {
  const base = teamRatings({ coaches: coaches(3, 3), stars: [] });
  const r = teamRatings({ coaches: coaches(3, 3), stars: [df(90), gk(90)] });
  assert.equal(r.attack, base.attack);
  assert.ok(r.defense > base.defense + 10);
});

test('미드필더는 패스·시야는 공격력, 활동량·체력은 수비력에 반영된다', () => {
  const base = teamRatings({ coaches: coaches(3, 3), stars: [] });
  const playmaker = teamRatings({ coaches: coaches(3, 3), stars: [mf(95, 20)] });
  assert.ok(playmaker.attack > base.attack);
  assert.equal(playmaker.defense, base.defense);
  const runner = teamRatings({ coaches: coaches(3, 3), stars: [mf(20, 95)] });
  assert.equal(runner.attack, base.attack);
  assert.ok(runner.defense > base.defense);
});

test('능력이 30 이하인 스타는 보너스가 없다', () => {
  const base = teamRatings({ coaches: coaches(3, 3), stars: [] });
  assert.deepEqual(teamRatings({ coaches: coaches(3, 3), stars: [fw(25)] }), base);
});

test('사기와 컨디션이 낮으면 기여가 줄어든다', () => {
  const good = teamRatings({ coaches: coaches(3, 3), stars: [fw(90, { mood: 100, condition: 100 })] });
  const bad = teamRatings({ coaches: coaches(3, 3), stars: [fw(90, { mood: 10, condition: 20 })] });
  assert.ok(good.attack > bad.attack);
  assert.ok(modifier({ mood: 100, condition: 100 }) > modifier({ mood: 0, condition: 0 }));
});
```

- [ ] **Step 2: 극단값 테스트 추가** (Review Focus 5) — 같은 파일 맨 아래에 붙인다

```js
test('사기·컨디션 극단값에서도 보정 배율은 0.68~1.15 범위다', () => {
  assert.ok(Math.abs(modifier({ mood: 0, condition: 0 }) - 0.85 * 0.8) < 1e-9);
  assert.ok(Math.abs(modifier({ mood: 100, condition: 100 }) - 1.15) < 1e-9);
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test next/tests/ratings.test.mjs`
Expected: FAIL (`Cannot find module '../engine/ratings.mjs'`)

- [ ] **Step 4: 구현** — `next/engine/ratings.mjs`

```js
import { COACH_BASE_PER_STAR, STAR_MAX_BONUS } from './constants.mjs';

const avg = (p, keys) => keys.reduce((sum, k) => sum + p.attrs[k], 0) / keys.length;

// 이 선수가 공격력에 기여하는 능력값(0이면 공격에 기여하지 않는 포지션)
export function attackValue(p) {
  if (p.position === 'FW') return avg(p, ['shooting', 'pace', 'dribbling']);
  if (p.position === 'MF') return avg(p, ['passing', 'vision']);
  return 0;
}

// 수비력에 기여하는 능력값
export function defenseValue(p) {
  if (p.position === 'DF') return avg(p, ['tackling', 'marking', 'heading']);
  if (p.position === 'GK') return avg(p, ['reflexes', 'handling', 'positioning']);
  if (p.position === 'MF') return avg(p, ['workrate', 'stamina']);
  return 0;
}

// 사기·컨디션이 기여를 보정한다(사기 0~100 → 0.85~1.15, 컨디션 0~100 → 0.8~1.0).
export function modifier(p) {
  return (0.85 + (0.3 * p.mood) / 100) * (0.8 + (0.2 * p.condition) / 100);
}

// 능력 30 미만은 0점, 100이면 STAR_MAX_BONUS점.
function bonus(value, p) {
  return Math.max(0, (value - 30) / 70) * STAR_MAX_BONUS * modifier(p);
}

// 코치(공격·수비)가 기본 레이팅을 정하고, 스타가 그 위에 더해진다.
export function teamRatings({ coaches, stars }) {
  let attack = coaches.attack.stars * COACH_BASE_PER_STAR;
  let defense = coaches.defense.stars * COACH_BASE_PER_STAR;
  for (const p of stars) {
    const a = attackValue(p);
    const d = defenseValue(p);
    if (a > 0) attack += bonus(a, p);
    if (d > 0) defense += bonus(d, p);
  }
  return { attack, defense };
}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test next/tests/ratings.test.mjs`
Expected: PASS (7 tests)

- [ ] **Step 6: 커밋**

```bash
git add next/engine/ratings.mjs next/tests/ratings.test.mjs
git commit -m "feat(next): 팀 전력(코치 기본 레이팅 + 스타 가산, 공격·수비)"
```

---

### Task 4: 팀 생성과 경기 시뮬

**Files:**
- Create: `next/engine/team.mjs`, `next/engine/match.mjs`
- Test: `next/tests/match.test.mjs`

**Interfaces:**
- Consumes: Task 1 `poisson`·`weightedPick`, Task 2 상수·`createPlayer`, Task 3 `teamRatings`
- Produces: `createTeam({ rng, id, attackStars, defenseStars, starLevel, starPositions }) -> { id, coaches, stars, lineup(11명) }`, `expectedGoals(attack, opponentDefense, boost)`, `simulateMatch(home, away, rng) -> { homeGoals, awayGoals, events: [{ teamId, scorerId, assistId }] }`, `applyMatchStats(home, away, result)`

- [ ] **Step 1: 실패하는 테스트 작성** (Review Focus 1, 2 포함) — `next/tests/match.test.mjs`

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/match.test.mjs`
Expected: FAIL (`Cannot find module '../engine/team.mjs'`)

- [ ] **Step 3: 팀 생성 구현** — `next/engine/team.mjs`

```js
import { createPlayer } from './player.mjs';

const LINEUP_SIZE = 11;
const DEFAULT_STAR_POSITIONS = ['GK', 'DF', 'DF', 'MF', 'FW', 'FW'];
// 스타가 없는 자리는 조연이 채운다. 먼저 이 최소 구성(골키퍼 1, 수비 3, 미드 2, 공격 1)을 맞추고,
// 남는 자리는 수비·미드·공격 순으로 돌아가며 채운다.
const MIN_SHAPE = [['GK', 1], ['DF', 3], ['MF', 2], ['FW', 1]];
const EXTRA_CYCLE = ['DF', 'MF', 'FW'];

function fillerPositions(starPositions) {
  const count = { GK: 0, DF: 0, MF: 0, FW: 0 };
  for (const position of starPositions) count[position] += 1;
  const fillers = [];
  const room = () => LINEUP_SIZE - starPositions.length - fillers.length;
  for (const [position, minimum] of MIN_SHAPE) {
    while (count[position] < minimum && room() > 0) {
      fillers.push(position);
      count[position] += 1;
    }
  }
  for (let i = 0; room() > 0; i += 1) fillers.push(EXTRA_CYCLE[i % EXTRA_CYCLE.length]);
  return fillers;
}

// 라인업 11명: 스타(관리 대상) 먼저, 나머지는 코치 수준에 맞춘 조연.
export function createTeam({ rng, id, attackStars = 3, defenseStars = 3, starLevel = 60, starPositions = DEFAULT_STAR_POSITIONS }) {
  const stars = starPositions.map((position, i) =>
    createPlayer({ rng, id: `${id}-s${i}`, position, age: 22 + (i % 6) * 2, level: starLevel }),
  );
  // 조연 수준은 코치 별 평균에 따라 정해진다(별 1개당 능력 8).
  const fillerLevel = 25 + ((attackStars + defenseStars) / 2) * 8;
  const fillers = fillerPositions(starPositions).map((position, i) =>
    createPlayer({ rng, id: `${id}-f${i}`, position, age: 24 + i, level: fillerLevel }),
  );
  return {
    id,
    coaches: { attack: { stars: attackStars }, defense: { stars: defenseStars } },
    stars,
    lineup: [...stars, ...fillers],
  };
}
```

- [ ] **Step 4: 경기 시뮬 구현** — `next/engine/match.mjs`

```js
import {
  ASSIST_CHANCE, ASSIST_POS_WEIGHT, BASE_GOALS, GOAL_SCALE, HOME_BOOST, SCORER_POS_WEIGHT,
} from './constants.mjs';
import { poisson, weightedPick } from './rng.mjs';
import { teamRatings } from './ratings.mjs';

// 내 공격력 vs 상대 수비력으로 기대 득점을 구한다.
export function expectedGoals(attack, opponentDefense, boost = 1) {
  return BASE_GOALS * boost * Math.exp((attack - opponentDefense) / GOAL_SCALE);
}

function scoreValue(p) {
  if (p.position === 'FW') return p.attrs.shooting;
  if (p.position === 'MF') return (p.attrs.passing + p.attrs.vision) / 2;
  if (p.position === 'DF') return p.attrs.heading;
  return 10;
}

function assistValue(p) {
  if (p.position === 'FW') return p.attrs.dribbling;
  if (p.position === 'MF') return p.attrs.vision;
  return 30;
}

const scoringWeight = (p) => SCORER_POS_WEIGHT[p.position] * (scoreValue(p) / 50) ** 2;
const assistWeight = (p) => ASSIST_POS_WEIGHT[p.position] * (assistValue(p) / 50) ** 2;

function goalEvents(team, goals, rng) {
  const events = [];
  for (let i = 0; i < goals; i += 1) {
    const scorer = weightedPick(rng, team.lineup, scoringWeight);
    const assist = rng() < ASSIST_CHANCE
      ? weightedPick(rng, team.lineup.filter((p) => p !== scorer), assistWeight)
      : null;
    events.push({ teamId: team.id, scorerId: scorer.id, assistId: assist ? assist.id : null });
  }
  return events;
}

// 한 경기를 시뮬한다. 선수 기록은 건드리지 않고 결과만 돌려준다.
export function simulateMatch(home, away, rng) {
  const h = teamRatings(home);
  const a = teamRatings(away);
  const homeGoals = poisson(rng, expectedGoals(h.attack, a.defense, HOME_BOOST));
  const awayGoals = poisson(rng, expectedGoals(a.attack, h.defense));
  return {
    homeGoals,
    awayGoals,
    events: [...goalEvents(home, homeGoals, rng), ...goalEvents(away, awayGoals, rng)],
  };
}

// 경기 결과를 선수 기록(출전·득점·도움)에 반영한다.
export function applyMatchStats(home, away, result) {
  const byId = new Map();
  for (const p of [...home.lineup, ...away.lineup]) {
    byId.set(p.id, p);
    p.stats.apps += 1;
  }
  for (const e of result.events) {
    byId.get(e.scorerId).stats.goals += 1;
    if (e.assistId) byId.get(e.assistId).stats.assists += 1;
  }
}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test next/tests/match.test.mjs`
Expected: PASS (10 tests)

- [ ] **Step 6: 커밋**

```bash
git add next/engine/team.mjs next/engine/match.mjs next/tests/match.test.mjs
git commit -m "feat(next): 팀 생성(조연 자동 채움)과 경기 시뮬(득점·도움)"
```

---

### Task 5: 리그 시즌(38라운드, 14/14/10 구간)

**Files:**
- Create: `next/engine/league.mjs`
- Test: `next/tests/league.test.mjs`

**Interfaces:**
- Consumes: Task 2 `SEASON`, Task 4 `simulateMatch`·`applyMatchStats`·`createTeam`
- Produces: `generateFixtures(teamIds) -> rounds[][ [homeId, awayId] ]`, `createLeague(teams) -> league`, `playChunk(league, rng) -> results[]`, `isSeasonOver(league)`, `standings(league) -> rows`, `topScorers(league, limit)`

- [ ] **Step 1: 실패하는 테스트 작성** (Review Focus 3, 4 포함) — `next/tests/league.test.mjs`

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/league.test.mjs`
Expected: FAIL (`Cannot find module '../engine/league.mjs'`)

- [ ] **Step 3: 구현** — `next/engine/league.mjs`

```js
import { SEASON } from './constants.mjs';
import { applyMatchStats, simulateMatch } from './match.mjs';

// 원형(circle) 방식 더블 라운드로빈. 20팀이면 38라운드, 라운드마다 10경기.
export function generateFixtures(teamIds) {
  const n = teamIds.length;
  if (n < 2 || n % 2 !== 0) throw new Error('팀 수는 2 이상의 짝수여야 합니다');
  if (new Set(teamIds).size !== n) throw new Error('팀 id가 중복됩니다');
  const ids = [...teamIds];
  const firstLeg = [];
  for (let r = 0; r < n - 1; r += 1) {
    const round = [];
    for (let i = 0; i < n / 2; i += 1) {
      const home = ids[i];
      const away = ids[n - 1 - i];
      round.push(r % 2 === 0 ? [home, away] : [away, home]);
    }
    firstLeg.push(round);
    ids.splice(1, 0, ids.pop()); // 첫 팀은 고정하고 나머지를 한 칸 회전
  }
  const secondLeg = firstLeg.map((round) => round.map(([home, away]) => [away, home]));
  return [...firstLeg, ...secondLeg];
}

const emptyRow = () => ({ played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 });

export function createLeague(teams) {
  const ids = teams.map((t) => t.id);
  return {
    teams: new Map(teams.map((t) => [t.id, t])),
    fixtures: generateFixtures(ids),
    nextRound: 0,
    chunkIndex: 0,
    table: new Map(ids.map((id) => [id, emptyRow()])),
  };
}

function record(table, homeId, awayId, { homeGoals, awayGoals }) {
  const home = table.get(homeId);
  const away = table.get(awayId);
  home.played += 1;
  away.played += 1;
  home.gf += homeGoals;
  home.ga += awayGoals;
  away.gf += awayGoals;
  away.ga += homeGoals;
  if (homeGoals > awayGoals) {
    home.won += 1; home.points += 3; away.lost += 1;
  } else if (homeGoals < awayGoals) {
    away.won += 1; away.points += 3; home.lost += 1;
  } else {
    home.drawn += 1; away.drawn += 1; home.points += 1; away.points += 1;
  }
}

export const isSeasonOver = (league) => league.chunkIndex >= SEASON.chunks.length;

// 다음 구간(14/14/10라운드)을 한 번에 시뮬하고 경기 결과 목록을 돌려준다.
export function playChunk(league, rng) {
  const size = SEASON.chunks[league.chunkIndex];
  if (size === undefined) throw new Error('시즌이 이미 끝났습니다');
  const results = [];
  for (let i = 0; i < size; i += 1) {
    for (const [homeId, awayId] of league.fixtures[league.nextRound]) {
      const home = league.teams.get(homeId);
      const away = league.teams.get(awayId);
      const result = simulateMatch(home, away, rng);
      applyMatchStats(home, away, result);
      record(league.table, homeId, awayId, result);
      results.push({ round: league.nextRound, homeId, awayId, ...result });
    }
    league.nextRound += 1;
  }
  league.chunkIndex += 1;
  return results;
}

// 승점, 골득실, 다득점 순
export function standings(league) {
  return [...league.table.entries()]
    .map(([id, row]) => ({ id, ...row, gd: row.gf - row.ga }))
    .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
}

// 득점·도움 순위(이름 있는 선수 전체)
export function topScorers(league, limit = 5) {
  const players = [...league.teams.values()].flatMap((t) => t.lineup.map((p) => ({ teamId: t.id, id: p.id, goals: p.stats.goals, assists: p.stats.assists })));
  return players.sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, limit);
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test next/tests/league.test.mjs`
Expected: PASS (11 tests)

- [ ] **Step 5: 전체 확인**

Run: `node --test next/tests/*.test.mjs`
Expected: PASS (40 tests, 0 fail). 기존 게임 테스트도 영향 없어야 한다: `node --test tests/*.test.mjs`

- [ ] **Step 6: 커밋**

```bash
git add next/engine/league.mjs next/tests/league.test.mjs
git commit -m "feat(next): 38라운드 리그 시즌(14/14/10 구간, 순위표, 득점왕)"
```

---

## Self-Review

**Spec coverage** (이 계획이 맡는 부분만)
- 5절 선수 모델: 포지션별 속성 4개, 별(0.5 단위), 잠재력, 사기·컨디션 필드 → Task 2. XP 성장·사기 변화·컨디션 변화·부상은 **계획 4**.
- 6절 득점·도움: 포지션 확률과 속성 기반, 구간 단위 집계 → Task 4, 5.
- 6.5절 팀 전력과 승패: 코치 기본 레이팅 + 스타 가산, 미드 속성 분리, 기대 득점 = 공격 vs 수비, 무승부 있음, 승점 3/1/0 → Task 3, 4, 5. **이변 보통**은 구현 후 시뮬로 확인한다(Task 5의 "강팀 > 약팀" 테스트가 최소 보장).
- 2절 시즌 구조: 20팀 38라운드, 14/14/10 구간 → Task 5.
- 이 계획에서 하지 않는 것: 휴식 지정, 훈련 강도, 계약·연봉, 코인, 승강·챔피언스리그, 화면(후속 계획 참고).

**Placeholder scan:** 모든 단계에 실제 코드와 명령이 있다. "TBD" 없음.

**Type consistency:** `teamRatings({ coaches, stars })`의 `coaches.attack.stars`/`coaches.defense.stars`는 `createTeam`이 만드는 구조와 같다. `lineup` 원소는 `createPlayer`의 반환 객체이고 `stats.{apps,goals,assists}`를 가진다. `playChunk`가 돌려주는 `results[i]`는 `{ round, homeId, awayId, homeGoals, awayGoals, events }`다.

**검증 메모:** 이 계획의 코드는 임시 폴더에서 `node --test`로 39개 테스트가 모두 통과하는 것을 확인한 뒤 옮겼다. Task 3의 극단값 테스트(Step 2)는 계획 작성 중 추가한 것이라 실제 실행에서는 7개가 되고 전체는 40개다.

## 후속 계획 (서브프로젝트)

| 계획 | 내용 |
|---|---|
| 2 확보 | 드래프트(1라운드, 후보 20명), FA(10명, 협상·영입 조건), 계약 3년·재계약, 트레이드(지명권·선수 맞교환, 양방향) |
| 3 경제 | 코인, 샐러리캡(스타만), 시설 3종 10단계, 코치 2명(별·XP·계약·훈련 강도) |
| 4 성장·상태 | XP·레벨업, 사기·컨디션 변화, 휴식 지정, 부상, 나이·은퇴, 면담·기자회견 이벤트 |
| 5 리그 세계 | 3단계 사다리, 승강·단판 승강전, AI 팀 생성과 FA 이동, 8개 지역 챔피언스리그 |
| 6 상·기록 | 상 판정, 선수 기록실, 트로피, 역대 우승팀, 명예의 전당, 은퇴식 |
| 7 화면 | 로스터·선수 상세·결과·프런트 오피스 등(기존 현재 톤) |
| 8 시작·튜토리얼 | 스타 3명 배정 + 시작 드래프트, 튜토리얼, 런 종료(은퇴·경질) |
