# 상점 결정 깊이 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상점 카드에서 "정답을 알려주는" 델타 숫자를 없애고 리그 등급별로 카드 등급 분포를 갈라서, 매주 이적시장 결정에 실제 고민이 생기게 한다.

**Architecture:** `data/draft-shop.mjs`가 리그 id를 받아 그 리그에 맞는 카드 등급 분포로 매물을 뽑도록 바꾸고, `ui/app.mjs`의 상점 카드 렌더링에서 사전 계산된 "팀 +X.X" 이득 대신 라인업의 태그 보유 현황(재료)만 보여준다. `tools/tune-ladder.mjs`를 현재 게임 상태(20명 스쿼드, 리그별 상점 분포)에 맞게 갱신해 밸런스를 재실측한다.

**Tech Stack:** Node.js(ESM), `node:test` + `node:assert/strict`. 빌드 단계 없음.

**Spec:** `docs/superpowers/specs/2026-09-29-shop-decision-depth-design.md`

## Global Constraints

- 사용자에게 보이는 문구에 em 대시(—) 금지 (기존 프로젝트 컨벤션)
- 빌드 단계 없음, 순수 ES 모듈, npm 의존성 추가 금지
- `generateShopOffer`의 기존 호출부(`tests/draft-shop.test.mjs`)가 `tierId` 없이 호출해도 깨지지 않아야 한다 — 새 파라미터는 기본값을 가진 마지막 위치에 추가한다
- 매 태스크 끝에 `node --test tests/*.test.mjs`로 기존 96개(+신규) 테스트가 전부 통과하는지 확인한다

---

### Task 1: 리그별 상점 등급 분포

**Files:**
- Modify: `data/draft-shop.mjs` (전체 재작성 수준)
- Test: `tests/draft-shop.test.mjs`

**Interfaces:**
- Consumes: 없음 (이 태스크가 최초 정의)
- Produces: `generateShopOffer(size, availableGods = [], rng = Math.random, tierId = 'tier1')` — 기존 3개 인자 순서는 그대로 두고 4번째로 `tierId` 추가. `SHOP_TIER_WEIGHTS_BY_TIER`(export, 리그 id → `{ local, bigLeaguer, topClass, worldClass, legendary }` 카운트 객체) — Task 5에서 재튜닝 시 이 값을 조정한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/draft-shop.test.mjs` 끝에 추가:

```js
test('리그가 낮을수록 상점 매물의 평균 OVR이 낮다', () => {
  const rng = () => 0.5; // 각 리그 테이블 안에서 항상 같은 인덱스를 골라 결정론적으로 비교
  const avgOVR = (tierId) => {
    const offer = generateShopOffer(200, [], rng, tierId);
    return offer.reduce((sum, c) => sum + c.baseOVR, 0) / offer.length;
  };
  assert.ok(avgOVR('tier5') < avgOVR('tier3'));
  assert.ok(avgOVR('tier3') < avgOVR('tier1'));
});

test('tierId 없이 호출해도(구버전 호출부) 정상 동작한다', () => {
  const offer = generateShopOffer(3);
  assert.equal(offer.length, 3);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test tests/draft-shop.test.mjs`
Expected: 새로 추가한 두 테스트가 FAIL (아직 `tierId`를 안 받으므로 `avgOVR('tier5')`와 `avgOVR('tier3')`가 같은 분포에서 나와 부등식이 거짓이거나, 함수가 4번째 인자를 무시해서 첫 번째 테스트가 실패한다).

- [ ] **Step 3: `data/draft-shop.mjs`를 리그별 분포로 재작성**

```js
import { generateProceduralPlayer } from './generate-player.mjs';
import { GOD_PLAYER_SHOP_CHANCE } from '../engine/constants.mjs';

// 상점 매물 등급 분포 - 리그별. 자금은 이미 리그가 낮을수록 적게 설계돼
// 있는데(engine/economy.mjs calculateStartingFunds) 카드 등급은 예전엔
// 리그 무관 고정이었다 - 5부에서도 legendary가 뜨는 위화감이 있었다.
// 아래 값은 tools/tune-ladder.mjs로 재튜닝하기 전 출발점이다(스펙 문서 참고).
export const SHOP_TIER_WEIGHTS_BY_TIER = {
  tier5: { local: 70, bigLeaguer: 25, topClass: 5, worldClass: 0, legendary: 0 },
  tier4: { local: 45, bigLeaguer: 35, topClass: 15, worldClass: 5, legendary: 0 },
  tier3: { local: 20, bigLeaguer: 30, topClass: 30, worldClass: 15, legendary: 5 },
  tier2: { local: 10, bigLeaguer: 20, topClass: 30, worldClass: 30, legendary: 10 },
  tier1: { local: 5, bigLeaguer: 10, topClass: 20, worldClass: 40, legendary: 25 },
};

function tierPool(tierId) {
  const weights = SHOP_TIER_WEIGHTS_BY_TIER[tierId] ?? SHOP_TIER_WEIGHTS_BY_TIER.tier1;
  return Object.entries(weights).flatMap(([tier, count]) => Array(count).fill(tier));
}

// 상점형 드래프트: N장 전부 살 수 있다(자금이 제약). 스펙 7절.
// availableGods: 이번 런에서 아직 등장/영입되지 않은 GOD 카드 목록(data/god-players.mjs).
// 등장해도 목록에서 빼지 않는다 - 실제로 "영입"할 때만 소모(ui/app.mjs에서 처리).
// tierId: 지금 뛰는 리그 등급. 안 넘기면 가장 관대한 tier1 분포를 쓴다
// (구버전 호출부·유닛 테스트 호환용 기본값 - 실제 게임은 항상 넘긴다).
export function generateShopOffer(size, availableGods = [], rng = Math.random, tierId = 'tier1') {
  const pool = tierPool(tierId);
  return Array.from({ length: size }, () => {
    if (availableGods.length > 0 && rng() < GOD_PLAYER_SHOP_CHANCE) {
      return availableGods[Math.floor(rng() * availableGods.length)];
    }
    const tier = pool[Math.floor(rng() * pool.length)];
    return generateProceduralPlayer(tier, rng);
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/draft-shop.test.mjs`
Expected: 4개 테스트(기존 2개 + 신규 2개) 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add data/draft-shop.mjs tests/draft-shop.test.mjs
git commit -m "feat: 상점 카드 등급 분포를 리그별로 나눈다"
```

---

### Task 2: 게임이 실제 리그 등급을 상점에 넘기게 한다

**Files:**
- Modify: `ui/app.mjs` (5곳 - `generateShopOffer` 호출부 전부)

**Interfaces:**
- Consumes: Task 1의 `generateShopOffer(size, availableGods, rng, tierId)`
- Produces: 없음(호출부 갱신만)

- [ ] **Step 1: 호출부 5곳을 찾는다**

Run: `grep -n "generateShopOffer(" ui/app.mjs`
Expected 출력(라인 번호는 달라질 수 있음, 전부 아래 패턴):
```
currentState.shopOffer = generateShopOffer(scoutOfferSize(), currentState.availableGodPlayers);
```

- [ ] **Step 2: 5곳 전부 `currentState.leagueTierId`를 4번째 인자로 추가**

각 줄을 아래로 바꾼다(패턴 동일, `sed` 또는 에디터로 전체 치환):

```js
currentState.shopOffer = generateShopOffer(scoutOfferSize(), currentState.availableGodPlayers, Math.random, currentState.leagueTierId);
```

(주의: `rng` 자리를 비워둘 수 없으므로 기존 기본값과 같은 `Math.random`을 명시적으로 넘긴다.)

- [ ] **Step 3: 브라우저로 확인**

Run: `PORT=8130 node tools/dev-server.mjs &` 후 `http://localhost:8130/`에서 새 게임을 시작하고 "영입" 탭 매물을 확인한다. 5부에서 legendary(보라/빨강 테두리, OVR 88+) 카드가 거의 안 뜨는지 눈으로 확인한다(운이 나쁘면 몇 번 "다시 뽑기"를 눌러 재확인).

- [ ] **Step 4: 전체 테스트 통과 확인**

Run: `node --test tests/*.test.mjs`
Expected: 96 + Task 1에서 늘어난 2개 = 98개 PASS

- [ ] **Step 5: 커밋**

```bash
git add ui/app.mjs
git commit -m "feat: 상점 매물이 지금 뛰는 리그 등급을 반영한다"
```

---

### Task 3: 상점 카드에서 델타를 없애고 태그 진행도를 보여준다

**Files:**
- Modify: `ui/app.mjs` (offerHtml 블록과 renderChemistryPanel 블록, 공용 헬퍼 추가)
- Modify: `ui/style.css` (태그 진행도 배지 스타일)

**Interfaces:**
- Consumes: `ui/app.mjs`의 `lineup`(renderMarket 안에서 이미 계산됨), `boostedTagIdFor(manager)`(기존 함수), `PLAYSTYLE_TAGS`(engine/constants.mjs, 이미 import됨)
- Produces: `playstyleTagProgress(tagId, lineup, boostedTagId)` → `{ count, need, tier }` (Task 이후 다른 코드가 이 이름으로 재사용 가능)

- [ ] **Step 1: 공용 헬퍼 함수 추가**

`ui/app.mjs`에서 `function boostedTagIdFor(manager) {` 정의 바로 아래에 추가:

```js
// 플레이스타일 태그 진행도(고정 3명/5명 문턱, 전술 원리주의자면 1명 감면).
// 상점 카드와 전술 탭 팀 케미 패널이 똑같은 계산을 쓴다.
function playstyleTagProgress(tagId, lineup, boostedTagId) {
  const count = lineup.filter((p) => p.playstyleTags.includes(tagId)).length;
  const boost = tagId === boostedTagId ? 1 : 0;
  const req3 = 3 - boost;
  const req5 = 5 - boost;
  const tier = count >= req5 ? 2 : count >= req3 ? 1 : 0;
  const need = tier === 0 ? req3 : req5;
  return { count, need, tier };
}
```

- [ ] **Step 2: `renderChemistryPanel`이 이 헬퍼를 쓰도록 정리**

`renderChemistryPanel` 안의 `playstyleRows` 계산에서 아래 블록을 찾는다:

```js
      const count = lineup.filter((p) => p.playstyleTags.includes(tagId)).length;
      const boost = tagId === boostedTagId ? 1 : 0;
      const req3 = 3 - boost;
      const req5 = 5 - boost;
      const tier = count >= req5 ? 2 : count >= req3 ? 1 : 0;
      const need = tier === 0 ? req3 : req5;
```

아래 한 줄로 바꾼다(중복 계산 제거):

```js
      const { count, need, tier } = playstyleTagProgress(tagId, lineup, boostedTagId);
```

- [ ] **Step 3: offerHtml에서 델타를 없애고 태그 진행도를 붙인다**

`const offerHtml = shopOffer.map((c) => {` 블록에서 아래 두 줄을 찾는다:

```js
    // 이 카드를 사면 베스트11 평균이 얼마나 오르는지. 살지 말지의 실제 근거
    const after = pickBestXI([...squad, toSquadPlayer(c)], formationId, manualOverrides);
    const gain = after.lineup.reduce((t, p) => t + p.baseOVR, 0) / after.lineup.length - baseAvg;
    const tags = [
      ...c.playstyleTags.map((t) => `<span class="tag">${TAG_LABELS[t] ?? t}</span>`),
      c.specialTrait ? `<span class="tag tag--trait">${TRAIT_LABELS[c.specialTrait] ?? c.specialTrait}</span>` : '',
    ].join('');
```

아래로 바꾼다:

```js
    // 정답(팀 +X.X 델타)은 안 주고 재료만 준다 - 태그 옆에 지금 라인업이
    // 몇 명째인지만 보여주고, "그래서 사야 하는지"는 유저가 판단한다.
    const boostedTagId = boostedTagIdFor(manager);
    const tags = [
      ...c.playstyleTags.map((t) => {
        const { count, need } = playstyleTagProgress(t, lineup, boostedTagId);
        return `<span class="tag">${TAG_LABELS[t] ?? t} <b class="tag__progress">${count}/${need}</b></span>`;
      }),
      c.specialTrait ? `<span class="tag tag--trait">${TRAIT_LABELS[c.specialTrait] ?? c.specialTrait}</span>` : '',
    ].join('');
```

같은 블록의 렌더링 부분에서 아래 줄을 찾는다:

```js
          <span class="offer__delta ${gain >= 0.05 ? 'is-up' : 'is-flat'}">${gain >= 0.05 ? `팀 +${gain.toFixed(1)}` : '전력 변화 없음'}</span>
```

이 줄을 통째로 삭제한다(그 줄만, 앞뒤 `<span class="offer__ovr...">`와 `<span class="offer__price...">`는 그대로 둔다).

- [ ] **Step 4: 이제 안 쓰는 `baseAvg` 변수 정리 확인**

Run: `grep -n "baseAvg" ui/app.mjs`

`baseAvg`가 offerHtml 블록 삭제 후에도 다른 곳(예: `groupAvg`, 파워스트립 계산)에서 쓰이면 그대로 둔다. offerHtml에서만 쓰였다면 `const baseAvg = lineup.reduce(...)` 선언 줄도 삭제한다(죽은 코드 남기지 않기).

- [ ] **Step 5: CSS에 태그 진행도 배지 스타일 추가**

`ui/style.css`에서 `.tag {` 규칙을 찾아 그 바로 아래에 추가:

```css
.tag__progress { font-style: normal; margin-left: 3px; opacity: 0.75; }
```

- [ ] **Step 6: 브라우저로 확인**

Run: `PORT=8130 node tools/dev-server.mjs &`, `http://localhost:8130/`에서 새 게임 시작 → 영입 탭에서 카드에 "팀 +X.X" 문구가 사라지고 태그 옆에 "N/3" 같은 숫자가 붙는지 확인.

- [ ] **Step 7: 전체 테스트 통과 확인**

Run: `node --test tests/*.test.mjs`
Expected: 전부 PASS (이 태스크는 UI 렌더링만 바꾸므로 새 테스트 불필요 - 기존 스냅샷/유닛 테스트가 이 부분을 검증하지 않음을 확인했다)

- [ ] **Step 8: 커밋**

```bash
git add ui/app.mjs ui/style.css
git commit -m "feat: 상점 카드 델타를 없애고 태그 진행도로 대체한다"
```

---

### Task 4: 튜닝 시뮬레이터를 현재 게임 상태로 갱신

**Files:**
- Modify: `tools/tune-ladder.mjs`

**Interfaces:**
- Consumes: `data/generate-player.mjs`의 `generateStartingSquad(rng)`(이미 존재, 20명 포지션 최소치 보장), Task 1의 `generateShopOffer(size, availableGods, rng, tierId)`
- Produces: 없음(이 파일은 수동 실행 도구, 다른 코드가 import하지 않음)

- [ ] **Step 1: import 갱신**

`tools/tune-ladder.mjs` 맨 위:

```js
import { generateSquadPool, TIER5_SQUAD_WEIGHTS } from '../data/generate-player.mjs';
```

를

```js
import { generateStartingSquad } from '../data/generate-player.mjs';
```

로 바꾼다.

- [ ] **Step 2: 스쿼드 생성 호출 갱신**

`playSeason` 함수 안에서:

```js
  let squad = carried ? carried.squad : generateSquadPool(TIER5_SQUAD_WEIGHTS).map(toSquad);
```

를

```js
  let squad = carried ? carried.squad : generateStartingSquad().map(toSquad);
```

로 바꾼다.

- [ ] **Step 3: 상점 호출에 tierId 전달**

같은 함수 안에서:

```js
      for (const card of generateShopOffer(SHOP_OFFER_SIZE).sort((a, b) => b.baseOVR - a.baseOVR)) {
```

를

```js
      for (const card of generateShopOffer(SHOP_OFFER_SIZE, [], Math.random, tierId).sort((a, b) => b.baseOVR - a.baseOVR)) {
```

로 바꾼다.

- [ ] **Step 4: 실행해서 새 기준선 확인**

Run: `node tools/tune-ladder.mjs 1500`
Expected: 에러 없이 리그별 우승/승격/안전/강등 비율 표가 출력된다. 숫자를 기록해둔다(이게 "20명 스쿼드 + 리그별 상점"을 반영한 첫 실측치).

- [ ] **Step 5: 커밋**

```bash
git add tools/tune-ladder.mjs
git commit -m "chore: 튜닝 시뮬레이터가 20명 스쿼드와 리그별 상점 분포를 반영한다"
```

---

### Task 5: 밸런스 재튜닝

**Files:**
- Modify: `data/draft-shop.mjs` (`SHOP_TIER_WEIGHTS_BY_TIER` 숫자만)
- Modify: `engine/league.mjs` (필요시 `LEAGUE_TIERS`의 `safePoints`/`targetPoints`/`championPoints`)

**Interfaces:**
- Consumes: Task 4로 갱신된 `tools/tune-ladder.mjs`
- Produces: 없음(수치 조정 + 문서화)

- [ ] **Step 1: 목표 수치 확인**

`engine/league.mjs`의 `LEAGUE_TIERS` 각 항목 위 주석에 적힌 기존 실측 목표(예: 5부 "우승 22.3% / 승격 28.1% / 안전 47.1% / 강등 2.6%")를 읽고 적어둔다. 스쿼드가 60→20명으로 바뀌었으니 완전히 같은 숫자를 유지하는 게 목표가 아니라, 방향(리그가 오를수록 강등률이 오르고 우승률이 내려가는 순서)이 안 깨지는 것이 목표다.

- [ ] **Step 2: 실측 → 조정 → 재실측 반복**

Run: `node tools/tune-ladder.mjs 2000`

Task 4 Step 4에서 본 수치와 `engine/league.mjs` 목표를 비교한다.
- 특정 리그의 강등률이 목표보다 훨씬 높으면(예: 두 배 이상) → 그 리그의 `SHOP_TIER_WEIGHTS_BY_TIER[tierId]`에서 상위 등급(topClass 이상) 비중을 조금 올린다.
- 특정 리그의 우승률이 목표보다 훨씬 높으면 → 반대로 낮춘다.
- 한 번에 한 리그, 한 등급 항목만 ±5 조정하고 다시 `node tools/tune-ladder.mjs 2000`을 돌린다.
- 5부 강등률이 지나치게 낮게(≈0%) 나오면 스쿼드 축소로 인한 baseOVR 하락(60.19→57.48, 이전 세션에서 실측함)이 상점 분포보다 리그 기준선(`LEAGUE_TIERS.tier5.safePoints`)에 더 큰 영향을 준다는 뜻이다 - 이 경우 상점 분포 대신 `LEAGUE_TIERS`의 해당 리그 `safePoints`/`targetPoints`/`championPoints`를 2~3점 낮춰서 맞춘다.
- 리그 순서(5부→1부로 갈수록 강등률 상승, 우승률 하락)가 깨지지 않는 선에서 3~5회 반복 후 마무리한다. 완벽히 일치시키는 게 목표가 아니다.

- [ ] **Step 3: 최종 실측치를 주석으로 남긴다**

`data/draft-shop.mjs`의 `SHOP_TIER_WEIGHTS_BY_TIER` 위 주석에, 그리고 `engine/league.mjs`를 조정했다면 해당 `LEAGUE_TIERS` 항목 위 주석에 기존 스타일대로 최종 실측치를 남긴다:

```js
// 2000판 재실측(20명 스쿼드 + 리그별 상점 분포 반영): 우승 XX.X% / 승격 XX.X% / 안전 XX.X% / 강등 XX.X%
```

(빈칸은 Step 2에서 실제로 나온 숫자로 채운다.)

- [ ] **Step 4: 전체 테스트 통과 확인**

Run: `node --test tests/*.test.mjs`
Expected: 전부 PASS (밸런스 수치 조정은 `judgeSeasonResult` 임계값 자체를 바꾸지 않으므로 `tests/season.test.mjs`의 고정 숫자 테스트에 영향 없음 - 영향 있으면 그 테스트의 기대값도 함께 갱신한다)

- [ ] **Step 5: 커밋**

```bash
git add data/draft-shop.mjs engine/league.mjs
git commit -m "chore: 상점 등급 분포와 리그 기준선을 20명 스쿼드 기준으로 재튜닝"
```

---

## Self-Review Notes

- **Spec coverage:** A(델타 제거+태그 진행도)=Task 3, B(리그별 분포)=Task 1+2, C(재튜닝, 20명 스쿼드 반영 포함)=Task 4+5. 스펙의 5개 섹션 전부 태스크로 매핑됨.
- **Placeholder scan:** Task 5의 최종 주석 문구에 "XX.X%"가 있으나 이는 실행 전에는 알 수 없는 실측값 자리이지 미완성 지시가 아니다 - Step 2/4에서 실제 실행해 채우도록 명시함.
- **Type/signature consistency:** `generateShopOffer(size, availableGods, rng, tierId)` 순서가 Task 1(정의) · Task 2(호출부) · Task 4(툴 호출부)에서 동일하게 유지됨. `playstyleTagProgress` 반환 형태를 Task 3 Step 1/2에서 `{count, need, tier}`로 통일하도록 명시함(Step 2에 대안 대신 권장안을 명확히 표시).
