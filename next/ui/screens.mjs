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

