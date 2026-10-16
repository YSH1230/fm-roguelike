# FM-Lite 화면과 튜토리얼 구현 계획 (계획 8/8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 계획 7의 게임 흐름 위에 모바일 우선 화면을 얹어, 브라우저에서 새 게임부터 시즌, 오프시즌, 런 종료까지 끝까지 플레이할 수 있게 하고, 첫 판을 안내하는 단계별 팁(튜토리얼)을 넣는다.

**Architecture:** 화면은 `(game, ui) -> HTML 문자열` 순수 함수(`ui/screens.mjs`)라서 DOM 없이 node에서 테스트한다. `ui/app.mjs`가 `game.phase`와 `game.off.step`으로 화면을 고르고, `data-act` 속성과 이벤트 위임 하나로 모든 버튼을 처리하며, 동작 뒤마다 계획 7의 저장을 호출한다. 모든 사용자 입력 문자열(구단 이름)은 `esc`로 이스케이프한다. 초상화·문장·폰트는 기존 게임의 파일을 `next/ui/`로 복사해서 쓰고(원본은 그대로) 선수 이름·얼굴·팀 이름·유니폼 색은 모두 id만으로 정해진다.

**Tech Stack:** 순수 ES 모듈, 손으로 쓴 CSS(빌드·프레임워크 없음), Node 내장 테스트러너(화면 문자열 점검), 브라우저 직접 확인.

**Spec:** `docs/superpowers/specs/2026-10-16-fm-lite-next-design.md` (11절 화면 목록, 12절 기술 방침과 비주얼)

## Global Constraints

- 새 파일은 `next/` 아래에만 만든다. 기존 게임은 건드리지 않는다. 앞선 계획의 파일 중 고치는 것은 `next/engine/names.mjs`(대륙·팀 이름 추가)와 `next/engine/game.mjs`(`clubName` 두 줄)뿐이다.
- 비주얼은 기존 게임의 현재 톤(어두운 잔디색 배경, 카드·알약, 도트 초상화, 팀 문장)을 쓴다. 최대 너비 460px 한 열이고 하단 탭 4개(로스터·순위·프런트·기록실)와 하단 고정 진행 버튼이 기본 구성이다.
- 화면의 모든 문구는 한국어, em 대시 금지. 사용자 입력은 항상 `esc`를 거친다. 엔진에는 DOM을 쓰지 않고 `ui/` 안에서만 DOM을 쓴다.
- 접근성 기본: 모든 버튼은 `button`이고 터치 영역 36px 이상(주요 버튼 44px), 포커스 링, 별·바에 `aria-label`, 시트는 `role="dialog"`, `prefers-reduced-motion`을 따른다.
- 저장소가 막혀 있어도(비공개 창 등) 게임은 계속되어야 하므로 `localStorage` 접근은 모두 `try/catch`로 감싼다.
- 시각 확인은 개발 서버 `python3 -m http.server 8080`을 저장소 루트에서 띄우고 `http://localhost:8080/next/index.html`을 연다.

## Review Focus

1. **구단 이름에 태그나 따옴표**: 화면에서 글자로만 나오고 실행되지 않는다 (Task 1, 2).
2. **코인이 모자란 시설 업그레이드·코치 고용·면담 선택**: 버튼이 비활성이고 눌려도 오류 안내만 나온다 (Task 2, 3).
3. **스타 6명이 가득 찬 상태의 FA 영입과 신인 배치**: 안내 문구와 내보낼 스타 선택이 나온다 (Task 2, 3).
4. **저장소가 막힌 브라우저, 저장 파일 없음, 경질로 끝난 런의 저장**: 게임은 계속되고, 끝난 런은 저장이 지워져 이어하기에 나오지 않는다 (Task 3).
5. **화면 문자열에 `undefined` `NaN` `null`이 섞임, 팀 이름 중복**: 모든 화면에서 없어야 하고 200팀 이름이 모두 달라야 한다 (Task 1, 2).

---

### Task 1: 에셋 복사, 이름 확장, 화면 부품

**Files:**
- Copy: `ui/portrait.mjs` `ui/pixel.mjs` `ui/crest2.mjs` -> `next/ui/`, `ui/fonts/*` -> `next/ui/fonts/`, `data/clubs.mjs` -> `next/data/clubs.mjs`
- Modify: `next/engine/names.mjs`(전체 교체), `next/engine/game.mjs`(`clubName`)
- Create: `next/ui/components.mjs`
- Test: `next/tests/components.test.mjs`

**Interfaces:**
- Consumes: 계획 1~7 전체(`overall` `starsOf` `xpNeeded` `askingSalary` `ATTRIBUTES` 등)
- Produces: `continentOf(id)`, `nameOf(id)`, `teamIdentity(id) -> { name, kit, hue }`, `createGame({ seed, name, clubName })`, 부품 `esc` `starsHtml` `bar` `moodFace` `chip` `effectChips` `conditionTexts` `portrait` `teamName(game, id)` `crest(game, id, size)` `playerCard(p, { rest, action })` `prospectCard(p, { note, action })` `attrBars(p)` `askText(p)`, 상수 `POS_LABEL` `ATTR_LABEL` `AWARD_LABEL` `TIER_LABEL` `REASON_TEXT`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/components.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../engine/game.mjs';
import { teamIdentity } from '../engine/names.mjs';
import { conditionTexts, effectChips, esc, starsHtml } from '../ui/components.mjs';
import { startDraftScreen } from '../ui/screens.mjs';

const freshUi = (extra = {}) => ({ view: 'hub', tab: 'roster', rest: new Set(), tips: new Set(), flash: null, candidates: {}, last: null, ...extra });

test('팀 이름은 200팀이 모두 다르고 같은 id는 늘 같은 이름이다', () => {
  const names = new Set();
  for (let r = 0; r < 8; r += 1) for (let t = 1; t <= (r === 0 ? 3 : 1); t += 1) for (let i = 0; i < 20; i += 1) {
    const id = `R${r}T${t}-${String(i).padStart(2, '0')}`;
    names.add(teamIdentity(id).name);
    assert.equal(teamIdentity(id).name, teamIdentity(id).name);
  }
  assert.equal(names.size, 200);
});

test('문자 이스케이프: 구단 이름에 태그가 들어가도 그대로 글자로만 나온다', () => {
  assert.equal(esc('<img src=x onerror=1>"\''), '&lt;img src=x onerror=1&gt;&quot;&#39;');
  const g = createGame({ seed: 1, clubName: '<b>해킹</b>' });
  const html = startDraftScreen(g, freshUi());
  assert.ok(!html.includes('<b>해킹</b>'));
  assert.ok(html.includes('&lt;b&gt;해킹&lt;/b&gt;'));
});

test('별 표시는 0.5 단위 비율이 그대로 들어간다', () => {
  assert.ok(starsHtml(2.5).includes('--v:50%'));
  assert.ok(starsHtml(5).includes('--v:100%'));
});

test('효과 칩과 영입 조건 문구', () => {
  const chips = effectChips({ teamMood: 3, fans: -1, coins: -10, rest: true });
  for (const t of ['팀 사기 +3', '팬 -1', '코인 -10', '다음 구간 휴식']) assert.ok(chips.includes(t), t);
  assert.deepEqual(conditionTexts({ maxRank: 5, minFacility: 3, minFans: 20, minMorale: 60 }), ['작년 5위 이상', '시설 3 이상', '팬 20 이상', '팀 사기 60 이상']);
  assert.deepEqual(conditionTexts({}), []);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/components.test.mjs`
Expected: FAIL (`Cannot find module '../ui/components.mjs'`)

- [ ] **Step 3: 에셋 복사**

```bash
mkdir -p next/ui/fonts
cp ui/portrait.mjs ui/pixel.mjs ui/crest2.mjs next/ui/
cp ui/fonts/Anton-Regular.ttf ui/fonts/FMSquare-400.woff2 ui/fonts/FMSquare-700.woff2 ui/fonts/LICENSE-NanumSquareNeo.txt next/ui/fonts/
cp data/clubs.mjs next/data/clubs.mjs
```

- [ ] **Step 4: names.mjs 교체** — `next/engine/names.mjs` 전체를 아래로 바꾼다(`nameOf`는 같은 이름 풀을 쓰되 대륙을 함께 돌려주도록 확장, 팀 이름 추가)

```js
import { NAME_POOLS, randomName } from '../data/name-pools.mjs';
import { createRng } from './rng.mjs';

const CONTINENTS = Object.keys(NAME_POOLS);

function hashOf(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// 선수 id만으로 정해지는 대륙(초상화 피부색과 이름 풀이 함께 따라간다)
export const continentOf = (id) => CONTINENTS[hashOf(id) % CONTINENTS.length];

// 선수 id만으로 정해지는 이름. 저장할 필요 없이 언제 불러도 같은 이름이 나온다.
export function nameOf(id) {
  const rng = createRng(hashOf(id));
  rng(); // 대륙 고르는 데 쓴 첫 값은 건너뛰어 이름과 대륙이 따로 놀지 않게 한다
  return randomName(continentOf(id), rng);
}

const PLACES = ['북항', '새벽', '은하', '청송', '해오름', '달빛', '한울', '푸른', '백야', '돌고래', '불꽃', '철새', '마루', '여울', '노을', '솔빛', '파도', '구름', '황금', '바람',
  '눈꽃', '샛별', '갯벌', '모래', '소나무', '호랑이', '매화', '단풍', '안개', '번개', '폭풍', '별무리', '산마루', '강나루', '들불', '하늘', '가람', '아침', '한라', '금강'];
const SUFFIXES = ['FC', 'United', 'Athletic', 'City', 'Rovers', 'Town', 'Wanderers', 'Albion', 'Rangers', 'Dynamos', 'Stars', 'Sporting'];

// AI 팀 id(R지역T단계-번호)에서 0~479 순번을 뽑는다. 장소 40 x 접미사 12 = 480이라 이름이 겹치지 않는다.
function teamIndex(id) {
  const m = /^R(\d+)T(\d)-(\d+)$/.exec(id);
  return m ? Number(m[1]) * 60 + (Number(m[2]) - 1) * 20 + Number(m[3]) : hashOf(id) % 480;
}

function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
  };
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// 팀 id만으로 정해지는 팀 이름과 유니폼 색. 내 팀(ME)은 game.clubName을 따로 쓴다.
export function teamIdentity(id) {
  const g = teamIndex(id);
  const hue = Math.round((g * 137.5) % 360);
  const a = g % PLACES.length;
  const b = (Math.floor(g / PLACES.length) + a) % SUFFIXES.length; // 장소가 같으면 접미사가 다르고, 이웃한 팀은 접미사도 달라진다
  return { name: `${PLACES[a]} ${SUFFIXES[b]}`, kit: hslToHex(hue, 0.55, 0.38), hue };
}
```

- [ ] **Step 5: game.mjs 수정** — `createGame`의 시그니처와 반환 객체에 `clubName`을 넣는다

```js
export function createGame({ seed = 1, name = '감독', clubName = '내 구단' } = {}) {
```

```js
    seed, rng, name, clubName, world, myTeam, club: createClub(), history: createHistory(),
```

- [ ] **Step 6: 화면 부품 구현** — `next/ui/components.mjs`

```js
import { ATTRIBUTES } from '../engine/constants.mjs';
import { askingSalary } from '../engine/contract.mjs';
import { continentOf, nameOf, teamIdentity } from '../engine/names.mjs';
import { overall, starsOf } from '../engine/player.mjs';
import { xpNeeded } from '../engine/growth.mjs';
import { renderPortrait } from './portrait.mjs';
import { renderCrest } from './crest2.mjs';

export const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const POS_LABEL = { GK: '골키퍼', DF: '수비수', MF: '미드필더', FW: '공격수' };
export const ATTR_LABEL = {
  reflexes: '반응', handling: '핸들링', positioning: '위치 선정', stamina: '체력', tackling: '태클', marking: '대인',
  heading: '헤딩', passing: '패스', vision: '시야', workrate: '활동량', shooting: '슈팅', pace: '속도', dribbling: '드리블',
};
export const AWARD_LABEL = {
  ballonDor: '발롱도르', mvp: '시즌 MVP', goldenBoot: '골든부트', assistKing: '도움왕', goldenGlove: '골든글러브', youngStar: '올해의 영건',
};
export const TIER_LABEL = { 1: '1부', 2: '2부', 3: '3부' };
export const REASON_TEXT = {
  cap: '샐러리캡 여유가 부족합니다', rank: '작년 순위가 선수의 요구에 못 미칩니다', facility: '시설 수준이 선수의 요구에 못 미칩니다',
  fans: '팬 수가 선수의 요구에 못 미칩니다', morale: '팀 사기가 선수의 요구에 못 미칩니다', salary: '제시 금액이 요구보다 낮습니다',
  mood: '선수 사기가 낮아 거절했습니다', roster: '스타 자리가 가득 찼습니다. 먼저 한 명을 내보내세요',
};

// 별 0.5 단위. 채운 비율만큼 색이 칠해진다.
export const starsHtml = (value, cls = '') => `<span class="stars ${cls}" style="--v:${(value / 5) * 100}%" role="img" aria-label="별 ${value}개">★★★★★</span>`;
export const bar = (value, cls = '') => `<span class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></span>`;
export const moodFace = (mood) => (mood >= 75 ? '😄' : (mood >= 55 ? '🙂' : (mood >= 40 ? '😐' : (mood >= 25 ? '😟' : '😡'))));
export const chip = (text, cls = '') => `<span class="chip ${cls}">${esc(text)}</span>`;

export function effectChips(effects) {
  const out = [];
  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
  if (effects.teamMood) out.push(chip(`팀 사기 ${sign(effects.teamMood)}`, effects.teamMood > 0 ? 'good' : 'bad'));
  if (effects.playerMood) out.push(chip(`선수 사기 ${sign(effects.playerMood)}`, effects.playerMood > 0 ? 'good' : 'bad'));
  if (effects.fans) out.push(chip(`팬 ${sign(effects.fans)}`, effects.fans > 0 ? 'good' : 'bad'));
  if (effects.coins) out.push(chip(`코인 ${sign(effects.coins)}`, effects.coins > 0 ? 'good' : 'bad'));
  if (effects.rest) out.push(chip('다음 구간 휴식', 'good'));
  return out.join('');
}

export function conditionTexts(conditions) {
  const out = [];
  if (conditions.maxRank !== undefined) out.push(`작년 ${conditions.maxRank}위 이상`);
  if (conditions.minFacility !== undefined) out.push(`시설 ${conditions.minFacility} 이상`);
  if (conditions.minFans !== undefined) out.push(`팬 ${conditions.minFans} 이상`);
  if (conditions.minMorale !== undefined) out.push(`팀 사기 ${conditions.minMorale} 이상`);
  return out;
}

export const portrait = (p, { size = 48, kit } = {}) =>
  renderPortrait({ id: p.id, name: nameOf(p.id), continentTag: continentOf(p.id), age: p.age }, { size, kit, role: 'player' });

export function teamName(game, id) {
  return id === game.myTeam.id ? game.clubName : teamIdentity(id).name;
}

export function crest(game, id, size = 28) {
  const t = id === game.myTeam.id ? { name: game.clubName, kit: '#2e8b57' } : teamIdentity(id);
  return renderCrest({ id, name: t.name, kit: t.kit }, { size });
}

// 선수 카드(로스터 한 줄 이상): 초상화, 이름, 포지션, 현재·잠재 별, XP 바, 사기 표정, 컨디션, 계약
export function playerCard(p, { rest = false, action = '' } = {}) {
  const now = starsOf(overall(p));
  const pot = starsOf(p.potential);
  const hurt = (p.injury?.chunksLeft ?? 0) > 0;
  return `<article class="pcard${hurt ? ' pcard--hurt' : ''}" data-act="sheet" data-id="${esc(p.id)}">
    <div class="pcard__face">${portrait(p, { size: 52 })}<span class="pos pos--${p.position}">${p.position}</span></div>
    <div class="pcard__main">
      <div class="pcard__name">${esc(nameOf(p.id))} <small>${p.age}세</small>${hurt ? ' <span class="chip bad">부상</span>' : ''}${rest ? ' <span class="chip">휴식</span>' : ''}</div>
      <div class="pcard__stars">${starsHtml(now)} <span class="pot">잠재 ${starsHtml(pot, 'stars--pot')}</span></div>
      <div class="pcard__bars"><span title="XP">Lv${p.xpLevel} ${bar((p.xp / xpNeeded(p.xpLevel)) * 100, 'xp')}</span><span title="컨디션">컨 ${bar(p.condition, p.condition < 50 ? 'low' : 'cond')}</span></div>
    </div>
    <div class="pcard__side"><span class="face">${moodFace(p.mood)}</span><span class="money">${p.contract.salary}<small> / ${p.contract.years}년</small></span>${action}</div>
  </article>`;
}

// 후보·FA처럼 아직 우리 선수가 아닌 선수의 요약 카드
export function prospectCard(p, { note = '', action = '' } = {}) {
  const now = starsOf(overall(p));
  return `<article class="pcard pcard--plain">
    <div class="pcard__face">${portrait(p, { size: 48 })}<span class="pos pos--${p.position}">${p.position}</span></div>
    <div class="pcard__main">
      <div class="pcard__name">${esc(nameOf(p.id))} <small>${p.age}세</small></div>
      <div class="pcard__stars">${starsHtml(now)} <span class="pot">잠재 ${starsHtml(starsOf(p.potential), 'stars--pot')}</span></div>
      <div class="attrs-mini">${Object.entries(p.attrs).map(([k, v]) => `<span>${ATTR_LABEL[k]} <b>${v}</b></span>`).join('')}</div>
      ${note}
    </div>
    <div class="pcard__side">${action}</div>
  </article>`;
}

export function attrBars(p) {
  return ATTRIBUTES[p.position].map((k) => `<div class="attr"><span>${ATTR_LABEL[k]}</span>${bar(p.attrs[k], 'attrbar')}<b>${p.attrs[k]}</b></div>`).join('');
}

export const askText = (p) => `요구 연봉 ${askingSalary(p)}`;
```

- [ ] **Step 7: 통과 확인**

Run: `node --test next/tests/components.test.mjs`
Expected: PASS (5 tests). 이어서 `node --test next/tests/*.test.mjs`로 앞선 테스트도 그대로 통과하는지 확인한다(226개). 계획 7의 `nameOf` 테스트(이름 형식, 200개 중 150개 이상 서로 다름)는 확장된 `nameOf`로도 통과한다.

- [ ] **Step 8: 커밋**

```bash
git add next/ui/portrait.mjs next/ui/pixel.mjs next/ui/crest2.mjs next/ui/fonts next/data/clubs.mjs next/engine/names.mjs next/engine/game.mjs next/ui/components.mjs next/tests/components.test.mjs
git commit -m "feat(next): 화면 부품(선수 카드·별·바·칩), 팀 이름·유니폼 색, 에셋 복사"
```

---

### Task 2: 화면 함수

**Files:**
- Create: `next/ui/screens.mjs`
- Test: `next/tests/screens.test.mjs`

**Interfaces:**
- Consumes: Task 1 부품, 계획 7 `game` 구조와 `leagueAiTeams` `draftTurnIsMine`, 계획 6 `careerSummary` 결과(`game.end.summary`)
- Produces: `topBar(game)`, `titleScreen({ hasSave })`, `startDraftScreen(game, ui)`, `hubScreen(game, ui)`(탭: `roster` `table` `front` `records`), `playerSheet(game, id)`, `chunkScreen(game, ui)`, `seasonScreen(game, ui)`, `offseasonScreen(game, ui)`(단계: `resign` `market` `draft` `rookies`), `endScreen(game)`. `ui`는 `{ view, tab, rest: Set, tips: Set, flash, candidates, last }`. 화면이 쓰는 `data-act` 값: `new` `continue` `newrun` `sdraft` `tab` `sheet` `closesheet` `tip` `rest` `upgrade` `capup` `intensity` `coachfind` `hire` `tradein` `tradeout` `play` `press` `interview` `back` `finish` `toend` `retire` `hall` `offseason` `resign` `decline` `renewcoach` `openmarket` `offerfa` `release` `closemarket` `dpick` `closedraft` `place` `startseason`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/screens.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, incomingTrade, playNextChunk, retireManager } from '../engine/game.mjs';
import { generateCoachCandidates } from '../engine/coach.mjs';
import { beginOffseason, closeDraft, closeMarket, draftChoose, draftTurnIsMine, openMarket } from '../engine/offseason.mjs';
import { teamIdentity, nameOf } from '../engine/names.mjs';
import { teamName } from '../ui/components.mjs';
import {
  chunkScreen, endScreen, hubScreen, offseasonScreen, playerSheet, seasonScreen, startDraftScreen, titleScreen,
} from '../ui/screens.mjs';
import { autoSeason, startedGame } from './helpers.mjs';

const freshUi = (extra = {}) => ({ view: 'hub', tab: 'roster', rest: new Set(), tips: new Set(), flash: null, candidates: {}, last: null, ...extra });
// 화면 문자열이 깨지지 않았는지: 값이 빠졌을 때 나오는 흔적이 없어야 한다
const clean = (html, label) => {
  for (const bad of ['undefined', 'NaN', '[object', 'null']) assert.ok(!html.includes(bad), `${label}에 "${bad}"가 있다`);
  assert.ok(html.length > 200, `${label}가 너무 짧다`);
};

test('제목·시작 드래프트 화면', () => {
  clean(titleScreen({ hasSave: true }), '제목');
  assert.ok(titleScreen({ hasSave: false }).includes('data-act="new"'));
  assert.ok(!titleScreen({ hasSave: false }).includes('data-act="continue"'));
  const g = createGame({ seed: 2 });
  const html = startDraftScreen(g, freshUi());
  clean(html, '시작 드래프트');
  assert.equal((html.match(/data-act="sdraft"/g) ?? []).length, 12);
  assert.ok(html.includes('0/3명'));
});

test('관리 화면 4개 탭이 모두 그려지고 시트·카드가 선수 정보를 담는다', () => {
  const g = startedGame(3);
  for (const tab of ['roster', 'table', 'front', 'records']) clean(hubScreen(g, freshUi({ tab })), tab);
  const roster = hubScreen(g, freshUi());
  assert.equal((roster.match(/<article class="pcard/g) ?? []).length, 6);
  assert.ok(roster.includes('시즌 시작: 첫 구간 진행'));
  assert.ok(roster.includes(nameOf(g.myTeam.stars[0].id)));
  const table = hubScreen(g, freshUi({ tab: 'table' }));
  assert.equal((table.match(/<tr class/g) ?? []).length, 20);
  const sheet = playerSheet(g, g.myTeam.stars[0].id);
  clean(sheet, '선수 시트');
  assert.ok(sheet.includes('잠재'));
  assert.equal(playerSheet(g, 'nobody'), '');
});

test('프런트: 코치 후보와 부족한 코인에서는 고용 버튼이 막힌다', () => {
  const g = startedGame(4);
  const ui = freshUi({ tab: 'front', candidates: { attack: generateCoachCandidates(g.rng, { kind: 'attack', prefix: 'T' }) } });
  g.club.coins = 0;
  const html = hubScreen(g, ui);
  clean(html, '프런트');
  assert.ok(/data-act="hire"[^>]*disabled/.test(html));
  assert.ok(/data-act="upgrade"[^>]*disabled/.test(html));
});

test('쉬게 지정한 선수는 카드에 휴식이 표시된다', () => {
  const g = startedGame(5);
  const ui = freshUi({ rest: new Set([g.myTeam.stars[0].id]) });
  assert.ok(hubScreen(g, ui).includes('휴식 취소'));
});

test('구간 결과 화면: 경기 목록, 기자회견, 마지막 구간에는 시즌 마무리 버튼', () => {
  const g = startedGame(6);
  const ui = freshUi({ view: 'chunk' });
  ui.last = playNextChunk(g);
  const html = chunkScreen(g, ui);
  clean(html, '구간 결과');
  assert.equal((html.match(/class="m /g) ?? []).length, 14);
  assert.ok(html.includes('data-act="press"'));
  assert.ok(html.includes('data-act="back"'));
  playNextChunk(g); ui.last = playNextChunk(g);
  const last = chunkScreen(g, ui);
  assert.ok(last.includes('data-act="finish"'));
  assert.equal((last.match(/class="m /g) ?? []).length, 10);
});

test('시즌 종료·오프시즌·런 종료 화면', () => {
  let g;
  for (let seed = 1; seed < 30; seed += 1) {
    g = startedGame(seed);
    autoSeason(g);
    if (g.phase === 'offseason') break;
  }
  const ui = freshUi();
  const season = seasonScreen(g, ui);
  clean(season, '시즌 종료');
  assert.ok(season.includes('data-act="offseason"') && season.includes('data-act="retire"'));
  assert.equal((season.match(/<li/g) ?? []).length >= 8, true);
  beginOffseason(g);
  clean(offseasonScreen(g, ui), '재계약');
  g.off.resignQueue = [];
  openMarket(g);
  const market = offseasonScreen(g, ui);
  clean(market, 'FA 시장');
  assert.equal((market.match(/data-act="offerfa"/g) ?? []).length, g.off.market.length);
  closeMarket(g);
  const draft = offseasonScreen(g, ui);
  clean(draft, '드래프트');
  assert.equal(draftTurnIsMine(g), draft.includes('data-act="dpick"'));
});

test('런 종료 화면: 경질과 은퇴 모두 요약이 그려진다', () => {
  const g = startedGame(7);
  autoSeason(g);
  if (g.phase === 'offseason') retireManager(g);
  const html = endScreen(g);
  clean(html, '런 종료');
  assert.ok(html.includes('커리어 점수'));
  assert.ok(html.includes('data-act="newrun"'));
  assert.ok(html.includes(g.end.reason === 'fired' ? '경질' : '감독 은퇴'));
});

test('트레이드 제안과 팀 이름 함수', () => {
  const g = startedGame(8);
  const offer = incomingTrade(g);
  assert.ok(offer.aiTeamId);
  assert.equal(teamName(g, 'ME'), '내 구단');
  assert.equal(teamName(g, offer.aiTeamId), teamIdentity(offer.aiTeamId).name);
});

test('드래프트·신인 배치 단계 화면도 깨지지 않는다', () => {
  let g;
  for (let seed = 1; seed < 30; seed += 1) {
    g = startedGame(seed);
    autoSeason(g);
    if (g.phase === 'offseason') break;
  }
  beginOffseason(g);
  g.off.resignQueue = [];
  openMarket(g);
  closeMarket(g);
  const ui = freshUi();
  while (draftTurnIsMine(g)) draftChoose(g, g.off.draft.pool[0].id);
  closeDraft(g);
  const html = offseasonScreen(g, ui);
  clean(html, '신인 배치');
  assert.ok(html.includes('시즌 시작'));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/screens.test.mjs`
Expected: FAIL (`Cannot find module '../ui/screens.mjs'`)

- [ ] **Step 3: 구현** — `next/ui/screens.mjs`

```js
import { TRAITS } from '../engine/constants.mjs';
import { askingSalary, payroll } from '../engine/contract.mjs';
import { capExpandCost, salaryCap, upgradeCost } from '../engine/economy.mjs';
import { leagueAiTeams } from '../engine/game.mjs';
import { standings } from '../engine/league.mjs';
import { nameOf } from '../engine/names.mjs';
import { draftTurnIsMine } from '../engine/offseason.mjs';
import { overall } from '../engine/player.mjs';
import { coachCost, coachXpNeeded } from '../engine/coach.mjs';
import { teamRatings } from '../engine/ratings.mjs';
import { myLeague } from '../engine/world.mjs';
import {
  AWARD_LABEL, POS_LABEL, REASON_TEXT, TIER_LABEL, askText, attrBars, bar, chip, conditionTexts, crest, effectChips, esc,
  moodFace, playerCard, portrait, prospectCard, starsHtml, teamName,
} from './components.mjs';

const FACILITY_LABEL = { stadium: '경기장', training: '훈련 시설', rehab: '재활 시설' };
const FACILITY_EFFECT = { stadium: '홈경기 수입과 팬이 늘어요', training: '선수 XP 효율이 올라요', rehab: '부상에서 더 빨리 돌아와요' };
const KIND_LABEL = { attack: '공격 코치', defense: '수비 코치' };
const INTENSITY_LABEL = { LIGHT: '가볍게', NORMAL: '보통', HARD: '강하게' };
const FATE_TEXT = { promoted: '승격', stay: '잔류', fired: '경질' };

const tip = (ui, id, text) => (ui.tips?.has(id) ? '' : `<aside class="tip" data-tip="${id}"><p>${text}</p><button class="mini" data-act="tip" data-id="${id}">알겠어요</button></aside>`);
const flash = (ui) => (ui.flash ? `<div class="flash" role="status">${esc(ui.flash)}</div>` : '');

// ---------- 공통 ----------
export function topBar(game) {
  const t = game.myTeam;
  return `<header class="top">
    <div class="top__team">${crest(game, t.id, 34)}<div><b>${esc(game.clubName)}</b><small>${TIER_LABEL[t.tier]} · ${game.world.year}년차</small></div></div>
    <div class="top__stats"><span class="stat">🪙 <b>${game.club.coins}</b></span><span class="stat">👥 <b>${Math.round(game.club.fans)}</b></span></div>
  </header>`;
}

export function titleScreen({ hasSave }) {
  return `<section class="title">
    <h1>FM-Lite</h1>
    <p class="lede">3부 리그의 작은 구단에서 시작해 1부, 그리고 챔피언스리그 정상까지.<br>스타 6명을 키우고, 한 시즌을 세 번에 나눠 치르세요.</p>
    <label class="field">구단 이름<input id="club-name" maxlength="14" value="새벽 FC" autocomplete="off"></label>
    <button class="btn btn--primary" data-act="new">새 게임 시작</button>
    ${hasSave ? '<button class="btn" data-act="continue">이어하기</button>' : ''}
  </section>`;
}

// ---------- 시작 드래프트 ----------
export function startDraftScreen(game, ui) {
  const d = game.startDraft;
  return `${topBar(game)}<section class="page">
    <h2>시작 드래프트 <small>${d.next}/3명 선택</small></h2>
    ${tip(ui, 'start', '배정된 스타 3명에 더해, 신인 후보 12명 중 <b>3명</b>을 직접 고르세요. 별은 지금 실력, "잠재"는 앞으로 클 수 있는 한계예요. 잠재가 높은 어린 선수가 보석이 됩니다.')}
    <h3 class="sub">내 스타</h3>${game.myTeam.stars.map((p) => prospectCard(p)).join('')}
    <h3 class="sub">신인 후보</h3>${d.pool.map((p) => prospectCard(p, { action: `<button class="btn btn--small btn--primary" data-act="sdraft" data-id="${esc(p.id)}">지명</button>` })).join('')}
  </section>`;
}

// ---------- 관리(허브) ----------
function rosterTab(game, ui) {
  const r = teamRatings(game.myTeam);
  const cards = game.myTeam.stars.map((p) => {
    const hurt = (p.injury?.chunksLeft ?? 0) > 0;
    const resting = ui.rest.has(p.id);
    const btn = hurt ? '' : `<button class="mini${resting ? ' mini--on' : ''}" data-act="rest" data-id="${esc(p.id)}">${resting ? '휴식 취소' : '쉬게 하기'}</button>`;
    return playerCard(p, { rest: resting, action: btn });
  }).join('');
  return `${tip(ui, 'roster', '스타 카드를 누르면 능력 상세가 보여요. <b>쉬게 하기</b>를 누르면 다음 구간에 그 선수가 빠지고 대체 선수가 뛰어요. 컨디션이 낮으면 부상 위험이 커져요.')}
    <div class="ratings"><div>공격력 <b>${Math.round(r.attack)}</b>${bar(r.attack, 'atk')}</div><div>수비력 <b>${Math.round(r.defense)}</b>${bar(r.defense, 'def')}</div></div>
    ${cards}`;
}

function tableTab(game) {
  const league = myLeague(game.world);
  const t = game.myTeam.tier;
  const rows = standings(league);
  const zone = (i) => ((t > 1 && i < 2) ? 'up' : ((t < 3 && i >= 18) ? 'down' : (t === 3 && i >= 18 ? 'down' : (i === 2 && t > 1 ? 'po' : ''))));
  return `<table class="tbl"><thead><tr><th>#</th><th>팀</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>득실</th><th>승점</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr class="${r.id === game.myTeam.id ? 'me ' : ''}${zone(i)}"><td>${i + 1}</td><td class="tn">${crest(game, r.id, 20)} ${esc(teamName(game, r.id))}</td><td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td><b>${r.points}</b></td></tr>`).join('')}
  </tbody></table>
  <p class="legend"><i class="lg up"></i>자동 승격 <i class="lg po"></i>승강전 <i class="lg down"></i>${t === 3 ? '강등권(경질)' : '강등'}</p>`;
}

function frontTab(game, ui) {
  const { club, myTeam: team } = game;
  const cap = salaryCap(club, team.tier);
  const used = payroll(team);
  const fac = Object.keys(FACILITY_LABEL).map((k) => {
    const lv = club.facilities[k];
    const btn = lv >= 10 ? '<span class="chip">최고 단계</span>' : `<button class="btn btn--small" data-act="upgrade" data-kind="${k}" ${upgradeCost(club, k) > club.coins ? 'disabled' : ''}>🪙 ${upgradeCost(club, k)} 올리기</button>`;
    return `<div class="row"><div><b>${FACILITY_LABEL[k]}</b> Lv${lv}/10<small>${FACILITY_EFFECT[k]}</small>${bar(lv * 10)}</div>${btn}</div>`;
  }).join('');
  const coaches = ['attack', 'defense'].map((kind) => {
    const c = team.coaches[kind];
    const cands = ui.candidates?.[kind];
    return `<div class="coach"><div class="row"><div><b>${KIND_LABEL[kind]}</b> ${starsHtml(c.stars)}<small>${TRAITS[c.trait]?.label ?? ''} · 계약 ${c.contract.years}년 · XP ${bar((c.xp / coachXpNeeded(c.stars)) * 100, 'xp')}</small></div>
      <button class="mini" data-act="coachfind" data-kind="${kind}">새 코치 찾기</button></div>
      <div class="seg" role="group" aria-label="훈련 강도">${['LIGHT', 'NORMAL', 'HARD'].map((i) => `<button class="seg__b${c.intensity === i ? ' on' : ''}" data-act="intensity" data-kind="${kind}" data-v="${i}">${INTENSITY_LABEL[i]}</button>`).join('')}</div>
      <small class="hint">강하게: XP는 많지만 컨디션·사기·부상이 나빠져요</small>
      ${cands ? cands.map((cd) => `<div class="row cand"><div>${starsHtml(cd.stars)} <small>${TRAITS[cd.trait].label}</small></div><button class="btn btn--small" data-act="hire" data-kind="${kind}" data-id="${esc(cd.id)}" ${coachCost(cd.stars) > club.coins ? 'disabled' : ''}>🪙 ${coachCost(cd.stars)} 고용</button></div>`).join('') : ''}
    </div>`;
  }).join('');
  const ai = leagueAiTeams(game);
  const mine = team.stars.map((p) => `<option value="${esc(p.id)}">${esc(nameOf(p.id))} (${p.position})</option>`).join('');
  const theirs = ai.map((t) => `<optgroup label="${esc(teamName(game, t.id))}">${t.stars.map((p) => `<option value="${esc(t.id)}:${esc(p.id)}">${esc(nameOf(p.id))} (${p.position})</option>`).join('')}</optgroup>`).join('');
  return `${tip(ui, 'front', '코인으로 시설을 키우고 코치를 바꿀 수 있어요. 샐러리캡은 <b>스타 연봉 합계</b>의 한도예요. 트레이드는 선수 맞교환만 가능하고 코인으로는 못 사요.')}
    <div class="card"><h3>샐러리캡</h3><div class="capline"><b>${used}</b> / ${cap} ${bar((used / cap) * 100, used > cap * 0.9 ? 'low' : 'cond')}</div>
      <button class="btn btn--small" data-act="capup" ${capExpandCost(club) > club.coins || club.capLevel >= 5 ? 'disabled' : ''}>캡 +10 확장 🪙 ${club.capLevel >= 5 ? '-' : capExpandCost(club)}</button></div>
    <div class="card"><h3>시설</h3>${fac}</div>
    <div class="card"><h3>코치</h3>${coaches}</div>
    <div class="card"><h3>트레이드</h3>
      <button class="btn btn--small" data-act="tradein">받은 제안 확인</button>
      <div class="tradeform"><label>내 선수<select id="tr-mine">${mine}</select></label><label>상대 선수<select id="tr-theirs">${theirs}</select></label>
      <button class="btn btn--small btn--primary" data-act="tradeout">맞교환 제안</button></div></div>`;
}

function recordsTab(game) {
  const h = game.history;
  const trophies = h.trophies.length
    ? h.trophies.map((t) => `<li>${t.year}년차 · ${t.kind === 'league' ? `🏆 ${TIER_LABEL[t.tier]} 우승` : (t.kind === 'cl' ? '🌍 챔피언스리그 우승' : `🏅 ${AWARD_LABEL[t.key]} · ${esc(nameOf(t.playerId))}`)}</li>`).join('')
    : '<li class="muted">아직 트로피가 없어요</li>';
  const seasons = h.mySeasons.map((s) => `<tr><td>${s.year}</td><td>${TIER_LABEL[s.tier]}</td><td>${s.rank}위</td><td>${FATE_TEXT[s.fate]}</td></tr>`).join('');
  const retired = h.retired.map((r) => {
    const inHall = h.hallOfFame.some((x) => x.playerId === r.playerId);
    return `<li>${esc(nameOf(r.playerId))} · ${r.seasons}시즌 ${r.career.goals}골 ${r.career.assists}도움 ${inHall ? chip('명예의 전당', 'good') : `<button class="mini" data-act="hall" data-id="${esc(r.playerId)}">명예의 전당에 올리기</button>`}</li>`;
  }).join('');
  const champs = h.champions.map((c) => `<li>${c.year}년차 · 챔피언스리그 ${c.champions ? esc(teamName(game, c.champions.teamId)) : '-'}</li>`).join('');
  return `<div class="card"><h3>트로피 진열대</h3><ul class="list">${trophies}</ul></div>
    <div class="card"><h3>시즌 기록</h3>${seasons ? `<table class="tbl tbl--s"><thead><tr><th>년차</th><th>리그</th><th>순위</th><th>결과</th></tr></thead><tbody>${seasons}</tbody></table>` : '<p class="muted">첫 시즌이 끝나면 쌓여요</p>'}</div>
    <div class="card"><h3>은퇴한 선수</h3><ul class="list">${retired || '<li class="muted">아직 없어요</li>'}</ul></div>
    <div class="card"><h3>역대 챔피언스리그 우승팀</h3><ul class="list">${champs || '<li class="muted">아직 없어요</li>'}</ul></div>`;
}

export function hubScreen(game, ui) {
  const tabs = [['roster', '로스터'], ['table', '순위'], ['front', '프런트'], ['records', '기록실']];
  const body = { roster: rosterTab, table: tableTab, front: frontTab, records: recordsTab }[ui.tab](game, ui);
  const n = game.chunk;
  return `${topBar(game)}<section class="page">${flash(ui)}${body}</section>
    <div class="cta"><button class="btn btn--primary btn--wide" data-act="play">${n === 0 ? '시즌 시작: 첫 구간 진행' : `다음 구간 진행 (${n + 1}/3)`}</button></div>
    <nav class="nav" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${ui.tab === k}" class="${ui.tab === k ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</button>`).join('')}</nav>`;
}

// ---------- 선수 상세(시트) ----------
export function playerSheet(game, id) {
  const p = game.myTeam.stars.find((x) => x.id === id);
  if (!p) return '';
  const rec = game.history.players.get(id);
  const awards = (p.awards ?? []).map((a) => chip(`${a.year}년차 ${AWARD_LABEL[a.key]}`, 'gold')).join('') || '<span class="muted">수상 없음</span>';
  return `<div class="sheet" role="dialog" aria-modal="true" aria-label="선수 상세"><div class="sheet__box">
    <button class="x" data-act="closesheet" aria-label="닫기">✕</button>
    <div class="sheet__head">${portrait(p, { size: 72 })}<div><h3>${esc(nameOf(p.id))}</h3><p>${POS_LABEL[p.position]} · ${p.age}세</p>${starsHtml(overall(p) / 20)} <small class="pot">잠재 ${starsHtml(p.potential / 20, 'stars--pot')}</small></div></div>
    <div class="attrs">${attrBars(p)}</div>
    <dl class="kv"><dt>사기</dt><dd>${moodFace(p.mood)} ${Math.round(p.mood)}</dd><dt>컨디션</dt><dd>${Math.round(p.condition)}</dd><dt>계약</dt><dd>연봉 ${p.contract.salary} · ${p.contract.years}년 남음</dd>
      <dt>이번 시즌</dt><dd>${p.stats.apps}경기 ${p.stats.goals}골 ${p.stats.assists}도움</dd><dt>통산</dt><dd>${rec ? `${rec.career.apps}경기 ${rec.career.goals}골 ${rec.career.assists}도움` : '기록 없음'}</dd></dl>
    <div class="medals">${awards}</div></div></div>`;
}

// ---------- 구간 결과 ----------
export function chunkScreen(game, ui) {
  const r = ui.last;
  const me = game.myTeam.id;
  const rows = r.matches.map((m) => {
    const home = m.homeId === me;
    const diff = (home ? 1 : -1) * (m.homeGoals - m.awayGoals);
    return `<li class="m ${diff > 0 ? 'w' : (diff < 0 ? 'l' : 'd')}"><span class="m__r">${diff > 0 ? '승' : (diff < 0 ? '패' : '무')}</span>
      <span class="m__t">${crest(game, m.homeId, 18)} ${esc(teamName(game, m.homeId))}</span><b class="m__s">${m.homeGoals} : ${m.awayGoals}</b><span class="m__t m__t--r">${esc(teamName(game, m.awayId))} ${crest(game, m.awayId, 18)}</span></li>`;
  }).join('');
  const ups = r.steps.filter((s) => s.levelUps > 0);
  const hurt = r.steps.filter((s) => s.injured);
  const events = [
    ...ups.map((s) => `⬆ ${esc(nameOf(s.id))} 레벨업 ${s.levelUps}회`),
    ...hurt.map((s) => `🤕 ${esc(nameOf(s.id))} 부상`),
  ];
  const press = game.pending.press;
  const pressHtml = press ? `<div class="card event"><h3>🎤 기자회견</h3><p>${esc(press.text)}</p>${press.options.map((o, i) => `<button class="opt" data-act="press" data-i="${i}"><b>${esc(o.label)}</b><span>${effectChips(o.effects)}</span></button>`).join('')}</div>` : '';
  const iv = game.pending.interviews.map(({ playerId, interview }) => `<div class="card event"><h3>💬 ${esc(nameOf(playerId))} 면담</h3><p>${esc(interview.text)}</p>${interview.options.map((o, i) => `<button class="opt" data-act="interview" data-id="${esc(playerId)}" data-i="${i}" ${(o.effects.coins ?? 0) + game.club.coins < 0 ? 'disabled' : ''}><b>${esc(o.label)}</b><span>${effectChips(o.effects)}</span></button>`).join('')}</div>`).join('');
  const last = game.phase === 'seasonEnd';
  return `${topBar(game)}<section class="page">
    ${tip(ui, 'chunk', '승리하면 코인이 들어와요. 득점·도움을 한 선수는 XP를 더 얻어요. 아래 기자회견과 면담은 선택마다 효과가 달라요.')}
    <h2>${r.chunk}번째 구간 결과</h2>
    <div class="summary"><div><b>${r.won}</b><small>승</small></div><div><b>${r.drawn}</b><small>무</small></div><div><b>${r.lost}</b><small>패</small></div><div><b>+${r.income.total}</b><small>🪙 (승리 ${r.income.win} + 팬 ${r.income.fan})</small></div></div>
    ${events.length ? `<ul class="events">${events.map((e) => `<li>${e}</li>`).join('')}</ul>` : ''}
    ${pressHtml}${iv}
    <ol class="matches">${rows}</ol>
  </section>
  <div class="cta"><button class="btn btn--primary btn--wide" data-act="${last ? 'finish' : 'back'}">${last ? '시즌 마무리' : '관리 화면으로'}</button></div>`;
}

// ---------- 시즌 종료 ----------
export function seasonScreen(game, ui) {
  const s = game.season;
  const aw = Object.values(s.awards).filter(Boolean).map((a) => {
    const mine = a.teamId === game.myTeam.id;
    return `<li class="${mine ? 'me' : ''}"><b>${AWARD_LABEL[a.key]}</b> ${esc(nameOf(a.playerId))} <small>${esc(teamName(game, a.teamId))}</small>${mine ? ' ⭐' : ''}</li>`;
  }).join('');
  const po = s.outcome.playoffs.map((m) => `<li>${esc(teamName(game, m.homeId))} ${m.homeGoals}:${m.awayGoals} ${esc(teamName(game, m.awayId))}${m.penalties ? ' (승부차기)' : ''} → <b>${esc(teamName(game, m.winnerId))}</b></li>`).join('');
  const fateMsg = { promoted: '🎉 승격했습니다!', stay: '잔류했습니다', fired: '😢 경질되었습니다' }[s.fate];
  return `${topBar(game)}<section class="page">
    <h2>${s.year}년차 시즌 종료</h2>
    <div class="card big"><div class="rank">${s.rank}위</div><p>${TIER_LABEL[s.tier]} · ${fateMsg}</p>${s.prize ? `<p>상금 🪙 +${s.prize}</p>` : ''}</div>
    <div class="card"><h3>챔피언스리그</h3><p>우승 ${esc(teamName(game, s.cl.champion))} · 준우승 ${esc(teamName(game, s.cl.runnerUp))}${s.cl.champion === game.myTeam.id ? ' 🏆' : ''}</p></div>
    <div class="card"><h3>시상</h3><ul class="list">${aw}</ul></div>
    <div class="card"><h3>승강전</h3><ul class="list">${po}</ul></div>
  </section>
  <div class="cta">${game.phase === 'ended'
    ? '<button class="btn btn--primary btn--wide" data-act="toend">결산 보기</button>'
    : '<button class="btn btn--primary btn--wide" data-act="offseason">오프시즌 시작</button><button class="btn btn--danger btn--wide" data-act="retire">감독 은퇴</button>'}</div>`;
}

// ---------- 오프시즌 ----------
const STEPS = [['resign', '재계약'], ['market', 'FA 시장'], ['draft', '드래프트'], ['rookies', '신인 배치']];
const stepper = (step) => `<ol class="steps">${STEPS.map(([k, l]) => `<li class="${k === step ? 'on' : ''}">${l}</li>`).join('')}</ol>`;
const salaryInput = (id, v) => `<input class="sal" type="number" min="1" max="99" id="sal-${esc(id)}" value="${v}" aria-label="제시 연봉">`;

export function offseasonScreen(game, ui) {
  const off = game.off;
  let body = '';
  if (off.step === 'resign') {
    const ret = off.retired.map((c) => `<li>🎗 ${esc(nameOf(c.playerId))} 은퇴 · ${c.seasons}시즌 ${c.career.goals}골 ${c.career.assists}도움</li>`).join('');
    const list = off.resignQueue.map((p) => playerCard(p, { action: `<div class="offer">${salaryInput(p.id, askingSalary(p))}<button class="btn btn--small btn--primary" data-act="resign" data-id="${esc(p.id)}">재계약</button><button class="mini" data-act="decline" data-id="${esc(p.id)}">보내기</button></div>` })).join('');
    const coaches = off.coachExpiring.map((c) => `<div class="row"><div><b>${KIND_LABEL[c.kind]}</b> ${starsHtml(c.stars)}<small>계약이 끝났어요</small></div><button class="btn btn--small" data-act="renewcoach" data-kind="${c.kind}">🪙 ${coachCost(c.stars)} 재계약</button></div>`).join('');
    body = `${tip(ui, 'resign', '계약이 끝난 선수에게 우선 재계약을 제안할 수 있어요. 사기가 낮으면 어떤 금액도 거절해요. 보내면 FA 시장에 나와요.')}
      ${ret ? `<div class="card"><h3>은퇴</h3><ul class="list">${ret}</ul></div>` : ''}
      ${list || '<p class="muted">이번에 계약이 끝나는 스타는 없어요</p>'}${coaches ? `<div class="card"><h3>코치 계약</h3>${coaches}<p class="hint">재계약하지 않으면 1별 신임 코치가 옵니다</p></div>` : ''}
      <div class="cta"><button class="btn btn--primary btn--wide" data-act="openmarket">FA 시장 열기</button></div>`;
  } else if (off.step === 'market') {
    const full = game.myTeam.stars.length >= 6;
    const mine = game.myTeam.stars.map((p) => `<div class="row"><div>${esc(nameOf(p.id))} <small>${p.position} · 연봉 ${p.contract.salary}</small></div><button class="mini" data-act="release" data-id="${esc(p.id)}">내보내기</button></div>`).join('');
    const market = off.market.map((e) => prospectCard(e.player, {
      note: `<div class="conds">${conditionTexts(e.conditions).map((t) => chip(t)).join('') || chip('조건 없음', 'good')}</div>`,
      action: `<div class="offer">${salaryInput(e.player.id, e.asking)}<small>${askText(e.player)}</small><button class="btn btn--small btn--primary" data-act="offerfa" data-id="${esc(e.player.id)}">영입 제안</button></div>`,
    })).join('');
    body = `${tip(ui, 'market', '선수마다 요구 금액과 <b>영입 조건</b>(작년 순위, 시설, 팬, 팀 사기)이 달라요. 조건을 채우고 금액이 요구 이상이면 계약해요. 못 잡은 선수는 다른 팀이 데려가요.')}
      <div class="card"><h3>내 스타 ${game.myTeam.stars.length}/6</h3>${full ? '<p class="hint">자리가 가득 찼어요. 영입하려면 먼저 한 명을 내보내세요</p>' : ''}${mine}</div>
      ${market || '<p class="muted">시장이 비었어요</p>'}
      <div class="cta"><button class="btn btn--primary btn--wide" data-act="closemarket">시장 마감 → 드래프트</button></div>`;
  } else if (off.step === 'draft') {
    const d = off.draft;
    const mineTurn = draftTurnIsMine(game);
    const slot = d.order.filter((o) => o.owner === game.myTeam.id).map((o) => `${o.slot}번`).join(', ') || '없음';
    body = `${tip(ui, 'draft', '성적이 나쁜 팀부터 신인을 한 명씩 지명해요. 내 순번이 오면 후보 중에서 고르세요. 지명권은 트레이드로 오갈 수 있어요.')}
      <p class="lede">내 지명 순번: ${slot}</p>
      ${mineTurn ? d.pool.map((p) => prospectCard(p, { action: `<button class="btn btn--small btn--primary" data-act="dpick" data-id="${esc(p.id)}">지명</button>` })).join('')
        : '<p class="muted">내 지명이 끝났어요</p>'}
      <div class="cta"><button class="btn btn--primary btn--wide" data-act="closedraft" ${mineTurn ? 'disabled' : ''}>드래프트 마감</button></div>`;
  } else {
    const full = game.myTeam.stars.length >= 6;
    const opts = game.myTeam.stars.map((p) => `<option value="${esc(p.id)}">${esc(nameOf(p.id))} (${p.position})</option>`).join('');
    body = `${tip(ui, 'rookies', '뽑은 신인을 스타로 올리세요. 자리가 가득하면 내보낼 스타를 골라야 해요. 올리지 않은 신인은 떠나요.')}
      ${off.rookies.map((p) => prospectCard(p, { action: `<div class="offer">${full ? `<select id="out-${esc(p.id)}" aria-label="내보낼 스타">${opts}</select>` : ''}<button class="btn btn--small btn--primary" data-act="place" data-id="${esc(p.id)}">스타로 올리기</button></div>` })).join('') || '<p class="muted">대기 중인 신인이 없어요</p>'}
      <div class="cta"><button class="btn btn--primary btn--wide" data-act="startseason">${game.world.year}년차 시즌 시작</button></div>`;
  }
  return `${topBar(game)}<section class="page"><h2>오프시즌</h2>${stepper(off.step)}${flash(ui)}${body}</section>`;
}

// ---------- 런 종료 ----------
export function endScreen(game) {
  const s = game.end.summary;
  const h = game.history;
  const hall = h.hallOfFame.map((x) => `<li>${esc(nameOf(x.playerId))}</li>`).join('');
  const star = s.standout.map((id) => { const r = h.players.get(id); return `<li>${esc(nameOf(id))} · ${r.career.goals}골 ${r.career.assists}도움</li>`; }).join('');
  return `<section class="page end">
    <h1>${game.end.reason === 'fired' ? '경질' : '감독 은퇴'}</h1>
    <p class="lede">${esc(game.clubName)} · ${s.seasons}시즌</p>
    <div class="card big"><div class="rank">${s.score}</div><p>커리어 점수</p></div>
    <div class="card"><dl class="kv"><dt>최고 리그</dt><dd>${TIER_LABEL[s.bestTier]}</dd><dt>리그 우승</dt><dd>${s.leagueTitles}회</dd><dt>챔피언스리그 우승</dt><dd>${s.clTitles}회</dd><dt>개인 수상</dt><dd>${s.awardCount}개</dd></dl></div>
    <div class="card"><h3>대표 선수</h3><ul class="list">${star || '<li class="muted">없음</li>'}</ul></div>
    <div class="card"><h3>명예의 전당</h3><ul class="list">${hall || '<li class="muted">없음</li>'}</ul></div>
    <button class="btn btn--primary btn--wide" data-act="newrun">새 게임</button>
  </section>`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test next/tests/screens.test.mjs`
Expected: PASS (8 tests). 이어서 `node --test next/tests/*.test.mjs`로 앞선 테스트도 그대로 통과하는지 확인한다(234개).

- [ ] **Step 5: 커밋**

```bash
git add next/ui/screens.mjs next/tests/screens.test.mjs
git commit -m "feat(next): 화면 함수(제목·드래프트·관리 4탭·구간 결과·시즌 종료·오프시즌·런 종료)"
```

---

### Task 3: 앱 연결, 스타일, 튜토리얼 팁, 브라우저 확인

**Files:**
- Create: `next/index.html`, `next/ui/style.css`, `next/ui/app.mjs`

**Interfaces:**
- Consumes: Task 2 화면 함수, 계획 7의 모든 흐름 함수와 `readSave` `writeSave` `SAVE_KEY`
- Produces: 브라우저에서 도는 게임. `window.fmLite`(개발용: 현재 `game`과 `ui` 상태를 읽는 창구). 튜토리얼 팁 8종(`start` `roster` `front` `chunk` `resign` `market` `draft` `rookies`)은 처음 한 번만 뜨고 `localStorage`의 `fm-lite-tips`에 기억된다.

- [ ] **Step 1: index.html** — `next/index.html`

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0d1714">
<title>FM-Lite</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css">
<link rel="stylesheet" href="ui/style.css">
</head>
<body>
  <main id="screen"></main>
  <script type="module" src="ui/app.mjs"></script>
</body>
</html>
```

- [ ] **Step 2: 스타일** — `next/ui/style.css`

```css
@font-face { font-family: 'FM Square'; src: url('fonts/FMSquare-400.woff2') format('woff2'); font-weight: 300 500; font-display: swap; }
@font-face { font-family: 'FM Square'; src: url('fonts/FMSquare-700.woff2') format('woff2'); font-weight: 600 900; font-display: swap; }
@font-face { font-family: 'Anton'; src: url('fonts/Anton-Regular.ttf') format('truetype'); font-weight: 400; font-display: swap; }
* { font-synthesis: none; box-sizing: border-box; }
:root {
  --night: #0d1714; --surface: #16241e; --surface-hi: #1e332b; --line: #2c4239; --line-soft: #213228;
  --turf: #4ca86a; --light: #f0ead9; --muted: #8ba497; --muted-dim: #7e9488; --debit: #e2564d; --gold: #dda63a; --blue: #5b9bd5;
  --num: 'Anton', 'Pretendard Variable', Pretendard, system-ui, sans-serif;
  --ui: 'FM Square', 'Pretendard Variable', Pretendard, system-ui, sans-serif;
  --r-lg: 12px; --r-md: 8px; --r-sm: 4px; --ease: cubic-bezier(0.16, 1, 0.3, 1);
}
html { background: #080f0d; }
body { margin: 0 auto; max-width: 460px; min-height: 100dvh; background: var(--night); color: var(--light); font-family: var(--ui); font-size: 14px; line-height: 1.45; padding-bottom: 150px; -webkit-font-smoothing: antialiased; -webkit-tap-highlight-color: transparent; }
h1, h2, h3 { margin: 0; font-weight: 700; letter-spacing: -0.01em; }
h1 { font-family: var(--num); font-size: 52px; letter-spacing: 0.02em; }
h2 { font-size: 22px; margin: 4px 0 12px; } h2 small { font-size: 13px; color: var(--muted); font-weight: 400; }
h3 { font-size: 15px; margin-bottom: 8px; } h3.sub { margin: 18px 0 8px; color: var(--muted); font-size: 13px; }
p { margin: 0 0 8px; } small { color: var(--muted); font-size: 12px; } b { font-weight: 700; }
button, input, select { font: inherit; color: inherit; }
button { cursor: pointer; border: 0; background: none; }
button:focus-visible, input:focus-visible, select:focus-visible, [data-act]:focus-visible { outline: 2px solid var(--turf); outline-offset: 2px; }
.muted, .hint { color: var(--muted-dim); font-size: 12px; } .lede { color: var(--muted); }
.page { padding: 12px 16px 24px; }

/* 상단 바 */
.top { position: sticky; top: 0; z-index: 5; display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 16px; background: rgba(13,23,20,.94); backdrop-filter: blur(8px); border-bottom: 1px solid var(--line-soft); }
.top__team { display: flex; align-items: center; gap: 10px; } .top__team b { display: block; font-size: 15px; } .top__team small { display: block; }
.top__stats { display: flex; gap: 8px; } .stat { background: var(--surface); border: 1px solid var(--line); padding: 3px 9px; border-radius: 99px; font-size: 13px; }

/* 버튼 */
.btn { display: inline-flex; justify-content: center; align-items: center; gap: 6px; min-height: 44px; padding: 0 18px; border-radius: var(--r-md); background: var(--surface-hi); border: 1px solid var(--line); font-weight: 700; transition: transform .15s var(--ease), background .15s; }
.btn:active { transform: scale(.98); } .btn:hover { background: #26413a; }
.btn--primary { background: var(--turf); border-color: var(--turf); color: #07130c; } .btn--primary:hover { background: #5bbd7b; }
.btn--danger { background: transparent; border-color: var(--debit); color: var(--debit); }
.btn--small { min-height: 36px; padding: 0 12px; font-size: 13px; } .btn--wide { width: 100%; }
.btn:disabled { opacity: .4; cursor: not-allowed; }
.mini { min-height: 32px; padding: 0 10px; border-radius: 99px; border: 1px solid var(--line); background: var(--surface); font-size: 12px; color: var(--muted); }
.mini--on { background: var(--gold); color: #1c1403; border-color: var(--gold); }
.cta { position: fixed; left: 50%; transform: translateX(-50%); bottom: 58px; width: min(460px, 100%); padding: 10px 16px; background: linear-gradient(transparent, var(--night) 35%); display: grid; gap: 8px; z-index: 6; }
.page .cta { position: static; transform: none; padding: 16px 0 0; background: none; }
.nav { position: fixed; left: 50%; transform: translateX(-50%); bottom: 0; width: min(460px, 100%); display: grid; grid-template-columns: repeat(4, 1fr); background: var(--surface); border-top: 1px solid var(--line); z-index: 7; padding-bottom: env(safe-area-inset-bottom); }
.nav button { min-height: 52px; color: var(--muted); font-weight: 700; } .nav button.on { color: var(--turf); box-shadow: inset 0 2px var(--turf); }

/* 제목 */
.title { padding: 14vh 24px 24px; display: grid; gap: 14px; } .title h1 { color: var(--turf); }
.field { display: grid; gap: 6px; color: var(--muted); font-size: 13px; }
.field input, .sal, select { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); padding: 10px 12px; min-height: 44px; color: var(--light); }
.sal { width: 72px; min-height: 36px; padding: 4px 8px; text-align: center; }

/* 카드 */
.card { background: var(--surface); border: 1px solid var(--line-soft); border-radius: var(--r-lg); padding: 14px; margin: 0 0 12px; }
.card.big { text-align: center; } .rank { font-family: var(--num); font-size: 56px; color: var(--gold); line-height: 1.1; }
.row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--line-soft); } .row:first-of-type { border-top: 0; }
.row small { display: block; } .cand { background: var(--surface-hi); padding: 8px 10px; border-radius: var(--r-md); margin-top: 6px; border: 0; }
.coach { padding-bottom: 8px; } .coach + .coach { border-top: 1px solid var(--line); padding-top: 8px; }
.seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin: 6px 0 4px; } .seg__b { min-height: 38px; border-radius: var(--r-md); background: var(--surface-hi); color: var(--muted); font-weight: 700; } .seg__b.on { background: var(--turf); color: #07130c; }
.tradeform { display: grid; gap: 8px; margin-top: 10px; } .tradeform label { display: grid; gap: 4px; color: var(--muted); font-size: 12px; }
.capline { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; } .capline .bar { flex: 1; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; } .list li.me { color: var(--gold); }

/* 선수 카드 */
.pcard { display: grid; grid-template-columns: 56px 1fr auto; gap: 10px; align-items: center; background: var(--surface); border: 1px solid var(--line-soft); border-radius: var(--r-lg); padding: 10px; margin: 0 0 8px; cursor: pointer; }
.pcard--plain { cursor: default; } .pcard--hurt { border-color: var(--debit); }
.pcard__face { position: relative; width: 56px; height: 56px; display: grid; place-items: center; background: var(--surface-hi); border-radius: var(--r-md); }
.pos { position: absolute; left: -4px; bottom: -4px; font-size: 10px; font-weight: 800; padding: 1px 5px; border-radius: 4px; background: var(--blue); color: #06101a; }
.pos--GK { background: var(--gold); } .pos--DF { background: var(--turf); } .pos--FW { background: var(--debit); color: #1a0705; }
.pcard__name { font-weight: 700; font-size: 15px; } .pcard__name small { font-weight: 400; }
.pcard__stars { display: flex; align-items: center; gap: 8px; font-size: 13px; } .pot { color: var(--muted); font-size: 11px; display: inline-flex; gap: 4px; align-items: center; }
.pcard__bars { display: flex; gap: 12px; margin-top: 4px; font-size: 11px; color: var(--muted); } .pcard__bars span { display: inline-flex; align-items: center; gap: 4px; }
.pcard__side { display: grid; justify-items: end; gap: 4px; text-align: right; } .face { font-size: 22px; } .money { font-family: var(--num); font-size: 18px; letter-spacing: .02em; } .money small { font-family: var(--ui); }
.offer { display: grid; justify-items: end; gap: 6px; } .offer select { min-height: 36px; padding: 4px 8px; max-width: 150px; font-size: 12px; }
.attrs-mini { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11px; color: var(--muted); margin-top: 4px; } .attrs-mini b { color: var(--light); }
.conds { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }

/* 별·바·칩 */
.stars { --v: 0%; display: inline-block; font-size: 15px; letter-spacing: 1px; line-height: 1; background: linear-gradient(90deg, var(--gold) var(--v), #35483f var(--v)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.stars--pot { font-size: 11px; background: linear-gradient(90deg, var(--blue) var(--v), #35483f var(--v)); -webkit-background-clip: text; background-clip: text; }
.bar { display: inline-block; width: 60px; height: 6px; background: #0a110e; border-radius: 99px; overflow: hidden; vertical-align: middle; } .bar i { display: block; height: 100%; background: var(--turf); border-radius: 99px; }
.bar.xp i { background: var(--blue); } .bar.low i { background: var(--debit); } .bar.atk i { background: var(--debit); } .bar.def i { background: var(--blue); }
.chip { display: inline-block; padding: 2px 8px; border-radius: 99px; background: var(--surface-hi); border: 1px solid var(--line); font-size: 11px; color: var(--muted); }
.chip.good { color: #7fd69a; border-color: #2f6b45; } .chip.bad { color: #ff8a82; border-color: #7a2f2a; } .chip.gold { color: var(--gold); border-color: #7a5b1c; }
.ratings { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; } .ratings > div { background: var(--surface); border-radius: var(--r-md); padding: 8px 10px; display: grid; gap: 4px; } .ratings .bar { width: 100%; }

/* 표·경기 */
.tbl { width: 100%; border-collapse: collapse; font-size: 12px; } .tbl th { color: var(--muted); font-weight: 400; text-align: right; padding: 6px 4px; } .tbl td { text-align: right; padding: 7px 4px; border-top: 1px solid var(--line-soft); }
.tbl th:nth-child(2), .tbl td.tn { text-align: left; } .tbl td.tn { display: flex; align-items: center; gap: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .tbl tr.me td { background: rgba(76,168,106,.14); font-weight: 700; }
.tbl tr.up td:first-child { box-shadow: inset 3px 0 var(--turf); } .tbl tr.po td:first-child { box-shadow: inset 3px 0 var(--gold); } .tbl tr.down td:first-child { box-shadow: inset 3px 0 var(--debit); } .tbl--s td, .tbl--s th { text-align: center; }
.legend { font-size: 11px; color: var(--muted); display: flex; gap: 12px; align-items: center; } .lg { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 4px; } .lg.up { background: var(--turf); } .lg.po { background: var(--gold); } .lg.down { background: var(--debit); }
.summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; } .summary > div { background: var(--surface); border-radius: var(--r-md); padding: 10px 4px; text-align: center; } .summary b { display: block; font-family: var(--num); font-size: 26px; } .summary small { font-size: 10px; }
.matches { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 4px; }
.m { display: grid; grid-template-columns: 26px 1fr auto 1fr; gap: 6px; align-items: center; background: var(--surface); padding: 8px; border-radius: var(--r-md); font-size: 12px; border-left: 3px solid var(--muted); }
.m.w { border-left-color: var(--turf); } .m.l { border-left-color: var(--debit); } .m__r { font-weight: 800; } .m__t { display: flex; align-items: center; gap: 4px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; } .m__t--r { justify-content: flex-end; } .m__s { font-family: var(--num); font-size: 16px; }
.events { list-style: none; padding: 0; margin: 0 0 12px; display: grid; gap: 4px; font-size: 13px; }

/* 이벤트·팁·플래시 */
.event { border-color: #3a5a4a; } .opt { display: grid; gap: 6px; width: 100%; text-align: left; background: var(--surface-hi); border: 1px solid var(--line); border-radius: var(--r-md); padding: 10px 12px; margin-top: 8px; min-height: 44px; } .opt:hover:not(:disabled) { border-color: var(--turf); } .opt:disabled { opacity: .4; } .opt span { display: flex; gap: 4px; flex-wrap: wrap; }
.tip { background: #1d3328; border: 1px solid var(--turf); border-radius: var(--r-lg); padding: 12px 14px; margin-bottom: 12px; display: grid; gap: 8px; justify-items: start; } .tip p { margin: 0; }
.flash { background: var(--surface-hi); border: 1px solid var(--gold); color: var(--gold); border-radius: var(--r-md); padding: 10px 12px; margin-bottom: 12px; }
.steps { list-style: none; display: flex; gap: 6px; padding: 0; margin: 0 0 14px; } .steps li { flex: 1; text-align: center; padding: 6px 0; font-size: 12px; color: var(--muted); border-bottom: 2px solid var(--line); } .steps li.on { color: var(--turf); border-color: var(--turf); font-weight: 700; }

/* 시트 */
.sheet { position: fixed; inset: 0; z-index: 20; background: rgba(0,0,0,.6); display: grid; align-items: end; justify-items: center; }
.sheet__box { position: relative; width: min(460px, 100%); max-height: 88dvh; overflow: auto; background: var(--surface); border-radius: 18px 18px 0 0; padding: 20px 16px 28px; border-top: 1px solid var(--line); display: grid; gap: 12px; }
.sheet__head { display: flex; gap: 14px; align-items: center; } .sheet__head p { margin: 2px 0; color: var(--muted); } .x { position: absolute; right: 10px; top: 8px; width: 40px; height: 40px; color: var(--muted); font-size: 18px; }
.attr { display: grid; grid-template-columns: 70px 1fr 30px; gap: 8px; align-items: center; font-size: 13px; margin-bottom: 4px; } .attr .bar { width: 100%; height: 8px; } .attr b { text-align: right; font-family: var(--num); }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; } .kv dt { color: var(--muted); } .kv dd { margin: 0; text-align: right; }
.medals { display: flex; flex-wrap: wrap; gap: 6px; }
.end { padding-top: 40px; } .end h1 { font-size: 40px; margin-bottom: 4px; }
.portrait { image-rendering: pixelated; border-radius: 6px; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
```

- [ ] **Step 3: 앱 연결** — `next/ui/app.mjs`

```js
import { setRest } from '../engine/condition.mjs';
import { generateCoachCandidates, hireCoach, setIntensity } from '../engine/coach.mjs';
import { expandCap, upgradeFacility } from '../engine/economy.mjs';
import {
  acceptTrade, answerInterview, answerPress, createGame, finishSeason, incomingTrade, leagueAiTeams, playNextChunk,
  proposeTrade, retireManager, startDraftPick,
} from '../engine/game.mjs';
import { inductHallOfFame } from '../engine/honors.mjs';
import { nameOf } from '../engine/names.mjs';
import {
  beginOffseason, closeDraft, closeMarket, declineResign, draftChoose, offerFreeAgent, offerResign, openMarket,
  placeRookie, releaseStar, renewCoachContract, startSeason,
} from '../engine/offseason.mjs';
import { SAVE_KEY, readSave, writeSave } from '../engine/save.mjs';
import { REASON_TEXT, esc } from './components.mjs';
import {
  chunkScreen, endScreen, hubScreen, offseasonScreen, playerSheet, seasonScreen, startDraftScreen, titleScreen,
} from './screens.mjs';

const TIPS_KEY = 'fm-lite-tips';
const root = document.getElementById('screen');
let game = null;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장소가 막혀 있어도 게임은 계속된다 */ } },
  remove(k) { try { localStorage.removeItem(k); } catch { /* 위와 같음 */ } },
};
const storage = { getItem: (k) => store.get(k), setItem: (k, v) => store.set(k, v) };

const ui = {
  view: 'hub', tab: 'roster', sheet: null, flash: null, modal: null, last: null, candidates: {}, rest: new Set(),
  tips: new Set(JSON.parse(store.get(TIPS_KEY) ?? '[]')),
};

function screenHtml() {
  if (!game) return titleScreen({ hasSave: Boolean(store.get(SAVE_KEY)) });
  switch (game.phase) {
    case 'startDraft': return startDraftScreen(game, ui);
    case 'manage': return ui.view === 'chunk' ? chunkScreen(game, ui) : hubScreen(game, ui);
    case 'seasonEnd': return chunkScreen(game, ui);
    case 'offseason': return game.off ? offseasonScreen(game, ui) : seasonScreen(game, ui);
    default: return ui.view === 'end' ? endScreen(game) : seasonScreen(game, ui);
  }
}

function modalHtml() {
  if (!ui.modal) return '';
  const { offer } = ui.modal;
  const mine = game.myTeam.stars.find((p) => p.id === offer.give.players[0]);
  const ai = leagueAiTeams(game).find((t) => t.id === offer.aiTeamId);
  const theirs = ai.stars.find((p) => p.id === offer.get.players[0]);
  const pick = offer.get.picks.length ? ` + 지명권 ${offer.get.picks.length}장` : '';
  return `<div class="sheet" role="dialog" aria-modal="true" aria-label="트레이드 제안"><div class="sheet__box">
    <h3>트레이드 제안</h3><p><b>${esc(nameOf(mine.id))}</b> ↔ <b>${esc(nameOf(theirs.id))}</b>${pick}</p>
    <button class="btn btn--primary btn--wide" data-act="tradeyes">받아들이기</button><button class="btn btn--wide" data-act="tradeno">거절</button></div></div>`;
}

let lastKey = '';
function render() {
  const key = `${game?.phase}|${game?.off?.step}|${ui.view}|${ui.tab}`;
  root.innerHTML = screenHtml() + (ui.sheet && game ? playerSheet(game, ui.sheet) : '') + modalHtml();
  if (key !== lastKey) { window.scrollTo(0, 0); lastKey = key; }
}

function persist() {
  if (!game) return;
  if (game.phase === 'ended') { store.remove(SAVE_KEY); return; }
  try { writeSave(game, storage); } catch { /* 용량 초과 등: 게임은 계속 */ }
}

const num = (id) => Number(document.getElementById(id)?.value);
const result = (r, ok) => { ui.flash = r.accepted ? ok : (REASON_TEXT[r.reason] ?? '거절당했어요'); };

const ACTIONS = {
  new(el) {
    const clubName = document.getElementById('club-name').value.trim() || '내 구단';
    game = createGame({ seed: (Date.now() & 0x7fffffff) || 1, clubName });
    ui.view = 'hub'; ui.tab = 'roster'; ui.rest.clear(); ui.candidates = {};
  },
  continue() { game = readSave(storage); ui.view = 'hub'; ui.rest.clear(); },
  newrun() { game = null; },
  sdraft(el) { startDraftPick(game, el.dataset.id); },
  tab(el) { ui.tab = el.dataset.v; ui.flash = null; },
  sheet(el) { ui.sheet = el.dataset.id; },
  closesheet() { ui.sheet = null; },
  tip(el) { ui.tips.add(el.dataset.id); store.set(TIPS_KEY, JSON.stringify([...ui.tips])); },
  rest(el) { const id = el.dataset.id; if (ui.rest.has(id)) ui.rest.delete(id); else ui.rest.add(id); },
  upgrade(el) { upgradeFacility(game.club, el.dataset.kind); },
  capup() { expandCap(game.club); },
  intensity(el) { setIntensity(game.myTeam.coaches[el.dataset.kind], el.dataset.v); },
  coachfind(el) { ui.candidates[el.dataset.kind] = generateCoachCandidates(game.rng, { kind: el.dataset.kind, prefix: `C${game.world.year}${el.dataset.kind[0]}${Date.now() % 1000}` }); },
  hire(el) {
    const kind = el.dataset.kind;
    const cand = ui.candidates[kind].find((c) => c.id === el.dataset.id);
    hireCoach(game.club, game.myTeam, cand);
    ui.candidates[kind] = null;
  },
  tradein() {
    const offer = incomingTrade(game);
    if (offer) ui.modal = { offer }; else ui.flash = '지금은 들어온 제안이 없어요';
  },
  tradeyes() { acceptTrade(game, ui.modal.offer); ui.modal = null; ui.flash = '트레이드가 성사되었어요'; },
  tradeno() { ui.modal = null; },
  tradeout() {
    const mine = document.getElementById('tr-mine').value;
    const [aiTeamId, theirs] = document.getElementById('tr-theirs').value.split(':');
    const r = proposeTrade(game, { aiTeamId, give: { players: [mine], picks: [] }, get: { players: [theirs], picks: [] } });
    ui.flash = r.accepted ? '상대가 받아들였어요. 트레이드 성사!' : ({ value: '상대가 가치가 모자란다고 거절했어요', cap: '샐러리캡 때문에 거절했어요', mood: '사기가 낮은 선수라 상대가 거절했어요' }[r.reason] ?? '거절당했어요');
  },
  play() {
    setRest(game.myTeam, [...ui.rest]);
    ui.last = playNextChunk(game);
    ui.rest.clear(); ui.flash = null; ui.view = 'chunk';
  },
  press(el) { answerPress(game, Number(el.dataset.i)); },
  interview(el) { answerInterview(game, el.dataset.id, Number(el.dataset.i)); },
  back() { ui.view = 'hub'; },
  finish() { finishSeason(game); },
  toend() { ui.view = 'end'; },
  retire() { retireManager(game); ui.view = 'end'; },
  hall(el) { inductHallOfFame(game.history, el.dataset.id); },
  offseason() { beginOffseason(game); ui.flash = null; },
  resign(el) { result(offerResign(game, el.dataset.id, num(`sal-${el.dataset.id}`)), '재계약했어요'); },
  decline(el) { declineResign(game, el.dataset.id); },
  renewcoach(el) { renewCoachContract(game, el.dataset.kind); },
  openmarket() { openMarket(game); ui.flash = null; },
  offerfa(el) { result(offerFreeAgent(game, el.dataset.id, num(`sal-${el.dataset.id}`)), '영입했어요!'); },
  release(el) { releaseStar(game, el.dataset.id); },
  closemarket() { closeMarket(game); ui.flash = null; },
  dpick(el) { draftChoose(game, el.dataset.id); },
  closedraft() { closeDraft(game); },
  place(el) { placeRookie(game, el.dataset.id, document.getElementById(`out-${el.dataset.id}`)?.value ?? null); ui.flash = null; },
  startseason() { startSeason(game); ui.view = 'hub'; ui.tab = 'roster'; ui.flash = null; },
};
const UI_ONLY = new Set(['tab', 'sheet', 'closesheet', 'tip', 'rest', 'coachfind', 'tradeno', 'newrun', 'back', 'toend']);

root.addEventListener('click', (e) => {
  if (e.target.closest('input, select, option, label')) return;
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  try {
    ACTIONS[act](el);
    if (!UI_ONLY.has(act)) persist();
  } catch (err) {
    ui.flash = err.message;
  }
  render();
});

window.fmLite = { get game() { return game; }, ui };
render();
```

- [ ] **Step 4: 브라우저로 끝까지 확인**

```bash
python3 -m http.server 8080
```

`http://localhost:8080/next/index.html`을 모바일 너비(375px)로 열고 아래를 확인한다. 콘솔에 오류가 없어야 한다.

1. 제목 화면에서 구단 이름을 넣고 새 게임 시작 -> 시작 드래프트에서 3명 지명 -> 로스터에 스타 6명.
2. 순위 탭에 20팀이 보이고, 프런트 탭에서 시설 업그레이드·코치 강도 변경·새 코치 찾기가 되며, 코인이 모자라면 버튼이 흐려진다.
3. 로스터에서 선수 한 명을 `쉬게 하기` -> 구간 진행 -> 결과 화면(14경기, 기자회견 선택, 면담 선택) -> 두 번 더 진행 -> `시즌 마무리`.
4. 시즌 종료 화면에 순위·챔피언스리그·시상·승강전이 나오고 `오프시즌 시작` -> 재계약 -> FA 시장(영입 조건과 거절 사유 문구) -> 드래프트 -> 신인 배치 -> 2년차 시작.
5. 새로고침해도 제목 화면의 `이어하기`로 같은 자리에서 이어진다. 구단 이름에 `<b>`를 넣어도 글자로만 보인다.
6. 첫 진입 때 팁이 뜨고 `알겠어요`를 누르면 다시 뜨지 않는다.

- [ ] **Step 5: 커밋**

```bash
git add next/index.html next/ui/style.css next/ui/app.mjs
git commit -m "feat(next): 앱 연결·스타일·튜토리얼 팁(브라우저에서 한 판 완주 확인)"
```

---

### Task 4: 전체 확인

- [ ] **Step 1: 전체 테스트**

Run: `node --test next/tests/*.test.mjs`
Expected: PASS (234 tests, 0 fail: 앞선 계획의 221개 + 이 계획의 13개). 기존 게임: `node --test tests/*.test.mjs`도 그대로 통과.

## Self-Review

**Spec coverage** (이 계획이 맡는 부분)
- 11절 화면 목록: 타이틀(`titleScreen`), 시작 드래프트(`startDraftScreen`), 로스터(`hubScreen` roster), 선수 상세(`playerSheet`: 시즌·통산·메달 줄), 경기 결과(`chunkScreen`: 득점표 대신 경기 목록·수입·레벨업·부상), 기자회견·선수 면담(`chunkScreen`의 이벤트 카드), 프런트 오피스(`hubScreen` front: 캡 바, 시설 3, 코치 2, 트레이드), FA 협상·드래프트(`offseasonScreen`), 트레이드 제안(프런트의 제안 확인 시트와 맞교환 제안), 기록실·트로피·역대 우승팀·명예의 전당(`hubScreen` records), 시즌 시상(`seasonScreen`), 런 종료 정산(`endScreen`).
- 12절 비주얼(기존 현재 톤, 카드·알약, 도트 초상화·엠블럼) -> 복사한 `portrait` `crest2`와 손으로 쓴 CSS.
- 1절 성공 기준 (1) 카드만 보고 누가 좋은지·누구를 키울지 안다 -> `playerCard`(현재·잠재 별, XP 바, 컨디션, 사기 표정, 계약).
- 첫 판 안내(튜토리얼) -> 화면마다 처음 한 번 뜨는 팁 8종(기존 게임의 스크립트형 16단계 튜토리얼보다 가볍게 시작하고, 실제 플레이 후 필요한 단계를 늘린다).
- 이 계획에서 하지 않는 것: 경기 결과의 득점표(득점자 목록)와 순위 추이 그래프, 시상 연출·은퇴식 연출·애니메이션, 선수 개별 기록실 화면(선수 시트와 기록실 요약으로 대체), 지명권을 이용한 트레이드 화면(선수 맞교환만 화면에 있고 엔진은 지명권도 지원), 효과음, 접근성 정밀 점검(기본만 반영), 배포 경로 설정(저장소 `fm-lite` 브랜치를 사이트로 올리는 일은 사용자 결정), 수치 튜닝과 밸런스 시뮬.

**Placeholder scan:** 모든 단계에 실제 코드와 명령이 있다. "TBD" 없음.

**Type consistency:** `ui` 상태 필드(`view` `tab` `rest` `tips` `flash` `candidates` `last`)는 `screens.mjs`가 읽고 `app.mjs`가 만든다. `data-act` 이름은 Task 2의 인터페이스 목록과 Task 3의 `ACTIONS` 키가 일대일로 같다. `teamName` `crest`는 내 팀(`ME`)에는 `game.clubName`을, AI 팀에는 `teamIdentity`를 쓴다. 이벤트 `effects` 키(`teamMood` `playerMood` `fans` `coins` `rest`)는 계획 4의 데이터와 `effectChips`가 같다.

**검증 메모:** 이 계획의 코드는 계획 7까지 끝난 `next/`를 임시 폴더에 복사해 만들었고 `node --test`로 234개가 모두 통과하는 것을 확인했다. 화면은 브라우저(모바일 375px)에서 새 게임, 시작 드래프트, 한 시즌 전체(구간 3번, 기자회견·면담, 시즌 종료 시상), 오프시즌 전 단계(재계약·FA·드래프트·신인 배치), 2년차 진입, 저장 후 이어하기까지 직접 돌려 콘솔 오류 없음을 확인했다.

## 후속 작업 (계획 밖)

| 항목 | 내용 |
|---|---|
| 밸런스 | 시뮬로 시즌당 승점 분포, 코인 수입·지출 곡선, 경질 빈도, 한 시즌 소요 시간(목표 6~8분)을 측정해 상수를 조정 |
| 미정 사항 | 승강전 세부, 상 이름과 목록, 챔피언스리그 조별 형식, 내가 제안하는 트레이드의 수락 기준, 커리어 점수식(모두 초기값이 들어 있고 한 곳에서 고칠 수 있다) |
| 화면 보강 | 득점표, 지명권 트레이드, 시상·은퇴식 연출, 튜토리얼 단계 확장 |
| 배포 | `next/`를 어떤 주소로 공개할지(현재는 `fm-lite` 브랜치에만 있고 배포 사이트는 기존 게임 그대로) |
