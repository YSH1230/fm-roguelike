# FM-Lite 게임 흐름 구현 계획 (계획 7/8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앞선 계획 1~6의 엔진을 하나의 게임으로 이어 붙인다. 새 게임(스타 3명 배정 + 시작 드래프트), 구간 진행, 시즌 종료(챔피언스리그·시상·승강·감독 운명), 오프시즌(은퇴·재계약·FA·드래프트·신인 배치), 런 종료(은퇴·경질), 저장과 불러오기를 화면 없이 만들고 테스트로 고정한다.

**Architecture:** `game` 객체 하나가 모든 상태를 쥐고, `game.phase`(`startDraft` / `manage` / `seasonEnd` / `offseason` / `ended`)와 오프시즌의 `game.off.step`(`resign` / `market` / `draft` / `rookies`)이 허용되는 동작을 정한다. 각 동작은 단계가 맞지 않으면 명확한 오류를 낸다. 화면(계획 8)은 이 함수들만 부르면 된다. 저장은 선수 객체가 팀 안에서 여러 곳에 공유되는 구조를 id로 풀어 적고 불러올 때 다시 이어 붙이며, 난수는 새 씨앗으로 이어 쓴다.

**Tech Stack:** 순수 ES 모듈(`.mjs`), Node 내장 테스트러너, 외부 의존성 0, 빌드 없음.

**Spec:** `docs/superpowers/specs/2026-10-16-fm-lite-next-design.md` (2절 시즌 구조와 종료 순서, 7절 선수 확보와 시작, 10.5절 런의 끝)

## Global Constraints

- 새 파일은 `next/` 아래에만 만든다. 기존 게임은 건드리지 않는다. 앞선 계획의 파일 중 고치는 것은 `constants.mjs`(추가만)와 `tests/helpers.mjs`(자동 감독 추가)뿐이다. 이름 풀은 기존 게임의 `data/name-pools.mjs`를 `next/data/`에 복사해서 쓴다(원본은 그대로).
- 엔진에서 `Math.random`, `document`, `window`, `localStorage`를 쓰지 않는다. 저장소는 `getItem` `setItem`을 가진 객체를 인자로 받는다.
- 주석과 사용자에게 보이는 문구는 한국어, 문구에 em 대시를 쓰지 않는다.
- 시즌 종료 순서: 마지막 구간 -> 챔피언스리그 -> 시상 -> 기록 -> 승강(단판 포함) -> 감독 운명 -> (경질이면 종료) -> 오프시즌: 나이·은퇴 -> 재계약 -> FA -> 드래프트 -> 다음 시즌.
- 시작: 스타 3명 배정(수비·미드·공격) + 시작 드래프트로 3명 선택, 3부에서 시작, 코인 30.
- 스타는 최대 6명이다. 가득 찬 상태에서 영입·신인 배치는 자리를 비운 뒤에만 된다.
- 경질은 즉시 런 종료(유예 없음). 감독 은퇴는 시즌 종료 직후 오프시즌을 시작하기 전에만 선택한다.

## Review Focus

1. **단계에 맞지 않는 호출(시작 드래프트 중 시즌 진행, 4번째 드래프트 선택, 시즌 종료 전 오프시즌)**: 명확한 오류여야 하고 상태가 바뀌지 않아야 한다 (Task 1, 2).
2. **경질된 시즌 뒤의 진행, 오프시즌이 시작된 뒤의 감독 은퇴**: 막혀야 한다 (Task 1, 2).
3. **스타 6명이 가득 찬 상태의 FA 영입과 신인 배치, 지명권이 0장인 시즌의 드래프트**: `roster` 거절, 내보낼 스타 지정 요구, 오류 없이 AI만 지명 (Task 2).
4. **재계약 거절, 코치 계약 만료, 재계약 대상이 아닌 id**: 선수는 FA로 풀리고 코치는 1별 신임 코치로 바뀌며 잘못된 id는 오류 (Task 2).
5. **저장 후 불러오기**: 팀·선수 객체 공유와 Map이 복원되고, 저장 직후 이어한 게임과 같은 결과가 나오며, 버전이 다르면 오류 (Task 3).

---

### Task 1: 이름, 새 게임, 구간 진행, 시즌 종료, 트레이드

**Files:**
- Modify: `next/engine/constants.mjs` (맨 아래에 추가)
- Create: `next/data/name-pools.mjs`(복사), `next/engine/names.mjs`, `next/engine/game.mjs`
- Test: `next/tests/game.test.mjs`

**Interfaces:**
- Consumes: 계획 1~6 전체(`createTeam` `createCoach` `createWorld` `playWorldChunk` `lineupView` `chunkStep` `chunkIncome` `pickPress` `proposeAi` `executeTrade` `aiAccepts` `playChampions` `buildRows` `computeAwards` `resolveLadder` `managerFate` `recordSeason` `recordMyTeam` `careerSummary` 등)
- Produces: `nameOf(playerId) -> '이름 성'`, `regionTeams(world)`, `createGame({ seed, name })`, `startDraftPick(game, playerId)`, `playNextChunk(game) -> { chunk, matches, won, drawn, lost, income, steps, press, interviews }`, `answerPress(game, optionIndex)`, `answerInterview(game, playerId, optionIndex)`, `leagueAiTeams(game)`, `pickSlots(game)`, `incomingTrade(game)`, `acceptTrade(game, offer)`, `proposeTrade(game, offer)`, `finishSeason(game) -> game.season`, `retireManager(game)`, `myMatches(results, id)`. 상수 `START_PROSPECTS` `START_ASSIGNED` `START_PICKS` `CL_PRIZE`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/game.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { nameOf } from '../engine/names.mjs';
import {
  acceptTrade, answerInterview, answerPress, createGame, finishSeason, incomingTrade, leagueAiTeams, myMatches,
  pickSlots, playNextChunk, proposeTrade, retireManager, startDraftPick,
} from '../engine/game.mjs';
import { allTeams } from '../engine/world.mjs';
import { payroll } from '../engine/contract.mjs';

function started(seed = 1) {
  const g = createGame({ seed });
  for (const p of g.startDraft.pool.slice(0, 3)) startDraftPick(g, p.id);
  return g;
}

test('이름은 선수 id만으로 정해져 늘 같고, id가 다르면 대체로 다르다', () => {
  assert.equal(nameOf('ME-s0'), nameOf('ME-s0'));
  assert.match(nameOf('ME-s0'), /^\S+ \S+$/);
  const names = new Set(Array.from({ length: 200 }, (_, i) => nameOf(`p${i}`)));
  assert.ok(names.size > 150);
});

test('새 게임: 3부 팀에 배정 스타 3명, 시작 드래프트 후보 12명, 코치 2명이 있다', () => {
  const g = createGame({ seed: 1 });
  assert.equal(g.phase, 'startDraft');
  assert.deepEqual(g.myTeam.stars.map((p) => p.position), ['DF', 'MF', 'FW']);
  assert.equal(g.startDraft.pool.length, 12);
  assert.equal(g.myTeam.tier, 3);
  assert.equal(g.myTeam.coaches.attack.kind, 'attack');
  assert.equal(g.club.coins, 30);
  assert.equal(g.myTeam.stars.every((p) => p.contract.years === 3), true);
});

test('시작 드래프트: 3명을 고르면 스타 6명이 되어 관리 단계로 넘어가고, 4번째 선택은 오류다', () => {
  const g = createGame({ seed: 2 });
  const [a, b, c, d] = g.startDraft.pool;
  startDraftPick(g, a.id);
  startDraftPick(g, b.id);
  assert.equal(g.phase, 'startDraft');
  startDraftPick(g, c.id);
  assert.equal(g.phase, 'manage');
  assert.equal(g.myTeam.stars.length, 6);
  assert.equal(g.myTeam.lineup.length, 11);
  assert.throws(() => startDraftPick(g, d.id), /지금은 할 수 없습니다/);
});

test('시작 드래프트 전에는 시즌을 진행할 수 없다', () => {
  assert.throws(() => playNextChunk(createGame({ seed: 3 })), /지금은 할 수 없습니다/);
});

test('구간 진행: 14경기를 치르고 수입이 들어오며 기자회견이 나온다', () => {
  const g = started(4);
  const coins = g.club.coins;
  const r = playNextChunk(g);
  assert.equal(r.chunk, 1);
  assert.equal(r.matches.length, 14);
  assert.equal(r.won + r.drawn + r.lost, 14);
  assert.equal(g.club.coins, coins + r.income.total);
  assert.equal(r.press.options.length, 2);
  assert.equal(g.phase, 'manage');
  assert.equal(myMatches(r.matches, 'ME').length, 14);
});

test('세 구간 뒤 시즌 종료 단계가 되고 더 진행하면 오류다', () => {
  const g = started(5);
  playNextChunk(g); playNextChunk(g);
  const last = playNextChunk(g);
  assert.equal(last.matches.length, 10);
  assert.equal(g.phase, 'seasonEnd');
  assert.throws(() => playNextChunk(g), /지금은 할 수 없습니다/);
});

test('기자회견과 면담에 답하면 효과가 적용되고 목록에서 사라진다', () => {
  const g = started(6);
  playNextChunk(g);
  const before = g.club.fans;
  answerPress(g, 0);
  assert.equal(g.pending.press, null);
  assert.throws(() => answerPress(g, 0), /기자회견이 없습니다/);
  assert.ok(Number.isFinite(g.club.fans) && g.club.fans >= 0 && before >= 0);
  g.pending.interviews = [];
  assert.throws(() => answerInterview(g, 'ME-s0', 0), /면담이 없습니다/);
});

test('쉬게 지정한 스타는 그 구간에 출전하지 않는다', async () => {
  const { setRest } = await import('../engine/condition.mjs');
  const g = started(7);
  const rested = g.myTeam.stars[5];
  setRest(g.myTeam, [rested.id]);
  playNextChunk(g);
  assert.equal(rested.stats.apps, 0);
  assert.equal(g.myTeam.stars[0].stats.apps, 14); // 구간 중 부상은 구간이 끝난 뒤에 정해진다
});

test('시즌 종료: 시상·승강·감독 운명이 정해지고 기록이 쌓인다', () => {
  const g = started(8);
  playNextChunk(g); playNextChunk(g); playNextChunk(g);
  const s = finishSeason(g);
  assert.ok(['stay', 'promoted', 'fired'].includes(s.fate));
  assert.equal(Object.keys(s.awards).length, 6);
  assert.equal(g.history.mySeasons.length, 1);
  assert.equal(g.history.champions.length, 1);
  assert.equal(g.phase, s.fate === 'fired' ? 'ended' : 'offseason');
  assert.equal(s.draftStandings.length, 20);
});

test('경질이면 런이 끝나고 요약이 붙는다', () => {
  const g = started(9);
  playNextChunk(g); playNextChunk(g); playNextChunk(g);
  const s = finishSeason(g);
  if (s.fate === 'fired') {
    assert.equal(g.end.reason, 'fired');
    assert.equal(g.end.summary.seasons, 1);
  } else {
    assert.equal(g.end, null);
  }
});

test('감독 은퇴: 시즌 종료 직후에만 가능하고 런이 끝난다', () => {
  const g = started(10);
  assert.throws(() => retireManager(g), /지금은 할 수 없습니다/);
  for (let i = 0; i < 3; i += 1) playNextChunk(g);
  finishSeason(g);
  if (g.phase === 'offseason') {
    retireManager(g);
    assert.equal(g.end.reason, 'retired');
    assert.equal(g.phase, 'ended');
  }
});

test('트레이드: AI 제안을 받으면 선수가 바뀌고, 내가 한 제안은 상대 기준으로 판정된다', () => {
  const g = started(11);
  const offer = incomingTrade(g);
  assert.ok(offer);
  const mine = g.myTeam.stars.find((p) => p.id === offer.give.players[0]);
  const ai = leagueAiTeams(g).find((t) => t.id === offer.aiTeamId);
  const theirs = ai.stars.find((p) => p.id === offer.get.players[0]);
  g.club.coins += 0;
  try {
    acceptTrade(g, offer);
    assert.ok(g.myTeam.stars.includes(theirs) && ai.stars.includes(mine));
    assert.equal(g.myTeam.stars.length, 6);
  } catch (e) {
    assert.match(e.message, /샐러리캡/); // 캡을 넘는 제안이면 막힌다
  }
  assert.ok(payroll(g.myTeam) >= 0);
  const slots = pickSlots(g);
  assert.equal(slots.size, 20);
  const bad = { aiTeamId: leagueAiTeams(g)[0].id, give: { players: [], picks: [] }, get: { players: [], picks: [] } };
  assert.equal(proposeTrade(g, bad).reason, 'invalid');
  assert.throws(() => proposeTrade(g, { ...bad, aiTeamId: 'nobody' }), /상대 팀/);
  assert.equal(allTeams(g.world).length, 200);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/game.test.mjs`
Expected: FAIL (`Cannot find module '../engine/game.mjs'`)

- [ ] **Step 3: 이름 풀 복사**

```bash
mkdir -p next/data
cp data/name-pools.mjs next/data/name-pools.mjs
```

- [ ] **Step 4: 상수 추가**

`next/engine/constants.mjs` 맨 아래에 붙인다

```js
// ---- 계획 7: 게임 흐름 ----
export const START_PROSPECTS = 12; // 시작 드래프트 후보 수(이 중 3명을 고른다)
export const START_ASSIGNED = ['DF', 'MF', 'FW']; // 배정되는 스타 3명의 포지션
export const START_PICKS = 3;
export const CL_PRIZE = 300; // 챔피언스리그 우승 상금(코인)
```

- [ ] **Step 5: 이름 구현**

`next/engine/names.mjs`

```js
import { NAME_POOLS, randomName } from '../data/name-pools.mjs';
import { createRng } from './rng.mjs';

const CONTINENTS = Object.keys(NAME_POOLS);

// 선수 id만으로 정해지는 이름. 저장할 필요 없이 언제 불러도 같은 이름이 나온다.
export function nameOf(id) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rng = createRng(h >>> 0);
  return randomName(CONTINENTS[Math.floor(rng() * CONTINENTS.length)], rng);
}
```

- [ ] **Step 6: 구현** — `next/engine/game.mjs`

```js
import { CL_PRIZE, MY_REGION, SALARY_CAP, SEASON, START_ASSIGNED, START_PICKS, START_PROSPECTS } from './constants.mjs';
import { askingSalary, newContract } from './contract.mjs';
import { createCoach } from './coach.mjs';
import {
  autoPickUntil, createDraft, draftPick, draftedBy, generateProspects, grantPicks,
} from './draft.mjs';
import { createClub, chunkIncome, earn, fansAfterChunk, salaryCap, seasonPrize } from './economy.mjs';
import { applyChoice, interviewFor, pickPress, pressSituation } from './events.mjs';
import { chunkStep, lineupView, snapshotStats } from './condition.mjs';
import { createRng } from './rng.mjs';
import { setStars } from './roster.mjs';
import { createTeam } from './team.mjs';
import { allTeams, createWorld, leagueKey, myLeague, playWorldChunk } from './world.mjs';
import { standings } from './league.mjs';
import { aiAccepts, executeTrade, proposeAi } from './trade.mjs';
import { collectStats, createHistory, diffStats, recordSeason } from './records.mjs';
import { buildRows, computeAwards, giveAwards } from './awards.mjs';
import { playChampions } from './champions.mjs';
import { managerFate, resolveLadder } from './ladder.mjs';
import { careerSummary, recordChampions, recordMyTeam } from './honors.mjs';

export const regionTeams = (world) => allTeams(world).filter((t) => t.region === MY_REGION);

// 새 게임: 3부 팀, 배정된 스타 3명, 코치 2명, 시작 드래프트(3명 선택) 대기.
export function createGame({ seed = 1, name = '감독' } = {}) {
  const rng = createRng(seed);
  const myTeam = createTeam({ rng, id: 'ME', attackStars: 2, defenseStars: 2, starLevel: 50, starPositions: START_ASSIGNED });
  myTeam.coaches.attack = createCoach({ rng, id: 'ME-ca', kind: 'attack', stars: 2 });
  myTeam.coaches.defense = createCoach({ rng, id: 'ME-cd', kind: 'defense', stars: 2 });
  for (const p of myTeam.stars) p.contract = newContract(Math.max(1, Math.round(askingSalary(p) * 0.6)));
  const world = createWorld({ rng, myTeam });
  grantPicks(regionTeams(world), 1);
  const order = Array.from({ length: START_PICKS }, (_, i) => ({ slot: i + 1, from: 'ME', owner: 'ME' }));
  return {
    seed, rng, name, world, myTeam, club: createClub(), history: createHistory(),
    phase: 'startDraft', chunk: 0, pending: { press: null, interviews: [] }, season: null, off: null, end: null,
    startDraft: createDraft({ prospects: generateProspects(rng, { count: START_PROSPECTS, prefix: 'S1' }), order }),
  };
}

const need = (game, phase) => {
  if (game.phase !== phase) throw new Error(`지금은 할 수 없습니다 (단계: ${game.phase}, 필요: ${phase})`);
};

// 시작 드래프트에서 한 명 고른다. 3명을 다 고르면 첫 시즌 관리 단계로 넘어간다.
export function startDraftPick(game, playerId) {
  need(game, 'startDraft');
  const player = draftPick(game.startDraft, 'ME', playerId);
  if (game.startDraft.next >= START_PICKS) {
    setStars(game.myTeam, game.rng, [...game.myTeam.stars, ...draftedBy(game.startDraft, 'ME')]);
    game.phase = 'manage';
  }
  return player;
}

export const myMatches = (results, id) => results.filter((r) => r.homeId === id || r.awayId === id);

// 다음 구간(14/14/10라운드)을 모든 리그와 함께 돌린다.
export function playNextChunk(game) {
  need(game, 'manage');
  const { world, myTeam: team, club, rng } = game;
  const rounds = SEASON.chunks[game.chunk];
  const before = snapshotStats(team);
  const out = playWorldChunk(world, rng, { views: new Map([[team.id, lineupView(team, rng)]]) });
  const results = out.get(leagueKey(MY_REGION, team.tier));
  const steps = chunkStep({ team, before, rng, club, rounds });
  const income = chunkIncome(results, team.id, club, team.tier);
  earn(club, income.total);
  club.fans = fansAfterChunk(club.fans, results, team.id);
  const mine = myMatches(results, team.id);
  const tally = { won: 0, drawn: 0, lost: 0 };
  for (const r of mine) {
    const diff = (r.homeId === team.id ? 1 : -1) * (r.homeGoals - r.awayGoals);
    tally[diff > 0 ? 'won' : (diff < 0 ? 'lost' : 'drawn')] += 1;
  }
  game.chunk += 1;
  const press = pickPress(rng, pressSituation(tally));
  const interviews = team.stars.map((p) => ({ playerId: p.id, interview: interviewFor(rng, p) })).filter((x) => x.interview).slice(0, 2);
  game.pending = { press, interviews };
  game.phase = game.chunk >= SEASON.chunks.length ? 'seasonEnd' : 'manage';
  return { chunk: game.chunk, matches: mine, ...tally, income, steps, press, interviews };
}

export function answerPress(game, optionIndex) {
  const press = game.pending.press;
  if (!press) throw new Error('답할 기자회견이 없습니다');
  applyChoice({ club: game.club, team: game.myTeam, option: press.options[optionIndex] });
  game.pending.press = null;
}

export function answerInterview(game, playerId, optionIndex) {
  const at = game.pending.interviews.findIndex((x) => x.playerId === playerId);
  if (at < 0) throw new Error('이 선수의 면담이 없습니다');
  const player = game.myTeam.stars.find((p) => p.id === playerId);
  applyChoice({ club: game.club, team: game.myTeam, option: game.pending.interviews[at].interview.options[optionIndex], player });
  game.pending.interviews.splice(at, 1);
}

// ---- 트레이드: 상대는 내 리그의 AI 팀 ----
export const leagueAiTeams = (game) => [...myLeague(game.world).teams.values()].filter((t) => t.id !== game.myTeam.id);

// 원래 팀 id -> 예상 드래프트 슬롯(현재 순위가 낮을수록 앞 순번)
export function pickSlots(game) {
  const table = standings(myLeague(game.world));
  return new Map(table.map((r, i) => [r.id, table.length - i]));
}

const capsFor = (game, ai) => ({ myCap: salaryCap(game.club, game.myTeam.tier), aiCap: SALARY_CAP[ai.tier] });

// AI가 먼저 보내는 제안(없으면 null)
export function incomingTrade(game) {
  return proposeAi(game.rng, game.myTeam, leagueAiTeams(game), game.world.year);
}

export function acceptTrade(game, offer) {
  const ai = leagueAiTeams(game).find((t) => t.id === offer.aiTeamId);
  if (!ai) throw new Error('상대 팀을 찾을 수 없습니다');
  executeTrade({ offer, me: game.myTeam, ai, ...capsFor(game, ai), rng: game.rng });
}

// 내가 먼저 제안한다. 상대가 받아들이면 바로 실행하고 결과를 돌려준다.
export function proposeTrade(game, offer) {
  const ai = leagueAiTeams(game).find((t) => t.id === offer.aiTeamId);
  if (!ai) throw new Error('상대 팀을 찾을 수 없습니다');
  const result = aiAccepts({ offer, me: game.myTeam, ai, ...capsFor(game, ai), slots: pickSlots(game) });
  if (result.accepted) executeTrade({ offer, me: game.myTeam, ai, ...capsFor(game, ai), rng: game.rng });
  return result;
}

// ---- 시즌 종료: 마지막 구간 뒤 한 번 ----
// 챔피언스리그 -> 시상 -> 기록 -> 승강 확정 -> 감독 운명. 경질이면 런이 끝난다.
export function finishSeason(game) {
  need(game, 'seasonEnd');
  const { world, myTeam: team, club, history, rng } = game;
  const year = world.year;
  const tier = team.tier;
  const leagueStats = collectStats(world);
  const cl = playChampions(world, rng);
  const afterStats = collectStats(world);
  const rows = buildRows(world, leagueStats, afterStats);
  const awards = computeAwards(rows, { myLeagueKey: leagueKey(MY_REGION, tier), cl });
  giveAwards(history, awards, year, world);
  recordSeason(history, { year, leagueStats, clStats: diffStats(afterStats, leagueStats), myTeamId: team.id });
  recordChampions(history, { year, world, cl });
  const table = standings(myLeague(world));
  const outcome = resolveLadder(world, rng);
  const fate = managerFate(outcome, team.id);
  const rank = outcome.finalRank.get(team.id);
  const clChampion = cl.champion === team.id;
  const prize = seasonPrize(tier, rank === 1) + (clChampion ? CL_PRIZE : 0);
  earn(club, prize);
  recordMyTeam(history, { year, tier, rank, fate, clChampion, awards, myTeamId: team.id });
  const row = table.find((r) => r.id === team.id);
  game.season = {
    year, tier, rank, fate, awards, cl: { champion: cl.champion, runnerUp: cl.runnerUp }, outcome, prize,
    wins: row.won, draftStandings: table.map((r) => ({ id: r.id })),
  };
  if (fate === 'fired') {
    game.phase = 'ended';
    game.end = { reason: 'fired', summary: careerSummary(history) };
  } else {
    game.phase = 'offseason';
  }
  return game.season;
}

// 시즌 종료 시점에 감독 은퇴를 선택해 런을 끝낸다(오프시즌을 시작하기 전에만).
export function retireManager(game) {
  need(game, 'offseason');
  if (game.off) throw new Error('오프시즌이 이미 시작되었습니다');
  game.phase = 'ended';
  game.end = { reason: 'retired', summary: careerSummary(game.history) };
}
```

- [ ] **Step 7: 통과 확인**

Run: `node --test next/tests/game.test.mjs`
Expected: PASS (12 tests). 이어서 `node --test next/tests/*.test.mjs`로 앞선 테스트도 그대로 통과하는지 확인한다(204개).

- [ ] **Step 8: 커밋**

```bash
git add next/data/name-pools.mjs next/engine/constants.mjs next/engine/names.mjs next/engine/game.mjs next/tests/game.test.mjs
git commit -m "feat(next): 새 게임·시작 드래프트·구간 진행·시즌 종료·트레이드와 이름"
```


---

### Task 2: 오프시즌(은퇴·재계약·FA·드래프트·신인 배치)과 자동 감독

**Files:**
- Modify: `next/tests/helpers.mjs` (맨 아래에 자동 감독 추가)
- Create: `next/engine/offseason.mjs`
- Test: `next/tests/offseason.test.mjs`

**Interfaces:**
- Consumes: Task 1 `regionTeams`, 계획 2~6의 `evaluateResign` `resign` `releaseToPool` `generateFreeAgents` `evaluateOffer` `signFreeAgent` `aiSign` `draftOrder` `createDraft` `autoPickUntil` `draftedBy`, 계획 4 `endOfSeason`, 계획 5 `startNextSeason` `offseasonAi` `releaseAiPlayers` `integrateNamed`, 계획 6 `retirePlayer`
- Produces: `beginOffseason(game)`, `offerResign(game, playerId, salary) -> { accepted, reason }`, `declineResign(game, playerId)`, `renewCoachContract(game, kind)`, `openMarket(game) -> market`, `offerFreeAgent(game, playerId, salary) -> { accepted, reason }`(`roster` 이유 추가), `releaseStar(game, playerId)`, `closeMarket(game)`, `draftChoose(game, playerId)`, `draftBest(game)`, `draftTurnIsMine(game)`, `closeDraft(game) -> rookies`, `placeRookie(game, playerId, releaseId)`, `startSeason(game)`. 테스트 도우미 `startedGame(seed)`, `autoSeason(game)`, `autoOffseason(game)`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/offseason.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { finishSeason, playNextChunk } from '../engine/game.mjs';
import {
  beginOffseason, closeDraft, closeMarket, declineResign, draftChoose, draftTurnIsMine, offerFreeAgent, offerResign,
  openMarket, placeRookie, releaseStar, renewCoachContract, startSeason,
} from '../engine/offseason.mjs';
import { retireManager } from '../engine/game.mjs';
import { allTeams } from '../engine/world.mjs';
import { askingSalary } from '../engine/contract.mjs';
import { startedGame, autoSeason, autoOffseason } from './helpers.mjs';

// 경질되지 않은 시즌 종료 상태를 만든다(시드를 바꿔 가며).
function atOffseason() {
  for (let seed = 1; seed < 30; seed += 1) {
    const g = startedGame(seed);
    autoSeason(g);
    if (g.phase === 'offseason') return g;
  }
  throw new Error('경질되지 않는 시드를 찾지 못했습니다');
}

test('오프시즌 전에는 오프시즌 동작이 막힌다', () => {
  const g = startedGame(1);
  assert.throws(() => beginOffseason(g), /오프시즌을 시작할 수 없습니다/);
  assert.throws(() => openMarket(g), /오프시즌이 아닙니다/);
});

test('오프시즌 시작: 새 시즌 준비, 나이 +1, 계약 연수 -1, 재계약 대기열과 코치 계약이 생긴다', () => {
  const g = atOffseason();
  const ages = g.myTeam.stars.map((p) => [p.id, p.age]);
  const years = g.myTeam.stars.map((p) => [p.id, p.contract.years]);
  const off = beginOffseason(g);
  assert.equal(off.step, 'resign');
  assert.equal(g.world.year, 2);
  for (const [id, age] of ages) {
    const p = g.myTeam.stars.find((s) => s.id === id);
    if (p) assert.equal(p.age, age + 1);
  }
  for (const [id, y] of years) {
    const p = g.myTeam.stars.find((s) => s.id === id);
    if (p) assert.equal(p.contract.years, y - 1);
  }
  assert.ok(off.resignQueue.every((p) => p.contract.years <= 0));
  assert.equal(g.myTeam.coaches.attack.contract.years, 2);
  assert.throws(() => beginOffseason(g), /시작할 수 없습니다/);
});

test('재계약: 요구액에 못 미치면 거절하고 대기열에 남으며, 요구액 이상이면 3년 계약이 된다', () => {
  const g = atOffseason();
  beginOffseason(g);
  g.myTeam.stars.forEach((p) => { p.contract.years = 1; });
  g.off.resignQueue = [g.myTeam.stars[0]];
  const p = g.off.resignQueue[0];
  p.mood = 70;
  assert.equal(offerResign(g, p.id, 0).accepted, false);
  assert.equal(g.off.resignQueue.length, 1);
  g.myTeam.stars.forEach((s) => { s.contract.salary = 1; }); // 캡 여유를 충분히 둔다
  const ok = offerResign(g, p.id, askingSalary(p));
  assert.deepEqual(ok, { accepted: true, reason: null });
  assert.deepEqual(p.contract, { salary: askingSalary(p), years: 3 });
  assert.equal(g.off.resignQueue.length, 0);
  assert.throws(() => offerResign(g, 'ghost', 5), /재계약 대상이 아닙니다/);
});

test('재계약 거절 선수는 FA 시장에 나오고, 마감하면 대기열이 비며 시장이 10명 안팎이다', () => {
  const g = atOffseason();
  beginOffseason(g);
  const gone = g.off.resignQueue[0] ?? g.myTeam.stars[0];
  if (g.off.resignQueue.length === 0) g.off.resignQueue = [gone];
  declineResign(g, gone.id);
  const market = openMarket(g);
  assert.ok(market.length >= 6 && market.length <= 10);
  assert.ok(market.some((e) => e.player.id === gone.id));
  assert.equal(g.off.step, 'market');
  assert.equal(g.off.resignQueue.length, 0);
});

test('코치 재계약은 코인을 쓰고, 안 하면 1별 신임 코치로 바뀐다', () => {
  const g = atOffseason();
  beginOffseason(g);
  g.off.coachExpiring = [g.myTeam.coaches.attack, g.myTeam.coaches.defense];
  g.club.coins = 500;
  const before = g.club.coins;
  renewCoachContract(g, 'attack');
  assert.ok(g.club.coins < before);
  assert.equal(g.myTeam.coaches.attack.contract.years, 3);
  assert.throws(() => renewCoachContract(g, 'attack'), /대상 코치가 아닙니다/);
  openMarket(g);
  assert.equal(g.myTeam.coaches.defense.stars, 1);
  assert.equal(g.myTeam.coaches.defense.kind, 'defense');
});

test('FA 영입: 스타가 가득하면 roster로 거절, 방출 후엔 영입되어 시장에서 빠진다', () => {
  const g = atOffseason();
  beginOffseason(g);
  g.off.resignQueue = [];
  openMarket(g);
  g.club.coins = 999;
  // 영입 조건을 모두 풀어 협상이 금액과 자리만 문제가 되게 한다
  for (const e of g.off.market) e.conditions = {};
  const e = g.off.market[0];
  g.myTeam.stars.forEach((p) => { p.contract.salary = 1; });
  if (g.myTeam.stars.length >= 6) {
    assert.equal(offerFreeAgent(g, e.player.id, e.asking).reason, 'roster');
    releaseStar(g, g.myTeam.stars[0].id);
  }
  assert.equal(offerFreeAgent(g, e.player.id, e.asking).accepted, true);
  assert.ok(!g.off.market.includes(e));
  assert.ok(g.myTeam.stars.includes(e.player));
  assert.equal(g.myTeam.lineup.length, 11);
  assert.throws(() => offerFreeAgent(g, 'ghost', 5), /시장에 없는/);
});

test('시장 마감: 남은 FA는 AI 팀에 가고 AI 팀은 모두 스타 6명을 유지한다. 드래프트가 열린다', () => {
  const g = atOffseason();
  beginOffseason(g);
  g.off.resignQueue = [];
  openMarket(g);
  const left = g.off.market.length;
  const draft = closeMarket(g);
  assert.equal(g.off.aiSigned.length, left);
  assert.equal(g.off.step, 'draft');
  assert.equal(draft.order.length, 20);
  for (const t of allTeams(g.world)) if (t.id !== 'ME') assert.equal(t.stars.length, 6);
});

test('드래프트: 내 순번에 고르고 마감하면 신인이 계약과 함께 대기석에 오른다', () => {
  const g = atOffseason();
  beginOffseason(g);
  g.off.resignQueue = [];
  openMarket(g);
  closeMarket(g);
  assert.throws(() => closeDraft(g), /아직 끝나지/);
  let picks = 0;
  while (draftTurnIsMine(g)) {
    draftChoose(g, g.off.draft.pool[0].id);
    picks += 1;
  }
  assert.equal(picks, 1);
  const rookies = closeDraft(g);
  assert.equal(rookies.length, 1);
  assert.equal(rookies[0].contract.years, 3);
  assert.ok(g.myTeam.picks.every((k) => k.year === 2)); // 올해 지명권은 쓰였고 내년 지명권이 새로 생긴다
});

test('신인 배치: 자리가 없으면 내보낼 스타를 지정해야 한다', () => {
  const g = atOffseason();
  beginOffseason(g);
  g.off.resignQueue = [];
  openMarket(g);
  closeMarket(g);
  while (draftTurnIsMine(g)) draftChoose(g, g.off.draft.pool[0].id);
  closeDraft(g);
  const rookie = g.off.rookies[0];
  if (g.myTeam.stars.length >= 6) {
    assert.throws(() => placeRookie(g, rookie.id), /스타 자리가 없습니다/);
    placeRookie(g, rookie.id, g.myTeam.stars[0].id);
  } else {
    placeRookie(g, rookie.id);
  }
  assert.ok(g.myTeam.stars.includes(rookie));
  assert.ok(g.myTeam.stars.length <= 6);
  assert.throws(() => placeRookie(g, rookie.id), /대기 중인 신인이 아닙니다/);
  assert.equal(startSeason(g), 2);
  assert.equal(g.phase, 'manage');
  assert.equal(g.chunk, 0);
});

test('오프시즌이 시작되면 감독 은퇴를 선택할 수 없다', () => {
  const g = atOffseason();
  beginOffseason(g);
  assert.throws(() => retireManager(g), /이미 시작/);
});

test('자동 감독으로 5시즌을 돌려도 오류가 없고, 경질되지 않는 한 매 시즌 기록이 쌓인다', () => {
  let completed = 0;
  for (const seed of [3, 4, 5]) {
    const g = startedGame(seed);
    for (let y = 0; y < 5; y += 1) {
      autoSeason(g);
      if (g.phase === 'ended') break;
      autoOffseason(g);
      completed += 1;
      assert.ok(g.myTeam.stars.length <= 6 && g.myTeam.stars.length >= 3);
      assert.equal(g.myTeam.lineup.length, 11);
    }
    assert.equal(g.history.mySeasons.length >= 1, true);
    for (const t of allTeams(g.world)) assert.ok(t.lineup.length === 11);
  }
  assert.ok(completed >= 3);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/offseason.test.mjs`
Expected: FAIL (`Cannot find module '../engine/offseason.mjs'`)

- [ ] **Step 3: 테스트 도우미 추가**

`next/tests/helpers.mjs` 맨 아래에 붙인다(자동 감독: 계획 7 테스트가 같이 쓴다)

```js
// ---- 계획 7 테스트 공용: 자동으로 한 시즌과 오프시즌을 진행하는 간단한 감독 ----
import { askingSalary } from '../engine/contract.mjs';
import {
  createGame, finishSeason, playNextChunk, startDraftPick,
} from '../engine/game.mjs';
import {
  beginOffseason, closeDraft, closeMarket, draftBest, draftTurnIsMine, offerFreeAgent, offerResign, openMarket,
  placeRookie, releaseStar, startSeason,
} from '../engine/offseason.mjs';
import { overall } from '../engine/player.mjs';

export function startedGame(seed = 1) {
  const g = createGame({ seed });
  for (const p of g.startDraft.pool.slice(0, 3)) startDraftPick(g, p.id);
  return g;
}

export function autoSeason(g) {
  while (g.phase === 'manage') {
    playNextChunk(g);
    if (g.pending.press) g.pending.press = null;
  }
  return finishSeason(g);
}

export function autoOffseason(g) {
  beginOffseason(g);
  for (const p of [...g.off.resignQueue]) {
    offerResign(g, p.id, Math.max(askingSalary(p), 1)) ;
  }
  openMarket(g);
  for (const e of [...g.off.market].sort((a, b) => b.asking - a.asking)) {
    if (g.myTeam.stars.length >= 6) break;
    offerFreeAgent(g, e.player.id, e.asking);
  }
  closeMarket(g);
  while (draftTurnIsMine(g)) draftBest(g);
  closeDraft(g);
  for (const r of [...g.off.rookies]) {
    const weakest = [...g.myTeam.stars].sort((a, b) => overall(a) - overall(b))[0];
    if (g.myTeam.stars.length >= 6 && overall(weakest) >= overall(r)) continue;
    placeRookie(g, r.id, g.myTeam.stars.length >= 6 ? weakest.id : null);
  }
  return startSeason(g);
}

export { releaseStar };
```

- [ ] **Step 4: 구현** — `next/engine/offseason.mjs`

```js
import { FA_RELEASED, ROSTER_STARS } from './constants.mjs';
import { endOfSeason } from './aging.mjs';
import { offseasonAi, releaseAiPlayers, integrateNamed } from './aiWorld.mjs';
import { coachSeasonGrowth, createCoach, renewCoach, syncFillers, tickCoachContract } from './coach.mjs';
import { teamMorale } from './condition.mjs';
import { tickContracts } from './contract.mjs';
import {
  autoPickUntil, createDraft, draftOrder, draftPick, draftedBy, generateProspects, grantPicks, isDraftOver, spendPicks,
} from './draft.mjs';
import { negotiationClub } from './economy.mjs';
import {
  aiSign, evaluateOffer, evaluateResign, generateFreeAgents, releaseToPool, resign, signFreeAgent,
} from './freeAgency.mjs';
import { regionTeams } from './game.mjs';
import { startNextSeason } from './ladder.mjs';
import { retirePlayer } from './honors.mjs';
import { setStars } from './roster.mjs';
import { marketValue } from './contract.mjs';

const need = (game, step) => {
  if (game.phase !== 'offseason' || !game.off) throw new Error('오프시즌이 아닙니다');
  if (game.off.step !== step) throw new Error(`지금은 할 수 없습니다 (오프시즌 단계: ${game.off.step}, 필요: ${step})`);
};

const clubView = (game) => negotiationClub(game.club, {
  rank: game.season.rank, morale: teamMorale(game.myTeam), team: game.myTeam, tier: game.myTeam.tier,
});

// 1) 오프시즌 시작: 승강 반영 새 시즌 준비, 나이·은퇴, 계약 만료, AI 팀 변화, 코치 성장과 계약.
export function beginOffseason(game) {
  if (game.phase !== 'offseason' || game.off) throw new Error('오프시즌을 시작할 수 없습니다');
  const { world, myTeam: team, history, rng } = game;
  const year = game.season.year;
  startNextSeason(world, game.season.outcome);
  const retired = endOfSeason(team, rng).map((p) => retirePlayer(history, p, year));
  const expiring = tickContracts(team);
  const coachExpiring = [];
  for (const kind of ['attack', 'defense']) {
    const coach = team.coaches[kind];
    coachSeasonGrowth(coach, rng, { wins: game.season.wins });
    if (tickCoachContract(coach)) coachExpiring.push(coach);
  }
  syncFillers(team);
  offseasonAi(world, rng);
  const aiReleased = releaseAiPlayers(rng, regionTeams(world).filter((t) => t.id !== team.id), FA_RELEASED);
  game.off = {
    step: 'resign', retired, resignQueue: expiring, coachExpiring, released: [], aiReleased, market: null,
    draft: null, rookies: [], aiSigned: [],
  };
  return game.off;
}

// 2) 재계약 협상. 거절이면 { accepted: false, reason }을 돌려주고 선수는 대기열에 남는다(금액을 올려 다시 제안할 수 있다).
export function offerResign(game, playerId, salary) {
  need(game, 'resign');
  const player = game.off.resignQueue.find((p) => p.id === playerId);
  if (!player) throw new Error('재계약 대상이 아닙니다');
  const result = evaluateResign(player, salary, clubView(game));
  if (result.accepted) {
    resign(player, salary, clubView(game));
    game.off.resignQueue = game.off.resignQueue.filter((p) => p !== player);
  }
  return result;
}

export function declineResign(game, playerId) {
  need(game, 'resign');
  const player = game.off.resignQueue.find((p) => p.id === playerId);
  if (!player) throw new Error('재계약 대상이 아닙니다');
  game.off.released.push(releaseToPool(game.myTeam, game.rng, player));
  game.off.resignQueue = game.off.resignQueue.filter((p) => p !== player);
}

// 코치 재계약(코인 지출, 사기가 낮으면 거절 오류)
export function renewCoachContract(game, kind) {
  need(game, 'resign');
  const coach = game.off.coachExpiring.find((c) => c.kind === kind);
  if (!coach) throw new Error('재계약 대상 코치가 아닙니다');
  renewCoach(game.club, coach);
  game.off.coachExpiring = game.off.coachExpiring.filter((c) => c !== coach);
}

// 3) 재계약 마감 -> FA 시장 열기. 대기열의 선수는 FA로 풀리고, 재계약 못 한 코치는 1별 신임 코치로 바뀐다.
export function openMarket(game) {
  need(game, 'resign');
  const { off, myTeam: team, rng } = game;
  for (const player of [...off.resignQueue]) declineResign(game, player.id);
  for (const old of off.coachExpiring) {
    team.coaches[old.kind] = createCoach({ rng, id: `${old.id}-n${game.season.year}`, kind: old.kind, stars: 1 });
  }
  off.coachExpiring = [];
  syncFillers(team);
  off.market = generateFreeAgents(rng, {
    released: [...off.released.map((e) => e.player), ...off.aiReleased], prefix: `FA${game.season.year}`,
  });
  off.step = 'market';
  return off.market;
}

// 4) FA 영입 협상. 스타가 6명이면 먼저 releaseStar로 자리를 비워야 한다.
export function offerFreeAgent(game, playerId, salary) {
  need(game, 'market');
  const entry = game.off.market.find((e) => e.player.id === playerId);
  if (!entry) throw new Error('시장에 없는 선수입니다');
  const club = clubView(game);
  const result = evaluateOffer(entry, salary, club);
  if (!result.accepted) return result;
  if (game.myTeam.stars.length >= ROSTER_STARS) return { accepted: false, reason: 'roster' };
  signFreeAgent(game.myTeam, game.rng, entry, salary, club);
  game.off.market = game.off.market.filter((e) => e !== entry);
  return result;
}

// 내 스타를 방출한다(자리 만들기). 방출된 선수는 사라진다.
export function releaseStar(game, playerId) {
  if (game.phase !== 'offseason' || !game.off) throw new Error('오프시즌이 아닙니다');
  const player = game.myTeam.stars.find((p) => p.id === playerId);
  if (!player) throw new Error('이 팀의 스타가 아닙니다');
  setStars(game.myTeam, game.rng, game.myTeam.stars.filter((p) => p !== player));
}

// 5) 시장 마감 -> 남은 FA는 AI 팀이 데려가고 드래프트로.
export function closeMarket(game) {
  need(game, 'market');
  const { off, world, rng } = game;
  const aiTeams = regionTeams(world).filter((t) => t.id !== game.myTeam.id);
  off.aiSigned = aiSign(rng, off.market, aiTeams);
  for (const t of new Set(off.aiSigned.map((s) => s.teamId))) integrateNamed(aiTeams.find((x) => x.id === t), rng);
  off.market = [];
  const year = game.season.year;
  const teams = new Map(regionTeams(world).map((t) => [t.id, t]));
  const order = draftOrder(game.season.draftStandings, [...teams.values()], year);
  off.draft = createDraft({ prospects: generateProspects(rng, { prefix: `D${year}` }), order });
  autoPickUntil(off.draft, game.myTeam.id, rng);
  off.step = 'draft';
  return off.draft;
}

// 6) 드래프트: 내 순번마다 한 명 지명. 내 순번이 없거나 끝나면 isDraftOver.
export function draftChoose(game, playerId) {
  need(game, 'draft');
  const player = draftPick(game.off.draft, game.myTeam.id, playerId);
  autoPickUntil(game.off.draft, game.myTeam.id, game.rng);
  return player;
}

export function draftBest(game) {
  need(game, 'draft');
  const best = [...game.off.draft.pool].sort((a, b) => marketValue(b) - marketValue(a) || (a.id < b.id ? -1 : 1))[0];
  return draftChoose(game, best.id);
}

export const draftTurnIsMine = (game) => Boolean(game.off.draft) && !isDraftOver(game.off.draft)
  && game.off.draft.order[game.off.draft.next].owner === game.myTeam.id;

// 7) 드래프트 마감 -> 신인 계약을 붙여 대기석에 둔다. 스타 자리에 넣을지는 placeRookie로 정한다.
export function closeDraft(game) {
  need(game, 'draft');
  const { off, world } = game;
  if (!isDraftOver(off.draft)) throw new Error('드래프트가 아직 끝나지 않았습니다');
  off.rookies = draftedBy(off.draft, game.myTeam.id);
  const teams = regionTeams(world);
  spendPicks(teams, game.season.year);
  grantPicks(teams, game.season.year + 1);
  off.step = 'rookies';
  return off.rookies;
}

// 신인을 스타로 올린다. 스타가 6명이면 내보낼 스타(releaseId)가 있어야 한다.
export function placeRookie(game, playerId, releaseId = null) {
  need(game, 'rookies');
  const rookie = game.off.rookies.find((p) => p.id === playerId);
  if (!rookie) throw new Error('대기 중인 신인이 아닙니다');
  let stars = [...game.myTeam.stars];
  if (stars.length >= ROSTER_STARS) {
    const out = stars.find((p) => p.id === releaseId);
    if (!out) throw new Error('스타 자리가 없습니다. 내보낼 스타를 정해야 합니다');
    stars = stars.filter((p) => p !== out);
  }
  setStars(game.myTeam, game.rng, [...stars, rookie]);
  game.off.rookies = game.off.rookies.filter((p) => p !== rookie);
}

// 8) 새 시즌 시작: 남은 신인은 떠나고 관리 단계로.
export function startSeason(game) {
  need(game, 'rookies');
  game.off = null;
  game.pending = { press: null, interviews: [] };
  game.chunk = 0;
  game.phase = 'manage';
  return game.world.year;
}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test next/tests/offseason.test.mjs`
Expected: PASS (11 tests). 이어서 `node --test next/tests/*.test.mjs`로 앞선 테스트도 그대로 통과하는지 확인한다(215개).

- [ ] **Step 6: 커밋**

```bash
git add next/tests/helpers.mjs next/engine/offseason.mjs next/tests/offseason.test.mjs
git commit -m "feat(next): 오프시즌(은퇴·재계약·FA·드래프트·신인 배치)과 자동 감독 도우미"
```


---

### Task 3: 저장과 불러오기

**Files:**
- Create: `next/engine/save.mjs`
- Test: `next/tests/save.test.mjs`

**Interfaces:**
- Consumes: 계획 1 `createRng` `createLeague`, Task 1·2의 `game` 구조
- Produces: `SAVE_VERSION`, `SAVE_KEY`, `saveGame(game) -> JSON 문자열`(난수를 새 씨앗으로 이어 쓴다), `loadGame(json) -> game`, `writeSave(game, storage)`, `readSave(storage) -> game | null`

- [ ] **Step 1: 실패하는 테스트 작성** — `next/tests/save.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, readSave, saveGame, SAVE_KEY, writeSave } from '../engine/save.mjs';
import { playNextChunk } from '../engine/game.mjs';
import { beginOffseason, closeMarket, openMarket } from '../engine/offseason.mjs';
import { leagueKey, myLeague } from '../engine/world.mjs';
import { autoSeason, startedGame } from './helpers.mjs';

const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

test('불러온 게임은 같은 팀 객체를 공유한다(리그의 내 팀 = myTeam, 스타는 라인업 안의 같은 선수)', () => {
  const g = startedGame(1);
  playNextChunk(g);
  const g2 = loadGame(saveGame(g));
  assert.equal(myLeague(g2.world).teams.get('ME'), g2.myTeam);
  for (const p of g2.myTeam.stars) assert.ok(g2.myTeam.lineup.includes(p));
  for (const league of g2.world.leagues.values()) {
    for (const t of league.teams.values()) if (t.named) for (const p of t.named) assert.ok(t.stars.includes(p));
  }
  assert.equal(g2.phase, 'manage');
  assert.equal(g2.chunk, 1);
});

test('저장 직후 이어서 한 게임과 불러온 게임은 같은 구간 결과를 낸다', () => {
  const g = startedGame(2);
  playNextChunk(g);
  const g2 = loadGame(saveGame(g));
  const a = playNextChunk(g);
  const b = playNextChunk(g2);
  assert.deepEqual(a.matches, b.matches);
  assert.deepEqual(a.income, b.income);
  assert.deepEqual(a.steps, b.steps);
  assert.equal(g.club.coins, g2.club.coins);
});

test('시즌 종료 뒤(승강 결과 Map 포함)에 저장·불러오기를 해도 오프시즌을 이어갈 수 있다', () => {
  for (let seed = 1; seed < 30; seed += 1) {
    const g = startedGame(seed);
    autoSeason(g);
    if (g.phase !== 'offseason') continue;
    const g2 = loadGame(saveGame(g));
    assert.equal(g2.season.outcome.finalRank.get('ME'), g.season.outcome.finalRank.get('ME'));
    beginOffseason(g);
    beginOffseason(g2);
    assert.deepEqual(g.off.resignQueue.map((p) => p.id), g2.off.resignQueue.map((p) => p.id));
    assert.equal(g2.world.year, 2);
    return;
  }
  assert.fail('경질되지 않는 시드를 찾지 못했습니다');
});

test('FA 시장 도중에 저장해도 같은 시장이 이어지고 마감 결과도 같다', () => {
  for (let seed = 1; seed < 30; seed += 1) {
    const g = startedGame(seed);
    autoSeason(g);
    if (g.phase !== 'offseason') continue;
    beginOffseason(g);
    g.off.resignQueue.forEach((p) => { p.contract.years = 3; });
    g.off.resignQueue = [];
    openMarket(g);
    const g2 = loadGame(saveGame(g));
    assert.deepEqual(g2.off.market.map((e) => e.player.id), g.off.market.map((e) => e.player.id));
    closeMarket(g);
    closeMarket(g2);
    assert.deepEqual(g.off.aiSigned, g2.off.aiSigned);
    assert.deepEqual(g.off.draft.order, g2.off.draft.order);
    return;
  }
  assert.fail('경질되지 않는 시드를 찾지 못했습니다');
});

test('저장 크기는 브라우저 저장소 한도(약 5MB) 안에 든다', () => {
  const g = startedGame(3);
  autoSeason(g);
  const size = saveGame(g).length;
  assert.ok(size < 4_000_000, `저장 크기 ${size}`);
});

test('저장소에 쓰고 읽는다. 비어 있으면 null이고 버전이 다르면 오류다', () => {
  const storage = fakeStorage();
  assert.equal(readSave(storage), null);
  const g = startedGame(4);
  writeSave(g, storage);
  assert.equal(readSave(storage).phase, 'manage');
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 999, data: {} }));
  assert.throws(() => readSave(storage), /버전이 맞지 않아/);
  assert.ok(leagueKey(0, 3));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test next/tests/save.test.mjs`
Expected: FAIL (`Cannot find module '../engine/save.mjs'`)

- [ ] **Step 3: 구현** — `next/engine/save.mjs`

```js
import { createRng } from './rng.mjs';
import { createLeague } from './league.mjs';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'fm-lite-save';

// 팀은 선수 객체를 여러 곳(스타, 라인업, 이름 있는 선수)에서 공유한다. 저장할 때는 라인업에 한 번만 담고
// 스타·이름 있는 선수는 id로 적어서, 불러올 때 같은 객체로 다시 이어 붙인다.
const packTeam = (t) => ({ ...t, stars: t.stars.map((p) => p.id), named: t.named?.map((p) => p.id) });

function unpackTeam(o) {
  const byId = new Map([...o.lineup, ...Object.values(o.subs ?? {})].map((p) => [p.id, p]));
  const team = { ...o, stars: o.stars.map((id) => byId.get(id)) };
  if (o.named) team.named = o.named.map((id) => byId.get(id)).filter(Boolean);
  return team;
}

const packLeague = (key, l) => ({
  key, teamIds: [...l.teams.keys()], fixtures: l.fixtures, nextRound: l.nextRound, chunkIndex: l.chunkIndex, table: [...l.table],
});

function packWorld(world) {
  const teams = new Map();
  const leagues = [];
  for (const [key, league] of world.leagues) {
    for (const [id, team] of league.teams) teams.set(id, team);
    leagues.push(packLeague(key, league));
  }
  return { year: world.year, myTeamId: world.myTeamId, teams: [...teams.values()].map(packTeam), leagues };
}

function unpackWorld(w) {
  const teams = new Map(w.teams.map((o) => [o.id, unpackTeam(o)]));
  const leagues = new Map();
  for (const l of w.leagues) {
    const league = createLeague(l.teamIds.map((id) => teams.get(id)));
    Object.assign(league, { fixtures: l.fixtures, nextRound: l.nextRound, chunkIndex: l.chunkIndex, table: new Map(l.table) });
    leagues.set(l.key, league);
  }
  return { year: w.year, myTeamId: w.myTeamId, leagues };
}

// 게임을 JSON 문자열로 만든다. 난수는 새 씨앗으로 이어 쓰므로, 저장 직후 이어서 하는 게임과
// 불러온 게임은 정확히 같은 결과를 낸다.
export function saveGame(game) {
  const seed = Math.floor(game.rng() * 4294967296);
  game.rng = createRng(seed);
  const { rng, world, myTeam, history, ...rest } = game;
  const data = {
    ...rest,
    rngSeed: seed,
    world: packWorld(world),
    history: { ...history, players: [...history.players] },
    season: game.season && {
      ...game.season,
      outcome: { ...game.season.outcome, finalRank: [...game.season.outcome.finalRank], tierBefore: [...game.season.outcome.tierBefore] },
    },
    off: game.off && {
      ...game.off,
      resignQueue: game.off.resignQueue.map((p) => p.id),
      coachExpiring: game.off.coachExpiring.map((c) => c.kind),
    },
  };
  return JSON.stringify({ version: SAVE_VERSION, data });
}

export function loadGame(json) {
  const { version, data } = JSON.parse(json);
  if (version !== SAVE_VERSION) throw new Error('저장 파일 버전이 맞지 않아 이어할 수 없습니다');
  const world = unpackWorld(data.world);
  const myTeam = [...world.leagues.values()].map((l) => l.teams.get(world.myTeamId)).find(Boolean);
  const game = {
    ...data, world, myTeam, rng: createRng(data.rngSeed),
    history: { ...data.history, players: new Map(data.history.players) },
  };
  delete game.rngSeed;
  if (data.season) {
    game.season = {
      ...data.season,
      outcome: { ...data.season.outcome, finalRank: new Map(data.season.outcome.finalRank), tierBefore: new Map(data.season.outcome.tierBefore) },
    };
  }
  if (data.off) {
    game.off = {
      ...data.off,
      resignQueue: data.off.resignQueue.map((id) => myTeam.stars.find((p) => p.id === id)),
      coachExpiring: data.off.coachExpiring.map((kind) => myTeam.coaches[kind]),
    };
  }
  return game;
}

// 브라우저 저장소(localStorage 같은 getItem/setItem 객체)에 넣고 꺼낸다. 없으면 null.
export function writeSave(game, storage) {
  storage.setItem(SAVE_KEY, saveGame(game));
}

export function readSave(storage) {
  const json = storage.getItem(SAVE_KEY);
  return json ? loadGame(json) : null;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test next/tests/save.test.mjs`
Expected: PASS (6 tests). 이어서 `node --test next/tests/*.test.mjs`로 앞선 테스트도 그대로 통과하는지 확인한다(221개).

- [ ] **Step 5: 커밋**

```bash
git add next/engine/save.mjs next/tests/save.test.mjs
git commit -m "feat(next): 저장과 불러오기(객체 공유 복원, 저장 직후 동일 재현)"
```


---

### Task 4: 전체 확인

- [ ] **Step 1: 전체 테스트**

Run: `node --test next/tests/*.test.mjs`
Expected: PASS (221 tests, 0 fail: 앞선 계획의 192개 + 이 계획의 29개). 기존 게임: `node --test tests/*.test.mjs`도 그대로 통과.

## Self-Review

**Spec coverage** (이 계획이 맡는 부분)
- 2절 시즌 종료 순서(마지막 결과 -> 승강전 -> 챔피언스리그 -> 시상 -> 은퇴·재계약 -> FA -> 드래프트 -> 다음 시즌) -> Task 1 `finishSeason`, Task 2 `beginOffseason` ~ `startSeason`. 구현상 챔피언스리그를 승강전보다 먼저 치른다. 챔피언스리그 출전 팀이 승강 전의 최종 순위로 정해지고 승강전은 그 뒤 순위를 건드리지 않아 결과는 같다.
- 2절 구간 사이 일(휴식 지정, 시설·코치, 기자회견, 선수 면담, 트레이드 응답) -> Task 1 `playNextChunk` `answerPress` `answerInterview` `incomingTrade` `acceptTrade` `proposeTrade`(휴식과 시설은 앞선 계획의 `setRest` `upgradeFacility`를 직접 부른다).
- 7절 시작(스타 3명 배정 + 시작 드래프트 3명) -> Task 1 `createGame` `startDraftPick`. 7절 재계약 우선 협상·거절 시 FA, FA 10명, 못 잡으면 AI 영입, 드래프트 -> Task 2.
- 10.5절 감독 은퇴(자진 종료)와 경질 + 종료 정산 요약 -> Task 1 `retireManager` `finishSeason`의 `game.end.summary`(계획 6 `careerSummary`).
- 저장과 불러오기(중간 저장으로 끊어 하기) -> Task 3.
- 이 계획에서 하지 않는 것: 화면과 튜토리얼(계획 8), 드래프트에서 AI 팀이 뽑은 신인을 AI 스타로 편입하는 일(AI 팀은 `ageAiTeam`의 신인 보충으로 6명을 유지), 내 지역 밖 챔피언스리그 출전 팀의 코치·시설 변화, 시설 업그레이드나 코치 고용 화면에서의 호출(앞선 계획의 `upgradeFacility` `hireCoach`를 그대로 쓴다), 수치 튜닝(시뮬 측정 후).

**Placeholder scan:** 모든 단계에 실제 코드와 명령이 있다. "TBD" 없음.

**Type consistency:** `game.phase` 값과 `game.off.step` 값은 Task 1·2 구현과 테스트에서 같은 문자열이다. `game.season`은 `finishSeason`이 만들고 `beginOffseason`이 `outcome` `draftStandings` `wins` `rank` `year`를 읽는다. 재계약 대기열과 코치 대기열은 구현에서 객체, 저장에서 id와 종류로 풀리고 불러올 때 다시 객체로 이어 붙는다. `startedGame` `autoSeason` `autoOffseason` 테스트 도우미는 Task 2·3 테스트가 같이 쓴다.

**검증 메모:** 이 계획의 코드는 계획 6까지 끝난 `next/`를 임시 폴더에 복사해 `node --test`로 221개가 모두 통과하는 것을 확인한 뒤 옮겼다. 5시즌 자동 진행과 저장 크기(첫 시즌 뒤 약 1MB, 4시즌 뒤 약 1.4MB, 브라우저 저장소 한도 5MB 안)도 그 시험으로 확인했다.

## 후속 계획 (서브프로젝트)

| 계획 | 내용 |
|---|---|
| 8 화면과 튜토리얼 | 로스터·선수 상세·결과·프런트 오피스·FA·드래프트·기록실 등 화면(기존 현재 톤)과 첫 판 튜토리얼 |
