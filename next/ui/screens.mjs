import { TRAITS } from '../engine/constants.mjs';
import { askingSalary, payroll } from '../engine/contract.mjs';
import { capExpandCost, salaryCap, upgradeCost } from '../engine/economy.mjs';
import { leagueAiTeams } from '../engine/game.mjs';
import { standings } from '../engine/league.mjs';
import { nameOf } from '../engine/names.mjs';
import { draftTurnIsMine } from '../engine/offseason.mjs';
import { coachCost, coachXpNeeded } from '../engine/coach.mjs';
import { myLeague } from '../engine/world.mjs';
import {
  AWARD_LABEL, KIT_CHOICES, TIER_LABEL, askText, bar, chip, conditionTexts, crest, effectChips, esc, faceTile, icon, onColor,
  playerRow, portrait, stars, teamKit, teamName,
} from './components.mjs';
import { defaultSelection, pitchBoard, playerDetail } from './pitch.mjs';

const FACILITY_LABEL = { stadium: '경기장', training: '훈련 시설', rehab: '재활 시설' };
const FACILITY_EFFECT = { stadium: '홈경기 수입과 팬이 늘어요', training: '선수 성장이 빨라져요', rehab: '부상에서 더 빨리 돌아와요' };
const KIND_LABEL = { attack: '공격 코치', defense: '수비 코치' };
const INTENSITY_LABEL = { LIGHT: '가볍게', NORMAL: '보통', HARD: '강하게' };
const FATE_TEXT = { promoted: '승격', stay: '잔류', fired: '경질' };

const tip = (ui, id, text) => (ui.tips?.has(id) ? '' : `<aside class="tip">${icon('info', 18)}<p>${text}</p><button class="link" data-act="tip" data-id="${id}">확인</button></aside>`);
const flash = (ui) => (ui.flash ? `<p class="flash" role="status">${esc(ui.flash)}</p>` : '');
const teamStyle = (kit) => `--team:${kit};--on-team:${onColor(kit)}`;
const section = (title, body, extra = '') => `<section class="panel ${extra}"><h3>${title}</h3>${body}</section>`;
const pips = (n, total) => `<span class="pips" aria-label="${n}/${total}">${Array.from({ length: total }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
const coinNum = (n) => `<span class="res res--coin">${icon('coin', 16)}<b class="num">${n}</b></span>`;

// ---------- 공통 ----------
export function topBar(game) {
  const t = game.myTeam;
  return `<header class="top" style="${teamStyle(game.clubKit)}">
    <div class="top__id">${crest(game, t.id, 44)}<div><h1>${esc(game.clubName)}</h1><p>${TIER_LABEL[t.tier]} · ${game.world.year}년차</p></div></div>
    <div class="top__res"><span class="res" title="코인">${icon('coin', 18)}<b class="num">${game.club.coins}</b></span><span class="res" title="팬 지수">${icon('fans', 18)}<b class="num">${Math.round(game.club.fans)}</b></span></div>
  </header>`;
}

export function titleScreen({ hasSave, kit }) {
  const faces = ['t-1', 't-2', 't-3'].map((id) => faceTile({ id, position: 'FW', age: 22 }, { kit, size: 64 })).join('');
  return `<section class="title" style="${teamStyle(kit)}">
    <div class="title__hero"><h1 class="wordmark">FM-LITE</h1><p>3부 리그 작은 구단에서 시작해<br>1부, 그리고 챔피언스리그 정상까지.</p><div class="title__faces">${faces}</div></div>
    <div class="title__form">
      <label class="field">구단 이름<input id="club-name" maxlength="14" value="새벽 FC" autocomplete="off"></label>
      <fieldset class="swatches"><legend>구단 색</legend>${KIT_CHOICES.map(([hex, label]) => `<button class="swatch${hex === kit ? ' on' : ''}" style="--c:${hex}" data-act="kit" data-v="${hex}" aria-pressed="${hex === kit}" aria-label="${label}"></button>`).join('')}</fieldset>
      <button class="btn btn--primary" data-act="new">새 게임 시작</button>
      ${hasSave ? '<button class="btn btn--ghost" data-act="continue">이어하기</button>' : ''}
    </div>
  </section>`;
}

// ---------- 시작 드래프트 ----------
export function startDraftScreen(game, ui) {
  const d = game.startDraft;
  return `${topBar(game)}<main class="page">
    <div class="titlebar"><h2>시작 드래프트</h2>${pips(d.next, 3)}</div>
    ${tip(ui, 'start', '배정된 스타 3명에 더해 신인 후보 12명 중 <b>3명</b>을 직접 고르세요. 별 색이 진한 만큼이 지금 실력, 옅은 만큼이 앞으로 클 수 있는 한계(잠재)예요. 어린데 잠재가 큰 선수가 보석이에요.')}
    <h3 class="group">내 스타</h3>${game.myTeam.stars.map((p) => playerRow(p, { kit: game.clubKit })).join('')}
    <h3 class="group">신인 후보</h3>${d.pool.map((p) => playerRow(p, { kit: game.clubKit, action: `<button class="btn btn--small btn--primary" data-act="sdraft" data-id="${esc(p.id)}">지명</button>` })).join('')}
  </main>`;
}

// ---------- 관리(허브) ----------
function rosterTab(game, ui) {
  const sel = game.myTeam.stars.find((p) => p.id === defaultSelection(game, ui));
  return `${tip(ui, 'roster', '보드의 선수를 누르면 능력과 상태가 아래에 나와요. 큰 얼굴이 스타, 작은 점은 자동으로 뛰는 조연이에요. <b>쉬게 하기</b>를 지정하면 다음 구간에 그 자리를 조연이 메워요.')}
    ${pitchBoard(game, { ...ui, sel: sel?.id })}${sel ? playerDetail(game, ui, sel) : ''}`;
}

function tableTab(game) {
  const league = myLeague(game.world);
  const t = game.myTeam.tier;
  const rows = standings(league);
  const zone = (i) => (t > 1 && i < 2 ? 'up' : (t > 1 && i === 2 ? 'po' : (i >= 18 ? 'down' : '')));
  const legend = [t > 1 && ['up', '자동 승격'], t > 1 && ['po', '승강전'], [ 'down', t === 3 ? '강등권(경질)' : '강등'] ].filter(Boolean);
  return `<ol class="rank">${rows.map((r, i) => `<li class="${r.id === game.myTeam.id ? 'me' : ''}">
      <span class="rank__n"><i class="zone zone--${zone(i)}"></i><b class="num">${i + 1}</b></span>
      <span class="rank__t">${crest(game, r.id, 24)}<span>${esc(teamName(game, r.id))}</span></span>
      <span class="rank__r">${r.won}-${r.drawn}-${r.lost}</span><b class="num rank__p">${r.points}</b></li>`).join('')}</ol>
    <p class="legend">${legend.map(([z, l]) => `<span><i class="zone zone--${z}"></i>${l}</span>`).join('')}<span class="muted">승-무-패 · 승점</span></p>`;
}

function frontTab(game, ui) {
  const { club, myTeam: team } = game;
  const cap = salaryCap(club, team.tier);
  const used = payroll(team);
  const capPanel = section('샐러리캡', `<div class="capline"><b class="num">${used}</b><span>/ ${cap}</span>${bar((used / cap) * 100, used > cap * 0.9 ? 'low' : '')}</div>
    <button class="btn btn--small" data-act="capup" ${capExpandCost(club) > club.coins || club.capLevel >= 5 ? 'disabled' : ''}>${icon('plus', 16)}캡 +10 확장 ${club.capLevel >= 5 ? '최대' : coinNum(capExpandCost(club))}</button>`);
  const fac = Object.keys(FACILITY_LABEL).map((k) => {
    const lv = club.facilities[k];
    const btn = lv >= 10 ? chip('최고 단계') : `<button class="btn btn--small" data-act="upgrade" data-kind="${k}" ${upgradeCost(club, k) > club.coins ? 'disabled' : ''}>${icon('up', 16)}${coinNum(upgradeCost(club, k))}</button>`;
    return `<div class="row"><div><div class="rowt"><b>${FACILITY_LABEL[k]}</b><span class="lv">Lv<b class="num">${lv}</b>/10</span></div><small>${FACILITY_EFFECT[k]}</small>${bar(lv * 10)}</div>${btn}</div>`;
  }).join('');
  const coaches = ['attack', 'defense'].map((kind) => {
    const c = team.coaches[kind];
    const cands = ui.candidates?.[kind];
    return `<div class="coach"><div class="row"><div><b>${KIND_LABEL[kind]}</b>${stars(c.stars, c.stars, 14)}<small>${TRAITS[c.trait]?.label ?? ''} · 계약 ${c.contract.years}년</small>${bar((c.xp / coachXpNeeded(c.stars)) * 100, 'xp')}</div>
      <button class="pill" data-act="coachfind" data-kind="${kind}">새 코치 찾기</button></div>
      <div class="seg" role="group" aria-label="${KIND_LABEL[kind]} 훈련 강도">${['LIGHT', 'NORMAL', 'HARD'].map((i) => `<button class="seg__b${c.intensity === i ? ' on' : ''}" aria-pressed="${c.intensity === i}" data-act="intensity" data-kind="${kind}" data-v="${i}">${INTENSITY_LABEL[i]}</button>`).join('')}</div>
      ${cands ? cands.map((cd) => `<div class="row cand"><div>${stars(cd.stars, cd.stars, 14)}<small>${TRAITS[cd.trait].label}</small></div><button class="btn btn--small" data-act="hire" data-kind="${kind}" data-id="${esc(cd.id)}" ${coachCost(cd.stars) > club.coins ? 'disabled' : ''}>고용 ${coinNum(coachCost(cd.stars))}</button></div>`).join('') : ''}</div>`;
  }).join('');
  const ai = leagueAiTeams(game);
  const mine = team.stars.map((p) => `<option value="${esc(p.id)}">${esc(nameOf(p.id))} (${p.position})</option>`).join('');
  const theirs = ai.map((t) => `<optgroup label="${esc(teamName(game, t.id))}">${t.stars.map((p) => `<option value="${esc(t.id)}:${esc(p.id)}">${esc(nameOf(p.id))} (${p.position})</option>`).join('')}</optgroup>`).join('');
  return `${tip(ui, 'front', '코인으로 시설을 키우고 코치를 바꿀 수 있어요. 샐러리캡은 <b>스타 연봉 합계</b>의 한도예요. 트레이드는 선수 맞교환만 가능하고 코인으로는 못 사요.')}
    ${capPanel}${section('시설', fac)}${section('코치', `${coaches}<p class="hint">강하게 훈련하면 성장은 빠르지만 컨디션·사기·부상이 나빠져요</p>`)}
    ${section('트레이드', `<button class="btn btn--small" data-act="tradein">${icon('swap', 16)}받은 제안 확인</button>
      <div class="tradeform"><label>내 선수<select id="tr-mine">${mine}</select></label><label>상대 선수<select id="tr-theirs">${theirs}</select></label>
      <button class="btn btn--small btn--primary" data-act="tradeout">맞교환 제안</button></div>`)}`;
}

function recordsTab(game) {
  const h = game.history;
  const trophies = h.trophies.length
    ? h.trophies.map((t) => `<li>${icon(t.kind === 'cl' ? 'globe' : (t.kind === 'league' ? 'trophy' : 'medal'), 18)}<span>${t.year}년차</span><b>${t.kind === 'league' ? `${TIER_LABEL[t.tier]} 우승` : (t.kind === 'cl' ? '챔피언스리그 우승' : `${AWARD_LABEL[t.key]} · ${esc(nameOf(t.playerId))}`)}</b></li>`).join('')
    : '<li class="muted">아직 트로피가 없어요</li>';
  const seasons = h.mySeasons.map((s) => `<li><span>${s.year}년차</span><b>${TIER_LABEL[s.tier]} ${s.rank}위</b><span class="fate fate--${s.fate}">${FATE_TEXT[s.fate]}</span></li>`).join('');
  const retired = h.retired.map((r) => {
    const inHall = h.hallOfFame.some((x) => x.playerId === r.playerId);
    return `<li><b>${esc(nameOf(r.playerId))}</b><span>${r.seasons}시즌 ${r.career.goals}골 ${r.career.assists}도움</span>${inHall ? chip('명예의 전당', 'coin') : `<button class="pill" data-act="hall" data-id="${esc(r.playerId)}">명예의 전당에 올리기</button>`}</li>`;
  }).join('');
  const champs = h.champions.map((c) => `<li><span>${c.year}년차</span><b>${c.champions ? esc(teamName(game, c.champions.teamId)) : '-'}</b></li>`).join('');
  return `${section('트로피 진열대', `<ul class="lines">${trophies}</ul>`)}
    ${section('시즌 기록', seasons ? `<ul class="lines">${seasons}</ul>` : '<p class="muted">첫 시즌이 끝나면 쌓여요</p>')}
    ${section('은퇴한 선수', `<ul class="lines">${retired || '<li class="muted">아직 없어요</li>'}</ul>`)}
    ${section('역대 챔피언스리그 우승팀', `<ul class="lines">${champs || '<li class="muted">아직 없어요</li>'}</ul>`)}`;
}

const NAV = [['roster', '로스터', 'jersey'], ['table', '순위', 'list'], ['front', '프런트', 'office'], ['records', '기록실', 'book']];

export function hubScreen(game, ui) {
  const body = { roster: rosterTab, table: tableTab, front: frontTab, records: recordsTab }[ui.tab](game, ui);
  const n = game.chunk;
  const track = `<ol class="track" aria-label="시즌 진행">${['1구간', '2구간', '3구간'].map((l, i) => `<li class="${i < n ? 'done' : (i === n ? 'now' : '')}">${l}</li>`).join('')}</ol>`;
  return `${topBar(game)}<main class="page" style="${teamStyle(game.clubKit)}">${track}${flash(ui)}${body}</main>
    <div class="dock"><button class="btn btn--primary btn--wide" data-act="play">${icon('play', 20)}${n === 0 ? '시즌 시작' : `${n + 1}번째 구간 진행`}</button>
    <nav class="nav" role="tablist">${NAV.map(([k, l, ic]) => `<button role="tab" aria-selected="${ui.tab === k}" class="${ui.tab === k ? 'on' : ''}" data-act="tab" data-v="${k}">${icon(ic, 22)}<span>${l}</span></button>`).join('')}</nav></div>`;
}

// ---------- 구간 결과 ----------
export function chunkScreen(game, ui) {
  const r = ui.last;
  const me = game.myTeam.id;
  const kind = (m) => { const d = (m.homeId === me ? 1 : -1) * (m.homeGoals - m.awayGoals); return d > 0 ? 'w' : (d < 0 ? 'l' : 'd'); };
  const strip = r.matches.map((m, i) => `<li class="rs rs--${kind(m)}" style="--i:${i}">${{ w: '승', d: '무', l: '패' }[kind(m)]}</li>`).join('');
  const rows = r.matches.map((m) => `<li class="m m--${kind(m)}"><span class="m__t">${crest(game, m.homeId, 20)}<span>${esc(teamName(game, m.homeId))}</span></span><b class="num m__s">${m.homeGoals}<i>:</i>${m.awayGoals}</b><span class="m__t m__t--r"><span>${esc(teamName(game, m.awayId))}</span>${crest(game, m.awayId, 20)}</span></li>`).join('');
  const events = [
    ...r.steps.filter((s) => s.levelUps > 0).map((s) => `<li>${icon('up', 18)}<span><b>${esc(nameOf(s.id))}</b> 레벨업 ${s.levelUps}회</span></li>`),
    ...r.steps.filter((s) => s.injured).map((s) => `<li class="bad">${icon('cross', 18)}<span><b>${esc(nameOf(s.id))}</b> 부상</span></li>`),
  ];
  const press = game.pending.press;
  const opts = (list, attrs) => list.map((o, i) => `<button class="opt" ${attrs(i)} ${(o.effects.coins ?? 0) + game.club.coins < 0 ? 'disabled' : ''}><b>${esc(o.label)}</b><span>${effectChips(o.effects)}</span></button>`).join('');
  const pressHtml = press ? `<section class="ask"><h3>${icon('mic', 20)}기자회견</h3><p>${esc(press.text)}</p>${opts(press.options, (i) => `data-act="press" data-i="${i}"`)}</section>` : '';
  const iv = game.pending.interviews.map(({ playerId, interview }) => `<section class="ask"><h3>${icon('chat', 20)}${esc(nameOf(playerId))} 면담</h3><p>${esc(interview.text)}</p>${opts(interview.options, (i) => `data-act="interview" data-id="${esc(playerId)}" data-i="${i}"`)}</section>`).join('');
  const last = game.phase === 'seasonEnd';
  return `${topBar(game)}<main class="page" style="${teamStyle(game.clubKit)}">
    ${tip(ui, 'chunk', '승리하면 코인이 들어와요. 득점·도움을 한 선수는 성장이 빨라져요. 기자회견과 면담은 선택마다 효과가 달라요.')}
    <div class="titlebar"><h2>${r.chunk}번째 구간</h2><span class="res res--coin">${icon('coin', 16)}<b class="num">+${r.income.total}</b></span></div>
    <p class="record"><b class="num">${r.won}</b>승 <b class="num">${r.drawn}</b>무 <b class="num">${r.lost}</b>패 <small>승리 ${r.income.win} + 홈 팬 ${r.income.fan}</small></p>
    <ol class="strip" aria-label="경기 결과">${strip}</ol>
    ${events.length ? `<ul class="notes">${events.join('')}</ul>` : ''}
    ${pressHtml}${iv}
    <h3 class="group">경기</h3><ol class="matches">${rows}</ol>
  </main>
  <div class="dock"><button class="btn btn--primary btn--wide" data-act="${last ? 'finish' : 'back'}">${last ? '시즌 마무리' : '관리 화면으로'}${icon('right', 20)}</button></div>`;
}

// ---------- 시즌 종료 ----------
export function seasonScreen(game) {
  const s = game.season;
  const fateMsg = { promoted: '승격했습니다', stay: '잔류했습니다', fired: '경질되었습니다' }[s.fate];
  const aw = Object.values(s.awards).filter(Boolean).map((a) => {
    const mine = a.teamId === game.myTeam.id;
    return `<li class="${mine ? 'me' : ''}"><span class="lab">${icon('medal', 16)}${AWARD_LABEL[a.key]}</span><b>${esc(nameOf(a.playerId))}</b><small>${esc(teamName(game, a.teamId))}</small></li>`;
  }).join('');
  const po = s.outcome.playoffs.map((m) => `<li><span>${esc(teamName(game, m.homeId))} <b class="num">${m.homeGoals}:${m.awayGoals}</b> ${esc(teamName(game, m.awayId))}${m.penalties ? ' (승부차기)' : ''}</span><b>${esc(teamName(game, m.winnerId))} 승</b></li>`).join('');
  return `${topBar(game)}<main class="page" style="${teamStyle(game.clubKit)}">
    <section class="stage"><p class="stage__t">${s.year}년차 ${TIER_LABEL[s.tier]}</p><div class="stage__rank"><b class="num">${s.rank}</b><span>위</span></div><p class="stage__f">${fateMsg}</p>${s.prize ? `<p class="stage__p">${coinNum(`+${s.prize}`)} 상금</p>` : ''}</section>
    ${section('챔피언스리그', `<p>우승 <b>${esc(teamName(game, s.cl.champion))}</b> · 준우승 ${esc(teamName(game, s.cl.runnerUp))}${s.cl.champion === game.myTeam.id ? ` ${chip('우리 팀', 'coin')}` : ''}</p>`)}
    ${section('시상', `<ul class="lines lines--awards">${aw}</ul>`)}
    ${section('승강전', `<ul class="lines lines--po">${po}</ul>`)}
  </main>
  <div class="dock">${game.phase === 'ended'
    ? '<button class="btn btn--primary btn--wide" data-act="toend">결산 보기</button>'
    : '<button class="btn btn--primary btn--wide" data-act="offseason">오프시즌 시작</button><button class="btn btn--ghost btn--wide" data-act="retire">감독 은퇴</button>'}</div>`;
}

// ---------- 오프시즌 ----------
const STEPS = [['resign', '재계약'], ['market', 'FA 시장'], ['draft', '드래프트'], ['rookies', '신인 배치']];
const stepper = (step) => {
  const at = STEPS.findIndex(([k]) => k === step);
  return `<ol class="steps">${STEPS.map(([k, l], i) => `<li class="${i < at ? 'done' : (i === at ? 'now' : '')}"><i>${i < at ? icon('check', 12) : i + 1}</i><span>${l}</span></li>`).join('')}</ol>`;
};
const salaryInput = (id, v) => `<input class="sal" type="number" min="1" max="99" id="sal-${esc(id)}" value="${v}" aria-label="제시 연봉">`;

export function offseasonScreen(game, ui) {
  const off = game.off;
  const kit = game.clubKit;
  let body = '';
  if (off.step === 'resign') {
    const ret = off.retired.map((c) => `<li>${icon('flag', 16)}<b>${esc(nameOf(c.playerId))}</b><span>은퇴 · ${c.seasons}시즌 ${c.career.goals}골 ${c.career.assists}도움</span></li>`).join('');
    const list = off.resignQueue.map((p) => playerRow(p, { kit, contract: true, stack: true, action: `<div class="offer">${salaryInput(p.id, askingSalary(p))}<button class="btn btn--small btn--primary" data-act="resign" data-id="${esc(p.id)}">재계약</button><button class="link" data-act="decline" data-id="${esc(p.id)}">보내기</button></div>` })).join('');
    const coaches = off.coachExpiring.map((c) => `<div class="row"><div><b>${KIND_LABEL[c.kind]}</b>${stars(c.stars, c.stars, 14)}<small>계약이 끝났어요</small></div><button class="btn btn--small" data-act="renewcoach" data-kind="${c.kind}">재계약 ${coinNum(coachCost(c.stars))}</button></div>`).join('');
    body = `${tip(ui, 'resign', '계약이 끝난 선수에게 우선 재계약을 제안할 수 있어요. 사기가 낮으면 어떤 금액도 거절해요. 보내면 FA 시장에 나와요.')}
      ${ret ? section('은퇴', `<ul class="lines">${ret}</ul>`) : ''}
      ${list || '<p class="muted pad">이번에 계약이 끝나는 스타는 없어요</p>'}
      ${coaches ? section('코치 계약', `${coaches}<p class="hint">재계약하지 않으면 1별 신임 코치가 옵니다</p>`) : ''}
      <div class="dock dock--page"><button class="btn btn--primary btn--wide" data-act="openmarket">FA 시장 열기${icon('right', 20)}</button></div>`;
  } else if (off.step === 'market') {
    const full = game.myTeam.stars.length >= 6;
    const mine = game.myTeam.stars.map((p) => `<div class="row"><div>${esc(nameOf(p.id))} <small>${p.position} · 연봉 ${p.contract.salary}</small></div><button class="link" data-act="release" data-id="${esc(p.id)}">내보내기</button></div>`).join('');
    const market = off.market.map((e) => playerRow(e.player, {
      kit, stack: true,
      note: `<div class="conds">${conditionTexts(e.conditions).map((t) => chip(t)).join('') || chip('조건 없음', 'up')}</div>`,
      action: `<div class="offer">${salaryInput(e.player.id, e.asking)}<small>${askText(e.player)}</small><button class="btn btn--small btn--primary" data-act="offerfa" data-id="${esc(e.player.id)}">영입 제안</button></div>`,
    })).join('');
    body = `${tip(ui, 'market', '선수마다 요구 금액과 <b>영입 조건</b>(작년 순위, 시설, 팬, 팀 사기)이 달라요. 조건을 채우고 금액이 요구 이상이면 계약해요. 못 잡은 선수는 다른 팀이 데려가요.')}
      ${section(`내 스타 <span class="count">${game.myTeam.stars.length}/6</span>`, `${full ? '<p class="hint">자리가 가득 찼어요. 영입하려면 먼저 한 명을 내보내세요</p>' : ''}${mine}`)}
      ${market || '<p class="muted pad">시장이 비었어요</p>'}
      <div class="dock dock--page"><button class="btn btn--primary btn--wide" data-act="closemarket">시장 마감${icon('right', 20)}</button></div>`;
  } else if (off.step === 'draft') {
    const d = off.draft;
    const mineTurn = draftTurnIsMine(game);
    const slot = d.order.filter((o) => o.owner === game.myTeam.id).map((o) => `${o.slot}번`).join(', ') || '없음';
    body = `${tip(ui, 'draft', '성적이 나쁜 팀부터 신인을 한 명씩 지명해요. 내 순번이 오면 후보 중에서 고르세요. 지명권은 트레이드로 오갈 수 있어요.')}
      <p class="lede">내 지명 순번 <b>${slot}</b></p>
      ${mineTurn ? d.pool.map((p) => playerRow(p, { kit, action: `<button class="btn btn--small btn--primary" data-act="dpick" data-id="${esc(p.id)}">지명</button>` })).join('') : '<p class="muted pad">내 지명이 끝났어요</p>'}
      <div class="dock dock--page"><button class="btn btn--primary btn--wide" data-act="closedraft" ${mineTurn ? 'disabled' : ''}>드래프트 마감${icon('right', 20)}</button></div>`;
  } else {
    const full = game.myTeam.stars.length >= 6;
    const opts = game.myTeam.stars.map((p) => `<option value="${esc(p.id)}">${esc(nameOf(p.id))} (${p.position})</option>`).join('');
    body = `${tip(ui, 'rookies', '뽑은 신인을 스타로 올리세요. 자리가 가득하면 내보낼 스타를 골라야 해요. 올리지 않은 신인은 떠나요.')}
      ${off.rookies.map((p) => playerRow(p, { kit, contract: true, stack: true, action: `<div class="offer">${full ? `<select id="out-${esc(p.id)}" aria-label="내보낼 스타">${opts}</select>` : ''}<button class="btn btn--small btn--primary" data-act="place" data-id="${esc(p.id)}">스타로 올리기</button></div>` })).join('') || '<p class="muted pad">대기 중인 신인이 없어요</p>'}
      <div class="dock dock--page"><button class="btn btn--primary btn--wide" data-act="startseason">${game.world.year}년차 시즌 시작${icon('right', 20)}</button></div>`;
  }
  return `${topBar(game)}<main class="page" style="${teamStyle(kit)}"><div class="titlebar"><h2>오프시즌</h2></div>${stepper(off.step)}${flash(ui)}${body}</main>`;
}

// ---------- 런 종료 ----------
export function endScreen(game) {
  const s = game.end.summary;
  const h = game.history;
  const hall = h.hallOfFame.map((x) => `<li><b>${esc(nameOf(x.playerId))}</b></li>`).join('');
  const star = s.standout.map((id) => { const r = h.players.get(id); return `<li><b>${esc(nameOf(id))}</b><span>${r.career.goals}골 ${r.career.assists}도움</span></li>`; }).join('');
  return `<main class="page end" style="${teamStyle(game.clubKit)}">
    <section class="stage"><p class="stage__t">${esc(game.clubName)} · ${s.seasons}시즌</p><h1 class="stage__h">${game.end.reason === 'fired' ? '경질' : '감독 은퇴'}</h1>
      <div class="stage__rank stage__rank--score"><b class="num">${s.score}</b><span>점</span></div></section>
    ${section('커리어', `<dl class="kv kv--wide"><dt>최고 리그</dt><dd>${TIER_LABEL[s.bestTier]}</dd><dt>리그 우승</dt><dd><b class="num">${s.leagueTitles}</b>회</dd><dt>챔피언스리그 우승</dt><dd><b class="num">${s.clTitles}</b>회</dd><dt>개인 수상</dt><dd><b class="num">${s.awardCount}</b>개</dd></dl>`)}
    ${section('대표 선수', `<ul class="lines">${star || '<li class="muted">없음</li>'}</ul>`)}
    ${section('명예의 전당', `<ul class="lines">${hall || '<li class="muted">없음</li>'}</ul>`)}
    <button class="btn btn--primary btn--wide" data-act="newrun">새 게임</button>
  </main>`;
}

