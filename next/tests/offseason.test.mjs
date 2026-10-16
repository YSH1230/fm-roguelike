import test from 'node:test';
import assert from 'node:assert/strict';
import { finishSeason, playNextChunk } from '../engine/game.mjs';
import {
  beginDraft, beginOffseason, closeDraft, closeMarket, declineResign, draftChoose, draftTurnIsMine, offerFreeAgent, offerResign,
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
  assert.equal(draftTurnIsMine(g), false); // 시작 전에는 내 순번이 아니다
  assert.throws(() => draftChoose(g, g.off.draft.pool[0].id), /먼저 시작/);
  beginDraft(g);
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
  beginDraft(g);
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
