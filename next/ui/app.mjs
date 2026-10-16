import { setRest } from '../engine/condition.mjs';
import { generateCoachCandidates, hireCoach, setIntensity } from '../engine/coach.mjs';
import { expandCap, upgradeFacility } from '../engine/economy.mjs';
import {
  acceptPendingTrade, acceptTrade, answerInterview, declinePendingTrade, answerPress, createGame, finishSeason, leagueAiTeams, playNextChunk,
  proposeRetirement, renamePlayer, requestTrade, retireManager, spendPoint, startDraftAdvance, startDraftFinish, startDraftPick,
} from '../engine/game.mjs';
import { inductHallOfFame } from '../engine/honors.mjs';
import { nameOf } from '../engine/names.mjs';
import { askingSalary } from '../engine/contract.mjs';
import { ATTRIBUTES } from '../engine/constants.mjs';
import { attrRow } from './pitch.mjs';
import {
  beginDraft, beginOffseason, closeDraft, closeMarket, declineResign, draftChoose, offerFreeAgent, offerResign, openMarket,
  extendCoach, extendPlayer, placeRookie, releaseStar, renewCoachContract, startSeason, takeBuyout,
} from '../engine/offseason.mjs';
import { SAVE_KEY, readSave, writeSave } from '../engine/save.mjs';
import { KIT_CHOICES, REASON_TEXT, esc, faceTile, onColor, teamName, tradeSide } from './components.mjs';
import {
  chunkScreen, endScreen, endingScreen, hubScreen, introScreen, offseasonScreen, seasonScreen, startDraftScreen, titleScreen,
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
  view: 'hub', tab: 'roster', sel: null, kit: KIT_CHOICES[0][0], flash: null, modal: null, last: null, candidates: {}, rest: new Set(),
  tips: new Set(JSON.parse(store.get(TIPS_KEY) ?? '[]')),
};

function screenHtml() {
  if (ui.intro) return introScreen(ui, game);
  if (!game) return titleScreen({ hasSave: Boolean(store.get(SAVE_KEY)), kit: ui.kit });
  switch (game.phase) {
    case 'startDraft': return startDraftScreen(game, ui);
    case 'manage': return ui.view === 'chunk' ? chunkScreen(game, ui) : hubScreen(game, ui);
    case 'seasonEnd': return chunkScreen(game, ui);
    case 'offseason': return game.off ? offseasonScreen(game, ui) : (ui.view === 'ending' ? endingScreen(game) : seasonScreen(game, ui));
    default: return ui.view === 'end' ? endScreen(game) : seasonScreen(game, ui);
  }
}

function modalHtml() {
  if (ui.levelup?.length) {
    const p = game.myTeam.stars.find((x) => x.id === ui.levelup[0]);
    if (p) return `<div class="sheet" role="dialog" aria-modal="true" aria-label="레벨업"><div class="sheet__box">
      <div class="lvhead">${faceTile(p, { kit: game.clubKit, size: 64 })}<p class="intro__who"><span class="lab">LEVEL UP · ${ui.levelup.length > 1 ? `${ui.levelup.length} PLAYERS` : '1 PLAYER'}</span><b>${esc(nameOf(p.id))}</b></p></div>
      <p class="points"><b class="num">${p.points}</b> POINT${p.points > 1 ? 'S' : ''}<span>PRESS +</span></p>
      <div class="attrs">${ATTRIBUTES[p.position].map((k) => attrRow(p, k)).join('')}</div>
      <button class="btn btn--wide" data-act="levellater">LATER</button></div></div>`;
  }
  if (ui.extend) {
    const p = game.myTeam.stars.find((x) => x.id === ui.extend);
    if (p) return `<div class="sheet" role="dialog" aria-modal="true" aria-label="연장 계약"><div class="sheet__box">
      <h3>EXTEND</h3><p class="offerline"><span class="lab">NOW ${p.contract.salary} · ${p.contract.years}Y LEFT</span><b>${esc(nameOf(p.id))}</b></p>
      <p>새 연봉으로 3년을 다시 맺어요. 요구 연봉 이상이어야 해요.</p>
      <input class="sal" type="number" min="1" max="99" id="ext-sal" value="${askingSalary(p)}" aria-label="새 연봉">
      <button class="btn btn--primary btn--wide" data-act="extendyes" data-id="${esc(p.id)}">CONFIRM</button><button class="btn btn--wide" data-act="extendclose">CLOSE</button></div></div>`;
  }
  if (ui.meeting) {
    const p = game.myTeam.stars.find((x) => x.id === ui.meeting);
    if (p) return `<div class="sheet" role="dialog" aria-modal="true" aria-label="면담"><div class="sheet__box">
      <h3>MEETING</h3><p class="offerline"><span class="lab">${p.position} · AGE ${p.age}</span><b>${esc(nameOf(p.id))}</b></p>
      <p>은퇴에 대해 이야기를 나눠 볼까요? 거절당하면 선수의 사기가 가장 낮아져요.</p>
      <button class="btn btn--primary btn--wide" data-act="retireask" data-id="${esc(p.id)}">SUGGEST RETIREMENT</button><button class="btn btn--wide" data-act="meetingclose">CLOSE</button></div></div>`;
  }
  if (!ui.modal) return '';
  const { offer } = ui.modal;
  const ai = leagueAiTeams(game).find((t) => t.id === offer.aiTeamId);
  return `<div class="sheet" role="dialog" aria-modal="true" aria-label="트레이드 제안"><div class="sheet__box">
    <h3>${esc(teamName(game, ai.id))}</h3><p class="offerline"><span class="lab">YOU GIVE</span>${tradeSide(game, offer.give.players, offer.give.picks)}</p><p class="offerline"><span class="lab">THEY OFFER</span>${tradeSide(game, offer.get.players, offer.get.picks)}</p>
    <button class="btn btn--primary btn--wide" data-act="tradeyes">받아들이기</button><button class="btn btn--wide" data-act="tradeno">거절</button></div></div>`;
}

let lastKey = '';
function render() {
  const key = `${game?.phase}|${game?.off?.step}|${ui.view}|${ui.tab}|${ui.intro?.step}`;
  const kit = game ? game.clubKit : ui.kit;
  document.documentElement.style.setProperty('--team', kit);
  document.documentElement.style.setProperty('--on-team', onColor(kit));
  // 화면이 바뀐 렌더에서만 입장 모션을 켠다(같은 화면 안의 클릭에는 다시 재생하지 않는다)
  const entering = key !== lastKey;
  root.classList.toggle('enter', entering);
  root.innerHTML = screenHtml() + modalHtml();
  if (entering) { window.scrollTo(0, 0); lastKey = key; }
}

function persist() {
  if (!game) return;
  if (game.phase === 'ended') { store.remove(SAVE_KEY); return; }
  try { writeSave(game, storage); } catch { /* 용량 초과 등: 게임은 계속 */ }
}

// 드래프트에서 새로 이뤄진 AI 지명을 하나씩 보여 주기 위한 시간표(건너뛰기 가능)
const activeDraft = () => (game.phase === 'startDraft' ? game.startDraft : game.off.draft);
const num = (id) => Number(document.getElementById(id)?.value);
const result = (r, ok) => { ui.flash = r.accepted ? ok : (REASON_TEXT[r.reason] ?? '거절당했어요'); };

const ACTIONS = {
  new() { game = null; ui.intro = { step: 0 }; ui.flash = null; },
  ending() { ui.view = 'ending'; },
  endingdone() { ui.endingSeen = game.season.year; ui.view = 'hub'; },
  intronext() { ui.intro.step += 1; },
  introskip() { if (ui.intro.step < 2) ui.intro.step = 1; else ui.intro = null; },
  introsign() {
    const name = document.getElementById('mgr-name').value.trim();
    const club = document.getElementById('club-name').value.trim() || '내 구단';
    ui.intro.name = name; ui.intro.club = club;
    if (!name) throw new Error('Enter a manager name');
    game = createGame({ seed: (Date.now() & 0x7fffffff) || 1, name, clubName: club, clubKit: ui.kit });
    ui.view = 'hub'; ui.tab = 'roster'; ui.rest.clear(); ui.candidates = {}; ui.flash = null;
    ui.intro.step = 2;
  },
  introdone() { ui.intro = null; },
  continue() { game = readSave(storage); ui.intro = null; ui.view = 'hub'; ui.rest.clear(); },
  newrun() { game = null; ui.intro = null; },
  // 앞 순번 구단들의 지명은 한꺼번에 이뤄지고 곧바로 내 차례가 된다.
  dstart() { if (game.phase === 'startDraft') startDraftAdvance(game); else beginDraft(game); },
  dfinish() { startDraftFinish(game); ui.view = 'hub'; ui.tab = 'roster'; },
  sdraft(el) { startDraftPick(game, el.dataset.id); },
  tab(el) { ui.tab = el.dataset.v; ui.flash = null; },
  kit(el) {
    ui.kit = el.dataset.v;
    if (ui.intro) { // 색을 눌러도 적어 둔 이름이 지워지지 않게
      ui.intro.name = document.getElementById('mgr-name')?.value ?? ui.intro.name;
      ui.intro.club = document.getElementById('club-name')?.value ?? ui.intro.club;
    }
  },
  pick(el) { ui.sel = el.dataset.id; ui.detailId = el.dataset.id; },
  pback() { ui.detailId = null; },
  dpos(el) { ui.dpos = ui.dpos === el.dataset.v ? null : el.dataset.v; },
  dsel(el) { ui.dsel = ui.dsel === el.dataset.id ? null : el.dataset.id; },
  tip(el) { ui.tips.add(el.dataset.id); store.set(TIPS_KEY, JSON.stringify([...ui.tips])); },
  spend(el) {
    spendPoint(game, el.dataset.id, el.dataset.k);
    const p = game.myTeam.stars.find((x) => x.id === el.dataset.id);
    if (p.points === 0 && ui.levelup?.[0] === p.id) ui.levelup.shift(); // 포인트를 다 쓰면 다음 선수로
  },
  rename(el) { ui.editName = el.dataset.id; },
  renamecancel() { ui.editName = null; },
  renamesave(el) { renamePlayer(game, el.dataset.id, document.getElementById('renameInput')?.value ?? ''); ui.editName = null; },
  rest(el) { const id = el.dataset.id; if (ui.rest.has(id)) ui.rest.delete(id); else ui.rest.add(id); },
  upgrade(el) { upgradeFacility(game.club, el.dataset.kind); },
  capup() { expandCap(game.club, game.myTeam.tier ?? 3); },
  intensity(el) { setIntensity(game.myTeam.coaches[el.dataset.kind], el.dataset.v); },
  coachfind(el) { ui.candidates[el.dataset.kind] = generateCoachCandidates(game.rng, { kind: el.dataset.kind, prefix: `C${game.world.year}${el.dataset.kind[0]}${Date.now() % 1000}` }); },
  hire(el) {
    const kind = el.dataset.kind;
    const cand = ui.candidates[kind].find((c) => c.id === el.dataset.id);
    hireCoach(game.club, game.myTeam, cand);
    ui.candidates[kind] = null;
  },
  pendtradeyes() { acceptPendingTrade(game); ui.flash = '트레이드가 성사되었어요'; },
  pendtradeno() { declinePendingTrade(game); },
  extend(el) { ui.extend = el.dataset.id; },
  extendclose() { ui.extend = null; },
  extendyes(el) {
    const r = extendPlayer(game, el.dataset.id, num('ext-sal'));
    ui.extend = null;
    ui.flash = r.accepted ? '연장 계약했어요. 새 계약 3년이에요' : (REASON_TEXT[r.reason] ?? '거절당했어요');
  },
  extendcoach(el) { extendCoach(game, el.dataset.kind); ui.flash = '코치 계약을 3년으로 연장했어요'; },
  meeting(el) { ui.meeting = el.dataset.id; },
  meetingclose() { ui.meeting = null; },
  retireask(el) {
    const p = game.myTeam.stars.find((x) => x.id === el.dataset.id);
    const name = nameOf(p.id);
    const r = proposeRetirement(game, el.dataset.id);
    ui.meeting = null;
    if (r.accepted) { ui.detailId = null; ui.flash = `${name}이(가) 은퇴를 받아들였어요. 지금까지 고마웠다고 인사를 나눴어요`; }
    else ui.flash = (r.reason === 'young' ? `${name}: "아직 한창입니다. 은퇴는 생각해 본 적 없어요"` : `${name}: "지금은 그런 얘기를 듣고 싶지 않습니다"`) + ' 사기가 바닥까지 떨어졌어요';
  },
  tradeyes() { acceptTrade(game, ui.modal.offer); ui.modal = null; ui.flash = '트레이드가 성사되었어요'; },
  tradeno() { ui.modal = null; },
  traderequest(el) {
    const offer = requestTrade(game, { players: [el.dataset.id] });
    if (offer) ui.modal = { offer }; else ui.flash = '지금은 걸맞은 제안을 보낼 팀이 없어요';
  },
  play() {
    setRest(game.myTeam, [...ui.rest]);
    ui.last = playNextChunk(game);
    ui.rest.clear(); ui.flash = null; ui.view = 'chunk'; ui.reportDone = false;
  },
  press(el) { answerPress(game, Number(el.dataset.i)); },
  interview(el) { answerInterview(game, el.dataset.id, Number(el.dataset.i)); },
  back() {
    ui.view = 'hub';
    ui.levelup = game.myTeam.stars.filter((p) => (p.points ?? 0) > 0).map((p) => p.id); // 레벨업한 선수의 카드를 차례로 띄운다
  },
  reportnext() { ui.reportDone = true; },
  levellater() { ui.levelup.shift(); },
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
  buyout(el) { const c = takeBuyout(game, el.dataset.id); ui.flash = `${c}코인을 받았어요`; },
  place(el) { placeRookie(game, el.dataset.id, document.getElementById(`out-${el.dataset.id}`)?.value ?? null); ui.flash = null; },
  startseason() { startSeason(game); ui.view = 'hub'; ui.tab = 'roster'; ui.flash = null; },
};
const UI_ONLY = new Set(['dpos', 'dsel', 'reportnext', 'levellater', 'extend', 'extendclose', 'meeting', 'meetingclose', 'pback', 'ending', 'endingdone', 'intronext', 'introskip', 'introdone', 'new', 'rename', 'renamecancel', 'tab', 'kit', 'pick', 'tip', 'rest', 'coachfind', 'tradeno', 'newrun', 'back', 'toend']);

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
