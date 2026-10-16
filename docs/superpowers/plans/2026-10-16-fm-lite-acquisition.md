# FM-Lite 선수 확보 구현 계획 (계획 2/8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 신인 드래프트, FA 시장과 영입 협상, 재계약, 양방향 트레이드를 화면 없는 엔진으로 만들고 테스트로 고정한다.

**Architecture:** 계획 1의 팀·선수 객체 위에 얹는 순수 함수 모듈들. 가치 계산(`marketValue`)과 요구 연봉(`askingSalary`)을 한 곳(`contract.mjs`)에 두고 드래프트·FA·트레이드가 모두 같은 가치 척도를 쓴다. 스타 명단이 바뀌는 모든 경로(영입, 방출, 트레이드)는 `setStars` 하나를 지나가므로 라인업 11명과 골키퍼 1명이 항상 유지된다. 지명권은 팀의 `picks` 배열에 `{ year, from }`으로 들고 다닌다.

**Tech Stack:** 순수 ES 모듈(`.mjs`), Node 내장 테스트러너, 외부 의존성 0, 빌드 없음.

**Spec:** `docs/superpowers/specs/2026-10-16-fm-lite-next-design.md` (7절 선수 확보, 8절 샐러리캡, 13절 초기 수치)

## Global Constraints

- 모든 새 파일은 `next/` 아래에만 만든다. 기존 게임은 건드리지 않는다. 계획 1의 파일 중 고치는 것은 `constants.mjs`(추가만)와 `team.mjs`(Task 1)뿐이다.
- 엔진에서 `Math.random`, `document`, `window`, `localStorage`를 쓰지 않는다. 난수는 `rng` 인자로 받는다.
- 주석과 사용자에게 보이는 문구는 한국어, 문구에 em 대시를 쓰지 않는다.
- 계약은 3년 고정(`CONTRACT_YEARS`), 샐러리캡은 스타 연봉 총액만 센다(3부 100, 2부 150, 1부 200).
- 드래프트 후보 20명, 1라운드, 지명권은 시즌당 1장. FA 시장은 새 6명 + 풀려난 선수 최대 4명 = 10명.
- 스타는 항상 최대 6명이며 라인업은 항상 11명(골키퍼 1명)이다.
- 수치(가치식, 조건 범위, 트레이드 여유 1.1 등)는 초기값이며 상수는 `constants.mjs`에, 가치식은 `contract.mjs`에만 둔다.

## Review Focus

1. **내 순번이 아닌데 지명, 이미 뽑힌 선수 지명, 끝난 드래프트에 지명, 지명권 2장 보유**: 명확한 오류이거나 두 번 고르기가 되어야 한다 (Task 2).
2. **스타 6명이 가득 찬 팀의 영입, 거절된 협상의 영입**: 오류이고 명단은 그대로여야 한다 (Task 3).
3. **사기 40 미만 선수의 재계약, 기존 연봉이 큰 선수의 캡 계산**: 어떤 금액이어도 거절, 기존 연봉 몫은 캡 여유로 돌려받아 계산 (Task 3).
4. **선수 수가 다른 거래, 없는 선수·지명권, 빈 거래, 캡 초과 거래**: 적용 전에 막고 명단을 건드리지 않는다 (Task 4).
5. **남은 FA를 받을 AI 팀이 없음, 스타가 0명인 팀, 이름 있는 AI 선수 3명 초과**: 오류 또는 안전한 처리 (Task 1, 3).

---

### Task 1: 상수 추가, 계약·연봉 모델, 스타 명단 교체

**Files:**
- Modify: `next/engine/constants.mjs` (맨 아래에 추가), `next/engine/team.mjs` (`fillerPositions` export, `fillerLevel` 추가)
- Create: `next/engine/contract.mjs`, `next/engine/roster.mjs`
- Test: `next/tests/contract.test.mjs`

**Interfaces:**
- Consumes: 계획 1의 `overall`, `createPlayer`, `createTeam`, `fillerPositions`
- Produces: `marketValue(p) -> 0~100`, `askingSalary(p) -> 2~40`, `payroll(team)`, `capRoom(team, cap)`, `newContract(salary) -> { salary, years: 3 }`, `tickContracts(team) -> 만료된 스타[]`, `setStars(team, rng, stars)`, 상수 `ROSTER_STARS` `CONTRACT_YEARS` `SALARY_CAP` `DRAFT_SIZE` `ROOKIE_DISCOUNT` `FA_FRESH` `FA_RELEASED` `RESIGN_MIN_MOOD` `TRADE_MARGIN` `TRADE_MIN_MOOD` `AI_NAMED_MAX`, `team.mjs`의 `fillerPositions`, `fillerLevel(attackStars, defenseStars)`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/contract.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createPlayer } from '../engine/player.mjs';
import { createTeam } from '../engine/team.mjs';
import { setStars } from '../engine/roster.mjs';
import { askingSalary, capRoom, marketValue, newContract, payroll, tickContracts } from '../engine/contract.mjs';

const make = (level, age = 24, seed = 1) => createPlayer({ rng: createRng(seed), id: 'p', position: 'FW', level, age });

test('능력이 높을수록 가치와 요구 연봉이 높다', () => {
  assert.ok(marketValue(make(80)) > marketValue(make(50)));
  assert.ok(askingSalary(make(80)) > askingSalary(make(50)) + 10);
});

test('같은 능력이면 어리고 잠재력 큰 선수가 비싸고, 늙으면 값이 깎인다', () => {
  assert.ok(marketValue(make(60, 19)) > marketValue(make(60, 30)));
  assert.ok(marketValue(make(60, 38)) < marketValue(make(60, 30)));
});

test('요구 연봉은 최소 2, 최대 40이다', () => {
  assert.equal(askingSalary(make(1)), 2);
  assert.ok(askingSalary(make(99, 19)) <= 40);
});

test('연봉 총액은 스타만 센다', () => {
  const team = createTeam({ rng: createRng(2), id: 'A' });
  team.stars.forEach((p, i) => { p.contract = newContract(10 + i); });
  assert.equal(payroll(team), 75);
  assert.equal(capRoom(team, 100), 25);
});

test('tickContracts는 연수를 1 줄이고 만료된 스타를 돌려준다', () => {
  const team = createTeam({ rng: createRng(3), id: 'A' });
  team.stars[0].contract.years = 1;
  const expired = tickContracts(team);
  assert.deepEqual(expired.map((p) => p.id), [team.stars[0].id]);
  assert.equal(team.stars[1].contract.years, 2);
});

test('setStars: 스타를 바꿔도 라인업은 11명이고 골키퍼 1명이며 기존 조연 기록이 남는다', () => {
  const rng = createRng(4);
  const team = createTeam({ rng, id: 'A' });
  const kept = team.lineup[6]; // 수비 조연
  kept.stats.goals = 7;
  // 골키퍼 스타를 빼고 공격수를 넣는다
  const next = [...team.stars.filter((p) => p.position !== 'GK'), createPlayer({ rng, id: 'new', position: 'FW' })];
  setStars(team, rng, next);
  assert.equal(team.lineup.length, 11);
  assert.equal(team.lineup.filter((p) => p.position === 'GK').length, 1);
  assert.ok(team.lineup.includes(kept));
  assert.equal(new Set(team.lineup.map((p) => p.id)).size, 11);
});

test('setStars: 스타가 0명이어도 라인업 11명을 채운다', () => {
  const team = createTeam({ rng: createRng(5), id: 'B' });
  setStars(team, createRng(6), []);
  assert.equal(team.lineup.length, 11);
  assert.equal(team.lineup.filter((p) => p.position === 'GK').length, 1);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/contract.test.mjs`
Expected: FAIL (`Cannot find module '../engine/contract.mjs'` 또는 `roster.mjs`)

- [ ] **Step 3: 상수 추가** — `next/engine/constants.mjs` 맨 아래에 붙인다

```js
// ---- 계획 2: 선수 확보 ----
export const ROSTER_STARS = 6;
export const CONTRACT_YEARS = 3;
// 샐러리캡(스타 연봉 총액 한도), 리그 단계(1=1부)별
export const SALARY_CAP = { 3: 100, 2: 150, 1: 200 };
export const DRAFT_SIZE = 20;
export const ROOKIE_DISCOUNT = 0.6;
export const FA_FRESH = 6;
export const FA_RELEASED = 4;
export const RESIGN_MIN_MOOD = 40;
export const TRADE_MARGIN = 1.1; // AI는 받는 가치가 주는 가치의 1.1배 이상일 때만 수락
export const TRADE_MIN_MOOD = 30; // 사기가 이보다 낮은 선수는 AI가 받지 않는다
export const AI_NAMED_MAX = 3;
```

- [ ] **Step 4: team.mjs 수정** — 조연 수준 계산을 함수로 빼고 `fillerPositions`를 내보낸다. `next/engine/team.mjs`에서 `function fillerPositions(`를 `export function fillerPositions(`로 바꾸고, `createTeam` 부분을 아래로 교체한다(바뀌는 곳은 `fillerLevel` 함수와 `level` 변수뿐이다).

```js
// 조연 수준은 코치 별 평균에 따라 정해진다(별 1개당 능력 8).
export const fillerLevel = (attackStars, defenseStars) => 25 + ((attackStars + defenseStars) / 2) * 8;

// 라인업 11명: 스타(관리 대상) 먼저, 나머지는 코치 수준에 맞춘 조연.
export function createTeam({ rng, id, attackStars = 3, defenseStars = 3, starLevel = 60, starPositions = DEFAULT_STAR_POSITIONS }) {
  const stars = starPositions.map((position, i) =>
    createPlayer({ rng, id: `${id}-s${i}`, position, age: 22 + (i % 6) * 2, level: starLevel }),
  );
  const level = fillerLevel(attackStars, defenseStars);
  const fillers = fillerPositions(starPositions).map((position, i) =>
    createPlayer({ rng, id: `${id}-f${i}`, position, age: 24 + i, level }),
  );
  return {
    id,
    coaches: { attack: { stars: attackStars }, defense: { stars: defenseStars } },
    stars,
    lineup: [...stars, ...fillers],
  };
}
```

- [ ] **Step 5: 계약 모델 구현** — `next/engine/contract.mjs`

```js
import { CONTRACT_YEARS } from './constants.mjs';
import { overall } from './player.mjs';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 선수의 시장 가치(0~100). 현재 능력에 잠재력의 절반을 더하고, 33세부터 나이만큼 깎는다.
export function marketValue(p) {
  const now = overall(p);
  const v = now + (p.potential - now) * 0.5 - Math.max(0, p.age - 32) * 2;
  return clamp(v, 0, 100);
}

// 요구 연봉(캡 포인트). 가치 30 이하는 최저 2, 가치 100이면 40.
export const askingSalary = (p) => Math.round(2 + 38 * (Math.max(0, marketValue(p) - 30) / 70) ** 2);

// 샐러리캡은 스타 연봉 총액만 센다(조연·코치 제외).
export const payroll = (team) => team.stars.reduce((sum, p) => sum + p.contract.salary, 0);
export const capRoom = (team, cap) => cap - payroll(team);

export const newContract = (salary) => ({ salary, years: CONTRACT_YEARS });

// 시즌이 끝날 때 한 번 부른다. 계약 연수를 1 줄이고 만료된 스타 목록을 돌려준다.
export function tickContracts(team) {
  for (const p of team.stars) p.contract.years -= 1;
  return team.stars.filter((p) => p.contract.years <= 0);
}
```

- [ ] **Step 6: 명단 교체 구현** — `next/engine/roster.mjs`

```js
import { createPlayer } from './player.mjs';
import { fillerLevel, fillerPositions } from './team.mjs';

// 스타 명단을 통째로 바꾸고 라인업(11명)을 다시 맞춘다.
// 기존 조연은 포지션이 맞으면 그대로 쓰고(기록 유지), 모자란 자리만 새로 만든다.
export function setStars(team, rng, stars) {
  const spare = team.lineup.slice(team.stars.length);
  const level = fillerLevel(team.coaches.attack.stars, team.coaches.defense.stars);
  const fillers = fillerPositions(stars.map((p) => p.position)).map((position) => {
    const at = spare.findIndex((p) => p.position === position);
    if (at >= 0) return spare.splice(at, 1)[0];
    team.fillerCount = (team.fillerCount ?? 0) + 1;
    return createPlayer({ rng, id: `${team.id}-g${team.fillerCount}`, position, age: 24, level });
  });
  team.stars = stars;
  team.lineup = [...stars, ...fillers];
}
```

- [ ] **Step 7: 통과 확인**

Run: `node --test next/tests/contract.test.mjs`
Expected: PASS (7 tests). 이어서 `node --test next/tests/*.test.mjs`로 계획 1의 40개가 그대로 통과하는지도 확인한다(47개).

- [ ] **Step 8: 커밋**

```bash
git add next/engine/constants.mjs next/engine/team.mjs next/engine/contract.mjs next/engine/roster.mjs next/tests/contract.test.mjs
git commit -m "feat(next): 계약·연봉 모델과 스타 명단 교체"
```

---

### Task 2: 신인 드래프트

**Files:**
- Create: `next/engine/draft.mjs`
- Test: `next/tests/draft.test.mjs`

**Interfaces:**
- Consumes: Task 1 `marketValue` `askingSalary` `newContract`, 계획 1 `createPlayer` `gauss` `randInt`
- Produces: `generateProspects(rng, { count, prefix })`, `grantPicks(teams, year)`, `spendPicks(teams, year)`, `draftOrder(standings, teams, year) -> [{ slot, from, owner }]`, `createDraft({ prospects, order })`, `draftPick(draft, ownerId, playerId)`, `autoPickUntil(draft, myId, rng)`, `isDraftOver(draft)`, `draftedBy(draft, ownerId) -> players(신인 계약 포함)`. 지명권은 `{ year, from }`이고 팀의 `picks` 배열에 들어 있다

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/draft.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createTeam } from '../engine/team.mjs';
import { marketValue } from '../engine/contract.mjs';
import {
  autoPickUntil, createDraft, draftOrder, draftPick, draftedBy, generateProspects, grantPicks, isDraftOver, spendPicks,
} from '../engine/draft.mjs';

const ids = Array.from({ length: 20 }, (_, i) => `T${i}`);
const standings = ids.map((id) => ({ id })); // T0이 1위, T19가 꼴찌
const teams = () => ids.map((id) => createTeam({ rng: createRng(1), id }));

test('후보 20명은 19~21세이고 id가 겹치지 않는다', () => {
  const list = generateProspects(createRng(1), { prefix: 'D1' });
  assert.equal(list.length, 20);
  assert.equal(new Set(list.map((p) => p.id)).size, 20);
  for (const p of list) assert.ok(p.age >= 19 && p.age <= 21);
});

test('꼴찌가 1번 지명이고 지명권이 없으면 원래 팀이 주인이다', () => {
  const t = teams();
  grantPicks(t, 2027);
  const order = draftOrder(standings, t, 2027);
  assert.equal(order.length, 20);
  assert.deepEqual(order[0], { slot: 1, from: 'T19', owner: 'T19' });
  assert.equal(order[19].from, 'T0');
});

test('지명권을 넘기면 슬롯 주인이 바뀐다', () => {
  const t = teams();
  grantPicks(t, 2027);
  const moved = t[19].picks.pop();
  t[0].picks.push(moved);
  assert.equal(draftOrder(standings, t, 2027)[0].owner, 'T0');
});

test('spendPicks는 그 해 지명권만 지운다', () => {
  const t = teams();
  grantPicks(t, 2027);
  grantPicks(t, 2028);
  spendPicks(t, 2027);
  assert.deepEqual(t[0].picks, [{ year: 2028, from: 'T0' }]);
});

function setup(seed) {
  const rng = createRng(seed);
  const t = teams();
  grantPicks(t, 2027);
  const draft = createDraft({ prospects: generateProspects(rng, { prefix: 'D' }), order: draftOrder(standings, t, 2027) });
  return { rng, draft };
}

test('내 순번까지 AI가 지명하고, 내가 고르면 다음으로 넘어간다', () => {
  const { rng, draft } = setup(2);
  autoPickUntil(draft, 'T15', rng); // 슬롯 5번(T15)
  assert.equal(draft.next, 4);
  assert.equal(draft.picks.length, 4);
  draftPick(draft, 'T15', draft.pool[0].id);
  assert.equal(draft.next, 5);
});

test('AI는 대체로 좋은 후보부터 가져간다', () => {
  const { rng, draft } = setup(3);
  const all = [...draft.pool].sort((a, b) => marketValue(b) - marketValue(a));
  autoPickUntil(draft, 'T10', rng); // 슬롯 10번(T10)
  const taken = new Set(draft.picks.map((p) => p.player.id));
  const topFive = all.slice(0, 5).filter((p) => taken.has(p.id)).length;
  assert.ok(topFive >= 3, `상위 5명 중 ${topFive}명`);
});

test('끝까지 가면 20명이 모두 팀에 갈라지고 신인 계약은 3년이다', () => {
  const { rng, draft } = setup(4);
  autoPickUntil(draft, 'nobody', rng);
  assert.ok(isDraftOver(draft));
  assert.equal(draft.pool.length, 0);
  const mine = draftedBy(draft, 'T19');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].contract.years, 3);
  assert.ok(mine[0].contract.salary >= 1);
});

test('내 팀이 순번표에 없으면 AI가 끝까지 지명하고 멈춘다', () => {
  const { rng, draft } = setup(5);
  autoPickUntil(draft, 'ghost', rng);
  assert.equal(draft.picks.length, 20);
});

test('순번이 아닌 팀의 지명, 이미 뽑힌 선수, 끝난 뒤 지명은 오류다', () => {
  const { rng, draft } = setup(6);
  assert.throws(() => draftPick(draft, 'T0', draft.pool[0].id), /순번/);
  const first = draft.pool[0];
  draftPick(draft, 'T19', first.id);
  assert.throws(() => draftPick(draft, 'T18', first.id), /이미 지명/);
  autoPickUntil(draft, 'nobody', rng);
  assert.throws(() => draftPick(draft, 'T0', 'x'), /끝났/);
});

test('한 팀이 지명권 2장을 쥐면 두 번 고른다', () => {
  const rng = createRng(7);
  const t = teams();
  grantPicks(t, 2027);
  t[18].picks.push(t[19].picks.pop()); // T18이 1번과 2번 슬롯을 모두 쥔다
  const draft = createDraft({ prospects: generateProspects(rng, { prefix: 'D' }), order: draftOrder(standings, t, 2027) });
  draftPick(draft, 'T18', draft.pool[0].id);
  draftPick(draft, 'T18', draft.pool[0].id);
  assert.equal(draftedBy(draft, 'T18').length, 2);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/draft.test.mjs`
Expected: FAIL (`Cannot find module`)

- [ ] **Step 3: 구현** — `next/engine/draft.mjs`

```js
import { DRAFT_SIZE, POSITIONS, ROOKIE_DISCOUNT } from './constants.mjs';
import { askingSalary, marketValue, newContract } from './contract.mjs';
import { createPlayer } from './player.mjs';
import { gauss, randInt } from './rng.mjs';

// 후보 20명: 19~21세, 능력은 35~65, 잠재력은 나이에 따라 따로 붙는다.
export function generateProspects(rng, { count = DRAFT_SIZE, prefix }) {
  return Array.from({ length: count }, (_, i) => createPlayer({
    rng,
    id: `${prefix}-${i}`,
    position: POSITIONS[randInt(rng, 0, POSITIONS.length - 1)],
    age: randInt(rng, 19, 21),
    level: 35 + rng() * 30,
  }));
}

// 지명권은 팀이 들고 다닌다. { year, from }은 "from 팀의 year년 1라운드 지명권".
export function grantPicks(teams, year) {
  for (const team of teams) (team.picks ??= []).push({ year, from: team.id });
}

export function spendPicks(teams, year) {
  for (const team of teams) team.picks = (team.picks ?? []).filter((pick) => pick.year !== year);
}

// 직전 성적 역순(꼴찌가 1번)으로 슬롯을 정하고, 슬롯마다 그 지명권을 쥔 팀을 주인으로 적는다.
// standings: 1위부터 정렬된 순위표 행, teams: 팀 배열
export function draftOrder(standings, teams, year) {
  return [...standings].reverse().map((row, i) => {
    const holder = teams.find((t) => (t.picks ?? []).some((pick) => pick.year === year && pick.from === row.id));
    return { slot: i + 1, from: row.id, owner: holder ? holder.id : row.id };
  });
}

export const createDraft = ({ prospects, order }) => ({ order, pool: [...prospects], picks: [], next: 0 });
export const isDraftOver = (draft) => draft.next >= draft.order.length;

export function draftPick(draft, ownerId, playerId) {
  if (isDraftOver(draft)) throw new Error('드래프트가 끝났습니다');
  if (draft.order[draft.next].owner !== ownerId) throw new Error('지금은 이 팀의 순번이 아닙니다');
  const at = draft.pool.findIndex((p) => p.id === playerId);
  if (at < 0) throw new Error('이미 지명되었거나 후보가 아닌 선수입니다');
  const [player] = draft.pool.splice(at, 1);
  draft.picks.push({ slot: draft.order[draft.next].slot, owner: ownerId, player });
  draft.next += 1;
  return player;
}

// AI는 가치가 가장 높은 후보를 고르되 약간 흔들린다(스카우트 오차).
function aiChoice(draft, rng) {
  let best = null;
  let bestScore = -Infinity;
  for (const p of draft.pool) {
    const score = marketValue(p) + gauss(rng) * 3;
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return best;
}

// 내 순번이 오거나 드래프트가 끝날 때까지 AI 팀들이 차례로 지명한다.
export function autoPickUntil(draft, myId, rng) {
  while (!isDraftOver(draft) && draft.order[draft.next].owner !== myId) {
    draftPick(draft, draft.order[draft.next].owner, aiChoice(draft, rng).id);
  }
}

// 지명된 선수에게 신인 계약(요구 연봉의 60%, 3년)을 붙여 팀별로 돌려준다.
export function draftedBy(draft, ownerId) {
  return draft.picks.filter((p) => p.owner === ownerId).map((p) => {
    p.player.contract = newContract(Math.max(1, Math.round(askingSalary(p.player) * ROOKIE_DISCOUNT)));
    return p.player;
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test next/tests/draft.test.mjs`
Expected: PASS (10 tests)

- [ ] **Step 5: 커밋**

```bash
git add next/engine/draft.mjs next/tests/draft.test.mjs
git commit -m "feat(next): 신인 드래프트(지명권, 순번, AI 지명, 신인 계약)"
```

---

### Task 3: FA 시장·재계약

**Files:**
- Create: `next/engine/freeAgency.mjs`
- Test: `next/tests/freeAgency.test.mjs`

**Interfaces:**
- Consumes: Task 1 `askingSalary` `marketValue` `newContract` `setStars`, 계획 1 `createPlayer` `overall` `randInt`
- Produces: `generateFreeAgents(rng, { released, prefix }) -> entries`, `toEntry(rng, player) -> { player, conditions, asking }`, `evaluateOffer(entry, salary, club) -> { accepted, reason }`, `signFreeAgent(team, rng, entry, salary, club)`, `evaluateResign(player, salary, club)`, `resign(player, salary, club)`, `releaseToPool(team, rng, player) -> entry`, `aiSign(rng, entries, aiTeams) -> [{ playerId, teamId }]`. `club`은 `{ rank, facility, fans, morale, capRoom }`. 거절 이유는 `cap` `rank` `facility` `fans` `morale` `salary` `mood`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/freeAgency.test.mjs`

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/freeAgency.test.mjs`
Expected: FAIL (`Cannot find module`)

- [ ] **Step 3: 구현** — `next/engine/freeAgency.mjs`

```js
import { AI_NAMED_MAX, FA_FRESH, FA_RELEASED, POSITIONS, RESIGN_MIN_MOOD, ROSTER_STARS } from './constants.mjs';
import { askingSalary, marketValue, newContract } from './contract.mjs';
import { createPlayer, overall } from './player.mjs';
import { randInt } from './rng.mjs';
import { setStars } from './roster.mjs';

// 가치가 높은 선수일수록 영입 조건이 까다롭다.
// 조건: maxRank(작년 N위 이상), minFacility(시설 N 이상), minFans(팬 N 이상), minMorale(팀 사기 N 이상)
function makeConditions(rng, player) {
  const v = marketValue(player);
  const c = {};
  if (v > 60 && rng() < 0.7) c.maxRank = randInt(rng, 4, 12);
  if (v > 50 && rng() < 0.5) c.minFacility = randInt(rng, 2, 6);
  if (v > 55 && rng() < 0.4) c.minFans = randInt(rng, 10, 50);
  if (rng() < 0.3) c.minMorale = randInt(rng, 50, 75);
  return c;
}

export const toEntry = (rng, player) => ({ player, conditions: makeConditions(rng, player), asking: askingSalary(player) });

// 이번 시즌 FA 시장: 새로 만든 6명 + 풀려난 선수(최대 4명).
// released는 내 팀이 거절한 선수나 AI 팀이 내놓은 선수 목록이다.
export function generateFreeAgents(rng, { released = [], prefix }) {
  const fresh = Array.from({ length: FA_FRESH }, (_, i) => createPlayer({
    rng,
    id: `${prefix}-${i}`,
    position: POSITIONS[randInt(rng, 0, POSITIONS.length - 1)],
    age: randInt(rng, 24, 31),
    level: 45 + rng() * 35,
  }));
  return [...fresh, ...released.slice(0, FA_RELEASED)].map((p) => toEntry(rng, p));
}

// club: { rank(작년 순위), facility, fans, morale(팀 사기), capRoom }
// 이유 순서: 캡 → 영입 조건 → 금액. 이유는 화면에서 그대로 보여 준다.
export function evaluateOffer(entry, salary, club) {
  const c = entry.conditions;
  if (salary > club.capRoom) return { accepted: false, reason: 'cap' };
  if (c.maxRank !== undefined && club.rank > c.maxRank) return { accepted: false, reason: 'rank' };
  if (c.minFacility !== undefined && club.facility < c.minFacility) return { accepted: false, reason: 'facility' };
  if (c.minFans !== undefined && club.fans < c.minFans) return { accepted: false, reason: 'fans' };
  if (c.minMorale !== undefined && club.morale < c.minMorale) return { accepted: false, reason: 'morale' };
  if (salary < entry.asking) return { accepted: false, reason: 'salary' };
  return { accepted: true, reason: null };
}

// 협상이 통과한 FA를 내 팀 스타로 데려온다. 자리가 없으면 먼저 누군가를 내보내야 한다.
export function signFreeAgent(team, rng, entry, salary, club) {
  if (team.stars.length >= ROSTER_STARS) throw new Error('스타 자리가 가득 찼습니다');
  const result = evaluateOffer(entry, salary, club);
  if (!result.accepted) throw new Error(`영입 실패: ${result.reason}`);
  entry.player.contract = newContract(salary);
  setStars(team, rng, [...team.stars, entry.player]);
  return entry.player;
}

// 재계약: 사기가 너무 낮으면 거절, 사기가 높으면 요구 연봉의 90%에 응한다.
export function evaluateResign(player, salary, club) {
  if (player.mood < RESIGN_MIN_MOOD) return { accepted: false, reason: 'mood' };
  if (salary > club.capRoom + player.contract.salary) return { accepted: false, reason: 'cap' };
  const need = Math.round(askingSalary(player) * (player.mood >= 80 ? 0.9 : 1));
  if (salary < need) return { accepted: false, reason: 'salary' };
  return { accepted: true, reason: null };
}

export function resign(player, salary, club) {
  const result = evaluateResign(player, salary, club);
  if (!result.accepted) throw new Error(`재계약 실패: ${result.reason}`);
  player.contract = newContract(salary);
}

// 재계약을 거절했거나 안 한 선수를 팀에서 빼서 FA 시장 항목으로 돌려준다.
export function releaseToPool(team, rng, player) {
  if (!team.stars.includes(player)) throw new Error('이 팀의 스타가 아닙니다');
  setStars(team, rng, team.stars.filter((p) => p !== player));
  return toEntry(rng, player);
}

// 내가 영입하지 않은 FA는 AI 팀이 데려가 이름 있는 AI 선수(팀당 최대 3명)가 된다.
// 3명이 넘으면 가장 약한 선수가 밀려난다.
export function aiSign(rng, entries, aiTeams) {
  if (entries.length > 0 && aiTeams.length === 0) throw new Error('영입할 AI 팀이 없습니다');
  return entries.map((entry) => {
    const team = aiTeams[randInt(rng, 0, aiTeams.length - 1)];
    const named = (team.named ??= []);
    named.push(entry.player);
    if (named.length > AI_NAMED_MAX) {
      named.sort((a, b) => overall(b) - overall(a));
      named.length = AI_NAMED_MAX;
    }
    return { playerId: entry.player.id, teamId: team.id };
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test next/tests/freeAgency.test.mjs`
Expected: PASS (14 tests)

- [ ] **Step 5: 커밋**

```bash
git add next/engine/freeAgency.mjs next/tests/freeAgency.test.mjs
git commit -m "feat(next): FA 시장, 영입 협상, 재계약, AI 영입"
```

---

### Task 4: 트레이드(양방향)

**Files:**
- Create: `next/engine/trade.mjs`
- Test: `next/tests/trade.test.mjs`

**Interfaces:**
- Consumes: Task 1 `marketValue` `payroll` `setStars`, Task 2 `grantPicks`(테스트), 계획 1 `weightedPick`
- Produces: `pickValue(slot)`, `checkOffer(offer, me, ai) -> null | 이유 문자열`, `aiAccepts({ offer, me, ai, myCap, aiCap, slots }) -> { accepted, reason }`, `executeTrade({ offer, me, ai, myCap, aiCap, rng })`, `proposeAi(rng, me, aiTeams, year) -> offer | null`. `offer = { give: { players: [id], picks: [{ year, from }] }, get: { ... } }`은 항상 내 입장이다

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/trade.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createTeam } from '../engine/team.mjs';
import { grantPicks } from '../engine/draft.mjs';
import { newContract, payroll } from '../engine/contract.mjs';
import { aiAccepts, checkOffer, executeTrade, pickValue, proposeAi } from '../engine/trade.mjs';

function world(seed = 1) {
  const rng = createRng(seed);
  const me = createTeam({ rng, id: 'ME', starLevel: 60 });
  const ai = createTeam({ rng, id: 'AI', starLevel: 60 });
  for (const t of [me, ai]) t.stars.forEach((p) => { p.contract = newContract(10); });
  grantPicks([me, ai], 2027);
  const slots = new Map([['ME', 10], ['AI', 10]]);
  return { rng, me, ai, slots };
}
const swap = (me, ai, extra = {}) => ({ give: { players: [me.stars[3].id], picks: [] }, get: { players: [ai.stars[3].id], picks: [] }, ...extra });

test('지명권 가치는 앞 순번일수록 크다', () => {
  assert.ok(pickValue(1) > pickValue(10));
  assert.ok(pickValue(10) > pickValue(20));
});

test('구조 검사: 선수 수 불일치, 없는 선수, 없는 지명권, 빈 거래는 이유를 돌려준다', () => {
  const { me, ai } = world();
  assert.equal(checkOffer(swap(me, ai), me, ai), null);
  assert.match(checkOffer({ give: { players: [me.stars[0].id], picks: [] }, get: { players: [], picks: [{ year: 2027, from: 'AI' }] } }, me, ai), /같아야/);
  assert.match(checkOffer({ give: { players: ['nope'], picks: [] }, get: { players: [ai.stars[0].id], picks: [] } }, me, ai), /없습니다/);
  assert.match(checkOffer({ give: { players: [], picks: [{ year: 2027, from: 'AI' }] }, get: { players: [], picks: [] } }, me, ai), /지명권/);
  assert.match(checkOffer({ give: { players: [], picks: [] }, get: { players: [], picks: [] } }, me, ai), /빈 거래/);
});

test('AI는 내가 더 좋은 선수를 주면 수락하고, 같은 가치의 맞교환은 거절한다(10% 여유 필요)', () => {
  const { me, ai, slots } = world();
  me.stars[3].attrs = Object.fromEntries(Object.keys(me.stars[3].attrs).map((k) => [k, 90]));
  me.stars[3].potential = 95;
  const args = { me, ai, myCap: 999, aiCap: 999, slots };
  assert.equal(aiAccepts({ offer: swap(me, ai), ...args }).accepted, true);
  const { me: m2, ai: a2 } = world();
  m2.stars[3].attrs = { ...a2.stars[3].attrs };
  m2.stars[3].potential = a2.stars[3].potential;
  assert.equal(aiAccepts({ offer: swap(m2, a2), me: m2, ai: a2, myCap: 999, aiCap: 999, slots }).reason, 'value');
});

test('AI는 사기 30 미만 선수를 받지 않는다', () => {
  const { me, ai, slots } = world();
  me.stars[3].attrs = Object.fromEntries(Object.keys(me.stars[3].attrs).map((k) => [k, 90]));
  me.stars[3].mood = 29;
  assert.equal(aiAccepts({ offer: swap(me, ai), me, ai, myCap: 999, aiCap: 999, slots }).reason, 'mood');
});

test('거래 뒤 양쪽 중 한 팀이라도 캡을 넘으면 거절/오류다', () => {
  const { rng, me, ai, slots } = world();
  me.stars[3].attrs = Object.fromEntries(Object.keys(me.stars[3].attrs).map((k) => [k, 90]));
  ai.stars[3].contract.salary = 30; // 내가 30짜리를 받으면 내 연봉 총액 60 → 80
  assert.equal(aiAccepts({ offer: swap(me, ai), me, ai, myCap: 70, aiCap: 999, slots }).reason, 'cap');
  assert.throws(() => executeTrade({ offer: swap(me, ai), me, ai, myCap: 70, aiCap: 999, rng }), /샐러리캡/);
  assert.equal(me.stars.length, 6);
});

test('executeTrade: 선수와 지명권이 서로 옮겨 가고 양쪽 스타는 6명, 라인업은 11명이다', () => {
  const { rng, me, ai } = world(2);
  const mine = me.stars[3];
  const theirs = ai.stars[3];
  const offer = { give: { players: [mine.id], picks: [{ year: 2027, from: 'ME' }] }, get: { players: [theirs.id], picks: [] } };
  const before = payroll(me) + payroll(ai);
  executeTrade({ offer, me, ai, myCap: 999, aiCap: 999, rng });
  assert.ok(me.stars.includes(theirs) && !me.stars.includes(mine));
  assert.ok(ai.stars.includes(mine));
  assert.equal(me.stars.length, 6);
  assert.equal(ai.stars.length, 6);
  assert.equal(me.lineup.length, 11);
  assert.equal(ai.lineup.length, 11);
  assert.equal(me.picks.length, 0);
  assert.equal(ai.picks.length, 2);
  assert.equal(payroll(me) + payroll(ai), before); // 연봉 총액 보존
});

test('executeTrade: 구조가 틀리면 아무것도 바꾸지 않고 오류다', () => {
  const { rng, me, ai } = world();
  const snapshot = me.stars.map((p) => p.id);
  assert.throws(() => executeTrade({ offer: { give: { players: ['x'], picks: [] }, get: { players: [ai.stars[0].id], picks: [] } }, me, ai, myCap: 999, aiCap: 999, rng }), /없습니다/);
  assert.deepEqual(me.stars.map((p) => p.id), snapshot);
});

test('AI 제안: 내 스타와 가치가 가장 비슷한 선수를 맞바꾸자고 하고 그대로 실행할 수 있다', () => {
  const { rng, me, ai } = world(3);
  const offer = proposeAi(rng, me, [ai], 2027);
  assert.equal(offer.aiTeamId, 'AI');
  assert.equal(checkOffer(offer, me, ai), null);
  executeTrade({ offer, me, ai, myCap: 999, aiCap: 999, rng });
  assert.equal(me.stars.length, 6);
});

test('AI 제안: 상대 선수가 더 약하면 지명권을 덧붙이고, 보낼 팀이 없으면 null이다', () => {
  const { rng, me, ai } = world(4);
  for (const p of ai.stars) p.attrs = Object.fromEntries(Object.keys(p.attrs).map((k) => [k, 20]));
  const offer = proposeAi(rng, me, [ai], 2027);
  assert.deepEqual(offer.get.picks, [{ year: 2027, from: 'AI' }]);
  assert.equal(proposeAi(rng, me, [], 2027), null);
  const empty = { ...me, stars: [] };
  assert.equal(proposeAi(rng, empty, [ai], 2027), null);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/trade.test.mjs`
Expected: FAIL (`Cannot find module`)

- [ ] **Step 3: 구현** — `next/engine/trade.mjs`

```js
import { TRADE_MARGIN, TRADE_MIN_MOOD } from './constants.mjs';
import { marketValue, payroll } from './contract.mjs';
import { setStars } from './roster.mjs';
import { weightedPick } from './rng.mjs';

// 지명권 가치: 1번 슬롯 68.5 ~ 20번 슬롯 40. slots는 원래 팀 id → 예상 슬롯(꼴찌가 1번)
export const pickValue = (slot) => 40 + (20 - slot) * 1.5;

// offer는 내 입장: { give: { players: [id], picks: [{year, from}] }, get: { players: [id], picks: [...] } }
const find = (team, id) => team.stars.find((p) => p.id === id);
const owns = (team, pick) => (team.picks ?? []).some((q) => q.year === pick.year && q.from === pick.from);
const sideValue = (players, picks, slots) =>
  players.reduce((s, p) => s + marketValue(p), 0) + picks.reduce((s, k) => s + pickValue(slots.get(k.from) ?? 10), 0);

// 구조가 맞는지만 본다(수락 여부는 aiAccepts). 맞지 않으면 이유를 문자열로 돌려준다.
export function checkOffer(offer, me, ai) {
  const gp = offer.give.players.map((id) => find(me, id));
  const ap = offer.get.players.map((id) => find(ai, id));
  if (gp.includes(undefined) || ap.includes(undefined)) return '교환할 선수가 팀에 없습니다';
  if (gp.length !== ap.length) return '주고받는 선수 수가 같아야 합니다';
  if (!offer.give.picks.every((k) => owns(me, k)) || !offer.get.picks.every((k) => owns(ai, k))) return '지명권을 가지고 있지 않습니다';
  if (gp.length + offer.give.picks.length === 0) return '빈 거래입니다';
  return null;
}

// 거래 뒤 연봉 총액이 각 팀 캡을 넘는지 계산한다.
function payrollsAfter(offer, me, ai) {
  const gp = offer.give.players.map((id) => find(me, id));
  const ap = offer.get.players.map((id) => find(ai, id));
  const sum = (list) => list.reduce((s, p) => s + p.contract.salary, 0);
  return { me: payroll(me) - sum(gp) + sum(ap), ai: payroll(ai) - sum(ap) + sum(gp) };
}

// AI 수락 기준: 받는 가치 ≥ 주는 가치 × 1.1, 거래 뒤 양쪽 캡 이내, 사기 30 미만 선수는 받지 않음.
export function aiAccepts({ offer, me, ai, myCap, aiCap, slots }) {
  const bad = checkOffer(offer, me, ai);
  if (bad) return { accepted: false, reason: 'invalid', detail: bad };
  const gp = offer.give.players.map((id) => find(me, id));
  const ap = offer.get.players.map((id) => find(ai, id));
  if (gp.some((p) => p.mood < TRADE_MIN_MOOD)) return { accepted: false, reason: 'mood' };
  const after = payrollsAfter(offer, me, ai);
  if (after.me > myCap || after.ai > aiCap) return { accepted: false, reason: 'cap' };
  const received = sideValue(gp, offer.give.picks, slots);
  const given = sideValue(ap, offer.get.picks, slots);
  if (received < given * TRADE_MARGIN) return { accepted: false, reason: 'value' };
  return { accepted: true, reason: null };
}

// 거래를 실제로 적용한다(수락 판단은 호출한 쪽 몫). 구조와 캡이 어긋나면 오류.
export function executeTrade({ offer, me, ai, myCap, aiCap, rng }) {
  const bad = checkOffer(offer, me, ai);
  if (bad) throw new Error(bad);
  const after = payrollsAfter(offer, me, ai);
  if (after.me > myCap || after.ai > aiCap) throw new Error('샐러리캡을 넘는 거래입니다');
  const gp = offer.give.players.map((id) => find(me, id));
  const ap = offer.get.players.map((id) => find(ai, id));
  setStars(me, rng, [...me.stars.filter((p) => !gp.includes(p)), ...ap]);
  setStars(ai, rng, [...ai.stars.filter((p) => !ap.includes(p)), ...gp]);
  const move = (from, to, picks) => {
    from.picks = from.picks.filter((q) => !picks.some((k) => k.year === q.year && k.from === q.from));
    (to.picks ??= []).push(...picks);
  };
  move(me, ai, offer.give.picks);
  move(ai, me, offer.get.picks);
}

// AI가 내 스타 한 명(가치가 클수록 잘 걸림)에게 보내는 제안. 가치가 가장 비슷한 선수를 맞바꾸자고 하고,
// 그쪽이 더 약하면 자기 지명권 한 장을 덧붙인다. 보낼 수 있는 제안이 없으면 null.
export function proposeAi(rng, me, aiTeams, year) {
  if (me.stars.length === 0) return null;
  const mine = weightedPick(rng, me.stars, marketValue);
  const candidates = aiTeams.filter((t) => t.stars.length > 0);
  if (candidates.length === 0) return null;
  const ai = candidates[Math.floor(rng() * candidates.length)];
  const theirs = ai.stars.reduce((a, b) => (Math.abs(marketValue(b) - marketValue(mine)) < Math.abs(marketValue(a) - marketValue(mine)) ? b : a));
  const sweetener = marketValue(theirs) < marketValue(mine) ? (ai.picks ?? []).filter((k) => k.year === year).slice(0, 1) : [];
  return { aiTeamId: ai.id, give: { players: [mine.id], picks: [] }, get: { players: [theirs.id], picks: sweetener } };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test next/tests/trade.test.mjs`
Expected: PASS (9 tests)

- [ ] **Step 5: 커밋**

```bash
git add next/engine/trade.mjs next/tests/trade.test.mjs
git commit -m "feat(next): 양방향 트레이드(선수 맞교환, 지명권, AI 수락 기준)"
```

---

### Task 5: 전체 확인

- [ ] **Step 1: 전체 테스트**

Run: `node --test next/tests/*.test.mjs`
Expected: PASS (80 tests, 0 fail: 계획 1의 40개 + 이 계획의 40개). 기존 게임: `node --test tests/*.test.mjs` 도 그대로 통과.

## Self-Review

**Spec coverage** (이 계획이 맡는 부분)
- 7절 드래프트(1라운드, 후보 20, 성적 역순, 지명권 시즌당 1장, 속성 공개는 화면 몫) → Task 2.
- 7절 FA(10명 = 신규 6 + 풀림 4, 금액과 영입 조건, 못 잡으면 AI 영입, 이름 있는 AI 선수 3명 한도) → Task 3.
- 7절 계약 3년 고정, 우선 재계약, 거절 시 FA로 → Task 1(`tickContracts`), Task 3(`resign` `releaseToPool`).
- 7절 트레이드 양방향(지명권 교환, 선수 맞교환, 코인 거래 없음), 수락 기준(가치 균형, 캡 여유, 선수 사기) → Task 4.
- 8절 샐러리캡(스타만) → Task 1 `payroll` `capRoom`, Task 3·4의 캡 검사.
- 이 계획에서 하지 않는 것: 시작 드래프트(스타 3명 배정 + 3명 선택)는 계획 8, AI 팀의 실제 지명·FA 이탈 일정은 계획 5, 코인·시설 수치(`club.facility` `club.fans`의 실제 값)는 계획 3, 사기 변화는 계획 4, 화면은 계획 7.

**Placeholder scan:** 모든 단계에 실제 코드와 명령이 있다. "TBD" 없음.

**Type consistency:** `club` 객체 `{ rank, facility, fans, morale, capRoom }`는 Task 3 안에서만 쓰이며 필드 이름이 테스트와 구현에서 같다. 지명권 `{ year, from }`은 Task 2의 `grantPicks`와 Task 4의 `owns`에서 같다. `offer`는 Task 4 안에서 `give`/`get` 모두 `{ players, picks }`다. 선수 계약은 `{ salary, years }`로 계획 1 `createPlayer`와 같다.

**검증 메모:** 이 계획의 코드는 계획 1이 끝난 `next/`를 임시 폴더에 복사해 `node --test`로 80개(기존 40 + 신규 40)가 모두 통과하는 것을 확인한 뒤 옮겼다.

## 후속 계획 (서브프로젝트)

| 계획 | 내용 |
|---|---|
| 3 경제 | 코인, 시설 3종 10단계, 코치 2명(별·XP·계약·훈련 강도), 팬 수, `club.facility`/`club.fans` 실제 값 |
| 4 성장·상태 | XP·레벨업, 사기·컨디션 변화, 휴식 지정, 부상, 나이·은퇴, 면담·기자회견 |
| 5 리그 세계 | 3단계 사다리, 승강·단판 승강전, AI 팀 생성·FA 이동, 8개 지역 챔피언스리그 |
| 6 상·기록 | 상 판정, 기록실, 트로피, 역대 우승팀, 명예의 전당, 은퇴식 |
| 7 화면 | 로스터·선수 상세·결과·프런트 오피스 등 |
| 8 시작·튜토리얼 | 스타 3명 배정 + 시작 드래프트, 튜토리얼, 런 종료 |
