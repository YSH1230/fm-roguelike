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
