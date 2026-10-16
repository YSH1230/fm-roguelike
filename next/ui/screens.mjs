import { TRAITS } from '../engine/constants.mjs';
import { askingSalary, payroll } from '../engine/contract.mjs';
import { capExpandCost, salaryCap, upgradeCost } from '../engine/economy.mjs';
import { leagueAiTeams } from '../engine/game.mjs';
import { standings } from '../engine/league.mjs';
import { nameOf } from '../engine/names.mjs';
import { draftTurnIsMine } from '../engine/offseason.mjs';
import { isDraftOver, pickNumbers } from '../engine/draft.mjs';
import { coachCost, coachXpNeeded } from '../engine/coach.mjs';
import { myLeague } from '../engine/world.mjs';
import {
  AWARD_LABEL, KIT_CHOICES, METAL_DEFS, TIER_LABEL, askText, bar, chip, conditionTexts, crest, effectChips, esc, facts, faceTile,
  abilityStars, icon, metalIcon, onColor, playerRow, portrait, stars, teamKit, teamName,
} from './components.mjs';
import { defaultSelection, pitchBoard, playerDetail } from './pitch.mjs';

const FACILITY_LABEL = { stadium: 'STADIUM', training: 'TRAINING', rehab: 'REHAB' };
const FACILITY_EFFECT = { stadium: '홈경기 수입과 팬이 늘어요', training: '선수 성장이 빨라져요', rehab: '부상에서 더 빨리 돌아와요' };
const KIND_LABEL = { attack: 'ATTACK COACH', defense: 'DEFENSE COACH' };
const INTENSITY_LABEL = { LIGHT: 'LIGHT', NORMAL: 'NORMAL', HARD: 'HARD' };
const FATE_TEXT = { promoted: '승격', stay: '잔류', fired: '경질' };

const tip = (ui, id, text) => (ui.tips?.has(id) ? '' : `<aside class="tip">${icon('info', 18)}<p>${text}</p><button class="link" data-act="tip" data-id="${id}">확인</button></aside>`);
const flash = (ui) => (ui.flash ? `<p class="flash" role="status">${esc(ui.flash)}</p>` : '');
const teamStyle = (kit) => `--team:${kit};--on-team:${onColor(kit)}`;
const section = (title, body, extra = '') => `<section class="panel ${extra}"><h3>${title}</h3>${body}</section>`;
const pips = (n, total) => `<span class="pips" aria-label="${n}/${total}">${Array.from({ length: total }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
const coinNum = (n) => `<span class="res res--coin">${icon('coin', 16)}<b class="num">${n}</b></span>`;
const head = (left, right) => `<div class="rephead"><span class="lab">${left}</span><span class="lab">${right}</span></div>`;
const triple = (items) => `<div class="tri">${items.map(([v, l]) => `<div><b class="num">${v}</b><span>${l}</span></div>`).join('')}</div>`;

// ---------- 공통 ----------
export function topBar(game) {
  const t = game.myTeam;
  return `<header class="top" style="${teamStyle(game.clubKit)}">
    <div class="top__id">${crest(game, t.id, 40)}<div><h1>${esc(game.clubName)}</h1><p>${facts(TIER_LABEL[t.tier], `${game.world.year}년차`)}</p></div></div>
    <div class="top__res"><span class="res" title="코인">${icon('coin', 18)}<b class="num">${game.club.coins}</b></span><span class="res" title="팬 지수">${icon('fans', 18)}<b class="num">${Math.round(game.club.fans)}</b></span></div>
  </header>`;
}

export function titleScreen({ hasSave, kit }) {
  const faces = ['t-1', 't-2', 't-3'].map((id) => faceTile({ id, position: 'FW', age: 22 }, { kit, size: 64 })).join('');
  return `<section class="title" style="${teamStyle(kit)}">
    <div class="title__hero">${head('FM-LITE', 'MANAGER GAME')}<h1 class="wordmark">FM-<br>LITE</h1><p>3부 리그 작은 구단에서 시작해<br>1부, 그리고 챔피언스리그 정상까지.</p><div class="title__faces">${faces}</div></div>
    <div class="title__form">
      <label class="field"><span class="lab">CLUB NAME</span><input id="club-name" maxlength="14" value="새벽 FC" autocomplete="off"></label>
      <fieldset class="swatches"><legend class="lab">CLUB COLOR</legend>${KIT_CHOICES.map(([hex, label]) => `<button class="swatch${hex === kit ? ' on' : ''}" style="--c:${hex}" data-act="kit" data-v="${hex}" aria-pressed="${hex === kit}" aria-label="${label}"></button>`).join('')}</fieldset>
      <button class="btn btn--primary" data-act="new">NEW GAME</button>
      ${hasSave ? '<button class="btn btn--ghost" data-act="continue">CONTINUE</button>' : ''}
    </div>
  </section>`;
}


// ---------- 드래프트 공통 보드: 시작 전(규칙·순번표·후보 명단) -> 진행(지명 연출·내 차례) -> 끝(내 지명 결과) ----------
const POS_ORDER = ['GK', 'DF', 'MF', 'FW'];
const revealing = (ui) => Boolean(ui.reveal);

// 지명 한 건의 연출: 먼저 지명한 구단 로고, 이어서 선수가 크게 나온다.
function pickSplash(game, d, ui) {
  const k = d.picks[ui.reveal.shown];
  const mine = k.owner === game.myTeam.id;
  const kit = teamKit(game, k.owner);
  const name = esc(teamName(game, k.owner));
  if ((ui.reveal.stage ?? 'logo') === 'logo') {
    return `<div class="splash splash--logo${mine ? ' splash--me' : ''}"><span class="lab">PICK #${k.slot} / ${d.order.length}</span>${crest(game, k.owner, 112)}<h3>${name}</h3></div>`;
  }
  return `<div class="splash splash--player${mine ? ' splash--me' : ''}"><span class="lab">${mine ? 'MY PICK' : 'PICK'} #${k.slot}</span>
    <div class="splash__face" style="--tile:${kit};--on-tile:${onColor(kit)}">${portrait(k.player, { size: 96, kit })}<span class="pos">${k.player.position}</span></div>
    <h3 class="splash__name">${esc(nameOf(k.player.id))}</h3>
    <p class="splash__meta">${abilityStars(k.player, 18)}<span>${k.player.age}세</span></p>
    <p class="splash__team">${crest(game, k.owner, 20)}${name}</p></div>`;
}

// 규칙 한 줄 설명(시작 드래프트와 오프시즌 드래프트가 같은 보드를 쓴다)
function draftRules(d, cfg) {
  const n = new Set(d.order.map((o) => o.owner)).size;
  const rounds = Math.max(...d.order.map((o) => o.round ?? 1));
  const lines = [`${n}개 구단이 ${rounds}라운드에 걸쳐 한 명씩 지명해요. 모두 ${d.order.length}번의 지명이 이뤄져요.`,
    `지난 시즌 순위가 나쁜 팀부터 지명해요(꼴찌가 1번).${rounds > 1 ? ` ROUND 1부터 ${rounds}까지 모두 같은 순서예요.` : ''}`];
  if (cfg.rule) lines.push(cfg.rule);
  lines.push('내 차례가 오면 남은 후보 중 한 명을 골라 지명해요. 순번이 되기 전에는 지명할 수 없어요.');
  lines.push('지명한 선수는 3년 신인 계약으로 내 팀에 들어와요.');
  return `<ul class="rules">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`;
}

function draftBoard(game, d, ui, cfg) {
  const me = game.myTeam.id;
  const kit = game.clubKit;
  const mineNums = pickNumbers(d, me);
  const total = d.order.length;
  const waiting = d.started && revealing(ui);
  const shown = waiting ? ui.reveal.shown : d.picks.length;
  const over = isDraftOver(d) && !waiting;
  const upNext = over ? null : d.order[waiting ? Math.min(shown, total - 1) : d.next];
  const myTurn = d.started && !over && !waiting && upNext.owner === me;

  // 시작 전: 규칙, 내 순번, 순서표, 후보 명단
  if (!d.started) {
    const rounds = Math.max(...d.order.map((o) => o.round ?? 1));
    const rankOf = (id) => d.lastYear?.[id] ?? (game.season?.draftStandings ?? []).findIndex((r) => r.id === id) + 1;
    const orderView = `<ol class="order">${d.order.filter((o) => (o.round ?? 1) === 1).map((o) => `<li class="${o.owner === me ? 'me' : ''}"><b class="num">${o.slot}</b>${crest(game, o.owner, 22)}<span>${esc(teamName(game, o.owner))}</span>${rankOf(o.owner) ? `<small>LAST YEAR ${rankOf(o.owner)}</small>` : ''}</li>`).join('')}</ol>`;
    return `${head(cfg.label, `${total} PICKS`)}
      <div class="titlebar"><h2>${cfg.title}</h2></div>
      ${section('RULES', draftRules(d, cfg))}
      ${section('MY PICKS', `${triple(mineNums.map((n, i) => [`#${n}`, rounds > 1 ? `ROUND ${i + 1}` : 'PICK']))}
        <p class="hint center">${mineNums[0] - 1 > 0 ? `내 첫 지명 전에 ${mineNums[0] - 1}번의 지명이 먼저 이뤄져요` : '내가 가장 먼저 지명해요'}</p>`)}
      ${section('DRAFT ORDER', orderView)}
      <h3 class="group">PROSPECTS <span class="count">${d.pool.length}</span></h3>
      ${d.pool.map((p) => playerRow(p, { kit })).join('')}
      <div class="dock dock--page"><button class="btn btn--primary btn--wide" data-act="dstart">${icon('play', 20)}START DRAFT</button></div>`;
  }

  // 진행·끝
  const clock = waiting
    ? pickSplash(game, d, ui)
    : (over
      ? `<div class="clock clock--done"><span class="lab">DRAFT COMPLETE</span><b class="num">${total}<small>/${total}</small></b><p>모든 지명이 끝났어요</p></div>`
      : `<div class="clock${upNext.owner === me ? ' clock--me' : ''}"><span class="lab">ON THE CLOCK</span>
        <b class="num">#${upNext.slot}<small>/${total}</small></b>
        <p>${upNext.owner === me ? '내 차례예요. 후보를 골라 지명하세요' : `${crest(game, upNext.owner, 22)}${esc(teamName(game, upNext.owner))}가 고르는 중`}</p></div>`);

  // 내 선수 포지션 현황: 포지션을 누르면 그 포지션의 내 선수가 보인다
  const mineNow = [...game.myTeam.stars, ...d.picks.slice(0, shown).filter((x) => x.owner === me).map((x) => x.player)];
  const have = Object.fromEntries(POS_ORDER.map((k) => [k, mineNow.filter((p) => p.position === k)]));
  const need = `<div class="needs"><span class="lab">MY ROSTER</span>
    <div class="needs__row">${POS_ORDER.map((k) => `<button class="need${have[k].length === 0 ? ' need--zero' : ''}${ui.dpos === k ? ' need--on' : ''}" data-act="dpos" data-v="${k}" aria-pressed="${ui.dpos === k}">${k}<b class="num">${have[k].length}</b></button>`).join('')}</div>
    ${ui.dpos ? `<div class="needs__list">${have[ui.dpos].length ? have[ui.dpos].map((p) => playerRow(p, { kit })).join('') : '<p class="muted">이 포지션에는 아직 선수가 없어요</p>'}</div>` : ''}</div>`;

  const from = ui.reveal?.from ?? Infinity;
  const log = d.picks.slice(0, shown).map((k, i) => ({ k, i })).reverse().map(({ k, i }) => `<li class="pick${k.owner === me ? ' pick--me' : ''}${i >= from && waiting && i === shown - 1 ? ' pick--new' : ''}">
      <b class="num">#${k.slot}</b><span class="pick__t">${crest(game, k.owner, 20)}<span>${esc(teamName(game, k.owner))}</span></span>
      <span class="pick__p"><b>${esc(nameOf(k.player.id))}</b><span class="tag">${k.player.position}</span>${abilityStars(k.player, 12)}</span></li>`).join('');

  const myPicks = d.picks.slice(0, shown).filter((k) => k.owner === me);
  const pickList = myTurn
    ? `<h3 class="group">YOUR PICK <span class="count">남은 후보 ${d.pool.length}</span></h3>${d.pool.map((p) => playerRow(p, { kit, action: `<button class="btn btn--small btn--primary" data-act="${cfg.pickAct}" data-id="${esc(p.id)}">지명</button>` })).join('')}`
    : '';
  const done = over
    ? `${section('MY DRAFT', myPicks.map((k) => playerRow(k.player, { kit })).join('') || '<p class="muted">이번에는 지명이 없었어요</p>')}`
    : '';
  const cta = over
    ? `<div class="dock dock--page"><button class="btn btn--primary btn--wide" data-act="${cfg.doneAct}">${cfg.doneLabel}</button></div>`
    : '';
  return `${head(cfg.label, `PICK ${Math.min(shown + 1, total)} / ${total}`)}
    <div class="titlebar"><h2>${cfg.title}</h2>${waiting ? `<button class="pill" data-act="dskip">${icon('next', 16)}SKIP</button>` : ''}</div>
    ${clock}${need}${pickList}${done}
    <h3 class="group">PICK LOG</h3><ol class="picklog">${log || '<li class="muted">아직 지명이 없어요</li>'}</ol>${cta}`;
}

// ---------- 시작 드래프트 ----------
export function startDraftScreen(game, ui) {
  const d = game.startDraft;
  return `${topBar(game)}<main class="page">${draftBoard(game, d, ui, {
    label: 'START DRAFT', title: '시작 드래프트', pickAct: 'sdraft', doneAct: 'dfinish', doneLabel: 'START SEASON',
    tip: ['start', '8개 구단이 3라운드로 신인을 지명해요. 순번이 오면 후보 중에서 한 명을 고르세요. 별 색이 진한 만큼이 지금 실력, 옅은 만큼이 잠재(앞으로 클 한계)예요. 어린데 잠재가 큰 선수가 보석이에요.'],
  })}</main>`;
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
  const legend = [t > 1 && ['up', '자동 승격'], t > 1 && ['po', '승강전'], ['down', t === 3 ? '강등권(경질)' : '강등']].filter(Boolean);
  return `${head('LEAGUE TABLE', TIER_LABEL[t])}<ol class="rank">${rows.map((r, i) => `<li class="${r.id === game.myTeam.id ? 'me' : ''}">
      <span class="rank__n"><i class="zone zone--${zone(i)}"></i><b class="num">${i + 1}</b></span>
      <span class="rank__t">${crest(game, r.id, 24)}<span>${esc(teamName(game, r.id))}</span></span>
      <span class="rank__r">${r.won}-${r.drawn}-${r.lost}</span><b class="num rank__p">${r.points}</b></li>`).join('')}</ol>
    <p class="legend">${legend.map(([z, l]) => `<span><i class="zone zone--${z}"></i>${l}</span>`).join('')}<span class="muted">승-무-패 · 승점</span></p>`;
}

function frontTab(game, ui) {
  const { club, myTeam: team } = game;
  const cap = salaryCap(club, team.tier);
  const used = payroll(team);
  const capPanel = section('SALARY CAP', `<div class="capline"><b class="num">${used}</b><span>/ ${cap}</span>${bar((used / cap) * 100, used > cap * 0.9 ? 'low' : '')}</div>
    <button class="btn btn--small" data-act="capup" ${capExpandCost(club) > club.coins || club.capLevel >= 5 ? 'disabled' : ''}>${icon('plus', 16)}캡 +10 확장 ${club.capLevel >= 5 ? '최대' : coinNum(capExpandCost(club))}</button>`);
  const fac = Object.keys(FACILITY_LABEL).map((k) => {
    const lv = club.facilities[k];
    const btn = lv >= 10 ? chip('MAX') : `<button class="btn btn--small" data-act="upgrade" data-kind="${k}" ${upgradeCost(club, k) > club.coins ? 'disabled' : ''}>${icon('upgrade', 16)}${coinNum(upgradeCost(club, k))}</button>`;
    return `<div class="row"><div><div class="rowt"><b>${FACILITY_LABEL[k]}</b><span class="lv">LV <b class="num">${lv}</b>/10</span></div><small>${FACILITY_EFFECT[k]}</small>${bar(lv * 10)}</div>${btn}</div>`;
  }).join('');
  const coaches = ['attack', 'defense'].map((kind) => {
    const c = team.coaches[kind];
    const cands = ui.candidates?.[kind];
    return `<div class="coach"><div class="row"><div><b>${KIND_LABEL[kind]}</b>${stars(c.stars, c.stars, 14)}<small>${facts(TRAITS[c.trait]?.label ?? '', `계약 ${c.contract.years}년`)}</small>${bar((c.xp / coachXpNeeded(c.stars)) * 100, 'xp')}</div>
      <button class="pill" data-act="coachfind" data-kind="${kind}">새 코치 찾기</button></div>
      <div class="seg" role="group" aria-label="${KIND_LABEL[kind]} 훈련 강도">${['LIGHT', 'NORMAL', 'HARD'].map((i) => `<button class="seg__b${c.intensity === i ? ' on' : ''}" aria-pressed="${c.intensity === i}" data-act="intensity" data-kind="${kind}" data-v="${i}">${INTENSITY_LABEL[i]}</button>`).join('')}</div>
      ${cands ? cands.map((cd) => `<div class="row cand"><div>${stars(cd.stars, cd.stars, 14)}<small>${TRAITS[cd.trait].label}</small></div><button class="btn btn--small" data-act="hire" data-kind="${kind}" data-id="${esc(cd.id)}" ${coachCost(cd.stars) > club.coins ? 'disabled' : ''}>고용 ${coinNum(coachCost(cd.stars))}</button></div>`).join('') : ''}</div>`;
  }).join('');
  const ai = leagueAiTeams(game);
  const mine = team.stars.map((p) => `<option value="${esc(p.id)}">${esc(nameOf(p.id))} (${p.position})</option>`).join('');
  const theirs = ai.map((t) => `<optgroup label="${esc(teamName(game, t.id))}">${t.stars.map((p) => `<option value="${esc(t.id)}:${esc(p.id)}">${esc(nameOf(p.id))} (${p.position})</option>`).join('')}</optgroup>`).join('');
  return `${tip(ui, 'front', '코인으로 시설을 키우고 코치를 바꿀 수 있어요. 샐러리캡은 <b>스타 연봉 합계</b>의 한도예요. 트레이드는 선수 맞교환만 가능하고 코인으로는 못 사요.')}
    ${capPanel}${section('FACILITIES', fac)}${section('COACHES', `${coaches}<p class="hint">강하게 훈련하면 성장은 빠르지만 컨디션·사기·부상이 나빠져요</p>`)}
    ${section('TRADE', `<button class="btn btn--small" data-act="tradein">${icon('transfer', 16)}받은 제안 확인</button>
      <div class="tradeform"><label>내 선수<select id="tr-mine">${mine}</select></label><label>상대 선수<select id="tr-theirs">${theirs}</select></label>
      <button class="btn btn--small btn--primary" data-act="tradeout">맞교환 제안</button></div>`)}`;
}

// 기록실의 업적 배지: 얻은 것은 금·은·동, 아직 못 얻은 것은 회색으로 몇 개 보여 준다.
const TIER_ORDER = { gold: 0, silver: 1, bronze: 2 };
const AWARD_BADGE = {
  ballonDor: ['medal', 'gold'], mvp: ['manager', 'silver'], goldenBoot: ['ball', 'silver'],
  assistKing: ['transfer', 'bronze'], goldenGlove: ['shield', 'bronze'], youngStar: ['bolt', 'bronze'],
};
export function achievementBadges(game) {
  const h = game.history;
  const earned = [];
  for (const t of h.trophies) {
    if (t.kind === 'league') earned.push({ ic: 'trophy', name: 'CHAMPION', sub: `${TIER_LABEL[t.tier]} 우승`, tier: 'gold', year: t.year });
    else if (t.kind === 'cl') earned.push({ ic: 'globe', name: 'CHAMPIONS', sub: '챔피언스리그 우승', tier: 'gold', year: t.year });
    else { const [ic, tier] = AWARD_BADGE[t.key]; earned.push({ ic, name: AWARD_LABEL[t.key], sub: nameOf(t.playerId), tier, year: t.year }); }
  }
  for (const s of h.mySeasons) if (s.fate === 'promoted') earned.push({ ic: 'upgrade', name: 'PROMOTED', sub: `${TIER_LABEL[s.tier]} 승격`, tier: 'silver', year: s.year });
  earned.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || b.year - a.year);
  const locked = [['globe', 'CHAMPIONS', '챔피언스리그 우승'], ['trophy', 'TOP LEAGUE', '1부 우승'], ['medal', "BALLON D'OR", '발롱도르']]
    .filter(([, n]) => !earned.some((e) => e.name === n))
    .map(([ic, name, sub]) => ({ ic, name, sub, tier: 'locked' }));
  return [...earned, ...locked].slice(0, Math.max(6, earned.length));
}

function recordsTab(game) {
  const h = game.history;
  const badges = achievementBadges(game).map((b) => `<div class="badge ${b.tier}"><div class="shield">${b.tier === 'locked' ? icon(b.ic, 36) : metalIcon(b.ic, b.tier)}</div><b>${esc(b.name)}</b><small>${esc(b.sub)}</small><span class="tier">${b.tier === 'locked' ? 'LOCKED' : `${b.tier.toUpperCase()} · YEAR ${b.year}`}</span></div>`).join('');
  const seasons = h.mySeasons.map((s) => `<li><span class="lab">YEAR ${s.year}</span><b>${TIER_LABEL[s.tier]} ${s.rank}위</b><span class="fate fate--${s.fate}">${FATE_TEXT[s.fate]}</span></li>`).join('');
  const retired = h.retired.map((r) => {
    const inHall = h.hallOfFame.some((x) => x.playerId === r.playerId);
    return `<li><b>${esc(nameOf(r.playerId))}</b><span>${facts(`${r.seasons}시즌`, `${r.career.goals}골 ${r.career.assists}도움`)}</span>${inHall ? chip('HALL OF FAME', 'best') : `<button class="pill" data-act="hall" data-id="${esc(r.playerId)}">명예의 전당에 올리기</button>`}</li>`;
  }).join('');
  const champs = h.champions.map((c) => `<li><span class="lab">YEAR ${c.year}</span><b>${c.champions ? esc(teamName(game, c.champions.teamId)) : '-'}</b></li>`).join('');
  return `${METAL_DEFS}${head('ACHIEVEMENTS', `${h.trophies.length + h.mySeasons.filter((s) => s.fate === 'promoted').length} EARNED`)}
    <div class="badges">${badges}</div>
    ${section('SEASONS', seasons ? `<ul class="lines">${seasons}</ul>` : '<p class="muted">첫 시즌이 끝나면 쌓여요</p>')}
    ${section('RETIRED', `<ul class="lines">${retired || '<li class="muted">아직 없어요</li>'}</ul>`)}
    ${section('CHAMPIONS LEAGUE', `<ul class="lines">${champs || '<li class="muted">아직 없어요</li>'}</ul>`)}`;
}

const NAV = [['roster', 'ROSTER', 'roster'], ['table', 'TABLE', 'table'], ['front', 'FRONT', 'front'], ['records', 'RECORDS', 'records']];

export function hubScreen(game, ui) {
  const body = { roster: rosterTab, table: tableTab, front: frontTab, records: recordsTab }[ui.tab](game, ui);
  const n = game.chunk;
  const track = `<ol class="track" aria-label="시즌 진행">${['1구간', '2구간', '3구간'].map((l, i) => `<li class="${i < n ? 'done' : (i === n ? 'now' : '')}">${l}</li>`).join('')}</ol>`;
  return `${topBar(game)}<main class="page" style="${teamStyle(game.clubKit)}">${track}${flash(ui)}${body}</main>
    <div class="dock"><button class="btn btn--primary btn--wide" data-act="play">${icon('play', 20)}${n === 0 ? 'START SEASON' : `ROUND ${n + 1}`}</button>
    <nav class="nav" role="tablist">${NAV.map(([k, l, ic]) => `<button role="tab" aria-selected="${ui.tab === k}" class="${ui.tab === k ? 'on' : ''}" data-act="tab" data-v="${k}">${icon(ic, 22)}<span>${l}</span></button>`).join('')}</nav></div>`;
}

// ---------- 구간 결과 ----------
export function chunkScreen(game, ui) {
  const r = ui.last;
  const me = game.myTeam.id;
  const kind = (m) => { const d = (m.homeId === me ? 1 : -1) * (m.homeGoals - m.awayGoals); return d > 0 ? 'w' : (d < 0 ? 'l' : 'd'); };
  const strip = r.matches.map((m, i) => `<li class="rs rs--${kind(m)}" style="--i:${i}">${{ w: 'W', d: 'D', l: 'L' }[kind(m)]}</li>`).join('');
  const rows = r.matches.map((m) => `<li class="m m--${kind(m)}"><span class="m__t">${crest(game, m.homeId, 20)}<span>${esc(teamName(game, m.homeId))}</span></span><b class="num m__s">${m.homeGoals}<i>:</i>${m.awayGoals}</b><span class="m__t m__t--r"><span>${esc(teamName(game, m.awayId))}</span>${crest(game, m.awayId, 20)}</span></li>`).join('');
  const events = [
    ...r.steps.filter((s) => s.levelUps > 0).map((s) => `<li>${icon('upgrade', 18)}<span><b>${esc(nameOf(s.id))}</b> 레벨업 ${s.levelUps}회</span></li>`),
    ...r.steps.filter((s) => s.injured).map((s) => `<li class="bad">${icon('injury', 18)}<span><b>${esc(nameOf(s.id))}</b> 부상</span></li>`),
  ];
  const press = game.pending.press;
  const opts = (list, attrs) => list.map((o, i) => `<button class="opt" ${attrs(i)} ${(o.effects.coins ?? 0) + game.club.coins < 0 ? 'disabled' : ''}><b>${esc(o.label)}</b><span>${effectChips(o.effects)}</span></button>`).join('');
  const pressHtml = press ? `<section class="ask"><h3>${icon('mic', 20)}PRESS</h3><p>${esc(press.text)}</p>${opts(press.options, (i) => `data-act="press" data-i="${i}"`)}</section>` : '';
  const iv = game.pending.interviews.map(({ playerId, interview }) => `<section class="ask"><h3>${icon('chat', 20)}${esc(nameOf(playerId))} 면담</h3><p>${esc(interview.text)}</p>${opts(interview.options, (i) => `data-act="interview" data-id="${esc(playerId)}" data-i="${i}"`)}</section>`).join('');
  const last = game.phase === 'seasonEnd';
  return `${topBar(game)}<main class="page" style="${teamStyle(game.clubKit)}">
    ${head('MATCH REPORT', `ROUND ${r.chunk}/3`)}
    ${tip(ui, 'chunk', '승리하면 코인이 들어와요. 득점·도움을 한 선수는 성장이 빨라져요. 기자회견과 면담은 선택마다 효과가 달라요.')}
    <div class="titlebar"><h2>${r.chunk}번째 구간</h2>${coinNum(`+${r.income.total}`)}</div>
    ${triple([[r.won, '승'], [r.drawn, '무'], [r.lost, '패']])}
    <p class="hint center">승리 수입 ${r.income.win} + 홈 팬 수입 ${r.income.fan}</p>
    <ol class="strip" aria-label="경기 결과">${strip}</ol>
    ${events.length ? `<ul class="notes">${events.join('')}</ul>` : ''}
    ${pressHtml}${iv}
    <h3 class="group">MATCHES</h3><ol class="matches">${rows}</ol>
  </main>
  <div class="dock"><button class="btn btn--primary btn--wide" data-act="${last ? 'finish' : 'back'}">${last ? 'FINISH SEASON' : 'BACK'}</button></div>`;
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
  const rec = s.record;
  return `${topBar(game)}<main class="page" style="${teamStyle(game.clubKit)}">
    <section class="stage">${head('SEASON REPORT', `YEAR ${s.year} · ${TIER_LABEL[s.tier]}`)}
      <div class="bigrank"><b class="num">${s.rank}</b><span>위</span></div><p class="fate fate--${s.fate}">${fateMsg}</p>
      ${rec ? triple([[rec.won, '승'], [rec.drawn, '무'], [rec.lost, '패']]) : ''}
      ${s.prize ? `<p class="stage__p">${coinNum(`+${s.prize}`)} 상금</p>` : ''}</section>
    ${section('CHAMPIONS LEAGUE', `<p>우승 <b>${esc(teamName(game, s.cl.champion))}</b>, 준우승 ${esc(teamName(game, s.cl.runnerUp))}${s.cl.champion === game.myTeam.id ? ` ${chip('우리 팀', 'best')}` : ''}</p>`)}
    ${section('AWARDS', `<ul class="lines lines--awards">${aw}</ul>`)}
    ${section('PLAY-OFF', `<ul class="lines lines--po">${po}</ul>`)}
  </main>
  <div class="dock">${game.phase === 'ended'
    ? '<button class="btn btn--primary btn--wide" data-act="toend">RESULT</button>'
    : '<button class="btn btn--primary btn--wide" data-act="offseason">OFFSEASON</button><button class="btn btn--ghost btn--wide" data-act="retire">RETIRE</button>'}</div>`;
}

// ---------- 오프시즌 ----------
const STEPS = [['resign', 'RESIGN', '재계약'], ['market', 'MARKET', 'FA 시장'], ['draft', 'DRAFT', '드래프트'], ['rookies', 'ROOKIES', '신인 배치']];
const stepper = (step) => {
  const at = STEPS.findIndex(([k]) => k === step);
  return `<ol class="steps">${STEPS.map(([k, l], i) => `<li class="${i < at ? 'done' : (i === at ? 'now' : '')}"><b>${l}</b></li>`).join('')}</ol>`;
};
const salaryInput = (id, v) => `<input class="sal" type="number" min="1" max="99" id="sal-${esc(id)}" value="${v}" aria-label="제시 연봉">`;

export function offseasonScreen(game, ui) {
  const off = game.off;
  const kit = game.clubKit;
  let body = '';
  if (off.step === 'resign') {
    const ret = off.retired.map((c) => `<li>${icon('flag', 16)}<b>${esc(nameOf(c.playerId))}</b><span>${facts('은퇴', `${c.seasons}시즌`, `${c.career.goals}골 ${c.career.assists}도움`)}</span></li>`).join('');
    const list = off.resignQueue.map((p) => playerRow(p, { kit, contract: true, stack: true, action: `<div class="offer">${salaryInput(p.id, askingSalary(p))}<button class="btn btn--small btn--primary" data-act="resign" data-id="${esc(p.id)}">재계약</button><button class="link" data-act="decline" data-id="${esc(p.id)}">보내기</button></div>` })).join('');
    const coaches = off.coachExpiring.map((c) => `<div class="row"><div><b>${KIND_LABEL[c.kind]}</b>${stars(c.stars, c.stars, 14)}<small>계약이 끝났어요</small></div><button class="btn btn--small" data-act="renewcoach" data-kind="${c.kind}">재계약 ${coinNum(coachCost(c.stars))}</button></div>`).join('');
    body = `${tip(ui, 'resign', '계약이 끝난 선수에게 우선 재계약을 제안할 수 있어요. 사기가 낮으면 어떤 금액도 거절해요. 보내면 FA 시장에 나와요.')}
      ${ret ? section('RETIRED', `<ul class="lines">${ret}</ul>`) : ''}
      ${list || '<p class="muted pad">이번에 계약이 끝나는 스타는 없어요</p>'}
      ${coaches ? section('COACH CONTRACT', `${coaches}<p class="hint">재계약하지 않으면 1별 신임 코치가 옵니다</p>`) : ''}
      <div class="dock dock--page"><button class="btn btn--primary btn--wide" data-act="openmarket">OPEN MARKET</button></div>`;
  } else if (off.step === 'market') {
    const full = game.myTeam.stars.length >= 6;
    const mine = game.myTeam.stars.map((p) => `<div class="row"><div>${esc(nameOf(p.id))} <small>${facts(p.position, `연봉 ${p.contract.salary}`)}</small></div><button class="link" data-act="release" data-id="${esc(p.id)}">내보내기</button></div>`).join('');
    const market = off.market.map((e) => playerRow(e.player, {
      kit, stack: true,
      note: `<div class="conds">${conditionTexts(e.conditions).map((t) => chip(t)).join('') || chip('조건 없음', 'up')}</div>`,
      action: `<div class="offer">${salaryInput(e.player.id, e.asking)}<small>${askText(e.player)}</small><button class="btn btn--small btn--primary" data-act="offerfa" data-id="${esc(e.player.id)}">영입 제안</button></div>`,
    })).join('');
    body = `${tip(ui, 'market', '선수마다 요구 금액과 <b>영입 조건</b>(작년 순위, 시설, 팬, 팀 사기)이 달라요. 조건을 채우고 금액이 요구 이상이면 계약해요. 못 잡은 선수는 다른 팀이 데려가요.')}
      ${section(`MY STARS <span class="count">${game.myTeam.stars.length}/6</span>`, `${full ? '<p class="hint">자리가 가득 찼어요. 영입하려면 먼저 한 명을 내보내세요</p>' : ''}${mine}`)}
      ${market || '<p class="muted pad">시장이 비었어요</p>'}
      <div class="dock dock--page"><button class="btn btn--primary btn--wide" data-act="closemarket">CLOSE MARKET</button></div>`;
  } else if (off.step === 'draft') {
    body = draftBoard(game, off.draft, ui, {
      label: 'ROOKIE DRAFT', title: `${game.world.year}년차 신인 드래프트`, rule: '지난 시즌 성적이 나쁜 팀부터 지명해요(꼴찌가 1번). 지명권은 트레이드로 오갈 수 있어요.', pickAct: 'dpick', doneAct: 'closedraft', doneLabel: 'CLOSE DRAFT',
      tip: ['draft', '성적이 나쁜 팀부터 신인을 한 명씩 지명해요. 순번이 오면 후보 중에서 고르세요. 지명권은 트레이드로 오갈 수 있어요.'],
    });
  } else {
    const full = game.myTeam.stars.length >= 6;
    const opts = game.myTeam.stars.map((p) => `<option value="${esc(p.id)}">${esc(nameOf(p.id))} (${p.position})</option>`).join('');
    body = `${tip(ui, 'rookies', '뽑은 신인을 스타로 올리세요. 자리가 가득하면 내보낼 스타를 골라야 해요. 올리지 않은 신인은 떠나요.')}
      ${off.rookies.map((p) => playerRow(p, { kit, contract: true, stack: true, action: `<div class="offer">${full ? `<select id="out-${esc(p.id)}" aria-label="내보낼 스타">${opts}</select>` : ''}<button class="btn btn--small btn--primary" data-act="place" data-id="${esc(p.id)}">스타로 올리기</button></div>` })).join('') || '<p class="muted pad">대기 중인 신인이 없어요</p>'}
      <div class="dock dock--page"><button class="btn btn--primary btn--wide" data-act="startseason">START YEAR ${game.world.year}</button></div>`;
  }
  return `${topBar(game)}<main class="page" style="${teamStyle(kit)}">${head('OFFSEASON', `YEAR ${game.world.year}`)}${stepper(off.step)}${flash(ui)}${body}</main>`;
}

// ---------- 런 종료 ----------
export function endScreen(game) {
  const s = game.end.summary;
  const h = game.history;
  const hall = h.hallOfFame.map((x) => `<li><b>${esc(nameOf(x.playerId))}</b></li>`).join('');
  const star = s.standout.map((id) => { const r = h.players.get(id); return `<li><b>${esc(nameOf(id))}</b><span>${r.career.goals}골 ${r.career.assists}도움</span></li>`; }).join('');
  return `<main class="page end" style="${teamStyle(game.clubKit)}">
    <section class="stage">${head('CAREER REPORT', `${esc(game.clubName)} · ${s.seasons} SEASONS`)}
      <h1 class="stage__h">${game.end.reason === 'fired' ? 'FIRED' : 'RETIRED'}</h1>
      <div class="bigrank"><b class="num">${s.score}</b><span>점</span></div>
      ${triple([[s.leagueTitles, '리그 우승'], [s.clTitles, '챔피언스리그'], [s.awardCount, '개인 수상']])}</section>
    ${section('BEST LEAGUE', `<p class="lede"><b>${TIER_LABEL[s.bestTier]}</b></p>`)}
    ${section('KEY PLAYERS', `<ul class="lines">${star || '<li class="muted">없음</li>'}</ul>`)}
    ${section('HALL OF FAME', `<ul class="lines">${hall || '<li class="muted">없음</li>'}</ul>`)}
    <button class="btn btn--primary btn--wide" data-act="newrun">NEW GAME</button>
  </main>`;
}
