# 핵심 계산 엔진 (Core Calculation Engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면 없이 순수 계산만 하는 `engine/` 모듈을 만든다. 선수 개인 OVR
가산(특수 성향, 플레이스타일 시너지, 대륙 시너지) → 팀 배율(감독 × 적응도,
캡 적용) → 리그 승점 변환까지, 스펙 6절의 공식을 코드로 구현하고
테스트로 검증한다. 이 엔진이 완성되면 `tools/simulate.mjs`로 수백 시즌을
돌려 스펙 12절의 TBD 수치(승점 변환 계수, 배율 캡 등)를 튜닝할 수 있다.

**Architecture:** 빌드 도구 없는 순수 ES 모듈(`.mjs`)로 작성한다. 브라우저
`<script type="module">`와 Node.js 양쪽에서 그대로 동작한다. 테스트는
Node.js 내장 테스트 러너(`node --test`, Node 18+ 내장, 추가 설치 불필요)를
쓴다. 데이터(태그 수치표 등)는 `engine/constants.mjs`에 모아 두고, 계산
함수들은 이 상수를 참조한다. 각 계산 단계(개인 OVR 가산, 시너지, 배율,
승점 변환)는 서로 다른 파일로 분리해, 나중에 UI나 데이터 생성기에서
필요한 함수만 골라 쓸 수 있게 한다.

**Tech Stack:** 순수 JavaScript (ES 모듈), Node.js 내장 `node:test` +
`node:assert/strict`. 외부 라이브러리 없음.

**Spec:** `docs/superpowers/specs/2026-09-22-fm-roguelike-design.md` (5절
인재 3대 축, 6절 수치 엔진 원칙, 12절 미확정 사항)

## Global Constraints

- 빌드 도구 없음 — 순수 HTML/JS/ES 모듈만 사용 (스펙 13절)
- 모든 태그 효과는 가산(+N), 곱연산 시너지는 없음 (스펙 6절 원칙 1)
- 팀 단위로 곱하는 것은 감독 배율 × 적응도 배율뿐이며 상한(캡)을 둔다
  (스펙 6절 원칙 2, 3) — 캡의 정확한 값은 이 계획에서는 **설정 가능한
  상수**로 노출하고(기본값 1.30), 실제 값은 이후 `tools/simulate.mjs`
  결과를 보고 별도로 튜닝한다 (스펙 12절)
- 리그 체급 비교는 베스트11 **평균** OVR 기준 (스펙 6절 원칙 4)
- 승점 변환 계수도 설정 가능한 상수로 노출한다 (스펙 12절 TBD)
- 화폐/수치 데이터는 스펙 5, 6, 7절의 표에 있는 값을 그대로 사용한다

---

## 파일 구조

```
engine/
  constants.mjs      — 플레이스타일 태그, 대륙 태그, 감독 배율, 적응도
                        배율 구간표, 튜닝 가능 상수(캡, 승점 계수)
  ovr.mjs             — 선수 개인 OVR 가산 계산 (특수 성향, 시너지)
  chemistry.mjs       — 적응도(팀 조직력) 상태 갱신과 배율 계산
  team-power.mjs      — 베스트11 평균 OVR → 팀 최종 전력 계산
  league.mjs          — 팀 전력 vs 리그 평균 OVR → 승점 변환
tests/
  ovr.test.mjs
  chemistry.test.mjs
  team-power.test.mjs
  league.test.mjs
tools/
  simulate.mjs        — 임의 팀 구성으로 시즌 결과 분포를 출력하는 CLI
                        스크립트 (밸런스 튜닝용, 6절/12절 검증)
```

---

### Task 1: 상수 테이블 (`engine/constants.mjs`)

**Files:**
- Create: `engine/constants.mjs`
- Test: `tests/constants.test.mjs`

**Interfaces:**
- Consumes: 없음 (최초 파일)
- Produces:
  - `PLAYSTYLE_TAGS: { [tagId: string]: { positions: string[], tier3: number, tier5: number } }`
  - `CONTINENT_TAGS: { [tagId: string]: { tier3: number, tier5: number } }`
  - `MANAGER_TIER_MULTIPLIER: { rookie: 1.00, tactician: 1.05, legendary: 1.12, god: 1.20 }`
  - `CHEMISTRY_START: 60`
  - `CHEMISTRY_DECAY_PER_TRANSACTION: 2`
  - `CHEMISTRY_RECOVERY_PER_STABLE_WEEK: 1`
  - `chemistryMultiplierTable(chemistry: number): number` — 이 함수는
    Task 3(`chemistry.mjs`)에서 이 파일의 구간 상수를 이용해 구현하므로,
    이 태스크에서는 구간 경계값 상수만 내보낸다:
    `CHEMISTRY_BANDS: [{ max: 40, multiplier: 0.95 }, { max: 95, multiplierLow: 1.00, multiplierHigh: 1.04 }, { max: Infinity, multiplier: 1.12 }]`
  - `TEAM_MULTIPLIER_CAP: 1.30` (튜닝 대상, 스펙 12절)
  - `LEAGUE_POINTS_COEFFICIENT: 2.5` (튜닝 대상, 스펙 12절 — "OVR 차 1당
    약 +2.5점" 초기값)
  - `BASE_POINTS_AT_LEAGUE_AVERAGE: 42` (팀 전력이 리그 평균과 같을 때의
    기준 승점 — 안전 승점 근처로 시작, 튜닝 대상)

- [ ] **Step 1: Write the failing test**

```javascript
// tests/constants.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYSTYLE_TAGS,
  CONTINENT_TAGS,
  MANAGER_TIER_MULTIPLIER,
  CHEMISTRY_START,
  CHEMISTRY_DECAY_PER_TRANSACTION,
  CHEMISTRY_RECOVERY_PER_STABLE_WEEK,
  CHEMISTRY_BANDS,
  TEAM_MULTIPLIER_CAP,
  LEAGUE_POINTS_COEFFICIENT,
  BASE_POINTS_AT_LEAGUE_AVERAGE,
} from '../engine/constants.mjs';

test('플레이스타일 태그 8종이 스펙 수치와 일치한다', () => {
  assert.equal(Object.keys(PLAYSTYLE_TAGS).length, 8);
  assert.deepEqual(PLAYSTYLE_TAGS.gegenpressing, {
    positions: ['ST', 'CMF'],
    tier3: 4,
    tier5: 7,
  });
  assert.deepEqual(PLAYSTYLE_TAGS.tikiTaka, {
    positions: ['CMF', 'AMF'],
    tier3: 3,
    tier5: 5,
  });
  assert.deepEqual(PLAYSTYLE_TAGS.totalFootball, {
    positions: ['WB', 'CMF'],
    tier3: 3,
    tier5: 6,
  });
});

test('대륙 태그 5종이 모두 3명 +3 / 5명 +5 이다', () => {
  assert.equal(Object.keys(CONTINENT_TAGS).length, 5);
  for (const tag of Object.values(CONTINENT_TAGS)) {
    assert.equal(tag.tier3, 3);
    assert.equal(tag.tier5, 5);
  }
});

test('감독 등급 배율이 스펙과 일치한다', () => {
  assert.equal(MANAGER_TIER_MULTIPLIER.rookie, 1.00);
  assert.equal(MANAGER_TIER_MULTIPLIER.tactician, 1.05);
  assert.equal(MANAGER_TIER_MULTIPLIER.legendary, 1.12);
  assert.equal(MANAGER_TIER_MULTIPLIER.god, 1.20);
});

test('적응도 기본 상수가 스펙과 일치한다', () => {
  assert.equal(CHEMISTRY_START, 60);
  assert.equal(CHEMISTRY_DECAY_PER_TRANSACTION, 2);
  assert.equal(CHEMISTRY_RECOVERY_PER_STABLE_WEEK, 1);
  assert.equal(CHEMISTRY_BANDS.length, 3);
});

test('튜닝 대상 상수가 노출되어 있다', () => {
  assert.equal(typeof TEAM_MULTIPLIER_CAP, 'number');
  assert.equal(typeof LEAGUE_POINTS_COEFFICIENT, 'number');
  assert.equal(typeof BASE_POINTS_AT_LEAGUE_AVERAGE, 'number');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/constants.test.mjs`
Expected: FAIL — `engine/constants.mjs`가 없어서 모듈을 찾을 수 없다는
에러(`ERR_MODULE_NOT_FOUND`)가 나야 한다.

- [ ] **Step 3: Write minimal implementation**

```javascript
// engine/constants.mjs

// 스펙 5.1절 "플레이스타일 태그 8종" 표
export const PLAYSTYLE_TAGS = {
  gegenpressing: { positions: ['ST', 'CMF'], tier3: 4, tier5: 7 },
  falseNine: { positions: ['W', 'AMF'], tier3: 4, tier5: 7 },
  longBallKickAndRush: { positions: ['ST', 'AMF'], tier3: 4, tier5: 7 },
  tikiTaka: { positions: ['CMF', 'AMF'], tier3: 3, tier5: 5 },
  totalFootball: { positions: ['WB', 'CMF'], tier3: 3, tier5: 6 },
  falseFullBack: { positions: ['WB', 'CB'], tier3: 3, tier5: 5 }, // 변형 3백
  buildUpFromBack: { positions: ['CB', 'GK'], tier3: 2, tier5: 4 }, // 후방 빌드업
  counterAttack: { positions: ['W', 'ST'], tier3: 2, tier5: 4 }, // 선수비 후역습
};

// 스펙 5.1절 "대륙 태그 5종" 표 — 포지션 무관, 5개 권역 동일 수치
export const CONTINENT_TAGS = {
  europe: { tier3: 3, tier5: 5 },
  southAmerica: { tier3: 3, tier5: 5 },
  africa: { tier3: 3, tier5: 5 },
  asiaOceania: { tier3: 3, tier5: 5 },
  northCentralAmerica: { tier3: 3, tier5: 5 },
};

// 스펙 5.2절 "배율" — 루키/택티션/레전더리/GOD
export const MANAGER_TIER_MULTIPLIER = {
  rookie: 1.00,
  tactician: 1.05,
  legendary: 1.12,
  god: 1.20,
};

// 스펙 6절 "적응도(팀 조직력)"
export const CHEMISTRY_START = 60;
export const CHEMISTRY_DECAY_PER_TRANSACTION = 2;
export const CHEMISTRY_RECOVERY_PER_STABLE_WEEK = 1;

// 40 미만 ×0.95, 40~95 ×1.00~×1.04 선형, 96 이상 ×1.12
export const CHEMISTRY_BANDS = [
  { max: 40, multiplier: 0.95 },
  { max: 95, multiplierLow: 1.00, multiplierHigh: 1.04 },
  { max: Infinity, multiplier: 1.12 },
];

// 스펙 12절 "미확정 사항" — 시뮬레이터로 조정할 튜닝 상수.
// 여기서는 브레인스토밍에서 제시된 출발값을 그대로 코드 상수로 둔다.
export const TEAM_MULTIPLIER_CAP = 1.30;
export const LEAGUE_POINTS_COEFFICIENT = 2.5;
export const BASE_POINTS_AT_LEAGUE_AVERAGE = 42;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/constants.test.mjs`
Expected: PASS (5개 테스트 모두 통과)

- [ ] **Step 5: Commit**

```bash
git add engine/constants.mjs tests/constants.test.mjs
git commit -m "feat(engine): add core constants (tags, multipliers, chemistry bands)"
```

---

### Task 2: 선수 개인 OVR 가산 (`engine/ovr.mjs`)

스펙 5.1절 선수 특수 성향 6종 중, 라인업 전체를 봐야 하는 효과(베테랑
리더, 슈퍼 서브)와 본인 정보만으로 계산되는 효과(성골 유스, 홈타운 영웅,
저니맨)를 구분하고, 플레이스타일/대륙 시너지 가산도 함께 계산한다.
다국어 구사자는 시너지 "요구 인원 감면" 로직이라 이 태스크에서 함께
구현한다(시너지 계산이 감면을 참조해야 하므로).

**Files:**
- Create: `engine/ovr.mjs`
- Test: `tests/ovr.test.mjs`

**Interfaces:**
- Consumes: `PLAYSTYLE_TAGS`, `CONTINENT_TAGS` from `engine/constants.mjs`
  (Task 1)
- Produces (선수 객체 shape과 함께 다른 태스크가 참조할 함수들):
  - Player shape: `{ id, baseOVR, age, position, playstyleTags: string[],
    continentTag: string|null, specialTrait: string|null,
    isDraftedYouth: boolean, seasonsAtClub: number,
    acquiredThisSeason: boolean, inBench: boolean }`
  - `computeSelfTraitBonus(player): number` — 성골 유스(+3, isDraftedYouth
    필요), 홈타운 영웅(+2×min(seasonsAtClub,3), 상한 +6), 저니맨
    (acquiredThisSeason이면 +4). 세 특성은 배타적(`specialTrait` 하나만
    가짐)이므로 해당하는 것만 계산.
  - `computeTeamTraitBonuses(lineup: Player[], bench: Player[]): Map<playerId, number>`
    — 베테랑 리더(라인업에 33세 이상 성향 보유자가 있으면 23세 이하
    라인업 선수 전원 +2, 중첩 없음), 슈퍼 서브(벤치에 슈퍼 서브 보유자가
    1명 이상이면 라인업 전원 +1, 여러 명이어도 최대 +2)를 계산해
    선수 id별 가산 맵으로 반환.
  - `countEffectiveContinentRequirement(baseCount: 3|5, lineup: Player[], continentTag: string): number`
    — 다국어 구사자가 **그 권역 소속으로** 라인업에 있으면 요구 인원을
    1 감면(최소 2), 없으면 그대로 반환.
  - `computePlaystyleSynergyBonus(lineup: Player[]): Map<playerId, number>`
    — 태그별로 포지션에 배치된 보유자 수를 세고(4명→3명값, 6명 이상→
    5명값 계단식), 대상 포지션에 있는 보유자 각자에게 가산.
  - `computeContinentSynergyBonus(lineup: Player[]): Map<playerId, number>`
    — 권역별 소속 인원수(다국어 구사자 감면 적용)를 세고, 문턱을 넘으면
    그 권역 태그 보유자 각자에게 가산.
  - `computePlayerFinalOVR(player: Player, lineup: Player[], bench: Player[]): number`
    — 위 네 가지를 모두 합산한 최종 개인 OVR (baseOVR + 모든 가산).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/ovr.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSelfTraitBonus,
  computeTeamTraitBonuses,
  computePlaystyleSynergyBonus,
  computeContinentSynergyBonus,
  computePlayerFinalOVR,
} from '../engine/ovr.mjs';

function makePlayer(overrides = {}) {
  return {
    id: 'p1',
    baseOVR: 70,
    age: 25,
    position: 'ST',
    playstyleTags: [],
    continentTag: null,
    specialTrait: null,
    isDraftedYouth: false,
    seasonsAtClub: 0,
    acquiredThisSeason: false,
    inBench: false,
    ...overrides,
  };
}

test('성골 유스는 드래프트 유스 출신이면 본인 +3', () => {
  const p = makePlayer({ specialTrait: 'seongGolYouth', isDraftedYouth: true });
  assert.equal(computeSelfTraitBonus(p), 3);
});

test('성골 유스는 임시 유스(드래프트 아님)면 가산 없음', () => {
  const p = makePlayer({ specialTrait: 'seongGolYouth', isDraftedYouth: false });
  assert.equal(computeSelfTraitBonus(p), 0);
});

test('홈타운 영웅은 잔류 시즌당 +2, 상한 +6', () => {
  assert.equal(
    computeSelfTraitBonus(makePlayer({ specialTrait: 'hometownHero', seasonsAtClub: 1 })),
    2
  );
  assert.equal(
    computeSelfTraitBonus(makePlayer({ specialTrait: 'hometownHero', seasonsAtClub: 5 })),
    6
  );
});

test('저니맨은 이번 시즌 영입이면 본인 +4', () => {
  assert.equal(
    computeSelfTraitBonus(makePlayer({ specialTrait: 'journeyman', acquiredThisSeason: true })),
    4
  );
  assert.equal(
    computeSelfTraitBonus(makePlayer({ specialTrait: 'journeyman', acquiredThisSeason: false })),
    0
  );
});

test('베테랑 리더는 23세 이하 라인업 전원에게 +2, 중첩 없음', () => {
  const leader = makePlayer({ id: 'leader', age: 34, specialTrait: 'veteranLeader' });
  const young1 = makePlayer({ id: 'young1', age: 20 });
  const young2 = makePlayer({ id: 'young2', age: 23 });
  const old = makePlayer({ id: 'old', age: 28 });
  const lineup = [leader, young1, young2, old];
  const bonuses = computeTeamTraitBonuses(lineup, []);
  assert.equal(bonuses.get('young1'), 2);
  assert.equal(bonuses.get('young2'), 2);
  assert.equal(bonuses.get('old') ?? 0, 0);
  assert.equal(bonuses.get('leader') ?? 0, 0);
});

test('슈퍼 서브는 벤치에 있으면 선발 전원 +1, 여러 명이어도 최대 +2', () => {
  const starter = makePlayer({ id: 'starter' });
  const sub1 = makePlayer({ id: 'sub1', specialTrait: 'superSub', inBench: true });
  const sub2 = makePlayer({ id: 'sub2', specialTrait: 'superSub', inBench: true });
  const bonuses = computeTeamTraitBonuses([starter], [sub1, sub2]);
  assert.equal(bonuses.get('starter'), 2);
});

test('플레이스타일 시너지: 3명이면 tier3 값, 대상 포지션 보유자에게만', () => {
  const lineup = [
    makePlayer({ id: 'a', position: 'ST', playstyleTags: ['gegenpressing'] }),
    makePlayer({ id: 'b', position: 'CMF', playstyleTags: ['gegenpressing'] }),
    makePlayer({ id: 'c', position: 'CMF', playstyleTags: ['gegenpressing'] }),
    makePlayer({ id: 'd', position: 'GK', playstyleTags: [] }),
  ];
  const bonuses = computePlaystyleSynergyBonus(lineup);
  assert.equal(bonuses.get('a'), 4);
  assert.equal(bonuses.get('b'), 4);
  assert.equal(bonuses.get('c'), 4);
  assert.equal(bonuses.get('d') ?? 0, 0);
});

test('플레이스타일 시너지: 4명은 3명 값, 6명은 5명 값(계단식, 상한 5)', () => {
  const makeTagged = (id) => makePlayer({ id, position: 'ST', playstyleTags: ['gegenpressing'] });
  const lineup4 = ['a', 'b', 'c', 'd'].map(makeTagged);
  assert.equal(computePlaystyleSynergyBonus(lineup4).get('a'), 4); // tier3 값 유지

  const lineup6 = ['a', 'b', 'c', 'd', 'e', 'f'].map(makeTagged);
  assert.equal(computePlaystyleSynergyBonus(lineup6).get('a'), 7); // tier5 값 상한
});

test('대륙 시너지: 3명이면 tier3, 다국어 구사자(같은 권역)면 2명으로 감면', () => {
  const p = (id, extra = {}) => makePlayer({ id, continentTag: 'europe', ...extra });
  const lineupNoBonus = [p('a'), p('b')]; // 2명뿐, 다국어 구사자 없음 → 미달
  assert.equal(computeContinentSynergyBonus(lineupNoBonus).get('a') ?? 0, 0);

  const lineupWithPolyglot = [
    p('a', { specialTrait: 'polyglot' }),
    p('b'),
  ]; // 2명 + 다국어 구사자 → 요구 2명 충족 → tier3 발동
  const bonuses = computeContinentSynergyBonus(lineupWithPolyglot);
  assert.equal(bonuses.get('a'), 3);
  assert.equal(bonuses.get('b'), 3);
});

test('다국어 구사자는 본인이 그 권역 소속이 아니면 감면을 주지 않는다', () => {
  const p = (id, extra = {}) => makePlayer({ id, continentTag: 'europe', ...extra });
  const outsider = makePlayer({
    id: 'outsider',
    continentTag: 'southAmerica',
    specialTrait: 'polyglot',
  });
  const lineup = [p('a'), p('b'), outsider]; // 유럽 2명 + 다른 권역 다국어 구사자
  const bonuses = computeContinentSynergyBonus(lineup);
  assert.equal(bonuses.get('a') ?? 0, 0); // 감면 안 되어 2명은 미달
});

test('computePlayerFinalOVR은 baseOVR에 모든 가산을 합산한다', () => {
  const player = makePlayer({
    id: 'a',
    baseOVR: 70,
    position: 'ST',
    playstyleTags: ['gegenpressing'],
    specialTrait: 'journeyman',
    acquiredThisSeason: true,
  });
  const teammate1 = makePlayer({ id: 'b', position: 'CMF', playstyleTags: ['gegenpressing'] });
  const teammate2 = makePlayer({ id: 'c', position: 'CMF', playstyleTags: ['gegenpressing'] });
  const lineup = [player, teammate1, teammate2];
  // 70 (base) + 4 (저니맨) + 4 (게겐프레싱 3명 시너지) = 78
  assert.equal(computePlayerFinalOVR(player, lineup, []), 78);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ovr.test.mjs`
Expected: FAIL — `engine/ovr.mjs` 모듈이 없어서 `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// engine/ovr.mjs
import { PLAYSTYLE_TAGS, CONTINENT_TAGS } from './constants.mjs';

// --- 본인 정보만으로 계산되는 특수 성향 (성골 유스, 홈타운 영웅, 저니맨) ---
export function computeSelfTraitBonus(player) {
  switch (player.specialTrait) {
    case 'seongGolYouth':
      return player.isDraftedYouth ? 3 : 0;
    case 'hometownHero':
      return Math.min(player.seasonsAtClub, 3) * 2; // 상한 +6 (3시즌분)
    case 'journeyman':
      return player.acquiredThisSeason ? 4 : 0;
    default:
      return 0;
  }
}

// --- 라인업/벤치 전체를 봐야 하는 특수 성향 (베테랑 리더, 슈퍼 서브) ---
export function computeTeamTraitBonuses(lineup, bench) {
  const bonuses = new Map();
  const addBonus = (playerId, amount) => {
    bonuses.set(playerId, (bonuses.get(playerId) ?? 0) + amount);
  };

  const hasVeteranLeader = lineup.some(
    (p) => p.specialTrait === 'veteranLeader' && p.age >= 33
  );
  if (hasVeteranLeader) {
    for (const p of lineup) {
      if (p.age <= 23) addBonus(p.id, 2);
    }
  }

  const superSubCount = bench.filter((p) => p.specialTrait === 'superSub').length;
  if (superSubCount > 0) {
    const bonus = Math.min(superSubCount, 2); // 중첩 상한 +2
    for (const p of lineup) addBonus(p.id, bonus);
  }

  return bonuses;
}

// --- 계단식 인원수 판정 (4명은 3명 값, 6명 이상은 5명 값) ---
function tieredValue(count, tier3, tier5) {
  if (count >= 5) return tier5;
  if (count >= 3) return tier3;
  return 0;
}

export function computePlaystyleSynergyBonus(lineup) {
  const bonuses = new Map();
  for (const [tagId, tagDef] of Object.entries(PLAYSTYLE_TAGS)) {
    const holders = lineup.filter((p) => p.playstyleTags.includes(tagId));
    if (holders.length < 3) continue;
    const holdersInPosition = holders.filter((p) => tagDef.positions.includes(p.position));
    const value = tieredValue(holders.length, tagDef.tier3, tagDef.tier5);
    for (const p of holdersInPosition) {
      bonuses.set(p.id, (bonuses.get(p.id) ?? 0) + value);
    }
  }
  return bonuses;
}

export function countEffectiveContinentRequirement(baseCount, lineup, continentTag) {
  const hasPolyglotForThisContinent = lineup.some(
    (p) => p.specialTrait === 'polyglot' && p.continentTag === continentTag
  );
  if (!hasPolyglotForThisContinent) return baseCount;
  return Math.max(2, baseCount - 1);
}

export function computeContinentSynergyBonus(lineup) {
  const bonuses = new Map();
  for (const continentTag of Object.keys(CONTINENT_TAGS)) {
    const members = lineup.filter((p) => p.continentTag === continentTag);
    if (members.length === 0) continue;

    const tagDef = CONTINENT_TAGS[continentTag];
    const req3 = countEffectiveContinentRequirement(3, lineup, continentTag);
    const req5 = countEffectiveContinentRequirement(5, lineup, continentTag);

    let value = 0;
    if (members.length >= req5) value = tagDef.tier5;
    else if (members.length >= req3) value = tagDef.tier3;
    if (value === 0) continue;

    for (const p of members) {
      bonuses.set(p.id, (bonuses.get(p.id) ?? 0) + value);
    }
  }
  return bonuses;
}

export function computePlayerFinalOVR(player, lineup, bench) {
  const selfBonus = computeSelfTraitBonus(player);
  const teamBonuses = computeTeamTraitBonuses(lineup, bench);
  const playstyleBonuses = computePlaystyleSynergyBonus(lineup);
  const continentBonuses = computeContinentSynergyBonus(lineup);

  return (
    player.baseOVR +
    selfBonus +
    (teamBonuses.get(player.id) ?? 0) +
    (playstyleBonuses.get(player.id) ?? 0) +
    (continentBonuses.get(player.id) ?? 0)
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ovr.test.mjs`
Expected: PASS (11개 테스트 모두 통과)

- [ ] **Step 5: Commit**

```bash
git add engine/ovr.mjs tests/ovr.test.mjs
git commit -m "feat(engine): compute player OVR bonuses from traits and synergies"
```

---

### Task 3: 적응도(팀 조직력) (`engine/chemistry.mjs`)

**Files:**
- Create: `engine/chemistry.mjs`
- Test: `tests/chemistry.test.mjs`

**Interfaces:**
- Consumes: `CHEMISTRY_START`, `CHEMISTRY_DECAY_PER_TRANSACTION`,
  `CHEMISTRY_RECOVERY_PER_STABLE_WEEK`, `CHEMISTRY_BANDS` from
  `engine/constants.mjs` (Task 1)
- Produces:
  - `chemistryMultiplier(chemistry: number): number` — 구간표에 따른 배율.
    40~95 구간은 40→1.00, 95→1.04로 선형 보간.
  - `applyTransactionDecay(chemistry: number, transactionCount: number, decayPerTransaction: number = CHEMISTRY_DECAY_PER_TRANSACTION): number`
    — 거래 1건당 `decayPerTransaction`만큼 하락, 0 미만으로 내려가지
    않음. `decayPerTransaction`을 인자로 받아 수석 코치/리빌딩 장인의
    완화값(예: 1, 1.5)이나 용병 부대 방지의 2배(4)를 호출부에서 넘길 수
    있게 한다.
  - `applyStableWeekRecovery(chemistry: number): number` — 변동 없는 주
    +1, 100을 넘지 않음.
  - `clamp(value: number, min: number, max: number): number` — 재사용
    유틸리티.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/chemistry.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chemistryMultiplier,
  applyTransactionDecay,
  applyStableWeekRecovery,
  clamp,
} from '../engine/chemistry.mjs';

test('clamp는 값을 min~max 사이로 제한한다', () => {
  assert.equal(clamp(150, 0, 100), 100);
  assert.equal(clamp(-10, 0, 100), 0);
  assert.equal(clamp(50, 0, 100), 50);
});

test('적응도 40 미만이면 배율 0.95', () => {
  assert.equal(chemistryMultiplier(0), 0.95);
  assert.equal(chemistryMultiplier(39), 0.95);
});

test('적응도 40~95는 1.00~1.04 선형 보간', () => {
  assert.equal(chemistryMultiplier(40), 1.00);
  assert.equal(chemistryMultiplier(95), 1.04);
  const mid = chemistryMultiplier(67.5); // 40과 95의 중간
  assert.ok(Math.abs(mid - 1.02) < 0.001);
});

test('적응도 96 이상은 배율 1.12', () => {
  assert.equal(chemistryMultiplier(96), 1.12);
  assert.equal(chemistryMultiplier(100), 1.12);
});

test('거래 발생 시 적응도가 거래당 지정된 값만큼 하락하고 0 밑으로 안 내려간다', () => {
  assert.equal(applyTransactionDecay(60, 1, 2), 58);
  assert.equal(applyTransactionDecay(60, 5, 2), 50);
  assert.equal(applyTransactionDecay(1, 1, 2), 0);
});

test('변동 없는 주는 적응도 +1, 100을 넘지 않는다', () => {
  assert.equal(applyStableWeekRecovery(60), 61);
  assert.equal(applyStableWeekRecovery(100), 100);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/chemistry.test.mjs`
Expected: FAIL — `engine/chemistry.mjs` 없음.

- [ ] **Step 3: Write minimal implementation**

```javascript
// engine/chemistry.mjs
import { CHEMISTRY_BANDS } from './constants.mjs';

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function chemistryMultiplier(chemistry) {
  const [low, mid, high] = CHEMISTRY_BANDS;
  if (chemistry < low.max) return low.multiplier;
  if (chemistry >= mid.max) return high.multiplier;
  // 40~95 선형 보간
  const span = mid.max - low.max; // 95 - 40 = 55
  const progress = (chemistry - low.max) / span;
  return mid.multiplierLow + progress * (mid.multiplierHigh - mid.multiplierLow);
}

export function applyTransactionDecay(chemistry, transactionCount, decayPerTransaction) {
  return clamp(chemistry - transactionCount * decayPerTransaction, 0, 100);
}

export function applyStableWeekRecovery(chemistry) {
  return clamp(chemistry + 1, 0, 100);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/chemistry.test.mjs`
Expected: PASS (6개 테스트 모두 통과)

- [ ] **Step 5: Commit**

```bash
git add engine/chemistry.mjs tests/chemistry.test.mjs
git commit -m "feat(engine): chemistry decay, recovery, and multiplier lookup"
```

---

### Task 4: 팀 최종 전력 (`engine/team-power.mjs`)

**Files:**
- Create: `engine/team-power.mjs`
- Test: `tests/team-power.test.mjs`

**Interfaces:**
- Consumes: `computePlayerFinalOVR` (Task 2, `engine/ovr.mjs`),
  `chemistryMultiplier`, `clamp` (Task 3, `engine/chemistry.mjs`),
  `MANAGER_TIER_MULTIPLIER`, `TEAM_MULTIPLIER_CAP` (Task 1,
  `engine/constants.mjs`)
- Produces:
  - `computeAverageOVR(lineup: Player[], bench: Player[]): number` —
    베스트11 각자의 `computePlayerFinalOVR` 평균.
  - `computeTeamMultiplier(managerTier: string, chemistry: number): number`
    — `MANAGER_TIER_MULTIPLIER[managerTier] * chemistryMultiplier(chemistry)`를
    `TEAM_MULTIPLIER_CAP`으로 clamp.
  - `computeTeamPower(lineup: Player[], bench: Player[], managerTier: string, chemistry: number): number`
    — `computeAverageOVR × computeTeamMultiplier`.
  - `applyVariance(power: number, varianceRatio: number, randomFn: () => number = Math.random): number`
    — `power × (1 + (randomFn() * 2 - 1) * varianceRatio)`. `randomFn`을
    주입식으로 받아 테스트에서 결정론적으로 검증 가능하게 한다.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/team-power.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAverageOVR,
  computeTeamMultiplier,
  computeTeamPower,
  applyVariance,
} from '../engine/team-power.mjs';

function makePlayer(overrides = {}) {
  return {
    id: 'p',
    baseOVR: 70,
    age: 25,
    position: 'CB',
    playstyleTags: [],
    continentTag: null,
    specialTrait: null,
    isDraftedYouth: false,
    seasonsAtClub: 0,
    acquiredThisSeason: false,
    inBench: false,
    ...overrides,
  };
}

test('computeAverageOVR은 11명의 최종 OVR 평균을 낸다(태그 없는 단순 케이스)', () => {
  const lineup = Array.from({ length: 11 }, (_, i) =>
    makePlayer({ id: `p${i}`, baseOVR: 70 })
  );
  assert.equal(computeAverageOVR(lineup, []), 70);
});

test('computeTeamMultiplier는 감독 배율 × 적응도 배율이고 캡을 넘지 않는다', () => {
  // god(1.20) × 적응도 100(1.12) = 1.344 → 캡 1.30으로 clamp
  const capped = computeTeamMultiplier('god', 100);
  assert.equal(capped, 1.30);

  // rookie(1.00) × 적응도 60(구간 보간 값) → 캡 안 걸림
  const uncapped = computeTeamMultiplier('rookie', 40);
  assert.equal(uncapped, 1.00);
});

test('computeTeamPower는 평균 OVR × 팀 배율이다', () => {
  const lineup = Array.from({ length: 11 }, (_, i) =>
    makePlayer({ id: `p${i}`, baseOVR: 70 })
  );
  const power = computeTeamPower(lineup, [], 'rookie', 40);
  assert.equal(power, 70 * 1.00);
});

test('applyVariance는 randomFn 결과에 따라 ±ratio 범위로 조정한다', () => {
  assert.equal(applyVariance(100, 0.05, () => 1), 105); // 최대치
  assert.equal(applyVariance(100, 0.05, () => 0), 95); // 최소치
  assert.equal(applyVariance(100, 0.05, () => 0.5), 100); // 중간값(변화 없음)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/team-power.test.mjs`
Expected: FAIL — `engine/team-power.mjs` 없음.

- [ ] **Step 3: Write minimal implementation**

```javascript
// engine/team-power.mjs
import { computePlayerFinalOVR } from './ovr.mjs';
import { chemistryMultiplier, clamp } from './chemistry.mjs';
import { MANAGER_TIER_MULTIPLIER, TEAM_MULTIPLIER_CAP } from './constants.mjs';

export function computeAverageOVR(lineup, bench) {
  const total = lineup.reduce(
    (sum, player) => sum + computePlayerFinalOVR(player, lineup, bench),
    0
  );
  return total / lineup.length;
}

export function computeTeamMultiplier(managerTier, chemistry) {
  const raw = MANAGER_TIER_MULTIPLIER[managerTier] * chemistryMultiplier(chemistry);
  return clamp(raw, 0, TEAM_MULTIPLIER_CAP);
}

export function computeTeamPower(lineup, bench, managerTier, chemistry) {
  return computeAverageOVR(lineup, bench) * computeTeamMultiplier(managerTier, chemistry);
}

export function applyVariance(power, varianceRatio, randomFn = Math.random) {
  const swing = (randomFn() * 2 - 1) * varianceRatio; // -ratio ~ +ratio
  return power * (1 + swing);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/team-power.test.mjs`
Expected: PASS (4개 테스트 모두 통과)

- [ ] **Step 5: Commit**

```bash
git add engine/team-power.mjs tests/team-power.test.mjs
git commit -m "feat(engine): compute team power from lineup, manager tier, chemistry"
```

---

### Task 5: 리그 승점 변환 (`engine/league.mjs`)

**Files:**
- Create: `engine/league.mjs`
- Test: `tests/league.test.mjs`

**Interfaces:**
- Consumes: `LEAGUE_POINTS_COEFFICIENT`, `BASE_POINTS_AT_LEAGUE_AVERAGE`
  from `engine/constants.mjs` (Task 1)
- Produces:
  - `convertPowerToPoints(teamPower: number, leagueAverageOVR: number, coefficient: number = LEAGUE_POINTS_COEFFICIENT, basePoints: number = BASE_POINTS_AT_LEAGUE_AVERAGE): number`
    — `basePoints + coefficient × (teamPower - leagueAverageOVR)`, 0~114
    (38경기×3점) 범위로 clamp.
  - `getLeagueTier(tierId: string): { averageOVR: [number, number], safePoints: number, targetPoints: number, championPoints: number }`
    — 스펙 표에 정의된 5부/4부만 슬라이스 범위이므로 이 두 개만 우선
    구현하고, 나머지 리그는 같은 shape로 추후 추가.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/league.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertPowerToPoints, getLeagueTier } from '../engine/league.mjs';

test('팀 전력이 리그 평균과 같으면 기준 승점을 받는다', () => {
  assert.equal(convertPowerToPoints(60, 60), 42);
});

test('팀 전력이 리그 평균보다 높으면 승점이 계수만큼 오른다', () => {
  // 평균보다 +4 높음, 계수 2.5 → 42 + 4*2.5 = 52
  assert.equal(convertPowerToPoints(64, 60), 52);
});

test('팀 전력이 리그 평균보다 낮으면 승점이 계수만큼 내려간다', () => {
  assert.equal(convertPowerToPoints(56, 60), 32);
});

test('승점은 0~114(38경기 만점) 범위를 벗어나지 않는다', () => {
  assert.equal(convertPowerToPoints(1000, 60), 114);
  assert.equal(convertPowerToPoints(-1000, 60), 0);
});

test('getLeagueTier는 5부와 4부의 체급 정보를 반환한다', () => {
  const tier5 = getLeagueTier('tier5');
  assert.deepEqual(tier5.averageOVR, [50, 58]);
  assert.equal(tier5.safePoints, 38);
  assert.equal(tier5.targetPoints, 68);
  assert.equal(tier5.championPoints, 80);

  const tier4 = getLeagueTier('tier4');
  assert.deepEqual(tier4.averageOVR, [60, 67]);
  assert.equal(tier4.safePoints, 40);
  assert.equal(tier4.targetPoints, 70);
  assert.equal(tier4.championPoints, 84);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/league.test.mjs`
Expected: FAIL — `engine/league.mjs` 없음.

- [ ] **Step 3: Write minimal implementation**

```javascript
// engine/league.mjs
import { LEAGUE_POINTS_COEFFICIENT, BASE_POINTS_AT_LEAGUE_AVERAGE } from './constants.mjs';
import { clamp } from './chemistry.mjs';

const MAX_SEASON_POINTS = 38 * 3; // 38경기 승리 시 만점

export function convertPowerToPoints(
  teamPower,
  leagueAverageOVR,
  coefficient = LEAGUE_POINTS_COEFFICIENT,
  basePoints = BASE_POINTS_AT_LEAGUE_AVERAGE
) {
  const raw = basePoints + coefficient * (teamPower - leagueAverageOVR);
  return clamp(raw, 0, MAX_SEASON_POINTS);
}

// 스펙 2절 "커리어 사다리 및 리그 스케일링" 표 — 슬라이스 범위(5부, 4부)만 우선 구현
const LEAGUE_TIERS = {
  tier5: { averageOVR: [50, 58], safePoints: 38, targetPoints: 68, championPoints: 80 },
  tier4: { averageOVR: [60, 67], safePoints: 40, targetPoints: 70, championPoints: 84 },
};

export function getLeagueTier(tierId) {
  const tier = LEAGUE_TIERS[tierId];
  if (!tier) throw new Error(`Unknown league tier: ${tierId}`);
  return tier;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/league.test.mjs`
Expected: PASS (5개 테스트 모두 통과)

- [ ] **Step 5: Commit**

```bash
git add engine/league.mjs tests/league.test.mjs
git commit -m "feat(engine): convert team power to season points, add league tier data"
```

---

### Task 6: 전체 테스트 실행 확인 + 밸런스 시뮬레이터 (`tools/simulate.mjs`)

시뮬레이터는 임의 구성의 5부 팀 100개를 만들어 승점 분포를 출력한다.
아직 데이터 생성기(Task 2 이후 계획)가 없으므로, 이 스크립트 안에서
간단한 무작위 라인업 생성 헬퍼를 직접 만든다. 목적은 Task 1~5에서 만든
엔진 함수들이 실제로 조합되어 동작하는지 눈으로 확인하고, 스펙 12절의
튜닝 작업을 시작할 진입점을 마련하는 것이다.

**Files:**
- Create: `tools/simulate.mjs`
- Test: 없음(수동 실행 스크립트). 대신 이 태스크의 마지막 단계에서
  Task 1~5의 전체 테스트 스위트를 다시 한번 돌려 회귀가 없는지 확인한다.

**Interfaces:**
- Consumes: `computeTeamPower`, `applyVariance` (Task 4),
  `convertPowerToPoints`, `getLeagueTier` (Task 5)
- Produces: 콘솔에 승점 분포(최소/평균/최대, 안전 승점 이상 비율)를
  출력하는 CLI 스크립트. 다른 모듈이 이 파일을 import하지 않으므로
  export는 필요 없다.

- [ ] **Step 1: Write the script**

```javascript
// tools/simulate.mjs
import { computeTeamPower, applyVariance } from '../engine/team-power.mjs';
import { convertPowerToPoints, getLeagueTier } from '../engine/league.mjs';

const POSITIONS_11 = ['GK', 'CB', 'CB', 'WB', 'WB', 'CMF', 'CMF', 'AMF', 'W', 'W', 'ST'];

function randomInRange([min, max]) {
  return min + Math.random() * (max - min);
}

function makeRandomLineup(ovrRange) {
  return POSITIONS_11.map((position, i) => ({
    id: `sim-${i}`,
    baseOVR: Math.round(randomInRange(ovrRange)),
    age: 20 + Math.round(Math.random() * 15),
    position,
    playstyleTags: [],
    continentTag: null,
    specialTrait: null,
    isDraftedYouth: false,
    seasonsAtClub: 0,
    acquiredThisSeason: false,
    inBench: false,
  }));
}

function runSimulation(tierId, managerTier, chemistry, runs = 100) {
  const tier = getLeagueTier(tierId);
  const leagueAverageOVR = (tier.averageOVR[0] + tier.averageOVR[1]) / 2;

  const pointsResults = [];
  for (let i = 0; i < runs; i++) {
    const lineup = makeRandomLineup(tier.averageOVR);
    const basePower = computeTeamPower(lineup, [], managerTier, chemistry);
    const finalPower = applyVariance(basePower, 0.05);
    pointsResults.push(convertPowerToPoints(finalPower, leagueAverageOVR));
  }

  const avg = pointsResults.reduce((a, b) => a + b, 0) / pointsResults.length;
  const min = Math.min(...pointsResults);
  const max = Math.max(...pointsResults);
  const safeRate =
    pointsResults.filter((p) => p >= tier.safePoints).length / pointsResults.length;

  console.log(`--- ${tierId} / 감독:${managerTier} / 적응도:${chemistry} (${runs}회) ---`);
  console.log(`승점 평균: ${avg.toFixed(1)}, 최소: ${min.toFixed(1)}, 최대: ${max.toFixed(1)}`);
  console.log(`안전 승점(${tier.safePoints}) 이상 달성률: ${(safeRate * 100).toFixed(1)}%`);
}

runSimulation('tier5', 'rookie', 60);
runSimulation('tier5', 'tactician', 80);
```

- [ ] **Step 2: Run the script manually**

Run: `node tools/simulate.mjs`
Expected: 두 시나리오(루키 감독/적응도 60, 택티션 감독/적응도 80)의 승점
평균·최소·최대와 안전 승점 달성률이 콘솔에 출력된다. 에러 없이 실행되면
성공이다. (스펙 8절 목표치인 "신규 5부 잔류 60~70%"와 비교해 보되, 지금은
튜닝 전 출발값이므로 정확히 맞지 않아도 된다 — 정식 튜닝은 데이터 생성기와
태그 분포가 갖춰진 뒤 별도 작업으로 진행한다.)

- [ ] **Step 3: Run full test suite to confirm no regressions**

Run: `node --test tests/`
Expected: PASS — Task 1~5에서 작성한 모든 테스트(총 26개)가 통과한다.

- [ ] **Step 4: Commit**

```bash
git add tools/simulate.mjs
git commit -m "feat(tools): add balance simulator entry point for tier5 scenarios"
```

---

## 다음 계획과의 연결

이 계획이 끝나면 `engine/`에는 개인 OVR 가산, 시너지, 적응도, 팀 배율,
승점 변환까지 스펙 6절의 전체 공식이 테스트로 검증된 상태로 존재한다.
다음 계획들은 이 엔진을 소비하는 입장에서 작성한다.

- **다음 계획 2 (데이터 생성기)**: `data/` 아래 선수·감독·구단·스태프
  JSON을 절차적으로 생성하는 스크립트. 이 계획의 Player shape(`baseOVR`,
  `position`, `playstyleTags`, `continentTag`, `specialTrait` 등)를 그대로
  출력해야 한다.
- **다음 계획 3 (경제 시스템)**: 드래프트 상점, 계약, 방출. `engine/`은
  건드리지 않고 `data/`의 가격표를 소비한다.
- **다음 계획 4 (이벤트 시스템)**: 위기/기회 이벤트 발동과 딜레마 선택.
- **다음 계획 5 (UI)**: 지금까지의 `engine/`, `data/`를 소비해 화면을
  그린다.
- **다음 계획 6 (저장/로드)**: 브라우저 로컬 저장.

TBD 값(스펙 12절)의 정식 튜닝은 데이터 생성기(계획 2)가 완성되어 실제
카드 분포로 시뮬레이션할 수 있을 때 별도 작업으로 진행한다.
