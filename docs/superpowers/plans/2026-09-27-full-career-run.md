# 완주 가능한 커리어 런 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5부에서 시작한 런이 1부 우승(승리) 또는 해임(패배)으로 반드시 끝나고, 끝났을 때 이번 런이 몇 점짜리였는지 나오게 한다.

**Architecture:** 리그 사다리를 5단계로 확장하고, 시즌 단위 판정(`engine/season.mjs`)과 별개로 **런 단위 판정**을 담당하는 `engine/run.mjs`를 새로 만든다. UI는 시즌 결산 뒤에 런 종료 여부를 물어보고, 끝났으면 엔딩 화면을, 안 끝났으면 거취 선택(잔류 / 새 구단 이적)을 띄운다. 3부~1부의 승점 기준선은 스펙에 없으므로 시뮬레이터로 실측해서 정한다.

**Tech Stack:** 순수 ES 모듈(빌드 도구 없음), `node --test`, 브라우저 `localStorage`.

**Spec:** `docs/superpowers/specs/2026-09-22-fm-roguelike-design.md` (2절 시즌 루프, 8절 승격, 10절 명성 포인트)

## Global Constraints

- 빌드 단계 없음. 순수 ES 모듈(`type="module"`)만 쓴다. 새 npm 의존성 금지.
- `engine/`은 화면을 모른다. `document`, `window`, `localStorage`를 참조하지 않는다.
- 모든 테스트는 `node --test tests/*.test.mjs`로 돌아간다. 프레임워크 추가 금지.
- 사용자에게 보이는 문구에 em 대시(`—`, `–`)를 쓰지 않는다. 마침표, 쉼표, 콜론을 쓴다.
- 튜닝 상수는 `engine/constants.mjs`에 모으고, 값 옆에 실측 근거를 주석으로 남긴다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`를 붙인다.

## 이 계획이 건드리는 파일

| 파일 | 책임 |
|---|---|
| `engine/league.mjs` (수정) | 리그 5단계 테이블, 사다리 순서, 티어 조회 |
| `engine/run.mjs` (신규) | 런 단위 판정: 거취 결과, 해임 조건, 명성 점수 |
| `engine/constants.mjs` (수정) | 해임 누적 한도, 명성 점수 계수 |
| `ui/app.mjs` (수정) | 거취 선택 화면, 엔딩 화면, 런 상태 필드 |
| `tools/tune-ladder.mjs` (신규) | 3부~1부 승점 기준선 실측 |
| `tests/league.test.mjs` (수정) | 5단계 테이블 검증 |
| `tests/run.test.mjs` (신규) | 런 판정 검증 |

**설계 메모:** 런 판정을 `season.mjs`에 넣지 않고 `run.mjs`로 가른 이유는, `season.mjs`가 "이번 시즌 승점이 몇 점인가"만 답하는 파일이기 때문이다. "런이 끝났는가"는 시즌 여러 개에 걸친 질문이라 입력이 다르다(누적 미달 횟수, 현재 티어, 사다리 끝 여부). 한 파일에 넣으면 `runHalfSeason`을 읽는 사람이 관계없는 런 상태까지 읽어야 한다.

---

### Task 1: 리그 사다리 5단계로 확장

지금 `LEAGUE_TIERS`에는 `tier5`, `tier4`만 있다. `tier3`, `tier2`, `tier1`을 추가하고 사다리 순서를 엔진이 소유하게 한다(현재는 `ui/app.mjs`에 `LEAGUE_LADDER` 하드코딩).

이 태스크에서 넣는 3부~1부 숫자는 **임시 출발값**이다. Task 5에서 실측으로 교체한다. 출발값 근거: 5부(평균 OVR 50~58) → 4부(60~67)의 간격이 약 +9~10이므로 같은 간격으로 올리고, 승점 기준선은 4부(안전 40 / 승격 70 / 우승 84)의 증가폭(+2 / +2 / +4)을 유지한다.

**Files:**
- Modify: `engine/league.mjs`
- Test: `tests/league.test.mjs`

**Interfaces:**
- Consumes: 없음 (사다리의 첫 태스크)
- Produces:
  - `LEAGUE_LADDER: string[]` = `['tier5', 'tier4', 'tier3', 'tier2', 'tier1']` (낮은 리그부터)
  - `getLeagueTier(tierId: string) -> { averageOVR: [number, number], safePoints: number, targetPoints: number, championPoints: number, label: string }`
  - `getLadderIndex(tierId: string) -> number` (0 = 5부)
  - `getNextTier(tierId: string) -> string | null` (최상위면 null)

- [ ] **Step 1: Write the failing test**

`tests/league.test.mjs`의 `getLeagueTier` 테스트 아래에 추가한다:

```javascript
import { convertPowerToPoints, getLeagueTier, LEAGUE_LADDER, getLadderIndex, getNextTier } from '../engine/league.mjs';

test('리그 사다리는 5부에서 1부까지 5단계다', () => {
  assert.deepEqual(LEAGUE_LADDER, ['tier5', 'tier4', 'tier3', 'tier2', 'tier1']);
});

test('모든 티어가 필요한 필드를 갖는다', () => {
  for (const tierId of LEAGUE_LADDER) {
    const tier = getLeagueTier(tierId);
    assert.equal(typeof tier.label, 'string');
    assert.equal(tier.averageOVR.length, 2);
    assert.ok(tier.averageOVR[0] < tier.averageOVR[1], `${tierId} averageOVR 범위가 뒤집혔다`);
    assert.ok(tier.safePoints < tier.targetPoints, `${tierId} 안전선이 목표선보다 높다`);
    assert.ok(tier.targetPoints < tier.championPoints, `${tierId} 목표선이 우승선보다 높다`);
  }
});

test('상위 리그일수록 평균 OVR과 기준 승점이 높다', () => {
  for (let i = 1; i < LEAGUE_LADDER.length; i++) {
    const lower = getLeagueTier(LEAGUE_LADDER[i - 1]);
    const upper = getLeagueTier(LEAGUE_LADDER[i]);
    assert.ok(upper.averageOVR[0] > lower.averageOVR[0], `${LEAGUE_LADDER[i]} 평균 OVR이 아래 리그보다 낮다`);
    assert.ok(upper.safePoints >= lower.safePoints, `${LEAGUE_LADDER[i]} 안전선이 아래 리그보다 낮다`);
  }
});

test('getLadderIndex는 5부를 0으로 센다', () => {
  assert.equal(getLadderIndex('tier5'), 0);
  assert.equal(getLadderIndex('tier1'), 4);
});

test('getNextTier는 최상위에서 null을 준다', () => {
  assert.equal(getNextTier('tier5'), 'tier4');
  assert.equal(getNextTier('tier2'), 'tier1');
  assert.equal(getNextTier('tier1'), null);
});

test('모르는 티어는 에러를 낸다', () => {
  assert.throws(() => getLeagueTier('tier9'), /Unknown league tier/);
  assert.throws(() => getLadderIndex('tier9'), /Unknown league tier/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/league.test.mjs`
Expected: FAIL. `LEAGUE_LADDER`, `getLadderIndex`, `getNextTier`가 export되지 않아 import가 `undefined`가 되고 `deepEqual`에서 터진다.

- [ ] **Step 3: Write minimal implementation**

`engine/league.mjs`의 `LEAGUE_TIERS` 블록을 통째로 아래로 교체한다:

```javascript
// 스펙 2절 커리어 사다리. 5부에서 1부까지.
// averageOVR 간격(+9~10)과 승점 기준선 증가폭(안전 +2 / 목표 +2 / 우승 +4)은
// 5부에서 4부로 가는 기존 값의 간격을 그대로 이어붙인 출발값이다.
// tools/tune-ladder.mjs 실측으로 교체한다.
const LEAGUE_TIERS = {
  tier5: { label: '5부', averageOVR: [50, 58], safePoints: 38, targetPoints: 68, championPoints: 80 },
  tier4: { label: '4부', averageOVR: [60, 67], safePoints: 40, targetPoints: 70, championPoints: 84 },
  tier3: { label: '3부', averageOVR: [69, 76], safePoints: 42, targetPoints: 72, championPoints: 88 },
  tier2: { label: '2부', averageOVR: [78, 85], safePoints: 44, targetPoints: 74, championPoints: 92 },
  tier1: { label: '1부', averageOVR: [87, 94], safePoints: 46, targetPoints: 76, championPoints: 96 },
};

// 낮은 리그부터. 사다리 순서는 엔진이 소유한다.
// (예전에는 ui/app.mjs가 자기 사본을 들고 있어서 리그를 늘릴 때 두 군데를 고쳐야 했다.)
export const LEAGUE_LADDER = ['tier5', 'tier4', 'tier3', 'tier2', 'tier1'];

export function getLeagueTier(tierId) {
  const tier = LEAGUE_TIERS[tierId];
  if (!tier) throw new Error(`Unknown league tier: ${tierId}`);
  return tier;
}

export function getLadderIndex(tierId) {
  const index = LEAGUE_LADDER.indexOf(tierId);
  if (index === -1) throw new Error(`Unknown league tier: ${tierId}`);
  return index;
}

export function getNextTier(tierId) {
  const index = getLadderIndex(tierId);
  return LEAGUE_LADDER[index + 1] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/*.test.mjs`
Expected: PASS. 기존 테스트도 전부 통과해야 한다(`getLeagueTier('tier5')`가 예전 필드를 그대로 갖고 있으므로 깨지지 않는다).

- [ ] **Step 5: Commit**

```bash
git add engine/league.mjs tests/league.test.mjs
git commit -m "feat(league): 리그 사다리를 5부에서 1부까지 5단계로 확장

사다리 순서를 엔진이 소유하게 했다. 예전에는 ui/app.mjs가 LEAGUE_LADDER
사본을 들고 있어서 리그를 늘리려면 두 군데를 고쳐야 했다.

3부~1부 수치는 스펙에 없어서 5부->4부 간격을 그대로 이어붙인 출발값이다.
tools/tune-ladder.mjs 실측으로 교체한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 런 판정 엔진

런이 끝났는지, 끝났으면 왜 끝났는지, 몇 점짜리 런이었는지를 답하는 순수 함수들.

스펙 2절의 거취 규칙:
- 안전 승점 미달 → 즉시 해임(런 종료)
- 기대 목표(`targetPoints`) 미달 3회 누적 → 해임
- 목표 달성 → 승격 가능(잔류) 또는 새 구단 이적
- 1부 우승 → 승리 엔딩

명성 점수는 스펙 10절 계산안을 그대로 쓴다: `도달 리그 단계 × 10 + 우승 횟수 × 50`. 여기서 "도달 리그 단계"는 사다리 인덱스+1(5부 도달 = 1)로 센다.

**Files:**
- Create: `engine/run.mjs`
- Modify: `engine/constants.mjs`
- Test: `tests/run.test.mjs`

**Interfaces:**
- Consumes: `getLeagueTier`, `getLadderIndex`, `getNextTier`, `LEAGUE_LADDER` (Task 1)
- Produces:
  - `MISSED_TARGET_LIMIT: number` (= 3, `engine/constants.mjs`)
  - `REPUTATION_PER_TIER: number` (= 10), `REPUTATION_PER_TITLE: number` (= 50)
  - `judgeRunOutcome({ seasonResult, leagueTierId, missedTargetCount }) -> { ended: boolean, reason: 'victory' | 'relegation' | 'missedTargets' | null, canPromote: boolean }`
  - `nextMissedTargetCount(seasonResult, current) -> number`
  - `computeReputation({ highestTierId, titles }) -> number`

- [ ] **Step 1: Write the failing test**

`tests/run.test.mjs`를 새로 만든다:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeRunOutcome, nextMissedTargetCount, computeReputation } from '../engine/run.mjs';
import { MISSED_TARGET_LIMIT } from '../engine/constants.mjs';

test('안전 승점 미달이면 즉시 해임으로 런이 끝난다', () => {
  const out = judgeRunOutcome({ seasonResult: 'relegation', leagueTierId: 'tier5', missedTargetCount: 0 });
  assert.equal(out.ended, true);
  assert.equal(out.reason, 'relegation');
  assert.equal(out.canPromote, false);
});

test('1부 우승이면 승리로 런이 끝난다', () => {
  const out = judgeRunOutcome({ seasonResult: 'champion', leagueTierId: 'tier1', missedTargetCount: 0 });
  assert.equal(out.ended, true);
  assert.equal(out.reason, 'victory');
});

test('1부가 아닌 곳의 우승은 런을 끝내지 않고 승격을 연다', () => {
  const out = judgeRunOutcome({ seasonResult: 'champion', leagueTierId: 'tier5', missedTargetCount: 0 });
  assert.equal(out.ended, false);
  assert.equal(out.reason, null);
  assert.equal(out.canPromote, true);
});

test('1부 잔류는 런을 끝내지 않지만 승격도 못 한다', () => {
  const out = judgeRunOutcome({ seasonResult: 'safe', leagueTierId: 'tier1', missedTargetCount: 0 });
  assert.equal(out.ended, false);
  assert.equal(out.canPromote, false);
});

test('목표 미달이 한도에 닿으면 해임된다', () => {
  const out = judgeRunOutcome({
    seasonResult: 'safe', leagueTierId: 'tier5', missedTargetCount: MISSED_TARGET_LIMIT,
  });
  assert.equal(out.ended, true);
  assert.equal(out.reason, 'missedTargets');
});

test('목표 미달이 한도 직전이면 아직 런이 이어진다', () => {
  const out = judgeRunOutcome({
    seasonResult: 'safe', leagueTierId: 'tier5', missedTargetCount: MISSED_TARGET_LIMIT - 1,
  });
  assert.equal(out.ended, false);
});

test('목표 미달 누적은 잔류에서만 오르고 승격권 이상에서 초기화된다', () => {
  assert.equal(nextMissedTargetCount('safe', 0), 1);
  assert.equal(nextMissedTargetCount('safe', 2), 3);
  assert.equal(nextMissedTargetCount('promotion', 2), 0);
  assert.equal(nextMissedTargetCount('champion', 2), 0);
});

test('해임된 시즌의 누적은 올리지 않는다(런이 이미 끝났다)', () => {
  assert.equal(nextMissedTargetCount('relegation', 1), 1);
});

test('명성 점수는 도달 리그와 우승 횟수로 계산한다', () => {
  // 5부 도달(1단계) + 우승 0회
  assert.equal(computeReputation({ highestTierId: 'tier5', titles: 0 }), 10);
  // 1부 도달(5단계) + 우승 4회
  assert.equal(computeReputation({ highestTierId: 'tier1', titles: 4 }), 50 + 200);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/run.test.mjs`
Expected: FAIL. `Cannot find module '../engine/run.mjs'`

- [ ] **Step 3: Write minimal implementation**

`engine/constants.mjs` 맨 아래에 추가한다:

```javascript
// 스펙 2절: 기대 목표(targetPoints) 미달이 이만큼 누적되면 해임된다.
export const MISSED_TARGET_LIMIT = 3;

// 스펙 10절 명성 점수 계산안. 도달 리그 단계 x 10 + 우승 횟수 x 50.
export const REPUTATION_PER_TIER = 10;
export const REPUTATION_PER_TITLE = 50;
```

`engine/run.mjs`를 새로 만든다:

```javascript
import { getLadderIndex, getNextTier } from './league.mjs';
import { MISSED_TARGET_LIMIT, REPUTATION_PER_TIER, REPUTATION_PER_TITLE } from './constants.mjs';

// 시즌 하나가 끝났을 때 런이 계속되는지 판정한다.
// season.mjs와 가른 이유: 이 판정은 시즌 여러 개에 걸친 상태(누적 미달 횟수,
// 사다리 위치)를 봐야 해서 "이번 시즌 승점이 몇 점인가"와 입력이 다르다.
export function judgeRunOutcome({ seasonResult, leagueTierId, missedTargetCount }) {
  if (seasonResult === 'relegation') {
    return { ended: true, reason: 'relegation', canPromote: false };
  }
  const atTop = getNextTier(leagueTierId) === null;
  if (seasonResult === 'champion' && atTop) {
    return { ended: true, reason: 'victory', canPromote: false };
  }
  if (missedTargetCount >= MISSED_TARGET_LIMIT) {
    return { ended: true, reason: 'missedTargets', canPromote: false };
  }
  const reached = seasonResult === 'promotion' || seasonResult === 'champion';
  return { ended: false, reason: null, canPromote: reached && !atTop };
}

// 목표선을 넘으면 누적이 초기화된다. 해임 시즌은 런이 이미 끝났으므로 건드리지 않는다.
export function nextMissedTargetCount(seasonResult, current) {
  if (seasonResult === 'relegation') return current;
  if (seasonResult === 'promotion' || seasonResult === 'champion') return 0;
  return current + 1;
}

// 스펙 10절. 도달 리그 단계는 사다리 인덱스+1로 센다(5부 도달 = 1단계).
export function computeReputation({ highestTierId, titles }) {
  return (getLadderIndex(highestTierId) + 1) * REPUTATION_PER_TIER + titles * REPUTATION_PER_TITLE;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/*.test.mjs`
Expected: PASS (전체 통과)

- [ ] **Step 5: Commit**

```bash
git add engine/run.mjs engine/constants.mjs tests/run.test.mjs
git commit -m "feat(run): 런 단위 판정 엔진 추가

시즌 판정(season.mjs)과 가른 이유: 런 종료 판정은 시즌 여러 개에 걸친
상태(누적 목표 미달, 사다리 위치)를 봐야 해서 '이번 시즌 승점이 몇 점인가'와
입력이 다르다. 한 파일에 넣으면 runHalfSeason을 읽는 사람이 관계없는
런 상태까지 읽어야 한다.

스펙 2절 해임 조건(안전 미달 즉시, 목표 미달 3회 누적)과 10절 명성 점수
계산안을 구현했다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: UI를 엔진 사다리에 연결하고 엔딩 화면을 만든다

`ui/app.mjs`가 들고 있는 `LEAGUE_LADDER` 사본을 없애고, 시즌 결산 뒤에 런 종료 판정을 태운다. 끝났으면 엔딩 화면, 안 끝났으면 기존 흐름.

**Files:**
- Modify: `ui/app.mjs`
- Modify: `ui/style.css`

**Interfaces:**
- Consumes: `judgeRunOutcome`, `nextMissedTargetCount`, `computeReputation` (Task 2), `LEAGUE_LADDER`, `getLadderIndex`, `getNextTier`, `getLeagueTier` (Task 1)
- Produces: `currentState`에 새 필드 `missedTargetCount: number`, `titles: number`, `highestTierId: string`, `seasonNumber: number`

- [ ] **Step 1: 런 상태 필드를 추가한다**

`ui/app.mjs`의 `startRun` 안, `currentState = {` 객체에서 `leagueTierId: 'tier5',` 줄 바로 아래에 추가한다:

```javascript
    highestTierId: 'tier5', // 이번 런에서 도달한 최고 리그 (명성 점수용)
    titles: 0, // 우승 횟수
    missedTargetCount: 0, // 기대 목표 미달 누적 (스펙 2절: 3회면 해임)
    seasonNumber: 1,
```

그리고 파일 상단의 하드코딩을 지운다. 이 줄을

```javascript
// 슬라이스는 5부/4부만 구현 (스펙 11절) — 승격 시 다음 단계로, 3부 이상은 여기서 멈춘다
const LEAGUE_LADDER = ['tier5', 'tier4'];
```

지우고, import 블록의 league.mjs 줄을 아래로 바꾼다:

```javascript
import { getLeagueTier, LEAGUE_LADDER, getLadderIndex, getNextTier } from '../engine/league.mjs';
import { judgeRunOutcome, nextMissedTargetCount, computeReputation } from '../engine/run.mjs';
```

- [ ] **Step 2: 결산 함수에 런 판정을 태운다**

`runSecondHalfAndFinish` 안에서 `const currentTierIndex = LEAGUE_LADDER.indexOf(currentState.leagueTierId);` 와 `const canPromote = ...` 두 줄을 찾아 아래로 교체한다:

```javascript
  // 보드진의 신임이 result를 safe로 바꾼 뒤에 런 판정을 태워야 한다.
  if (result === 'champion') currentState.titles += 1;
  currentState.missedTargetCount = nextMissedTargetCount(result, currentState.missedTargetCount);

  const outcome = judgeRunOutcome({
    seasonResult: result,
    leagueTierId: currentState.leagueTierId,
    missedTargetCount: currentState.missedTargetCount,
  });
  const currentTierIndex = getLadderIndex(currentState.leagueTierId);
  const canPromote = outcome.canPromote;

  if (outcome.ended) {
    renderRunEnd(outcome.reason, totalPoints);
    return;
  }
```

`calculateStartingFunds(LEAGUE_LADDER.indexOf(currentState.leagueTierId))`도 `calculateStartingFunds(getLadderIndex(currentState.leagueTierId))`로 바꾼다.

`nextStepHtml` 분기에서 `result === 'relegation'` 가지는 이제 도달하지 않는다(위에서 return했다). 그 가지를 지우고, `canPromote`가 false이면서 목표를 넘긴 경우(1부 잔류)를 다룬다:

```javascript
  let dockHtml;
  let closingHtml = '';
  if (canPromote) {
    closingHtml = `<p class="note">승격 보상: 적응도 +${PROMOTION_CHEMISTRY_BONUS}, 자금 +${PROMOTION_FUNDS_BONUS_RATIO * 100}%</p>`;
    dockHtml = `<button class="cta" id="promote-btn">${getLeagueTier(getNextTier(currentState.leagueTierId)).label}로 승격</button>`;
  } else {
    const left = MISSED_TARGET_LIMIT - currentState.missedTargetCount;
    closingHtml = left <= 2
      ? `<p class="note"><b>목표 미달 ${currentState.missedTargetCount}회.</b> ${left}회 더 미달하면 해임됩니다.</p>`
      : '';
    dockHtml = '<button class="cta" id="continue-btn">같은 리그에서 새 시즌</button>';
  }
```

`MISSED_TARGET_LIMIT`을 constants import에 추가한다.

같은 함수 아래쪽에 남아 있는 `new-run-btn` 핸들러를 지운다. 새 런 버튼은 이제 `renderRunEnd`가 소유하므로 여기 있는 것은 붙을 대상이 없는 죽은 코드다:

```javascript
  // 아래 3줄을 통째로 지운다
  document.getElementById('new-run-btn')?.addEventListener('click', () => {
    ...
  });
```

승격 버튼 핸들러 안의 `currentState.leagueTierId = LEAGUE_LADDER[currentTierIndex + 1];`를 아래로 바꾸고 최고 티어를 기록한다:

```javascript
    currentState.leagueTierId = getNextTier(currentState.leagueTierId);
    currentState.highestTierId = currentState.leagueTierId;
```

- [ ] **Step 3: 엔딩 화면을 만든다**

`renderPromotionTransferDemand` 함수 바로 위에 추가한다:

```javascript
const RUN_END = {
  victory: {
    kicker: '커리어 종료',
    title: '1부 우승',
    body: '5부에서 시작해 1부 정상까지 올라갔습니다. 이 런은 여기서 완결됩니다.',
  },
  relegation: {
    kicker: '커리어 종료',
    title: '해임',
    body: '안전 승점을 넘지 못했습니다. 보드진이 경질을 통보했습니다.',
  },
  missedTargets: {
    kicker: '커리어 종료',
    title: '경질',
    body: `기대 목표를 ${MISSED_TARGET_LIMIT}시즌 연속으로 넘지 못했습니다. 잔류만으로는 자리를 지킬 수 없습니다.`,
  },
};

function renderRunEnd(reason, finalPoints) {
  const copy = RUN_END[reason];
  const reputation = computeReputation({
    highestTierId: currentState.highestTierId,
    titles: currentState.titles,
  });
  const highest = getLeagueTier(currentState.highestTierId);

  setScreen(`
    <div class="verdict verdict--${reason === 'victory' ? 'champion' : 'relegation'}">
      <div class="verdict__label">${copy.kicker}</div>
      <div class="verdict__result">${copy.title}</div>
      <div class="scoreline"><b>${reputation}</b><span>명성</span></div>
    </div>
    <div class="panel">
      <p class="note">${copy.body}</p>
      <ul class="summary">
        <li><span>버틴 시즌</span><b>${currentState.seasonNumber}</b></li>
        <li><span>도달 리그</span><b>${highest.label}</b></li>
        <li><span>우승</span><b>${currentState.titles}</b></li>
        <li><span>마지막 시즌 승점</span><b>${finalPoints.toFixed(0)}</b></li>
      </ul>
    </div>
  `, '<button class="cta" id="new-run-btn">새 런 시작</button>');

  clearRun(localStorage); // 끝난 런은 이어하기 목록에서 지운다
  document.getElementById('new-run-btn').onclick = () => {
    currentState = null;
    renderClubButtons();
  };
}
```

- [ ] **Step 4: 시즌 번호를 올린다**

`startNewSeason` 안에서 `currentState.week = SUMMER_MARKET_WEEKS[0];` 줄 바로 위에 추가한다:

```javascript
  currentState.seasonNumber += 1;
```

- [ ] **Step 5: 브라우저에서 확인한다**

```bash
node tools/dev-server.mjs
```

브라우저 콘솔에서 아래를 실행해 1부까지 밀어올린 뒤 승리 엔딩이 뜨는지 본다:

```javascript
// 구단 선택 후 실행
currentState.leagueTierId = 'tier1';
currentState.highestTierId = 'tier1';
for (let i = 0; i < 14; i++) document.getElementById('next-week-btn')?.click();
```

확인할 것: 우승이면 "1부 우승" 엔딩 + 명성 점수, 강등이면 "해임" 엔딩, 둘 다 "새 런 시작" 버튼이 동작하고 이어하기 항목이 사라질 것.

- [ ] **Step 6: 전체 테스트를 돌린다**

Run: `node --test tests/*.test.mjs`
Expected: PASS (71개 이상 전부 통과)

- [ ] **Step 7: Commit**

```bash
git add ui/app.mjs ui/style.css
git commit -m "feat(ui): 런이 승리 또는 해임으로 끝나고 명성 점수가 나온다

지금까지는 4부에 도달하면 '이 슬라이스는 4부까지만 구현돼 있습니다'라는
개발 메모가 뜨면서 런이 흐지부지 끝났다. 이제 1부 우승이면 승리 엔딩,
안전 승점 미달이면 즉시 해임, 기대 목표를 3시즌 연속 미달해도 경질된다.

ui/app.mjs가 들고 있던 LEAGUE_LADDER 사본을 지우고 engine/league.mjs의
것을 쓴다. 리그를 늘릴 때 고칠 곳이 한 군데가 됐다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 거취 선택 (새 구단 이적)

스펙 2절: 목표 달성 후 잔류 대신 **새 구단 이적**을 고를 수 있다. 성과에 비례한 오퍼(우승 3개, 목표 달성 2개) 중 하나를 고르면 새 구단으로 옮기고 **선수단이 전부 초기화**된다.

이게 로그라이크의 핵심 선택지다. 쌓아올린 스쿼드를 버리고 더 좋은 구단(자금 배율이 높은 쪽)에서 다시 시작할지 고르게 한다.

**Files:**
- Modify: `ui/app.mjs`

**Interfaces:**
- Consumes: `CLUBS` (`data/clubs.mjs`), `generateSquadPool`, `TIER5_SQUAD_WEIGHTS`, `calculateStartingFunds`, `getLadderIndex`
- Produces: 없음 (UI 종착점)

- [ ] **Step 1: 오퍼 생성 함수를 쓴다**

`renderRunEnd` 함수 바로 위에 추가한다:

```javascript
// 스펙 2절 거취 선택. 우승이면 오퍼 3개, 목표 달성이면 2개.
// 현재 구단은 후보에서 뺀다(이적인데 같은 곳이면 의미가 없다).
function buildClubOffers(seasonResult) {
  const count = seasonResult === 'champion' ? 3 : 2;
  const pool = CLUBS.filter((c) => c.id !== currentState.club.id);
  const picked = [];
  while (picked.length < count && picked.length < pool.length) {
    const c = pool[Math.floor(Math.random() * pool.length)];
    if (!picked.includes(c)) picked.push(c);
  }
  return picked;
}
```

- [ ] **Step 2: 거취 선택 화면을 만든다**

같은 위치에 이어서 추가한다:

```javascript
function renderDestinationChoice(seasonResult, nextTierId) {
  const offers = buildClubOffers(seasonResult);
  const stayLabel = nextTierId === currentState.leagueTierId
    ? '같은 리그에 남는다'
    : `${getLeagueTier(nextTierId).label}로 승격한다`;

  setScreen(`
    <div class="choice">
      <div class="choice__kicker">시즌 종료 거취</div>
      <h1 class="choice__title">어디서 다음 시즌을<br>시작할까요</h1>
      <p class="choice__body">
        지금 구단에 남으면 <b>선수단을 그대로</b> 들고 갑니다.
        다른 구단으로 옮기면 <b>선수단이 전부 초기화</b>되지만 그 구단의 조건으로 새로 시작합니다.
      </p>
      <div class="options">
        <button class="option option--accept" data-stay="1">
          <div class="option__name">${esc(currentState.club.name)}에 남는다</div>
          <div class="option__effect">${stayLabel}. 선수단 <b>유지</b></div>
        </button>
        ${offers.map((c) => `
          <button class="option" data-move="${c.id}" style="--tier:${c.kit}">
            <div class="option__name">${esc(c.name)}로 이적</div>
            <div class="option__effect">${esc(c.strength)}. 선수단 <b>초기화</b>, 시작 자금 x${c.startingFundsMultiplier}</div>
          </button>`).join('')}
      </div>
    </div>
  `);

  document.querySelector('[data-stay]').onclick = () => {
    currentState.leagueTierId = nextTierId;
    if (getLadderIndex(nextTierId) > getLadderIndex(currentState.highestTierId)) {
      currentState.highestTierId = nextTierId;
    }
    startNewSeason();
  };
  for (const c of offers) {
    document.querySelector(`[data-move="${c.id}"]`).onclick = () => {
      currentState.club = c;
      currentState.leagueTierId = nextTierId;
      if (getLadderIndex(nextTierId) > getLadderIndex(currentState.highestTierId)) {
        currentState.highestTierId = nextTierId;
      }
      // 선수단 초기화. 적응도도 새 팀이므로 기본값으로 돌린다.
      currentState.squad = generateSquadPool(TIER5_SQUAD_WEIGHTS).map(toSquadPlayer);
      currentState.chemistry = CHEMISTRY_START;
      currentState.funds = Math.round(
        calculateStartingFunds(getLadderIndex(nextTierId)) * c.startingFundsMultiplier
      );
      startNewSeason();
    };
  }
}
```

- [ ] **Step 3: 결산 화면에서 이 화면으로 보낸다**

Task 3에서 만든 `dockHtml` 분기의 승격 버튼 핸들러를 바꾼다. `promote-btn` 핸들러 본문 전체를 아래로 교체한다:

```javascript
  document.getElementById('promote-btn')?.addEventListener('click', () => {
    const nextTier = getNextTier(currentState.leagueTierId);
    currentState.chemistry = Math.min(100, currentState.chemistry + PROMOTION_CHEMISTRY_BONUS);
    currentState.funds = Math.round(currentState.funds * (1 + PROMOTION_FUNDS_BONUS_RATIO));

    // 승격 전용 위기는 거취를 정한 뒤에 띄운다(잔류를 골랐을 때만 의미가 있다).
    renderDestinationChoice(result, nextTier);
  });
```

승격 전용 위기(`renderPromotionTransferDemand`) 호출은 `renderDestinationChoice`의 `data-stay` 핸들러 안으로 옮긴다. `startNewSeason()` 호출을 아래로 바꾼다:

```javascript
    const keyPlayer = [...currentState.squad].sort((a, b) => b.baseOVR - a.baseOVR)[0];
    if (keyPlayer && Math.random() < PROMOTION_TRANSFER_DEMAND_CHANCE) {
      renderPromotionTransferDemand(keyPlayer);
    } else {
      startNewSeason();
    }
```

- [ ] **Step 4: 브라우저에서 확인한다**

브라우저 콘솔에서:

```javascript
// 구단 선택 후, 우승이 나올 때까지 스쿼드를 강화하고 시즌을 돌린다
currentState.funds = 99999;
for (let i = 0; i < 14; i++) document.getElementById('next-week-btn')?.click();
```

확인할 것: 승격 버튼을 누르면 거취 선택이 뜨고, 이적을 고르면 선수단 60명이 새로 생기고 구단 이름과 자금이 바뀔 것. 잔류를 고르면 선수단이 그대로일 것.

- [ ] **Step 5: 전체 테스트를 돌린다**

Run: `node --test tests/*.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ui/app.mjs
git commit -m "feat(ui): 시즌 종료 거취 선택 추가

스펙 2절의 '목표 달성 + 이적 선택' 분기를 구현했다. 우승이면 오퍼 3개,
목표 달성이면 2개가 뜬다. 남으면 선수단 유지, 옮기면 선수단 전부 초기화.

쌓아올린 스쿼드를 버리고 조건이 더 좋은 구단에서 다시 시작할지 고르는
것이 이 게임의 로그라이크적 선택지다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 3부~1부 승점 기준선 실측

Task 1에서 넣은 3부~1부 숫자는 간격을 이어붙인 추정값이다. 실제로 돌려보고 고친다.

밸런스 목표(스펙 25줄): **신규 5부 잔류 60~70%, 우승 20~30%.** 상위 리그는 올라갈수록 어려워야 하므로, 같은 스쿼드 품질로 올라갔을 때 우승률이 단계마다 낮아지는지 본다.

**Files:**
- Create: `tools/tune-ladder.mjs`
- Modify: `engine/league.mjs`

**Interfaces:**
- Consumes: `LEAGUE_LADDER`, `getLeagueTier`, `runHalfSeason`, `judgeSeasonResult`, `generateSquadPool`, `generateShopOffer`
- Produces: 없음 (도구)

- [ ] **Step 1: 실측 스크립트를 쓴다**

`tools/tune-ladder.mjs`를 새로 만든다:

```javascript
// 리그 단계별 결과 분포 실측. 티어 승점 기준선을 정하는 근거 자료를 만든다.
// 실제 플레이를 근사한다: 12주 동안 자금을 다 쓰며 베스트11을 올리는 플레이어.
import { generateSquadPool, TIER5_SQUAD_WEIGHTS } from '../data/generate-player.mjs';
import { generateShopOffer } from '../data/draft-shop.mjs';
import { runHalfSeason, judgeSeasonResult } from '../engine/season.mjs';
import { applyTransactionDecay } from '../engine/chemistry.mjs';
import { computeAverageOVR } from '../engine/team-power.mjs';
import { applyCostModifiers, calculateStartingFunds } from '../engine/economy.mjs';
import { LEAGUE_LADDER, getLeagueTier, getLadderIndex } from '../engine/league.mjs';
import {
  CHEMISTRY_START, CHEMISTRY_DECAY_PER_TRANSACTION, WINTER_TAX_RATIO, SHOP_OFFER_SIZE,
} from '../engine/constants.mjs';

const SLOTS = ['GK', 'CB', 'CB', 'WB', 'WB', 'CMF', 'CMF', 'CMF', 'W', 'W', 'ST'];

function pickBestXI(squad) {
  const used = new Set();
  const lineup = [];
  for (const pos of SLOTS) {
    const byPos = squad.filter((p) => !used.has(p.id) && p.position === pos).sort((a, b) => b.baseOVR - a.baseOVR);
    const fallback = squad.filter((p) => !used.has(p.id)).sort((a, b) => b.baseOVR - a.baseOVR);
    const pick = byPos[0] ?? fallback[0];
    if (pick) { used.add(pick.id); lineup.push(pick); }
  }
  const bench = squad.filter((p) => !used.has(p.id)).sort((a, b) => b.baseOVR - a.baseOVR).slice(0, 5)
    .map((p) => ({ ...p, inBench: true }));
  return { lineup, bench };
}

const toSquad = (c) => ({ ...c, seasonsAtClub: 0, acquiredThisSeason: true, inBench: false });

// 해당 리그에 갓 승격한 팀을 근사한다: 아래 리그에서 시즌 수만큼 스쿼드를 키운 상태.
function playSeason(tierId, carriedSquad, carriedFunds) {
  let squad = carriedSquad ?? generateSquadPool(TIER5_SQUAD_WEIGHTS).map(toSquad);
  let funds = carriedFunds ?? calculateStartingFunds(getLadderIndex(tierId));
  let chem = CHEMISTRY_START;
  let firstHalf = null;

  for (const phase of ['summer', 'winter']) {
    for (let w = 0; w < (phase === 'summer' ? 8 : 4); w++) {
      for (const card of generateShopOffer(SHOP_OFFER_SIZE).sort((a, b) => b.baseOVR - a.baseOVR)) {
        const price = applyCostModifiers(card.price, phase === 'winter' ? [WINTER_TAX_RATIO] : []);
        if (funds < price) continue;
        const before = pickBestXI(squad);
        const after = pickBestXI([...squad, toSquad(card)]);
        if (computeAverageOVR(after.lineup, after.bench) <= computeAverageOVR(before.lineup, before.bench)) continue;
        funds -= price;
        squad = [...squad, toSquad(card)];
        chem = applyTransactionDecay(chem, 1, CHEMISTRY_DECAY_PER_TRANSACTION);
      }
    }
    const { lineup, bench } = pickBestXI(squad);
    const pts = runHalfSeason(lineup, bench, 'tactician', chem, tierId);
    if (phase === 'summer') firstHalf = pts;
    else return { points: firstHalf + pts, squad, funds };
  }
}

const N = Number(process.argv[2] ?? 800);
console.log(`리그별 결과 분포 (${N}판, 아래 리그에서 스쿼드를 이어받아 승격한 상황)\n`);
console.log('리그    우승    승격    안전    강등   평균승점');

let squad = null;
let funds = null;
for (const tierId of LEAGUE_LADDER) {
  const counts = { champion: 0, promotion: 0, safe: 0, relegation: 0 };
  let sum = 0;
  let sampleSquad = null;
  let sampleFunds = null;
  for (let i = 0; i < N; i++) {
    const r = playSeason(tierId, squad ? structuredClone(squad) : null, funds);
    counts[judgeSeasonResult(r.points, tierId)] += 1;
    sum += r.points;
    if (i === 0) { sampleSquad = r.squad; sampleFunds = r.funds; }
  }
  const pct = (k) => `${((counts[k] / N) * 100).toFixed(0)}%`.padStart(6);
  console.log(
    `${getLeagueTier(tierId).label.padEnd(6)}${pct('champion')}${pct('promotion')}${pct('safe')}${pct('relegation')}`
    + `${(sum / N).toFixed(1).padStart(10)}`
  );
  // 다음 리그는 이 리그를 통과한 스쿼드로 시작한다
  squad = sampleSquad;
  funds = calculateStartingFunds(getLadderIndex(tierId) + 1);
}
```

- [ ] **Step 2: 돌려서 분포를 본다**

Run: `node tools/tune-ladder.mjs 800`

기대: 5부 우승 20~30%, 강등 10~20%. 위로 갈수록 우승률이 떨어지고 강등률이 올라야 한다.

- [ ] **Step 3: 숫자를 고친다**

실측 결과가 목표에서 벗어나면 `engine/league.mjs`의 `tier3`, `tier2`, `tier1`의 `averageOVR`과 승점 기준선을 조정하고 Step 2를 다시 돌린다.

판단 기준:
- 어떤 리그의 **우승률이 40%를 넘으면** 그 리그의 `championPoints`를 올리거나 `averageOVR`을 올린다.
- 어떤 리그의 **강등률이 0%면** `safePoints`를 올리거나 `averageOVR`을 올린다. 강등이 한 번도 안 나오면 사다리 위쪽이 전부 무의미해진다.
- **우승률이 단계마다 낮아지지 않으면** 위 리그의 `averageOVR`을 더 벌린다.

목표 분포에 들어올 때까지 반복한다. 확정된 값 옆에 실측 수치를 주석으로 남긴다:

```javascript
  // 800판 실측: 우승 24% / 승격 29% / 안전 38% / 강등 9%
  tier3: { label: '3부', averageOVR: [__, __], safePoints: __, targetPoints: __, championPoints: __ },
```

- [ ] **Step 4: 전체 테스트를 돌린다**

Run: `node --test tests/*.test.mjs`
Expected: PASS. Task 1의 "상위 리그일수록 평균 OVR과 기준 승점이 높다" 테스트가 조정 후에도 통과해야 한다. 통과하지 않으면 조정이 단조성을 깬 것이므로 다시 잡는다.

- [ ] **Step 5: Commit**

```bash
git add tools/tune-ladder.mjs engine/league.mjs
git commit -m "balance: 3부~1부 승점 기준선을 실측으로 확정

Task 1의 숫자는 5부->4부 간격을 이어붙인 추정값이었다. tools/tune-ladder.mjs로
각 리그를 800판씩 돌려(아래 리그를 통과한 스쿼드를 이어받는 실제 승격 상황)
분포를 재고 기준선을 잡았다. 확정 수치는 각 티어 옆 주석 참고.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: 이름 중복 차단

이름 조합이 대륙당 64개(성 8 x 이름 8)인데 스쿼드가 60명이라 한 스쿼드 안 동명이인이 사실상 확정이다. 실제로 "Carlos Davis" 2명, "Haruto" 2명이 목격됐다. 플레이 중 누가 누군지 헷갈리는 것 자체가 판단을 방해한다.

**Files:**
- Modify: `data/name-pools.mjs`
- Test: `tests/generate-player.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (데이터 확장, 기존 `randomName(continentTag, rng)` 시그니처 유지)

- [ ] **Step 1: Write the failing test**

`tests/generate-player.test.mjs`에 추가한다:

```javascript
import { generateSquadPool, TIER5_SQUAD_WEIGHTS } from '../data/generate-player.mjs';

test('한 스쿼드 안에서 이름이 겹치지 않는다', () => {
  // 60명 스쿼드를 20번 뽑아서 한 번이라도 동명이인이 나오면 실패.
  // 이름 풀이 좁으면 생일 역설로 거의 매번 겹친다.
  for (let attempt = 0; attempt < 20; attempt++) {
    const names = generateSquadPool(TIER5_SQUAD_WEIGHTS).map((p) => p.name);
    assert.equal(new Set(names).size, names.length, `${attempt}번째 스쿼드에 동명이인이 있다`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/generate-player.test.mjs`
Expected: FAIL. "동명이인이 있다"

- [ ] **Step 3: 이름 풀을 넓히고 중복을 막는다**

두 가지를 같이 한다. 풀만 넓히면 확률이 줄 뿐 보장이 안 된다.

먼저 `data/name-pools.mjs`의 각 대륙 `first`와 `last`를 **각각 24개 이상**으로 늘린다(조합 576개 이상). 기존 항목은 그대로 두고 뒤에 이어붙인다. 대륙별 실제 지역 이름을 쓴다.

그 다음 `data/generate-player.mjs`의 `generateSquadPool`이 중복을 거르게 한다:

```javascript
export function generateSquadPool(tierWeights, rng = Math.random) {
  const players = [];
  const usedNames = new Set();
  for (const [tierId, count] of Object.entries(tierWeights)) {
    for (let i = 0; i < count; i++) {
      // 같은 스쿼드 안 동명이인은 플레이 중 누가 누군지 헷갈리게 만든다.
      // 풀이 넓어도 생일 역설 때문에 60명이면 겹치므로 명시적으로 거른다.
      let player;
      let tries = 0;
      do {
        player = generateProceduralPlayer(tierId, rng);
        tries += 1;
      } while (usedNames.has(player.name) && tries < 50);
      usedNames.add(player.name);
      players.push(player);
    }
  }
  return players;
}
```

`tries < 50` 상한을 두는 이유: 풀이 고갈돼도 무한 루프에 빠지지 않게 한다. 50번 안에 못 찾으면 중복을 허용하고 넘어간다.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/*.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add data/name-pools.mjs data/generate-player.mjs tests/generate-player.test.mjs
git commit -m "fix: 한 스쿼드 안 동명이인 차단

이름 조합이 대륙당 64개(성 8 x 이름 8)인데 스쿼드가 60명이라 생일 역설로
동명이인이 사실상 확정이었다(Carlos Davis 2명, Haruto 2명 목격).
플레이 중 누가 누군지 헷갈리면 판단 자체가 방해받는다.

풀을 대륙당 576조합 이상으로 넓히고, generateSquadPool이 이름 중복을
명시적으로 거르게 했다. 풀이 넓어도 60명이면 겹치므로 둘 다 필요하다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 완료 확인

모든 태스크가 끝나면 아래가 전부 참이어야 한다.

- [ ] `node --test tests/*.test.mjs` 전부 통과
- [ ] 5부에서 시작해 1부까지 승격할 수 있고, 1부 우승 시 승리 엔딩이 뜬다
- [ ] 안전 승점 미달 시 즉시 해임 엔딩이 뜬다
- [ ] 목표 미달 3시즌 누적 시 경질 엔딩이 뜬다
- [ ] 엔딩 화면에 명성 점수, 버틴 시즌, 도달 리그, 우승 횟수가 나온다
- [ ] 승격 시 거취 선택이 뜨고, 이적을 고르면 선수단이 초기화된다
- [ ] `node tools/tune-ladder.mjs 800` 결과가 위로 갈수록 어려워진다
- [ ] 한 스쿼드 안에 동명이인이 없다
- [ ] 사용자에게 보이는 문구에 em 대시가 없다
