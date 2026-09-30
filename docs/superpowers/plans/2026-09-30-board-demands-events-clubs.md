# 이사진 요구 선택 / 이벤트 확대 / 구단 DB 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 매 시즌 이벤트가 뜨고, 이사진 요구 카드를 골라 보너스를 받고, 구단이 리그마다 20팀(강5·중10·약5)으로 다양해지게 한다.

**Architecture:** 이벤트와 요구 카드는 `data/`에 "정의 + 순수 함수" 형태로 두고(rng·상태 주입), `ui/app.mjs`는 호출·표시만 한다. 구단은 `data/clubs.mjs`의 정적 로스터(100개)로 바꾼다. 기존 시즌 브리핑 팝업(`seasonBriefing`)과 이벤트 팝업(`eventmodal`)을 재사용한다.

**Tech Stack:** 순수 ES 모듈(`.mjs`), `node --test`, 빌드 도구 없음.

**Spec:** `docs/superpowers/specs/2026-09-30-board-demands-events-clubs-design.md`

## Global Constraints

- 리그는 정확히 20팀 = 강팀 5 · 중위권 10 · 약팀 5, 구단 이름은 전역 고유.
- 이벤트 확률: 여름 시작 70%, 겨울 진입 30%. 상수 `EVENT_CHANCE_SUMMER`, `EVENT_CHANCE_WINTER`. 같은 이벤트 중복 허용.
- 요구 카드는 선택형 보너스, 페널티 없음. 보상: 쉬움 +5% / 보통 +10% / 어려움 +20% (다음 시즌 지급액 기준).
- 유형별 기대치 +5/0/-5, 시작 자금 배율 ×1.3/×1.0/×0.8.
- 밸런스 수치를 건드리면 `node tools/tune-ladder.mjs 1000`으로 재측정. 테스트: `node --test tests/*.test.mjs` 전부 통과.
- 사용자에게 보이는 문구는 한국어. main에 직접 커밋(브랜치 없음). 커밋 끝에 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### Task 1: 이벤트 확대 (매 시즌, 신규 6종)

**Files:**
- Create: `data/season-events.mjs`, `tests/season-events.test.mjs`
- Delete: `data/run-preseason-event.mjs`, `tests/run-preseason-event.test.mjs`
- Modify: `engine/constants.mjs`(확률·수치 상수), `ui/app.mjs`(startRun 1곳 교체, startNewSeason·enterWinterMarket에 굴림 추가, `showEvent` 조건), `data/local-save.mjs`(변경 없음 예상)

**Interfaces:**
- Produces: `rollSeasonEvent(ctx, phase, rng = Math.random, bias = {})` →
  `{ id: string|null, tone: 'good'|'bad'|null, message: string, squad, funds, chemistry }`.
  `ctx = { squad, funds, chemistry, baseFunds, crisisImmune }`. `phase`는 `'summer'|'winter'`.
  `id === null`이면 이벤트 없음(ctx 값 그대로, message `''`).
  `bias`는 `{ [eventId]: 가중치 배수 }`(Task 3에서 구단 색채가 채운다, 지금은 `{}`).
  `crisisImmune`이 true면 `tone === 'bad'` 이벤트는 효과 없이 message만 "무효화" 문구.
- Produces (constants): `EVENT_CHANCE_SUMMER = 0.7`, `EVENT_CHANCE_WINTER = 0.3`.

이벤트 9종(전부 `when: ['summer','winter']`):

| id | tone | 효과 |
|---|---|---|
| mainSponsorship | good | funds × (1 + SPONSORSHIP_FUNDS_BONUS_RATIO) |
| ffpAudit | bad | 기존 로직 그대로(납부, 부족하면 최약체 방출) |
| youthGoldenGeneration | good | 무료 성골 유스 1명 |
| supportersFund | good | funds + baseFunds × 0.08 |
| pressPraise | good | chemistry + 8 (100 상한) |
| pressCriticism | bad | chemistry − 8 (0 하한) |
| retiringLegend | good | 나이 35, bigLeaguer급, price 0, veteranLeader, contractYearsLeft 1 무료 영입 |
| rivalPoach | bad | OVR 최고 선수의 contractYearsLeft를 1로(이미 ≤1이면 효과 없음, message에 "버텼다") |
| injuryAftermath | bad | 무작위 선수 1명 baseOVR −3(최소 1) |

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/season-events.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollSeasonEvent } from '../data/season-events.mjs';
import { EVENT_CHANCE_SUMMER, EVENT_CHANCE_WINTER } from '../engine/constants.mjs';

const mk = (id, baseOVR, extra = {}) => ({
  id, name: `P${id}`, baseOVR, age: 25, position: 'CB', playstyleTags: [],
  continentTag: null, specialTrait: null, isDraftedYouth: false, price: 10, contractYearsLeft: 2, ...extra,
});
const ctx = (over = {}) => ({ squad: [mk('a', 60), mk('b', 80)], funds: 1000, chemistry: 60, baseFunds: 1000, crisisImmune: false, ...over });
// rng 시퀀스: 첫 값은 발생 여부, 둘째는 이벤트 선택(가중치 룰렛), 나머지는 효과 내부용
const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };

test('확률 상수: 여름 70%, 겨울 30%', () => {
  assert.equal(EVENT_CHANCE_SUMMER, 0.7);
  assert.equal(EVENT_CHANCE_WINTER, 0.3);
});

test('발생 굴림이 확률 이상이면 이벤트 없음', () => {
  const r = rollSeasonEvent(ctx(), 'summer', seq(0.9));
  assert.equal(r.id, null);
  assert.equal(r.funds, 1000);
});

test('겨울은 0.5 굴림이면 이벤트 없음(30%), 여름은 발생', () => {
  assert.equal(rollSeasonEvent(ctx(), 'winter', seq(0.5)).id, null);
  assert.notEqual(rollSeasonEvent(ctx(), 'summer', seq(0.5, 0)).id, null);
});

test('mainSponsorship: 자금 +20%', () => {
  const r = rollSeasonEvent(ctx(), 'summer', seq(0, 0));
  assert.equal(r.id, 'mainSponsorship');
  assert.equal(r.funds, 1200);
  assert.equal(r.tone, 'good');
});

test('bias로 특정 이벤트를 사실상 강제할 수 있다', () => {
  const r = rollSeasonEvent(ctx(), 'summer', seq(0, 0.5), { pressCriticism: 1000 });
  assert.equal(r.id, 'pressCriticism');
  assert.equal(r.chemistry, 52);
});

test('bad 이벤트는 crisisImmune이면 효과 없이 무효화된다', () => {
  const r = rollSeasonEvent(ctx({ crisisImmune: true }), 'summer', seq(0, 0.5), { pressCriticism: 1000 });
  assert.equal(r.id, 'pressCriticism');
  assert.equal(r.chemistry, 60);
  assert.match(r.message, /무효/);
});

test('rivalPoach: 에이스 계약이 1년으로 줄어든다', () => {
  const r = rollSeasonEvent(ctx(), 'summer', seq(0, 0.5), { rivalPoach: 1000 });
  assert.equal(r.squad.find((p) => p.id === 'b').contractYearsLeft, 1);
});

test('injuryAftermath: 한 명의 OVR이 3 깎인다', () => {
  const r = rollSeasonEvent(ctx(), 'summer', seq(0, 0.5, 0), { injuryAftermath: 1000 });
  const total = (s) => s.reduce((n, p) => n + p.baseOVR, 0);
  assert.equal(total(r.squad), total(ctx().squad) - 3);
});

test('retiringLegend: 무료 베테랑 리더가 추가된다', () => {
  const r = rollSeasonEvent(ctx(), 'summer', seq(0, 0.5), { retiringLegend: 1000 });
  assert.equal(r.squad.length, 3);
  const legend = r.squad.at(-1);
  assert.equal(legend.price, 0);
  assert.equal(legend.specialTrait, 'veteranLeader');
  assert.equal(legend.age, 35);
});

test('ffpAudit: 자금 부족이면 최약체 방출', () => {
  const r = rollSeasonEvent(ctx({ funds: 0 }), 'summer', seq(0, 0.5), { ffpAudit: 1000 });
  assert.equal(r.squad.length, 1);
  assert.equal(r.squad[0].id, 'b');
});
```

- [ ] **Step 2: 실패 확인** — `node --test tests/season-events.test.mjs` → FAIL(모듈 없음).

- [ ] **Step 3: 상수 추가** — `engine/constants.mjs` 끝에:

```js
// 시즌 이벤트 발생 확률(시즌 여름 시작 / 겨울 시장 진입). 플레이 후 조절 대상.
export const EVENT_CHANCE_SUMMER = 0.7;
export const EVENT_CHANCE_WINTER = 0.3;
```

- [ ] **Step 4: 구현** — `data/season-events.mjs`. 룰렛은 `rng()`로 `total * rng()` 지점을 찾는다(가중치 = 1 × `bias[id] ?? 1`). 발생 여부는 첫 `rng()`가 확률 미만인지로 판정. 이벤트 정의는 `{ id, tone, weight: 1, apply(ctx, rng) → { squad?, funds?, chemistry?, message } }` 배열. `ffpAudit`는 `resolveFfpAudit()` 재사용(기존 `run-preseason-event.mjs` 로직 이식), `youthGoldenGeneration`은 `generateProceduralPlayer('local', rng)`에 `price: 0, specialTrait: 'seongGolYouth', isDraftedYouth: true`, `retiringLegend`는 `generateProceduralPlayer('bigLeaguer', rng)`에 `{ age: 35, price: 0, specialTrait: 'veteranLeader', contractYearsLeft: 1 }`. message는 `"이벤트 이름: 상세"` 형식(UI가 `: `로 title/detail 분리). `crisisImmune && tone === 'bad'`면 apply를 건너뛰고 message를 `"${name}: 위기 관리형 감독이 무효화했습니다"`로 한다. `injuryAftermath`의 대상은 `Math.floor(rng() * squad.length)`, `rivalPoach`의 대상은 baseOVR 최대 선수.

- [ ] **Step 5: 통과 확인** — `node --test tests/season-events.test.mjs` → PASS.

- [ ] **Step 6: UI 연결** — `ui/app.mjs`:
  1. import를 `rollSeasonEvent`로 교체, `EVENT_CHANCE_*`는 모듈 내부에서만 쓴다.
  2. `startRun`(현 `rollPreseasonEvent(rawSquad, baseFunds)` 호출부 약 533행): `rollSeasonEvent({ squad: rawSquad, funds: baseFunds, chemistry: chemistryBeforeEvent, baseFunds, crisisImmune: manager.trait === 'crisisManager' }, 'summer')`. 기존 `crisisBlocked` 분기는 삭제(모듈이 처리). `id === null`이면 `eventTone = null`. 결과의 `chemistry`도 상태에 반영.
  3. `startNewSeason`(`grantSeasonFunds()` 이후, `eventMessage=''` 초기화 대신): 같은 호출로 굴리고 `currentState.squad/funds/chemistry/eventMessage/eventTone`에 반영. 스쿼드 갱신(`acquiredThisSeason` 등 map) **이후**에 굴려야 무료 영입 선수가 유지된다.
  4. `enterWinterMarket`: 겨울 지원금 지급 뒤 `'winter'`로 굴려 반영. `showEvent` 조건을 `(phase === 'summer' ? SUMMER_MARKET_WEEKS[0] : WINTER_MARKET_WEEKS[0]) === week && eventTone`로 바꾼다.
  5. 이벤트 팝업 kicker의 tone 문구는 유지. `bad`가 아니면 `good` 스타일.
  6. `git rm data/run-preseason-event.mjs tests/run-preseason-event.test.mjs`.

- [ ] **Step 7: 전체 테스트** — `node --test tests/*.test.mjs` 전부 통과, `node --check ui/app.mjs`.

- [ ] **Step 8: 커밋** — `git add -A data engine tests ui && git commit -m "feat: 시즌 이벤트를 매 시즌 여름 70%/겨울 30%로 굴리고 신규 6종을 더한다"`

---

### Task 2: 이사진 요구 카드 선택

**Files:**
- Create: `data/board-demands.mjs`, `tests/board-demands.test.mjs`
- Modify: `ui/app.mjs`(구단 선택 뒤 요구 선택 화면, 시즌 브리핑 팝업에 선택 UI, 시즌 종료 판정·정산), `engine/constants.mjs`(`BOARD_DEMAND_REWARD = { easy: 0.05, normal: 0.10, hard: 0.20 }`), `data/local-save.mjs`(`boardDemand ??= null`, `seasonTrack ??= {}`)

**Interfaces:**
- Produces: `DEMAND_CARDS: Array<{ id, difficulty: 'easy'|'normal'|'hard', text(param) : string, param: number, check(state, param) : boolean, tags: string[] }>`
- Produces: `drawDemandOffer(rng, bias = {}) → [easy, normal, hard]` (난이도마다 1장, 후보 중 `bias[tag]` 가중치로 추첨)
- Produces: `evaluateDemand(cardId, state) → boolean`
- State 필드: `currentState.boardDemand = { cardId, difficulty } | null`, `currentState.seasonTrack = { spendStart: number, winterTransactions: number, firstHalfPoints }` — 시즌 시작에 초기화, 영입/방출/겨울 거래 시 갱신. 카드 판정에 필요한 카운터는 이 객체에만 둔다.

카드 풀(각 난이도 3장 이상, 초기 9장): 
- easy: 선발 중 유스(`isDraftedYouth`) 1명 이상 / 시즌 종료 적응도 50 이상 / 영입 지출이 시즌 자금의 80% 이하
- normal: 선발 중 유스 3명 이상 / 선발 평균 나이 26세 이하 / 겨울 시장 거래 2건 이하
- hard: 선발 평균 나이 24세 이하 / 전반기 승점이 목표 페이스(목표÷2) 이상 / 영입 지출이 시즌 자금의 50% 이하

- [ ] **Step 1: 테스트** — 카드마다 통과 상태/실패 상태 `check` 1개씩(총 9쌍), `drawDemandOffer`가 항상 easy·normal·hard 각 1장씩 돌려주는지, `bias`로 태그 가중이 먹는지(고정 rng).
- [ ] **Step 2: 실패 확인** → `node --test tests/board-demands.test.mjs`.
- [ ] **Step 3: 구현** — `data/board-demands.mjs`에 `DEMAND_CARDS`, `drawDemandOffer`, `evaluateDemand`. `check`는 `state.squad`, `state.chemistry`, `state.seasonTrack`, 그리고 선발 라인업이 필요한 카드는 `state.lineup`(시즌 종료 시 호출부가 채워서 넘긴다)만 읽는 순수 함수.
- [ ] **Step 4: 통과 확인.**
- [ ] **Step 5: UI** — (a) `renderCareerIntro` 앞에 `renderDemandChoice(next)`: 카드 3장 + "요구 없이 시작" 버튼, 선택 시 `currentState.boardDemand` 저장. (b) `startNewSeason`의 브리핑 팝업에 같은 카드 3장 선택 UI 추가(선택 전에는 "목표 확인" 비활성). (c) `finishSeasonRender`: `evaluateDemand`로 달성 여부 계산해 `pendingBoardReview`에 `{ demand: { text, difficulty, achieved, fundsReward } }`로 합치고, `startNewSeason`의 지급 로직이 `fundsReward`도 더한다(기존 목표 초과 보상과 합산, 팝업에 각각 표시). 보상은 `seasonBaseGrant() × BOARD_DEMAND_REWARD[difficulty]`. (d) 영입·방출·겨울 거래 지점(`buyCard` 등 `funds -=` 근처)에서 `seasonTrack` 갱신.
- [ ] **Step 6: 전체 테스트, `node --check`.**
- [ ] **Step 7: 커밋** — `feat: 이사진 요구 카드를 골라 달성하면 다음 시즌 자금 보너스`

---

### Task 3: 구단 DB 20팀 × 5리그 (강5·중10·약5, 색채)

**Files:**
- Modify: `data/clubs.mjs`(전면 재구성), `ui/app.mjs`(구단 선택 화면이 새 API 사용), `tests/`(로스터 테스트 추가)
- Create: `tests/clubs.test.mjs`

**Interfaces:**
- Produces: `COLORS` — 색채 표 10종 `{ id, label, strength, weakness, fundsMultiplier, demandBias: { [tag]: n }, eventBias: { [eventId]: n } }`.
- Produces: `CLUB_ROSTER: { tier5: Club[20], ... tier1: Club[20] }`, `Club = { id, name, kit, tierId, klass: 'strong'|'mid'|'weak', color: <COLORS id> }`.
- Produces: `buildStartClubOffers() → Club-with-derived-fields[4]`(강·중·약 각 1 + 무작위 1, 5부 로스터), `buildTierClubOffers(tierId, 3)`(강·중·약 각 1), `buildLeagueRivals(tierId, count)`(로스터에서 무작위, 내 구단 제외).
- 파생 필드(`deriveClub(club)`): `startingFundsMultiplier = KLASS_FUNDS[klass] × COLORS[color].fundsMultiplier`, `expectationModifier = KLASS_EXPECTATION[klass]`, `demand`(유형별 문구), `strength`/`weakness`(색채 문구), `demandBias`, `eventBias`.
- Consumes: Task 1의 `rollSeasonEvent(..., bias)`에 `club.eventBias`를, Task 2의 `drawDemandOffer(rng, bias)`에 `club.demandBias`를 넘긴다.

색채 10종: youthDevelopment(유스 육성형, ×0.9), richOwner(재벌 투자형, ×1.4), defensiveWall(수비 축구, ×1.0), attackingFlair(공격 축구, ×1.0), counterAttack(역습 전문, ×1.0), veteranCore(베테랑 중심, ×1.05), overseasScouting(해외파 중심, ×1.1), localRoots(지역 밀착형, ×0.95), financialTrouble(재정 위기형, ×0.75), risingForce(신흥 강호, ×1.2). 각 색채는 `demandBias`(예: youthDevelopment → `{ youth: 3 }`)와 `eventBias`(예: youthDevelopment → `{ youthGoldenGeneration: 3 }`, financialTrouble → `{ ffpAudit: 3 }`, richOwner → `{ mainSponsorship: 3 }`)를 갖는다. 카드 `tags`는 Task 2의 카드에 `youth`/`age`/`spend`/`pace`/`stable` 등으로 붙인다.

- [ ] **Step 1: 테스트** — `tests/clubs.test.mjs`: 리그마다 20팀, `klass` 비율 5/10/5, 전 리그 합쳐 `name`·`id` 전역 유일, 모든 `color`가 `COLORS`에 존재, `buildStartClubOffers()`가 4개(강·중·약 각 ≥1), `buildTierClubOffers`가 강·중·약 각 1개, `deriveClub` 파생값(강팀 기대치 +5·자금 ×1.3×색채 등).
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 로스터 작성** — 리그별 20개 이름을 직접 작성(어간은 리그마다 전부 다름, 접미사는 격에 맞게: 5부 Rovers/Town/Athletic/Wanderers, 4부 Rovers/Athletic/Town/Rangers, 3부 County/Rangers/Town/Rovers, 2부 City/Albion/United/County, 1부 City/United/FC/Sovereign). 각 리그 20개에 `klass`(5/10/5)와 `color`를 배정. 색상 `kit`은 구단마다 다르게.
- [ ] **Step 4: API 구현·통과 확인.**
- [ ] **Step 5: UI** — 기존 `CLUBS`/`buildTierClubOffers` 호출부를 새 API로 교체. 구단 선택 카드에 유형 뱃지(강팀/중위권/약팀)와 색채 라벨을 표시. 시작 시 `rollSeasonEvent`에 `club.eventBias`, 요구 선택에 `club.demandBias` 전달. `expectationModifier`/`startingFundsMultiplier` 필드는 그대로 유지(하위 호환).
- [ ] **Step 6: 세이브 호환** — `withRunDefaults`에서 구세이브의 `club`에 `klass`/`color`가 없어도 동작하는지 확인(파생 필드는 이미 club 객체에 저장돼 있으므로 문제없음, `demandBias ??= {}`, `eventBias ??= {}`만 기본값 처리).
- [ ] **Step 7: 전체 테스트 + `node tools/tune-ladder.mjs 1000`으로 리그 순서 유지 확인.**
- [ ] **Step 8: 커밋** — `feat: 리그마다 20개 구단(강5·중10·약5)과 색채 10종으로 구단 DB 확장`

---

## Self-Review

- 스펙 1(구단 DB)=Task 3, 스펙 2(요구 선택)=Task 2, 스펙 3(이벤트)=Task 1. 요구 선택 시점 두 곳(구단 선택 직후·매 시즌 팝업)은 Task 2 Step 5. 색채의 요구/이벤트 편향은 Task 3에서 `bias` 파라미터로 연결(Task 1·2 시그니처에 이미 존재).
- 타입 일관성: `rollSeasonEvent`/`drawDemandOffer`의 `bias` 인자, `club.eventBias`/`club.demandBias` 이름이 세 Task에서 같다.
- 알려진 미확정: 요구 카드의 세부 임계값(연령·지출 비율)은 첫 플레이 후 조정 대상.
