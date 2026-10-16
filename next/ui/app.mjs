import { setRest } from '../engine/condition.mjs';
import { generateCoachCandidates, hireCoach, setIntensity } from '../engine/coach.mjs';
import { expandCap, upgradeFacility } from '../engine/economy.mjs';
import {
  acceptTrade, answerInterview, answerPress, createGame, finishSeason, incomingTrade, leagueAiTeams, playNextChunk,
  proposeTrade, renamePlayer, retireManager, spendPoint, startDraftAdvance, startDraftFinish, startDraftPick,
} from '../engine/game.mjs';
import { inductHallOfFame } from '../engine/honors.mjs';
import { nameOf } from '../engine/names.mjs';
import {
  beginDraft, beginOffseason, closeDraft, closeMarket, declineResign, draftChoose, offerFreeAgent, offerResign, openMarket,
  placeRookie, releaseStar, renewCoachContract, startSeason, takeBuyout,
} from '../engine/offseason.mjs';
import { SAVE_KEY, readSave, writeSave } from '../engine/save.mjs';
import { KIT_CHOICES, REASON_TEXT, esc, onColor } from './components.mjs';
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
  pick(el) { ui.sel = el.dataset.id; },
  dpos(el) { ui.dpos = ui.dpos === el.dataset.v ? null : el.dataset.v; },
  dsel(el) { ui.dsel = ui.dsel === el.dataset.id ? null : el.dataset.id; },
  tip(el) { ui.tips.add(el.dataset.id); store.set(TIPS_KEY, JSON.stringify([...ui.tips])); },
  spend(el) { spendPoint(game, el.dataset.id, el.dataset.k); },
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
  tradein() {
    const offer = incomingTrade(game);
    if (offer) ui.modal = { offer }; else ui.flash = '지금은 들어온 제안이 없어요';
  },
  tradeyes() { acceptTrade(game, ui.modal.offer); ui.modal = null; ui.flash = '트레이드가 성사되었어요'; },
  tradeno() { ui.modal = null; },
  tradeout() {
    const val = (id) => document.getElementById(id).value;
    const mine = val('tr-mine');
    const myPick = val('tr-mypick');
    const [teamA, theirs] = val('tr-theirs') ? val('tr-theirs').split(':') : [null, null];
    const [teamB, ...pk] = val('tr-theirpick') ? val('tr-theirpick').split(':') : [null];
    if (teamA && teamB && teamA !== teamB) throw new Error('받을 선수와 지명권은 같은 팀 것으로 골라 주세요');
    const aiTeamId = teamA ?? teamB;
    if (!aiTeamId) throw new Error('받을 선수나 지명권을 하나 골라 주세요');
    const asPick = (year, round, from) => ({ year: Number(year), round: Number(round), from });
    const give = { players: mine ? [mine] : [], picks: myPick ? [asPick(...myPick.split(':'))] : [] };
    const get = { players: theirs ? [theirs] : [], picks: pk.length ? [asPick(...pk)] : [] };
    const r = proposeTrade(game, { aiTeamId, give, get });
    ui.flash = r.accepted ? '상대가 받아들였어요. 트레이드 성사!' : ({ value: '상대가 가치가 모자란다고 거절했어요', cap: '샐러리캡 때문에 거절했어요', mood: '사기가 낮은 선수라 상대가 거절했어요', invalid: r.detail }[r.reason] ?? '거절당했어요');
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
  buyout(el) { const c = takeBuyout(game, el.dataset.id); ui.flash = `${c}코인을 받았어요`; },
  place(el) { placeRookie(game, el.dataset.id, document.getElementById(`out-${el.dataset.id}`)?.value ?? null); ui.flash = null; },
  startseason() { startSeason(game); ui.view = 'hub'; ui.tab = 'roster'; ui.flash = null; },
};
const UI_ONLY = new Set(['dpos', 'dsel', 'ending', 'endingdone', 'intronext', 'introskip', 'introdone', 'new', 'rename', 'renamecancel', 'tab', 'kit', 'pick', 'tip', 'rest', 'coachfind', 'tradeno', 'newrun', 'back', 'toend']);

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
