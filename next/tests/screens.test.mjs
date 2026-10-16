import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, incomingTrade, playNextChunk, retireManager, startDraftAdvance, startDraftFinish, startDraftPick } from '../engine/game.mjs';
import { isDraftOver } from '../engine/draft.mjs';
import { generateCoachCandidates } from '../engine/coach.mjs';
import { beginDraft, beginOffseason, closeDraft, closeMarket, draftChoose, draftTurnIsMine, openMarket } from '../engine/offseason.mjs';
import { teamIdentity, nameOf } from '../engine/names.mjs';
import { teamName } from '../ui/components.mjs';
import {
  chunkScreen, endScreen, hubScreen, offseasonScreen, seasonScreen, startDraftScreen, titleScreen,
} from '../ui/screens.mjs';
import { autoSeason, startedGame } from './helpers.mjs';

const freshUi = (extra = {}) => ({ view: 'hub', tab: 'roster', rest: new Set(), tips: new Set(), flash: null, candidates: {}, last: null, ...extra });
// 화면 문자열이 깨지지 않았는지: 값이 빠졌을 때 나오는 흔적이 없어야 한다
const clean = (html, label) => {
  for (const bad of ['undefined', 'NaN', '[object', 'null']) assert.ok(!html.includes(bad), `${label}에 "${bad}"가 있다`);
  // 이모지·기호 글자를 아이콘으로 쓰지 않는다(아이콘은 직접 그린 SVG)
  assert.ok(!/[\u{1F000}-\u{1FAFF}\u2600-\u27BF\u2B00-\u2BFF]/u.test(html), `${label}에 이모지나 기호 글자가 있다`);
  assert.ok(html.length > 200, `${label}가 너무 짧다`);
};

test('제목·시작 드래프트 화면', () => {
  clean(titleScreen({ hasSave: true, kit: '#2f6fed' }), '제목');
  assert.ok(titleScreen({ hasSave: false, kit: '#2f6fed' }).includes('data-act="new"'));
  assert.ok(!titleScreen({ hasSave: false, kit: '#2f6fed' }).includes('data-act="continue"'));
  assert.equal((titleScreen({ hasSave: false, kit: '#1f9d6a' }).match(/data-act="kit"/g) ?? []).length, 8);
});

test('시작 드래프트: 시작 전에는 순번표와 명단만, 시작하면 지명 현황, 내 차례에만 지명 버튼', () => {
  const g = createGame({ seed: 2 });
  const pre = startDraftScreen(g, freshUi());
  clean(pre, '드래프트 시작 전');
  assert.ok(pre.includes('data-act="dstart"') && pre.includes('MY PICKS') && pre.includes('DRAFT ORDER') && pre.includes('RULES'));
  assert.ok(pre.includes('지난 시즌 순위') && pre.includes('LAST YEAR') && !pre.includes('ROUND 2'));
  assert.ok(!pre.includes('스네이크'));
  assert.ok(!pre.includes('드래프트 시작')); // 버튼은 영문만
  assert.ok(!pre.includes('data-act="sdraft"')); // 시작 전에는 지명할 수 없다
  assert.equal((pre.match(/<article class="prow/g) ?? []).length, 20);
  startDraftAdvance(g);
  const live = startDraftScreen(g, freshUi());
  clean(live, '드래프트 진행');
  assert.ok(live.includes('ON THE CLOCK') && live.includes('PICK LOG') && live.includes('clock--me'));
  assert.equal((live.match(/data-act="sdraft"/g) ?? []).length, g.startDraft.pool.length);
  // 지명 현황을 한 명씩 보여 주는 중에는 건너뛰기만 있고 지명 버튼은 없다
  const showing = startDraftScreen(g, freshUi({ reveal: { from: 0, shown: 1, stage: 'logo' } }));
  clean(showing, '지명 현황 공개 중(로고)');
  assert.ok(showing.includes('splash--logo') && showing.includes('data-act="dskip"'));
  const player = startDraftScreen(g, freshUi({ reveal: { from: 0, shown: 1, stage: 'player' } }));
  clean(player, '지명 현황 공개 중(선수)');
  assert.ok(player.includes('splash--player') && player.includes('splash__name'));
  const pos = startDraftScreen(g, freshUi({ dpos: 'DF' }));
  assert.ok(pos.includes('need--on') && pos.includes('class="needs__list"'));
  assert.ok(!pos.includes('내 포지션'));
  assert.ok(!showing.includes('data-act="sdraft"'));
  assert.equal((showing.match(/<li class="pick/g) ?? []).length, 1);
});

test('시작 드래프트가 끝나면 내 지명 결과와 시즌 시작 버튼이 나온다', () => {
  const g = createGame({ seed: 4 });
  startDraftAdvance(g);
  while (!isDraftOver(g.startDraft)) startDraftPick(g, g.startDraft.pool[0].id);
  const html = startDraftScreen(g, freshUi());
  clean(html, '드래프트 끝');
  assert.ok(html.includes('DRAFT COMPLETE') && html.includes('MY DRAFT') && html.includes('data-act="dfinish"'));
  assert.ok(!html.includes('data-act="sdraft"'));
  startDraftFinish(g);
});

test('관리 화면 4개 탭이 모두 그려지고 시트·카드가 선수 정보를 담는다', () => {
  const g = startedGame(3);
  for (const tab of ['roster', 'table', 'front', 'records']) clean(hubScreen(g, freshUi({ tab })), tab);
  const roster = hubScreen(g, freshUi());
  assert.equal((roster.match(/class="pp pp--star/g) ?? []).length, 6); // 보드의 스타 6명
  assert.equal((roster.match(/class="pp pp--sub/g) ?? []).length, 5); // 조연 5명은 점
  assert.ok(roster.includes('START SEASON'));
  assert.ok(roster.includes('다음 구간 쉬게 하기') && roster.includes('class="detail"'));
  assert.ok(roster.includes(nameOf(g.myTeam.stars[0].id)));
  const table = hubScreen(g, freshUi({ tab: 'table' }));
  assert.equal((table.match(/class="rank__n"/g) ?? []).length, 20);
  const picked = hubScreen(g, freshUi({ sel: g.myTeam.stars[3].id }));
  assert.ok(picked.includes(`aria-label="${nameOf(g.myTeam.stars[3].id)} 상세"`));
  assert.ok(roster.includes(`aria-label="${nameOf(g.myTeam.stars[0].id)} 상세"`)); // 선택이 없으면 첫 스타
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
  const html = hubScreen(g, ui);
  assert.ok(html.includes('휴식 지정됨'));
  assert.ok(/pp--star( on)? out/.test(html));
});

test('구간 결과 화면: 경기 목록, 기자회견, 마지막 구간에는 시즌 마무리 버튼', () => {
  const g = startedGame(6);
  const ui = freshUi({ view: 'chunk' });
  ui.last = playNextChunk(g);
  const html = chunkScreen(g, ui);
  clean(html, '구간 결과');
  assert.equal((html.match(/class="m m--/g) ?? []).length, 14);
  assert.equal((html.match(/class="rs rs--/g) ?? []).length, 14);
  assert.ok(html.includes('data-act="press"'));
  assert.ok(html.includes('data-act="back"'));
  playNextChunk(g); ui.last = playNextChunk(g);
  const last = chunkScreen(g, ui);
  assert.ok(last.includes('data-act="finish"'));
  assert.equal((last.match(/class="m m--/g) ?? []).length, 10);
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
  const preDraft = offseasonScreen(g, ui);
  clean(preDraft, '드래프트 시작 전');
  assert.ok(preDraft.includes('data-act="dstart"') && !preDraft.includes('data-act="dpick"'));
  beginDraft(g);
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
  assert.ok(html.includes('CAREER REPORT'));
  assert.ok(html.includes('data-act="newrun"'));
  assert.ok(html.includes(g.end.reason === 'fired' ? 'FIRED' : 'RETIRED'));
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
  beginDraft(g);
  const ui = freshUi();
  while (draftTurnIsMine(g)) draftChoose(g, g.off.draft.pool[0].id);
  closeDraft(g);
  const html = offseasonScreen(g, ui);
  clean(html, '신인 배치');
  assert.ok(html.includes('START YEAR'));
});
