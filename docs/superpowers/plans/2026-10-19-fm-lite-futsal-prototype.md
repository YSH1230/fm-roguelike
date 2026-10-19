# FM-Lite 풋살 시연판 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5 대 5 풋살 한 경기를 처음부터 끝까지 직접 플레이할 수 있는 프로토타입(입력, 시계, 데드볼, 체력과 교체, 하프타임, 팀 AI, 통째 시뮬)을 `next/proto`에 새로 만든다.

**Architecture:** DOM 없는 순수 상태 머신 `futsalSim.mjs`(미터 단위, 시드 RNG, `update(dt, input)`)와 팀 AI `futsalAI.mjs`, 모든 수치를 가진 `futsalRules.mjs`(TUNE), 입력 해석 `futsalInput.mjs`(순수 함수)로 나누고, 렌더링과 포인터 연결만 `futsal.mjs`/`futsal.html`이 맡는다. 헤드리스 봇이 상태 머신만 돌려 합격 기준을 숫자로 확인한다. 기존 `highlight.mjs`, `attack.mjs`, `rules.mjs`는 건드리지 않는다.

**Tech Stack:** 순수 ES 모듈(`.mjs`), `node --test`, 캔버스 2D, 기존 시드 RNG(`next/engine/rng.mjs`의 `createRng`, `gauss`, `weightedPick`), 빌드 없음.

**Spec:** `docs/superpowers/specs/` 아래가 아니라 사용자 제공 문서 `2026-10-19-fm-lite-futsal-design-v6.3.md`(규칙), `claude-code-futsal-prototype-1.md`(지시문). 두 문서를 이 저장소 `docs/superpowers/specs/`에 복사해 두고 시작한다(Task 0).

## Global Constraints

- 코트 **40m × 20m**, 전체 코트를 한 화면에 고정, 카메라 이동과 줌과 슬로우 모션 없음. 화면은 가로 16:9 고정(긴 기기는 양옆 띠).
- 선수 그림은 실제 비율(키 1.8m)의 **1.2배**. 선수 10명.
- 풋살 **20분 × 2 하프**를 **8배 압축**(실제 약 5분, 하프 150초), **공이 코트 밖이면 시계 정지**. 파울과 퇴장 없음.
- 입력 임계값: 탭 12px/250ms, 플릭 28px/0.5px/ms, 조이스틱 반경 44px, 데드존 10px, 입력 버퍼 150ms, 이동 손가락 1개. 화면에 조이스틱을 그리지 않는다.
- 열림 링: `tau = 0.5 * (체력/20) * 잔량비`, 색 기준 (길 2.2m, 동료 2.4m) 이상 초록 / (1.2m, 1.4m) 이상 노랑 / 그 외 빨강.
- 체력 소모: 5분 풀 출전 `55% - 1.5% * 체력`. 유효 속도 `속도 * (0.7 + 0.3 * 잔량비)`. 골키퍼 반응 지연 `지연 * (1 + 0.4 * (1 - 잔량비))`. 교체 팝업은 잔량 25% 이하, 3초.
- 데드볼(킥인, 코너, 골키퍼) 4초. 플라잉 골키퍼 버튼은 후반 마지막 4분(풋살 시간)에만 활성, 빈 골문 슛 골 확률 85%.
- 능력 눈금 0~20, 필드 5개(속도, 체력, 힘, 기술, 슈팅), 골키퍼 5개(속도, 체력, 힘, 반응, 핸들링).
- 모든 수치는 `futsalRules.mjs`의 `TUNE` 한 곳에서만 정의. 시뮬레이션에는 DOM, `Math.random`, `performance.now`를 쓰지 않는다(시드 RNG와 입력으로 받은 `dt`만).
- 화면의 글자는 스코어, 시계, 하프 표시, 버튼 3개(일시정지, 플라잉 골키퍼, SIM)뿐이다(메뉴와 결과 화면은 예외).

## Review Focus

1. **정지 시계 누락**: 킥인, 코너, 골키퍼 4초, 득점 직후 킥오프 대기 중에 시계가 흐르면 한 경기가 5분을 넘는다. 데드볼 중 시계가 0으로 흐르는지 테스트(Task 2, 6).
2. **조이스틱 중 탭 씹힘**: 이동 손가락이 눌린 채 왼쪽 반을 탭, 패스 비행 중 입력, pointercancel 직후 입력이 버려지지 않아야 한다(Task 3).
3. **조작 선수 전환 깜빡임**: 수비 때 공에 가장 가까운 선수가 두 명 사이에서 번갈아 바뀌면 조종이 튄다. 히스테리시스(0.8m) 필요(Task 4).
4. **골키퍼 없는 팀(플라잉 골키퍼 후 공 잃음)**: 빈 골문 슛 85%와 골키퍼 복귀 처리, 5 대 4 중 데드볼(Task 8).
5. **교체 대상 없음**: 벤치에 컨디션이 좋은 선수가 없거나 골키퍼 벤치가 없을 때 팝업이 뜨지 않거나 안전하게 무시되어야 한다(Task 6).

---

## File Structure

| 파일 | 책임 |
|---|---|
| `next/proto/futsalRules.mjs` | TUNE과 능력-효과 함수(속도, 체력 소모, 링 tau, 정교함, 반응 지연). 순수 |
| `next/proto/futsalSim.mjs` | 코트, 선수, 공, 시계, 단계(play/deadball/halftime/end), 액션 처리, 득점. 순수 |
| `next/proto/futsalAI.mjs` | 팀 스타일, 특기, 정교함 기반 행동. `think(sim, team, dt)`가 선수별 목표 위치와 행동을 정한다 |
| `next/proto/futsalInput.mjs` | 포인터 이벤트 → 이동 벡터/행동(탭, 끌기, 플릭, 개인기) 변환. 순수 |
| `next/proto/futsalMatch.mjs` | 선발과 성향, 통째 시뮬, MVP, 결과 계산(경기 단위 보조 로직) |
| `next/proto/futsal.html`, `futsal.mjs` | 캔버스, HUD, 포인터 연결, 메뉴(선발, 하프타임, 결과) |
| `next/tests/futsal*.test.mjs`, `futsalBot.mjs` | 헤드리스 테스트와 봇 |

---

### Task 0: 문서 복사와 뼈대

**Files:**
- Create: `docs/superpowers/specs/2026-10-19-fm-lite-futsal-design-v6.3.md`, `docs/superpowers/specs/claude-code-futsal-prototype-1.md` (사용자 파일을 그대로 복사)
- Create: `next/proto/futsalRules.mjs`(빈 `TUNE` 객체만), `next/tests/futsal.test.mjs`(스모크 1개)

- [ ] **Step 1:** 사용자 문서 두 개를 복사하고, 같은 폴더의 미추적 `next/proto/_mid4.mjs`(이전 작업의 임시 파일)는 건드리지 않고 `.gitignore` 대상으로 남긴다.
- [ ] **Step 2:** 스모크 테스트로 모듈이 불러와지는지 확인한다.

```js
// next/tests/futsal.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { TUNE } from '../proto/futsalRules.mjs';
test('TUNE 로드', () => { assert.equal(typeof TUNE, 'object'); });
```

Run: `node --test next/tests/futsal.test.mjs` → PASS
- [ ] **Step 3: Commit** `git add docs next/proto/futsalRules.mjs next/tests/futsal.test.mjs && git commit -m "chore: 풋살 v6.3 문서와 뼈대"`

---

### Task 1: 규칙 수치와 능력 함수 (`futsalRules.mjs`)

**Files:** Modify `next/proto/futsalRules.mjs`; Test `next/tests/futsal.test.mjs`

**Interfaces — Produces:**
`TUNE`, `speedOf(ability)`, `effSpeed(ability, ratio)`, `drainPerSecond(stamina)`, `ringTau(stamina, ratio)`, `ringColor(laneDist, mateDist)`, `gkDelay(reaction, ratio)`, `sophistication(avgSkill, coachLevel)`, `clockOf(realSeconds)`

- [ ] **Step 1: 실패하는 테스트**

```js
import { TUNE, speedOf, effSpeed, drainPerSecond, ringTau, ringColor, gkDelay, sophistication } from '../proto/futsalRules.mjs';
test('달리기 속도: 능력 20이 최대 8m/s, 잔량이 줄면 최대 30% 감소', () => {
  assert.equal(speedOf(20), 8);
  assert.ok(speedOf(0) < speedOf(20));
  assert.ok(Math.abs(effSpeed(20, 0) - 8 * 0.7) < 1e-9);
  assert.equal(effSpeed(20, 1), 8);
});
test('체력 소모: 5분 풀 출전 55% - 1.5% x 체력', () => {
  const total = (s) => drainPerSecond(s) * TUNE.realMatchSeconds;
  assert.ok(Math.abs(total(12) - 0.37) < 1e-9);
  assert.ok(total(20) < total(0));
});
test('열림 링 tau와 색', () => {
  assert.equal(ringTau(20, 1), 0.5);
  assert.equal(ringTau(0, 1), 0);
  assert.equal(ringColor(2.3, 2.5), 'green');
  assert.equal(ringColor(1.3, 1.5), 'yellow');
  assert.equal(ringColor(1.0, 5), 'red');
});
test('골키퍼 반응 지연과 정교함', () => {
  assert.ok(Math.abs(gkDelay(1, 0) - 1.4) < 1e-9);
  assert.equal(sophistication(20, 3), 20);
  assert.ok(Math.abs(sophistication(10, 1) - (10 * 0.7 + 2.2)) < 1e-9);
});
```

- [ ] **Step 2:** Run `node --test next/tests/futsal.test.mjs` → FAIL (함수 없음)
- [ ] **Step 3: 구현**

```js
// next/proto/futsalRules.mjs
export const TUNE = {
  court: { w: 40, h: 20, goalW: 3, penaltyR: 6 },
  realMatchSeconds: 300, halfRealSeconds: 150, clockScale: 8, // 풋살 40분 = 실제 300초
  maxRunSpeed: 8, minRunSpeed: 6, // speedOf(0)=6, speedOf(20)=8
  passSpeed: 14, shotSpeed: 22, deadBallSeconds: 4,
  drainBase: 0.55, drainPerStamina: 0.015, speedFloor: 0.7, gkDelayGrow: 0.4,
  ringTauMax: 0.5, ring: { green: [2.2, 2.4], yellow: [1.2, 1.4] },
  subThreshold: 0.25, subPopupSeconds: 3,
  input: { tapMove: 12, tapMs: 250, flickPx: 28, flickSpeed: 0.5, joyRadius: 44, deadzone: 10, buffer: 150, flipThreshold: 0.6, flipMs: 180, leftTapMove: 10 },
  flyingGk: { lastClockSeconds: 240, emptyNetGoal: 0.85 },
  sophistication: { skillMul: 0.7, coachMul: 2.2, max: 20, rotationMin: 16 },
  expectedGoals: 2.5,
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const speedOf = (a) => TUNE.minRunSpeed + (TUNE.maxRunSpeed - TUNE.minRunSpeed) * clamp(a, 0, 20) / 20;
export const effSpeed = (a, ratio) => speedOf(a) * (TUNE.speedFloor + (1 - TUNE.speedFloor) * clamp(ratio, 0, 1));
export const drainPerSecond = (stamina) => (TUNE.drainBase - TUNE.drainPerStamina * clamp(stamina, 0, 20)) / TUNE.realMatchSeconds;
export const ringTau = (stamina, ratio) => TUNE.ringTauMax * (clamp(stamina, 0, 20) / 20) * clamp(ratio, 0, 1);
export function ringColor(laneDist, mateDist) {
  const { green, yellow } = TUNE.ring;
  if (laneDist >= green[0] && mateDist >= green[1]) return 'green';
  if (laneDist >= yellow[0] && mateDist >= yellow[1]) return 'yellow';
  return 'red';
}
export const gkDelay = (base, ratio) => base * (1 + TUNE.gkDelayGrow * (1 - clamp(ratio, 0, 1)));
export const sophistication = (avgSkill, coach) => Math.min(TUNE.sophistication.max, avgSkill * TUNE.sophistication.skillMul + clamp(coach, 0, 3) * TUNE.sophistication.coachMul);
export const clockOf = (realSeconds) => realSeconds * TUNE.clockScale; // 풋살 시계(초)
```

- [ ] **Step 4:** 테스트 PASS 확인 → **Step 5: Commit** `feat: 풋살 규칙 수치와 능력 함수`

---

### Task 2: 시뮬 핵심(코트, 공, 시계, 득점) (`futsalSim.mjs`)

**Files:** Create `next/proto/futsalSim.mjs`; Test `next/tests/futsalSim.test.mjs`

**Interfaces — Produces:**
`createMatch({ seed, home, away, stance })` → `M`. `home`/`away`는 `{ name, players: [{id,name,gk,abilities:{speed,stamina,strength,skill,shooting}|{...reaction,handling}, condition}], slots }`.
`M` 필드: `t`(실제 초), `clock`(풋살 초), `half`(1|2), `phase`('play'|'deadball'|'halftime'|'end'), `score:[h,a]`, `ball:{x,y,vx,vy,owner}`, `players[10]`(`{id,team,slot,x,y,vx,vy,stamina,ratio,control}`), `events[]`.
`update(M, dt, input)` — `input = { move:{x,y}|null, actions:[] }`. 좌표 단위는 m, 홈은 왼쪽 골대(x=0) 수비, 오른쪽(x=40) 공격.

- [ ] **Step 1: 실패하는 테스트**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, update } from '../proto/futsalSim.mjs';
import { TUNE } from '../proto/futsalRules.mjs';
import { demoTeams } from './futsalBot.mjs';

const idle = { move: null, actions: [] };
test('아무도 건드리지 않아도 한 경기가 끝나고 실제 길이는 5분 ± 15초', () => {
  const M = createMatch({ seed: 1, ...demoTeams() });
  let n = 0;
  while (M.phase !== 'end' && n < 60 * 400) { update(M, 1 / 60, idle); n += 1; }
  assert.equal(M.phase, 'end');
  assert.ok(Math.abs(M.t - TUNE.realMatchSeconds) <= 15 + 4 * 6, `실제 ${M.t}`); // 하프타임 대기는 t에 넣지 않는다
});
test('공이 코트 밖에 있는 동안 시계는 멈춘다', () => {
  const M = createMatch({ seed: 2, ...demoTeams() });
  M.ball.x = -2; M.ball.y = 5; M.ball.vx = 0; M.ball.vy = 0; M.ball.owner = null;
  update(M, 1 / 60, idle);
  assert.equal(M.phase, 'deadball');
  const c = M.clock; for (let i = 0; i < 120; i += 1) update(M, 1 / 60, idle);
  assert.equal(M.clock, c);
});
test('골대 안으로 들어가면 득점하고 실점한 팀이 센터 킥오프', () => {
  const M = createMatch({ seed: 3, ...demoTeams() });
  M.ball.x = 39.9; M.ball.y = 10; M.ball.vx = 10; M.ball.vy = 0; M.ball.owner = null;
  update(M, 0.1, idle);
  assert.deepEqual(M.score, [1, 0]);
  assert.equal(M.restart.kind, 'kickoff'); assert.equal(M.restart.team, 1);
});
```

- [ ] **Step 2:** `node --test next/tests/futsalSim.test.mjs` → FAIL (모듈 없음). `futsalBot.mjs`의 `demoTeams()`도 같이 만든다(능력 12 평균 8명 팀 두 개, 골키퍼 1명 포함, 시드로 이름만 다르게).
- [ ] **Step 3: 구현** — 순서대로 작은 함수로 쪼갠다:
  1. `createMatch`: 홈 4명(성향 균형 1-2-1 슬롯 위치) + 골키퍼, 원정 대칭. `createRng(seed)` 사용. 킥오프 위치로 배치, 공 소유자는 킥오프 팀의 피보.
  2. `stepBall(M, dt)`: 소유자가 있으면 소유자 앞(0.5m)에 붙고, 없으면 `vx, vy`로 이동하며 마찰 `v *= exp(-0.6 dt)`.
  3. `checkBounds(M)`: `x<0`이고 `|y-10|<goalW/2`이면 원정 득점(반대편 대칭), 득점이면 `events.push({kind:'goal'})`, `restart = { kind:'kickoff', team: 실점팀 }`, `phase='deadball'`. 그 외 코트 밖이면 `restart = { kind:'kickin' | 'corner' | 'goalkeeper', team, x, y }`, `phase='deadball'`, `deadTimer = TUNE.deadBallSeconds`.
  4. `stepClock(M, dt)`: `phase==='play'`일 때만 `M.clock += dt * TUNE.clockScale`, `M.t += dt`. 한 하프가 `20*60`초 풋살 시계에 닿으면 `phase='halftime'`(전반) 또는 `'end'`(후반).
  5. `update`: `phase==='deadball'`이면 `deadTimer`를 줄이고(시계는 안 흐름), 0이 되면 자동 재개(Task 6에서 사람이 고르는 입력과 연결). `play`일 때 `stepBall → checkBounds → stepClock`.
  테스트 숫자: 하프 150초×2=300초. 위 테스트의 허용 오차는 데드볼 대기를 `t`에 넣지 않으므로 15초로 충분하다(구현 후 숫자를 보고 4*6 여유를 15로 좁힌다).
- [ ] **Step 4:** PASS → **Step 5: Commit** `feat: 풋살 시뮬 핵심(코트, 공, 정지 시계, 득점)`

---

### Task 3: 입력 해석 (`futsalInput.mjs`)

**Files:** Create `next/proto/futsalInput.mjs`; Test `next/tests/futsalInput.test.mjs`

**Interfaces — Produces:** `createInput(viewW)` → `inp` with `inp.down(id, x, y, t)`, `inp.move(id, x, y, t)`, `inp.up(id, x, y, t)`, `inp.cancel(id)`, `inp.poll(nowMs)` → `{ move: {x,y}|null, actions: [{type:'tap'|'drag'|'flick'|'dribble'|'tackleOrPass', x,y,dx,dy,at}] }`, `classify({m,ms,dx,dy})` → `'tap'|'flick'|'drag'`.

- [ ] **Step 1: 실패하는 테스트** — 반드시 포함:

```js
test('이동 손가락이 눌린 채 왼쪽 반을 탭해도 패스 입력이 100% 실행된다', () => {
  const inp = createInput(640);
  inp.down(1, 100, 200, 0); inp.move(1, 130, 200, 30); // 조이스틱 시작
  for (let i = 0; i < 100; i += 1) {
    inp.down(2, 80 + i % 20, 150, 100 + i * 400); inp.up(2, 80 + i % 20, 150, 100 + i * 400 + 90);
  }
  const acts = inp.poll(100 + 100 * 400 + 200).actions.filter((a) => a.type === 'tap');
  assert.equal(acts.length, 100);
});
test('pointercancel은 이동만 멈추고 행동은 남는다', () => { /* down(1), tap(2) 직후 cancel(1) → move null, actions 1개 */ });
test('이동 손가락이 없을 때 왼쪽 반의 짧은 탭(10px, 250ms)은 행동 탭, 데드존 안은 이동하지 않는다', () => { /* ... */ });
test('조이스틱 튕기기: 180ms 안에 한 방향 0.6 이상에서 반대 0.6 이상이면 dribble 1회', () => { /* ... */ });
test('합성 제스처 1000개의 탭/플릭/끌기 오분류 5% 이하', () => { /* gauss 노이즈 */ });
test('입력 버퍼: 막혀 있는 동안 들어온 행동은 150ms 안에 소비되면 실행, 넘으면 폐기', () => { /* ... */ });
```
(각 `/* ... */` 자리는 구현자가 위 첫 테스트와 같은 형식으로 채운다. 입력값과 기대값은 문서 3.2절 숫자 그대로.)

- [ ] **Step 2:** FAIL 확인 → **Step 3: 구현**: 포인터를 `Map<id, {role:'move'|'action', x0,y0,t0, ...}>`로 추적. 규칙: 왼쪽 반에서 처음 눌린 손가락이 이동 전용(1개), 이동 손가락이 있는 동안 다른 손가락은 전부 행동. 이동 손가락이 없을 때 왼쪽 반 누름은 "후보"로 두고, 10px 넘게 움직이면 이동으로 승격, 250ms 안에 10px 이내로 떼면 행동 탭. 행동 손가락은 `classify`로 탭/플릭/끌기 판정(탭 판정은 up 이벤트 즉시, 지연 없음). `poll`은 대기 중 행동을 내보내되 `blocked` 플래그가 켜진 동안은 150ms까지 보관한다.
- [ ] **Step 4:** PASS → **Step 5: Commit** `feat: 풋살 입력 해석(조이스틱, 행동 분류, 버퍼)`

---

### Task 4: 조종 선수와 액션(이동, 패스, 슛, 태클, 개인기, 선방)

**Files:** Modify `futsalSim.mjs`; Test `futsalSim.test.mjs`

**Interfaces — Consumes:** Task 3 `poll()` 결과를 `update(M, dt, input)`에 그대로 넘긴다. **Produces:** `M.control`(조종 선수 id), 이벤트 `pass`, `shot`, `save`, `post`, `miss`, `tackle`, `dribble`.

- [ ] **Step 1: 실패하는 테스트**
  - 조이스틱 이동 벡터 `{x:1,y:0}`을 1초 주면 조종 선수가 `effSpeed` 근처(±10%)로 이동한다.
  - `{type:'tap', x, y}`는 손가락 위치에서 가장 가까운 동료에게 발밑 패스: 공 `owner`가 비행 후 그 동료로 바뀌고 `M.control`도 그 동료로 넘어간다.
  - 수비 때(상대가 공 소유) 가장 가까운 수비수가 조종되고, 가까운 선수가 바뀌어도 **0.8m 히스테리시스**를 넘어야 전환한다(깜빡임 방지).
  - 플릭 각도 -30°/0°/+30° 근방이 위/중앙/아래 구석(`y = 8.6, 10, 11.4`)으로 나간다. 슈팅 능력 20은 0일 때보다 같은 조건 1000회에서 골 비율이 높고, 거리가 멀수록 낮다.
  - 접촉 경합: 개인기 상태(`dribbleUntil`)면 `기술+속도` 합산, 아니면 `힘+태클(힘 사용)`으로 자동 판정(시드 고정으로 결정적).
  - 골키퍼는 `gkDelay(반응, 잔량비)` 뒤 움직이고, `핸들링`이 높을수록 잡을 확률이 올라간다.
- [ ] **Step 2–4:** 구현(`applyAction(M, action)`, `contest(M, a, b)`, `shotOutcome(M, shooter, cornerY)`), 테스트 PASS.
- [ ] **Step 5: Commit** `feat: 풋살 조종과 액션`

---

### Task 5: 시연판 1-a 화면과 기본 압박 AI (`futsal.html`, `futsal.mjs`, `futsalAI.mjs` 첫 판)

**Files:** Create `next/proto/futsal.html`, `futsal.mjs`, `futsalAI.mjs`; Test `next/tests/futsalAI.test.mjs`

- [ ] **Step 1: 실패하는 테스트** — 기본 AI(압박 1명, 나머지 마킹, 지원 삼각형 위치: 알라 둘 소유자 기준 위아래 5.5m/앞 3m, 픽소 뒤 5m 중앙)가 있을 때 **공이 움직이는 동안 3초 이상 같은 자리에 선 AI 선수가 0명**이고, 무입력 봇이 있는 경기에서 어느 팀도 5분 안에 아무 일도 안 일어나지 않는다(슛 또는 가로채기 1회 이상).
- [ ] **Step 2–3:** `futsalAI.think(M, team, dt)`가 각 AI 선수의 목표 위치만 정하고 `futsalSim`이 이동을 적용한다. `futsal.mjs`: 캔버스 16:9 맞춤(`futsal.html`은 `highlight.html`의 `fit()`과 PWA 메타를 복사), 코트(흰 라인, 6m 사분원, 센터서클), 선수 1.2배 스프라이트(`highlight.mjs`의 `sprite` 규칙을 참고해 새로 작성), HUD(스코어, 시계, 하프, 일시정지, 플라잉 골키퍼 버튼 자리, SIM 길게 누르기 0.6초), 포인터를 `createInput`에 연결(조이스틱은 그리지 않음).
- [ ] **Step 4:** 브라우저로 한 판 확인(스크린샷), 폰에서 `futsal.html?v=1` 주소로 열 수 있도록 캐시 버전 쿼리를 쓴다.
- [ ] **Step 5: Commit** `feat: 풋살 시연판 1-a(코트, 입력, 기본 AI)` — **여기서 멈추고 사용자가 폰에서 해 보고 느낌을 알려 준다.**

---

### Task 6: 시연판 1-b: 열림 링, 데드볼, 체력과 교체, 하프타임

**Files:** Modify `futsalSim.mjs`, `futsal.mjs`; Test `futsalSim.test.mjs`

- [ ] **Step 1: 실패하는 테스트**
  - 열림 링: 한 경기 봇 플레이 중 초록, 노랑, 빨강이 각각 전체 링 표시 시간의 10% 이상(`M.ringStats`).
  - 체력: 체력 12 선수가 5분 풀 출전하면 잔량 소모가 37% ± 5%, 체력 20은 12보다, 12는 0보다 덜 소모.
  - 교체: 잔량 25% 이하가 되면 `M.subPopup`이 3초 켜지고, 탭하면 벤치에서 컨디션이 가장 좋은 선수와 같은 슬롯으로 교체. 벤치 후보가 없거나 골키퍼 벤치가 없으면 팝업이 없고 오류도 없다.
  - 데드볼: 킥인/코너/골키퍼 상황에서 4초 안에 `{type:'tap'}` 1회로 받을 선수를 고르고, 4초가 지나면 가장 가까운 동료로 자동. 이 동안 `M.clock`이 변하지 않는다.
  - 하프타임: 전반이 끝나면 `phase='halftime'`, `applyHalftime(M, { stance })`로 성향을 한 번만 바꿀 수 있고(두 번째는 무시), 재개 시 후반 시작.
- [ ] **Step 2–4:** 구현과 PASS. 화면: 선수 머리 위 교체 팝업(3초), 하프타임 메뉴(성향 3택, 선발 점검), 열림 링(발밑 고리, 점선 없음).
- [ ] **Step 5: Commit** `feat: 풋살 시연판 1-b`

---

### Task 7: 팀 AI 고도화(정교함, 스타일 3개, 특기 4개, 난이도 점수)

**Files:** Modify `futsalAI.mjs`; Create `futsalTeam.mjs`(팀 생성: 스타일과 특기 뽑기); Test `futsalAI.test.mjs`

- [ ] **Step 1: 실패하는 테스트** (각각 40초 이상 시뮬 후 측정)
  - 정교함 0 팀의 침투 런 40초에 3회 이상. 정교함 20 대 0의 빈도비 2.5배 이상. 시작 지연 평균 0.3초 이상(0) / 0.05초 이하(20). 16 미만에서는 로테이션 이벤트 0.
  - 압박형 대 블록형 상대 평균 위치 차 3m 이상(공 소유 중).
  - 칼날 침투: 피보와 마지막 수비 거리 평균 0.8m 이하. 측면 오버랩: 알라와 터치라인 거리 평균 3.6m 이하. 압박 트랩: 공이 사이드에 있을 때 두 명 동시 압박 60% 이상. 높은 골키퍼: 공이 18m 앞일 때 골키퍼 위치 36.5m 이하.
  - 난이도 점수: 상대 모든 능력에 `+score`칸을 더한다(0~20으로 자름). 능숙한 봇의 평균 득점이 점수 +3 상대에게 0일 때보다 15% 이상 낮고 -2 상대에게 15% 이상 높다.
- [ ] **Step 2–4:** 구현: `futsalTeam.makeTeam(seed, abilities, coachLevel)`이 스타일 1개와 특기 2~3개를 시드로 뽑고, `futsalAI`는 `sophistication`으로 (a) 출발 지연 `(1 - s/20) * 0.6`초, (b) 목표 오차 `(1 - s/20) * 2.2`m, (c) 간격 흔들림을 적용한다. 특기는 목표 위치 규칙만 바꾼다(문구 없음).
- [ ] **Step 5: Commit** `feat: 풋살 팀 AI(정교함, 스타일, 특기)`

---

### Task 8: 플라잉 골키퍼와 AI 승부수

**Files:** Modify `futsalSim.mjs`, `futsalAI.mjs`, `futsal.mjs`; Test `futsalSim.test.mjs`

- [ ] **Step 1: 실패하는 테스트**
  - 버튼은 후반 풋살 시계 2160초(후반 마지막 4분 = 종료 4분 전, 전체 시계 2160~2400) **이전에는 비활성**, 구간 안에서만 활성(`M.flyingGkAvailable(team)`).
  - 켜면 골키퍼 슬롯에 필드 플레이어가 서고 5 대 4. 공을 잃고 상대가 골문으로 슛하면 골 확률 85%.
  - AI: 후반 종료 4분 전부터 1~2골 지고 있으면 사용률 70% 이상, 3골 이상 차이거나 이기고 있거나 동점이면 0%.
  - 위 구간에서 데드볼이 있어도 활성 상태가 유지되고, 득점 후에는 골키퍼가 복귀한다.
- [ ] **Step 2–4:** 구현. **Step 5: Commit** `feat: 풋살 플라잉 골키퍼`

---

### Task 9: 선발 화면, 통째 시뮬, MVP, 결과 (시연판 1-c 마무리)

**Files:** Create `futsalMatch.mjs`, extend `futsal.mjs`; Test `next/tests/futsalMatch.test.mjs`

- [ ] **Step 1: 실패하는 테스트**
  - `simulateWhole(home, away, seed)`: 1000경기 평균 팀당 2.5 ± 0.5골, 득점자는 슈팅 가중, 컨디션이 낮으면 기여 감소, 공격형 득실이 약 ×1.2 / 수비형 약 ×0.8.
  - `pickMvp(stats, winnerTeam, rng)`: 상위 3명 후보, 이긴 팀 가중 2배. 2000회 시 이긴 팀 MVP 비율이 진 팀보다 높고(약 2배 가중) 상대 팀 선수도 MVP가 된다. 점수표 골 3, 도움 2, 선방 1.5, 가로채기·태클 0.5(경기 상한 2).
  - 자동 선발 추천: 골키퍼 1명 보장, 성향별 슬롯 수(균형 1-2-1, 공격 1-1-2, 수비 2-1-1)가 맞다.
- [ ] **Step 2–4:** 구현과 화면(선발 화면: 성향, 슬롯 배치, 벤치, 통째 시뮬 버튼 / SIM 길게 누르기 0.6초로 남은 시간 시뮬 / 결과 화면은 점수, 득점자, MVP만).
- [ ] **Step 5: Commit** `feat: 풋살 선발, 통째 시뮬, MVP, 결과`

---

### Task 10: 합격 기준 측정과 보고

**Files:** Create `next/tests/futsalBot.mjs`(능숙/보통/무입력 봇), Modify tests

- [ ] **Step 1:** 봇 3종으로 지시문 3절 표의 항목을 모두 `futsal.test.mjs`에 넣고, 측정 스크립트 `node next/tests/futsalMeasure.mjs`로 표를 출력한다(`feel.test.mjs`의 측정 방식을 따름).
- [ ] **Step 2:** 한 경기 5분 ± 15초, 입력 지연 80ms 이하(입력 이벤트 → 같은 프레임 처리), 득점 규모 능숙한 봇 대 균형형 AI 팀당 2~4골을 확인하고 측정값을 사용자에게 표로 보고한다.
- [ ] **Step 3: Commit** `test: 풋살 합격 기준 측정`

---

## Self-Review

- **스펙 범위:** 지시문 A~I와 v6.1 8.5(난이도 점수, AI 플라잉 골키퍼) 항목은 Task 1~10에 대응한다. v6.3의 관리, 영입, 시즌(8장)과 성장(6.4~6.7), 컨디션 바(6.3)는 지시문이 "이번 범위 밖"으로 못박아 계획에서 제외했다.
- **보류한 것:** 스타일 4개(역습, 점유, 측면, 피보 중심)와 특기 4개(역습 폭발, 점유 순환, 중거리 포격, 승부수 특기의 5분 전 규칙)는 지시문의 "적어도 3개/4개" 기준을 넘는 구현이라 Task 7 이후로 미룬다.
- **타입 일관성:** `createMatch`, `update(M, dt, input)`, `createInput().poll()`의 `actions` 형태를 Task 2~9에서 동일하게 쓴다.

---

## 확정된 결정 (2026-10-19 논의)

1. **v5 하이라이트 작업은 접는다.** 풋살과 무관해서 필드 폭 780 패치는 하지 않는다. 하이라이트 v4(`highlight.mjs`, `attack.mjs`)는 보존만 한다.
2. **입력 분담**: 왼쪽 반 = 보이지 않는 조이스틱(이동)과 짧은 탭 패스. **오른쪽 반 = 행동(탭 패스, 끌어서 놓기 공간 패스, 쓸기 슛)**. 따라서 왼쪽 반의 쓸기는 이동으로 본다(모호함 없음). 이동 손가락이 눌려 있는 동안은 다른 손가락이 어디를 탭해도 행동으로 처리한다(씹힘 방지, 문서 3.2).
3. **슛 구석 고르기는 안 A**: 쓸기 방향의 세로 성분으로 위/가운데/아래 3구역(`dy < -0.35d` 위, `dy > 0.35d` 아래, 그 외 가운데). B(골대 탭), C(보정)는 폰 시연 뒤 필요하면 추가한다.
4. **추가시간(정규 시간 이후)**: 전반 **1~5분**, 후반 **3~10분**(풋살 시계, 정수 분 랜덤). 정규 20분이 끝나는 순간 길이가 정해지고 화면 시계에 `+n`으로 보인다. 플라잉 골키퍼는 **후반 추가시간에만** 켤 수 있고 AI도 같다(문서의 "마지막 4분" 규칙을 대체). 추가시간은 실제로 전반 7~38초, 후반 22~75초가 정규 시간에 더해진다.
5. 시계 압축(8배)과 달리기 속도는 직접 해 보고 정한다(수치는 `TUNE` 한 곳).
6. **프로토타입 먼저, 본 구현은 게이트 통과 후**: 아래 두 트랙을 각각 프로토타입으로 만들어 사용자가 확인하고 만족하면 본 구현(저장, 화면 완성도, 통합)에 들어간다.

## 두 트랙과 게이트

| 트랙 | 단계 | 범위 | 사용자가 확인할 것 |
|---|---|---|---|
| **P 풋살 플레이** | **P1** | 코트, 이동, 패스, 슛, 기본 AI, 정지 시계와 추가시간 | 이동 중 패스 탭이 씹히지 않는가 / 쓸기 슛이 편한가 / 달리기 속도 / 5분이 지루하지 않은가 |
| | P2 | 열림 링(예측), 데드볼 4초, 체력과 교체, 하프타임, 플라잉 골키퍼 | 링이 과하지 않은가 / 교체 팝업 / 추가시간 승부수의 긴장 |
| | P3 | 정교함, 스타일 3, 특기 4, 난이도 점수 | 팀마다 다르게 느껴지는가 / 난이도 체감 |
| **M 매니지먼트** | **M1** | 16팀 22경기 일정, 순위표, 플레이오프(통째 시뮬) | 한 시즌 흐름이 읽히는가 |
| | M2 | 선발 구성, XP와 천장과 레벨업, 컨디션 바 | 성장이 눈에 보이는가 |
| | M3 | 코인, 시설, 재계약, 드래프트, 스카우팅, FA, 상과 기록 | 코인이 모자라거나 남지 않는가 |
| **본 구현** | P3와 M3가 모두 통과한 뒤 | 두 트랙 통합, 저장, 디자인 시스템 적용 | |

P 트랙의 위 Task 0~10은 P1~P3와 본 구현 준비로 나뉜다: **P1 = Task 0~5**, **P2 = Task 6, 8**, **P3 = Task 7, 9, 10**.
