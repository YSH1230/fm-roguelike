import test from 'node:test';
import assert from 'node:assert/strict';
import { answerInterview, answerPress, createGame, incomingTrade, playNextChunk, retireManager, startDraftAdvance, startDraftFinish, startDraftPick } from '../engine/game.mjs';
import { isDraftOver } from '../engine/draft.mjs';
import { generateCoachCandidates } from '../engine/coach.mjs';
import { beginDraft, beginOffseason, closeDraft, closeMarket, draftChoose, draftTurnIsMine, openMarket } from '../engine/offseason.mjs';
import { teamIdentity, nameOf } from '../engine/names.mjs';
import { teamName } from '../ui/components.mjs';
import {
  chunkScreen, endScreen, endingScreen, hubScreen, introScreen, offseasonScreen, seasonScreen, startDraftScreen, titleScreen,
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
  assert.ok(!titleScreen({ hasSave: false, kit: '#1f9d6a' }).includes('data-act="kit"')); // 이름·색은 프롤로그에서 정한다
});

test('시작 드래프트: 시작 전에는 후보 명단과 DRAFT 버튼만, 누르면 바로 내 차례에 지명 버튼', () => {
  const g = createGame({ seed: 2 });
  const pre = startDraftScreen(g, freshUi());
  clean(pre, '드래프트 시작 전');
  assert.ok(pre.includes('data-act="dstart"') && pre.includes('>DRAFT<'));
  for (const gone of ['RULES', 'DRAFT ORDER', 'MY PICKS', 'START DRAFT', 'splash', 'dskip']) assert.ok(!pre.includes(gone), `${gone}는 없어야 한다`);
  assert.ok(!pre.includes('data-act="sdraft"')); // 시작 전에는 지명할 수 없다
  assert.equal((pre.match(/<article[^>]*class="prow/g) ?? []).length, 20);
  startDraftAdvance(g);
  const live = startDraftScreen(g, freshUi());
  clean(live, '드래프트 진행');
  assert.ok(live.includes('YOUR PICK') && live.includes('PICK LOG') && live.includes('clock--me'));
  assert.ok(!live.includes('attrs-mini') && !live.includes('class="attr"')); // 누르기 전에는 세부 능력치가 없다
  assert.equal((live.match(/data-act="sdraft"/g) ?? []).length, g.startDraft.pool.length); // PICK은 행마다 있다
  const opened = startDraftScreen(g, freshUi({ dsel: g.startDraft.pool[0].id }));
  assert.ok(opened.includes('class="attr"') && opened.includes('bar white'));
  const pos = startDraftScreen(g, freshUi({ dpos: 'DF' }));
  assert.ok(pos.includes('need--on') && pos.includes('class="needs__list"'));
});

test('시작 드래프트가 끝나면 내 지명 결과와 시즌 시작 버튼이 나온다', () => {
  const g = createGame({ seed: 4 });
  startDraftAdvance(g);
  while (!isDraftOver(g.startDraft)) startDraftPick(g, g.startDraft.pool[0].id);
  const html = startDraftScreen(g, freshUi());
  clean(html, '드래프트 끝');
  assert.ok(html.includes('DRAFT COMPLETE') && html.includes('class="mypick"') && html.includes('data-act="dfinish"'));
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
  assert.ok(!roster.includes('class="detail')); // 선수를 누르기 전에는 보드만 있다
  assert.ok(roster.includes('data-act="pick"'));
  const table = hubScreen(g, freshUi({ tab: 'table' }));
  assert.equal((table.match(/class="rank__n"/g) ?? []).length, 20);
  const picked = hubScreen(g, freshUi({ detailId: g.myTeam.stars[3].id }));
  assert.ok(picked.includes(`aria-label="${nameOf(g.myTeam.stars[3].id)} 상세"`));
  for (const w of ['PLAYER INFO', 'AGE', 'CONTRACT', 'MORALE', 'CONDITION', 'ACQUIRED', 'RATING', 'POTENTIAL', 'XP LEVEL', 'ATTRIBUTES', 'data-act="pback"', 'data-act="traderequest"', 'data-act="rest"']) assert.ok(picked.includes(w), w);
  assert.ok(!picked.includes('class="pitch"')); // 상세에서는 보드 대신 상세 페이지가 나온다
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
  const ui = freshUi({ rest: new Set([g.myTeam.stars[0].id]), detailId: g.myTeam.stars[0].id });
  assert.ok(hubScreen(g, ui).includes('RESTING'));
  assert.ok(/pp--star( on)? out/.test(hubScreen(g, freshUi({ rest: ui.rest }))));
});

test('구간 결과: 매치 리포트 다음에 기자회견·면담이 한 장면씩 나오고, 모두 답하면 BACK, 마지막 구간에는 FINISH SEASON', () => {
  const g = startedGame(6);
  const ui = freshUi({ view: 'chunk' });
  ui.last = playNextChunk(g);
  const report = chunkScreen(g, ui);
  clean(report, '매치 리포트');
  assert.equal((report.match(/class="m m--/g) ?? []).length, 14);
  assert.equal((report.match(/class="rs rs--/g) ?? []).length, 14);
  assert.ok(!report.includes('data-act="press"')); // 리포트에는 선택지가 없다
  assert.ok(report.includes('data-act="reportnext"') && !report.includes('data-act="back"'));
  ui.reportDone = true;
  const press = chunkScreen(g, ui);
  clean(press, '기자회견 장면');
  assert.ok(press.includes('PRESS CONFERENCE') && press.includes('data-act="press"') && press.includes('class="dilemma"'));
  assert.ok(!press.includes('class="m m--')); // 장면에는 경기 목록이 없다
  answerPress(g, 0);
  for (const iv of [...g.pending.interviews]) {
    const scene = chunkScreen(g, ui);
    assert.ok(scene.includes('INTERVIEW') && scene.includes(`data-id="${iv.playerId}"`));
    answerInterview(g, iv.playerId, 0);
  }
  g.pending.trade = null;
  const done = chunkScreen(g, ui);
  assert.ok(done.includes('data-act="back"') && !done.includes('reportnext'));
  playNextChunk(g); ui.last = playNextChunk(g);
  ui.reportDone = false;
  g.pending = { press: null, interviews: [], trade: null };
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
  assert.equal((market.match(/data-act="offerfa"/g) ?? []).length, g.market.length);
  closeMarket(g);
  const preDraft = offseasonScreen(g, ui);
  clean(preDraft, '드래프트 시작 전');
  assert.ok(preDraft.includes('data-act="dstart"') && !preDraft.includes('data-act="dpick"'));
  beginDraft(g);
  const draft = offseasonScreen(g, ui);
  clean(draft, '드래프트');
  const open = offseasonScreen(g, freshUi({ ...ui, dsel: g.off.draft.pool[0]?.id }));
  assert.equal(draftTurnIsMine(g), open.includes('data-act="dpick"'));
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

test('선수 카드: 포인트가 있으면 +1 버튼과 안내가 나오고, 이름 수정 칸도 열린다', () => {
  const g = startedGame(3);
  const p = g.myTeam.stars[0];
  const none = hubScreen(g, freshUi({ detailId: p.id }));
  assert.ok(none.includes('class="pcard"') || none.includes('class="pcard '));
  assert.ok(!none.includes('data-act="spend"'));
  p.points = 2;
  const key = Object.keys(p.attrs)[0];
  p.caps[key] = p.attrs[key] + 3;
  const has = hubScreen(g, freshUi({ detailId: p.id }));
  clean(has, '포인트 있는 선수');
  assert.ok(has.includes('data-act="spend"') && has.includes('POINTS') && has.includes(`MAX ${p.caps[key]}`));
  const editing = hubScreen(g, freshUi({ detailId: p.id, editName: p.id }));
  assert.ok(editing.includes('id="renameInput"') && editing.includes('data-act="renamesave"'));
});

test('프롤로그: 구단주 제안 -> 감독 선임(이름·구단·색 입력) -> 사무국 안내 -> 첫 선수단', () => {
  const ui = freshUi({ kit: '#2f6fed', intro: { step: 0 } });
  const s0 = introScreen(ui);
  clean(s0, '프롤로그 1');
  assert.ok(s0.includes('OH SEUNGMIN') && s0.includes('data-act="intronext"') && s0.includes('data-act="introskip"') && s0.includes('1 / 4'));
  ui.intro.step = 1;
  const s1 = introScreen(ui);
  clean(s1, '프롤로그 2');
  assert.ok(s1.includes('id="mgr-name"') && s1.includes('id="club-name"') && s1.includes('data-act="introsign"'));
  assert.equal((s1.match(/data-act="kit"/g) ?? []).length, 8);
  ui.intro.step = 2;
  const s2 = introScreen(ui);
  clean(s2, '프롤로그 3');
  assert.ok(s2.includes('LEAGUE OFFICE'));
  const g = createGame({ seed: 5, name: 'Kim Min', clubName: '새벽 FC', clubKit: '#2f6fed' });
  ui.intro.step = 3;
  const s3 = introScreen(ui, g);
  clean(s3, '프롤로그 4');
  assert.ok(s3.includes('Kim Min') && s3.includes('data-act="introdone"'));
  assert.equal((s3.match(/<article[^>]*class="prow/g) ?? []).length, 5);
});

test('엔딩 장면: 시즌 화면에 ENDING 버튼이 나오고, 편지에 감독·구단 이름이 들어가며 계속/은퇴를 고른다', () => {
  const g = startedGame(6);
  autoSeason(g);
  g.season.ending = 'league';
  const before = seasonScreen(g, {});
  assert.ok(before.includes('data-act="ending"') && !before.includes('data-act="offseason"'));
  const seen = seasonScreen(g, { endingSeen: g.season.year });
  assert.ok(!seen.includes('data-act="ending"') && seen.includes('data-act="offseason"'));
  const letter = endingScreen(g);
  clean(letter, '엔딩');
  assert.ok(letter.includes('OH SEUNGMIN') && letter.includes(g.clubName) && letter.includes('data-act="endingdone"') && letter.includes('data-act="retire"'));
  g.season.ending = 'champions';
  assert.ok(endingScreen(g).includes('CHAMPIONS'));
});

test('MARKET 탭: 시즌 중에도 FA 목록과 코인 가격, 내 스타 방출 버튼이 나온다', () => {
  const g = startedGame(4);
  const html = hubScreen(g, freshUi({ tab: 'market' }));
  clean(html, 'MARKET 탭');
  assert.equal((html.match(/data-act="offerfa"/g) ?? []).length, g.market.length);
  assert.ok(html.includes('FREE AGENTS') && html.includes('data-act="release"') && html.includes('SIGN'));
  assert.ok(html.includes('data-v="market"')); // 하단 탭에 MARKET이 있다
});

test('트레이드: 내놓을 것을 고르는 칸과 REQUEST 버튼이 있고, 신인 배치 단계에는 2라운드 신인 TAKE 버튼이 나온다', () => {
  const g = startedGame(4);
  const front = hubScreen(g, freshUi({ tab: 'front' }));
  clean(front, '프런트');
  assert.ok(!front.includes('traderequest') && !front.includes('id="tr-')); // 트레이드는 선수 상세에서 요청한다
  const g2 = startedGame(5);
  autoSeason(g2);
  beginOffseason(g2);
  g2.off.resignQueue = [];
  openMarket(g2);
  closeMarket(g2);
  beginDraft(g2);
  while (draftTurnIsMine(g2)) draftChoose(g2, g2.off.draft.pool[0].id);
  closeDraft(g2);
  const rookies = offseasonScreen(g2, freshUi());
  clean(rookies, '신인 배치');
  assert.equal((rookies.match(/data-act="buyout"/g) ?? []).length, 1); // 2라운드 신인만
});

test('구간 결과: 잘한 선수에게 온 트레이드 제안이 마지막 장면(ACCEPT/DECLINE)으로 나온다', async () => {
  const { requestTrade } = await import('../engine/game.mjs');
  const g = startedGame(4);
  const ui = freshUi({ view: 'chunk', last: playNextChunk(g), reportDone: true });
  g.pending = { press: null, interviews: [], trade: requestTrade(g, { picks: [g.myTeam.picks[0]] }) };
  const html = chunkScreen(g, ui);
  clean(html, '트레이드 제안 장면');
  assert.ok(html.includes('TRADE OFFER') && html.includes('data-act="pendtradeyes"') && html.includes('data-act="pendtradeno"') && html.includes('YOU GIVE'));
  g.pending.trade = null;
  assert.ok(!chunkScreen(g, ui).includes('TRADE OFFER'));
});
;
