# FM-Lite 경제 구현 계획 (계획 3/8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구단 코인, 시설 3종(10단계), 샐러리캡 확장, 수입(승리·팬·우승 상금), 코치 2명(별·XP·계약·훈련 강도·특성)을 화면 없는 엔진으로 만들고 테스트로 고정한다.

**Architecture:** 구단 상태는 `club` 객체 하나(코인, 팬 지수, 시설 3종, 캡 확장 횟수)이고 모든 지출은 `spend` 하나를 지나간다. `spend`는 모자라면 아무것도 바꾸지 않고 오류를 내므로 시설·캡·코치 구매가 항상 "전부 성공 또는 전부 무변화"다. 코치는 `team.coaches.attack` / `team.coaches.defense` 자리에 그대로 들어가고(계획 1의 `teamRatings`가 `.stars`를 읽는다), 코치 수준이 바뀌면 `syncFillers`가 조연 능력을 같이 올리고 내린다.

**Tech Stack:** 순수 ES 모듈(`.mjs`), Node 내장 테스트러너, 외부 의존성 0, 빌드 없음.

**Spec:** `docs/superpowers/specs/2026-10-16-fm-lite-next-design.md` (6.5절 코치 훈련 강도, 8절 경제, 13절 초기 수치)

## Global Constraints

- 새 파일은 `next/` 아래에만 만든다. 기존 게임은 건드리지 않는다. 계획 1·2의 파일 중 고치는 것은 `constants.mjs`(추가만)와 `team.mjs`(`fillerBase` 필드 한 줄)뿐이다.
- 엔진에서 `Math.random`, `document`, `window`, `localStorage`를 쓰지 않는다. 난수는 `rng` 인자로 받는다.
- 주석과 사용자에게 보이는 문구는 한국어, 문구에 em 대시를 쓰지 않는다.
- 코인은 하나뿐이다. 시설 3종(경기장·훈련·재활)은 각 10단계, 1단계에서 시작하고 n단계로 올리는 비용은 10 x n 코인이다.
- 샐러리캡은 3부 100, 2부 150, 1부 200(스타 연봉 총액만). 캡 확장은 1회 +10, 5회까지.
- 수입: 승리 3부 5, 2부 8, 1부 12코인. 우승 상금 3부 50, 2부 100, 1부 200코인. 팬 수입은 경기장 단계에 비례.
- 코치는 2명(공격·수비), 별 0.5 단위(0.5~5), 계약 3년, 훈련 강도 LIGHT / NORMAL / HARD.
- 수치(비용식, 배율 등)는 초기값이며 `constants.mjs` 한 곳에서만 정의한다.

## Review Focus

1. **코인이 모자란 구매(시설·캡·코치 고용·재계약)**: 오류이고 코인·시설·코치·조연이 하나도 바뀌지 않아야 한다 (Task 1, 2).
2. **10단계 시설과 5회 확장한 캡에 한 번 더**: 명확한 오류여야 한다 (Task 1).
3. **음수 수입·지출, 모르는 시설·리그 단계·훈련 강도·코치 종류**: 조용히 넘어가지 않고 오류여야 한다 (Task 1, 2).
4. **5별 코치의 XP 넘침, 한 번에 여러 칸 오르는 XP**: 별이 5를 넘지 않고 남은 XP가 이어져야 한다 (Task 2).
5. **팬 지수가 0이나 100 근처에서 연승·연패**: 0~100을 벗어나지 않아야 한다 (Task 1).

---

### Task 1: 상수, 구단 코인·시설·캡·수입

**Files:**
- Modify: `next/engine/constants.mjs` (맨 아래에 추가), `next/engine/team.mjs` (`createTeam`이 돌려주는 객체에 `fillerBase: level` 한 줄 추가)
- Create: `next/engine/economy.mjs`
- Test: `next/tests/economy.test.mjs`

**Interfaces:**
- Consumes: 계획 2의 `payroll`, `SALARY_CAP`, 계획 1의 `createTeam`
- Produces: `createClub({ coins, fans })`, `earn(club, n)`, `spend(club, n)`, `upgradeCost(club, kind)`, `upgradeFacility(club, kind)`, `capExpandCost(club)`, `expandCap(club)`, `salaryCap(club, tier)`, `chunkIncome(results, teamId, club, tier) -> { win, fan, total }`, `fansAfterChunk(fans, results, teamId)`, `seasonPrize(tier, champion)`, `facilityEffects(club) -> { xpMultiplier, healMultiplier }`, `negotiationClub(club, { rank, morale, team, tier })`(계획 2의 `evaluateOffer`에 넘기는 `club` 객체). 상수 `START_COINS` `START_FANS` `FACILITY_KINDS` `FACILITY_MAX` `FACILITY_COST_STEP` `CAP_STEP` `CAP_EXPANSIONS_MAX` `CAP_COST_STEP` `WIN_INCOME` `CHAMPION_PRIZE` `FAN_INCOME_SCALE` `FAN_PER_RESULT` `COACH_COST_FACTOR` `INTENSITIES` `TRAITS`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/economy.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createTeam } from '../engine/team.mjs';
import { newContract } from '../engine/contract.mjs';
import { evaluateOffer } from '../engine/freeAgency.mjs';
import {
  capExpandCost, chunkIncome, createClub, earn, expandCap, facilityEffects, fansAfterChunk, negotiationClub,
  salaryCap, seasonPrize, spend, upgradeCost, upgradeFacility,
} from '../engine/economy.mjs';

test('코인이 모자라면 지출이 오류이고 코인은 그대로다', () => {
  const club = createClub({ coins: 5 });
  assert.throws(() => spend(club, 6), /모자랍니다/);
  assert.equal(club.coins, 5);
  spend(club, 5);
  assert.equal(club.coins, 0);
});

test('음수 수입·지출은 오류다', () => {
  const club = createClub();
  assert.throws(() => earn(club, -1), /0 이상/);
  assert.throws(() => spend(club, -1), /0 이상/);
});

test('시설은 1단계에서 시작하고 n단계로 올리는 비용은 10 x n이다', () => {
  const club = createClub({ coins: 100 });
  assert.equal(upgradeCost(club, 'stadium'), 20);
  upgradeFacility(club, 'stadium');
  assert.equal(club.facilities.stadium, 2);
  assert.equal(club.coins, 80);
  assert.equal(upgradeCost(club, 'stadium'), 30);
});

test('코인이 모자라면 시설이 그대로이고, 10단계를 넘길 수 없다', () => {
  const poor = createClub({ coins: 10 });
  assert.throws(() => upgradeFacility(poor, 'rehab'), /모자랍니다/);
  assert.equal(poor.facilities.rehab, 1);
  const rich = createClub({ coins: 99999 });
  for (let i = 0; i < 9; i += 1) upgradeFacility(rich, 'training');
  assert.equal(rich.facilities.training, 10);
  assert.throws(() => upgradeFacility(rich, 'training'), /최고 단계/);
  assert.throws(() => upgradeFacility(rich, 'nope'), /알 수 없는 시설/);
});

test('캡 확장: 1회 +10, 비용 20 x n, 5회까지', () => {
  const club = createClub({ coins: 99999 });
  assert.equal(salaryCap(club, 3), 100);
  assert.equal(capExpandCost(club), 20);
  for (let i = 0; i < 5; i += 1) expandCap(club);
  assert.equal(salaryCap(club, 3), 150);
  assert.equal(salaryCap(club, 1), 250);
  assert.throws(() => expandCap(club), /더 늘릴 수 없/);
  assert.throws(() => salaryCap(club, 4), /알 수 없는 리그/);
});

const result = (homeId, awayId, homeGoals, awayGoals) => ({ homeId, awayId, homeGoals, awayGoals });

test('수입: 승리는 리그 단계 수입, 무승부·패배는 0, 남의 경기는 무시한다', () => {
  const club = createClub({ fans: 0 }); // 팬 수입 0으로 만든다
  const results = [result('A', 'B', 2, 0), result('B', 'A', 1, 1), result('A', 'B', 0, 3), result('B', 'A', 0, 1), result('C', 'D', 5, 0)];
  assert.deepEqual(chunkIncome(results, 'A', club, 3), { win: 10, fan: 0, total: 10 });
  assert.equal(chunkIncome(results, 'A', club, 1).win, 24);
});

test('수입: 팬 수입은 홈경기에서만 나오고 경기장 단계와 팬 지수에 비례한다', () => {
  const home = Array.from({ length: 10 }, () => result('A', 'B', 0, 0));
  const away = Array.from({ length: 10 }, () => result('B', 'A', 0, 0));
  const club = createClub({ fans: 50 });
  club.facilities.stadium = 4;
  assert.equal(chunkIncome(home, 'A', club, 3).fan, 40); // 10경기 x 4 x 0.5 x 2
  assert.equal(chunkIncome(away, 'A', club, 3).fan, 0);
});

test('팬 지수: 이기면 오르고 지면 내리며 0~100을 벗어나지 않는다', () => {
  const wins = Array.from({ length: 14 }, () => result('A', 'B', 1, 0));
  const losses = Array.from({ length: 14 }, () => result('A', 'B', 0, 1));
  assert.ok(Math.abs(fansAfterChunk(50, wins, 'A') - 54.2) < 1e-9);
  assert.ok(Math.abs(fansAfterChunk(50, losses, 'A') - 45.8) < 1e-9);
  assert.equal(fansAfterChunk(99.9, wins, 'A'), 100);
  assert.equal(fansAfterChunk(0.1, losses, 'A'), 0);
  assert.equal(fansAfterChunk(50, [result('A', 'B', 2, 2)], 'A'), 50);
});

test('우승 상금은 우승했을 때만, 리그 단계별로 나온다', () => {
  assert.equal(seasonPrize(3, true), 50);
  assert.equal(seasonPrize(1, true), 200);
  assert.equal(seasonPrize(1, false), 0);
});

test('시설 효과: 1단계는 기본 배율, 단계가 오를수록 커진다', () => {
  const club = createClub();
  assert.deepEqual(facilityEffects(club), { xpMultiplier: 1, healMultiplier: 1 });
  club.facilities.training = 10;
  assert.ok(Math.abs(facilityEffects(club).xpMultiplier - 1.72) < 1e-9);
});

test('협상용 club: 시설 평균(내림), 캡 여유가 계획 2의 evaluateOffer에 그대로 들어간다', () => {
  const rng = createRng(1);
  const team = createTeam({ rng, id: 'A' });
  team.stars.forEach((p) => { p.contract = newContract(10); });
  const club = createClub({ fans: 33.4 });
  club.facilities = { stadium: 5, training: 4, rehab: 2 };
  const view = negotiationClub(club, { rank: 7, morale: 60, team, tier: 3 });
  assert.deepEqual(view, { rank: 7, facility: 3, fans: 33, morale: 60, capRoom: 40 });
  const entry = { player: team.stars[0], conditions: { minFacility: 4 }, asking: 10 };
  assert.equal(evaluateOffer(entry, 10, view).reason, 'facility');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/economy.test.mjs`
Expected: FAIL (`Cannot find module '../engine/economy.mjs'`)

- [ ] **Step 3: 상수 추가** — `next/engine/constants.mjs` 맨 아래에 붙인다

```js
// ---- 계획 3: 경제 ----
export const START_COINS = 30;
export const START_FANS = 20; // 팬 지수 0~100
export const FACILITY_KINDS = ['stadium', 'training', 'rehab'];
export const FACILITY_MAX = 10;
export const FACILITY_COST_STEP = 10; // n단계로 올리는 비용 = 10 x n 코인
export const CAP_STEP = 10; // 캡 확장 1회당 늘어나는 캡 포인트
export const CAP_EXPANSIONS_MAX = 5;
export const CAP_COST_STEP = 20; // n번째 확장 비용 = 20 x n 코인
// 리그 단계(1=1부)별 수입
export const WIN_INCOME = { 3: 5, 2: 8, 1: 12 };
export const CHAMPION_PRIZE = { 3: 50, 2: 100, 1: 200 };
export const FAN_INCOME_SCALE = 2; // 홈경기 수입 = 경기장 단계 x 팬 지수/100 x 2
export const FAN_PER_RESULT = 0.3; // 구간마다 (승 - 패) x 0.3 만큼 팬 지수 변화
export const COACH_COST_FACTOR = 6; // 코치 계약 비용 = 6 x 별^2 코인(3년 계약 한 번에)
// 훈련 강도: xp 배율, 컨디션 소모 배율, 사기 변화, 부상 배율
export const INTENSITIES = {
  LIGHT: { xp: 0.8, fatigue: 0.7, mood: 1, injury: 0.8 },
  NORMAL: { xp: 1, fatigue: 1, mood: 0, injury: 1 },
  HARD: { xp: 1.25, fatigue: 1.4, mood: -2, injury: 1.3 },
};
// 코치 특성: xp 배율, 사기 가산, 부상 배율
export const TRAITS = {
  strict: { label: '엄격함', xp: 1.1, mood: -1, injury: 1 },
  motivator: { label: '동기부여', xp: 1, mood: 1, injury: 1 },
  tactician: { label: '전술가', xp: 1.15, mood: 0, injury: 1.1 },
  caretaker: { label: '관리형', xp: 0.95, mood: 0, injury: 0.8 },
};
```

- [ ] **Step 4: team.mjs 수정** — `createTeam`의 반환 객체에 `fillerBase` 한 줄을 넣는다(조연에게 마지막으로 반영된 코치 기준 수준, Task 2의 `syncFillers`가 쓴다).

```js
  return {
    id,
    coaches: { attack: { stars: attackStars }, defense: { stars: defenseStars } },
    fillerBase: level, // 조연에게 마지막으로 반영된 코치 기준 수준(코치가 바뀌면 syncFillers가 맞춘다)
    stars,
    lineup: [...stars, ...fillers],
  };
```

- [ ] **Step 5: 구현** — `next/engine/economy.mjs`

```js
import {
  CAP_COST_STEP, CAP_EXPANSIONS_MAX, CAP_STEP, CHAMPION_PRIZE, FACILITY_COST_STEP, FACILITY_KINDS, FACILITY_MAX,
  FAN_INCOME_SCALE, FAN_PER_RESULT, SALARY_CAP, START_COINS, START_FANS, WIN_INCOME,
} from './constants.mjs';
import { payroll } from './contract.mjs';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 구단 상태: 코인 하나, 팬 지수, 시설 3종(각 1~10단계), 캡 확장 횟수.
export const createClub = ({ coins = START_COINS, fans = START_FANS } = {}) => ({
  coins,
  fans,
  facilities: { stadium: 1, training: 1, rehab: 1 },
  capLevel: 0,
});

export function earn(club, amount) {
  if (!(amount >= 0)) throw new Error('수입은 0 이상이어야 합니다');
  club.coins += amount;
}

// 모자라면 아무것도 바꾸지 않고 오류를 낸다.
export function spend(club, amount) {
  if (!(amount >= 0)) throw new Error('지출은 0 이상이어야 합니다');
  if (amount > club.coins) throw new Error('코인이 모자랍니다');
  club.coins -= amount;
}

function checkKind(kind) {
  if (!FACILITY_KINDS.includes(kind)) throw new Error(`알 수 없는 시설: ${kind}`);
}

export function upgradeCost(club, kind) {
  checkKind(kind);
  return (club.facilities[kind] + 1) * FACILITY_COST_STEP;
}

export function upgradeFacility(club, kind) {
  checkKind(kind);
  if (club.facilities[kind] >= FACILITY_MAX) throw new Error('이미 최고 단계입니다');
  spend(club, upgradeCost(club, kind));
  club.facilities[kind] += 1;
}

export const capExpandCost = (club) => (club.capLevel + 1) * CAP_COST_STEP;

export function expandCap(club) {
  if (club.capLevel >= CAP_EXPANSIONS_MAX) throw new Error('캡을 더 늘릴 수 없습니다');
  spend(club, capExpandCost(club));
  club.capLevel += 1;
}

// tier: 3(3부) 2(2부) 1(1부)
export function salaryCap(club, tier) {
  if (SALARY_CAP[tier] === undefined) throw new Error(`알 수 없는 리그 단계: ${tier}`);
  return SALARY_CAP[tier] + club.capLevel * CAP_STEP;
}

// 구간 하나의 수입: 승리마다 리그 단계 수입, 홈경기마다 팬 수입. 무승부·패배는 승리 수입이 없다.
export function chunkIncome(results, teamId, club, tier) {
  let win = 0;
  let fan = 0;
  for (const r of results) {
    const home = r.homeId === teamId;
    if (!home && r.awayId !== teamId) continue;
    const mine = home ? r.homeGoals : r.awayGoals;
    const theirs = home ? r.awayGoals : r.homeGoals;
    if (mine > theirs) win += WIN_INCOME[tier];
    if (home) fan += club.facilities.stadium * (club.fans / 100) * FAN_INCOME_SCALE;
  }
  fan = Math.round(fan);
  return { win, fan, total: win + fan };
}

// 구간 성적에 따라 팬 지수가 움직인다(0~100).
export function fansAfterChunk(fans, results, teamId) {
  let delta = 0;
  for (const r of results) {
    const home = r.homeId === teamId;
    if (!home && r.awayId !== teamId) continue;
    const diff = (home ? 1 : -1) * (r.homeGoals - r.awayGoals);
    delta += Math.sign(diff) * FAN_PER_RESULT;
  }
  return clamp(fans + delta, 0, 100);
}

export const seasonPrize = (tier, champion) => (champion ? CHAMPION_PRIZE[tier] : 0);

// 시설이 다른 계획에 주는 효과(훈련은 XP 배율, 재활은 회복 배율).
export const facilityEffects = (club) => ({
  xpMultiplier: 1 + 0.08 * (club.facilities.training - 1),
  healMultiplier: 1 + 0.1 * (club.facilities.rehab - 1),
});

// FA 협상(계획 2의 evaluateOffer)에 넘기는 club 객체. 시설 값은 세 시설 단계의 평균(내림).
export function negotiationClub(club, { rank, morale, team, tier }) {
  const levels = Object.values(club.facilities);
  return {
    rank,
    facility: Math.floor(levels.reduce((a, b) => a + b, 0) / levels.length),
    fans: Math.round(club.fans),
    morale,
    capRoom: salaryCap(club, tier) - payroll(team),
  };
}
```

- [ ] **Step 6: 통과 확인**

Run: `node --test next/tests/economy.test.mjs`
Expected: PASS (11 tests). 이어서 `node --test next/tests/*.test.mjs`로 앞선 80개도 그대로 통과하는지 확인한다(91개).

- [ ] **Step 7: 커밋**

```bash
git add next/engine/constants.mjs next/engine/team.mjs next/engine/economy.mjs next/tests/economy.test.mjs
git commit -m "feat(next): 구단 코인·시설·캡 확장·수입·팬 지수"
```

---

### Task 2: 코치 (별·XP·계약·훈련 강도·특성·고용)

**Files:**
- Create: `next/engine/coach.mjs`
- Test: `next/tests/coach.test.mjs`

**Interfaces:**
- Consumes: Task 1 `spend`, `INTENSITIES`, `TRAITS`, `COACH_COST_FACTOR`, 계획 2의 `CONTRACT_YEARS` `RESIGN_MIN_MOOD`, 계획 1의 `fillerLevel` `randInt`
- Produces: `COACH_KINDS`, `createCoach({ rng, id, kind, stars, age })`, `coachCost(stars)`, `generateCoachCandidates(rng, { kind, count, prefix })`, `setIntensity(coach, key)`, `trainingMultipliers(coach) -> { xp, fatigue, mood, injury }`, `coachXpNeeded(stars)`, `addCoachXp(coach, amount)`, `coachSeasonGrowth(coach, rng, { wins }) -> 얻은 xp`, `syncFillers(team)`, `hireCoach(club, team, coach) -> 이전 코치`, `tickCoachContract(coach) -> 만료 여부`, `evaluateCoachRenewal(coach)`, `renewCoach(club, coach)`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/coach.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../engine/rng.mjs';
import { createTeam } from '../engine/team.mjs';
import { createClub } from '../engine/economy.mjs';
import { overall } from '../engine/player.mjs';
import {
  addCoachXp, coachCost, coachSeasonGrowth, coachXpNeeded, createCoach, evaluateCoachRenewal, generateCoachCandidates,
  hireCoach, renewCoach, setIntensity, syncFillers, tickCoachContract, trainingMultipliers,
} from '../engine/coach.mjs';

const coach = (kind = 'attack', stars = 2, extra = {}) => ({ ...createCoach({ rng: createRng(1), id: 'c', kind, stars }), ...extra });

test('코치 생성: 종류와 별(0.5 단위)을 검사한다', () => {
  assert.throws(() => createCoach({ rng: createRng(1), id: 'c', kind: 'goalie' }), /알 수 없는 코치/);
  assert.throws(() => createCoach({ rng: createRng(1), id: 'c', kind: 'attack', stars: 2.3 }), /0.5 단위/);
  assert.throws(() => createCoach({ rng: createRng(1), id: 'c', kind: 'attack', stars: 6 }), /0.5 단위/);
  const c = createCoach({ rng: createRng(1), id: 'c', kind: 'defense', stars: 3 });
  assert.deepEqual([c.intensity, c.contract.years, c.mood, c.xp], ['NORMAL', 3, 70, 0]);
});

test('코치 비용은 별의 제곱에 비례한다', () => {
  assert.deepEqual([1, 3, 5].map(coachCost), [6, 54, 150]);
});

test('고용 후보 3명은 1~4별이다', () => {
  const list = generateCoachCandidates(createRng(2), { kind: 'attack', prefix: 'K' });
  assert.equal(list.length, 3);
  for (const c of list) assert.ok(c.stars >= 1 && c.stars <= 4);
});

test('훈련 강도: HARD는 XP가 크고 사기·부상이 나쁘고, LIGHT는 반대다. 모르는 강도는 오류', () => {
  const c = coach('attack', 2, { trait: 'motivator' });
  setIntensity(c, 'HARD');
  const hard = trainingMultipliers(c);
  setIntensity(c, 'LIGHT');
  const light = trainingMultipliers(c);
  assert.ok(hard.xp > light.xp && hard.fatigue > light.fatigue && hard.injury > light.injury);
  assert.ok(hard.mood < light.mood);
  assert.throws(() => setIntensity(c, 'EXTREME'), /알 수 없는 훈련 강도/);
  assert.equal(c.intensity, 'LIGHT');
});

test('XP가 차면 별이 반 칸 오르고 남은 XP는 이어진다', () => {
  const c = coach('attack', 2);
  addCoachXp(c, coachXpNeeded(2) + 10);
  assert.equal(c.stars, 2.5);
  assert.equal(c.xp, 10);
  addCoachXp(c, 5000); // 한 번에 여러 칸
  assert.equal(c.stars, 5);
});

test('5별 코치는 더 오르지 않고 XP는 상한에서 멈춘다', () => {
  const c = coach('defense', 5);
  addCoachXp(c, 99999);
  assert.equal(c.stars, 5);
  assert.equal(c.xp, coachXpNeeded(5) - 1);
});

test('시즌 성장: XP를 얻고 한 살 먹으며, 승수가 많고 젊을수록 많이 번다', () => {
  const young = coach('attack', 2, { age: 40, trait: 'motivator' });
  const old = coach('attack', 2, { age: 58, trait: 'motivator' });
  const a = coachSeasonGrowth(young, createRng(3), { wins: 30 });
  const b = coachSeasonGrowth(old, createRng(3), { wins: 5 });
  assert.ok(a > b);
  assert.equal(young.age, 41);
});

test('고용: 비용을 내고 팀 코치가 바뀌며 조연 능력이 같이 오른다(기록은 유지)', () => {
  const rng = createRng(4);
  const team = createTeam({ rng, id: 'A', attackStars: 2, defenseStars: 2 });
  team.coaches.attack = coach('attack', 2);
  team.coaches.defense = coach('defense', 2);
  const filler = team.lineup[8];
  filler.stats.goals = 3;
  const before = overall(filler);
  const club = createClub({ coins: 100 });
  const previous = hireCoach(club, team, coach('attack', 4, { id: 'new' }));
  assert.equal(previous.stars, 2);
  assert.equal(team.coaches.attack.id, 'new');
  assert.equal(club.coins, 100 - 96);
  assert.ok(overall(filler) > before + 7); // 별 +2 -> 조연 수준 +8(공격·수비 평균이라 +8)
  assert.equal(filler.stats.goals, 3);
});

test('고용: 코인이 모자라면 코치도 조연도 그대로다', () => {
  const rng = createRng(5);
  const team = createTeam({ rng, id: 'A' });
  team.coaches.attack = coach('attack', 3, { id: 'old' });
  const snapshot = overall(team.lineup[8]);
  const club = createClub({ coins: 10 });
  assert.throws(() => hireCoach(club, team, coach('attack', 5)), /모자랍니다/);
  assert.equal(team.coaches.attack.id, 'old');
  assert.equal(overall(team.lineup[8]), snapshot);
  assert.equal(club.coins, 10);
});

test('코치가 XP로 별이 오른 뒤 syncFillers를 부르면 조연이 따라 올라가고, 두 번 불러도 한 번만 반영된다', () => {
  const rng = createRng(6);
  const team = createTeam({ rng, id: 'A', attackStars: 2, defenseStars: 2 });
  team.coaches.attack = coach('attack', 2);
  team.coaches.defense = coach('defense', 2);
  const filler = team.lineup[9];
  const before = overall(filler);
  addCoachXp(team.coaches.attack, coachXpNeeded(2));
  syncFillers(team);
  const once = overall(filler);
  syncFillers(team);
  assert.ok(once > before);
  assert.equal(overall(filler), once);
});

test('계약: 3년에서 시작해 해마다 줄고 0이 되면 만료, 재계약하면 다시 3년', () => {
  const c = coach();
  assert.equal(tickCoachContract(c), false);
  assert.equal(tickCoachContract(c), false);
  assert.equal(tickCoachContract(c), true);
  const club = createClub({ coins: 50 });
  renewCoach(club, c);
  assert.equal(c.contract.years, 3);
  assert.equal(club.coins, 50 - coachCost(2));
});

test('재계약: 사기 40 미만이면 거절하고 코인은 그대로, 코인이 모자라도 오류다', () => {
  const c = coach('attack', 2, { mood: 39 });
  assert.equal(evaluateCoachRenewal(c).reason, 'mood');
  const club = createClub({ coins: 100 });
  assert.throws(() => renewCoach(club, c), /mood/);
  assert.equal(club.coins, 100);
  assert.throws(() => renewCoach(createClub({ coins: 1 }), coach()), /모자랍니다/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/coach.test.mjs`
Expected: FAIL (`Cannot find module '../engine/coach.mjs'`)

- [ ] **Step 3: 구현** — `next/engine/coach.mjs`

```js
import { COACH_COST_FACTOR, CONTRACT_YEARS, INTENSITIES, RESIGN_MIN_MOOD, TRAITS } from './constants.mjs';
import { fillerLevel } from './team.mjs';
import { randInt } from './rng.mjs';
import { spend } from './economy.mjs';

export const COACH_KINDS = ['attack', 'defense'];
const TRAIT_KEYS = Object.keys(TRAITS);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 코치 한 명. stars는 0.5 단위(0.5~5)이고 팀 전력의 기본 레이팅이 된다(team.coaches[kind]가 이 객체다).
export function createCoach({ rng, id, kind, stars = 2, age }) {
  if (!COACH_KINDS.includes(kind)) throw new Error(`알 수 없는 코치 종류: ${kind}`);
  if (!(stars >= 0.5 && stars <= 5) || (stars * 2) % 1 !== 0) throw new Error('코치 별은 0.5 단위로 0.5~5여야 합니다');
  return {
    id,
    kind,
    stars,
    xp: 0,
    age: age ?? randInt(rng, 38, 60),
    mood: 70,
    trait: TRAIT_KEYS[randInt(rng, 0, TRAIT_KEYS.length - 1)],
    intensity: 'NORMAL',
    contract: { years: CONTRACT_YEARS },
  };
}

// 3년 계약 비용(코인, 한 번에 낸다): 1별 6, 3별 54, 5별 150
export const coachCost = (stars) => Math.round(COACH_COST_FACTOR * stars * stars);

// 고용 후보: 1~4별 사이 3명
export function generateCoachCandidates(rng, { kind, count = 3, prefix }) {
  return Array.from({ length: count }, (_, i) =>
    createCoach({ rng, id: `${prefix}-${i}`, kind, stars: randInt(rng, 2, 8) / 2 }));
}

export function setIntensity(coach, key) {
  if (!INTENSITIES[key]) throw new Error(`알 수 없는 훈련 강도: ${key}`);
  coach.intensity = key;
}

// 훈련 강도와 특성을 합친 배율. 계획 4(성장·상태)가 이 값을 쓴다.
export function trainingMultipliers(coach) {
  const i = INTENSITIES[coach.intensity];
  const t = TRAITS[coach.trait];
  return { xp: i.xp * t.xp, fatigue: i.fatigue, mood: i.mood + t.mood, injury: i.injury * t.injury };
}

export const coachXpNeeded = (stars) => 60 + stars * 40;

// XP를 쌓고 넘치면 별이 반 칸씩 오른다. 5별이면 더 오르지 않고 XP는 다음 별 직전에서 멈춘다.
export function addCoachXp(coach, amount) {
  coach.xp += amount;
  while (coach.stars < 5 && coach.xp >= coachXpNeeded(coach.stars)) {
    coach.xp -= coachXpNeeded(coach.stars);
    coach.stars += 0.5;
  }
  if (coach.stars >= 5) coach.xp = Math.min(coach.xp, coachXpNeeded(5) - 1);
}

// 시즌이 끝날 때 한 번: 승수와 나이, 특성에 따라 XP를 얻고 한 살 먹는다. 얻은 XP를 돌려준다.
export function coachSeasonGrowth(coach, rng, { wins }) {
  const youth = coach.age < 50 ? 1.2 : 1;
  const gain = Math.round((30 + wins * 1.5) * youth * TRAITS[coach.trait].xp * (0.8 + 0.4 * rng()));
  addCoachXp(coach, gain);
  coach.age += 1;
  return gain;
}

// 코치 수준이 바뀐 만큼 조연의 속성을 같이 올리고 내린다(기록은 그대로 둔다).
export function syncFillers(team) {
  const level = fillerLevel(team.coaches.attack.stars, team.coaches.defense.stars);
  const delta = level - team.fillerBase;
  if (delta !== 0) {
    for (const p of team.lineup.slice(team.stars.length)) {
      for (const key of Object.keys(p.attrs)) p.attrs[key] = clamp(Math.round(p.attrs[key] + delta), 1, 99);
    }
  }
  team.fillerBase = level;
}

// 새 코치를 고용한다: 비용을 내고(모자라면 아무것도 안 바뀐다) 팀 코치를 교체하고 조연을 맞춘다. 이전 코치를 돌려준다.
export function hireCoach(club, team, coach) {
  spend(club, coachCost(coach.stars));
  const previous = team.coaches[coach.kind];
  team.coaches[coach.kind] = coach;
  syncFillers(team);
  return previous;
}

// 계약 연수를 1 줄인다. 만료되면 true.
export function tickCoachContract(coach) {
  coach.contract.years -= 1;
  return coach.contract.years <= 0;
}

// 재계약: 사기가 40 미만이면 거절한다.
export function evaluateCoachRenewal(coach) {
  if (coach.mood < RESIGN_MIN_MOOD) return { accepted: false, reason: 'mood', cost: coachCost(coach.stars) };
  return { accepted: true, reason: null, cost: coachCost(coach.stars) };
}

export function renewCoach(club, coach) {
  const result = evaluateCoachRenewal(coach);
  if (!result.accepted) throw new Error(`코치 재계약 실패: ${result.reason}`);
  spend(club, result.cost);
  coach.contract.years = CONTRACT_YEARS;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test next/tests/coach.test.mjs`
Expected: PASS (12 tests)

- [ ] **Step 5: 전체 확인**

Run: `node --test next/tests/*.test.mjs`
Expected: PASS (103 tests, 0 fail: 계획 1의 40 + 계획 2의 40 + 이 계획의 23). 기존 게임: `node --test tests/*.test.mjs`도 그대로 통과.

- [ ] **Step 6: 커밋**

```bash
git add next/engine/coach.mjs next/tests/coach.test.mjs
git commit -m "feat(next): 코치(별·XP·계약·훈련 강도·특성·고용)"
```

## Self-Review

**Spec coverage** (이 계획이 맡는 부분)
- 8절 코인 하나, 시설 3종 10단계(단계마다 코인), 캡 확장, 코치 계약 비용 → Task 1·2.
- 8절 수입원(승리, 팬 수=경기장 비례, 리그 단계 가산, 우승 상금) → Task 1 `chunkIncome` `fansAfterChunk` `seasonPrize`. 기자회견·면담 딜레마의 코인 증감은 계획 4가 `earn` `spend`를 부르면 된다.
- 8절 코치 2명(별, XP 시즌 성장, 계약 3년, 공격·수비 속성에 영향) → Task 2. 코치가 팀 전력에 주는 영향은 계획 1의 `teamRatings`(코치 별 x 12)와 `syncFillers`(조연 수준)로 이미 이어진다.
- 6.5절 훈련 강도 LIGHT / NORMAL / HARD와 코치 사기·나이·특성·계약·재계약 → Task 2.
- 7절 FA 영입 조건의 `시설 N 이상`, `팬 N 이상`의 실제 값 → Task 1 `negotiationClub`이 계획 2의 `club`을 만든다.
- 이 계획에서 하지 않는 것: 훈련 강도와 시설이 실제로 XP·컨디션·부상을 바꾸는 적용(배율만 제공, 적용은 계획 4), 코치 사기 변화(계획 4), 코치 시장 화면과 고용 후보 갱신 주기(계획 7), 상위 리그 수입 가산 외의 팬 수입 곡선 조정(시뮬 측정 후).

**Placeholder scan:** 모든 단계에 실제 코드와 명령이 있다. "TBD" 없음.

**Type consistency:** `club`은 `{ coins, fans, facilities: { stadium, training, rehab }, capLevel }`로 Task 1·2 테스트와 구현이 같다. `negotiationClub`이 돌려주는 `{ rank, facility, fans, morale, capRoom }`은 계획 2의 `evaluateOffer`가 읽는 필드와 같다. 코치 객체는 `team.coaches[kind]`에 그대로 들어가고 `.stars`만 `teamRatings`가 읽는다. `results[i]`는 계획 1 `playChunk`의 `{ round, homeId, awayId, homeGoals, awayGoals, events }`다.

**검증 메모:** 이 계획의 코드는 계획 2까지 끝난 `next/`를 임시 폴더에 복사해 `node --test`로 103개가 모두 통과하는 것을 확인한 뒤 옮겼다.

## 후속 계획 (서브프로젝트)

| 계획 | 내용 |
|---|---|
| 4 성장·상태 | XP·레벨업(훈련 시설·코치 배율 적용), 사기·컨디션 변화, 휴식 지정, 부상, 나이·은퇴, 면담·기자회견 |
| 5 리그 세계 | 3단계 사다리, 승강·단판 승강전, AI 팀 생성·FA 이동, 8개 지역 챔피언스리그 |
| 6 상·기록 | 상 판정, 기록실, 트로피, 역대 우승팀, 명예의 전당, 은퇴식 |
| 7 화면 | 로스터·선수 상세·결과·프런트 오피스 등 |
| 8 시작·튜토리얼 | 스타 3명 배정 + 시작 드래프트, 튜토리얼, 런 종료 |
